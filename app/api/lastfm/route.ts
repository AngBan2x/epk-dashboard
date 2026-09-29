import { NextRequest, NextResponse } from "next/server";
import { fetchArtistInfo, fetchTopTracks, fetchTrackInfo } from "@/lib/lastfm";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  httpStatusForReason,
  reasonApiMessageEs,
  type IntegrationReason,
} from "@/lib/integration-reasons";

export const dynamic = "force-dynamic";

/**
 * Fase E:
 * - 30/min por IP. `/api` no está en el matcher de `middleware.ts`, así que
 *   esto era un proxy público sin límite que quemaba cuota de Last.fm.
 * - `getTopAlbums` eliminado: la UI nunca leía el resultado.
 * - Las 2 llamadas restantes van en `Promise.all` (antes secuenciales).
 * - Deja de devolver SIEMPRE 200 con payload vacío: 503 sin clave, 429 con la
 *   cuota agotada, 502 si la red o Last.fm fallan, 200 solo cuando el
 *   artista no existe (donde "sin datos" ES la respuesta correcta).
 */
export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, "lastfm", null, 30, 60_000);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist");
  const track = searchParams.get("track");
  const method = searchParams.get("method") || "artist";

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
