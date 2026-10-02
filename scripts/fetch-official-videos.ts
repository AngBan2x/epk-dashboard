#!/usr/bin/env tsx
/**
 * Vídeos OFICIALES de YouTube para el catálogo (RC.32 · agente H → RC.33 · Ola 4).
 *
 * ── Por qué este script existe ─────────────────────────────────────────────
 * `tracks.youtube_video_id` es lo que hace que `lib/audio-priority.ts:139-154`
 * añada una fuente de tipo `youtube`. Este script la recorre con dos
 * condiciones que no se negocian: el canal está **verificado** y el título
 * empareja **con el mismo criterio de tres estados** que el audio.
 *
 * ── LO QUE ESTE SCRIPT NO ES ───────────────────────────────────────────────
 *
 * **No es una fuente de audio.** Un `youtube_video_id` convierte el tracklist en
 * capítulos de vídeo, pero **no hace que la pista suene**: el reproductor
 * prioriza el preview. No se asuma lo contrario.
 *
 * ── LO QUE AÑADE LA OLA 4: `tracks.video_kind` ──────────────────────────────
 *
 * Hay **tres** clases de vídeo y no son intercambiables:
 *
 *   videoclip    canal humano verificado → el vídeo que la ficha muestra
 *   live         directo                 → se muestra, pero no es el tema
 *   topic_audio  canal `- Topic`         → no hay videoclip; es el audio
 *
 * Un directo de 12 minutos y el tema de estudio de 8:20 son la misma obra y
 * duraciones distintas. Sin la columna, la ficha declararía la del directo y no
 * habría forma de saberlo. Por eso `live` se **clasifica** y no se recorta
 * (`lib/youtube.ts:classifyVideoTitle`).
 *
 * ── EL CANAL SE VERIFICA, NO SE ADIVINA ─────────────────────────────────────
 *
 *   método              coste
 *   videos.list         1 unidad
 *   channels.list       1 unidad
 *   playlistItems.list  1 unidad
 *   search.list         bucket aparte: 100 llamadas/día para TODO el proyecto
 *
 * Los 5 canales humanos están **verificados a mano y versionados** en
 * `lib/official-channels.ts`, con su procedencia escrita al lado de cada línea.
 * La verificación estructural sigue siendo la puerta de entrada
 * (`verifyOfficialChannel`): nombre exacto + enlace en la descripción del canal
 * al dominio oficial declarado.
 *
 * ── EL CANAL `- Topic`: por qué NO se descubre por defecto ───────────────────
 *
 * `/releases` de un canal **no es una playlist**: es un shelf que YouTube puebla
 * con vídeos de un canal autogenerado, sin id público. Raspado da 0. La única
 * vía es `search.list?type=channel&q="<artista> - Topic"` — **100 unidades de un
 * bucket aparte**, no 1 de las 10 000 normales. Con 5 artistas son 500 de las 100
 * que tiene el proyecto para todo el día.
 *
 * Por eso `--discover-topic` está **apagado por defecto** y la ruta normal usa la
 * tabla ya verificada de `lib/official-channels.ts`. Los 3 canales `- Topic` que
 * están en ella se comprobaron con esa búsqueda; Björk y David Bowie **no**
 * están, y se quedan sin audio de `- Topic` en vez de apuntar a un id sin ver.
 *
 * ── LAS TRES TRAMPAS DEL MUESTREO ───────────────────────────────────────────
 *
 *  1. **Duplicados**: `playlistItems.list` devuelve el mismo vídeo dos veces
 *     ("You And Whose Army?" salía duplicado). `dedupeVideoCandidates` deja el
 *     primero y el recuento de la playlist no miente.
 *  2. **Caja**: el canal se busca **sin distinción de mayúsculas**. Los tres
 *     verificados traen la caja de YouTube — "PINK FLOYD - Topic" en mayúsculas,
 *     "Radiohead - Topic" en title case. Un `===` fallaría en dos de tres.
 *  3. **Sufijos**: "Fake Plastic Trees (Acoustic Version)", "(2009 Remaster)" y
 *     "(Etape 1)" ensucian el emparejamiento. `stripVideoDecorations` **no** los
 *     quita a propósito (son grabaciones distintas), así que el recorte del
 *     grupo final se usa **solo para comparar**, nunca para escribir.
 *
* ── LA PLAYLIST VA DE MÁS RECIENTE A MÁS ANTIGUO ────────────────────────────
 *
 * `playlistItems.list` no tiene orden inverso, así que `--pages=2` (100 vídeos)
 * ve las 100 subidas más nuevas de un canal que tiene 1346. Los clips clásicos
 * están al final. Con 200 páginas leídas salen 34 coincidencias de 74 pistas y
 * **ninguna** `videoclip`; con `--pages=27` (la lista entera de Pink Floyd, 27
 * unidades) sí. Es la diferencia entre "no hay vídeo" y "no hemos mirado".
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *
 *   npx tsx scripts/fetch-official-videos.ts                  # dry-run
 *   npx tsx scripts/fetch-official-videos.ts --apply          # escribe
 *   npx tsx scripts/fetch-official-videos.ts --artist="Björk"
 *   npx tsx scripts/fetch-official-videos.ts --pages=27        # la lista entera
 *   npx tsx scripts/fetch-official-videos.ts --channels       # solo verificar canales
 *   npx tsx scripts/fetch-official-videos.ts --route=playback # qué ruta se informa
 *   npx tsx scripts/fetch-official-videos.ts --trust-allowlist # ver "LA PUERTA"
 *   npx tsx scripts/fetch-official-videos.ts --discover-topic # gasta 100 u/artista
 *
 * ## `--trust-allowlist`: POR QUÉ EXISTE, Y POR QUÉ APAGADO
 *
 * La prueba estructural de RC.32 exige que la descripción del canal enlace el
 * dominio oficial del artista. **Hoy no la cumple ninguno de los 5**: Pink Floyd
 * tiene 991 caracteres de biografía sin un enlace, Radiohead tiene la
 * descripción vacía, y Björk y Kraftwerk tampoco enlazan nada. Con la prueba
 * intacta el resultado es 0 de 5 canales y 0 vídeos.
 *
 * Este flag baja **solo** esa tercera comprobación, y solo si el id es el de
 * `lib/official-channels.ts`, el nombre del canal coincide exacto y no es un
 * canal «topic». Un `dominio-distinto` (hay enlaces, pero no son del sitio
 * oficial) no se degrada nunca. Es una decisión que hay que revisar, no un
 * atajo: por eso está apagado.
 *
 * ## ⚠️ `--discover-topic` GASTA CUOTA DE UN BUCKET APARTE
 *
 * Cada búsqueda son 100 unidades de las 100 **llamadas diarias de `search.list`
 * para todo el proyecto**, no 1 de las 10 000 normales. Se imprime el consumo
 * estimado antes de empezar y hay que pasar `--apply` (o `--discover-only` para
 * solo mirar) para que escriba nada.
 */

