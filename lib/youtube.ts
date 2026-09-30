import {
  classifyUpstreamStatus,
  integrationFailure,
  integrationSuccess,
  type IntegrationReason,
  type IntegrationResult,
} from './integration-reasons';

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
