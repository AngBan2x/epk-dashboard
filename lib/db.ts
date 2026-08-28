import Database from "better-sqlite3";
import path from "path";
import type { Track } from "@/types/music";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
  }
  return _db;
}

export function getAllTracks(): Track[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM tracks").all() as RawTrack[];
  return rows.map(parseTrack);
}

export function getTrackById(id: string): Track | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tracks WHERE id = ?").get(id) as RawTrack | undefined;
  return row ? parseTrack(row) : null;
}

interface RawTrack {
  id: string;
  title: string;
  release_type: string;
  release_date: string;
  duration: string;
  cover_image: string;
  audio_preview_url: string;
  spotify_url: string | null;
  youtube_video_id: string | null;
  metrics: string;
  production_details: string;
  lyrics: string | null;
}

function parseTrack(row: RawTrack): Track {
  return {
    id: row.id,
    title: row.title,
    release_type: row.release_type,
    release_date: row.release_date,
    duration: row.duration,
    cover_image: row.cover_image,
    audio_preview_url: row.audio_preview_url,
    spotify_url: row.spotify_url,
    youtube_video_id: row.youtube_video_id,
    metrics: JSON.parse(row.metrics),
    production_details: JSON.parse(row.production_details),
    lyrics: row.lyrics,
  };
}
