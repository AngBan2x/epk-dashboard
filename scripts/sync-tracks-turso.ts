import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { getTursoClient } = await import("../lib/turso");
  const client = getTursoClient();
  if (!client) { console.log("Turso not configured"); return; }

  const Database = require("better-sqlite3");
  const path = require("path");
  const db = new Database(path.join(process.cwd(), "data", "music_catalog.db"));
  
  const tracks = db.prepare("SELECT * FROM tracks").all();
  console.log(`Found ${tracks.length} tracks in local SQLite`);
  
  for (const track of tracks) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO tracks (id, title, artist_name, release_type, release_date, duration, cover_image, audio_preview_url, spotify_url, youtube_video_id, metrics, production_details, lyrics, itunes_track_id, stems_urls, video_embed_url, gallery_images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          track.id, track.title, track.artist_name || null, track.release_type || null,
          track.release_date || null, track.duration || null, track.cover_image || null,
          track.audio_preview_url || null, track.spotify_url || null, track.youtube_video_id || null,
          track.metrics || null, track.production_details || null, track.lyrics || null,
          track.itunes_track_id || null, track.stems_urls || null, track.video_embed_url || null,
          track.gallery_images || null
        ]
      });
    } catch (error) {
      console.error(`  Error syncing track ${track.title}:`, error);
    }
  }
  
  const result = await client.execute("SELECT COUNT(*) as count FROM tracks");
  console.log(`Tracks in Turso: ${result.rows[0].count}`);
}

main();
