import { sumDurations } from "@/lib/null-safe";
import { tracklistDurationLabel } from "@/lib/audio-priority";
import {
  resolveAlbumMetrics,
  resolveMetrics,
  type ResolvedMetrics,
} from "@/lib/metrics-source";
import type { Track, VideoKind } from "@/types/music";

/**
 * P2 · Ola 10 — la FORMA de un lanzamiento, derivada de sus datos. Nada de red,
 * nada de `process.env`, **nada de `@/lib/db`**.
 *
 * ## Por qué son dos ficheros y no uno
 *
 * `lib/releases.ts` (su hermano) sí lee la base de datos, así que arrastra
 * `@/lib/db` → `better-sqlite3`. Todo lo de aquí se usa también dentro de
 * componentes de cliente (`components/ReleaseTracklistSection.tsx`, que lleva
 * la lista de pistas y es `"use client"`), y meter `better-sqlite3` en el
 * bundle del navegador no es una optimizacion que se pueda dejar al
 * tree-shaking: es la
 * clase exacta de fallo que ya costó un 500 en producción (AGENTS.md, GAP-B).
 *
 * La regla que sale de ahí: **la lógica que decide se puede compartir con el
 * cliente; la que lee, no.** Por eso el módulo puro no importa nada de la base
 * de datos aunque le haga falta: recibe los datos ya resueltos y devuelve la
 * forma. Y por eso la página llama a estas funciones y les pasa el resultado a
 * los componentes, en vez de dejar que los componentes las recalculen.
 */

/** Lo que se pinta cuando no hay dato. Nunca `0`: `0` afirma algo. */
export const NO_VALUE = "—";

export interface ReleaseShape {
  /** `true` cuando el lanzamiento tiene hijas (`tracks.release_id != NULL`). */
  isMultiTrack: boolean;
  /**
   * Cuántas pistas tiene. Un single suelto tiene **una**, no cero: en el
   * esquema un single y un álbum son la misma fila y la única señal es si hay
   * hijas, así que "sin hijas" no significa "sin pistas".
   */
  trackCount: number;
  /** Discos distintos. Siempre ≥ 1. */
  discCount: number;
  /** `"M:SS"`, o `NO_VALUE` si no hay duración utilizable. */
  durationLabel: string;
  /** Una sola fuente para todo el lanzamiento, ya resuelta. */
  metrics: ResolvedMetrics;
}

function discOf(track: Track): number {
  return Number.isFinite(track.disc_number) && track.disc_number ? Number(track.disc_number) : 1;
}

/**
 * ## La duración, y por qué 0 hijas ya no dan "0:00"
 *
 * Antes, `app/releases/[id]/page.tsx:53` hacía
 * `sumDurations(childTracks.map((t) => t.duration))`. Con cero hijas eso es
 * `sumDurations([])`, que devuelve `null`; la línea siguiente caía entonces a
 * `release.duration`, que el seed y `POST /api/releases` rellenan con
 * `"00:00"` cuando no se sabe. Un single de 3:45 real del catálogo, un single
 * recién creado y un álbum vacío pintaban lo mismo: `"0:00"`, o nada, o
 * `"0 pistas"`.
 *
 * La regla ahora es explícita y son dos ramas:
 *
 * 1. **Hay hijas** → la suma de las hijas, que es lo que significa la duración
 *    de un disco. Si ninguna tiene duración parseable, `NO_VALUE`.
 * 2. **No hay hijas** → la duración **del propio release**, parseada con el
 *    mismo `sumDurations`. Y aquí hay un filtro extra: si el resultado son 0
 *    segundos, se devuelve `NO_VALUE`. Un `"00:00"` de relleno es la ausencia de
 *    dato, no un disco de cero segundos, y la diferencia entre los dos es
 *    justo la que el usuario pidió que no se perdiera.
 *
 * El filtro de `seconds === 0` se aplica a las DOS ramas por la misma razón: un
 * tracklist entero de `"00:00"` tampoco es un disco de cero segundos.
 */
export function releaseDurationLabel(
  release: Track,
  children: readonly Track[]
): string {
  const values =
    children.length > 0
      ? children.map((t) => t.duration)
      : [release.duration];

  const total = sumDurations(values);
  if (!total || total.seconds <= 0) return NO_VALUE;
  return total.label;
}

/**
 * La duración de UNA fila que no tiene hijas: la de la propia fila, o `—`.
 *
 * Vive su propia función porque es la rama que la página del release necesita
 * **por separado**: `tests/unit/itunes-previews.test.ts` (P15, un test de otra
 * ola que esta subfase no puede tocar) fija la forma del literal
 * `const durationLabel = (isMultiTrack ? totalDuration?.label : null) ?? …` en
 * `app/releases/[id]/page.tsx`, así que la página tiene que poder decir "si hay
 * hijas, la suma; si no, la de la fila" con una sola expresión. El filtro del
 * relleno vive aquí, en un solo sitio, y no en esa línea.
 */
export function ownDurationLabel(track: Pick<Track, "duration">): string {
  const total = sumDurations([track.duration]);
  return total && total.seconds > 0 ? total.label : NO_VALUE;
}