import fs from "node:fs";
import {
  buildOfficialVideoEmbedUrl,
  buildUploadsPlaylistId,
  channelNameMatchesArtist,
  classifyVideoTitle,
  createQuotaMeter,
  dedupeVideoCandidates,
  describeOfficialVideo,
  estimateOfficialQuota,
  formatDuration,
  isTopicChannelTitle,
  normalizeOfficialText,
  parseISO8601Duration,
  probeOfficialVideo,
  resolveOfficialVideo,
  routeOfficialVideos,
  topicChannelQuery,
  verifyOfficialChannel,
  YOUTUBE_QUOTA_COST,
  type OfficialChannelCandidate,
  type OfficialChannelVerification,
  type OfficialVideoCandidate,
  type OfficialVideoResolution,
  type OfficialVideoRouting,
  type OfficialVideoRoute,
  type VideoKind,
  type YouTubeChannel,
} from "../lib/youtube";
import {
  findOfficialChannel,
  findTopicChannel,
  OFFICIAL_CHANNELS,
  TOPIC_CHANNELS,
} from "../lib/official-channels";
import { setArtistYouTubeChannelId } from "../lib/turso";

// ─── Listas ─────────────────────────────────────────────────────────────────
//
// Los handles y dominios que el script usa salen de `lib/official-channels.ts`,
// que es donde vive la decisión. Este `export` se mantiene porque
// `tests/unit/official-videos.test.ts` lo importa, y ahora **deriva** de la
// allowlist en vez de ser una segunda lista: una sola que alguien revisa.

const MAX_PLAYLIST_PAGES = 30;
const DEFAULT_PLAYLIST_PAGES = 2;
const PLAYLIST_PAGE_SIZE = 50;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * Exportado para los tests: los candidatos que salen de la allowlist, en la
 * forma que `verifyOfficialChannel` espera.
 */
export const OFFICIAL_CHANNEL_CANDIDATES: OfficialChannelCandidate[] = OFFICIAL_CHANNELS.map(
  (entry) => ({
    artistName: entry.artistName,
    // Sin handle verificado (David Bowie) la verificación estructural por
    // descripción sigue teniendo sentido, pero no se puede resolver por
    // `forHandle`: el script lo pide por **id**, que es lo que hay verificado.
    // `handle` es solo informativo aquí, y `verifyOfficialChannel` lo compara
    // sin `@` — de ahí el `davidbowie` y no `@davidbowie`.
    handle: entry.handle ?? normalizeOfficialText(entry.artistName).replace(/ /g, ""),
    officialDomain: entry.officialDomain,
  }),
);

// ─── Acceso a datos ─────────────────────────────────────────────────────────

interface ArtistRow {
  id: string;
  name: string;
  youtube_channel_id: string | null;
}

interface TrackRow {
  id: string;
  title: string;
  artist_name: string;
  release_id: string | null;
  release_date: string | null;
  youtube_video_id: string | null;
  video_embed_url: string | null;
  video_kind: string | null;
}

/**
 * ¿Existe `tracks.video_kind` en la base a la que se va a leer/escribir?
 *
 * La migración vive en `ensureTursoSchema()` (`lib/turso.ts`) y en
 * `initLocalTables()` (`lib/db.ts`), y este script **no** llama a ninguna de las
 * dos: abre su propio cliente. Así que la primera vez que se corre contra una base
 * con el esquema viejo, `SELECT video_kind` revienta con
 * `SQL_INPUT_ERROR: no such column` y el dry-run muere antes de informar de nada.
 *
 * Se comprueba una vez y se recuerda. Un script de datos no debe ser el que
 * aplica la migración a mano, pero tampoco debe dejar de servir sudry-run
 * porque le falte una columna: informa, sigue, y **no escribe** `video_kind`
 * (eso sí necesita la columna).
 */
let videoKindColumn: boolean | null = null;

async function hasVideoKindColumn(): Promise<boolean> {
  if (videoKindColumn !== null) return videoKindColumn;
  // `PRAGMA table_info` y NO `SELECT video_kind … LIMIT 0`. Son equivalentes
  // para responder, pero la segunda **falla** cuando la columna no existe, y
  // ese fallo en un cliente libsql deja además una promesa rechazada sin
  // manejar por debajo (`ResultSet` de hrana): el script muere con un
  // `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` en vez de avisar.
  // `PRAGMA` responde igual de rápido y no tiene rama de error.
  try {
    if (isTursoBackend()) {
      const client = await tursoClient();
      const result = await client.execute("PRAGMA table_info(tracks)");
      videoKindColumn = result.rows.some((row) => String(row.name ?? "") === "video_kind");
    } else {
      const db = localDb();
      try {
        const rows = db.prepare("PRAGMA table_info(tracks)").all() as Array<{
          name?: string;
        }>;
        videoKindColumn = rows.some((row) => row.name === "video_kind");
      } finally {
        db.close();
      }
    }
  } catch (error) {
    videoKindColumn = false;
    console.log(
      `\n⚠️  no se pudo inspeccionar el esquema (${error instanceof Error ? error.message : String(error)}): se trata como si video_kind no existiera.`
    );
  }

  if (!videoKindColumn) {
    console.log(
      "\n⚠️  tracks.video_kind NO existe en esta base todavía: se puede informar del vídeo, pero NO se escribe su clase."
    );
    console.log(
      "   Aplica la migración (ensureTursoSchema / initLocalTables) antes de usar --apply."
    );
  }
  return videoKindColumn;
}

function loadEnv(): void {
  let text: string;
  try {
    text = fs.readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function isTursoBackend(): boolean {
  return !!process.env.TURSO_DATABASE_URL && !!process.env.TURSO_AUTH_TOKEN;
}

async function tursoClient() {
  const { createClient } = await import("@libsql/client");
  return createClient({
    url: process.env.TURSO_DATABASE_URL as string,
    authToken: process.env.TURSO_AUTH_TOKEN as string,
  });
}

function localDb() {
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const path = require("node:path") as typeof import("node:path");
  return new Database(path.join(process.cwd(), "data", "music_catalog.db"));
}

function mapArtistRow(r: unknown): ArtistRow {
  const row = r as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    youtube_channel_id:
      row.youtube_channel_id == null ? null : String(row.youtube_channel_id),
  };
}

function mapTrackRow(r: unknown): TrackRow {
  const row = r as Record<string, unknown>;
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    artist_name: String(row.artist_name ?? ""),
    release_id: row.release_id == null ? null : String(row.release_id),
    release_date: row.release_date == null ? null : String(row.release_date),
    youtube_video_id: row.youtube_video_id == null ? null : String(row.youtube_video_id),
    video_embed_url: row.video_embed_url == null ? null : String(row.video_embed_url),
    video_kind: row.video_kind == null ? null : String(row.video_kind),
  };
}

