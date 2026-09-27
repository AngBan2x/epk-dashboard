#!/usr/bin/env tsx
/**
 * Seed determinista e idempotente: catálogo multi-track influyente (P5.2)
 *
 * Crea:
 * - 2 artistas × 2 álbumes influyentes (multi-track con release_id, disc_number, start_time, end_time)
 * - 1 artista × 1 EP (multi-track)
 * - 2 artistas × 2 singles con lados B (is_double_single, sides_b)
 *
 * Todos los datos llevan sufijo identificativo "-seed" en slug para no tocar datos existentes.
 * Upsert por clave estable (artist_name + title + release_id).
 *
 * Uso:
 *   npx tsx scripts/seed-influential-catalog.ts           # dry-run (default)
 *   npx tsx scripts/seed-influential-catalog.ts --apply   # escribir cambios
 *   npx tsx scripts/seed-influential-catalog.ts --help    # ayuda
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  getAllArtists,
  getAllTracks,
  getArtistByName,
  createArtist,
  createTrack,
  getDbWrite,
  isTursoEnabled,
  tursoExec,
} from "../lib/db";
import type { ArtistProfile, Track } from "@/types/music";
import { randomUUID } from "crypto";

interface SeedArtist {
  name: string;
  slug: string;
  biography: string;
  genre: string;
  location: string;
  monthly_listeners: number;
}

interface SeedRelease {
  artistName: string;
  title: string;
  releaseType: "Album" | "EP" | "Single";
  releaseDate: string;
  coverImage: string;
  tracks: SeedTrack[];
}

interface SeedTrack {
  title: string;
  duration: string;
  trackNumber: number;
  discNumber: number;
  isDoubleSingle?: boolean;
  sidesB?: string[];
  startTime: number;
  endTime: number;
  isrc?: string;
}

const SEED_SUFFIX = "-seed";

const SEED_ARTISTS: SeedArtist[] = [
  {
    name: "Pink Floyd" + SEED_SUFFIX,
    slug: "pink-floyd" + SEED_SUFFIX,
    biography: "Pink Floyd fue una banda británica de rock progresivo y psicodélico formada en Londres en 1965. Conocidos por sus composiciones filosóficas, experimentación sonora, portadas icónicas y espectáculos en vivo elaborados.",
    genre: "Progressive Rock / Psychedelic Rock",
    location: "Londres, Reino Unido",
    monthly_listeners: 22000000,
  },
  {
    name: "Radiohead" + SEED_SUFFIX,
    slug: "radiohead" + SEED_SUFFIX,
    biography: "Radiohead es una banda británica de rock alternativo formada en Abingdon, Oxfordshire, en 1985. Pioneros en la fusión de rock, electrónica y música experimental, han redefinido los límites del rock moderno.",
    genre: "Alternative Rock / Experimental / Art Rock",
    location: "Abingdon, Oxfordshire, Reino Unido",
    monthly_listeners: 35000000,
  },
  {
    name: "Björk" + SEED_SUFFIX,
    slug: "bjork" + SEED_SUFFIX,
    biography: "Björk Guðmundsdóttir es una cantautora, productora y actriz islandesa. Su música ecléctica abarca electrónica, trip-hop, art pop, avant-garde y música clásica. Innovadora incansable en producción y performance.",
    genre: "Art Pop / Experimental / Electronic",
    location: "Reikiavik, Islandia",
    monthly_listeners: 8500000,
  },
  {
    name: "David Bowie" + SEED_SUFFIX,
    slug: "david-bowie" + SEED_SUFFIX,
    biography: "David Robert Jones, conocido como David Bowie, fue un cantautor y actor británico. Camaleónico pionero del glam rock, art rock, soul y música electrónica. Una de las figuras más influyentes de la música popular.",
    genre: "Art Rock / Glam Rock / Pop / Experimental",
    location: "Londres, Reino Unido",
    monthly_listeners: 18000000,
  },
  {
    name: "Kraftwerk" + SEED_SUFFIX,
    slug: "kraftwerk" + SEED_SUFFIX,
    biography: "Kraftwerk es una banda alemana pionera de la música electrónica formada en Düsseldorf en 1970. Su sonido minimalista, robótico y basado en sintetizadores sentó las bases del techno, synth-pop y la EDM moderna.",
    genre: "Electronic / Krautrock / Synth-pop",
    location: "Düsseldorf, Alemania",
    monthly_listeners: 6200000,
  },
];

const SEED_RELEASES: SeedRelease[] = [
  // Pink Floyd - 2 álbumes
  {
    artistName: "Pink Floyd" + SEED_SUFFIX,
    title: "The Dark Side of the Moon" + SEED_SUFFIX,
    releaseType: "Album",
    releaseDate: "1973-03-01",
    coverImage: "https://example.com/covers/dark-side-moon.jpg",
    tracks: [
      { title: "Speak to Me", duration: "1:07", trackNumber: 1, discNumber: 1, startTime: 0, endTime: 67 },
      { title: "Breathe (In the Air)", duration: "2:43", trackNumber: 2, discNumber: 1, startTime: 67, endTime: 230 },
      { title: "On the Run", duration: "3:30", trackNumber: 3, discNumber: 1, startTime: 230, endTime: 440 },
      { title: "Time", duration: "7:04", trackNumber: 4, discNumber: 1, startTime: 440, endTime: 864 },
      { title: "The Great Gig in the Sky", duration: "4:44", trackNumber: 5, discNumber: 1, startTime: 864, endTime: 1148 },
      { title: "Money", duration: "6:22", trackNumber: 6, discNumber: 1, startTime: 1148, endTime: 1530 },
      { title: "Us and Them", duration: "7:49", trackNumber: 7, discNumber: 1, startTime: 1530, endTime: 2009 },
      { title: "Any Colour You Like", duration: "3:24", trackNumber: 8, discNumber: 1, startTime: 2009, endTime: 2213 },
      { title: "Brain Damage", duration: "3:50", trackNumber: 9, discNumber: 1, startTime: 2213, endTime: 2443 },
      { title: "Eclipse", duration: "2:03", trackNumber: 10, discNumber: 1, startTime: 2443, endTime: 2566 },
    ],
  },
  {
    artistName: "Pink Floyd" + SEED_SUFFIX,
    title: "The Wall" + SEED_SUFFIX,
    releaseType: "Album",
    releaseDate: "1979-11-30",
    coverImage: "https://example.com/covers/the-wall.jpg",
    tracks: [
      { title: "In the Flesh?", duration: "3:19", trackNumber: 1, discNumber: 1, startTime: 0, endTime: 199 },
      { title: "The Thin Ice", duration: "2:27", trackNumber: 2, discNumber: 1, startTime: 199, endTime: 346 },
      { title: "Another Brick in the Wall, Pt. 1", duration: "3:20", trackNumber: 3, discNumber: 1, startTime: 346, endTime: 546 },
      { title: "The Happiest Days of Our Lives", duration: "1:50", trackNumber: 4, discNumber: 1, startTime: 546, endTime: 656 },
      { title: "Another Brick in the Wall, Pt. 2", duration: "3:59", trackNumber: 5, discNumber: 1, startTime: 656, endTime: 895 },
      { title: "Mother", duration: "5:32", trackNumber: 6, discNumber: 1, startTime: 895, endTime: 1227 },
      { title: "Goodbye Blue Sky", duration: "2:46", trackNumber: 7, discNumber: 1, startTime: 1227, endTime: 1393 },
      { title: "Empty Spaces", duration: "2:07", trackNumber: 8, discNumber: 1, startTime: 1393, endTime: 1520 },
      { title: "Young Lust", duration: "3:25", trackNumber: 9, discNumber: 1, startTime: 1520, endTime: 1725 },
      { title: "One of My Turns", duration: "3:36", trackNumber: 10, discNumber: 1, startTime: 1725, endTime: 1941 },
      // Disco 2
      { title: "Don't Leave Me Now", duration: "4:16", trackNumber: 1, discNumber: 2, startTime: 0, endTime: 256 },
      { title: "Another Brick in the Wall, Pt. 3", duration: "1:17", trackNumber: 2, discNumber: 2, startTime: 256, endTime: 333 },
      { title: "Goodbye Cruel World", duration: "1:16", trackNumber: 3, discNumber: 2, startTime: 333, endTime: 409 },
      { title: "Hey You", duration: "4:40", trackNumber: 4, discNumber: 2, startTime: 409, endTime: 689 },
      { title: "Is There Anybody Out There?", duration: "2:45", trackNumber: 5, discNumber: 2, startTime: 689, endTime: 854 },
      { title: "Nobody Home", duration: "3:26", trackNumber: 6, discNumber: 2, startTime: 854, endTime: 1060 },
      { title: "Vera", duration: "1:35", trackNumber: 7, discNumber: 2, startTime: 1060, endTime: 1155 },
      { title: "Bring the Boys Back Home", duration: "1:31", trackNumber: 8, discNumber: 2, startTime: 1155, endTime: 1246 },
      { title: "Comfortably Numb", duration: "6:23", trackNumber: 9, discNumber: 2, startTime: 1246, endTime: 1629 },
      { title: "The Show Must Go On", duration: "1:36", trackNumber: 10, discNumber: 2, startTime: 1629, endTime: 1725 },
    ],
  },
  // Radiohead - 2 álbumes
  {
    artistName: "Radiohead" + SEED_SUFFIX,
    title: "OK Computer" + SEED_SUFFIX,
    releaseType: "Album",
    releaseDate: "1997-05-21",
    coverImage: "https://example.com/covers/ok-computer.jpg",
    tracks: [
      { title: "Airbag", duration: "4:44", trackNumber: 1, discNumber: 1, startTime: 0, endTime: 284 },
      { title: "Paranoid Android", duration: "6:23", trackNumber: 2, discNumber: 1, startTime: 284, endTime: 667 },
      { title: "Subterranean Homesick Alien", duration: "4:27", trackNumber: 3, discNumber: 1, startTime: 667, endTime: 934 },
      { title: "Exit Music (For a Film)", duration: "4:24", trackNumber: 4, discNumber: 1, startTime: 934, endTime: 1198 },
      { title: "Let Down", duration: "4:59", trackNumber: 5, discNumber: 1, startTime: 1198, endTime: 1497 },
      { title: "Karma Police", duration: "4:21", trackNumber: 6, discNumber: 1, startTime: 1497, endTime: 1758 },
      { title: "Fitter Happier", duration: "1:57", trackNumber: 7, discNumber: 1, startTime: 1758, endTime: 1875 },
      { title: "Electioneering", duration: "3:50", trackNumber: 8, discNumber: 1, startTime: 1875, endTime: 2105 },
      { title: "Climbing Up the Walls", duration: "4:45", trackNumber: 9, discNumber: 1, startTime: 2105, endTime: 2390 },
      { title: "No Surprises", duration: "3:48", trackNumber: 10, discNumber: 1, startTime: 2390, endTime: 2618 },
      { title: "Lucky", duration: "4:19", trackNumber: 11, discNumber: 1, startTime: 2618, endTime: 2877 },
      { title: "The Tourist", duration: "5:24", trackNumber: 12, discNumber: 1, startTime: 2877, endTime: 3201 },
    ],
  },
  {
    artistName: "Radiohead" + SEED_SUFFIX,
    title: "Kid A" + SEED_SUFFIX,
    releaseType: "Album",
    releaseDate: "2000-10-02",
    coverImage: "https://example.com/covers/kid-a.jpg",
    tracks: [
      { title: "Everything in Its Right Place", duration: "4:11", trackNumber: 1, discNumber: 1, startTime: 0, endTime: 251 },
      { title: "Kid A", duration: "4:44", trackNumber: 2, discNumber: 1, startTime: 251, endTime: 535 },
      { title: "The National Anthem", duration: "5:51", trackNumber: 3, discNumber: 1, startTime: 535, endTime: 886 },
      { title: "How to Disappear Completely", duration: "5:56", trackNumber: 4, discNumber: 1, startTime: 886, endTime: 1242 },
      { title: "Treefingers", duration: "3:42", trackNumber: 5, discNumber: 1, startTime: 1242, endTime: 1464 },
      { title: "Optimistic", duration: "5:15", trackNumber: 6, discNumber: 1, startTime: 1464, endTime: 1779 },
      { title: "In Limbo", duration: "3:31", trackNumber: 7, discNumber: 1, startTime: 1779, endTime: 1990 },
      { title: "Idioteque", duration: "5:09", trackNumber: 8, discNumber: 1, startTime: 1990, endTime: 2299 },
      { title: "Morning Bell", duration: "4:38", trackNumber: 9, discNumber: 1, startTime: 2299, endTime: 2577 },
      { title: "Motion Picture Soundtrack", duration: "7:01", trackNumber: 10, discNumber: 1, startTime: 2577, endTime: 3001 },
    ],
  },
  // Björk - 1 EP
  {
    artistName: "Björk" + SEED_SUFFIX,
    title: "Vulnicura Strings" + SEED_SUFFIX,
    releaseType: "EP",
    releaseDate: "2016-11-04",
    coverImage: "https://example.com/covers/vulnicura-strings.jpg",
    tracks: [
      { title: "Stonemilker (Strings)", duration: "5:27", trackNumber: 1, discNumber: 1, startTime: 0, endTime: 327 },
      { title: "Lionsong (Strings)", duration: "4:54", trackNumber: 2, discNumber: 1, startTime: 327, endTime: 621 },
      { title: "Black Lake (Strings)", duration: "8:15", trackNumber: 3, discNumber: 1, startTime: 621, endTime: 1116 },
      { title: "Family (Strings)", duration: "4:19", trackNumber: 4, discNumber: 1, startTime: 1116, endTime: 1375 },
      { title: "Notget (Strings)", duration: "4:47", trackNumber: 5, discNumber: 1, startTime: 1375, endTime: 1662 },
    ],
  },
  // David Bowie - 2 singles con lados B
  {
    artistName: "David Bowie" + SEED_SUFFIX,
    title: "\"Heroes\"" + SEED_SUFFIX,
    releaseType: "Single",
    releaseDate: "1977-09-23",
    coverImage: "https://example.com/covers/heroes-single.jpg",
    tracks: [
      {
        title: "\"Heroes\"",
        duration: "6:07",
        trackNumber: 1,
        discNumber: 1,
        isDoubleSingle: true,
        sidesB: ["V-2 Schneider"],
        startTime: 0,
        endTime: 367,
      },
      {
        title: "V-2 Schneider",
        duration: "3:10",
        trackNumber: 2,
        discNumber: 1,
        isDoubleSingle: true,
        sidesB: [],
        startTime: 367,
        endTime: 557,
      },
    ],
  },
  {
    artistName: "David Bowie" + SEED_SUFFIX,
    title: "Ashes to Ashes" + SEED_SUFFIX,
    releaseType: "Single",
    releaseDate: "1980-08-01",
    coverImage: "https://example.com/covers/ashes-to-ashes.jpg",
    tracks: [
      {
        title: "Ashe to Ashes",
        duration: "4:25",
        trackNumber: 1,
        discNumber: 1,
        isDoubleSingle: true,
        sidesB: ["Move On"],
        startTime: 0,
        endTime: 265,
      },
      {
        title: "Move On",
        duration: "3:56",
        trackNumber: 2,
        discNumber: 1,
        isDoubleSingle: true,
        sidesB: [],
        startTime: 265,
        endTime: 501,
      },
    ],
  },
  // Kraftwerk - 2 singles con lados B
  {
    artistName: "Kraftwerk" + SEED_SUFFIX,
    title: "The Model / Computer Love" + SEED_SUFFIX,
    releaseType: "Single",
    releaseDate: "1981-12-04",
    coverImage: "https://example.com/covers/the-model.jpg",
    tracks: [
      {
        title: "The Model",
        duration: "3:39",
        trackNumber: 1,
        discNumber: 1,
        isDoubleSingle: true,
        sidesB: ["Computer Love"],
        startTime: 0,
        endTime: 219,
      },
      {
        title: "Computer Love",
        duration: "6:31",
        trackNumber: 2,
        discNumber: 1,
        isDoubleSingle: true,
        sidesB: [],
        startTime: 219,
        endTime: 610,
      },
    ],
  },
  {
    artistName: "Kraftwerk" + SEED_SUFFIX,
    title: "Tour de France" + SEED_SUFFIX,
    releaseType: "Single",
    releaseDate: "1983-06-01",
    coverImage: "https://example.com/covers/tour-de-france.jpg",
    tracks: [
      {
        title: "Tour de France (Version Française)",
        duration: "3:44",
        trackNumber: 1,
        discNumber: 1,
        isDoubleSingle: true,
        sidesB: ["Tour de France (Version Allemande)"],
        startTime: 0,
        endTime: 224,
      },
      {
        title: "Tour de France (Version Allemande)",
        duration: "3:44",
        trackNumber: 2,
        discNumber: 1,
        isDoubleSingle: true,
        sidesB: [],
        startTime: 224,
        endTime: 448,
      },
    ],
  },
];

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    console.log(`
Seed Influential Catalog (P5.2)

Usage:
  npx tsx scripts/seed-influential-catalog.ts [options]

Options:
  --apply     Escribir cambios en la DB (default: dry-run)
  --help, -h  Mostrar esta ayuda

Crea catálogo determinista multi-track:
- 2 artistas × 2 álbumes (Pink Floyd, Radiohead) → 22 tracks con release_id, disc_number, start_time, end_time
- 1 artista × 1 EP (Björk) → 5 tracks
- 2 artistas × 2 singles con lados B (David Bowie, Kraftwerk) → 8 tracks con is_double_single, sides_b

Total: 5 artistas, 7 releases, 35 tracks

Todos los slugs/nombres llevan sufijo "${SEED_SUFFIX}" para no colisionar con datos reales.
Upsert por clave estable: artist_name + title + release_id (para tracks) o artist_name + title (para releases padre).
    `);
    process.exit(0);
  }

  console.log(`\n${apply ? "🌱 SEMBRANDO" : "🔍 DRY-RUN"} - Influential Catalog (P5.2)\n`);

  let stats = {
    artistsCreated: 0,
    artistsExisting: 0,
    releasesCreated: 0,
    releasesExisting: 0,
    tracksCreated: 0,
    tracksExisting: 0,
  };

  // 1. Crear/obtener artistas
  const artistMap = new Map<string, ArtistProfile>();
  for (const sa of SEED_ARTISTS) {
    let artist = await getArtistByName(sa.name);
    if (artist) {
      console.log(`  ⏭️  Artista existe: ${sa.name}`);
      stats.artistsExisting++;
    } else {
      if (apply) {
        artist = await createArtist({
          name: sa.name,
          biography: sa.biography,
          pressText: "",
          pressHighlights: [],
          genre: sa.genre,
          location: sa.location,
          monthly_listeners: sa.monthly_listeners,
          socialLinks: [],
          profileImage: undefined,
          bannerImage: undefined,
          slug: sa.slug,
          isActive: true,
        });
        console.log(`  ✅ Artista creado: ${artist.name} (${artist.id})`);
      } else {
        console.log(`  🔍 [DRY] Crearía artista: ${sa.name}`);
        // Para dry-run, crear un artista mock para el mapa
        artist = {
          id: `mock-${sa.slug}`,
          name: sa.name,
          user_id: null,
          biography: sa.biography,
          press_text: "",
          press_highlights: [],
          genre: sa.genre,
          location: sa.location,
          monthly_listeners: sa.monthly_listeners,
          social_links: [],
          profile_image: null,
          banner_image: null,
          slug: sa.slug,
          is_active: true,
          deleted_at: null,
          created_at: new Date().toISOString(),
        } as ArtistProfile;
      }
      stats.artistsCreated++;
    }
    if (artist) artistMap.set(sa.name, artist);
  }

  // 2. Obtener releases existentes para upsert
  const existingTracks = await getAllTracks();
  const existingReleases = existingTracks.filter((t) => t.release_id === null);
  const existingTracksByKey = new Map<string, Track>();
  for (const t of existingTracks) {
    const key = `${t.artist_name}|${t.title}|${t.release_id || "parent"}`;
    existingTracksByKey.set(key, t);
  }

  // 3. Procesar cada release
  for (const sr of SEED_RELEASES) {
    const artist = artistMap.get(sr.artistName);
    if (!artist) {
      console.error(`  ❌ Artista no encontrado: ${sr.artistName}`);
      continue;
    }

    // Crear release padre (track con release_id = null)
    const releaseId = `rel-${randomUUID().slice(0, 8)}`;
    const parentKey = `${artist.name}|${sr.title}|parent`;
    const existingParent = existingTracksByKey.get(parentKey);

    let parentTrack: Track | null = existingParent ?? null;

    if (existingParent) {
      console.log(`  ⏭️  Release existe: ${sr.title} (${artist.name})`);
      stats.releasesExisting++;
      // Usar el release_id del padre existente para los tracks hijos
    } else {
      if (apply) {
        parentTrack = await createTrack({
          id: releaseId,
          title: sr.title,
          artist_name: artist.name,
          release_type: sr.releaseType,
          release_date: sr.releaseDate,
          duration: "00:00", // El padre no tiene duración propia
          cover_image: sr.coverImage,
          audio_preview_url: "",
          spotify_url: null,
          youtube_video_id: null,
          itunes_track_id: null,
          metrics: { streams: 0, saves: 0, playlist_additions: 0, top_countries: [] },
          production_details: { daw: null, guitars: null, effects_chain: null, tuning: null, key: null },
          lyrics: null,
          external_links: null,
          disc_number: 1,
          is_double_single: false,
          sides_b: null,
          isrc: null,
          composers: null,
          is_instrumental: false,
          release_id: null, // Padre
          start_time: 0,
          end_time: 0,
        });
        console.log(`  ✅ Release padre creado: ${sr.title} (${parentTrack.id})`);
      } else {
        console.log(`  🔍 [DRY] Crearía release padre: ${sr.title}`);
        // Para dry-run, usamos un ID temporal para los tracks hijos
        parentTrack = { id: releaseId } as Track;
      }
      stats.releasesCreated++;
    }

    const parentReleaseId = parentTrack?.id || releaseId;

    // 4. Crear tracks hijos
    for (const st of sr.tracks) {
      const trackKey = `${artist.name}|${st.title}|${parentReleaseId}`;
      const existingTrack = existingTracksByKey.get(trackKey);

      if (existingTrack) {
        console.log(`    ⏭️  Track existe: ${st.title}`);
        stats.tracksExisting++;
        continue;
      }

      if (apply) {
        const trackId = `trk-${randomUUID().slice(0, 8)}`;
        await createTrack({
          id: trackId,
          title: st.title,
          artist_name: artist.name,
          release_type: sr.releaseType,
          release_date: sr.releaseDate,
          duration: st.duration,
          cover_image: sr.coverImage,
          audio_preview_url: "",
          spotify_url: null,
          youtube_video_id: null,
          itunes_track_id: null,
          metrics: { streams: 0, saves: 0, playlist_additions: 0, top_countries: [] },
          production_details: { daw: null, guitars: null, effects_chain: null, tuning: null, key: null },
          lyrics: null,
          external_links: null,
          disc_number: st.discNumber,
          is_double_single: st.isDoubleSingle ?? false,
          sides_b: st.sidesB && st.sidesB.length > 0 ? st.sidesB : null,
          isrc: st.isrc || null,
          composers: null,
          is_instrumental: false,
          release_id: parentReleaseId,
          start_time: st.startTime,
          end_time: st.endTime,
        });
        console.log(`    ✅ Track creado: ${st.title} (disc ${st.discNumber}, #${st.trackNumber}, ${st.startTime}s-${st.endTime}s)`);
      } else {
        console.log(`    🔍 [DRY] Crearía track: ${st.title} (disc ${st.discNumber}, #${st.trackNumber}, ${st.startTime}s-${st.endTime}s, doubleSingle=${st.isDoubleSingle}, sidesB=${st.sidesB?.join(",") || "none"})`);
      }
      stats.tracksCreated++;
    }
  }

  // Resumen final
  console.log("\n" + "=".repeat(60));
  console.log("RESUMEN");
  console.log("=".repeat(60));
  console.log(`Artistas:     ${stats.artistsCreated} nuevos, ${stats.artistsExisting} existentes`);
  console.log(`Releases:     ${stats.releasesCreated} nuevos, ${stats.releasesExisting} existentes`);
  console.log(`Tracks:       ${stats.tracksCreated} nuevos, ${stats.tracksExisting} existentes`);
  console.log(`TOTAL tracks: ${stats.tracksCreated + stats.tracksExisting}`);
  console.log("=".repeat(60));

  if (!apply) {
    console.log("\n💡 Ejecuta con --apply para escribir los cambios");
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});