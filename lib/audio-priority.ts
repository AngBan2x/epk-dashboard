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

// ---------------------------------------------------------------------------
// Dos espacios de coordenadas que compartían dos columnas  (RC.32 · agente B)
// ---------------------------------------------------------------------------
//
// `tracks.start_time` / `tracks.end_time` describen **un offset dentro de un
// vídeo**: son los capítulos del álbum. `tracks.audio_preview_url` describe **un
// fichero de audio independiente de 30 s**. Durante años las dos cosas viajaron
// por las mismas columnas y el reproductor no las distinguía, así que una pista
// con preview de iTunes sonar 30 s y llevar `end_time = 501` (la duración total
// del release) encima.
//
// Verificado en Turso: 63 pistas reproducibles, **55 con `end_time > 30`** y 49
// con `start_time > 0`. Esos valores no son transcripciones de capítulos:
// `tests/unit/seed-integrity.test.ts:18-21` dice que el seed "lee el catálogo del
// propio archivo, no la base de datos", o sea que son **duración acumulada**
// inventada. Y **ninguna** de las 65 hijas tiene `youtube_video_id`: los
// timestamps apuntan a un vídeo que no existe.
//
// La regla que sale de ahí es una sola y no se negocia:
//
//   **Los timestamps de capítulo SOLO aplican a un vídeo. Si el medio que suena
//   es un fichero independiente (un preview), no aplican: se descartan de la
//   pista activa, no se "dejan ganar" a la etiqueta.**
//
// Descartarlos de verdad y no solo dejar que `duration` gane importa porque el
// scrubber también los leía: con `min=265, max=501` y `currentTime=8`, el valor
// del `input[type=range]` era 265 mientras la etiqueta decía 0:08, y arrastrar
// hacía `seek()` → `audio.currentTime = 265` en un fichero de 30 s → `ended` →
// **salto de pista**.

/** Tope de un segmento. El preview de iTunes/Spotify dura 30 s. */
export const PREVIEW_MAX_SEGMENT_SECONDS = 30;

export type ChapterSegmentIssueCode = 'NON_FINITE' | 'NEGATIVE' | 'INVERTED' | 'TOO_LONG';

export interface ChapterSegmentIssue {
  code: ChapterSegmentIssueCode;
  /** Qué está mal, en una frase. Va directo a la UI. */
  message: string;
  /**
   * Qué hay que hacer con los timestamps cuando aparece este problema.
   * Siempre `"drop"`: ningún dato dudoso llega al reproductor, porque el
   * síntoma de un timestamp inventado (perder la pista) es peor que el de un
   * timestamp ausente (suena del principio a fin).
   */
  action: 'drop';
}