/**
 * ## Una sola fuente para el lanzamiento entero (RC.33)
 *
 * No se reimplementa nada de `lib/metrics-source.ts`: se le pasa el padre como
 * "cabeza" del álbum y las hijas como candidatas, y se devuelve lo que ella
 * decide. Con hijas eso es `resolveAlbumMetrics`, que elige **una** fuente y
 * suma solo las hijas que tienen dato en esa fuente — un scrobble de Last.fm no
 * se suma a una vista de YouTube.
 *
 * Sin hijas no hay álbum que agregar: la fila es la pista, y decide
 * `resolveMetrics`. El contrato es idéntico en los dos casos: `value === null`
 * significa "no hay dato" y quien pinta pone `NO_VALUE`, nunca `0`.
 */
export function releaseMetrics(
  release: Track,
  children: readonly Track[]
): ResolvedMetrics {
  const head = { curated: release.metrics ?? null };
  if (children.length === 0) return resolveMetrics(head);
  return resolveAlbumMetrics(
    head,
    children.map((child) => ({ curated: child.metrics ?? null }))
  );
}

/**
 * ## La duración de UNA fila, con la misma regla del relleno
 *
 * `releaseDurationLabel` decide el total; esta decide lo que va en la columna
 * de una fila. Reutiliza `tracklistDurationLabel` (`lib/audio-priority.ts`) tal
 * cual —misma precedencia, mismo rango de capítulo, mismo aviso— y le añade una
 * sola cosa: si el texto es una duración de **cero** segundos, no se pinta.
 *
 * Sin ese filtro, un single cuyo `duration` es el relleno `"00:00"` del seed
 * Pintaba `"0:00"` en la fila mientras la cabecera decía `—`: dos números
 * distintos para la misma canción en la misma pantalla, que es peor que
 * cualquiera de los dos.
 *
 * Un rango de capítulo (`isChapterRange`) se conserva tal cual: es un dato real
 * aunque no sea la duración, y el propio `tracklistDurationLabel` ya lo marca
 * como tal en el `title`.
 */
export function releaseRowDurationLabel(track: Track): string {
  const label = tracklistDurationLabel(track);
  if (!label.text || label.isChapterRange) return label.text;
  const parsed = sumDurations([label.text]);
  return parsed && parsed.seconds > 0 ? label.text : "";
}

/**
 * ## El vídeo de una fila, y si se puede enseñar como el videoclip de la pista
 *
 * `tracks.video_kind` (RC.33, Ola 4) tiene tres valores y **solo uno** es el
 * vídeo que la ficha quiere mostrar:
 *
 * | `video_kind` | Qué es | ¿Se enseña? |
 * |---|---|---|
 * | `videoclip` | canal humano verificado del artista | **sí** |
 * | `live` | una grabación en directo: no es la pista del lanzamiento | **no** |
 * | `topic_audio` | el canal `- Topic` autogenerado: es el audio del tema, con una imagen fija y sin comentarios | **no** |
 * | `null` | no se sabe el canal | **sí** (ver abajo) |
 *
 * ### Por qué `null` se enseña
 *
 * Porque los dos únicos que escriben `youtube_video_id` sin `video_kind` son la
 * **allowlist versionada** y el **seed curado a mano** ("canciones reales
 * verificadas", `scripts/seed-f9-catalog.ts`), que escribieron antes de que la
 * columna existiera. El script que automatiza la escritura
 * (`scripts/fetch-official-videos.ts`) **siempre** escribe las dos columnas
 * juntas, así que un `null` con id es una afirmación de una persona, no un
 * olvido de un proceso.
 *
 * ### Por qué `live` y `topic_audio` no se enseñan
 *
 * Porque Presentarlos como "Videoclip Oficial" sería **afirmar algo falso**: un
 * `- Topic` es un canal autogenerado por YouTube, y un directo no es la canción
 * del lanzamiento. El catálogo tiene hoy 11 `live` y 17 `topic_audio` entre sus
 * hijas, y **0 `videoclip`**: no hay ningún vídeo oficial curado de un álbum.
 *
 * ### Por qué esto vive aquí y no en la página
 *
 * Porque hay **dos** páginas que toman la decisión —la del single y la del álbum—
 * y dos copias divergirían en silencio: exactamente lo que pasó con
 * `hasProductionDetails` antes de moverlo a `lib/production-fields.ts`.
 */
export function showableVideo(
  track: Pick<Track, "youtube_video_id" | "video_embed_url" | "video_kind">
): { youtubeVideoId: string | null; videoEmbedUrl: string | null; kind: VideoKind | null } | null {
  if (track.video_kind === "live" || track.video_kind === "topic_audio") return null;
  const youtubeVideoId = track.youtube_video_id ?? null;
  const videoEmbedUrl = track.video_embed_url ?? null;
  if (!youtubeVideoId && !videoEmbedUrl) return null;
  return { youtubeVideoId, videoEmbedUrl, kind: track.video_kind ?? null };
}

/** Toda la forma de un lanzamiento en una llamada. */
export function releaseShape(release: Track, children: readonly Track[]): ReleaseShape {
  const discs = new Set<number>();
  if (children.length === 0) discs.add(1);
  for (const child of children) discs.add(discOf(child));

  return {
    isMultiTrack: children.length > 0,
    trackCount: children.length > 0 ? children.length : 1,
    discCount: discs.size,
    durationLabel: releaseDurationLabel(release, children),
    metrics: releaseMetrics(release, children),
  };
}