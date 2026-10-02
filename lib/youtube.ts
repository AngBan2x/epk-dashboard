import {
  classifyUpstreamStatus,
  integrationFailure,
  integrationSuccess,
  type IntegrationReason,
  type IntegrationResult,
} from './integration-reasons';
// RC.32 · agente H — la normalización de títulos NO se reimplementa aquí.
//
// `lib/seed-audio.ts` ya la settled para la desambiguación de audio (artista +
// título exactos) y está cubierta por `tests/unit/itunes-previews.test.ts`. Copiarla
// sería exactamente el fallo que el propio repo ya cometió con
// `extractSpotifyId`/`extractAppleMusicId`: dos copias que divergen, y la misma
// cadena da un resultado en un sitio y otro en el otro. Se importa.
import { normalizeAudioText } from './seed-audio';

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  duration: string;
  durationSeconds: number;
  thumbnails: Record<string, { url: string; width: number; height: number }>;
  publishedAt: string;
  channelTitle: string;
  tags: string[];
  viewCount: string;
  likeCount: string;
  topicCategories: string[];
  /**
   * RC.32 · agente H. Antes estos campos no se pedían (`part=status` faltaba en
   * `app/api/youtube/route.ts:37`), así que no había forma de saber si un vídeo
   * se puede embeber ni si tiene el flag Made For Kids puesto.
   *
   * El flag importa por política, no por gusto: las YouTube API Services
   * Developer Policies exigen comprobarlo en cada vídeo embebido, y este
   * proyecto embebe en un iframe 1×1 con `opacity:0` y `zIndex:-1`
   * (`lib/youtube-player.ts:118-148`, con `disablekb:1`, `controls:0`), donde el
   * aviso del reproductor no se ve. Se exponen para que la decisión sea
   * explícita; hoy la UI no los consume.
   */
  embeddable?: boolean | null;
  privacyStatus?: string | null;
  madeForKids?: boolean | null;
  selfDeclaredMadeForKids?: boolean | null;
  license?: string | null;
  publicStatsViewable?: boolean | null;
  /** Derivados de lo anterior, para que quien llame no tenga que recalcular. */
  embedAllowed?: boolean;
  madeForKidsDisclosureRequired?: boolean;
}

export function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

/**
 * ÚNICA fuente de extracción de ids de Spotify.
 * `lib/audio-priority.ts` importa estas tres funciones: antes cada fichero
 * tenía su propia copia y divergían (`[\w-]{22}` vs `[\w-]+`, `song/` vs
 * `album/|song/`), de modo que la misma URL daba fuente en un sitio y ninguna
 * en el otro. Si necesitas tocarlas, tócalas aquí.
 */
export function extractSpotifyId(url: string): string | null {
  const match = url.match(/(?:spotify\.com\/(?:[a-z]{2}-[a-z]{2}\/)?track\/|spotify:track:)([\w-]+)/);
  return match ? match[1] : null;
}

export function extractAppleMusicId(url: string): string | null {
  // El id va INMEDIATAMENTE después de `album/` o `song/`
  // (`music.apple.com/us/song/1440857781/daft-punk`). La versión anterior pedía
  // un slug antes del id (`song/[^\/]+/(\d+)`) y por eso **no casaba con ninguna
  // URL real de Apple Music**: era el motivo de que el catálogo entero saliera
  // sin fuente. Acepta ambas formas de URL, no el slug.
  const match = url.match(/music\.apple\.com\/[a-z]{2}\/(?:album|song)\/(\d+)/);
  return match ? match[1] : null;
}

export async function fetchYouTubeVideo(videoId: string): Promise<YouTubeVideo | null> {
  try {
    const res = await fetch(`/api/youtube?id=${videoId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://epk-dashboard.vercel.app'}`;
}

export function getYouTubeThumbnail(videoId: string, quality: 'default' | 'mqdefault' | 'hqdefault' | 'maxresdefault' | 'maxres' = 'maxresdefault'): string {
  const q = quality === 'maxres' ? 'maxresdefault' : quality;
  return `https://img.youtube.com/vi/${videoId}/${q}.jpg`;
}

/**
 * URLs de embed de terceros. **No se renderizan en ninguna vista**: la UI hace
 * link-out. Se construyen porque forman parte del contrato de `AudioSource`,
 * pero ninguna fuente de tipo `spotify`/`apple_music` cuenta como reproducible
 * (`isPlayableAudioSource`), y por eso no habilitan un botón de play.
 */
export function getSpotifyEmbedUrl(trackId: string): string {
  return `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`;
}

export function getAppleMusicEmbedUrl(albumId: string): string {
  return `https://embed.music.apple.com/us/album/${albumId}`;
}

// ---------------------------------------------------------------------------
// YouTube Data API v3 — Lightweight Stats Client
// ---------------------------------------------------------------------------

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Fase E: máximo de ids por llamada al API v3 (`videos?id=A,B,C`).
 * Documentado por Google; no subirlo sin verificar el límite de cuota.
 */
export const YOUTUBE_BATCH_LIMIT = 50;

/** Timeout de red por lote, para que una llamada colgada no cuelgue la ruta. */
const YOUTUBE_TIMEOUT_MS = 5_000;

export interface YouTubeVideoStats {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string; // ISO 8601 like PT4M13S
  title: string;
  thumbnail: string;
  description: string; // P3.27: For chapter detection
}

/** Solo lo que la UI necesita pintar. */
export type YouTubeStatPair = { viewCount: number; likeCount: number };

/** `videoId -> stats`. Objeto plano (serializable) para pasar de Server a Client. */
export type YouTubeStatsRecord = Record<string, YouTubeStatPair>;

interface YouTubeVideosPayload {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      thumbnails?: { high?: { url?: string }; default?: { url?: string } };
    };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  }>;
  error?: { errors?: Array<{ reason?: string }>; message?: string };
}

function parseVideoItem(item: NonNullable<YouTubeVideosPayload['items']>[number]): YouTubeVideoStats {
  const stats = item.statistics;
  const snippet = item.snippet;
  return {
    viewCount: parseInt(stats?.viewCount || '0', 10),
    likeCount: parseInt(stats?.likeCount || '0', 10),
    commentCount: parseInt(stats?.commentCount || '0', 10),
    duration: item.contentDetails?.duration || '',
    title: snippet?.title || '',
    thumbnail: snippet?.thumbnails?.high?.url || snippet?.thumbnails?.default?.url || '',
    description: snippet?.description || '',
  };
}

/** Mapea el cuerpo de error de Google a un motivo discriminado. */
function classifyYouTubePayloadError(payload: YouTubeVideosPayload): IntegrationReason | null {
  const reason = payload.error?.errors?.[0]?.reason;
  if (!reason) return null;
  if (reason === 'dailyLimitExceeded' || reason === 'quotaExceeded' || reason === 'rateLimitExceeded') {
    return 'quota';
  }
  if (reason === 'keyInvalid' || reason === 'accessNotConfigured' || reason === 'forbidden') {
    return 'no_key';
  }
  return 'upstream';
}

/**
 * Una llamada al API v3 para hasta {@link YOUTUBE_BATCH_LIMIT} ids.
 * Es el motivo de que la UI deje de pedir `/videos` una vez por track.
 * Devuelve `{ id, stats }`: YouTube no garantiza el orden de `items` ni que
 * devuelva todos los pedidos, así que la posición no sirve para emparejar.
 */
