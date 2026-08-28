export const safeString = (v: unknown): string =>
  typeof v === "string" && v.length > 0 ? v : "—";

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
