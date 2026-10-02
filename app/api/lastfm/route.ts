import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchArtistInfo, fetchTopTracks, fetchTrackInfo } from "@/lib/lastfm";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  httpStatusForReason,
  reasonApiMessageEs,
  type IntegrationReason,
} from "@/lib/integration-reasons";
import {
  LASTFM_ARTIST_LIMIT,
  LASTFM_TOP_TRACKS_LIMIT,
  buildLastfmPlaycountIndex,
  lastfmArtistKey,
  type LastfmByArtistRecord,
} from "@/lib/lastfm-playcounts";

export const dynamic = "force-dynamic";

// ─── Modo `batch`: N artistas → 1 petición a nuestra API ──────────────────────
//
// `EPKCard` ya aceptaba `lastfmPlaycount` y `lib/metrics-source.ts` ya lo usaba
// en la cadena `itunes -> youtube -> lastfm`, pero nadie se lo pasaba: la cadena
// llegaba a YouTube y saltaba al "—". Este modo es lo que la cierra.
//
// **Por qué `artist.gettoptracks` y NO `track.getInfo`.** `track.getInfo` es una
// petición POR PISTA: un álbum de 65 hijas son 65 llamadas y 65 unidades de
// cuota para pintar 65 números. `artist.gettoptracks` es una POR ARTISTA y
// devuelve hasta `LASTFM_TOP_TRACKS_LIMIT` pistas, así que 12 artistas del
// catálogo son 12 llamadas, no 83. El índice se arma en memoria y la rejilla
// solo lee un objeto plano.
//
// La normalización del título y el armado del índice NO viven aquí: una Route
// Handler no puede exportarlos (el typecheck de `.next/types` rechaza todo
// export que no sea el handler) y hacen falta también en el cliente. Viven en
// `lib/lastfm-playcounts.ts`, puro y compartido por las tres superficies.

/**
 * `artists=A,B,C`, como en `?ids=A,B,C` de `/api/youtube/stats`.
 *
 * Deduplica sin distinguir mayúsculas pero conserva la grafía del primer
 * nombre: la clave de artista del catálogo es `lastfmArtistKey`, y
 * `Radiohead`/`radiohead` tienen que ser el mismo artista sin crear dos
 * entradas. El tope de `LASTFM_ARTIST_LIMIT` se aplica DESPUÉS de deduplicar, y
 * como es un `400` se rechaza antes de tocar la red: un payload enorme no se
 * convierte en miles de llamadas upstream.
 */
const ArtistsParam = z
  .string()
  .transform((s) => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const part of s.split(",")) {
      const name = part.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    return names;
  })
  .pipe(z.array(z.string().min(1).max(120)).min(1).max(LASTFM_ARTIST_LIMIT));


/**
 * Fase E:
 * - 30/min por IP. `/api` no está en el matcher de `middleware.ts`, así que
 *   esto era un proxy público sin límite que quemaba cuota de Last.fm.
 * - `getTopAlbums` eliminado: la UI nunca leía el resultado.
 * - Las 2 llamadas restantes van en `Promise.all` (antes secuenciales).
 * - Deja de devolver SIEMPRE 200 con payload vacío: 503 sin clave, 429 con la
 *   cuota agotada, 502 si la red o Last.fm fallan, 200 solo cuando el
 *   artista no existe (donde "sin datos" ES la respuesta correcta).
 *
 * RC.34 añade `method=batch`: N artistas en una llamada, una por artista.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const method = searchParams.get("method") || "artist";

  /**
   * El modo `batch` tiene su propio cupo, más corto que el de un artista suelto:
   * una sola petición suya puede costar hasta `LASTFM_ARTIST_LIMIT` llamadas
   * upstream, mientras que el modo `artist` gasta dos fijas. Con el mismo cupo
   * (30/min) un bucle bastaría para vaciar la cuota de la API desde una IP.
   */
  const isBatch = method === "batch";
  const limited = enforceRateLimit(req, isBatch ? "lastfm-toptracks" : "lastfm", null, isBatch ? 20 : 30, 60_000);
  if (limited) return limited;

  if (isBatch) {
    return getBatchResponse(searchParams.get("artists"));
  }

  const artist = searchParams.get("artist");
  const track = searchParams.get("track");

  if (!artist) {
    return NextResponse.json({ error: "artist requerido" }, { status: 400 });
  }

  try {
    if (method === "track") {
      if (!track) {
        return NextResponse.json({ error: "track requerido" }, { status: 400 });
      }
      const trackRes = await fetchTrackInfo(artist, track);
      const reason = trackRes.ok ? null : trackRes.reason;
      return NextResponse.json(
        {
          artist: null,
          track: trackRes.ok ? trackRes.data : null,
          topTracks: [],
          reason: reason ?? null,
          ...(reason ? { error: reasonApiMessageEs(reason, "Last.fm") } : {}),
        },
        { status: reason ? httpStatusForReason(reason) : 200 },
      );
    }

    const [artistRes, topTracksRes] = await Promise.all([
      fetchArtistInfo(artist),
      fetchTopTracks(artist, 5),
    ]);

    // Motivo de mayor gravedad: si el artista no está pero el top sí, la UI
    // necesita poder distinguirlo. El status solo escala a error cuando NO
    // queda ningún dato que enseñar; con datos parciales se responde 200.
    const reason = pickReason([artistRes, topTracksRes]);
    const hasData =
      (artistRes.ok && !!artistRes.data) || (topTracksRes.ok && topTracksRes.data.length > 0);
    const status = reason && !hasData ? httpStatusForReason(reason) : 200;

    return NextResponse.json(
      {
        artist: artistRes.ok ? artistRes.data : null,
        track: null,
        topTracks: topTracksRes.ok ? topTracksRes.data : [],
        reason: reason ?? null,
        ...(reason ? { error: reasonApiMessageEs(reason, "Last.fm") } : {}),
      },
      { status },
    );
  } catch (error) {
    console.error("[lastfm] error inesperado en la ruta:", error);
    return NextResponse.json(
      {
        artist: null,
        track: null,
        topTracks: [],
        reason: "upstream",
        error: reasonApiMessageEs("upstream", "Last.fm"),
      },
      { status: httpStatusForReason("upstream") },
    );
  }
}

