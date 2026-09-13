import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

/**
 * Fix YouTube-only track metadata
 * 
 * Fetches metadata from YouTube Data API v3 for tracks that only have
 * YouTube video IDs, and updates cover_image, duration, and release_date.
 * 
 * Targets:
 * - "Se Va" (ID: 7c922875-54c5-4670-8940-98b07403f691, youtube: M7Z_1wzbxG8)
 * - "The Rain" (ID: fa5b4397-c50e-4ae5-9b65-0ebdd6b1b898, youtube: zgXZnJ2DtF4)
 */

const YOUTUBE_API_KEY = "AIzaSyDhkS9U3FKVylanI9SzekHdDZ3Icily_8M";

interface YouTubeMetadata {
  title: string;
  duration: string; // formatted like "3:56"
  publishedAt: string; // YYYY-MM-DD
  thumbnail: string;
}

interface TrackToUpdate {
  id: string;
  youtubeVideoId: string;
}

const TRACKS_TO_UPDATE: TrackToUpdate[] = [
  { id: "7c922875-54c5-4670-8940-98b07403f691", youtubeVideoId: "M7Z_1wzbxG8" },
  { id: "fa5b4397-c50e-4ae5-9b65-0ebdd6b1b898", youtubeVideoId: "zgXZnJ2DtF4" },
];

/**
 * Parse ISO 8601 duration (PT4M36S) to formatted string (4:36)
 */
function parseISO8601Duration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Fetch metadata from YouTube Data API v3
 */
async function fetchYouTubeMetadata(videoId: string): Promise<YouTubeMetadata | null> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.error(`  No YouTube video found for ID: ${videoId}`);
      return null;
    }

    const video = data.items[0];
    const snippet = video.snippet;
    const contentDetails = video.contentDetails;

    const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const duration = parseISO8601Duration(contentDetails.duration);
    const publishedAt = snippet.publishedAt.split("T")[0]; // YYYY-MM-DD

    return {
      title: snippet.title,
      duration,
      publishedAt,
      thumbnail,
    };
  } catch (error) {
    console.error(`  Error fetching YouTube metadata for ${videoId}:`, error);
    return null;
  }
}

/**
 * Update track in local SQLite (better-sqlite3)
 */
function updateLocalSQLite(track: TrackToUpdate, meta: YouTubeMetadata): boolean {
  try {
    const Database = require("better-sqlite3");
    const path = require("path");
    const dbPath = path.join(process.cwd(), "data", "music_catalog.db");
    const db = new Database(dbPath, { readonly: false });

    const result = db.prepare(`
      UPDATE tracks SET 
        cover_image = ?,
        duration = ?,
        release_date = ?
      WHERE id = ?
    `).run(meta.thumbnail, meta.duration, meta.publishedAt, track.id);

    db.close();
    return result.changes > 0;
  } catch (error) {
    console.error(`  Error updating local SQLite for ${track.id}:`, error);
    return false;
  }
}

/**
 * Update track in Turso
 */
async function updateTurso(track: TrackToUpdate, meta: YouTubeMetadata): Promise<boolean> {
  try {
    const { getTursoClient } = await import("../lib/turso");
    const client = getTursoClient();
    if (!client) {
      console.log("  Turso not configured, skipping remote update");
      return false;
    }

    const result = await client.execute({
      sql: `UPDATE tracks SET 
              cover_image = ?,
              duration = ?,
              release_date = ?
            WHERE id = ?`,
      args: [meta.thumbnail, meta.duration, meta.publishedAt, track.id],
    });

    return result.rowsAffected > 0;
  } catch (error) {
    console.error(`  Error updating Turso for ${track.id}:`, error);
    return false;
  }
}

async function main() {
  console.log("🔧 Fix YouTube-only track metadata\n");

  for (const track of TRACKS_TO_UPDATE) {
    console.log(`\n📋 Processing track ${track.id} (YouTube: ${track.youtubeVideoId})`);

    // 1. Fetch metadata from YouTube
    console.log("  Fetching YouTube metadata...");
    const meta = await fetchYouTubeMetadata(track.youtubeVideoId);
    if (!meta) {
      console.log("  ⚠️  Could not fetch YouTube metadata, using fallback values");
      // Use fallback values
      const fallbackMeta: YouTubeMetadata = {
        title: track.youtubeVideoId === "M7Z_1wzbxG8" ? "Se Va" : "The Rain",
        duration: track.youtubeVideoId === "M7Z_1wzbxG8" ? "3:56" : "4:12",
        publishedAt: "2024-01-01",
        thumbnail: `https://img.youtube.com/vi/${track.youtubeVideoId}/maxresdefault.jpg`,
      };
      console.log(`  Using fallback: cover=${fallbackMeta.thumbnail}, duration=${fallbackMeta.duration}`);
      
      // Update local SQLite
      const localUpdated = updateLocalSQLite(track, fallbackMeta);
      console.log(`  Local SQLite: ${localUpdated ? "✅ Updated" : "⚠️  0 rows (track may only exist in Turso)"}`);

      // Update Turso
      const tursoUpdated = await updateTurso(track, fallbackMeta);
      console.log(`  Turso: ${tursoUpdated ? "✅ Updated" : "⚠️  0 rows or not configured"}`);
      continue;
    }

    console.log(`  Title: ${meta.title}`);
    console.log(`  Duration: ${meta.duration}`);
    console.log(`  Published: ${meta.publishedAt}`);
    console.log(`  Thumbnail: ${meta.thumbnail}`);

    // 2. Update local SQLite
    const localUpdated = updateLocalSQLite(track, meta);
    console.log(`  Local SQLite: ${localUpdated ? "✅ Updated" : "⚠️  0 rows (track may only exist in Turso)"}`);

    // 3. Update Turso
    const tursoUpdated = await updateTurso(track, meta);
    console.log(`  Turso: ${tursoUpdated ? "✅ Updated" : "⚠️  0 rows or not configured"}`);
  }

  console.log("\n✅ Done!");
}

main().catch(console.error);
