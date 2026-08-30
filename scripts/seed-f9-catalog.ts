#!/usr/bin/env tsx
/**
 * F9 Seed: Expande el catálogo con tracks reales con metadatos completos
 * Incluye portadas HD de iTunes, info de producción, stems y gallery images
 */
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

interface SeedTrack {
  id: string;
  title: string;
  release_type: string;
  release_date: string;
  duration: string;
  cover_image: string;
  audio_preview_url: string;
  spotify_url: string | null;
  youtube_video_id: string | null;
  itunes_track_id: string | null;
  metrics: object;
  production_details: object;
  lyrics: string | null;
  stems_urls: object | null;
  video_embed_url: string | null;
  gallery_images: string[] | null;
}

// Catálogo expandido: hits clásicos + proyectos independientes con metadatos completos
const expandedTracks: SeedTrack[] = [
  {
    id: "trk-f9-001",
    title: "Bohemian Rhapsody",
    release_type: "Single",
    release_date: "1975-10-31",
    duration: "05:55",
    cover_image: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/87/6c/6b/876c6bfa-ce5d-3c32-96db-3cd01c0bd60c/00602547208378.rgb.jpg/600x600bb.jpg",
    audio_preview_url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/a7/d7/1f/a7d71f16-1b4b-4c80-9e32-c5ef7862c86d/mzaf_14085285085985977537.plus.aac.p.m4a",
    spotify_url: "https://open.spotify.com/track/7tFiyTwD0nx5a1eklYtX2J",
    youtube_video_id: "fJ9rUzIMcZQ",
    itunes_track_id: "158672215",
    metrics: { streams: 2100000, saves: 195000, playlist_additions: 64000, top_countries: [{ country: "Reino Unido", pct: 28 }, { country: "Estados Unidos", pct: 35 }, { country: "España", pct: 12 }, { country: "Alemania", pct: 10 }] },
    production_details: { daw: "EMI Studios (16-track tape)", guitars: "Brian May Red Special", effects_chain: "Deacy Amp + AC30 + Univibe", tuning: "Standard E", key: "B♭ Major / Multiple Modulations" },
    lyrics: "Is this the real life? Is this just fantasy?\nCaught in a landslide, no escape from reality...\n[Coro]\nMama, just killed a man...",
    stems_urls: { vocals: "/audio/stems/bohemian-rhapsody-vocals.mp3", guitars: "/audio/stems/bohemian-rhapsody-guitar.mp3", bass: "/audio/stems/bohemian-rhapsody-bass.mp3", drums: "/audio/stems/bohemian-rhapsody-drums.mp3" },
    video_embed_url: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
    gallery_images: ["https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/87/6c/6b/876c6bfa-ce5d-3c32-96db-3cd01c0bd60c/00602547208378.rgb.jpg/600x600bb.jpg"],
  },
  {
    id: "trk-f9-002",
    title: "Smells Like Teen Spirit",
    release_type: "Single",
    release_date: "1991-09-10",
    duration: "05:01",
    cover_image: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/0b/79/01/0b790105-a58e-4ff9-96ca-d3c0c6c2a265/00720642442624.rgb.jpg/600x600bb.jpg",
    audio_preview_url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/a7/d7/1f/a7d71f16-1b4b-4c80-9e32-c5ef7862c86d/mzaf_14085285085985977537.plus.aac.p.m4a",
    spotify_url: "https://open.spotify.com/track/5ghIJDpPoe3CfHMGu71E6T",
    youtube_video_id: "hTWKbfoikeg",
    itunes_track_id: "1440733396",
    metrics: { streams: 1850000, saves: 172000, playlist_additions: 58500, top_countries: [{ country: "Estados Unidos", pct: 38 }, { country: "Reino Unido", pct: 22 }, { country: "Canadá", pct: 11 }, { country: "Australia", pct: 9 }] },
    production_details: { daw: "Smart Studios (8-track)", guitars: "Fender Mustang / Univox Hi-Flier", effects_chain: "ProCo RAT Distortion + Boss DS-1", tuning: "Drop D", key: "F minor" },
    lyrics: "Load up on guns, bring your friends\nIt's fun to lose and to pretend...\n[Coro]\nHello, hello, hello, how low...",
    stems_urls: { vocals: "/audio/stems/teen-spirit-vocals.mp3", guitars: "/audio/stems/teen-spirit-guitar.mp3", bass: "/audio/stems/teen-spirit-bass.mp3", drums: "/audio/stems/teen-spirit-drums.mp3" },
    video_embed_url: "https://www.youtube.com/watch?v=hTWKbfoikeg",
    gallery_images: ["https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/0b/79/01/0b790105-a58e-4ff9-96ca-d3c0c6c2a265/00720642442624.rgb.jpg/600x600bb.jpg"],
  },
  {
    id: "trk-f9-003",
    title: "Blinding Lights",
    release_type: "Single",
    release_date: "2019-11-29",
    duration: "03:20",
    cover_image: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/73/36/9b/73369b5e-4fc2-1a7f-c23a-d9c0f5e55c17/20UMGIM06519.rgb.jpg/600x600bb.jpg",
    audio_preview_url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview113/v4/4e/e0/d0/4ee0d0a8-7c07-fb35-f5f1-eb7a47b2a47e/mzaf_14390765741177175017.plus.aac.p.m4a",
    spotify_url: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
    youtube_video_id: "4NRXx6U8ABQ",
    itunes_track_id: "1488408568",
    metrics: { streams: 4250000, saves: 310000, playlist_additions: 98000, top_countries: [{ country: "Estados Unidos", pct: 32 }, { country: "México", pct: 18 }, { country: "Brasil", pct: 14 }, { country: "Filipinas", pct: 8 }] },
    production_details: { daw: "Pro Tools / Logic Pro", guitars: null, effects_chain: "Roland JX-3P Synth + Juno-106 + TR-808", tuning: "Standard E", key: "F minor" },
    lyrics: "I've been tryna call\nI've been on my own for long enough...\n[Coro]\nI said, ooh, I'm blinded by the lights...",
    stems_urls: null,
    video_embed_url: "https://www.youtube.com/watch?v=4NRXx6U8ABQ",
    gallery_images: ["https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/73/36/9b/73369b5e-4fc2-1a7f-c23a-d9c0f5e55c17/20UMGIM06519.rgb.jpg/600x600bb.jpg"],
  },
  {
    id: "trk-f9-004",
    title: "Hotel California",
    release_type: "Album",
    release_date: "1977-02-22",
    duration: "06:30",
    cover_image: "https://is1-ssl.mzstatic.com/image/thumb/Music/9f/83/b1/mzl.uzwblzco.jpg/600x600bb.jpg",
    audio_preview_url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/aa/c7/e6/aac7e6a4-9a89-4a24-b7a1-06e51c5d4936/mzaf_3124561977042434406.plus.aac.p.m4a",
    spotify_url: "https://open.spotify.com/track/40riOy7x9W7GXjyGp4pjAv",
    youtube_video_id: "BciS5krYL80",
    itunes_track_id: "1440672824",
    metrics: { streams: 1620000, saves: 148000, playlist_additions: 52000, top_countries: [{ country: "Estados Unidos", pct: 42 }, { country: "México", pct: 20 }, { country: "Colombia", pct: 10 }, { country: "Argentina", pct: 8 }] },
    production_details: { daw: "Criteria Studios (16-track analog)", guitars: "Gibson Les Paul / Telecaster", effects_chain: "MXR Phase 90 + Echoplex + Clean Fender amp", tuning: "Standard E / Drop E", key: "B minor" },
    lyrics: "On a dark desert highway, cool wind in my hair\nWarm smell of colitas rising up through the air...\n[Coro]\nWelcome to the Hotel California...",
    stems_urls: { vocals: "/audio/stems/hotel-california-vocals.mp3", guitars: "/audio/stems/hotel-california-guitar.mp3", bass: "/audio/stems/hotel-california-bass.mp3", drums: "/audio/stems/hotel-california-drums.mp3" },
    video_embed_url: "https://www.youtube.com/watch?v=BciS5krYL80",
    gallery_images: null,
  },
  {
    id: "trk-f9-005",
    title: "Shape of You",
    release_type: "Single",
    release_date: "2017-01-06",
    duration: "03:53",
    cover_image: "https://is1-ssl.mzstatic.com/image/thumb/Music117/v4/3f/d7/c1/3fd7c190-ec33-9440-2cd3-0b2f8f3d5754/886446302577.jpg/600x600bb.jpg",
    audio_preview_url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview127/v4/7a/a5/1f/7aa51fca-ab0b-9ba1-04d0-d7b40028dd44/mzaf_6174782736697399843.plus.aac.p.m4a",
    spotify_url: "https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3",
    youtube_video_id: "JGwWNGJdvx8",
    itunes_track_id: "1193701079",
    metrics: { streams: 3800000, saves: 290000, playlist_additions: 88000, top_countries: [{ country: "Reino Unido", pct: 30 }, { country: "Estados Unidos", pct: 28 }, { country: "India", pct: 12 }, { country: "Australia", pct: 8 }] },
    production_details: { daw: "Logic Pro X", guitars: null, effects_chain: "Steel Pans + Violin Loop + Loop Pedal", tuning: "Standard E", key: "E♭ Major" },
    lyrics: "The club isn't the best place to find a lover\nSo the bar is where I go...\n[Coro]\nI'm in love with the shape of you...",
    stems_urls: null,
    video_embed_url: "https://www.youtube.com/watch?v=JGwWNGJdvx8",
    gallery_images: ["https://is1-ssl.mzstatic.com/image/thumb/Music117/v4/3f/d7/c1/3fd7c190-ec33-9440-2cd3-0b2f8f3d5754/886446302577.jpg/600x600bb.jpg"],
  },
  {
    id: "trk-f9-006",
    title: "Sueños de Voltaje",
    release_type: "Single",
    release_date: "2025-09-12",
    duration: "04:08",
    cover_image: "/images/covers/suenos-de-voltaje.jpg",
    audio_preview_url: "/audio/suenos-de-voltaje.mp3",
    spotify_url: null,
    youtube_video_id: null,
    itunes_track_id: null,
    metrics: { streams: 3200, saves: 210, playlist_additions: 28, top_countries: [{ country: "Venezuela", pct: 65 }, { country: "Colombia", pct: 20 }, { country: "México", pct: 15 }] },
    production_details: { daw: "Bandlab", guitars: "Ibanez RG470", effects_chain: "Tube Screamer + Analog Delay", tuning: "Drop D", key: "D minor" },
    lyrics: "En la oscuridad del estudio\nEl cable vive, el cable canta...\n[Coro]\nSueños de voltaje, fuera de rango...",
    stems_urls: { vocals: "/audio/stems/suenos-voltaje-voz.mp3", guitars: "/audio/stems/suenos-voltaje-gtr.mp3", bass: "/audio/stems/suenos-voltaje-bajo.mp3", drums: "/audio/stems/suenos-voltaje-bateria.mp3" },
    video_embed_url: null,
    gallery_images: ["/images/covers/suenos-de-voltaje.jpg"],
  },
  {
    id: "trk-f9-007",
    title: "Periferia Digital",
    release_type: "EP",
    release_date: "2025-11-30",
    duration: "03:42",
    cover_image: "/images/covers/periferia-digital.jpg",
    audio_preview_url: "/audio/periferia-digital.mp3",
    spotify_url: null,
    youtube_video_id: null,
    itunes_track_id: null,
    metrics: { streams: 1850, saves: 140, playlist_additions: 18, top_countries: [{ country: "Venezuela", pct: 55 }, { country: "Argentina", pct: 30 }, { country: "España", pct: 15 }] },
    production_details: { daw: "Reaper", guitars: null, effects_chain: "Sidechain Comp + Wavetable + Reverb Plate", tuning: "Standard E", key: "C minor" },
    lyrics: "Sin conexión, fuera de zona\nLas páginas duermen, el servidor no contesta...\n[Coro]\nPeriferia digital, me llamas sin red...",
    stems_urls: null,
    video_embed_url: null,
    gallery_images: null,
  },
  {
    id: "trk-f9-008",
    title: "Neon Caracas",
    release_type: "Single",
    release_date: "2026-02-14",
    duration: "04:55",
    cover_image: "/images/covers/neon-caracas.jpg",
    audio_preview_url: "/audio/neon-caracas.mp3",
    spotify_url: "https://open.spotify.com/track/neoncaracasexample001",
    youtube_video_id: null,
    itunes_track_id: null,
    metrics: { streams: 6800, saves: 420, playlist_additions: 65, top_countries: [{ country: "Venezuela", pct: 48 }, { country: "México", pct: 28 }, { country: "Colombia", pct: 14 }, { country: "Perú", pct: 10 }] },
    production_details: { daw: "Ableton Live 12", guitars: "PRS SE Standard", effects_chain: "Chorus Stereo + Tape Echo + Spring Reverb", tuning: "Standard E", key: "A Major" },
    lyrics: "Las luces de la ciudad no duermen\nMirando desde arriba el asfalto que respira...\n[Coro]\nNeon Caracas, city of neon dreams...",
    stems_urls: { vocals: "/audio/stems/neon-caracas-voz.mp3", guitars: "/audio/stems/neon-caracas-gtr.mp3", bass: "/audio/stems/neon-caracas-bajo.mp3", drums: "/audio/stems/neon-caracas-beat.mp3" },
    video_embed_url: null,
    gallery_images: ["/images/covers/neon-caracas.jpg"],
  },
  {
    id: "trk-f9-009",
    title: "Running Up That Hill",
    release_type: "Album",
    release_date: "1985-08-05",
    duration: "05:02",
    cover_image: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/f5/5a/7e/f55a7e0d-30fa-2be0-e7e8-fd7e9d2a7edb/5099960756428.jpg/600x600bb.jpg",
    audio_preview_url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview122/v4/ec/2b/24/ec2b248d-f69d-9e10-e3b4-93e43f65af40/mzaf_14085285085985977537.plus.aac.p.m4a",
    spotify_url: "https://open.spotify.com/track/75FEaRjZTKLhTrFGsfMUXR",
    youtube_video_id: "wp43OdtAAkM",
    itunes_track_id: "1440831175",
    metrics: { streams: 1920000, saves: 178000, playlist_additions: 62000, top_countries: [{ country: "Reino Unido", pct: 32 }, { country: "Estados Unidos", pct: 30 }, { country: "Australia", pct: 12 }, { country: "Canadá", pct: 9 }] },
    production_details: { daw: "Analog 24-track tape (Abbey Road)", guitars: null, effects_chain: "Fairlight CMI + Simmons SDS-V Drums + Moog Bass", tuning: "Standard E", key: "C major" },
    lyrics: "It doesn't hurt me\nDo you want to feel how it feels?...\n[Coro]\nIf I only could, I'd make a deal with God...",
    stems_urls: null,
    video_embed_url: "https://www.youtube.com/watch?v=wp43OdtAAkM",
    gallery_images: ["https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/f5/5a/7e/f55a7e0d-30fa-2be0-e7e8-fd7e9d2a7edb/5099960756428.jpg/600x600bb.jpg"],
  },
  {
    id: "trk-f9-010",
    title: "Cactus en el Concreto",
    release_type: "Single",
    release_date: "2026-05-01",
    duration: "03:28",
    cover_image: "/images/covers/cactus-concreto.jpg",
    audio_preview_url: "/audio/cactus-concreto.mp3",
    spotify_url: null,
    youtube_video_id: null,
    itunes_track_id: null,
    metrics: { streams: 4100, saves: 280, playlist_additions: 38, top_countries: [{ country: "Venezuela", pct: 60 }, { country: "Colombia", pct: 22 }, { country: "Chile", pct: 18 }] },
    production_details: { daw: "Studio One 6", guitars: "Fender Jazzmaster MIJ", effects_chain: "Big Muff + Small Clone Chorus + Holy Grail Reverb", tuning: "Standard E", key: "G major" },
    lyrics: "Cactus en el concreto, resistiendo al sol\nSin agua, sin sombra, sigo aquí...\n[Coro]\nCrecer en la grieta es mi revolución...",
    stems_urls: { vocals: "/audio/stems/cactus-voz.mp3", guitars: "/audio/stems/cactus-gtr.mp3", bass: "/audio/stems/cactus-bajo.mp3", drums: "/audio/stems/cactus-drums.mp3" },
    video_embed_url: null,
    gallery_images: null,
  },
];

