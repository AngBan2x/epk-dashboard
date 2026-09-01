#!/usr/bin/env tsx

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, type InValue } from "@libsql/client";
import Database from "better-sqlite3";
import path from "path";

const TURSO_URL = process.env.TURSO_DATABASE_URL?.replace(/^"|"$/g, "");
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN?.replace(/^"|"$/g, "");

async function main() {
  console.log("🔄 Sincronizando SQLite → Turso...\n");

  if (!TURSO_URL || !TURSO_TOKEN) {
    console.error("❌ Variables de entorno requeridas: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN");
    process.exit(1);
  }

  const localDb = new Database(path.join(process.cwd(), "data", "music_catalog.db"), { readonly: true });
  const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  await turso.execute(`
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

  await turso.execute(`
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

  const tracks = localDb.prepare("SELECT * FROM tracks").all();
  console.log(`📦 ${tracks.length} tracks encontrados en SQLite local`);

  let synced = 0;
  for (const track of tracks) {
    const t = track as Record<string, unknown>;
    await turso.execute({
      sql: "INSERT OR REPLACE INTO tracks (id, title, release_type, release_date, duration, cover_image, audio_preview_url, spotify_url, youtube_video_id, metrics, production_details, lyrics) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [t.id, t.title, t.release_type, t.release_date, t.duration, t.cover_image, t.audio_preview_url, t.spotify_url, t.youtube_video_id, t.metrics, t.production_details, t.lyrics] as InValue[],
    });
    synced++;
    console.log(`  ✅ ${t.id}: ${t.title}`);
  }

  // Sync artists
  const artists = localDb.prepare("SELECT * FROM artists").all();
  console.log(`\n👤 ${artists.length} artistas encontrados en SQLite local`);

  let artistSynced = 0;
  for (const artist of artists) {
    const a = artist as Record<string, unknown>;
    await turso.execute({
      sql: "INSERT OR REPLACE INTO artists (id, name, biography, press_text, press_highlights, genre, location, monthly_listeners, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [a.id, a.name, a.biography, a.press_text, a.press_highlights, a.genre, a.location, a.monthly_listeners, a.created_at] as InValue[],
    });
    artistSynced++;
    console.log(`  ✅ ${a.id}: ${a.name}`);
  }

  console.log(`\n📊 ${synced} tracks y ${artistSynced} artistas sincronizados a Turso`);
  console.log("✅ Sincronización completada");

  localDb.close();
}

main().catch(console.error);
