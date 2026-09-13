import { safeString } from "./null-safe";

const LASTFM_BASE = "http://ws.audioscrobbler.com/2.0/";
const API_KEY = process.env.LASTFM_API_KEY;

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

async function lastfmFetch<T>(params: Record<string, string>): Promise<T | null> {
  if (!API_KEY) return null;
  try {
    const searchParams = new URLSearchParams({ api_key: API_KEY, format: "json", ...params });
    const res = await fetch(`${LASTFM_BASE}?${searchParams}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data as T;
  } catch {
    return null;
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

export async function getArtistInfo(artist: string): Promise<LastfmArtistInfo | null> {
  const data = await lastfmFetch<RawArtistResponse>({ method: "artist.getinfo", artist });
  if (!data?.artist) return null;
  const a = data.artist;
  return {
    name: safeString(a.name, artist),
    listeners: parseInt(a.stats?.listeners ?? "0", 10) || 0,
    plays: parseInt(a.stats?.playcount ?? "0", 10) || 0,
    similar: (a.similar?.artist ?? []).map((s) => ({
      name: safeString(s.name, ""),
      match: parseFloat(s.match) || 0,
    })),
    tags: (a.tags?.tag ?? []).map((t) => safeString(t.name, "")).filter(Boolean),
    bioSummary: safeString(a.bio?.summary, ""),
  };
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

export async function getTrackInfo(artist: string, track: string): Promise<LastfmTrackInfo | null> {
  const data = await lastfmFetch<RawTrackResponse>({ method: "track.getInfo", artist, track });
  if (!data?.track) return null;
  const t = data.track;
  return {
    name: safeString(t.name, track),
    duration: parseInt(t.duration ?? "0", 10) || 0,
    listeners: parseInt(t.listeners ?? "0", 10) || 0,
    playcount: parseInt(t.playcount ?? "0", 10) || 0,
    tags: (t.toptags?.tag ?? []).map((tag) => safeString(tag.name, "")).filter(Boolean),
  };
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

export async function getTopTracks(artist: string, limit = 10): Promise<LastfmTopTrack[]> {
  const data = await lastfmFetch<RawTopTracksResponse>({
    method: "artist.gettoptracks",
    artist,
    limit: String(limit),
  });
  if (!data?.toptracks?.track) return [];
  return data.toptracks.track.map((t) => ({
    name: safeString(t.name, ""),
    playcount: parseInt(t.playcount ?? "0", 10) || 0,
    listeners: parseInt(t.listeners ?? "0", 10) || 0,
    url: safeString(t.url, ""),
    image: t.image?.find((img) => img.size === "medium")?.["#text"] || undefined,
  }));
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

export async function getTopAlbums(artist: string, limit = 10): Promise<LastfmTopAlbum[]> {
  const data = await lastfmFetch<RawTopAlbumsResponse>({
    method: "artist.gettopalbums",
    artist,
    limit: String(limit),
  });
  if (!data?.topalbums?.album) return [];
  return data.topalbums.album.map((a) => ({
    name: safeString(a.name, ""),
    playcount: parseInt(a.playcount ?? "0", 10) || 0,
    listeners: parseInt(a.listeners ?? "0", 10) || 0,
    url: safeString(a.url, ""),
    image: a.image?.find((img) => img.size === "medium")?.["#text"] || undefined,
  }));
}
