/**
 * Precedencia de fuentes de audio, elegibilidad de CORS y estado de cola.
 *
 * Este módulo es deliberadamente **puro** (sin React, sin DOM, sin `window`):
 * es lo único que la cola puede testear en `tests/unit/`, que corre con
 * `environment: "node"`. Todo lo que necesita DOM vive en
 * `context/AudioPlayerContext.tsx`.
 *
 * Los ids se extraen **solo** desde `./youtube` (fuente única). Antes había
 * regex duplicadas y divergentes en los dos ficheros: `[\w-]+` vs `[\w-]{22}`
 * para Spotify y `song/` vs `album/|song/` para Apple Music, así que la misma
 * URL podía dar fuente en un sitio y ninguna en el otro.
 */
import {
  extractAppleMusicId,
  extractSpotifyId,
  getAppleMusicEmbedUrl,
  getSpotifyEmbedUrl,
} from './youtube';

export type AudioSourceType = 'preview' | 'spotify' | 'apple_music' | 'youtube';

export interface AudioSource {
  type: AudioSourceType;
  url: string;
  /** Solo informativo: la UI no renderiza embeds de terceros, hace link-out. */
  embedUrl?: string;
  videoId?: string;
  priority: number;
  label: string;
}

export interface TrackAudioInfo {
  audio_preview_url?: string | null;
  spotify_url?: string | null;
  apple_music_url?: string | null;
  youtube_video_id?: string | null;
  youtube_url?: string | null;
  external_links?: Record<string, unknown> | null;
}

/**
 * Tokens que la capa de datos deja en una columna de URL cuando no hay valor.
 *
 * OJO con `"—"`: `lib/db.ts` pasa las filas por `safeString()`, que convierte
 * `""`/`null` en el **guion largo** `"—"`, y ese string es *truthy*. Un
 * `if (url)` NO filtra nada — que es como `EPKCard` acababa diciendo
 * "Reproducir" en vez de "No hay audio disponible".
 *
 * Es una guarda **redundante** a propósito: los tokens son el contrato real
 * (lo que la DB emite) y el filtro de forma de URL es la segunda red. Se
 * comprueban los dos porque el segundo es el que de verdad atrapa basura como
 * `"Reproducir"` o `"ver en YouTube"`, y el primero es el que documenta el
 * motivo. Quitar cualquiera de los dos no rompe los tests: por eso el test
 * aserta la **propiedad** (una pista sin URL real no tiene fuente reproducible),
 * no la existencia del set.
 */
export const EMPTY_AUDIO_URL_TOKENS: ReadonlySet<string> = new Set([
  '',
  '-',
  '–',
  '—',
  'n/a',
  'N/A',
  'null',
  'undefined',
]);

/** ¿Es una URL que el `<audio>` puede abrir de verdad? */
export function isUsableAudioUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (EMPTY_AUDIO_URL_TOKENS.has(trimmed)) return false;
  return /^(https?:\/\/|\/|\.{1,2}\/|blob:|data:)/i.test(trimmed);
}

/**
 * Precedencia real, no la que parecía:
 * `preview` (100) > `spotify` (90) = `apple_music` (90) > `youtube` (50).
 * Los dos de 90 se desempatan por **orden de inserción** (Spotify se empuja
 * antes), no por una comparación que hoy depende de que `Array.sort` sea
 * estable: se hace explícito en `getAudioSources` para que no dependa del
 * comportamiento del runtime.
 */
export const AUDIO_SOURCE_PRIORITY: Record<AudioSourceType, number> = {
  preview: 100,
  spotify: 90,
  apple_music: 90,
  youtube: 50,
};

