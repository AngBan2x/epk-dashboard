import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { getTursoClient } = await import("../lib/turso");
  const client = getTursoClient();
  if (!client) { console.log("Turso not configured"); return; }

  // Drop all tables and recreate with full schema
  const tables = ["shows", "metrics_history", "notifications", "likes", "track_submissions", "artists", "tracks", "users"];
  for (const t of tables) {
    await client.execute(`DROP TABLE IF EXISTS ${t}`);
    console.log(`Dropped ${t}`);
  }

  // Recreate all tables with full schema
  await client.execute(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT DEFAULT 'artist', created_at TEXT DEFAULT (datetime('now')))`);
  console.log("Created users");

  await client.execute(`CREATE TABLE tracks (id TEXT PRIMARY KEY, title TEXT NOT NULL, artist_name TEXT, release_type TEXT, release_date TEXT, duration TEXT, cover_image TEXT, audio_preview_url TEXT, spotify_url TEXT, youtube_video_id TEXT, metrics TEXT, production_details TEXT, lyrics TEXT, itunes_track_id TEXT, stems_urls TEXT, video_embed_url TEXT, gallery_images TEXT)`);
  console.log("Created tracks");

  await client.execute(`CREATE TABLE artists (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, user_id TEXT, biography TEXT, press_text TEXT, press_highlights TEXT, genre TEXT, location TEXT, monthly_listeners INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id))`);
  console.log("Created artists");

  await client.execute(`CREATE TABLE track_submissions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, track_data TEXT NOT NULL, status TEXT DEFAULT 'pending', admin_notes TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id))`);
  console.log("Created track_submissions");

  await client.execute(`CREATE TABLE likes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, track_id TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (track_id) REFERENCES tracks(id))`);
  console.log("Created likes");

  await client.execute(`CREATE TABLE notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, data TEXT, read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id))`);
  console.log("Created notifications");

  await client.execute(`CREATE TABLE metrics_history (id TEXT PRIMARY KEY, track_id TEXT NOT NULL, date TEXT NOT NULL, streams INTEGER DEFAULT 0, saves INTEGER DEFAULT 0, shares INTEGER DEFAULT 0, top_countries TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (track_id) REFERENCES tracks(id))`);
  console.log("Created metrics_history");

  await client.execute(`CREATE TABLE shows (id TEXT PRIMARY KEY, artist_id TEXT NOT NULL, venue_name TEXT NOT NULL, city TEXT, country TEXT, date TEXT, time TEXT, price_range TEXT, status TEXT DEFAULT 'disponible', ticket_url TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (artist_id) REFERENCES artists(id))`);
  console.log("Created shows");

  // Now sync data from local SQLite
  const Database = require("better-sqlite3");
  const path = require("path");
  const db = new Database(path.join(process.cwd(), "data", "music_catalog.db"));

  // Sync users
  const users = db.prepare("SELECT * FROM users").all();
  for (const u of users) {
    await client.execute({
      sql: "INSERT OR REPLACE INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [u.id, u.name, u.email, u.password_hash, u.role, u.created_at || new Date().toISOString()]
    });
  }
  console.log(`Synced ${users.length} users`);

  // Sync tracks
  const tracks = db.prepare("SELECT * FROM tracks").all();
  for (const t of tracks) {
    await client.execute({
      sql: "INSERT OR REPLACE INTO tracks (id, title, artist_name, release_type, release_date, duration, cover_image, audio_preview_url, spotify_url, youtube_video_id, metrics, production_details, lyrics, itunes_track_id, stems_urls, video_embed_url, gallery_images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [t.id, t.title, t.artist_name || null, t.release_type || null, t.release_date || null, t.duration || null, t.cover_image || null, t.audio_preview_url || null, t.spotify_url || null, t.youtube_video_id || null, t.metrics || null, t.production_details || null, t.lyrics || null, t.itunes_track_id || null, t.stems_urls || null, t.video_embed_url || null, t.gallery_images || null]
    });
  }
  console.log(`Synced ${tracks.length} tracks`);

  // Sync artists
  const artists = db.prepare("SELECT * FROM artists").all();
  for (const a of artists) {
    await client.execute({
      sql: "INSERT OR REPLACE INTO artists (id, name, user_id, biography, press_text, press_highlights, genre, location, monthly_listeners, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [a.id, a.name, a.user_id || null, a.biography || null, a.press_text || null, a.press_highlights || null, a.genre || null, a.location || null, a.monthly_listeners || 0, a.created_at || new Date().toISOString()]
    });
  }
  console.log(`Synced ${artists.length} artists`);

  // Verify
  const r1 = await client.execute("SELECT COUNT(*) as c FROM users");
  const r2 = await client.execute("SELECT COUNT(*) as c FROM tracks");
  const r3 = await client.execute("SELECT COUNT(*) as c FROM artists");
  console.log(`\nVerification: ${r1.rows[0].c} users, ${r2.rows[0].c} tracks, ${r3.rows[0].c} artists in Turso`);
}

main();