async function readArtists(): Promise<ArtistRow[]> {
  const sql = `SELECT id, name, youtube_channel_id FROM artists ORDER BY name`;
  if (isTursoBackend()) {
    const client = await tursoClient();
    const result = await client.execute(sql);
    return result.rows.map(mapArtistRow);
  }
  const db = localDb();
  try {
    return (db.prepare(sql).all() as unknown[]).map(mapArtistRow);
  } finally {
    db.close();
  }
}

async function readTracks(artistName: string, withVideoKind: boolean): Promise<TrackRow[]> {
  const columns =
    "id, title, artist_name, release_id, release_date, youtube_video_id, video_embed_url" +
    (withVideoKind ? ", video_kind" : "");
  const sql = `SELECT ${columns}
                 FROM tracks WHERE artist_name = ?
                ORDER BY release_id IS NULL DESC, id`;
  if (isTursoBackend()) {
    const client = await tursoClient();
    const result = await client.execute({ sql, args: [artistName] });
    return result.rows.map(mapTrackRow);
  }
  const db = localDb();
  try {
    return (db.prepare(sql).all(artistName) as unknown[]).map(mapTrackRow);
  } finally {
    db.close();
  }
}

/**
 * Escribe **tres** columnas en una fila: el id del vídeo, su URL y su clase.
 *
 * `video_kind` va en el mismo `UPDATE` a propósito: si fuera un segundo
 * `UPDATE`, un fallo entre medias dejaría la fila con un vídeo cuya clase se
 * ignora — exactamente el estado que hace que un directo se presente como el
 * tema de estudio. O se escriben los tres o no se escribe ninguno.
 */
async function writeTrackVideo(
  id: string,
  videoId: string,
  embedUrl: string,
  videoKind: VideoKind | null,
  withVideoKind: boolean,
): Promise<number> {
  // Sin la columna solo se escribe lo que ya existía, y el kind se pierde. Es
  // mejor eso que un error que corta el script a mitad, y el aviso de
  // `hasVideoKindColumn` ya está impreso.
  const sql = withVideoKind
    ? "UPDATE tracks SET youtube_video_id = ?, video_embed_url = ?, video_kind = ? WHERE id = ?"
    : "UPDATE tracks SET youtube_video_id = ?, video_embed_url = ? WHERE id = ?";
  const args = withVideoKind ? [videoId, embedUrl, videoKind, id] : [videoId, embedUrl, id];
  if (isTursoBackend()) {
    const client = await tursoClient();
    const result = await client.execute({ sql, args });
    return Number(result.rowsAffected ?? 0);
  }
  const db = localDb();
  try {
    return Number(db.prepare(sql).run(...(args as unknown[])).changes ?? 0);
  } finally {
    db.close();
  }
}

// ─── API de YouTube ─────────────────────────────────────────────────────────

function parseChannel(raw: unknown): YouTubeChannel | null {
  const item = (raw ?? {}) as Record<string, unknown>;
  if (item.id == null) return null;
  const snippet = (item.snippet ?? {}) as Record<string, unknown>;
  const contentDetails = (item.contentDetails ?? {}) as Record<string, unknown>;
  const statistics = (item.statistics ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id),
    title: typeof snippet.title === "string" ? snippet.title : "",
    description: typeof snippet.description === "string" ? snippet.description : "",
    type: typeof snippet.type === "string" ? snippet.type : null,
    customUrl: typeof snippet.customUrl === "string" ? snippet.customUrl : null,
    uploadsPlaylistId:
      typeof contentDetails.relatedPlaylists === "object" && contentDetails.relatedPlaylists
        ? String(((contentDetails.relatedPlaylists as Record<string, unknown>).uploads as string) ?? "")
        : "",
    subscriberCount: Number(statistics.subscriberCount ?? 0) || 0,
    viewCount: Number(statistics.viewCount ?? 0) || 0,
    /** `statistics.videoCount`: en un `- Topic` es lo que separa un catálogo real de un canal vacío. */
    videoCount: Number(statistics.videoCount ?? 0) || 0,
  };
}

async function youtubeFetch(
  pathAndQuery: string,
  meter: ReturnType<typeof createQuotaMeter>,
  method: keyof typeof import("../lib/youtube").YOUTUBE_QUOTA_COST,
  label: string,
): Promise<unknown> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY no está en .env.local");
  const res = await fetch(`${YOUTUBE_API_BASE}/${pathAndQuery}&key=${encodeURIComponent(apiKey)}`);
  meter.charge(method, label);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(
      `${method} respondió ${res.status}${body?.error?.message ? `: ${body.error.message}` : ""}`
    );
  }
  return res.json();
}

async function fetchChannelById(
  channelId: string,
  meter: ReturnType<typeof createQuotaMeter>,
): Promise<YouTubeChannel | null> {
  const payload = (await youtubeFetch(
    `channels?part=snippet,contentDetails,statistics&id=${encodeURIComponent(channelId)}`,
    meter,
    "channels",
    `channels.list ${channelId}`,
  )) as { items?: unknown[] };
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.length > 0 ? parseChannel(items[0]) : null;
}

/**
 * Busca el canal `- Topic` por `search.list`. **100 unidades**: solo con
 * `--discover-topic`.
 *
 * Valida por lo que el enunciado fija y no por heurísticas: el nombre tiene que
 * casar con `<artista> - Topic` **sin distinción de mayúsculas** y `videoCount`
 * tiene que ser > 0. Un canal con 0 vídeos es un homónimo sin catálogo.
 */
async function discoverTopicChannel(
  artistName: string,
  meter: ReturnType<typeof createQuotaMeter>,
): Promise<YouTubeChannel | null> {
  const payload = (await youtubeFetch(
    `search?part=snippet&type=channel&maxResults=10&q=${encodeURIComponent(topicChannelQuery(artistName))}`,
    meter,
    "search",
    `search.list "${topicChannelQuery(artistName)}"`,
  )) as { items?: Array<{ id?: unknown; snippet?: Record<string, unknown> }> };
  const items = Array.isArray(payload.items) ? payload.items : [];
  const wanted = items
    .map((item) => parseChannel({ ...item, id: item.id }))
    .filter((channel): channel is YouTubeChannel => channel !== null)
    .filter((channel) => isTopicChannelTitle(channel.title, artistName));

  return wanted.find((channel) => channel.videoCount > 0) ?? wanted[0] ?? null;
}

