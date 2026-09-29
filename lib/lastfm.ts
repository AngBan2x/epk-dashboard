import { safeString } from "./null-safe";
import {
  classifyUpstreamStatus,
  integrationFailure,
  integrationSuccess,
  type IntegrationReason,
  type IntegrationResult,
} from "./integration-reasons";

/**
 * Fase E: la API canónica es `https://`. Con `http://` cada llamada pagaba un
 * redirect 301 antes de recibir datos.
 */
const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";
const API_KEY = process.env.LASTFM_API_KEY;

/** Timeout de red: 5 s. Antes una Last.fm colgada colgaba la ruta entera. */
const LASTFM_TIMEOUT_MS = 5_000;

/**
 * Códigos de error del API 2.0 de Last.fm que no son cuota ni caída.
 * 5 = invalid parameters, 6 = artist not found, 7 = album not found,
 * 8 = invalid method, 9 = invalid resource, 10 = invalid API key (cuota/permisos),
 * 11 = service offline, 13 = invalid method signature.
 */
function classifyLastfmErrorCode(code: number): IntegrationReason {
  if (code === 10) return "quota";
  if (code === 5 || code === 6 || code === 7) return "not_found";
  return "upstream";
}

export interface LastfmArtistInfo {
  name: string;
  listeners: number;
  plays: number;
  similar: { name: string; match: number }[];
  tags: string[];
  bioSummary: string;
}

export interface LastfmTrackInfo {
  name: string;
  duration: number;
  listeners: number;
  playcount: number;
  tags: string[];
}

export interface LastfmTopTrack {
  name: string;
  playcount: number;
  listeners: number;
  url: string;
  image?: string;
}

export interface LastfmTopAlbum {
  name: string;
  playcount: number;
  listeners: number;
  url: string;
  image?: string;
}

/**
 * Fase E: antes 5 escenarios distintos (sin clave, !res.ok, data.error, catch
 * de red, y el `!data.artist`) colapsaban todos en el mismo `null`, así que la
 * UI no podía distinguir "no hay datos" de "Last.fm está caído". Ahora se
 * devuelve el motivo discriminado; los wrappers de abajo mantienen su firma
 * (`null` / `[]`) para no romper a los llamantes.
 */
async function lastfmFetch<T>(params: Record<string, string>): Promise<IntegrationResult<T>> {
  if (!API_KEY) return integrationFailure("no_key");
  try {
    const searchParams = new URLSearchParams({ api_key: API_KEY, format: "json", ...params });
    const res = await fetch(`${LASTFM_BASE}?${searchParams}`, {
      signal: AbortSignal.timeout(LASTFM_TIMEOUT_MS),
      next: { revalidate: 3600 },
    } as RequestInit);
    if (!res.ok) return integrationFailure(classifyUpstreamStatus(res.status));
    const data = (await res.json()) as { error?: number; message?: string } & T;
    if (data && typeof data === "object" && typeof data.error === "number" && data.error !== 0) {
      return integrationFailure(classifyLastfmErrorCode(data.error));
    }
    return integrationSuccess(data as T);
  } catch (error) {
    // Un timeout no es un fallo de red: el proveedor aceptó y no respondió.
    const isTimeout =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    if (!isTimeout) {
      console.error("[lastfm] fallo de red:", error);
    }
    return integrationFailure(isTimeout ? "upstream" : "network");
  }
}

interface RawArtistResponse {
  artist: {
    name: string;
    stats?: { listeners?: string; playcount?: string };
    similar?: { artist?: { name: string; match: string }[] };
    tags?: { tag?: { name: string }[] };
    bio?: { summary?: string };
  };
}

/**
 * Variante discriminada de `getArtistInfo`: la ruta la usa para saber por qué
 * no hay datos y elegir status + mensaje.
 */
export async function fetchArtistInfo(
  artist: string,
): Promise<IntegrationResult<LastfmArtistInfo>> {
  const res = await lastfmFetch<RawArtistResponse>({ method: "artist.getinfo", artist });
  if (!res.ok) return res;
  const a = res.data?.artist;
  // Respuesta 200 sin `artist`: el artista no existe en Last.fm.
  if (!a) return integrationFailure("not_found");
  return integrationSuccess({
    name: safeString(a.name, artist),
    listeners: parseInt(a.stats?.listeners ?? "0", 10) || 0,
    plays: parseInt(a.stats?.playcount ?? "0", 10) || 0,
    similar: (a.similar?.artist ?? []).map((s) => ({
      name: safeString(s.name, ""),
      match: parseFloat(s.match) || 0,
    })),
    tags: (a.tags?.tag ?? []).map((t) => safeString(t.name, "")).filter(Boolean),
    bioSummary: safeString(a.bio?.summary, ""),
  });
}