async function fetchVideosChunk(
  videoIds: string[],
): Promise<IntegrationResult<Array<{ id: string; stats: YouTubeVideoStats }>>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return integrationFailure('no_key');
  if (videoIds.length === 0) return integrationSuccess([]);

  try {
    const url =
      `${YOUTUBE_API_BASE}/videos?id=${videoIds.map(encodeURIComponent).join(',')}` +
      `&part=statistics,contentDetails,snippet&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(YOUTUBE_TIMEOUT_MS),
      next: { revalidate: 300 },
    } as RequestInit);

    const payload = (await res.json().catch(() => ({}))) as YouTubeVideosPayload;

    // Fase E: faltaba el `res.ok`. Un 403 por cuota se parseaba antes como
    // éxito y terminaba en `null` indistinguible de "el video no existe".
    if (!res.ok) return integrationFailure(classifyUpstreamStatus(res.status));
    if (payload?.error) {
      const reason = classifyYouTubePayloadError(payload);
      if (reason) return integrationFailure(reason);
    }

    const items = (payload.items ?? []).filter((item) => typeof item?.id === 'string' && item.id);
    if (items.length === 0) return integrationFailure('not_found');
    return integrationSuccess(
      items.map((item) => ({ id: item.id as string, stats: parseVideoItem(item) })),
    );
  } catch (error) {
    const isTimeout =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    if (!isTimeout) {
      console.error('[youtube] fallo de red al pedir estadísticas:', error);
    }
    return integrationFailure(isTimeout ? 'upstream' : 'network');
  }
}

/**
 * Fase E — mata el N+1. Antes `EPKCard` llamaba a `getVideoStats` una vez por
 * track, así que un artista con N releases gastaba N unidades de cuota por
 * visitante. Ahora N ids entran en ⌈N/50⌉ llamadas (1 en la práctica).
 *
 * Los ids que YouTube no devuelve NO son un error: simplemente no aparecen en
 * el mapa, y la UI los pinta como "—".
 */
export async function getVideoStatsBatch(
  videoIds: string[],
): Promise<IntegrationResult<Map<string, YouTubeVideoStats>>> {
  const unique = Array.from(
    new Set(videoIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)),
  );
  if (unique.length === 0) return integrationSuccess(new Map());
  if (!process.env.YOUTUBE_API_KEY) return integrationFailure('no_key');

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += YOUTUBE_BATCH_LIMIT) {
    chunks.push(unique.slice(i, i + YOUTUBE_BATCH_LIMIT));
  }

  const results = await Promise.all(chunks.map((chunk) => fetchVideosChunk(chunk)));

  // Gravedad: cuota > sin clave > red > upstream > not_found. Un chunk
  // `not_found` junto a otro con datos no invalida los datos.
  const fatal = results.find((r) => !r.ok && r.reason !== 'not_found');
  if (fatal && !fatal.ok) return integrationFailure(fatal.reason);

  const map = new Map<string, YouTubeVideoStats>();
  for (const result of results) {
    if (result.ok) {
      for (const { id, stats } of result.data) map.set(id, stats);
    }
  }
  if (map.size === 0) return integrationFailure('not_found');
  return integrationSuccess(map);
}

/**
 * Fetch de las estadísticas de UN video.
 * Fase E: devuelve el motivo discriminado (`no_key` / `not_found` / `quota` /
 * `network` / `upstream`) en vez de un `null` que no explicaba nada, y
 * comprueba `res.ok`, que faltaba.
 */
export async function getVideoStats(
  videoId: string,
): Promise<IntegrationResult<YouTubeVideoStats>> {
  if (!videoId) return integrationFailure('not_found');
  const res = await getVideoStatsBatch([videoId]);
  if (!res.ok) return res;
  const stats = res.data.get(videoId);
  if (!stats) return integrationFailure('not_found');
  return integrationSuccess(stats);
}

/**
 * Resuelve el lote y lo aplana a un objeto serializable para pasarlo de un
 * Server Component a uno cliente (`Map` no sobrevive al RSC boundary).
 */
export function toStatsRecord(
  map: Map<string, YouTubeVideoStats> | null,
): YouTubeStatsRecord {
  const record: YouTubeStatsRecord = {};
  if (!map) return record;
  for (const [id, stats] of map) {
    record[id] = { viewCount: stats.viewCount, likeCount: stats.likeCount };
  }
  return record;
}

/** Extrae los `youtube_video_id` válidos de una lista de tracks. */
export function collectVideoIds(
  items: Array<{ youtube_video_id?: string | null }>,
): string[] {
  return items
    .map((item) => (typeof item.youtube_video_id === 'string' ? item.youtube_video_id.trim() : ''))
    .filter(Boolean);
}

/**
 * Parse an ISO 8601 duration string (e.g. "PT4M13S") into a human-readable
 * format such as "4:13" or "1:02:05".
 */
export function parseISODuration(duration: string): string {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// P3.27: YouTube Chapter Detection
export interface YouTubeChapter {
  title: string;
  startTime: number;
  endTime: number;
}

/**
 * Parse YouTube chapters from video description.
 * Supports formats:
 * - "0:00 Intro"
 * - "1:30 - Song 1"
 * - "01:30:00 Track 1"
 * - "1:30 Canción 1 - Artista"
 */
export function parseYouTubeChapters(description: string, durationSeconds: number): YouTubeChapter[] {
  if (!description || durationSeconds <= 0) return [];

  const lines = description.split('\n');
  const chapters: YouTubeChapter[] = [];

  // Regex: timestamp (MM:SS or HH:MM:SS) followed by optional separator and title
  const timestampRegex = /^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]?\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(timestampRegex);

    if (match) {
      const timestamp = match[1];
      const title = match[2].trim();

      // Convert timestamp to seconds
      const parts = timestamp.split(':').map(Number);
      let seconds = 0;
      if (parts.length === 3) {
        // HH:MM:SS
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        // MM:SS
        seconds = parts[0] * 60 + parts[1];
      }

      // Skip if timestamp is 0 (first chapter) or if title is empty
      if (seconds > 0 && title) {
        chapters.push({ title, startTime: seconds, endTime: 0 });
      }
    }
  }

  // Sort by startTime
  chapters.sort((a, b) => a.startTime - b.startTime);

  // Calculate endTime for each chapter (next chapter's startTime or video duration)
  for (let i = 0; i < chapters.length; i++) {
    if (i < chapters.length - 1) {
      chapters[i].endTime = chapters[i + 1].startTime;
    } else {
      chapters[i].endTime = durationSeconds;
    }
  }

  return chapters;
}

/**
 * Convert seconds to MM:SS or HH:MM:SS format
 */
export function secondsToTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ===========================================================================
// RC.32 · AGENTE H — VERIFICACIÓN ESTRUCTURAL DEL CANAL OFICIAL
// ===========================================================================
//
// DECISIÓN DEL USUARIO: **solo canal oficial verificado**. No se acepta un
// vídeo de `search`, porque `search` devuelve candidatos no verificables: un
// mashup, una tribute band, un reaction o un canal «topic» autogenerado salen
// igual de bien ordenados que el vídeo oficial, y **nada en la respuesta te lo
// dice**. Con esto, la verificación no es una suposición: es una comparación
// entre lo declarado a mano (`officialDomain`) y lo que el propio canal dice de
// sí mismo en su `description`.
//
// POR QUÉ `channels.list` + `playlistItems.list` Y NO `search.list`
//
//   videos.list        1 unidad
//   channels.list      1 unidad
//   playlistItems.list 1 unidad
//   search.list        bucket aparte: 100 llamadas/día para TODO el proyecto
//
// Un `search` por artista para 5 artistas serían 5 de esas 100, y el resultado
// sería peor: sin verificación estructural. Aquí son 5 unidades de las 10 000
// diarias normales.
//
// LAS TRES PRUEBAS, Y POR QUÉ CADA UNA RECHAZA ALGO DISTINTO
//
//  1. `snippet.type` — un canal «topic» es el que YouTube crea solo, sin que
//     nadie lo reclame. No es el canal del artista: es su catálogo autogenerado.
//     Es el caso que más se cuela, porque el vídeo es el correcto y el canal no.
//  2. El **nombre** del canal tiene que ser el del artista. Una tribute band se
//     llama «Pink Floyd Tribute» y una cuenta falsa se llama «PinkFloydMusic».
//     Aquí se exige igualdad tras normalizar: sin holgura.
//  3. La **descripción** del canal tiene que enlazar al sitio oficial del
//     artista. Esto es lo que separa el canal del artista de una cuenta que se
//     llama igual: solo quien controla el sitio puede escribir ese enlace, y el
//     dominio se compara contra el declarado a mano, no contra una heurística.
//
// Si falla cualquiera: `NO VERIFICADO` con el motivo. No hay presión por llenar.

// ─── Cuota ─────────────────────────────────────────────────────────────────

/**
 * Coste por llamada del API v3, en unidades de cuota. Los números están para
 * que la salida del script pueda **imprimirlos** y el gasto sea auditable en
 * vez de una sorpresa.
 *
 * `search` está aquí solo para dejar constancia de por qué no se usa: son 100
 * unidades de un bucket aparte con límite diario, no 1 unidad de las 10 000.
 */
export const YOUTUBE_QUOTA_COST = {
  channels: 1,
  playlistItems: 1,
  videos: 1,
  search: 100,
} as const;

export type YouTubeQuotaMethod = keyof typeof YOUTUBE_QUOTA_COST;

export interface QuotaCharge {
  method: YouTubeQuotaMethod;
  units: number;
  label: string;
}

export interface QuotaMeter {
  /** Anota una llamada. Devolver el total evita que se pierda en el camino. */
  charge: (method: YouTubeQuotaMethod, label: string) => number;
  readonly spent: number;
  readonly calls: number;
  readonly charges: readonly QuotaCharge[];
}

export function createQuotaMeter(): QuotaMeter {
  const charges: QuotaCharge[] = [];
  let spent = 0;
  return {
    charge(method, label) {
      const units = YOUTUBE_QUOTA_COST[method];
      charges.push({ method, units, label });
      spent += units;
      return spent;
    },
    get spent() {
      return spent;
    },
    get calls() {
      return charges.length;
    },
    get charges() {
      return charges;
    },
  };
}

// ─── Normalización ─────────────────────────────────────────────────────────

/**
 * Reexport del normalizador de `lib/seed-audio.ts`, no una copia. Ver el import
 * de arriba: dos copias que divergen es el fallo que ya costó una vez.
 */
export const normalizeOfficialText = normalizeAudioText;

/**
 * Dominios que aparecen en un texto libre, con `www.` ya eliminado.
 *
 * Sale de la `description` del canal, que es HTML/texto plano escrito por
 * personas: `https://www.pinkfloyd.com/ · pinkfloyd.com/tour · Official:…`.
 * Se filtran los falsos positivos habituales (`i.e`, `1.5`, `track 01`) porque un
 * `includes` tonto aceptaría cualquiera.
 */
export function extractOfficialDomains(text: string | null | undefined): string[] {
  if (typeof text !== 'string' || text.trim() === '') return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const pattern = /(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}/gi;
  for (const match of text.matchAll(pattern)) {
    const host = match[0].toLowerCase().replace(/[.]+$/, '').replace(/^www\./, '');
    const labels = host.split('.');
    // "1.5", "4.5" y "01.02" no son dominios: el último rótulo no es alfabético
    // en el sentido de un TLD real, y aquí no hay nada que verificar contra.
    if (labels.length < 2) continue;
    if (!/[a-z]/.test(labels[labels.length - 1])) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    found.push(host);
  }
  return found;
}

/**
 * ¿El host enlaza al dominio oficial esperado?
 *
 * Se acepta el subdominio (`www.pinkfloyd.com`, `shop.pinkfloyd.com`) porque el
 * sitio oficial lo tiene, y **solo** el subdominio: `pinkfloyd.com.example.tv`
 * termina igual de "en" el dominio y es un registro de otra gente. La
 * comparación va de izquierda a derecha, con el punto delante, precisamente para
 * que ese caso no cuele.
 */
export function domainMatchesOfficial(host: string, officialDomain: string): boolean {
  const h = (host || '').trim().toLowerCase().replace(/^www\./, '').replace(/[.]+$/, '');
  const e = (officialDomain || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/^[.]+/, '')
    .replace(/[.]+$/, '');
  if (!h || !e) return false;
  return h === e || h.endsWith(`.${e}`);
}

/**
 * El nombre del canal tiene que ser el del artista, exacto.
 *
 * Sin holgura y a diferencia de las carátulas, donde un disco mal nombrado
 * sigue siendo el disco: aquí una tolerancia acepta «Pink Floyd Tribute»,
 * «Kraftwerk2K» o «David Bowie (Legendado)». Cuando el nombre no cuadra, el
 * motivo sale en la salida con los dos títulos, para que la decisión se pueda
 * revisar a mano.
 */
export function channelNameMatchesArtist(channelTitle: string, artistName: string): boolean {
  const a = normalizeOfficialText(channelTitle);
  const b = normalizeOfficialText(artistName);
  if (!a || !b) return false;
  return a === b;
}

// ─── Verificación del canal ────────────────────────────────────────────────

/** Lo que se declara a mano por artista, en `scripts/fetch-official-videos.ts`. */
export interface OfficialChannelCandidate {
  artistName: string;
  /** Handle **sin** `@`: `"pinkfloyd"`. */
  handle: string;
  /**
   * Dominio oficial del artista. Se compara contra lo que el canal enlace en su
   * propia descripción; por eso es un dato y no una heurística.
   */
  officialDomain: string;
}

/** Subconjunto de `channels.list?part=snippet,contentDetails,statistics`. */
export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  /** `snippet.type`: `"channel"` para un canal real, `"topic"` para los autogenerados. */
  type: string | null;
  customUrl: string | null;
  uploadsPlaylistId: string | null;
  subscriberCount: number;
  viewCount: number;
  /**
   * RC.33 · Ola 4. En un canal `- Topic` esto es **lo que separa un catálogo de
   * un homónimo vacío**: un canal con `videoCount = 0` existe pero no tiene nada
   * que ofrecer, y sin este campo no había forma de distinguirlo.
   */
  videoCount: number;
}

