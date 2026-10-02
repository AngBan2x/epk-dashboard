import { NextRequest, NextResponse } from "next/server";
import {
  getAllTracks,
  getArtistByUserId,
  isArtistOwnerOfTrackName,
} from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { buildReleaseDurations, resolveCatalogDuration } from "@/lib/downloadable-assets";
import { resolveAlbumMetrics, type MetricsSource } from "@/lib/metrics-source";
import { safeArray, safeNumber, safeString } from "@/lib/null-safe";
import type { Track } from "@/types/music";

export const dynamic = "force-dynamic";

/**
 * `GET /api/artist-catalog` — el catálogo COMPLETO del artista, con sesión.
 *
 * ## Por qué hace falta
 *
 * `POST /api/export` es público por diseño (la prensa descarga material que ya
 * es público, `app/api/export/route.ts`) y aplica `filterPublicTracks` sin
 * excepción, así que **ni el dueño recibe sus borradores por ahí**: no es un
 * fallo del endpoint, es su alcance. El único camino que existe hoy es
 * `GET /api/releases?user_id=<propio>`, correcto en servidor pero que ninguna UI
 * llama. Este endpoint es el que falta: agrupado por release, en todos los
 * estados, con la duración real de los padres.
 *
 * ## Autorización
 *
 * El artista se resuelve desde la SESIÓN (`artists.user_id`), nunca desde un
 * parámetro de query: un `?user_id=` es falsificable por definición. La
 * propiedad se confirma después con `isArtistOwnerOfTrackName()`
 * (`lib/db.ts`), el helper que el resto de la superficie de releases ya usa, y
 * no con una comprobación reescrita aquí.
 */

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

const noCache = { "Cache-Control": "no-store" } as const;

/** `ReleaseStatus` del modelo. Los estados desconocidos caen en "otro". */
const KNOWN_STATUSES = ["approved", "published", "pending", "draft", "rejected"] as const;

type ReleaseStatus = (typeof KNOWN_STATUSES)[number];

function normalizeStatus(value: unknown): ReleaseStatus | "otro" {
  const raw = safeString(value, "").trim().toLowerCase();
  return (KNOWN_STATUSES as readonly string[]).includes(raw) ? (raw as ReleaseStatus) : "otro";
}

interface CatalogChild {
  id: string;
  title: string;
  disc_number: number | null;
  track_number: number | null;
  duration: string;
  status: ReleaseStatus | "otro";
  audio_preview_url: string | null;
}

interface CatalogRelease {
  id: string;
  title: string;
  release_type: string;
  release_date: string;
  /** Duración real del release. */
  duration: string;
  /**
   * `"children"` cuando la duración se calculó sumando las hijas (el caso de los
   * 9 padres del catálogo semilla, que traen `"00:00"`), `"declared"` cuando se
   * leyó la columna. La UI lo usa para no presentar un `"00:00"` sin explicar.
   */
  duration_source: "children" | "declared";
  status: ReleaseStatus | "otro";
  cover_image: string | null;
  track_count: number;
  /**
   * RC.33 · Ola 3 — `null` cuando ninguna fuente tiene cifra para este release.
   *
   * Antes era `children.reduce(sum + safeNumber(child.metrics?.streams), ...)`:
   * `safeNumber` devolvía `0` para lo que no venía, así que un álbum sin
   * métricas salía con `streams: 0` y la UI no tenía forma de saber si ese
   * cero era un dato o un hueco. `null` es el hueco.
   */
  streams: number | null;
  /** De dónde sale `streams`. Permite que la UI no adivine. */
  streams_source: MetricsSource;
  tracks: CatalogChild[];
}

/**
 * Orden de las hijas dentro de un release. Replica el `ORDER BY` de
 * `getTracksByReleaseId` (`lib/db.ts`) en JS, incluidos los `COALESCE`: en
 * SQLite los NULL suben solos en un `ASC`, así que sin empujarlos al final una
 * pista sin numerar saltaría a la cabecera de su disco.
 */
function compareChildren(a: Track, b: Track): number {
  const disc = (safeNumber(a.disc_number, 1) || 1) - (safeNumber(b.disc_number, 1) || 1);
  if (disc !== 0) return disc;
  const an = a.track_number == null ? 999 : safeNumber(a.track_number, 999);
  const bn = b.track_number == null ? 999 : safeNumber(b.track_number, 999);
  if (an !== bn) return an - bn;
  return safeNumber(a.start_time) - safeNumber(b.start_time);
}

function toChild(track: Track): CatalogChild {
  return {
    id: safeString(track.id),
    title: safeString(track.title),
    disc_number: track.disc_number ?? null,
    track_number: track.track_number ?? null,
    duration: safeString(track.duration),
    status: normalizeStatus(track.status),
    audio_preview_url: track.audio_preview_url ?? null,
  };
}

