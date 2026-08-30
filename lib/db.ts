import Database from "better-sqlite3";
import path from "path";
import type { Track, RawTrackRow, Metrics, ProductionDetails, StemsUrls } from "@/types/music";
import { safeString, safeNumber, safeArray } from "@/lib/null-safe";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
  }
  return _db;
}

function parseMetrics(raw: string | null): Metrics {
  if (!raw) {
    return { streams: 0, saves: 0, playlist_additions: 0, top_countries: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      streams: safeNumber(parsed.streams),
      saves: safeNumber(parsed.saves),
      playlist_additions: safeNumber(parsed.playlist_additions),
      top_countries: safeArray<{ country: string; pct: number }>(parsed.top_countries),
    };
  } catch {
    return { streams: 0, saves: 0, playlist_additions: 0, top_countries: [] };
  }
}

function parseProductionDetails(raw: string | null): ProductionDetails {
  if (!raw) {
    return { daw: null, guitars: null, effects_chain: null, tuning: null, key: null };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      daw: typeof parsed.daw === "string" ? parsed.daw : null,
      guitars: typeof parsed.guitars === "string" ? parsed.guitars : null,
      effects_chain: typeof parsed.effects_chain === "string" ? parsed.effects_chain : null,
      tuning: typeof parsed.tuning === "string" ? parsed.tuning : null,
      key: typeof parsed.key === "string" ? parsed.key : null,
    };
  } catch {
    return { daw: null, guitars: null, effects_chain: null, tuning: null, key: null };
  }
}

function parseStemsUrls(raw: string | null): StemsUrls | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      drums: typeof parsed.drums === "string" ? parsed.drums : undefined,
      bass: typeof parsed.bass === "string" ? parsed.bass : undefined,
      guitars: typeof parsed.guitars === "string" ? parsed.guitars : undefined,
      vocals: typeof parsed.vocals === "string" ? parsed.vocals : undefined,
      other: typeof parsed.other === "string" ? parsed.other : undefined,
    };
  } catch {
    return null;
  }
}

function parseGalleryImages(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.filter((item): item is string => typeof item === "string")) : null;
  } catch {
    return null;
  }
}

function parseTrack(row: RawTrackRow): Track {
  return {
    id: row.id,
    title: row.title,
    release_type: safeString(row.release_type),
    release_date: safeString(row.release_date),
    duration: safeString(row.duration),
    cover_image: safeString(row.cover_image),
    audio_preview_url: safeString(row.audio_preview_url),
    spotify_url: row.spotify_url ?? null,
    youtube_video_id: row.youtube_video_id ?? null,
    metrics: parseMetrics(row.metrics),
    production_details: parseProductionDetails(row.production_details),
    lyrics: row.lyrics ?? null,
    // Multimedia F8
    itunes_track_id: row.itunes_track_id ?? null,
    stems_urls: parseStemsUrls(row.stems_urls ?? null),
    video_embed_url: row.video_embed_url ?? null,
    gallery_images: parseGalleryImages(row.gallery_images ?? null),
  };
}

export function getAllTracks(): Track[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM tracks").all() as RawTrackRow[];
  return rows.map(parseTrack);
}

export function getTrackById(id: string): Track | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tracks WHERE id = ?").get(id) as RawTrackRow | undefined;
  return row !== undefined ? parseTrack(row) : null;
}

export function getTrackCount(): number {
  const db = getDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM tracks").get() as { count: number };
  return result.count;
}

export function getTracksByReleaseType(releaseType: string): Track[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM tracks WHERE release_type = ?").all(releaseType) as RawTrackRow[];
  return rows.map(parseTrack);
}

export function searchTracks(query: string): Track[] {
  const db = getDb();
  const pattern = `%${query}%`;
  const rows = db
    .prepare("SELECT * FROM tracks WHERE title LIKE ? OR release_type LIKE ? OR lyrics LIKE ?")
    .all(pattern, pattern, pattern) as RawTrackRow[];
  return rows.map(parseTrack);
}