export type OfficialChannelRejectReason =
  | 'canal-no-encontrado'
  | 'sin-id'
  | 'topic-channel'
  | 'nombre-distinto'
  | 'sin-dominio-oficial'
  | 'dominio-distinto'
  | 'sin-playlist-de-subidas';

export interface OfficialChannelVerification {
  ok: boolean;
  reason: OfficialChannelRejectReason | null;
  /** Por qué, con los datos concretos. Es lo que se imprime en el dry-run. */
  detail: string;
  matchedDomain: string | null;
  /** Dominios que el canal enlaza, para poder revisar la comparación a mano. */
  descriptionDomains: readonly string[];
  channel: YouTubeChannel | null;
  artistName: string;
  handle: string;
  officialDomain: string;
}

function channelReject(
  base: Omit<
    OfficialChannelVerification,
    'ok' | 'reason' | 'detail' | 'matchedDomain' | 'descriptionDomains' | 'channel'
  >,
  reason: OfficialChannelRejectReason,
  detail: string,
  descriptionDomains: readonly string[] = [],
): OfficialChannelVerification {
  return { ...base, ok: false, reason, detail, matchedDomain: null, descriptionDomains, channel: null };
}

/**
 * Verificación ESTRUCTURAL. Pura: recibe lo declarado y lo que devolvió la API, y
 * devuelve el veredicto. No sale a la red, así que `tests/unit/official-videos.test.ts`
 * la ejercita sin gastar cuota.
 *
 * El orden importa: primero lo que descarta de golpe (topic, nombre), después lo
 * caro de explicar (el dominio). Ninguna comprobación se relaja si falla otra.
 */