function getAudioSources(track: TrackAudioInfo | null | undefined): AudioSource[] {
  if (!track) return [];
  const sources: AudioSource[] = [];
  const external = track.external_links ?? undefined;

  // 1. Preview directo (iTunes/Spotify 30s) — MÁXIMA PRIORIDAD
  if (isUsableAudioUrl(track.audio_preview_url)) {
    sources.push({
      type: 'preview',
      url: track.audio_preview_url as string,
      priority: AUDIO_SOURCE_PRIORITY.preview,
      label: 'Preview (30s)',
    });
  }

  // 2. Spotify = Apple Music (mismo nivel) — PRIORIDAD ALTA
  const spotifyUrl = typeof track.spotify_url === 'string' && track.spotify_url
    ? track.spotify_url
    : typeof external?.spotify === 'string' ? (external.spotify as string) : null;
  const spotifyId = spotifyUrl ? extractSpotifyId(spotifyUrl) : null;

  if (spotifyId) {
    sources.push({
      type: 'spotify',
      url: spotifyUrl || `https://open.spotify.com/track/${spotifyId}`,
      embedUrl: getSpotifyEmbedUrl(spotifyId),
      priority: AUDIO_SOURCE_PRIORITY.spotify,
      label: 'Spotify',
    });
  }

  const appleUrl = typeof track.apple_music_url === 'string' && track.apple_music_url
    ? track.apple_music_url
    : typeof external?.apple_music === 'string' ? (external.apple_music as string) : null;
  const appleMusicId = appleUrl ? extractAppleMusicId(appleUrl) : null;

  if (appleMusicId) {
    sources.push({
      type: 'apple_music',
      url: appleUrl || `https://music.apple.com/song/${appleMusicId}`,
      embedUrl: getAppleMusicEmbedUrl(appleMusicId),
      priority: AUDIO_SOURCE_PRIORITY.apple_music,
      label: 'Apple Music',
    });
  }

  // 3. YouTube iframe embed — MENOR PRIORIDAD
  const youtubeId = track.youtube_video_id
    || (typeof external?.youtube_video_id === 'string' ? (external.youtube_video_id as string) : null);
  if (youtubeId && youtubeId.trim() !== '') {
    const id = youtubeId.trim();
    const origin = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://epk-dashboard.vercel.app';
    sources.push({
      type: 'youtube',
      url: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube.com/embed/${id}?autoplay=0&enablejsapi=1&origin=${encodeURIComponent(origin)}`,
      videoId: id,
      priority: AUDIO_SOURCE_PRIORITY.youtube,
      label: 'YouTube',
    });
  }

  // Ordenar por prioridad descendente, con orden deinsertion como desempate
  // explícito (antes dependía de la estabilidad de `sort`).
  return sources
    .map((source, order) => ({ source, order }))
    .sort((a, b) => (b.source.priority - a.source.priority) || (a.order - b.order))
    .map((entry) => entry.source);
}

export { getAudioSources };

/**
 * ¿Esta fuente se puede reproducir en el reproductor global?
 *
 * `preview` (archivo directo) y `youtube` (IFrame API) sí. `spotify` y
 * `apple_music` **no**: sus `embedUrl` se construyen pero ninguna vista los
 * renderiza — solo hay link-out — así que contarlas como "reproducible" es lo
 * que hace que un botón de play aparezca activo y no haga nada.
 */
export function isPlayableAudioSource(source: AudioSource): boolean {
  if (source.type === 'preview') return isUsableAudioUrl(source.url);
  if (source.type === 'youtube') return Boolean(source.videoId && source.videoId.trim() !== '');
  return false;
}

export function getPlayableAudioSource(track: TrackAudioInfo | null | undefined): AudioSource | null {
  return getAudioSources(track).find(isPlayableAudioSource) ?? null;
}

/**
 * CONTRATO PÚBLICO (D2 → tarjetas): desde una fila de catálogo, ¿hay algo que
 * pulsar? No pregunta "¿tiene links?", pregunta "¿suena algo?".
 */
export function hasPlayableSource(track: TrackAudioInfo | null | undefined): boolean {
  return getPlayableAudioSource(track) !== null;
}

export function getPrimaryAudioSource(track: TrackAudioInfo): AudioSource | null {
  return getAudioSources(track)[0] || null;
}

export function getAudioSourceByType(track: TrackAudioInfo, type: AudioSourceType): AudioSource | null {
  return getAudioSources(track).find((s) => s.type === type) || null;
}

/** Tiene alguna fuente de streaming/link (incluye no reproducible). */
export function hasStreamingSource(track: TrackAudioInfo): boolean {
  return getAudioSources(track).some((s) => s.type === 'spotify' || s.type === 'apple_music' || s.type === 'preview');
}

export function isYouTubeOnly(track: TrackAudioInfo): boolean {
  const sources = getAudioSources(track);
  return sources.length > 0 && sources.every((s) => s.type === 'youtube');
}

// ---------------------------------------------------------------------------
// crossOrigin condicional — MEDIDO, no supuesto
// ---------------------------------------------------------------------------
//
// `crossOrigin="anonymous"` es obligatorio para que `createMediaElementSource()`
// conecte al `AnalyserNode` (`lib/web-audio.ts:71`); sin él el visualizador cae
// a frecuencias sintéticas (`AI_LOG.md:3077-3095`). Pero el atributo hace que
// el navegador exija `Access-Control-Allow-Origin` en el host, y si no llega,
// `play()` rechaza (que era el "archivo no disponible" de `AI_LOG.md:1268`).
//
// MEDICIÓN (2026-09-30, `curl -I` con `Origin: https://epk-dashboard.vercel.app`):
//
//   audio-ssl.itunes.apple.com  -> HTTP/1.1 200 OK
//     Access-Control-Allow-Origin: *
//     Access-Control-Allow-Headers: range
//     Accept-Ranges: bytes
//     Content-Type: audio/x-m4p
//
// Conclusión: **el CDN de iTunes SÍ manda ACAO**, también en sus 404. El
// arreglo de `AI_LOG.md:1268` no arreglaba un problema de CORS. La 404 que sí
// falla hoy viene de las URLs del seed (caducan), no de las cabeceras — eso se
// reporta aparte, no se tapa aquí.
//
// La regla que queda: `crossOrigin` solo para hosts **medidos** que lo mandan
// (más lo mismo-origen, que siempre lo puede). Cualquier otro tercero
// reproduce sin atributo y el visualizador degrada a sintético. Perder barras
// es visible y degradable; perder el audio no.
/** Hosts verificados con `Access-Control-Allow-Origin` (ver la medición arriba). */
export const CORS_VERIFIED_AUDIO_HOSTS: readonly string[] = ['audio-ssl.itunes.apple.com'];

export function shouldUseCrossOrigin(url: string | null | undefined): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed === '') return false;

  // Mismo origen, rutas relativas y objetos locales: nunca hace falta CORS.
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return true;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return true;

  let hostname: string;
  try {
    hostname = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return false;
  }
  return CORS_VERIFIED_AUDIO_HOSTS.includes(hostname);
}

// ---------------------------------------------------------------------------
// Cola — estado puro, sin DOM
// ---------------------------------------------------------------------------

/**
 * Subconjunto de `ActiveTrack` que la cola necesita. Estructuralmente
 * compatible con `ActiveTrack`, así que el contexto pasa sus tracks sin cast.
 */
export interface QueueTrack {
  id: string;
  audioUrl?: string;
  isYouTube?: boolean;
  youtubeVideoId?: string | null;
}

export interface QueueState {
  items: QueueTrack[];
  /** Índice de la pista en curso. Siempre una pista reproducible. */
  index: number;
}

/**
 * ¿Esta entrada de la cola se puede reproducir?
 * YouTube necesita `youtubeVideoId`; HTML5 necesita una URL que no sea token
 * de vacío. Sin esto, `next()` aterrizaría en una pista muda.
 */
export function isQueueItemPlayable(item: QueueTrack | null | undefined): boolean {
  if (!item) return false;
  if (item.isYouTube === true) return typeof item.youtubeVideoId === 'string' && item.youtubeVideoId.trim() !== '';
  return isUsableAudioUrl(item.audioUrl);
}

/** Primer índice reproducible desde `fromIndex` en la dirección `step`. `-1` si no hay. */
export function findPlayableIndex(items: QueueTrack[], fromIndex: number, step: 1 | -1): number {
  if (!Array.isArray(items) || items.length === 0) return -1;
  for (let i = fromIndex; i >= 0 && i < items.length; i += step) {
    if (isQueueItemPlayable(items[i])) return i;
  }
  return -1;
}

/**
 * Monta la cola.
 * - `startIndex` fuera de rango se recorta.
 * - Si lo que hay en `startIndex` no es reproducible, se busca el siguiente
 *   reproducible hacia delante y, si no hay, hacia atrás.
 * - `null` = no hay nada reproducible: `playQueue` no debe tocar la reproducción.
 */
export function createQueue(items: QueueTrack[], startIndex = 0): QueueState | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const clamped = Number.isFinite(startIndex)
    ? Math.min(items.length - 1, Math.max(0, Math.trunc(startIndex)))
    : 0;

  let index = clamped;
  if (!isQueueItemPlayable(items[index])) {
    const forward = findPlayableIndex(items, clamped, 1);
    const backward = forward === -1 ? findPlayableIndex(items, clamped - 1, -1) : -1;
    index = forward !== -1 ? forward : backward;
  }

  if (index === -1) return null;
  return { items, index };
}

/** Índice de la siguiente reproducible, o el propio índice si la cola se acabó. */
export function nextQueueIndex(state: QueueState | null): number {
  if (!state) return -1;
  const found = findPlayableIndex(state.items, state.index + 1, 1);
  return found === -1 ? state.index : found;
}

/** Igual que `nextQueueIndex` pero hacia atrás. En el borde devuelve el índice actual. */
export function prevQueueIndex(state: QueueState | null): number {
  if (!state) return -1;
  const found = findPlayableIndex(state.items, state.index - 1, -1);
  return found === -1 ? state.index : found;
}

export function hasNextInQueue(state: QueueState | null): boolean {
  return !!state && nextQueueIndex(state) !== state.index;
}

export function hasPrevInQueue(state: QueueState | null): boolean {
  return !!state && prevQueueIndex(state) !== state.index;
}

/**
 * Avance al terminar una pista.
 *
 * Devuelve el nuevo estado, o `null` cuando **la cola se acabó** — y ahí el
 * contexto para, no reinicia. Reiniciar sola convertiría un release en un bucle
 * infinito silencioso que el usuario no pidió; parar deja claro que se acabó.
 *
 * Las pistas no reproducibles se saltan solas.
 */
export function advanceQueue(state: QueueState | null): QueueState | null {
  if (!state) return null;
  const index = nextQueueIndex(state);
  if (index === state.index) return null;
  return { items: state.items, index };
}

/**
 * Cambiar de pista a mitad de una cola: si la pista ya estaba en la cola, el
 * índice se mueve ahí y **el resto se conserva**; si no, la cola pasa a ser
 * esa pista sola.
 *
 * Recibe la pista entera, no su id: la rama de "no estaba" necesita su `audioUrl`
 * para saber si es reproducible (con solo el id siempre saldría muda).
 */
export function reindexQueue(state: QueueState | null, track: QueueTrack): QueueState | null {
  if (state) {
    const existing = state.items.findIndex((item) => item.id === track.id);
    if (existing !== -1) return { items: state.items, index: existing };
  }
  return createQueue([track], 0);
}

/** "3/12" para la UI del reproductor global. */
export function queuePositionLabel(state: QueueState | null): string {
  if (!state || state.items.length === 0) return '';
  return `${state.index + 1}/${state.items.length}`;
}
