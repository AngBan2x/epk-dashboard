import { createClient, type Client, type InValue } from "@libsql/client";
import type {
  RawTrackRow,
  SyncResult,
  ArtistProfile,
  User,
  RawUserRow,
  TrackSubmission,
  RawTrackSubmissionRow,
  Like,
  RawLikeRow,
  Notification,
  RawNotificationRow,
  MetricsHistory,
  RawMetricsHistoryRow,
  Show,
  RawShowRow,
  TopCountry,
} from "@/types/music";
import { safeString, safeNumber, safeArray, safeParseJSON } from "@/lib/null-safe";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

let _turso: Client | null = null;

export function getTursoClient(): Client | null {
  if (!TURSO_URL || !TURSO_TOKEN) return null;
  if (!_turso) {
    _turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  }
  return _turso;
}

// Keep legacy alias
function getTurso(): Client | null {
  return getTursoClient();
}

// ─── Schema: 7 tablas completas ─────────────────────────────────────────────

export async function ensureTursoSchema(): Promise<boolean> {
  const client = getTurso();
  if (!client) {
    console.warn("⚠️ Turso no configurado (faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN)");
    return false;
  }

  // 1. tracks (con columnas multimedia F8)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist_name TEXT,
      release_type TEXT,
      release_date TEXT,
      duration TEXT,
      cover_image TEXT,
      audio_preview_url TEXT,
      spotify_url TEXT,
      youtube_video_id TEXT,
      metrics TEXT,
      production_details TEXT,
      lyrics TEXT,
      itunes_track_id TEXT,
      stems_urls TEXT,
      video_embed_url TEXT,
      gallery_images TEXT
    )
  `);

  // 2. artists (con user_id FK)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      user_id TEXT,
      biography TEXT,
      press_text TEXT,
      press_highlights TEXT,
      genre TEXT,
      location TEXT,
      monthly_listeners INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 3. users
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'artist',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 4. track_submissions
  await client.execute(`
    CREATE TABLE IF NOT EXISTS track_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      track_data TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      admin_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 5. likes
  await client.execute(`
    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (track_id) REFERENCES tracks(id),
      UNIQUE(user_id, track_id)
    )
  `);

  // 6. notifications
  await client.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 7. metrics_history
  await client.execute(`
    CREATE TABLE IF NOT EXISTS metrics_history (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      date TEXT NOT NULL,
      streams INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      playlist_additions INTEGER DEFAULT 0,
      top_countries TEXT,
      source TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (track_id) REFERENCES tracks(id)
    )
  `);

  // 8. shows
  await client.execute(`
    CREATE TABLE IF NOT EXISTS shows (
      id TEXT PRIMARY KEY,
      artist_id TEXT NOT NULL,
      venue_name TEXT NOT NULL,
      city TEXT,
      country TEXT,
      date TEXT,
      time TEXT,
      price_range TEXT,
      status TEXT DEFAULT 'disponible',
      ticket_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (artist_id) REFERENCES artists(id)
    )
  `);

  return true;
}

// ─── Sync: Tracks ───────────────────────────────────────────────────────────

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
              (id, title, artist_name, release_type, release_date, duration, cover_image,
               audio_preview_url, spotify_url, youtube_video_id, metrics,
               production_details, lyrics, itunes_track_id, stems_urls,
               video_embed_url, gallery_images)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          track.id,
          track.title,
          track.artist_name ?? null,
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
          track.itunes_track_id ?? null,
          track.stems_urls ?? null,
          track.video_embed_url ?? null,
          track.gallery_images ?? null,
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

// ─── Sync: Artists ──────────────────────────────────────────────────────────

export async function syncArtistsToTurso(artists: ArtistProfile[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: artists.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const artist of artists) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO artists
              (id, name, user_id, biography, press_text, press_highlights,
               genre, location, monthly_listeners, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          artist.id,
          artist.name,
          artist.user_id ?? null,
          artist.biography ?? null,
          artist.press_text ?? null,
          JSON.stringify(artist.press_highlights ?? []),
          artist.genre ?? null,
          artist.location ?? null,
          artist.monthly_listeners ?? 0,
          artist.created_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync artist ${artist.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Users ────────────────────────────────────────────────────────────

export async function syncUsersToTurso(users: User[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: users.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO users
              (id, name, email, password_hash, role, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          user.id,
          user.name,
          user.email,
          user.password_hash,
          user.role,
          user.created_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync user ${user.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Track Submissions ────────────────────────────────────────────────

export async function syncSubmissionsToTurso(submissions: TrackSubmission[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: submissions.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const sub of submissions) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO track_submissions
              (id, user_id, track_data, status, admin_notes, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          sub.id,
          sub.user_id,
          sub.track_data,
          sub.status,
          sub.admin_notes ?? null,
          sub.created_at,
          sub.updated_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync submission ${sub.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Likes ────────────────────────────────────────────────────────────

export async function syncLikesToTurso(likes: Like[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: likes.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const like of likes) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO likes
              (id, user_id, track_id, created_at)
              VALUES (?, ?, ?, ?)`,
        args: [like.id, like.user_id, like.track_id, like.created_at],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync like ${like.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Notifications ────────────────────────────────────────────────────

export async function syncNotificationsToTurso(notifications: Notification[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: notifications.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const notif of notifications) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO notifications
              (id, user_id, type, title, message, data, read, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          notif.id,
          notif.user_id,
          notif.type,
          notif.title,
          notif.message,
          notif.data ?? null,
          notif.read ? 1 : 0,
          notif.created_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync notification ${notif.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Metrics History ──────────────────────────────────────────────────

export async function syncMetricsHistoryToTurso(metrics: MetricsHistory[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: metrics.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const m of metrics) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO metrics_history
              (id, track_id, date, streams, saves, playlist_additions, top_countries, source, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          m.id,
          m.track_id,
          m.date,
          m.streams,
          m.saves,
          m.playlist_additions,
          JSON.stringify(m.top_countries),
          m.source,
          m.created_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync metrics ${m.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Shows ────────────────────────────────────────────────────────────

export async function syncShowsToTurso(shows: Show[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: shows.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const show of shows) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO shows
              (id, artist_id, venue_name, city, country, date, time, price_range, status, ticket_url, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          show.id,
          show.artist_id,
          show.venue_name,
          show.city ?? null,
          show.country ?? null,
          show.date ?? null,
          show.time ?? null,
          show.price_range ?? null,
          show.status,
          show.ticket_url ?? null,
          show.created_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync show ${show.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Fetch helpers ──────────────────────────────────────────────────────────
// NOTE: Cache busting for SELECT queries (same issue as db.ts)

let _tursoQueryCounter = 0;

function bustSelectCache(sql: string): string {
  if (sql.trimStart().toUpperCase().startsWith("SELECT")) {
    return `${sql} /*q${_tursoQueryCounter++}*/`;
  }
  return sql;
}

export async function fetchTursoTracks(): Promise<RawTrackRow[]> {
  const client = getTurso();
  if (!client) return [];

  const result = await client.execute(bustSelectCache("SELECT * FROM tracks"));
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

  const result = await client.execute(bustSelectCache("SELECT COUNT(*) as count FROM tracks"));
  const row = result.rows[0] as unknown as { count: number } | undefined;
  return row?.count ?? 0;
}

export function isTursoConfigured(): boolean {
  return getTurso() !== null;
}
