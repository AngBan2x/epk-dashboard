#!/usr/bin/env tsx
/**
 * Seed: URLs Frescas desde iTunes Search API
 * Reemplaza URLs caducadas del CDN de Apple con URLs obtenidas de la API de búsqueda
 */
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

interface TrackSeed {
  id: string;
  title: string;
  artist_name: string;
  release_type: string;
  release_date: string;
  duration: string;
  itunes_search_term: string;
  spotify_url: string | null;
  youtube_video_id: string | null;
  itunes_track_id: string | null;
  metrics: object;
  production_details: object;
  lyrics: string | null;
  stems_urls: object | null;
  video_embed_url: string | null;
}

const tracksToSeed: TrackSeed[] = [
  {
    id: "trk-001",
    title: "Bohemian Rhapsody",
    artist_name: "Queen",
    release_type: "Single",
    release_date: "1975-10-31",
    duration: "05:55",
    itunes_search_term: "Bohemian Rhapsody Queen",
    spotify_url: "https://open.spotify.com/track/7tFiyTwD0nx5a1eklYtX2J",
    youtube_video_id: "fJ9rUzIMcZQ",
    itunes_track_id: "158672215",
    metrics: { streams: 2100000, saves: 195000, playlist_additions: 64000, top_countries: [{ country: "Reino Unido", pct: 28 }, { country: "Estados Unidos", pct: 35 }, { country: "España", pct: 12 }, { country: "Alemania", pct: 10 }] },
    production_details: { daw: "EMI Studios (16-track tape)", guitars: "Brian May Red Special", effects_chain: "Deacy Amp + AC30 + Univibe", tuning: "Standard E", key: "B♭ Major / Multiple Modulations" },
    lyrics: "Is this the real life? Is this just fantasy?\nCaught in a landslide, no escape from reality...\n[Coro]\nMama, just killed a man...",
    stems_urls: null,
    video_embed_url: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
  },
  {
    id: "trk-002",
    title: "Smells Like Teen Spirit",
    artist_name: "Nirvana",
    release_type: "Single",
    release_date: "1991-09-10",
    duration: "05:01",
    itunes_search_term: "Smells Like Teen Spirit Nirvana",
    spotify_url: "https://open.spotify.com/track/5ghIJDpPoe3CfHMGu71E6T",
    youtube_video_id: "hTWKbfoikeg",
    itunes_track_id: "1440733396",
    metrics: { streams: 1850000, saves: 172000, playlist_additions: 58500, top_countries: [{ country: "Estados Unidos", pct: 38 }, { country: "Reino Unido", pct: 22 }, { country: "Canadá", pct: 11 }, { country: "Australia", pct: 9 }] },
    production_details: { daw: "Smart Studios (8-track)", guitars: "Fender Mustang / Univox Hi-Flier", effects_chain: "ProCo RAT Distortion + Boss DS-1", tuning: "Drop D", key: "F minor" },
    lyrics: "Load up on guns, bring your friends\nIt's fun to lose and to pretend...\n[Coro]\nHello, hello, hello, how low...",
    stems_urls: null,
    video_embed_url: "https://www.youtube.com/watch?v=hTWKbfoikeg",
  },
  {
    id: "trk-003",
    title: "Blinding Lights",
    artist_name: "The Weeknd",
    release_type: "Single",
    release_date: "2019-11-29",
    duration: "03:20",
    itunes_search_term: "Blinding Lights Weeknd",
    spotify_url: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
    youtube_video_id: "4NRXx6U8ABQ",
    itunes_track_id: "1488408568",
    metrics: { streams: 4250000, saves: 310000, playlist_additions: 98000, top_countries: [{ country: "Estados Unidos", pct: 32 }, { country: "México", pct: 18 }, { country: "Brasil", pct: 14 }, { country: "Filipinas", pct: 8 }] },
    production_details: { daw: "Pro Tools / Logic Pro", guitars: null, effects_chain: "Roland JX-3P Synth + Juno-106 + TR-808", tuning: "Standard E", key: "F minor" },
    lyrics: "I've been tryna call\nI've been on my own for long enough...\n[Coro]\nI said, ooh, I'm blinded by the lights...",
    stems_urls: null,
    video_embed_url: "https://www.youtube.com/watch?v=4NRXx6U8ABQ",
  },
  {
    id: "trk-004",
    title: "Hotel California",
    artist_name: "Eagles",
    release_type: "Album",
    release_date: "1977-02-22",
    duration: "06:30",
    itunes_search_term: "Hotel California Eagles",
    spotify_url: "https://open.spotify.com/track/40riOy7x9W7GXjyGp4pjAv",
    youtube_video_id: "BciS5krYL80",
    itunes_track_id: "1440672824",
    metrics: { streams: 1620000, saves: 148000, playlist_additions: 52000, top_countries: [{ country: "Estados Unidos", pct: 42 }, { country: "México", pct: 20 }, { country: "Colombia", pct: 10 }, { country: "Argentina", pct: 8 }] },
    production_details: { daw: "Criteria Studios (16-track analog)", guitars: "Gibson Les Paul / Telecaster", effects_chain: "MXR Phase 90 + Echoplex + Clean Fender amp", tuning: "Standard E / Drop E", key: "B minor" },
    lyrics: "On a dark desert highway, cool wind in my hair\nWarm smell of colitas rising up through the air...\n[Coro]\nWelcome to the Hotel California...",
    stems_urls: null,
    video_embed_url: "https://www.youtube.com/watch?v=BciS5krYL80",
  },
  {
    id: "trk-005",
    title: "Shape of You",
    artist_name: "Ed Sheeran",
    release_type: "Single",
    release_date: "2017-01-06",
    duration: "03:53",
    itunes_search_term: "Shape of You Ed Sheeran",
    spotify_url: "https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3",
    youtube_video_id: "JGwWNGJdvx8",
    itunes_track_id: "1193701079",
    metrics: { streams: 3800000, saves: 290000, playlist_additions: 88000, top_countries: [{ country: "Reino Unido", pct: 30 }, { country: "Estados Unidos", pct: 28 }, { country: "India", pct: 12 }, { country: "Australia", pct: 8 }] },
    production_details: { daw: "Logic Pro X", guitars: null, effects_chain: "Steel Pans + Violin Loop + Loop Pedal", tuning: "Standard E", key: "E♭ Major" },
    lyrics: "The club isn't the best place to find a lover\nSo the bar is where I go...\n[Coro]\nI'm in love with the shape of you...",
    stems_urls: null,
    video_embed_url: "https://www.youtube.com/watch?v=JGwWNGJdvx8",
  },
  {
    id: "trk-006",
    title: "Running Up That Hill",
    artist_name: "Kate Bush",
    release_type: "Album",
    release_date: "1985-08-05",
    duration: "05:02",
    itunes_search_term: "Running Up That Hill Kate Bush",
    spotify_url: "https://open.spotify.com/track/75FEaRjZTKLhTrFGsfMUXR",
    youtube_video_id: "wp43OdtAAkM",
    itunes_track_id: "1440831175",
    metrics: { streams: 1920000, saves: 178000, playlist_additions: 62000, top_countries: [{ country: "Reino Unido", pct: 32 }, { country: "Estados Unidos", pct: 30 }, { country: "Australia", pct: 12 }, { country: "Canadá", pct: 9 }] },
    production_details: { daw: "Analog 24-track tape (Abbey Road)", guitars: null, effects_chain: "Fairlight CMI + Simmons SDS-V Drums + Moog Bass", tuning: "Standard E", key: "C major" },
    lyrics: "It doesn't hurt me\nDo you want to feel how it feels?...\n[Coro]\nIf I only could, I'd make a deal with God...",
    stems_urls: null,
    video_embed_url: "https://www.youtube.com/watch?v=wp43OdtAAkM",
  },
];

