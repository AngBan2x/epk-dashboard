export const safeString = (v: unknown, fallback = "—"): string =>
  typeof v === "string" && v.length > 0 ? v : fallback;

export const hasValue = (obj: unknown, key: string): boolean => {
  if (obj == null || typeof obj !== "object") return false;
  return key in obj && (obj as Record<string, unknown>)[key] != null && (obj as Record<string, unknown>)[key] !== "";
};

export const safeNumber = (v: unknown, fallback = 0): number =>
  typeof v === "number" && !isNaN(v) ? v : fallback;

export const safeArray = <T,>(v: unknown): T[] =>
  Array.isArray(v) ? (v as T[]) : [];

export const safeDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(v as string | number);
  return isNaN(d.getTime()) ? null : d;
};

export const safeParseJSON = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const formatDuration = (duration: string): string => {
  const parts = duration.split(":");
  if (parts.length !== 2) return duration;
  const [min, sec] = parts;
  return `${min}:${sec.padStart(2, "0")}`;
};

/**
 * CONTRATO P16 (RC.31) — parser de duraciones, exportado desde aquí para que
 * ningún stream lo reimplemente.
 *
 * Por qué existe: el parser que estaba duplicado en
 * `components/ReleaseTracklistSection.tsx:35-37` y `app/track/[id]/page.tsx:96-98`
 * hacía `const [m, s] = value.split(":")` y devolvía `m * 60 + s`. Eso solo
 * funciona con DOS segmentos. Con tres segmentos (`"1:02:03"`) el array es
 * `[1, 2, 3]`, `m = 1` y `s = 2` → **62 segundos en vez de 3723**, y el guard
 * `isNaN` que lo acompañaba NO saltaba porque `[1, 2, 3]` no contiene ningún
 * NaN: el bug era silencioso y el resultado quedaba escrito en `duration`.
 *
 * No es hipotético: `secondsToTimestamp()` en `lib/youtube.ts:366-374` emite
 * `H:MM:SS` a partir de una hora, y `app/releases/new/page.tsx:207` lo escribe
 * tal cual en la columna `duration` de cada pista.
 *
 * Formatos aceptados: `"M:SS"`, `"MM:SS"`, `"H:MM:SS"`, `"HH:MM:SS"`.
 * Valores sin sentido: `"—"`, `""`, `"—"`, `null`, `undefined`, texto no
 * numérico → `null` (NO 0), para que el llamante distinga "vacío" de
 * "duración cero".
 */
export function parseDurationToSeconds(
  value: string | null | undefined
): number | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;

  const raw = value.trim();
  // El seed y varios formularios usan "—" como placeholder de "sin duración",
  // no como un valor cero.
  if (raw === "" || raw === "—" || raw === "-" || raw === "–") return null;
  if (!/^\d{1,3}(:\d{1,2}){1,2}$/.test(raw)) return null;

  const parts = raw.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    // "3:75" no es una duración: 75 segundos no caben en un minuto.
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = parts;
  if (minutes >= 60 || seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * CONTRATO P16 (RC.31) — suma de duraciones de un tracklist.
 *
 * Devuelve `null` cuando NO hay nada sumable, para que el llamante pueda
 * distinguir "no hay dato" de "0 segundos" (un álbum recién creado sin
 * duraciones no debe renderizar "0:00" como si fuera real).
 *
 * La etiqueta sale en formato `M:SS` (minutos SIN relleno a la izquierda),
 * igual que las hijas del seed (`"3:45"`, `"6:07"`). No se usa
 * `formatDuration()` de este archivo porque solo rellena los segundos y
 * dejaría `"42:46"` inconsistente al lado de `"6:07"`. Con más de una hora el
 * total crece de forma natural: 3723 s → `"62:03"`.
 */
export function sumDurations(
  values: Array<string | null | undefined>
): { seconds: number; label: string } | null {
  if (!Array.isArray(values) || values.length === 0) return null;

  let total = 0;
  let parsedCount = 0;
  for (const value of values) {
    const seconds = parseDurationToSeconds(value);
    if (seconds == null) continue;
    total += seconds;
    parsedCount += 1;
  }

  if (parsedCount === 0) return null;

  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return { seconds: total, label: `${minutes}:${String(secs).padStart(2, "0")}` };
}

export const formatNumber = (n: number): string =>
  new Intl.NumberFormat("es-VE").format(n);

// Deterministic date formatting for SSR: pins timeZone UTC + explicit locale
// so server (UTC) and client (any TZ) render identical strings.
// Without this, date-only strings ("2025-12-27" = UTC midnight) render a
// different calendar day in negative-offset timezones -> React hydration #425.
export const formatDateES = (
  v: unknown,
  opts?: Intl.DateTimeFormatOptions
): string => {
  const d = safeDate(v);
  if (!d) return "—";
  return d.toLocaleDateString("es-ES", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(opts ?? {}),
  });
};

// UTC calendar-day difference (whole days), deterministic across timezones.
export const diffDaysUTC = (from: Date, to: Date): number => {
  const dayUTC = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((dayUTC(to) - dayUTC(from)) / 86400000);
};

export const formatPercent = (n: number): string =>
  `${n.toFixed(1)}%`;

export const isDefined = <T>(v: T | null | undefined): v is T =>
  v != null;

export const coalesce = <T>(...values: (T | null | undefined)[]): T | undefined =>
  values.find(isDefined);

export const capitalizeReleaseType = (type: string): string => {
  const lower = type.toLowerCase();
  if (lower === "single") return "Single";
  if (lower === "ep") return "EP";
  if (lower === "album") return "Álbum";
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
};

export const getYouTubeThumbnail = (youtubeVideoId: string | null | undefined, quality: "maxres" | "hq" | "mq" | "default" = "hq"): string | null => {
  if (!youtubeVideoId) return null;
  const qualities: Record<string, string> = {
    maxres: "maxresdefault",
    hq: "hqdefault",
    mq: "mqdefault",
    default: "default",
  };
  return `https://img.youtube.com/vi/${youtubeVideoId}/${qualities[quality]}.jpg`;
};

export const getCoverImage = (track: { cover_image?: string | null; youtube_video_id?: string | null }): string | null => {
  if (track.cover_image && track.cover_image.trim() !== "" && track.cover_image !== "—") return track.cover_image;
  return getYouTubeThumbnail(track.youtube_video_id, "maxres");
};

export { getAudioSources, getPrimaryAudioSource, getAudioSourceByType, hasStreamingSource, isYouTubeOnly } from './audio-priority';
export { fetchYouTubeVideo, extractYouTubeId, getYouTubeEmbedUrl, getSpotifyEmbedUrl, getAppleMusicEmbedUrl } from './youtube';
export type { YouTubeVideo } from './youtube';
export type { AudioSource, AudioSourceType } from './audio-priority';