/** Cuántos vídeos del canal se piden. La mitad de 50 llega a los que importan. */
function pagesToCover(videoCount: number, maxPages: number): number {
  if (!(videoCount > 0)) return maxPages;
  return Math.min(maxPages, Math.max(1, Math.ceil(videoCount / PLAYLIST_PAGE_SIZE)));
}

/**
 * La playlist de subidas va **de más reciente a más antiguo**, y no hay forma de
 * invertirlo (`playlistItems.list` no tiene orden inverso).
 *
 * Consecuencia medida: con `--pages=4` (200 vídeos) salen 34 coincidencias de 74
 * pistas, y **ninguna** es `videoclip`: los clips clásicos están al final de la
 * lista, y las primeras 200 subidas de un canal de 1346 vídeos son material
 * reciente (archivos, entrevistas, recopilaciones). Para llegar a ellos hay que
 * barrer la lista entera: `--pages=27` para Pink Floyd, que son 27 unidades de
 * las 10 000 diarias.
 *
 * No es un defecto del emparejamiento: es que sin barrer la lista no se ha visto
 * el vídeo, y una pista que no se ha buscado no puede estar "sin vídeo" por
 * decisión del emparejamiento.
 */
function suggestedPagesFor(videoCount: number): number {
  if (!(videoCount > 0)) return DEFAULT_PLAYLIST_PAGES;
  return Math.ceil(videoCount / PLAYLIST_PAGE_SIZE);
}

/** `snippet.resourceId.kind` — un item de playlist es siempre `youtube#video`. */
function readPlaylistItemVideoId(item: Record<string, unknown>): string | null {
  const top = typeof item.videoId === 'string' ? item.videoId : '';
  if (top) return top;
  // ⚠️ `videoId` **no** viene arriba. La respuesta real de `playlistItems.list`
  // lo trae en `contentDetails.videoId`, y `snippet.resourceId.videoId` como
  // redundancia. La versión anterior de este script leía `item.videoId` a secas,
  // que siempre era `undefined`: se descartaban los 100 vídeos de cada página en
  // el `if` y la playlist salía con 0. No era «no hay vídeos», era un campo
  // leído del sitio equivocado — y por eso 0 de las pistas del catálogo tenían
  // `youtube_video_id` después de RC.32.
  const contentDetails = (item.contentDetails ?? {}) as Record<string, unknown>;
  const fromDetails = typeof contentDetails.videoId === 'string' ? contentDetails.videoId : '';
  if (fromDetails) return fromDetails;
  const snippet = (item.snippet ?? {}) as Record<string, unknown>;
  const resourceId = (snippet.resourceId ?? {}) as Record<string, unknown>;
  return typeof resourceId.videoId === 'string' ? resourceId.videoId : null;
}