export function verifyOfficialChannel(
  candidate: OfficialChannelCandidate,
  channel: YouTubeChannel | null | undefined,
): OfficialChannelVerification {
  const base = {
    artistName: candidate.artistName,
    handle: candidate.handle,
    officialDomain: candidate.officialDomain,
  };

  if (!channel) {
    return channelReject(base, 'canal-no-encontrado', `no existe ningún canal con el handle "@${candidate.handle}"`);
  }
  if (!channel.id || channel.id.trim() === '') {
    return channelReject(base, 'sin-id', 'el canal vino sin id');
  }

  // 1. Canal «topic»: autogenerado por YouTube, sin dueño. El vídeo puede ser el
  //    correcto y el canal no lo es.
  if ((channel.type || '').toLowerCase() === 'topic') {
    return channelReject(
      base,
      'topic-channel',
      'es un canal «topic» autogenerado por YouTube, no el canal del artista',
    );
  }

  // 2. El nombre.
  if (!channelNameMatchesArtist(channel.title, candidate.artistName)) {
    return channelReject(
      base,
      'nombre-distinto',
      `el canal se llama "${channel.title}" y el artista es "${candidate.artistName}"`,
    );
  }

  // 3. El dominio, en la descripción del propio canal.
  const domains = extractOfficialDomains(channel.description);
  if (domains.length === 0) {
    return channelReject(
      base,
      'sin-dominio-oficial',
      'la descripción del canal no enlaza a ningún sitio, así que no hay nada que comparar',
      domains,
    );
  }
  const matched = domains.find((d) => domainMatchesOfficial(d, candidate.officialDomain)) ?? null;
  if (!matched) {
    return channelReject(
      base,
      'dominio-distinto',
      `la descripción enlaza a ${domains.join(', ')} y el sitio oficial declarado es ${candidate.officialDomain}`,
      domains,
    );
  }

  // 4. Sin playlist de subidas no hay nada que listar.
  const uploads = (channel.uploadsPlaylistId || '').trim() || buildUploadsPlaylistId(channel.id);
  if (!uploads) {
    return channelReject(
      base,
      'sin-playlist-de-subidas',
      `el canal "${channel.title}" no expone playlist de subidas`,
      domains,
    );
  }

  return {
    ...base,
    ok: true,
    reason: null,
    detail: `canal "${channel.title}" enlaza a ${matched} (esperado ${candidate.officialDomain})`,
    matchedDomain: matched,
    descriptionDomains: domains,
    channel: { ...channel, uploadsPlaylistId: uploads },
  };
}

/**
 * La pestaña de subidas es `UU` + el id del canal sin los dos primeros
 * caracteres (`UC…` → `UU…`). Solo se usa si `contentDetails.uploads` no viene;
 * lo que manda siempre es lo que dice la API.
 */
export function buildUploadsPlaylistId(channelId: string): string | null {
  const id = (channelId || '').trim();
  if (!/^UC[\w-]{22}$/.test(id)) return null;
  return `UU${id.slice(2)}`;
}

// ─── Títulos de vídeo ──────────────────────────────────────────────────────

/**
 * Palabras que son **metadato**, no parte del título: `(Official Video)`,
 * `[HD]`, `(Lyrics)`. Se quitan de los bordes para comparar el título de verdad.
 *
 * Deliberadamente **no** se quitan `remastered`, `explicit`, `version`, ni
 * `(Strings)`: son indications de una grabación distinta. `Stonemilker` contra
 * `Stonemilker (Strings)` tiene que quedar como coincidencia **parcial** y
 * rechazarse, que es justo lo que pasó con los previews de iTunes
 * (`lib/seed-audio.ts:35-40`).
 */
const VIDEO_DECORATION_WORDS = new Set([
  'official',
  'video',
  'audio',
  'music',
  'lyric',
  'lyrics',
  'visualizer',
  'hd',
  'hq',
]);

function isDecorationSegment(segment: string): boolean {
  const words = normalizeOfficialText(segment).split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 3) return false;
  return words.every((w) => VIDEO_DECORATION_WORDS.has(w));
}

/**
 * Quita el metadato de los bordes del título. Un segmento decorado puede ser
 * `"… | Official Video"`, `"… (Official Music Video)"` o `"[HD]"`, y va siempre al
 * final; en la cabeza solo se toca un `Official Video - …`, porque partir por
 * `-` en medio rompe títulos como `"Spider-Man"`.
 */
export function stripVideoDecorations(raw: string): string {
  let text = typeof raw === 'string' ? raw.trim() : '';
  let changed = true;
  while (changed) {
    changed = false;

    const pipe = text.lastIndexOf('|');
    if (pipe > 0 && isDecorationSegment(text.slice(pipe + 1))) {
      text = text.slice(0, pipe);
      changed = true;
      continue;
    }

    for (const [open, close] of [
      ['(', ')'],
      ['[', ']'],
    ] as const) {
      const closeIdx = text.lastIndexOf(close);
      if (closeIdx < 0) continue;
      const head = text.slice(0, closeIdx).trimEnd();
      const openIdx = head.lastIndexOf(open);
      if (openIdx < 0) continue;
      // Solo si el grupo cierra casi al final: "… (Official Video)" sí,
      // "… (Official Video) feat. X" no es un segmento decorado al final.
      if (text.slice(closeIdx + 1).trim() !== '') break;
      if (!isDecorationSegment(text.slice(openIdx + 1, closeIdx))) break;
      text = head.slice(0, openIdx);
      changed = true;
      break;
    }
    if (changed) continue;

    // Cabeza decorada: "Official Video - Song Title".
    const dash = text.search(/\s[-–—]\s/);
    if (dash > 0 && isDecorationSegment(text.slice(0, dash))) {
      const rest = text.slice(dash).replace(/^\s[-–—]\s*/, '').trim();
      if (rest) {
        text = rest;
        changed = true;
      }
    }
  }
  return text.trim();
}

/**
 * Grupo entre paréntesis o corchetes al FINAL del título.
 *
 * Se quita ANTES de normalizar porque `normalizeOfficialText` ya se come la
 * puntuación y convertirlos en espacios los volvería indistinguibles del resto
 * del texto.
 */
const TRAILING_GROUP = /\s*(?:\([^()]*\)|\[[^[\]]*\])\s*$/;

/**
 * ## Qué quita y por qué aquí y no en `VIDEO_DECORATION_WORDS`
 *
 * Un grupo final puede ser **metadato** (`"(Official Video)"`, `"[HD]"`) o el
 * **nombre de otra grabación** (`"Fake Plastic Trees (Acoustic Version)"`,
 * `"(2009 Remaster)"`, `"(Etape 1)"`). `VIDEO_DECORATION_WORDS` solo cubre el
 * primer caso, y esa distinción es deliberada y está fijada por
 * `tests/unit/official-videos.test.ts` ("NO quita marcas de grabación
 * distinta").
 *
 * Aquí el criterio es **otro**: para *emparejar* contra una fila del catálogo,
 * la fila puede traer el sufijo y el vídeo de YouTube no, o al revés. Por eso el
 * recorte del grupo final es una decisión de **emparejamiento**, no de
 * clasificación: se aplica después de `classifyVideoTitle`, que ya decidió qué
 * es el vídeo, y **nunca** se escribe de vuelta en la base de datos.
 *
 * Canónico aquí, no en `lib/lastfm-playcounts.ts`: aquel módulo tenía su copia
 * privada y el mismo recorte hacía falta en los dos sitios. Dos copias que
 * divergen es el fallo que `lib/youtube.ts:8-15` ya documenta para
 * `normalizeAudioText`; la de aquí es la que se importa y la otra se borró.
 */
export function stripTrailingTitleGroups(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  let text = raw;
  for (;;) {
    const next = text.replace(TRAILING_GROUP, '');
    if (next === text) return text.trim();
    text = next;
  }
}

export type OfficialTitleMatch = 'exacto' | 'parcial' | 'distinto';

/**
 * `parcial` existe solo para poder **describir** el descarte
 * (`"Stonemilker"` vs `"Stonemilker (Strings)"`), nunca para aceptarlo: es el
 * mismo criterio de tres estados que `matchAudioTitle`.
 */
export function matchOfficialVideoTitle(videoTitle: string, trackTitle: string): OfficialTitleMatch {
  const a = normalizeOfficialText(stripVideoDecorations(videoTitle));
  const b = normalizeOfficialText(trackTitle);
  if (!a || !b) return 'distinto';
  if (a === b) return 'exacto';
  if (a.includes(b) || b.includes(a)) return 'parcial';
  return 'distinto';
}

// ─── RC.33 · Ola 4 — CLASIFICAR «live», no recortarlo ────────────────────────
//
// `VIDEO_DECORATION_WORDS` recorta `official|video|audio|music|lyric|visualizer|
// hd|hq` porque, con el canal ya verificado, esas palabras **no aportan nada**:
// el canal ya es la prueba. `live` está en la situación contraria.
//
// Si `live` se recortara como el resto, `"Comfortably Numb (Live at Pompeii)"`
// —50 minutos— se emparejaría con `"Comfortably Numb"` y su duración declarada
// por la ficha pasaría a ser la del directo: una **mentira silenciosa**, porque
// el resto del título cuadra y nada señala el error.
//
// Dos tratamientos opuestos, entonces:
//
//   official | video | audio | music | hd   ->  RECORTAR
//   live | live at X | live performance     ->  CLASIFICAR (kind = 'live')
//
// Y `isDecorationSegment` **no** se reutiliza para el caso `live` por diseño:
// exige que *todas* las palabras sean decoración y que sean ≤ 3, así que
// `"live at glastonbury"` no entra — correcto, porque no queremos quitarlo, sino
// marcarlo.