async function fetchITunesData(searchTerm: string): Promise<{ previewUrl: string; artworkUrl600: string } | null> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=1&media=music`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.results || data.results.length === 0) return null;

    const track = data.results[0];
    return {
      previewUrl: track.previewUrl || "",
      artworkUrl600: (track.artworkUrl100 || "").replace(/\/\d+x\d+bb\./, "/600x600bb."),
    };
  } catch (error) {
    console.error(`  ❌ Error fetching iTunes data for "${searchTerm}":`, error);
    return null;
  }
}

function formatDuration(millis: number): string {
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

async function main() {
  console.log("🌱 Seed: Obteniendo URLs frescas desde iTunes Search API...\n");

  const db = new Database(DB_PATH);

  // Eliminar todos los tracks existentes
  db.exec("DELETE FROM tracks");
  console.log("🗑️  Tabla tracks vaciada");

  const upsertTrack = db.prepare(`
    INSERT OR REPLACE INTO tracks (
      id, title, artist_name, release_type, release_date, duration, cover_image,
      audio_preview_url, spotify_url, youtube_video_id, itunes_track_id,
      metrics, production_details, lyrics, stems_urls, video_embed_url, gallery_images
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    // Process tracks synchronously within the transaction
    for (const track of tracksToSeed) {
      // We'll use placeholder URLs and update them after the transaction
      upsertTrack.run(
        track.id,
        track.title,
        track.artist_name,
        track.release_type,
        track.release_date,
        track.duration,
        "", // cover_image placeholder
        "", // audio_preview_url placeholder
        track.spotify_url,
        track.youtube_video_id,
        track.itunes_track_id,
        JSON.stringify(track.metrics),
        JSON.stringify(track.production_details),
        track.lyrics,
        track.stems_urls ? JSON.stringify(track.stems_urls) : null,
        track.video_embed_url,
        null // gallery_images
      );
    }
  });

  insertAll();
  console.log("✅ Tracks insertados con placeholders\n");

  // Now fetch fresh URLs and update each track
  console.log("🔍 Obteniendo URLs frescas de iTunes...\n");

  for (const track of tracksToSeed) {
    const iTunesData = await fetchITunesData(track.itunes_search_term);

    if (iTunesData) {
      const updateStmt = db.prepare(`
        UPDATE tracks SET cover_image = ?, audio_preview_url = ? WHERE id = ?
      `);
      updateStmt.run(iTunesData.artworkUrl600, iTunesData.previewUrl, track.id);
      console.log(`  ✅ ${track.id}: ${track.title} - URLs actualizadas`);
    } else {
      console.log(`  ⚠️  ${track.id}: ${track.title} - No se encontraron datos en iTunes`);
    }

    // Small delay to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const totalTracks = db.prepare("SELECT COUNT(*) as count FROM tracks").get() as { count: number };
  console.log(`\n📊 Total tracks en DB: ${totalTracks.count}`);
  console.log("✅ Seed con URLs frescas completado\n");

  db.close();
}

main();
