import { createClient, type Client } from "@libsql/client";
import type { RawTrackRow, SyncResult, ArtistProfile } from "@/types/music";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

let _turso: Client | null = null;

function getTurso(): Client | null {
  if (!TURSO_URL || !TURSO_TOKEN) return null;
  if (!_turso) {
    _turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  }
  return _turso;
}

export async function ensureTursoSchema(): Promise<boolean> {
  const client = getTurso();
  if (!client) {
    console.warn("⚠️ Turso no configurado (faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN)");
    return false;
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      release_type TEXT,
      release_date TEXT,
      duration TEXT,
      cover_image TEXT,
      audio_preview_url TEXT,
      spotify_url TEXT,
      youtube_video_id TEXT,
      metrics TEXT,
      production_details TEXT,
      lyrics TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      biography TEXT,
      press_text TEXT,
      press_highlights TEXT,
      genre TEXT,
      location TEXT,
      monthly_listeners INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return true;
}

export async function syncLocalToTurso(localTracks: RawTrackRow[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: localTracks.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const track of localTracks) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO tracks
              (id, title, release_type, release_date, duration, cover_image,
               audio_preview_url, spotify_url, youtube_video_id, metrics,
               production_details, lyrics)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          track.id,
          track.title,
          track.release_type,
          track.release_date,
          track.duration,
          track.cover_image,
          track.audio_preview_url,
          track.spotify_url,
          track.youtube_video_id,
          track.metrics,
          track.production_details,
          track.lyrics,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync ${track.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

export async function fetchTursoTracks(): Promise<RawTrackRow[]> {
  const client = getTurso();
  if (!client) return [];

  const result = await client.execute("SELECT * FROM tracks");
  return result.rows as unknown as RawTrackRow[];
}

export async function deleteTursoTrack(id: string): Promise<boolean> {
  const client = getTurso();
  if (!client) return false;

  await client.execute({ sql: "DELETE FROM tracks WHERE id = ?", args: [id] });
  return true;
}

export async function getTursoTrackCount(): Promise<number> {
  const client = getTurso();
  if (!client) return 0;

  const result = await client.execute("SELECT COUNT(*) as count FROM tracks");
  const row = result.rows[0] as unknown as { count: number } | undefined;
  return row?.count ?? 0;
}

export function isTursoConfigured(): boolean {
  return getTurso() !== null;
}