/**
 * Los tres valores de `tracks.video_kind`.
 *
 * - `videoclip`: el canal humano verificado del artista. Es el vídeo que la
 *   ficha quiere mostrar.
 * - `live`: una grabación en directo. Se muestra, pero **no** es la pista del
 *   lanzamiento.
 * - `topic_audio`: el canal `- Topic` autogenerado por YouTube. No hay
 *   videoclip; es el audio del tema.
 */
export type VideoKind = 'videoclip' | 'live' | 'topic_audio';

export interface VideoClassification {
  /**
   * `null` cuando **no se sabe el canal**: el título por sí solo no distingue un
   * videoclip de un audio de `- Topic`, y adivinarlo sería inventar el dato. El
   * que llama pasa `channelIsTopic`.
   */
  kind: VideoKind | null;
  /**
   * Título listo para comparar: decoración recortada y normalizado. En un `live`
   * el marcador **se conserva a propósito** (`"song live at glastonbury"`), que
   * es justo lo que impide que un directo se presente como el tema de estudio.
   */
  normalizedTitle: string;
  /** El motivo, en texto. Es lo que se imprime en el informe del dry-run. */
  reason: string;
  /** `true` si el título lleva marcador de directo. */
  isLive: boolean;
}

/** `\b` con palabra entera: `(Olive)` no es un marcador de directo. */
const LIVE_WORD = /\blive\b/i;

/** Grupo de parentesis o corchetes. Para saber si el marcador va con contexto. */
const BRACKET_GROUP = /[([][^()[\]]*[)\]]/g;

/**
 * El único marcador de directo es la palabra `live`, por palabra entera.
 *
 * Se decide **por palabras clave**, no por posición: `(Live)` a secas y
 * `(Live at Glastonbury)` son ambos `live`, y lo que los diferencia es si el
 * grupo lleva contexto —que va al `reason`, no a la decisión—.
 */
function mentionsLive(raw: string): boolean {
  return LIVE_WORD.test(raw);
}

/** `true` si algún grupo `(…)`/`[…]` contiene la palabra `live` y nada más. */
function hasBareLiveMarker(raw: string): boolean {
  for (const match of raw.matchAll(BRACKET_GROUP)) {
    if (LIVE_WORD.test(match[0]) && normalizeOfficialText(match[0]) === 'live') return true;
  }
  return false;
}

/**
 * Quita el marcador de directo, **solo para comparar**.
 *
 * Sirve para que un directo sea reconocible como la pista que se busca
 * (`"Song (Live at Glastonbury)"` → `"Song"`), no para reescribir nada. Lo que
 * se persiste es `video_kind`, no este título.
 *
 * Dos formas, y solo dos, porque son las que existen en los títulos:
 *
 *  1. Un grupo de paréntesis/corchetes que contiene `live`.
 *  2. Un segmento final delimitado que contiene `live`: `"Song - Live at Wembley"`.
 *
 * `"Live and Let Die - Remastered"` **no** pierde nada: no hay grupo con `live`
 * y el segmento final (`"Remastered"`) no la tiene, así que el texto queda
 * entero. El fallback de `classifyVideoTitle` (que compara antes con la pista)
 * es lo que blinda ese caso.
 */
