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

export const formatNumber = (n: number): string =>
  new Intl.NumberFormat("es-VE").format(n);

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
  return getYouTubeThumbnail(track.youtube_video_id);
};

export { getAudioSources, getPrimaryAudioSource, getAudioSourceByType, hasStreamingSource, isYouTubeOnly } from './audio-priority';
export { fetchYouTubeVideo, extractYouTubeId, getYouTubeEmbedUrl, getSpotifyEmbedUrl, getAppleMusicEmbedUrl } from './youtube';
export type { YouTubeVideo } from './youtube';
export type { AudioSource, AudioSourceType } from './audio-priority';
