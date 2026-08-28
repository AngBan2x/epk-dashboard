#!/usr/bin/env tsx

import { createClient, type InValue } from "@libsql/client";
import Database from "better-sqlite3";
import path from "path";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

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

  console.log(`\n📊 ${synced} tracks sincronizados a Turso`);
  console.log("✅ Sincronización completada");

  localDb.close();
}

main().catch(console.error);