export function stripLiveMarkers(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  let text = raw.trim();
  if (!text) return '';

  text = text.replace(/[([][^()[\]]*\blive\b[^()[\]]*[)\]]/gi, ' ');

  const tail = text.match(/^([\s\S]*?)\s*(?:[|–—:·/]|\s[-–—]\s)\s*([^|–—:/]*\blive\b[\s\S]*)$/i);
  if (tail && tail[1]) text = tail[1];

  return text
    .replace(/[|–—:·/]+/g, ' ')
    .replace(/\s*[-–—]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clasifica un título de vídeo. **Pura**: sin red, sin `process.env`.
 *
 * `channelIsTopic` es el contexto que el título no da:
 *
 * ```ts
 * classifyVideoTitle("Another Brick in the Wall (Official Video)", "Another Brick in the Wall")
 *   → { kind: 'videoclip', isLive: false, normalizedTitle: 'another brick in the wall' }
 * classifyVideoTitle("Comfortably Numb (Live at Pompeii)", "Comfortably Numb")
 *   → { kind: 'live', isLive: true, normalizedTitle: 'comfortably numb live at pompeii' }
 * classifyVideoTitle("Fake Plastic Trees", "Fake Plastic Trees", { channelIsTopic: true })
 *   → { kind: 'topic_audio', isLive: false, normalizedTitle: 'fake plastic trees' }
 * ```
 *
 * `trackTitle` protege contra el falso positivo obvio: si el título coincide
 * **exacto** con la pista, la palabra `live` es parte del nombre de la obra
 * (`"Live and Let Die"`) y no un marcador de directo. Sin ese corto, se
 * clasificaría como `live` y además se descartaría por título, que es peor.
 */
export function classifyVideoTitle(
  rawTitle: string,
  trackTitle?: string | null,
  options: { channelIsTopic?: boolean } = {},
): VideoClassification {
  const raw = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (!raw) {
    return {
      kind: null,
      normalizedTitle: '',
      reason: 'el vídeo no trae título: no hay nada que clasificar',
      isLive: false,
    };
  }

  const decorated = stripVideoDecorations(raw);
  const normalizedFull = normalizeOfficialText(decorated);
  const normalizedPlain = normalizeOfficialText(stripTrailingTitleGroups(decorated));
  const wanted = normalizeOfficialText(trackTitle ?? null);

  // ⚠️ La coincidencia exacta se mide contra `normalizedFull`, **no** contra
  // `normalizedPlain`. Recortar el grupo final aquí destruiría el detector: el
  // sufijo final de `"Song (Live at Glastonbury)"` es exactamente lo que dice que
  // es un directo, y quitarlo lo convertiría en la grabación de estudio y en
  // `videoclip`. El recorte del grupo final es para *emparejar* (lo hace
  // `stripLiveMarkers` y luego `matchOfficialVideoTitle`), no para decidir qué
  // es el vídeo.
  const exactWithWanted = !!wanted && normalizedFull === wanted;
  const saysLive = mentionsLive(raw);
  const isLive = saysLive && !exactWithWanted;

  let kind: VideoKind | null = null;
  if (isLive) kind = 'live';
  else if (options.channelIsTopic === true) kind = 'topic_audio';
  else if (options.channelIsTopic === false) kind = 'videoclip';

  const strippedDecoration = decorated !== raw;
  const strippedTrailing = stripTrailingTitleGroups(decorated) !== decorated;

  if (isLive) {
    const bare = hasBareLiveMarker(raw);
    const reason = bare
      ? '«(Live)» a secas: no dice qué directo es, pero sigue siendo una grabación en directo. ' +
        'Se CLASIFICA como live y el título NO se recorta — un directo no es el tema del lanzamiento.'
      : 'el título lleva «Live» con contexto: es una grabación en directo. ' +
        'Se CLASIFICA como live y el título NO se recorta.';
    return { kind, normalizedTitle: normalizedFull, reason, isLive: true };
  }

  if (exactWithWanted && saysLive) {
    return {
      kind,
      normalizedTitle: normalizedFull,
      reason:
        'la palabra «Live» forma parte del título de la obra, no es un marcador: ' +
        'coincide exacto con la pista del catálogo y no se clasifica como directo.',
      isLive: false,
    };
  }

  const notes: string[] = [];
  if (strippedDecoration) notes.push('metadato del canal recortado (no aporta: el canal ya está verificado)');
  if (strippedTrailing) notes.push('sufijo de edición recorte solo para comparar');

  if (kind === 'topic_audio') {
    return {
      kind,
      normalizedTitle: normalizedPlain,
      reason:
        'canal «- Topic» autogenerado por YouTube: no hay videoclip, es el audio del tema' +
        (notes.length > 0 ? `. ${notes.join('; ')}` : ''),
      isLive: false,
    };
  }

  if (kind === 'videoclip') {
    return {
      kind,
      normalizedTitle: normalizedPlain,
      reason:
        'canal humano verificado: es el videoclip oficial' +
        (notes.length > 0 ? `. ${notes.join('; ')}` : ''),
      isLive: false,
    };
  }

  return {
    kind: null,
    normalizedTitle: normalizedPlain,
    reason:
      'sin contexto de canal no se puede distinguir un videoclip de un audio de «- Topic»: ' +
      'el título no lo dice y no se inventa.',
    isLive: false,
  };
}

// ─── Verificación HTTP del vídeo ───────────────────────────────────────────

export interface OfficialVideoProbeOk {
  ok: true;
  httpStatus: number;
  /** Título que devuelve el oEmbed del propio YouTube. */
  oembedTitle: string | null;
  detail: string;
}

export interface OfficialVideoProbeFail {
  ok: false;
  httpStatus: number | null;
  detail: string;
}

export type OfficialVideoProbe = OfficialVideoProbeOk | OfficialVideoProbeFail;

/** Inyectable para que los tests no gasten red. */
export type OfficialVideoVerifier = (videoId: string) => Promise<OfficialVideoProbe>;

/**
 * Comprueba que el vídeo existe y se puede embeber, **sin gastar cuota**.
 *
 * Un `GET` a `/watch?v=…` devuelve 200 incluso para un vídeo borrado: YouTube
 * sirve una página de "vídeo no disponible". Por eso no se sirve de ese 200. Se
 * usa el endpoint `oembed`, que sí responde 400/401/404 cuando el vídeo no es
 * embebible o está privado, y se confirma con la página de `embed`.
 */
export async function probeOfficialVideo(
  videoId: string,
  fetcher: typeof fetch = fetch,
): Promise<OfficialVideoProbe> {
  const id = (videoId || '').trim();
  if (!/^[\w-]{11}$/.test(id)) {
    return { ok: false, httpStatus: null, detail: `"${videoId}" no tiene forma de id de YouTube` };
  }

  let oembedStatus: number | null = null;
  try {
    const target = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${id}`,
    )}`;
    const res = await fetcher(target, { redirect: 'follow' });
    oembedStatus = res.status;
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        detail: `oEmbed responde ${res.status}: YouTube no lo ofrece como embebible o ya no existe`,
      };
    }
    const body = (await res.json().catch(() => null)) as { title?: string } | null;
    const title = typeof body?.title === 'string' ? body.title : null;

    const embed = await fetcher(`https://www.youtube.com/embed/${id}`, {
      method: 'HEAD',
      redirect: 'follow',
    });
    if (!embed.ok && embed.status !== 204) {
      return {
        ok: false,
        httpStatus: embed.status,
        detail: `la página de embed responde ${embed.status}`,
      };
    }
    return {
      ok: true,
      httpStatus: embed.status,
      oembedTitle: title,
      detail: `oEmbed ${oembedStatus} y embed ${embed.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: oembedStatus,
      detail: `falló la petición: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ─── Resolución pista → vídeo ──────────────────────────────────────────────

/** Un elemento de `playlistItems.list?part=snippet,contentDetails`. */
export interface OfficialVideoCandidate {
  videoId: string;
  title: string;
  description?: string;
  durationSeconds?: number;
  /** `snippet.videoOwnerChannelId`: quién lo publicó de verdad. */
  videoOwnerChannelId?: string | null;
  publishedAt?: string | null;
}

export interface WantedOfficialVideo {
  /** `tracks.id` */
  id: string;
  title: string;
  artistName: string;
  currentVideoId?: string | null;
  currentEmbedUrl?: string | null;
}

export type OfficialVideoRejectReason =
  | 'canal-no-verificado'
  | 'canal-distinto'
  | 'video-id-distinto'
  | 'titulo-parcial'
  | 'titulo-distinto'
  | 'http-no-verificable';

export interface RejectedOfficialVideo {
  label: string;
  reason: OfficialVideoRejectReason;
  detail: string;
}

export interface OfficialVideoResolution {
  wanted: WantedOfficialVideo;
  chosen: OfficialVideoCandidate | null;
  verified: OfficialVideoProbeOk | null;
  /** Vacío cuando sí se resolvió. */
  reason: string;
  rejected: RejectedOfficialVideo[];
  httpRejected: RejectedOfficialVideo[];
  /** Capítulos **reales** leídos de la descripción del vídeo, si los hay. */
  chapters: YouTubeChapter[];
}

export interface OfficialVideoUpdate {
  id: string;
  youtube_video_id: string;
  video_embed_url: string;
}

export function describeOfficialVideo(candidate: OfficialVideoCandidate): string {
  return `"${candidate.title}" (${candidate.videoId})`;
}

/**
 * Resuelve una pista a UN vídeo. No escribe: devuelve qué se escribiría, con su
 * prueba, o por qué no se resolvió.
 *
 * La primera puerta es el canal: con `channelId` a `null` —es decir, un canal
 * que no superó {@link verifyOfficialChannel}— no se ofrece **nada**, ni aunque
 * el título coincida exactamente. Un vídeo de un canal sin verificar es
 * exactamente lo que esta ola vino a impedir.
 */
export async function resolveOfficialVideo(
  wanted: WantedOfficialVideo,
  candidates: readonly OfficialVideoCandidate[],
  options: {
    channelId: string | null;
    verify?: OfficialVideoVerifier;
    /**
     * RC.33 · Ola 4 — acepta un candidato `live` cuya única diferencia con la
     * pista sea el marcador de directo.
     *
     * Sin esto `"Eclipse (Live from the Los Angeles Sports Arena, 1975)"` es
     * `parcial` contra `"Eclipse"` y la resolución se contradice a sí misma: el
     * enrutador (`routeOfficialVideos`) lo declara apto para showcase y esta
     * función lo rechaza. El valor por defecto es `false`, que es el
     * comportamiento de RC.32 y el que los tests fijan.
     */
    allowLiveRendition?: boolean;
    /**
     * RC.33 · Ola 4 — el vídeo que **eligió** la ruta, que va primero.
     *
     * Sin esto esta función vuelve a ordenar los candidatos por antigüedad y
     * puede devolver **otro** vídeo del que la rutaBridó, que es peor que no
     * devolver ninguno: el informe del dry-run y la fila escrita dirían cosas
     * distintas. Si el preferido no pasa la comprobación HTTP, se prueba el
     * siguiente de la lista, que es el orden de la ruta.
     */
    preferVideoId?: string | null;
  },
): Promise<OfficialVideoResolution> {
  const rejected: RejectedOfficialVideo[] = [];
  const httpRejected: RejectedOfficialVideo[] = [];
  const verify = options.verify ?? probeOfficialVideo;
  const base = { wanted, chosen: null, verified: null, chapters: [] as YouTubeChapter[] };

  if (!options.channelId) {
    return {
      ...base,
      reason: `el canal de "${wanted.artistName}" no superó la verificación: no se ofrece ningún vídeo`,
      rejected,
      httpRejected,
    };
  }

  const viable: OfficialVideoCandidate[] = [];
  for (const candidate of candidates) {
    const label = describeOfficialVideo(candidate);

    if (candidate.videoOwnerChannelId && candidate.videoOwnerChannelId !== options.channelId) {
      rejected.push({
        label,
        reason: 'canal-distinto',
        detail: `lo publicó ${candidate.videoOwnerChannelId}, no ${options.channelId}`,
      });
      continue;
    }
    if (!/^[\w-]{11}$/.test(candidate.videoId)) {
      rejected.push({
        label,
        reason: 'video-id-distinto',
        detail: `"${candidate.videoId}" no tiene forma de id de YouTube`,
      });
      continue;
    }

    // Un directo se compara sin su marcador SOLO cuando quien llama lo ha pedido.
    const isLiveCandidate = options.allowLiveRendition === true && mentionsLive(candidate.title);
    const comparable = isLiveCandidate ? stripLiveMarkers(candidate.title) : candidate.title;

    const title = matchOfficialVideoTitle(comparable, wanted.title);
    if (title === 'parcial') {
      rejected.push({
        label,
        reason: 'titulo-parcial',
        detail: `"${candidate.title}" solo coincide parcialmente con "${wanted.title}" (grabación distinta)`,
      });
      continue;
    }
    if (title === 'distinto') {
      rejected.push({
        label,
        reason: 'titulo-distinto',
        detail: `"${candidate.title}" ≠ "${wanted.title}"`,
      });
      continue;
    }
    viable.push(candidate);
  }

  // A igualdad de título, gana el más antiguo: es el que más se parece a la
  // grabación sembrada, y no el remix que el canal subió hace tres años.
  viable.sort((a, b) => {
    const at = a.publishedAt ?? '';
    const bt = b.publishedAt ?? '';
    if (at && bt && at !== bt) return at < bt ? -1 : 1;
    return 0;
  });

  // El vídeo de la ruta va primero, sin quitar el orden de antigüedad del resto.
  const preferred = (options.preferVideoId ?? '').trim();
  if (preferred) {
    const index = viable.findIndex((candidate) => candidate.videoId === preferred);
    if (index > 0) viable.unshift(...viable.splice(index, 1));
  }

  for (const candidate of viable) {
    const label = describeOfficialVideo(candidate);
    const probe = await verify(candidate.videoId);
    if (!probe.ok) {
      httpRejected.push({ label, reason: 'http-no-verificable', detail: probe.detail });
      continue;
    }
    const chapters = parseYouTubeChapters(candidate.description ?? '', candidate.durationSeconds ?? 0);
    return {
      wanted,
      chosen: candidate,
      verified: probe,
      reason: '',
      rejected,
      httpRejected,
      chapters,
    };
  }

  let reason: string;
  if (candidates.length === 0) {
    reason = 'la playlist de subidas del canal no devolvió ningún vídeo';
  } else if (viable.length === 0) {
    reason = `ningún vídeo pasó la verificación de título exacto (${rejected.length} descartado(s))`;
  } else {
    reason = `los ${viable.length} vídeo(s) con título exacto no pasaron la comprobación HTTP`;
  }
  return { ...base, reason, rejected, httpRejected };
}

/**
 * `start_time`/`end_time` desde capítulos **reales** de la descripción del vídeo.
 *
 * Devuelve `null` salvo que haya un capítulo cuyo título coincida exactamente. La
 * razón es que los timestamps que hay hoy en la tabla son inventados: derivan de
 * la duración del álbum, no de ningún vídeo (`tests/unit/seed-integrity.test.ts:18-21`
 * — "Todo lo que hay aquí lee el catálogo del propio archivo, no la base de datos").
 * Un capítulo real es la única fuente aceptable, y aun así se **informa**, no se
 * escribe: cambiar `start_time`/`end_time` afecta al salto del reproductor.
 */
export function deriveChapterTiming(
  chapters: readonly YouTubeChapter[],
  trackTitle: string,
  videoDurationSeconds: number,
): { startTime: number; endTime: number } | null {
  if (!Array.isArray(chapters) || chapters.length === 0) return null;
  if (!(videoDurationSeconds > 0)) return null;
  for (const chapter of chapters) {
    if (matchOfficialVideoTitle(chapter.title, trackTitle) !== 'exacto') continue;
    const startTime = chapter.startTime;
    const endTime = chapter.endTime;
    if (!(startTime > 0)) continue;
    if (!(endTime > startTime)) continue;
    if (endTime > videoDurationSeconds) continue;
    return { startTime, endTime };
  }
  return null;
}

/** `video_embed_url` con la misma forma que ya usan las 6 filas del catálogo. */
export function buildOfficialVideoEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** La fila a escribir, o `null` si no hay nada verificado que escribir. */
export function buildOfficialVideoUpdate(
  resolution: OfficialVideoResolution,
): OfficialVideoUpdate | null {
  const { wanted, chosen, verified } = resolution;
  if (!chosen || !verified) return null;
  return {
    id: wanted.id,
    youtube_video_id: chosen.videoId,
    video_embed_url: buildOfficialVideoEmbedUrl(chosen.videoId),
  };
}

/** Solo lo verificado, y solo lo que **cambia**: si no, el recuento miente. */
export function selectOfficialVideoUpdates(
  resolutions: readonly OfficialVideoResolution[],
): OfficialVideoUpdate[] {
  const updates: OfficialVideoUpdate[] = [];
  for (const resolution of resolutions) {
    const update = buildOfficialVideoUpdate(resolution);
    if (!update) continue;
    const currentId = (resolution.wanted.currentVideoId ?? '').trim();
    const currentUrl = (resolution.wanted.currentEmbedUrl ?? '').trim();
    if (currentId === update.youtube_video_id && currentUrl === update.video_embed_url) continue;
    updates.push(update);
  }
  return updates;
}

// ─── RC.33 · Ola 4 — el canal «- Topic» y las dos rutas ─────────────────────

/** Los tres valores admitidos, para validar lo que venga de la base de datos. */
export const VIDEO_KINDS: readonly VideoKind[] = ['videoclip', 'live', 'topic_audio'];

/**
 * Un `video_kind` desconocido o ausente **no rompe nada**: se trata como `null`,
 * que es "no lo sabemos". Es la misma política que `madeForKids: null` en
 * `YouTubeVideo`: la ausencia se propaga, no se rellena con un valor inventado.
 */
export function parseVideoKind(raw: unknown): VideoKind | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return (VIDEO_KINDS as readonly string[]).includes(value) ? (value as VideoKind) : null;
}

/**
 * ¿El nombre del canal es `<artista> - Topic`?
 *
 * **Sin distinción de mayúsculas**, y no por comodidad: los tres canales
 * verificados traen la caja que les dio YouTube, y son tres casos distintos —
 * `"PINK FLOYD - Topic"` en mayúsculas, `"Radiohead - Topic"` en title case y
 * `"Kraftwerk - Topic"`. Un `===` fallaría en dos de tres y el script
 * descartaría el audio de un artista que sí lo tiene.
 *
 * Se comparan ambos lados con `normalizeOfficialText`, así que `"Björk"` y
 * `"BJORK"` también casan, y una tribute con sufijo (`"Pink Floyd Tribute -
 * Topic"`) no cuela: sobra texto en el medio.
 */
export function isTopicChannelTitle(channelTitle: string, artistName: string): boolean {
  const title = normalizeOfficialText(channelTitle);
  const artist = normalizeOfficialText(artistName);
  if (!title || !artist) return false;
  return title === `${artist} topic`;
}

/** La consulta de `search.list?type=channel` para encontrar el canal de un artista. */
export function topicChannelQuery(artistName: string): string {
  return `${(artistName || '').trim()} - Topic`;
}

/**
 * Quita los vídeos repetidos por `videoId`, **conservando el primero**.
 *
 * `playlistItems.list` devuelve el mismo vídeo dos veces: se comprobó con
 * `"You And Whose Army?"`, que aparecía repetido dentro de la misma playlist de
 * subidas. Sin esto, el mismo vídeo entra dos veces como candidato y la decisión
 * no sabe cuál de los dos es "el" candidato; con esto, la lista de candidatos
 * tiene un vídeo por fila.
 */
export function dedupeVideoCandidates(
  candidates: readonly OfficialVideoCandidate[],
): OfficialVideoCandidate[] {
  const seen = new Set<string>();
  const unique: OfficialVideoCandidate[] = [];
  for (const candidate of candidates) {
    const id = typeof candidate?.videoId === 'string' ? candidate.videoId : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(candidate);
  }
  return unique;
}

/**
 * Qué ruta decide qué vídeo.
 *
 * - `showcase` — lo que la ficha **muestra**: los tres. Un directo es contenido
 *   válido para una sección «En vivo».
 * - `playback` — lo que el reproductor **usa**: `videoclip` y `topic_audio`.
* El directo se queda fuera a propósito: un directo no es el tema del
 *   lanzamiento, y colgarlo al play sería el mismo error de duración que
 *   motivó clasificar `live` en vez de recortarlo.
 */
export type OfficialVideoRoute = 'showcase' | 'playback';

/** El orden de preferencia de cada ruta. Es la decisión, en un sitio. */
export const OFFICIAL_VIDEO_ROUTE_ORDER: Record<OfficialVideoRoute, readonly VideoKind[]> = {
  showcase: ['videoclip', 'live', 'topic_audio'],
  playback: ['videoclip', 'topic_audio'],
};

export interface OfficialVideoOption {
  candidate: OfficialVideoCandidate;
  classification: VideoClassification;
  /** Con qué confianza encaja el título. `parcial` no entra en la ruta. */
  titleMatch: OfficialTitleMatch;
  /** Posición en el orden de la ruta. `0` es la primera. */
  rank: number;
}

export interface SkippedOfficialVideo {
  label: string;
  kind: VideoKind | null;
  reason: string;
}

export interface OfficialVideoRouting {
  route: OfficialVideoRoute;
  kind: VideoKind | null;
  chosen: OfficialVideoCandidate | null;
  chosenOption: OfficialVideoOption | null;
  /** Los que sirven para esta ruta, ya ordenados. */
  options: OfficialVideoOption[];
  /** Los que se quedaron fuera, con el motivo. Para el informe del dry-run. */
  skipped: SkippedOfficialVideo[];
  /**
   * Candidatos cuyo título coincide **algo** (`parcial`), no nada. Es el número
   * que dice "de esta pista hay un vídeo parecido pero es otra grabación": lo
   * que separa "el catálogo no tiene vídeo" de "tenía uno y era el equivocado",
   * que con 1483 vídeos contra ~40 pistas es la diferencia entre revisar y no
   * revisar.
   */
  nearMisses: number;
  /** Vacío cuando sí hay elegido. */
  reason: string;
}

/**
 * La decisión pista → vídeo, por ruta. **Pura**: recibe candidatos ya traídos y
 * devuelve cuál va en cada uso. No red, no SQL, no escritura.
 *
 * La UI de la Ola 4 solo tiene que leer esto: no tiene que reimplementar la
 * preferencia ni el por qué de cada descarte.
 *
 * Para un candidato `live` la comparación de título va contra
 * `stripLiveMarkers(candidate.title)`: `"Song (Live at Glastonbury)"` **sí** es
 * una versión de `"Song"`, y sin eso un directo nunca podría ganar en la ruta de
 * showcase. El recorte es solo para comparar; lo que se persiste es el
 * `video_kind`, nunca el título recortado.
 */
export function routeOfficialVideos(
  candidates: readonly OfficialVideoCandidate[],
  trackTitle: string,
  options: { channelIsTopic: boolean; route: OfficialVideoRoute },
): OfficialVideoRouting {
  const order = OFFICIAL_VIDEO_ROUTE_ORDER[options.route];
  const base: OfficialVideoRouting = {
    route: options.route,
    kind: null,
    chosen: null,
    chosenOption: null,
    options: [],
    skipped: [],
    nearMisses: 0,
    reason: '',
  };

  const unique = dedupeVideoCandidates(candidates);
  if (unique.length === 0) {
    return { ...base, reason: 'no llegó ningún vídeo del canal' };
  }

  const optionsList: OfficialVideoOption[] = [];
  const skipped: SkippedOfficialVideo[] = [];
  let nearMisses = 0;

  for (const candidate of unique) {
    const label = describeOfficialVideo(candidate);
    if (!/^[\w-]{11}$/.test(candidate.videoId)) {
      skipped.push({
        label,
        kind: null,
        reason: `"${candidate.videoId}" no tiene forma de id de YouTube`,
      });
      continue;
    }

    const classification = classifyVideoTitle(candidate.title, trackTitle, {
      channelIsTopic: options.channelIsTopic,
    });
    const comparableTitle =
      classification.isLive ? stripLiveMarkers(candidate.title) : candidate.title;
    const titleMatch = matchOfficialVideoTitle(comparableTitle, trackTitle);

    if (titleMatch !== 'exacto') {
      if (titleMatch === 'parcial') nearMisses++;
      skipped.push({
        label,
        kind: classification.kind,
        reason:
          titleMatch === 'parcial'
            ? `«${candidate.title}» solo coincide parcialmente con «${trackTitle}»: es otra grabación`
            : `«${candidate.title}» ≠ «${trackTitle}»`,
      });
      continue;
    }

    const rank = classification.kind === null ? -1 : order.indexOf(classification.kind);
    if (rank < 0) {
      skipped.push({
        label,
        kind: classification.kind,
        reason:
          `clasificado como ${classification.kind ?? "sin kind"}, que no está en la ruta ` +
          `"${options.route}" (${order.join(' → ')})`,
      });
      continue;
    }

    optionsList.push({ candidate, classification, titleMatch, rank });
  }

  // Mismo criterio de desempate que `resolveOfficialVideo`: a igualdad de kind y
  // de título, gana el más antiguo. Es el que más se parece a la grabación
  // sembrada y no el remix que el canal subió hace tres años.
  optionsList.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const at = a.candidate.publishedAt ?? '';
    const bt = b.candidate.publishedAt ?? '';
    if (at && bt && at !== bt) return at < bt ? -1 : 1;
    return 0;
  });

  const chosenOption = optionsList[0] ?? null;
  if (!chosenOption) {
    return {
      ...base,
      skipped,
      nearMisses,
      reason:
        skipped.length === 0
          ? 'ningún vídeo encajó con el título exacto'
          : `ningún vídeo encajó con el título exacto (${skipped.length} descartado(s))`,
    };
  }

  return {
    route: options.route,
    kind: chosenOption.classification.kind,
    chosen: chosenOption.candidate,
    chosenOption,
    options: optionsList,
    skipped,
    nearMisses,
    reason: '',
  };
}