/**
 * Agrupa las pistas del artista por release.
 *
 * Un álbum y un single suelto son INDISTINGUIBLES en el esquema: ambos son filas
 * de `tracks` con `release_id IS NULL`. La única señal que los separa es que el
 * álbum tiene hijas, así que un padre con hijas es un release y una hoja sin
 * hijas es un single suelto. Las hijas cuyo padre no está en la lista (padre de
 * otro artista, o borrado) se descartan: nunca hay grupos sin fila padre.
 */
function groupByRelease(tracks: Track[]): CatalogRelease[] {
  const releaseDurations = buildReleaseDurations(tracks);

  const heads: Track[] = [];
  const childrenByRelease = new Map<string, Track[]>();
  for (const track of tracks) {
    const releaseId = safeString(track.release_id, "");
    if (releaseId === "") {
      heads.push(track);
      continue;
    }
    const bucket = childrenByRelease.get(releaseId);
    if (bucket) bucket.push(track);
    else childrenByRelease.set(releaseId, [track]);
  }

  heads.sort(
    (a, b) => safeString(b.release_date, "").localeCompare(safeString(a.release_date, ""))
  );

  return heads.map((head) => {
    const children = (childrenByRelease.get(safeString(head.id, "")) ?? []).sort(compareChildren);
    const computed = releaseDurations.get(safeString(head.id, ""));
    const duration = resolveCatalogDuration(head, releaseDurations);
    /**
     * RC.33 · Ola 3 — la agregación de las hijas vive en `lib/metrics-source.ts`
     * y NO se duplica aquí: `EPKCard` llama a la misma función para el pie, así
     * que el número de la API y el de la tarjeta no pueden divergir.
     *
     * Esta ruta no hace red, así que solo hay una fuente posible —el JSON
     * curado—, y se le pasa como tal. `resolveAlbumMetrics` decide igual: suma
     * las hijas que tengan dato en la fuente elegida e ignora las que no, en vez
     * de sumar ceros de relleno como hacía `safeNumber`.
     */
    const resolved = resolveAlbumMetrics(
      { curated: head.metrics },
      children.map((child) => ({ curated: child.metrics }))
    );
    return {
      id: safeString(head.id),
      title: safeString(head.title),
      release_type: safeString(head.release_type),
      release_date: safeString(head.release_date),
      duration,
      duration_source: computed && computed.label === duration ? "children" : "declared",
      status: normalizeStatus(head.status),
      cover_image: head.cover_image ?? null,
      track_count: children.length,
      streams: resolved.value,
      streams_source: resolved.source,
      tracks: children.map(toChild),
    };
  });
}

export async function GET(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: noCache });
  }

  const blocked = enforceRateLimit(
    req,
    "artist-catalog",
    session.userId,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS
  );
  if (blocked) return blocked;

  try {
    // El artista se resuelve por sesión. Un `?user_id=` o un `?artist_id=` en la
    // query se ignoran a propósito: si se aceptaran, bastaría con poner el id de
    // otro para leer su catálogo.
    const artist = await getArtistByUserId(session.userId);
    if (!artist) {
      return NextResponse.json(
        { error: "Este usuario no tiene un perfil de artista" },
        { status: 404, headers: noCache }
      );
    }

    // Propiedad real contra `artists.user_id`, no contra un id de query.
    const owns = await isArtistOwnerOfTrackName(artist.name, session.userId);
    if (!owns) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 403, headers: noCache }
      );
    }

    // `getTracksByArtist` y `getArtistCatalog` filtran `status = 'approved'`:
    // sirven para la página pública y para el export, no para esto. La lectura
    // sin filtro es `getAllTracks()`, y el recorte por `artist_name` se hace
    // aquí, en servidor, con el nombre que ya salió de `artists` para el usuario
    // de la sesión.
    //
    // PENDIENTE (fuera de mi ownership): eso trae la tabla entera —83 filas hoy— y
    // filtra en JS. El arreglo propio es un `getTracksByArtistAllStatuses(artistId)`
    // en `lib/db.ts`, que es de otro agente. Con este tamaño de catálogo el coste
    // es despreciable y no se paga una query nueva para un caso que cabe en
    // memoria; cuando deje de serlo, el cambio es local a esta línea.
    const all = await getAllTracks();
    const ownTracks = safeArray<Track>(all).filter(
      (track) => track.artist_name === artist.name
    );
    const releases = groupByRelease(ownTracks);

    const byStatus: Record<string, number> = {};
    let children = 0;
    for (const release of releases) {
      byStatus[release.status] = (byStatus[release.status] ?? 0) + 1;
      children += release.track_count;
      for (const child of release.tracks) {
        byStatus[child.status] = (byStatus[child.status] ?? 0) + 1;
      }
    }

    return NextResponse.json(
      {
        artist: { id: safeString(artist.id, ""), name: safeString(artist.name, "") },
        summary: {
          releases: releases.length,
          tracks: releases.length + children,
          children,
          by_status: byStatus,
        },
        releases,
      },
      { headers: noCache }
    );
  } catch (error) {
    console.error("[API/ArtistCatalog] Error:", error);
    return NextResponse.json(
      { error: "Error al leer el catálogo del artista" },
      { status: 500, headers: noCache }
    );
  }
}