export interface ChapterSegment {
  /** `true` si se declaró algo (start o end distinto de `null`/no finito/0). */
  declared: boolean;
  /** `true` si el segmento se puede usar tal cual, o si no declaró nada. */
  usable: boolean;
  /** Inicio saneado (>= 0). 0 si no hay segmento. */
  start: number;
  /**
   * Fin saneado. `0` significa **"hasta el final del medio"**, no "sin fin":
   * es lo que corresponde a un capítulo con `start_time` y `end_time` a null.
   */
  end: number;
  /** Longitud del segmento en segundos; `0` si el final es abierto o no hay segmento. */
  length: number;
  issues: ChapterSegmentIssue[];
  /** Aviso agregado para la UI. `""` si no hay nada que avisar. */
  warning: string;
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * CONTRATO PÚBLICO (RC.32, tarea 6 del usuario) — el validador de segmentos.
 *
 * ## Qué valida
 *
 * 1. `start` y `end` finitos y `>= 0` (los timestamps del seed son inventados,
 *    pero la columna es editable desde el formulario de release).
 * 2. `end > start` cuando **los dos** son distintos de 0.
 * 3. `end - start <= maxSeconds` (30 s por defecto).
 *
 * ## Por qué devuelve un objeto y no un `boolean`
 *
 * Porque la UI necesita **distinguir** "no declaraste nada" (normal, no hay nada
 * que avisar) de "declaraste algo que no vale" (hay que avisar). Un
 * `zod.boolean()` en el servidor no distingue eso, y esta función es la que el
 * agente A replica en el schema.
 *
 * ## Receta equivalente en Zod (`app/api/releases/route.ts`, propiedad de otro
 * ## agente — no se edita aquí, solo se publica el contrato)
 *
 * ```ts
 * const chapterSegment = z.object({
 *   start_time: z.number().min(0, 'start_time no puede ser negativo').optional(),
 *   end_time:   z.number().min(0, 'end_time no puede ser negativo').optional(),
 * }).superRefine((v, ctx) => {
 *   const { start_time: s, end_time: e } = v;
 *   const start = s ?? 0;
 *   const end = e ?? 0;
 *   if (end > 0 && start > 0 && end <= start) {
 *     ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_time'],
 *       message: 'end_time debe ser mayor que start_time' });
 *   }
 *   if (end > start && end - start > PREVIEW_MAX_SEGMENT_SECONDS) {
 *     ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_time'],
 *       message: `el segmento no puede pasar de ${PREVIEW_MAX_SEGMENT_SECONDS} s` });
 *   }
 * });
 * ```
 *
 * Nótese que el `end > start` **solo** se exige cuando ambos son > 0: un
 * capítulo con `start_time = 265` y `end_time` a null es un capítulo abierto
 * ("hasta el final del vídeo") y es legítimo.
 *
 * @param maxSegmentSeconds Techo del segmento. `Number.POSITIVE_INFINITY`
 *   desactiva el tope de 30 s (para las vistas que solo quieren saber si el
 *   rango es utilizable, no si cabe en un preview).
 */
export function validateChapterSegment(
  startTime?: number | null,
  endTime?: number | null,
  maxSegmentSeconds: number = PREVIEW_MAX_SEGMENT_SECONDS,
): ChapterSegment {
  const rawStart = finiteOrNull(startTime);
  const rawEnd = finiteOrNull(endTime);
  const issues: ChapterSegmentIssue[] = [];

  const declared =
    (rawStart !== null && rawStart !== 0) || (rawEnd !== null && rawEnd !== 0);

  if (startTime !== null && startTime !== undefined && rawStart === null) {
    issues.push({ code: 'NON_FINITE', message: 'start_time no es un número', action: 'drop' });
  }
  if (endTime !== null && endTime !== undefined && rawEnd === null) {
    issues.push({ code: 'NON_FINITE', message: 'end_time no es un número', action: 'drop' });
  }
  if ((rawStart !== null && rawStart < 0) || (rawEnd !== null && rawEnd < 0)) {
    issues.push({ code: 'NEGATIVE', message: 'Los tiempos del segmento no pueden ser negativos', action: 'drop' });
  }

  const start = rawStart !== null && rawStart > 0 ? rawStart : 0;
  const end = rawEnd !== null && rawEnd > 0 ? rawEnd : 0;

  // Final invertido: `end <= start` con ambos declarados. Este es el bug
  // latente que, con `start=265` y `end=0` sustituido por el default de 30,
  // hacía que el poll de YouTube viera `ytTime >= 30` en el primer tick y
  // saltase de pista al instante.
  if (start > 0 && end > 0 && end <= start) {
    issues.push({
      code: 'INVERTED',
      message: 'end_time debe ser mayor que start_time',
      action: 'drop',
    });
  }

  const length = end > start ? end - start : 0;
  if (length > 0 && Number.isFinite(maxSegmentSeconds) && length > maxSegmentSeconds) {
    issues.push({
      code: 'TOO_LONG',
      message: `El segmento dura ${Math.round(length)} s y el máximo son ${maxSegmentSeconds} s`,
      action: 'drop',
    });
  }

  const usable = issues.length === 0;

  return {
    declared,
    usable,
    start,
    end,
    length,
    issues,
    warning: issues.length === 0 ? '' : issues.map((i) => i.message).join(' · '),
  };
}

/**
 * Texto del aviso cuando se descartan los timestamps por ser de otro medio.
 * No lleva el valor concreto a propósito: el `end_time = 501` del catálogo es
 * un dato inventado, y reproducirlo en un aviso lo haría parecer creíble.
 */
export const CHAPTER_OFFSETS_DROPPED_WARNING =
  'Los capítulos del vídeo no describen este preview de audio, así que el reproductor los ha descartado.';

export interface PlaybackTimelineInput {
  /**
   * `preview` = fichero de audio independiente. `youtube` = vídeo con capítulos.
   * Cualquier otro valor (`spotify`, `apple_music`, `null`) se trata como
   * `preview`: son link-outs, nunca suenan.
   */
  sourceType: AudioSourceType | null | undefined;
  declaredStart?: number | null;
  declaredEnd?: number | null;
  /**
   * Duración **real del medio que suena** (`loadedmetadata` del `<audio>` o
   * `yt.getDuration()`). `0` / `null` = todavía no se sabe. Al cargar una pista
   * se pasa `0` a propósito: la duración que hay en el estado es la de la pista
   * anterior.
   */
  mediaDuration?: number | null;
  /** Techo del segmento. Por defecto 30 s. */
  maxSegmentSeconds?: number;
  /**
   * Cuánto reproducir un vídeo cuando no se declaró ningún segmento. Antes de
   * existir `mediaDuration` esto estaba cableado a 30 en el contexto; se mantiene
   * como *fallback*, no como regla.
   */
  youTubeFallbackSeconds?: number;
}

export interface PlaybackTimeline {
  /** Límite inferior del scrubber, en segundos del medio. */
  start: number;
  /** Límite superior del scrubber, en segundos del medio. `0` = aún desconocido. */
  end: number;
  /** `end - start`, siempre `>= 0`. */
  span: number;
  /** `true` si los timestamps declarados se aplicaron de verdad. */
  applied: boolean;
  /**
   * `true` si la línea de tiempo es `[0, mediaDuration]`, es decir un fichero
   * independiente donde los capítulos no aplican.
   */
  usesMediaDuration: boolean;
  /** Aviso para la UI. `""` si no hay nada que avisar. */
  warning: string;
}

/**
 * ÚNICA fuente de verdad de la línea de tiempo de reproducción.
 *
 * Todo lo que muestra o manipula el reproductor (`GlobalAudioPlayer`, `seek`,
 * `loadTrack`, el aviso de segmento) sale de aquí, para que no vuelva a existir
 * el desajuste de "la etiqueta izquierda viene del elemento `<audio>` y la
 * derecha de metadatos de capítulo".
 *
 * Con `sourceType: 'preview'` los timestamps declarados **se ignoran siempre**
 * y salen warnings; no hay rama donde "gane" la duración porque no compiten.
 */
export function resolvePlaybackTimeline(input: PlaybackTimelineInput): PlaybackTimeline {
  const {
    sourceType,
    declaredStart,
    declaredEnd,
    mediaDuration,
    maxSegmentSeconds,
    youTubeFallbackSeconds,
  } = input;

  const mediaDur = finiteOrNull(mediaDuration) ?? 0;
  const media = mediaDur > 0 ? mediaDur : 0;
  const fallback =
    finiteOrNull(youTubeFallbackSeconds) ?? PREVIEW_MAX_SEGMENT_SECONDS;

  if (sourceType !== 'youtube') {
    const declared = validateChapterSegment(declaredStart, declaredEnd, maxSegmentSeconds ?? PREVIEW_MAX_SEGMENT_SECONDS);
    return {
      start: 0,
      end: media,
      span: media,
      applied: false,
      usesMediaDuration: true,
      warning: declared.declared ? CHAPTER_OFFSETS_DROPPED_WARNING : '',
    };
  }

  const segment = validateChapterSegment(declaredStart, declaredEnd, maxSegmentSeconds);
  let start = segment.usable ? segment.start : 0;
  let end = segment.usable ? segment.end : 0;

  if (end === 0) {
    // Final abierto, o segmento descartado: manda el medio.
    end = media || fallback;
  } else if (media > 0 && end > media) {
    // Un capítulo que pasa del vídeo se recorta al vídeo (no al revés: al revés
    // el poll nunca vería el fin y la pista no avanzaría sola).
    end = media;
  }

  if (end <= start) {
    // Ventana degenerada (p. ej. `start = 265` con un vídeo de 0 s todavía sin
    // `loadedmetadata`): se cae al medio completo en vez de dejar un rango vacío.
    start = 0;
    end = media || fallback;
  }

  return {
    start,
    end,
    span: Math.max(end - start, 0),
    // `applied` = "los timestamps **declarados** entraron en la línea de tiempo".
    // No basta con `usable`: `validateChapterSegment(0, 0)` es usable (no hay
    // nada que objetar) pero no ha aplicado ningún timestamp.
    applied: segment.usable && segment.declared,
    usesMediaDuration: false,
    warning: segment.warning,
  };
}

/** `M:SS`. Reemplaza tres copias divergentes del mismo `formatTime`. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Progreso 0..100 del segmento. Nunca negativo, nunca `NaN`, nunca `>100`.
 *
 * Con el bug anterior, `start=265, end=501, currentTime=8` daba
 * `(8-265)/236 = -108%`, recortado a `0`: la barra se quedaba en 0 durante los
 * 30 s enteros del preview.
 */
export function timelineProgress(timeline: PlaybackTimeline, currentTime: number): number {
  const base = timeline.span > 0 ? timeline.span : Math.max(timeline.end, 0);
  if (base <= 0 || !Number.isFinite(currentTime)) return 0;
  const pct = ((currentTime - timeline.start) / base) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

/** Valor del `<input type="range">`: siempre dentro de `[start, end]`. */
export function timelineScrubValue(timeline: PlaybackTimeline, currentTime: number): number {
  if (!Number.isFinite(currentTime)) return timeline.start;
  const max = Math.max(timeline.end, 0);
  return Math.max(timeline.start, Math.min(max, currentTime));
}

/**
 * Destino de un `seek()`, ya recortado a `[start, end]`.
 *
 * Es la función que evita perder la pista: con `start=265` sobre un fichero de
 * 30 s devolvía `265`, el `<audio>` buscaba más allá de su final y disparaba
 * `ended` → salto de pista.
 */
export function timelineSeekTarget(timeline: PlaybackTimeline, requested: number): number {
  if (!Number.isFinite(requested)) return timeline.start;
  const floor = Math.max(timeline.start, 0);
  if (timeline.end <= 0) return Math.max(floor, requested);
  return Math.max(floor, Math.min(timeline.end, requested));
}

// ---------------------------------------------------------------------------
// Glifos de salto  (RC.32 · tarea 4)
// ---------------------------------------------------------------------------
//
// Los `aria-label` y los handlers eran correctos; lo que estaba cruzado eran las
// rutas SVG: el botón "Pista anterior" tenía el glifo *forward* (dos triángulos
// a la derecha) y el de "Pista siguiente" el *backward*. Se ve solo con el
// nombre accesible al lado del icono, y un lector de pantalla no lo detecta:
// por eso el sentido se deduce de la geometría y se testea, en vez de fiarse de
// "la ruta correcta" sin comprobarla.

/** Heroicons *backward* (`<<`). Para "Pista anterior". */
export const SKIP_PREV_GLYPH = 'M12.75 4.5l-7.5 7.5 7.5 7.5m6-15l-7.5 7.5 7.5 7.5';

/** Heroicons *forward* (`>>`). Para "Pista siguiente". */
export const SKIP_NEXT_GLYPH = 'M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5';

/**
 * Sentido de un glifo de salto deducido de su geometría, no de su nombre.
 *
 * Los glifos de salto de Heroicons mini son **dos triángulos** (forward/backward)
 * y cada triángulo es un `l` con `dx != 0`: el signo de `dx` es la dirección del
 * vértice. Un `dx > 0` es un triángulo apuntando a la derecha.
 *
 * El mínimo de **dos** deltas no es decorativo: es lo que separa un glifo de
 * salto de una cruz de cerrar (`M6 18L18 6M6 6l12 12`), que tiene un solo `l` y
 * que devolvería `"forward"` sin más. Con dos o más, todos del mismo signo, el
 * sentido está determinado; con signos mezclados no hay sentido único y se
 * devuelve `null`.
 *
 * @returns `"forward"`, `"backward"`, o `null` si el sentido no se puede deducir.
 */
export function skipGlyphDirection(pathData: string): 'forward' | 'backward' | null {
  const deltas = Array.from(pathData.matchAll(/l\s*(-?[\d.]+)\s+(-?[\d.]+)/g))
    .map((m) => Number(m[1]))
    .filter((dx) => dx !== 0 && Number.isFinite(dx));
  if (deltas.length < 2) return null;
  if (deltas.every((dx) => dx > 0)) return 'forward';
  if (deltas.every((dx) => dx < 0)) return 'backward';
  return null;
}

// ---------------------------------------------------------------------------
// Qué se imprime en la columna de la derecha del tracklist  (RC.32 · tarea 5)
// ---------------------------------------------------------------------------

/** `M:SS` o `H:MM:SS`. Rechaza el placeholder `"—"` y cualquier basura. */
const DURATION_LIKE = /^\d{1,2}:\d{2}(:\d{2})?$/;

export interface TracklistDurationLabel {
  /** Lo que se pinta. `""` si no hay nada que pintar. */
  text: string;
  /** `true` si `text` es un rango de capítulo, no la duración real de la pista. */
  isChapterRange: boolean;
  /** `true` si hay timestamps pero no forman un rango utilizable (hay que avisar). */
  invalidChapterRange: boolean;
  /** Aviso para el `title`. `""` si no hay nada que avisar. */
  warning: string;
}

/**
 * La columna derecha del tracklist muestra **la duración de la pista**.
 *
 * Antes ganaba la rama de timestamps:
 *
 * ```
 * {track.start_time || track.end_time ? `${formatTime(start)} — ${formatTime(end)}`
 *                                     : track.duration ? track.duration : null}
 * ```
 *
 * o sea, las 55 pistas con `end_time > 30` enseñaban un rango de capítulo y la
 * duración real — la rama de `track.duration` — era **inalcanzable** para ellas.
 *
 * ## Por qué la asimetría es la señal
 *
 * `components/ReleaseTracklistSection.tsx` (otra vista, misma función, mismo
 * catálogo) ya imprimía `track.duration` sin mirar los timestamps. Dos
 * componentes haciendo lo contrario no es un descuido: una de las dos está
 * haciendo bien lo que el usuario pidió.
 *
 * ## Lo que NO se borra
 *
 * `start_time` es el **fallback de ordenación** del catálogo
 * (`lib/db.ts:2269` y el SQL de `getArtistCatalog` en `:2351` hacen
 * `ORDER BY COALESCE(disc_number,1), COALESCE(track_number,999), start_time`).
 * Aquí solo se desprioriza para **mostrar**: si no hay duración real, el rango
 * se conserva como último recurso y se marca como lo que es.
 */
export function tracklistDurationLabel(track: {
  duration?: string | null;
  start_time?: number | null;
  end_time?: number | null;
}): TracklistDurationLabel {
  const raw = typeof track.duration === 'string' ? track.duration.trim() : '';
  if (DURATION_LIKE.test(raw)) {
    return { text: raw, isChapterRange: false, invalidChapterRange: false, warning: '' };
  }

  const segment = validateChapterSegment(track.start_time, track.end_time, Number.POSITIVE_INFINITY);
  if (segment.declared && segment.usable) {
    return {
      text: `${formatClock(segment.start)} — ${formatClock(segment.end)}`,
      isChapterRange: true,
      invalidChapterRange: false,
      warning: 'Rango dentro de un vídeo, no duración de la pista: esta columna mostraría la duración real si la tuvieras.',
    };
  }
  if (segment.declared && !segment.usable) {
    return { text: '', isChapterRange: false, invalidChapterRange: true, warning: segment.warning };
  }
  return { text: '', isChapterRange: false, invalidChapterRange: false, warning: '' };
}

// ---------------------------------------------------------------------------
// Radio de impacto del `crossOrigin` condicional — MEDIDO, NO RESUELTO
// ---------------------------------------------------------------------------
//
// `CORS_VERIFIED_AUDIO_HOSTS` tiene **un solo host**: `audio-ssl.itunes.apple.com`.
// `shouldUseCrossOrigin` devuelve `false` para cualquier otro tercero, así que el
// `<audio>` se reproduce **sin** atributo `crossOrigin`.
//
// El problema no es el atributo, es lo que hace el visualizador al abrirse:
// `lib/web-audio.ts:71-73` hace
//
//   const source = ctx.createMediaElementSource(audioElement);
//   source.connect(analyser);
//   analyser.connect(ctx.destination);
//
// `createMediaElementSource` **reemplaza la salida nativa** del elemento. Con
// `crossOrigin = null` el medio se carga sin CORS y, según el navegador, el
// `MediaElementAudioSourceNode` entrega **silencio**: el audio sigue reproduciéndose
// en la cadena nativa, pero ya no pasa por el grafo — así que el `AnalyserNode`
// dibuja barras sintéticas sobre un elemento que ya no suena por ahí.
//
// Con el audio **sí** pasa por el grafo (`analyser.connect(ctx.destination)`), así
// que se oye; sin atributo, se oye *y* las barras son falsas, o directamente no
// se oye. Ese es el radio exacto: **cualquier preview cuya URL no sea del CDN de
// iTunes** — o sea, todo lo que traiga el script de Deezer (agente G) o un
// `/uploads/…` servido por Vercel desde otro dominio.
//
// ## Por qué el comentario de más arriba dice lo contrario
//
// `audio-priority.ts` (sección de CORS) razona: "Perder barras es visible y
// degradable; perder el audio no", y de ahí sale omitir el atributo. Ese razonamiento
// era correcto **mientras el visualizador solo leyera** del `AnalyserNode`. Desde
// que `lib/web-audio.ts` hace `analyser.connect(ctx.destination)`, la cadena pasa a
// ser **de ida y vuelta**, y la degradación ya no es "degradable": con el atributo
// puesto y sin `ACAO` falla `play()` (error visible, audio ausente); sin atributo y
// con el visualizador abierto, el audio puede desaparecer sin ningún error.
//
// **NO se arregla aquí**: `lib/web-audio.ts` y `components/AudioVisualizer.tsx` son
// del agente D. Lo que sí hace esta capa es no empeorar el radio: `crossOrigin`
// se sigue fijando **solo** para hosts medidos, y `createAudioVisualizer` es quien
// tiene que decidir si engancha el grafo o se mantiene en lectura. Anotado para la
// ola de D.