/**
 * Consumo **estimado** antes de gastar nada, para que el número salga impreso y
 * no como sorpresa al final.
 *
 * `search.list` son 100 unidades de un bucket aparte (100 llamadas/día para
 * todo el proyecto), así que va aparte en el desglose: por eso el script no las
 * gasta por defecto y usa `lib/official-channels.ts`, que ya está verificado.
 */
export function estimateOfficialQuota(plan: {
  artists: number;
  playlistPages: number;
  topicSearches: number;
}): QuotaEstimate {
  const channels = Math.max(0, plan.artists);
  const pages = Math.max(0, plan.artists) * Math.max(0, plan.playlistPages);
  const searches = Math.max(0, plan.topicSearches);
  const playlistItems = pages;
  return {
    channels,
    playlistItems,
    searches,
    total:
      channels * YOUTUBE_QUOTA_COST.channels +
      playlistItems * YOUTUBE_QUOTA_COST.playlistItems +
      searches * YOUTUBE_QUOTA_COST.search,
  };
}

export interface QuotaEstimate {
  channels: number;
  playlistItems: number;
  searches: number;
  /** Unidades totales de las 10 000 diarias. `search` incluida. */
  total: number;
}

// ─── Política de embed (Made For Kids) ──────────────────────────────────────

/**
 * Las YouTube API Services Developer Policies exigen comprobar el flag **Made
 * For Kids** de cada vídeo embebido. Aquí no lo comprueba nadie, y el reproductor
 * (`lib/youtube-player.ts:118-148`) monta el iframe 1×1 con `opacity:0` y
 * `zIndex:-1`, donde el aviso del player no se ve.
 *
 * Estas dos funciones solo **exponen** el dato. La decisión de qué hacer con él
 * es de otro fichero y de otra ola: publicarla aquí la deja explícita en vez de
 * cerrada en silencio.
 */
export function needsMadeForKidsDisclosure(video: {
  madeForKids?: boolean | null;
  selfDeclaredMadeForKids?: boolean | null;
}): boolean {
  return video.madeForKids === true || video.selfDeclaredMadeForKids === true;
}

/** ¿Se puede embeber sin que el usuario lo note de forma indebida? */
export function isVideoEmbedAllowed(video: {
  embeddable?: boolean | null;
  privacyStatus?: string | null;
}): boolean {
  if (video.embeddable === false) return false;
  const status = (video.privacyStatus ?? '').trim().toLowerCase();
  if (status === 'private') return false;
  return true;
}


