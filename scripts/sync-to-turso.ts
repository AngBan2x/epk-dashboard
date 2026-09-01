#!/usr/bin/env tsx
/**
 * Sync ALL tables from local SQLite → Turso remote
 *
 * Tables synced:
 *   tracks, artists, users, track_submissions,
 *   likes, notifications, metrics_history, shows
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, type InValue } from "@libsql/client";
import Database from "better-sqlite3";
import path from "path";

const TURSO_URL = process.env.TURSO_DATABASE_URL?.replace(/^"|"$/g, "");
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN?.replace(/^"|"$/g, "");

async function ensureSchema(turso: ReturnType<typeof createClient>) {
  // 1. tracks
  await turso.execute(`
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

  // 2. artists
  await turso.execute(`
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
  await turso.execute(`
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
  await turso.execute(`
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
  await turso.execute(`
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
  await turso.execute(`
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
  await turso.execute(`
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
  await turso.execute(`
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncTable(turso: ReturnType<typeof createClient>, tableName: string, columns: string[], localRows: Record<string, unknown>[]) {
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT OR REPLACE INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`;

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of localRows) {
    try {
      const args = columns.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return null;
        if (typeof val === "object") return JSON.stringify(val);
        return val as InValue;
      });
      await turso.execute({ sql, args });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error in row ${row.id ?? "?"}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

async function main() {
  console.log("🔄 Sincronizando SQLite → Turso (ALL TABLES)...\n");

  if (!TURSO_URL || !TURSO_TOKEN) {
    console.error("❌ Variables de entorno requeridas: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN");
    process.exit(1);
  }

  const localDb = new Database(path.join(process.cwd(), "data", "music_catalog.db"), { readonly: true });
  const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  // Ensure all tables exist in Turso
  await ensureSchema(turso);

  // ─── 1. Tracks ──────────────────────────────────────────────────────────
  const tracks = localDb.prepare("SELECT * FROM tracks").all() as Record<string, unknown>[];
  console.log(`📦 ${tracks.length} tracks encontrados en SQLite local`);
  const trackCols = [
    "id", "title", "artist_name", "release_type", "release_date", "duration",
    "cover_image", "audio_preview_url", "spotify_url", "youtube_video_id",
    "metrics", "production_details", "lyrics",
    "itunes_track_id", "stems_urls", "video_embed_url", "gallery_images",
  ];
  const trackResult = await syncTable(turso, "tracks", trackCols, tracks);
  console.log(`  ✅ ${trackResult.synced} tracks sincronizados (${trackResult.failed} fallos)`);

  // ─── 2. Artists ─────────────────────────────────────────────────────────
  const artists = localDb.prepare("SELECT * FROM artists").all() as Record<string, unknown>[];
  console.log(`\n👤 ${artists.length} artistas encontrados en SQLite local`);
  const artistCols = [
    "id", "name", "user_id", "biography", "press_text", "press_highlights",
    "genre", "location", "monthly_listeners", "created_at",
  ];
  const artistResult = await syncTable(turso, "artists", artistCols, artists);
  console.log(`  ✅ ${artistResult.synced} artistas sincronizados (${artistResult.failed} fallos)`);

  // ─── 3. Users ───────────────────────────────────────────────────────────
  const users = localDb.prepare("SELECT * FROM users").all() as Record<string, unknown>[];
  console.log(`\n🔐 ${users.length} usuarios encontrados en SQLite local`);
  const userCols = ["id", "name", "email", "password_hash", "role", "created_at"];
  const userResult = await syncTable(turso, "users", userCols, users);
  console.log(`  ✅ ${userResult.synced} usuarios sincronizados (${userResult.failed} fallos)`);

  // ─── 4. Track Submissions ───────────────────────────────────────────────
  const submissions = localDb.prepare("SELECT * FROM track_submissions").all() as Record<string, unknown>[];
  console.log(`\n📝 ${submissions.length} submissions encontrados en SQLite local`);
  const subCols = ["id", "user_id", "track_data", "status", "admin_notes", "created_at", "updated_at"];
  const subResult = await syncTable(turso, "track_submissions", subCols, submissions);
  console.log(`  ✅ ${subResult.synced} submissions sincronizados (${subResult.failed} fallos)`);

  // ─── 5. Likes ───────────────────────────────────────────────────────────
  const likes = localDb.prepare("SELECT * FROM likes").all() as Record<string, unknown>[];
  console.log(`\n❤️  ${likes.length} likes encontrados en SQLite local`);
  const likeCols = ["id", "user_id", "track_id", "created_at"];
  const likeResult = await syncTable(turso, "likes", likeCols, likes);
  console.log(`  ✅ ${likeResult.synced} likes sincronizados (${likeResult.failed} fallos)`);

  // ─── 6. Notifications ───────────────────────────────────────────────────
  const notifications = localDb.prepare("SELECT * FROM notifications").all() as Record<string, unknown>[];
  console.log(`\n🔔 ${notifications.length} notificaciones encontradas en SQLite local`);
  const notifCols = ["id", "user_id", "type", "title", "message", "data", "read", "created_at"];
  const notifResult = await syncTable(turso, "notifications", notifCols, notifications);
  console.log(`  ✅ ${notifResult.synced} notificaciones sincronizadas (${notifResult.failed} fallos)`);

  // ─── 7. Metrics History ─────────────────────────────────────────────────
  const metricsHistory = localDb.prepare("SELECT * FROM metrics_history").all() as Record<string, unknown>[];
  console.log(`\n📊 ${metricsHistory.length} metrics history encontrados en SQLite local`);
  const metricsCols = [
    "id", "track_id", "date", "streams", "saves", "playlist_additions",
    "top_countries", "source", "created_at",
  ];
  const metricsResult = await syncTable(turso, "metrics_history", metricsCols, metricsHistory);
  console.log(`  ✅ ${metricsResult.synced} metrics sincronizados (${metricsResult.failed} fallos)`);

  // ─── 8. Shows ───────────────────────────────────────────────────────────
  const shows = localDb.prepare("SELECT * FROM shows").all() as Record<string, unknown>[];
  console.log(`\n🎤 ${shows.length} shows encontrados en SQLite local`);
  const showCols = [
    "id", "artist_id", "venue_name", "city", "country", "date",
    "time", "price_range", "status", "ticket_url", "created_at",
  ];
  const showResult = await syncTable(turso, "shows", showCols, shows);
  console.log(`  ✅ ${showResult.synced} shows sincronizados (${showResult.failed} fallos)`);

  // ─── Summary ────────────────────────────────────────────────────────────
  const totalSynced =
    trackResult.synced + artistResult.synced + userResult.synced +
    subResult.synced + likeResult.synced + notifResult.synced +
    metricsResult.synced + showResult.synced;
  const totalFailed =
    trackResult.failed + artistResult.failed + userResult.failed +
    subResult.failed + likeResult.failed + notifResult.failed +
    metricsResult.failed + showResult.failed;

  console.log(`\n📊 Resumen total: ${totalSynced} registros sincronizados, ${totalFailed} fallos`);
  console.log("✅ Sincronización completada");

  localDb.close();
}

main().catch(console.error);
