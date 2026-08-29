#!/usr/bin/env tsx

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

interface SeedArtist {
  name: string;
  genre: string;
  location: string;
  monthly_listeners: number;
  listeners_growth_pct: number;
}

const artists: SeedArtist[] = [
  { name: "Luna Roja", genre: "Indie Pop / Dream Pop", location: "Buenos Aires, Argentina", monthly_listeners: 8900, listeners_growth_pct: 32.1 },
  { name: "Kairo Beats", genre: "Hip Hop / Trap Latino", location: "Ciudad de México, México", monthly_listeners: 45600, listeners_growth_pct: 55.3 },
  { name: "Solar Winds", genre: "Electronic / Synthwave", location: "Madrid, España", monthly_listeners: 22100, listeners_growth_pct: 24.7 },
  { name: "Andes Echo", genre: "Folk / World Fusion", location: "Bogotá, Colombia", monthly_listeners: 11300, listeners_growth_pct: 15.2 },
];

const trackTemplates = [
  { title: "Sueños de Neon", release_type: "Single", duration: "03:22", key: "E minor", daw: "Ableton Live 12", guitars: "Fender Telecaster Deluxe", effects_chain: "Delay Analog + Reverb Hall", tuning: "Standard E" },
  { title: "Ritual Nocturno", release_type: "Single", duration: "04:05", key: "C minor", daw: "FL Studio 24", guitars: "Gibson SG Standard", effects_chain: "Distortion + Chorus", tuning: "Drop C" },
  { title: "Latido Urbano", release_type: "EP", duration: "03:58", key: "G minor", daw: "Logic Pro X", guitars: null, effects_chain: null, tuning: "Standard E" },
  { title: "Viento del Sur", release_type: "Single", duration: "04:30", key: "A minor", daw: "Reaper", guitars: "Ibanez RG550", effects_chain: "Overdrive + Flanger", tuning: "Drop D" },
  { title: "Ecos del Tiempo", release_type: "Album", duration: "05:12", key: "D minor", daw: "Cubase 14", guitars: "PRS Custom 24", effects_chain: "Modulation + Delay", tuning: "Standard E" },
  { title: "Fuego Lento", release_type: "Single", duration: "03:45", key: "B minor", daw: "Bitwig Studio", guitars: "Fender Stratocaster", effects_chain: "Fuzz + Reverb", tuning: "Standard E" },
  { title: "Olas de Silicio", release_type: "EP", duration: "04:18", key: "F# minor", daw: "Ableton Live 12", guitars: null, effects_chain: null, tuning: "Standard E" },
  { title: "Raíces Profundas", release_type: "Single", duration: "03:33", key: "G major", daw: "Pro Tools", guitars: "Martin D-28", effects_chain: null, tuning: "Standard E" },
  { title: "Pulso Electrónico", release_type: "Single", duration: "04:45", key: "A minor", daw: "Ableton Live 12", guitars: null, effects_chain: "Sidechain + Wavetable", tuning: "Standard E" },
  { title: "Ceniza y Oro", release_type: "Album", duration: "05:02", key: "E minor", daw: "Studio One 7", guitars: "Gibson Les Paul", effects_chain: "Tremolo + Delay", tuning: "Standard E" },
  { title: "Horizonte Roto", release_type: "Single", duration: "03:18", key: "C major", daw: "GarageBand", guitars: "Acoustic Yamaha", effects_chain: null, tuning: "Standard E" },
  { title: "Sincronía", release_type: "EP", duration: "04:55", key: "D minor", daw: "FL Studio 24", guitars: "Jackson Soloist", effects_chain: "High Gain + Cab Sim", tuning: "Drop D" },
  { title: "Bajo la Lluvia", release_type: "Single", duration: "03:40", key: "F major", daw: "Logic Pro X", guitars: "Acoustic Epiphone", effects_chain: null, tuning: "Standard E" },
  { title: "Camino de Flecha", release_type: "Single", duration: "04:15", key: "B minor", daw: "Reaper", guitars: "ESP Horizon", effects_chain: "Distortion + Reverb", tuning: "Drop B" },
  { title: "Último Suspiro", release_type: "Album", duration: "06:10", key: "G minor", daw: "Cubase 14", guitars: "Fender Jazzmaster", effects_chain: "Ambient + Shimmer", tuning: "Standard E" },
  { title: "Fragmentos", release_type: "Single", duration: "03:28", key: "A minor", daw: "Waveform", guitars: null, effects_chain: null, tuning: "Standard E" },
  { title: "Sendero Interior", release_type: "EP", duration: "04:42", key: "E minor", daw: "Bitwig Studio", guitars: "Classical Nylon", effects_chain: null, tuning: "Standard E" },
  { title: "Renacer", release_type: "Single", duration: "03:55", key: "D major", daw: "Ableton Live 12", guitars: "Ibanez AZ", effects_chain: "Clean + Chorus", tuning: "Standard E" },
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMetrics() {
  const streams = randomInt(500, 80000);
  const saves = Math.floor(streams * (Math.random() * 0.1 + 0.02));
  const playlist_additions = Math.floor(streams * (Math.random() * 0.02 + 0.005));
  const countries = ["Venezuela", "México", "Argentina", "España", "Colombia", "Chile", "Perú", "Ecuador"];
  const selectedCountries = countries.slice(0, randomInt(2, 4));
  let remaining = 100;
  const top_countries = selectedCountries.map((country, i) => {
    const pct = i === selectedCountries.length - 1 ? remaining : randomInt(10, Math.min(remaining - 10 * (selectedCountries.length - i - 1), 50));
    remaining -= pct;
    return { country, pct };
  });
  return JSON.stringify({ streams, saves, playlist_additions, top_countries });
}

function generateLyrics(title: string): string | null {
  if (Math.random() < 0.3) return null;
  return `[${title}]\n\nVerso 1:\nPalabras que se pierden en el viento...\n\nCoro:\nY ${title.toLowerCase()} resuena en mi interior...\n\nVerso 2:\nEcos de lo que fuimos ayer...\n\nOutro:\nTodo termina, todo renacer...`;
}

function generateCoverImage(title: string): string {
  const slug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return `/images/covers/${slug}.jpg`;
}

function generateAudioUrl(title: string): string {
  const slug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return `/audio/${slug}.mp3`;
}

function generateSpotifyUrl(): string {
  return `https://open.spotify.com/track/${Math.random().toString(36).substring(2, 14)}`;
}

function generateYoutubeId(): string | null {
  if (Math.random() < 0.4) return null;
  return Math.random().toString(36).substring(2, 13);
}

function randomDate(start: Date, end: Date): string {
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString().split("T")[0];
}

function main() {
  console.log("🎵 Generando datos sintéticos para EPK Dashboard...\n");

  const db = new Database(DB_PATH);

  let trackId = 3;
  const insertTrack = db.prepare(`
    INSERT INTO tracks (id, title, release_type, release_date, duration, cover_image, audio_preview_url, spotify_url, youtube_video_id, metrics, production_details, lyrics)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (const artist of artists) {
      console.log(`\n🎤 ${artist.name} (${artist.genre})`);
      const numTracks = randomInt(4, 5);
      const shuffledTracks = [...trackTemplates].sort(() => Math.random() - 0.5).slice(0, numTracks);

      for (const template of shuffledTracks) {
        const id = `trk-${String(trackId).padStart(3, "0")}`;
        const releaseDate = randomDate(new Date("2024-01-01"), new Date("2026-06-30"));
        const metrics = generateMetrics();
        const productionDetails = JSON.stringify({
          daw: template.daw,
          guitars: template.guitars,
          effects_chain: template.effects_chain,
          tuning: template.tuning,
          key: template.key,
        });

        insertTrack.run(
          id,
          template.title,
          template.release_type,
          releaseDate,
          template.duration,
          generateCoverImage(template.title),
          generateAudioUrl(template.title),
          generateSpotifyUrl(),
          generateYoutubeId(),
          metrics,
          productionDetails,
          generateLyrics(template.title)
        );

        console.log(`  ✅ ${id}: ${template.title} (${template.release_type}, ${template.duration})`);
        trackId++;
      }
    }
  });

  insertMany();

  const totalTracks = db.prepare("SELECT COUNT(*) as count FROM tracks").get() as { count: number };
  console.log(`\n📊 Total tracks en DB: ${totalTracks.count}`);
  console.log("✅ Datos sintéticos generados exitosamente");

  db.close();
}

main();