export async function getArtistInfo(artist: string): Promise<LastfmArtistInfo | null> {
  const res = await fetchArtistInfo(artist);
  return res.ok ? res.data : null;
}

interface RawTrackResponse {
  track: {
    name: string;
    duration?: string;
    listeners?: string;
    playcount?: string;
    toptags?: { tag?: { name: string }[] };
  };
}

/** Variante discriminada de `getTrackInfo`. */
export async function fetchTrackInfo(
  artist: string,
  track: string,
): Promise<IntegrationResult<LastfmTrackInfo>> {
  const res = await lastfmFetch<RawTrackResponse>({ method: "track.getInfo", artist, track });
  if (!res.ok) return res;
  const t = res.data?.track;
  if (!t) return integrationFailure("not_found");
  return integrationSuccess({
    name: safeString(t.name, track),
    duration: parseInt(t.duration ?? "0", 10) || 0,
    listeners: parseInt(t.listeners ?? "0", 10) || 0,
    playcount: parseInt(t.playcount ?? "0", 10) || 0,
    tags: (t.toptags?.tag ?? []).map((tag) => safeString(tag.name, "")).filter(Boolean),
  });
}

export async function getTrackInfo(artist: string, track: string): Promise<LastfmTrackInfo | null> {
  const res = await fetchTrackInfo(artist, track);
  return res.ok ? res.data : null;
}

interface RawTopTracksResponse {
  toptracks: {
    track?: {
      name: string;
      playcount?: string;
      listeners?: string;
      url?: string;
      image?: { "#text": string; size: string }[];
    }[];
  };
}

/** Variante discriminada de `getTopTracks`. */
export async function fetchTopTracks(
  artist: string,
  limit = 10,
): Promise<IntegrationResult<LastfmTopTrack[]>> {
  const res = await lastfmFetch<RawTopTracksResponse>({
    method: "artist.gettoptracks",
    artist,
    limit: String(limit),
  });
  if (!res.ok) return res;
  const list = res.data?.toptracks?.track;
  if (!list) return integrationFailure("not_found");
  return integrationSuccess(
    list.map((t) => ({
      name: safeString(t.name, ""),
      playcount: parseInt(t.playcount ?? "0", 10) || 0,
      listeners: parseInt(t.listeners ?? "0", 10) || 0,
      url: safeString(t.url, ""),
      image: t.image?.find((img) => img.size === "medium")?.["#text"] || undefined,
    })),
  );
}

export async function getTopTracks(artist: string, limit = 10): Promise<LastfmTopTrack[]> {
  const res = await fetchTopTracks(artist, limit);
  return res.ok ? res.data : [];
}

interface RawTopAlbumsResponse {
  topalbums: {
    album?: {
      name: string;
      playcount?: string;
      listeners?: string;
      url?: string;
      image?: { "#text": string; size: string }[];
    }[];
  };
}

/**
 * `getTopAlbums` ya NO lo llama `/api/lastfm` (Fase E): la UI nunca leyó el
 * resultado, así que la llamada gastaba 1 de cada 3 unidades de cuota. Se
 * mantiene la función por si algún consumidor futuro la necesita.
 */
export async function getTopAlbums(artist: string, limit = 10): Promise<LastfmTopAlbum[]> {
  const res = await lastfmFetch<RawTopAlbumsResponse>({
    method: "artist.gettopalbums",
    artist,
    limit: String(limit),
  });
  if (!res.ok) return [];
  const list = res.data?.topalbums?.album;
  if (!list) return [];
  return list.map((a) => ({
    name: safeString(a.name, ""),
    playcount: parseInt(a.playcount ?? "0", 10) || 0,
    listeners: parseInt(a.listeners ?? "0", 10) || 0,
    url: safeString(a.url, ""),
    image: a.image?.find((img) => img.size === "medium")?.["#text"] || undefined,
  }));
}