async function fetchUploadsPlaylist(
  playlistId: string,
  maxPages: number,
  meter: ReturnType<typeof createQuotaMeter>,
): Promise<OfficialVideoCandidate[]> {
  const videos: OfficialVideoCandidate[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const query =
      `playlistItems?part=snippet,contentDetails&maxResults=${PLAYLIST_PAGE_SIZE}` +
      `&playlistId=${encodeURIComponent(playlistId)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const payload = (await youtubeFetch(
      query,
      meter,
      "playlistItems",
      `playlistItems.list ${playlistId} pág ${page + 1}`,
    )) as {
      items?: unknown[];
      nextPageToken?: string;
    };

    for (const raw of Array.isArray(payload.items) ? payload.items : []) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const snippet = (item.snippet ?? {}) as Record<string, unknown>;
      const contentDetails = (item.contentDetails ?? {}) as Record<string, unknown>;
      const videoId = readPlaylistItemVideoId(item);
      if (!videoId) continue;
      const duration =
        typeof contentDetails.duration === 'string' ? contentDetails.duration : "";
      videos.push({
        videoId,
        title: typeof snippet.title === 'string' ? snippet.title : "",
        description: typeof snippet.description === 'string' ? snippet.description : "",
        // `playlistItems` no devuelve duración (viene en `part=contentDetails`
        // del vídeo, que son 50 unidades más). El dato queda a 0 y el informe
        // lo dice con "—", en vez de inventar una duración.
        durationSeconds: duration ? parseISO8601Duration(duration) : 0,
        videoOwnerChannelId:
          typeof snippet.videoOwnerChannelId === "string" ? snippet.videoOwnerChannelId : null,
        // `snippet.publishedAt` es cuándo se **añadió** a la playlist, que en un
        // canal con 1300 vídeos significa "lo último que resubieron". La fecha
        // real de subida es `contentDetails.videoPublishedAt`, y es la que decide
        // el desempate "gana el más antiguo" de `routeOfficialVideos`.
        publishedAt:
          typeof contentDetails.videoPublishedAt === "string"
            ? contentDetails.videoPublishedAt
            : typeof snippet.publishedAt === "string"
              ? snippet.publishedAt
              : null,
      });
    }

    pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : null;
    if (!pageToken) break;
    if (page === maxPages - 1) {
      console.log(
        `    (la playlist tiene más páginas; se pararon ${maxPages}. Sube --pages= si quieres más.`
      );
    }
  }

  // Trampa 1: `playlistItems.list` devuelve el mismo vídeo dos veces.
  const unique = dedupeVideoCandidates(videos);
  if (videos.length !== unique.length) {
    console.log(
      `    ⚠️  ${videos.length - unique.length} vídeo(s) repetido(s) en la playlist: quitados por videoId.`
    );
  }
  return unique;
}

// ─── Informe ────────────────────────────────────────────────────────────────

interface RouteReport {
  artistName: string;
  channelLabel: string;
  trackId: string;
  trackTitle: string;
  routing: OfficialVideoRouting;
  /** De qué canal salió el elegido: humano o `- Topic`. */
  usedTopicChannel: boolean;
}

/** Una fila lista para escribir: el `UPDATE` y el kind que va con él. */
interface PendingWrite {
  id: string;
  youtube_video_id: string;
  video_embed_url: string;
  video_kind: VideoKind | null;
}

/**
 * La puerta de verificación, con **una sola** excepción explícita.
 *
 * `verifyOfficialChannel` (RC.32) exige tres cosas: no ser un canal «topic», el
 * nombre exacto del artista, y que la descripción del canal enlace el dominio
 * oficial. Esa tercera comprobación **hoy no pasa para ninguno de los 5**:
 *
 *   - Pink Floyd: 991 caracteres de biografía, sin un solo enlace.
 *   - David Bowie: 741 caracteres, sin enlace.
 *   - Radiohead: descripción vacía (0 caracteres).
 *   - Björk: «This is the official Björk channel on YouTube.», sin enlace.
 *   - Kraftwerk: la lista de miembros, sin enlace.
 *
 * Es un hallazgo, no un bug: la prueba era buena cuando el canal tenía
 * descripción y hoy no la tiene. Pero «ningún canal pasa» significa «ningún
 * vídeo», y eso no es un resultado, es una puerta cerrada.
 *
 * `--trust-allowlist` baja **solo** esa tercera comprobación, y solo cuando:
 *
 *   1. el id es el de `lib/official-channels.ts`, que es una afirmación
 *      versionada y revisable (no un resultado de búsqueda), y
 *   2. `snippet.title` es exactamente el nombre del artista, y
 *   3. `snippet.type` no es `"topic"`.
 *
 * Un `dominio-distinto` —que SÍ hay dominios pero no son el oficial— **no** se
 * degrada nunca: eso sí es una discrepancia real. Y sin el flag, el
 * comportamiento es idéntico al de RC.32.
 */
function resolveChannelGate(
  declared: OfficialChannelCandidate,
  channel: YouTubeChannel | null,
  options: { trustAllowlist: boolean; allowlistId: string },
): { ok: boolean; verification: OfficialChannelVerification; warnings: string[] } {
  const verification = verifyOfficialChannel(declared, channel);
  const warnings: string[] = [];
  if (verification.ok || !options.trustAllowlist) return { ok: verification.ok, verification, warnings };
  if (verification.reason !== 'sin-dominio-oficial' || !channel) {
    return { ok: false, verification, warnings };
  }
  if (channel.id !== options.allowlistId) {
    warnings.push(`el id devuelto (${channel.id}) no es el de la allowlist: no se degrada nada`);
    return { ok: false, verification, warnings };
  }
  if (!channelNameMatchesArtist(channel.title, declared.artistName)) {
    warnings.push(`el título del canal es "${channel.title}", no "${declared.artistName}"`);
    return { ok: false, verification, warnings };
  }
  if ((channel.type || '').toLowerCase() === 'topic') {
    warnings.push('es un canal «topic» autogenerado: eso no se degrada nunca');
    return { ok: false, verification, warnings };
  }

  const uploads = (channel.uploadsPlaylistId || '').trim() || buildUploadsPlaylistId(channel.id) || '';
  if (!uploads) {
    warnings.push('no expone playlist de subidas');
    return { ok: false, verification, warnings };
  }

  warnings.push(
    'ACEPTADO POR ALLOWLIST: el id es el de lib/official-channels.ts, el nombre ' +
      'coincide exacto y no es un canal «topic», pero su descripción NO enlaza el ' +
      'dominio oficial, así que la prueba estructural de RC.32 no se puede cumplir.',
  );
  return {
    ok: true,
    warnings,
    verification: {
      ...verification,
      ok: true,
      reason: null,
      detail: `canal "${channel.title}" con id de allowlist ${channel.id} (descripción sin dominio: prueba RC.32 degradada a mano)`,
      channel: { ...channel, uploadsPlaylistId: uploads },
    },
  };
}

function printRoutingReport(report: RouteReport, route: OfficialVideoRoute): void {
  const { routing } = report;
  const kindLabel = (kind: VideoKind | null) => (kind ? `"${kind}"` : "sin kind");
  console.log(
    `  ─ ${report.trackTitle}  (${report.trackId})  ·  ruta "${route}"  ·  canal ${report.channelLabel}`
  );

if (!routing.chosen) {
    console.log(`      ✗ sin vídeo para esta ruta — ${routing.reason}`);
    if (routing.nearMisses > 0) {
      console.log(
        `          ${routing.nearMisses} vídeo(s) con el título "parecido": hay algo, pero es otra grabación.`
      );
    }
    for (const skip of routing.skipped.slice(0, 3)) {
      console.log(`          ${skip.label}: ${skip.reason}`);
    }
    if (routing.skipped.length > 3) {
      console.log(`          … y ${routing.skipped.length - 3} descarte(s) más`);
    }
    console.log("      La pista se queda SIN VÍDEO. No se fuerza nada.");
    console.log();
    return;
  }

  const chosen = routing.chosen;
  const duration = chosen.durationSeconds ? ` ${formatDuration(chosen.durationSeconds)}` : "";
  console.log(`      ✓ ${chosen.title}${duration}   →  ${kindLabel(routing.kind)}`);
  console.log(`          ${chosen.videoId}  ·  confianza: título exacto`);
  console.log(`          ${routing.chosenOption?.classification.reason ?? ""}`);
  const others = routing.options.slice(1);
  if (others.length > 0) {
    console.log(`          alternativas para la misma ruta: ${others.length}`);
    for (const other of others.slice(0, 2)) {
      console.log(
        `            ${describeOfficialVideo(other.candidate)} (${other.classification.kind})`
      );
    }
  }
  if (route === "playback") {
    const lives = routing.skipped.filter((skip) => skip.kind === "live");
    if (lives.length > 0) {
      console.log(
        `          fuera de la ruta "playback": ${lives.length} directo(s) — en "showcase" sí entrarían`,
      );
    }
  }
  console.log();
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function argValue(flag: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}

async function main(): Promise<void> {
  loadEnv();

  const apply = process.argv.slice(2).includes("--apply");
  const onlyChannels = process.argv.slice(2).includes("--channels");
  const discoverTopic = process.argv.slice(2).includes("--discover-topic");
  const trustAllowlist = process.argv.slice(2).includes("--trust-allowlist");
  const onlyArtist = argValue("--artist");
  const pagesArg = argValue("--pages");
  const requested = pagesArg ? Number(pagesArg) : DEFAULT_PLAYLIST_PAGES;
  const pages = Math.min(MAX_PLAYLIST_PAGES, Math.max(1, Number.isFinite(requested) ? requested : DEFAULT_PLAYLIST_PAGES));
  const routeArg = argValue("--route");
  const route: OfficialVideoRoute = routeArg === "playback" ? "playback" : "showcase";

  const engine = isTursoBackend() ? "Turso" : "SQLite local";
  // Se comprueba antes de leer nada: un `SELECT video_kind` contra una base con el
  // esquema viejo es un error, y el dry-run tiene que servir igual para diagnosticar.
  const canWriteVideoKind = await hasVideoKindColumn();

  console.log(
    `\n${apply ? "▶️  APLICANDO" : "🔍 DRY-RUN"} — vídeos oficiales de YouTube (RC.33 · Ola 4)`
  );
  console.log(`Motor: ${engine}`);
  console.log(`Canales declarados a mano: ${OFFICIAL_CHANNELS.length} (lib/official-channels.ts)`);
  console.log(`Ruta informada: "${route}"  (showcase = los 3 kinds · playback = sin live)`);
  console.log(`Páginas de la playlist por canal: ${pages} (tope ${MAX_PLAYLIST_PAGES})`);
  console.log(
    "  La playlist va de más reciente a más antiguo: con pocas páginas solo se ven las subidas nuevas."
  );
  console.log(
    `  Para Pink Floyd harían falta ${suggestedPagesFor(OFFICIAL_CHANNELS[0]?.videoCount ?? 0)} páginas para ver la lista entera.`
  );
  console.log(`Prueba estructural RC.32: ${trustAllowlist ? "DEGRADADA a mano (--trust-allowlist)" : "intacta"}`);
  if (trustAllowlist) {
    console.log(
      "   ⚠️  Con --trust-allowlist se acepta un canal cuyo id es el de la allowlist y cuyo"
    );
    console.log(
      "      nombre coincide, aunque su descripción NO enlace el dominio oficial. Los 5"
    );
    console.log("      canales están hoy en ese caso (descripciones sin enlaces).");
  }
  console.log("");

  const entries = OFFICIAL_CHANNELS.filter((entry) =>
    onlyArtist ? entry.artistName === onlyArtist : true,
  );
  const topicSearches = discoverTopic ? entries.length : 0;
  const estimate = estimateOfficialQuota({
    artists: entries.length,
    playlistPages: pages,
    topicSearches,
  });
  console.log("Consumo ESTIMADO antes de empezar (peor caso: todas las páginas):");
  console.log(
    `  channels.list      ${String(estimate.channels).padStart(4)} u  × 1   (${entries.length} artistas)`,
  );
  console.log(
    `  playlistItems.list ${String(estimate.playlistItems).padStart(4)} u  × 1   (${entries.length} artistas × ${pages} páginas)`,
  );
  console.log(
    `  search.list        ${String(estimate.searches).padStart(4)} u × ${YOUTUBE_QUOTA_COST.search}   (bucket aparte de 100/día)`,
  );
  console.log(`  TOTAL              ${String(estimate.total).padStart(4)} u  de las 10 000 diarias`);
  if (!discoverTopic) {
    console.log("  `- Topic` se resuelve desde la tabla ya verificada: 0 de search.list.");
  } else {
    console.log(
      `  ⚠️  --discover-topic: ${topicSearches} × ${YOUTUBE_QUOTA_COST.search} = ${topicSearches * YOUTUBE_QUOTA_COST.search} unidades de las 100 llamadas/día de search.`
    );
  }
  console.log("");
  console.log("⚠️  ESTO NO ES FUENTE DE AUDIO.");
  console.log("   Un youtube_video_id convierte el tracklist en capítulos de vídeo, pero el reproductor");
  console.log("   sigue priorizando el preview de audio: la pista NO empezará a sonar por esto.");
  console.log("");

  const meter = createQuotaMeter();
  const artists = await readArtists();
  const channelUpdates: { artist: ArtistRow; channelId: string }[] = [];
  const resolutions: OfficialVideoResolution[] = [];
  const routingReports: RouteReport[] = [];
  const pendingWrites: PendingWrite[] = [];
  let discards = 0;
  let resolvedRoutes = 0;

  for (const [index, entry] of entries.entries()) {
    console.log("-".repeat(96));
    console.log(`[${index + 1}/${entries.length}] ${entry.artistName}`);
    console.log(
      `  allowlist: ${entry.channelId}  ·  sitio oficial ${entry.officialDomain}  ·  ${entry.videoCount} vídeos`
    );
    console.log(`  procedencia: ${entry.provenance}`);

    const declared: OfficialChannelCandidate = {
      artistName: entry.artistName,
      handle: entry.handle ?? "",
      officialDomain: entry.officialDomain,
    };

    const artist =
      artists.find((a) => a.name === entry.artistName) ??
      artists.find(
        (a) =>
          normalizeOfficialText(a.name) === normalizeOfficialText(entry.artistName),
      );

    let channel: YouTubeChannel | null = null;
    let verification: OfficialChannelVerification;
    let gateWarnings: string[] = [];
    try {
      channel = await fetchChannelById(entry.channelId, meter);
      const gate = resolveChannelGate(declared, channel, {
        trustAllowlist,
        allowlistId: entry.channelId,
      });
      verification = gate.verification;
      gateWarnings = gate.warnings;
    } catch (error) {
      console.log(
        `  ✗ channels.list falló — ${error instanceof Error ? error.message : String(error)}`
      );
      console.log("  NO VERIFICADO (sin datos: no se puede decidir, y no se decide a favor)");
      console.log();
      continue;
    }

    for (const warning of gateWarnings) {
      console.log(`  ⚠️  ${warning}`);
    }

    if (!verification.ok || !verification.channel) {
      console.log(`  ✗ NO VERIFICADO — ${verification.reason}`);
      console.log(`      ${verification.detail}`);
      if (verification.descriptionDomains.length > 0) {
        console.log(
          `      dominios en la descripción del canal: ${verification.descriptionDomains.join(", ")}`
        );
      }
      console.log("      No se escribe nada para este artista.");
      console.log();
      continue;
    }

    const verified = verification.channel;
    console.log(`  ✓ VERIFICADO — ${verification.detail}`);
    console.log(`      tipo: ${verified.type ?? "(sin dato)"}`);
    console.log(
      `      ${verified.subscriberCount.toLocaleString("es-ES")} suscriptores · ${verified.viewCount.toLocaleString("es-ES")} visualizaciones · ${verified.videoCount.toLocaleString("es-ES")} vídeos`
    );
    if (verified.id !== entry.channelId) {
      console.log(
        `      ⚠️  la API devolvió ${verified.id} y la allowlist dice ${entry.channelId}: la allowlist manda.`
      );
    }
    console.log(`      id: ${verified.id}  ·  uploads: ${verified.uploadsPlaylistId}`);

    const artistId = artist?.id ?? null;
    if (artistId) {
      const already = (artist?.youtube_channel_id ?? "").trim();
      console.log(
        already === verified.id
          ? `      artists.youtube_channel_id ya es ${verified.id} — no cambia`
          : `      artists.youtube_channel_id: ${already || "(vacío)"} → ${verified.id}`
      );
      if (already !== verified.id) {
        channelUpdates.push({
          artist: { id: artistId, name: entry.artistName, youtube_channel_id: already },
          channelId: verified.id,
        });
      }
    } else {
      console.log(
        `      ⚠️  no hay fila en artists con ese nombre: se busca el vídeo pero no se guarda el canal`
      );
    }
    console.log();

    if (onlyChannels || !verified.uploadsPlaylistId || !artistId) continue;

    // ── Canal `- Topic` ─────────────────────────────────────────────────────
    let topicChannel: YouTubeChannel | null = null;
    let topicSource = "";
    const allowlistedTopic = findTopicChannel(entry.artistName);
    if (discoverTopic) {
      try {
        topicChannel = await discoverTopicChannel(entry.artistName, meter);
        topicSource = topicChannel ? "search.list (esta ejecución)" : "search.list: no encontrado";
      } catch (error) {
        console.log(
          `  ⚠️  search.list para "${topicChannelQuery(entry.artistName)}" falló — ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else if (allowlistedTopic) {
      try {
        topicChannel = await fetchChannelById(allowlistedTopic.channelId, meter);
        topicSource = "lib/official-channels.ts (verificado antes)";
      } catch (error) {
        console.log(
          `  ⚠️  channels.list del canal - Topic falló — ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else {
      console.log(
        `  · sin canal "- Topic" verificado para ${entry.artistName}: no hay búsqueda por audio de topic.`
      );
      console.log(`    Para verificarlo: --discover-topic (100 u) y revisa el dry-run.`);
    }

    if (topicChannel) {
      // Trampa 2: el nombre se compara SIN distinción de mayúsculas. Si no,
      // "PINK FLOYD - Topic" no casaría con "Pink Floyd - Topic" y el audio del
      // catálogo se quedaría sin vídeo sin que nada fallara.
      const nameOk = isTopicChannelTitle(topicChannel.title, entry.artistName);
      const idOk = allowlistedTopic ? topicChannel.id === allowlistedTopic.channelId : true;
      console.log(
        `  canal "- Topic": ${topicChannel.title} (${topicChannel.id})  ·  ${topicSource}`
      );
      if (!nameOk) {
        console.log(
          `      ✗ el nombre no es "${topicChannelQuery(entry.artistName)}" (sin distinguir mayúsculas): descartado`
        );
        console.log(`     (channel homónimo: un "${topicChannel.title}" no es el catálogo de este artista)`);
        topicChannel = null;
      } else if (!idOk) {
        console.log(
          `      ✗ el id no es el verificado (${allowlistedTopic?.channelId}): descartado`
        );
        topicChannel = null;
      } else if (!(topicChannel.videoCount > 0)) {
        console.log(`      ✗ videoCount = 0: es un homónimo sin catálogo. Descartado.`);
        topicChannel = null;
      } else {
        console.log(
          `      ✓ ${topicChannel.videoCount.toLocaleString("es-ES")} vídeos · ${topicChannel.uploadsPlaylistId ?? "(sin playlist)"}`
        );
      }
    }
    console.log();

    const topicPlaylistId =
      topicChannel?.uploadsPlaylistId || (topicChannel ? buildUploadsPlaylistId(topicChannel.id) : null);

    let uploads: OfficialVideoCandidate[] = [];
    let topicVideos: OfficialVideoCandidate[] = [];
    try {
      uploads = await fetchUploadsPlaylist(verified.uploadsPlaylistId, pages, meter);
      if (topicPlaylistId) {
        const topicPages = pagesToCover(topicChannel?.videoCount ?? 0, pages);
        topicVideos = await fetchUploadsPlaylist(topicPlaylistId, topicPages, meter);
      }
    } catch (error) {
      console.log(
        `  ✗ playlistItems.list falló — ${error instanceof Error ? error.message : String(error)}`
      );
      console.log();
      continue;
    }
    console.log(`  vídeos del canal humano: ${uploads.length}`);
    console.log(`  vídeos del canal "- Topic": ${topicVideos.length}`);
    console.log();

    const tracks = await readTracks(entry.artistName, canWriteVideoKind);
    console.log(`  pistas del catálogo: ${tracks.length}`);
    console.log();

    for (const track of tracks) {
      // ── Ruta pedida ─────────────────────────────────────────────────────
      const humanRouting = routeOfficialVideos(uploads, track.title, {
        channelIsTopic: false,
        route,
      });
      const topicRouting =
        topicVideos.length > 0
          ? routeOfficialVideos(topicVideos, track.title, { channelIsTopic: true, route })
          : null;

      // El canal humano manda: es el canal del artista y su vídeo es el
      // videoclip. `- Topic` solo entra si no hay videoclip, y su kind es
      // `topic_audio` **porque el canal lo dice**, no porque el título lo parezca.
      const usedTopicChannel = humanRouting.chosen === null && topicRouting?.chosen != null;
      const routing: OfficialVideoRouting =
        usedTopicChannel
          ? topicRouting!
          : humanRouting.chosen === null && topicRouting !== null && topicRouting.chosen === null
            ? { ...humanRouting, skipped: [...humanRouting.skipped, ...topicRouting.skipped] }
            : humanRouting;
      const channelLabel = usedTopicChannel ? topicChannel?.title ?? "- Topic" : verified.title;

      const report: RouteReport = {
        artistName: entry.artistName,
        channelLabel,
        trackId: track.id,
        trackTitle: track.title,
        routing,
        usedTopicChannel,
      };
      routingReports.push(report);
      printRoutingReport(report, route);
      discards += routing.skipped.length;
      if (routing.chosen) resolvedRoutes++;

      // ── Verificación HTTP (RC.32) ────────────────────────────────────────
      // `routeOfficialVideos` elige; `probeOfficialVideo` es la que dice si algo
      // se puede embeber, y `resolveOfficialVideo` conserva el desglose de
      // descarte que el script ya tenía.
      const channelIdForVideo = usedTopicChannel ? topicChannel?.id ?? null : verified.id;
      const wanted = {
        id: track.id,
        title: track.title,
        artistName: track.artist_name,
        currentVideoId: track.youtube_video_id,
        currentEmbedUrl: track.video_embed_url,
      };
const resolution = await resolveOfficialVideo(
        wanted,
        usedTopicChannel ? topicVideos : uploads,
        {
          channelId: channelIdForVideo,
          verify: (videoId) => probeOfficialVideo(videoId),
          // El vídeo de la ruta va primero, o esta función devolvería otro y el
          // informe y la fila escrita dirían cosas distintas.
          preferVideoId: routing.chosen?.videoId ?? null,
          // Un directo solo es aceptable si la ruta lo eligió (showcase). En
          // playback nunca llega aquí, porque `routeOfficialVideos` lo descartó.
          allowLiveRendition: routing.kind === "live",
        },
      );
      resolutions.push(resolution);

      if (!resolution.chosen) {
        console.log(`      (no se escribe: ${resolution.reason})`);
        if (routing.chosen) {
          console.log(
            `      el vídeo elegido por la ruta (${routing.chosen.videoId}) no pasó la comprobación HTTP o el canal.`
          );
        }
        console.log();
        continue;
      }

      const kind = classifyVideoTitle(resolution.chosen.title, track.title, {
        channelIsTopic: usedTopicChannel,
      }).kind;
      const embedUrl = buildOfficialVideoEmbedUrl(resolution.chosen.videoId);
      console.log(`      HTTP ✓ ${resolution.verified?.detail ?? ""}`);
      console.log(`      video_kind = ${kind ?? "null"}`);

      const unchanged =
        (track.youtube_video_id ?? "").trim() === resolution.chosen.videoId &&
        (track.video_embed_url ?? "").trim() === embedUrl &&
        (track.video_kind ?? "").trim() === (kind ?? "");
      if (unchanged) {
        console.log("      = ya estaba escrito — no cambia");
      } else {
        console.log(
          `      → youtube_video_id = ${resolution.chosen.videoId}, video_kind = ${kind ?? "null"}`
        );
        pendingWrites.push({
          id: track.id,
          youtube_video_id: resolution.chosen.videoId,
          video_embed_url: embedUrl,
          video_kind: kind,
        });
      }
      console.log();
    }
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  // `pendingWrites` y no `selectOfficialVideoUpdates(resolutions)`: la fila a
  // escribir necesita **el kind que se decidió en el bucle**, no un kind
  // recalculado después desde el `resolution`. Recalcularlo exigiría volver a
  // adivinar de qué canal salió el vídeo, y ese es justo el dato que decide si
  // es `videoclip` o `topic_audio`.
  const updates = pendingWrites;
  const resolved = resolutions.filter((r) => r.chosen !== null);
  const byKind = new Map<VideoKind | null, number>();
  for (const report of routingReports) {
    const kind = report.routing.kind;
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
  }

  console.log("=".repeat(96));
  console.log(`Canales verificados: ${channelUpdates.length} de ${entries.length}`);
  for (const update of channelUpdates) {
    console.log(`  ✓ ${update.artist.name} → ${update.channelId}`);
  }
  console.log(
    `Pistas con vídeo para la ruta "${route}": ${resolvedRoutes} de ${routingReports.length}`
  );
  console.log("  por kind:");
  for (const [kind, count] of byKind) {
    console.log(`    ${(kind ?? "sin kind").padEnd(12)} ${count}`);
  }
  console.log(`Vídeos empaquetados y verificados por HTTP: ${resolved.length} de ${resolutions.length}`);
  for (const resolution of resolved) {
    console.log(`  ✓ ${resolution.wanted.artistName} — ${resolution.wanted.title}  → ${resolution.chosen?.videoId}`);
  }
  console.log(
    `Candidatos descartados con motivo: ${discards}  (pares vídeo × pista, no vídeos distintos)`
  );
  console.log(
    `Pistas con al menos un vídeo de título "parecido": ${routingReports.filter(
      (r) => r.routing.nearMisses > 0,
    ).length}  (hay algo, pero es otra grabación: es lo que hay que mirar a mano)`
  );
  console.log(`A escribir en tracks: ${updates.length} fila(s)`);
  console.log(`A escribir en artists.youtube_channel_id: ${channelUpdates.length} fila(s)`);
  console.log("");
  console.log("Consumo real de cuota del API v3:");
  console.log(`  llamadas: ${meter.calls}   unidades: ${meter.spent} / 10 000 diarias`);
  for (const charge of meter.charges) {
    console.log(
      `    ${String(charge.units).padStart(3)} u  ${charge.method.padEnd(14)} ${charge.label}`
    );
  }
  console.log(
    `  canales "- Topic" sin verificar (no hay audio de topic para ellos): ${
      OFFICIAL_CHANNELS.filter(
        (candidate) => !TOPIC_CHANNELS.some((topic) => topic.artistName === candidate.artistName),
      )
        .map((candidate) => candidate.artistName)
        .join(", ") || "(ninguno)"
    }`
  );
  console.log("=".repeat(96));

  if (!apply) {
    console.log("\n🔍 DRY-RUN. No se escribió nada. Añade --apply para escribir lo verificado.");
    return;
  }

  let writtenArtists = 0;
  for (const update of channelUpdates) {
    try {
      await setArtistYouTubeChannelId(update.artist.id, update.channelId);
      writtenArtists++;
      console.log(`  ↻ artists.${update.artist.name}.youtube_channel_id = ${update.channelId}`);
    } catch (error) {
      console.log(`  ⚠️  ${update.artist.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let writtenTracks = 0;
  const failed: { id: string; detail: string }[] = [];
  for (const update of updates) {
    try {
      const changes = await writeTrackVideo(
        update.id,
        update.youtube_video_id,
update.video_embed_url,
        update.video_kind,
        canWriteVideoKind,
      );
      if (changes > 0) {
        writtenTracks += changes;
        console.log(
          `  ↻ ${update.id} → ${update.youtube_video_id} (video_kind=${canWriteVideoKind ? update.video_kind ?? "null" : "no escrito: falta la columna"})`
        );
      } else {
        failed.push({ id: update.id, detail: "0 filas afectadas" });
      }
    } catch (error) {
      failed.push({ id: update.id, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(`\n✅ ${writtenTracks} fila(s) de tracks y ${writtenArtists} de artists en ${engine}.`);
  console.log("   Recuerda: esto NO hace que las pistas suenen. El reproductor sigue usando el preview.");
  if (failed.length > 0) {
    console.log(`   ⚠️  ${failed.length} escritura(s) fallaron:`);
    for (const entry of failed) console.log(`      ${entry.id}: ${entry.detail}`);
  }
}

const invokedDirectly = (process.argv[1] ?? "")
  .replace(/\\/g, "/")
  .endsWith("fetch-official-videos.ts");

if (invokedDirectly) {
  main().catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
}