/** `quota` > `no_key` > `network` > `upstream` > `not_found`. */
function pickReason(results: { ok: boolean; reason?: IntegrationReason }[]): IntegrationReason | null {
  const reasons = results.filter((r) => !r.ok).map((r) => r.reason ?? "upstream");
  if (reasons.length === 0) return null;
  const order: IntegrationReason[] = ["quota", "no_key", "network", "upstream", "not_found"];
  for (const candidate of order) {
    if (reasons.includes(candidate)) return candidate;
  }
  return "upstream";
}

/**
 * RC.34 — `?method=batch&artists=A,B,C`.
 *
 * ## Una llamada por ARTISTA, nunca por pista
 *
 * La tentación es llamar a `track.getInfo` por cada fila del payload, porque el
 * payload son pistas. Serían 65 llamadas para un álbum de 65 hijas. Aquí cada
 * artista se resuelve **una vez** con `artist.gettoptracks`, que ya devuelve las
 * pistas más escuchadas: 12 artistas = 12 llamadas, 83 pistas siguen siendo 12.
 *
 * ## Degradación
 *
 * Siempre 200 con `{ tracksByArtist }`. Sin `LASTFM_API_KEY` sale `{}`, y las
 * tarjetas caen al "—" de `lib/metrics-source.ts` con su `title` explicativo.
 * Devolver 503 obligaría a cada llamante a tratar el fallo como excepción, y
 * esta ruta está en el camino crítico de tres páginas: un 500 aquí es una
 * página rota por una métrica opcional.
 *
 * El motivo discriminado viaja en el cuerpo (`reason`) para que se pueda
 * diagnosticar sin mirar los logs. Nunca se manda la clave ni ningún valor de
 * entorno.
 *
 * ## Tope de artistas
 *
 * `LASTFM_ARTIST_LIMIT` en la petición: una más se rechaza con 400 sin tocar la
 * red. Sin ese tope, `artists=` con 5.000 nombres sería 5.000 llamadas upstream
 * desde una sola petición nuestra.
 */
async function getBatchResponse(artistsParam: string | null) {
  const parsed = ArtistsParam.safeParse(artistsParam);
  if (!parsed.success) {
    return NextResponse.json(
      {
        tracksByArtist: {},
        reason: "not_found",
        error: `artists inválidos (entre 1 y ${LASTFM_ARTIST_LIMIT}, separados por comas)`,
      },
      { status: 400 },
    );
  }

  const names = parsed.data;
  try {
    const results = await Promise.all(
      names.map((name) => fetchTopTracks(name, LASTFM_TOP_TRACKS_LIMIT)),
    );

    const tracksByArtist: LastfmByArtistRecord = {};
    for (let i = 0; i < names.length; i++) {
      const result = results[i];
      // Un artista que Last.fm no conoce simplemente no aparece: el llamante lo
      // lee como "sin dato" para todas sus pistas, que es la respuesta correcta.
      if (result.ok && result.data.length > 0) {
        tracksByArtist[lastfmArtistKey(names[i])] = buildLastfmPlaycountIndex(result.data);
      }
    }

    // `reason` es informativo aquí: aunque haya dato parcial, el status sigue
    // siendo 200 porque la página tiene algo que enseñar.
    const reason = pickReason(results);
    return NextResponse.json(
      {
        tracksByArtist,
        reason: reason ?? null,
        batchSize: names.length,
        maxArtists: LASTFM_ARTIST_LIMIT,
        ...(reason ? { error: reasonApiMessageEs(reason, "Last.fm") } : {}),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[lastfm] error inesperado en el lote por artistas:", error);
    return NextResponse.json(
      {
        tracksByArtist: {},
        reason: "upstream",
        error: reasonApiMessageEs("upstream", "Last.fm"),
        batchSize: names.length,
        maxArtists: LASTFM_ARTIST_LIMIT,
      },
      { status: 200 },
    );
  }
}