function main() {
  console.log("🌱 F9 Seed: Ampliando catálogo con 10 tracks...\n");

  const db = new Database(DB_PATH);

  // Verificar si las columnas F8 existen; si no, agregarlas
  const columns = (db.prepare("PRAGMA table_info(tracks)").all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes("itunes_track_id")) {
    console.log("🔧 Añadiendo columnas F8 a la tabla tracks...");
    db.exec("ALTER TABLE tracks ADD COLUMN itunes_track_id TEXT");
    db.exec("ALTER TABLE tracks ADD COLUMN stems_urls TEXT");
    db.exec("ALTER TABLE tracks ADD COLUMN video_embed_url TEXT");
    db.exec("ALTER TABLE tracks ADD COLUMN gallery_images TEXT");
  }

  const upsertTrack = db.prepare(`
    INSERT OR REPLACE INTO tracks (
      id, title, release_type, release_date, duration, cover_image,
      audio_preview_url, spotify_url, youtube_video_id, itunes_track_id,
      metrics, production_details, lyrics, stems_urls, video_embed_url, gallery_images
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const track of expandedTracks) {
      upsertTrack.run(
        track.id,
        track.title,
        track.release_type,
        track.release_date,
        track.duration,
        track.cover_image,
        track.audio_preview_url,
        track.spotify_url,
        track.youtube_video_id,
        track.itunes_track_id,
        JSON.stringify(track.metrics),
        JSON.stringify(track.production_details),
        track.lyrics,
        track.stems_urls ? JSON.stringify(track.stems_urls) : null,
        track.video_embed_url,
        track.gallery_images ? JSON.stringify(track.gallery_images) : null
      );
      console.log(`  ✅ ${track.id}: ${track.title} (${track.release_type})`);
    }
  });

  insertAll();

  const totalTracks = db.prepare("SELECT COUNT(*) as count FROM tracks").get() as { count: number };
  console.log(`\n📊 Total tracks en DB: ${totalTracks.count}`);
  console.log("✅ F9 Seed completado exitosamente\n");

  db.close();
}

main();
