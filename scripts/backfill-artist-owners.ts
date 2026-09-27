#!/usr/bin/env tsx
/**
 * Backfill artists.user_id NULL values
 *
 * Script idempotente y conservador que asigna user_id a artistas
 * que lo tienen NULL, solo cuando la coincidencia es INEQUIVOCA.
 *
 * Uso:
 *   npx tsx scripts/backfill-artist-owners.ts           # dry-run (default)
 *   npx tsx scripts/backfill-artist-owners.ts --apply   # escribir cambios
 *   npx tsx scripts/backfill-artist-owners.ts --help    # ayuda
 *
 * Funciona contra SQLite local y Turso usando las variables del repo.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  getAllArtists,
  getAllUsers,
  getArtistByName,
  getArtistById,
  getDbWrite,
  isTursoEnabled,
  tursoExec,
  tursoExecUpdate,
} from "../lib/db";
import type { ArtistProfile, User } from "@/types/music";

interface BackfillCandidate {
  artist: ArtistProfile;
  matchedUser: User | null;
  matchReason: string;
  trackCount: number;
  showCount: number;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    console.log(`
Backfill artists.user_id NULL values

Usage:
  npx tsx scripts/backfill-artist-owners.ts [options]

Options:
  --apply     Escribir cambios en la DB (default: dry-run)
  --help, -h  Mostrar esta ayuda

Este script:
1. Escanea artistas con user_id IS NULL
2. Para cada uno, cuenta tracks y shows asociados
3. Propone asignación por coincidencia de email/nombre SOLO si es inequívoca
4. En dry-run: imprime propuestas sin escribir
5. Con --apply: ejecuta las actualizaciones

Criterio de coincidencia inequívoca:
- Exactamente 1 usuario con email que contenga el slug del artista (o viceversa)
- O exactamente 1 usuario con nombre igual al nombre del artista
- NUNCA adivina: si hay 0 o >1 coincidencias, se salta
    `);
    process.exit(0);
  }

  console.log(`\n${apply ? "🔄 APLICANDO" : "🔍 DRY-RUN"} - Backfill artists.user_id\n`);

  const artists = await getAllArtists();
  const users = await getAllUsers();

  const artistsWithoutOwner = artists.filter((a) => !a.user_id);
  console.log(`Artistas totales: ${artists.length}`);
  console.log(`Artistas SIN user_id: ${artistsWithoutOwner.length}\n`);

  if (artistsWithoutOwner.length === 0) {
    console.log("✅ Todos los artistas ya tienen user_id asignado");
    return;
  }

  const candidates: BackfillCandidate[] = [];

  for (const artist of artistsWithoutOwner) {
    // Contar tracks por artist_name
    const tracks = await getTracksByArtistName(artist.name);
    // Contar shows por artist_id
    const shows = await getShowsByArtistId(artist.id);

    // Buscar coincidencia inequívoca
    const matchedUser = findUnambiguousMatch(artist, users);
    const matchReason = matchedUser ? getMatchReason(artist, matchedUser, users) : "Sin coincidencia inequívoca";

    candidates.push({
      artist,
      matchedUser,
      matchReason,
      trackCount: tracks.length,
      showCount: shows.length,
    });
  }

  // Imprimir resultados
  console.log("─".repeat(100));
  console.log(`${"ARTISTA".padEnd(30)} ${"SLUG".padEnd(25)} ${"TRACKS".padStart(6)} ${"SHOWS".padStart(6)} ${"USER MATCH".padEnd(30)} ${"RAZÓN"}`);
  console.log("─".repeat(100));

  let willUpdate = 0;
  for (const c of candidates) {
    const artistName = c.artist.name.length > 28 ? c.artist.name.slice(0, 25) + "..." : c.artist.name;
    const slug = (c.artist.slug || "").length > 23 ? (c.artist.slug || "").slice(0, 20) + "..." : (c.artist.slug || "");
    const userMatch = c.matchedUser ? `${c.matchedUser.name} (${c.matchedUser.email})` : "NINGUNO";
    const userMatchShort = userMatch.length > 28 ? userMatch.slice(0, 25) + "..." : userMatch;

    console.log(
      `${artistName.padEnd(30)} ${slug.padEnd(25)} ${String(c.trackCount).padStart(6)} ${String(c.showCount).padStart(6)} ${userMatchShort.padEnd(30)} ${c.matchReason}`
    );

    if (c.matchedUser) willUpdate++;
  }

  console.log("─".repeat(100));
  console.log(`\nResumen: ${candidates.length} artistas sin owner, ${willUpdate} con coincidencia inequívoca`);

  if (!apply) {
    console.log("\n💡 Ejecuta con --apply para escribir los cambios");
    return;
  }

  // Aplicar cambios
  console.log("\n📝 Aplicando actualizaciones...\n");
  let updated = 0;
  for (const c of candidates) {
    if (c.matchedUser) {
      try {
        if (isTursoEnabled()) {
          await tursoExecUpdate("UPDATE artists SET user_id = ? WHERE id = ?", [c.matchedUser.id, c.artist.id]);
        } else {
          const db = getDbWrite();
          db.prepare("UPDATE artists SET user_id = ? WHERE id = ?").run(c.matchedUser.id, c.artist.id);
        }
        console.log(`  ✅ ${c.artist.name} -> ${c.matchedUser.email}`);
        updated++;
      } catch (err) {
        console.error(`  ❌ Error actualizando ${c.artist.name}:`, err);
      }
    }
  }

  console.log(`\n✅ Completado: ${updated} artistas actualizados`);
}

function findUnambiguousMatch(artist: ArtistProfile, users: User[]): User | null {
  const artistNameLower = artist.name.toLowerCase();
  const artistSlug = (artist.slug || artistNameLower.replace(/[^a-z0-9]+/g, "-")).toLowerCase();

  // Estrategia 1: Usuario con nombre exacto igual al artista
  const exactNameMatches = users.filter((u) => u.name.toLowerCase() === artistNameLower);
  if (exactNameMatches.length === 1) return exactNameMatches[0];

  // Estrategia 2: Email contiene slug del artista (o viceversa) - SOLO si es único
  const slugMatches = users.filter((u) => {
    const emailLocal = u.email.split("@")[0].toLowerCase();
    return emailLocal.includes(artistSlug) || artistSlug.includes(emailLocal);
  });
  if (slugMatches.length === 1) return slugMatches[0];

  // Estrategia 3: Nombre de usuario contenido en nombre de artista (o viceversa) - SOLO si único
  const nameContainedMatches = users.filter((u) => {
    const userNameLower = u.name.toLowerCase();
    return userNameLower.includes(artistNameLower) || artistNameLower.includes(userNameLower);
  });
  if (nameContainedMatches.length === 1) return nameContainedMatches[0];

  return null;
}

function getMatchReason(artist: ArtistProfile, user: User, allUsers: User[]): string {
  const artistNameLower = artist.name.toLowerCase();
  const artistSlug = (artist.slug || artistNameLower.replace(/[^a-z0-9]+/g, "-")).toLowerCase();

  if (user.name.toLowerCase() === artistNameLower) {
    return "Nombre exacto";
  }

  const emailLocal = user.email.split("@")[0].toLowerCase();
  if (emailLocal.includes(artistSlug) || artistSlug.includes(emailLocal)) {
    // Verificar que sea único
    const others = allUsers.filter((u) => u.id !== user.id && (u.email.split("@")[0].toLowerCase().includes(artistSlug) || artistSlug.includes(u.email.split("@")[0].toLowerCase())));
    if (others.length === 0) return `Email contiene slug (${emailLocal})`;
  }

  if (user.name.toLowerCase().includes(artistNameLower) || artistNameLower.includes(user.name.toLowerCase())) {
    const others = allUsers.filter((u) => u.id !== user.id && (u.name.toLowerCase().includes(artistNameLower) || artistNameLower.includes(u.name.toLowerCase())));
    if (others.length === 0) return `Nombre contenido (${user.name})`;
  }

  return "Coincidencia única";
}

// Helpers para consultas que no existen en lib/db.ts
async function getTracksByArtistName(artistName: string): Promise<any[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM tracks WHERE artist_name = ?", [artistName]);
    return rows as any[];
  }
  const db = getDbWrite();
  return db.prepare("SELECT * FROM tracks WHERE artist_name = ?").all(artistName) as any[];
}

async function getShowsByArtistId(artistId: string): Promise<any[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM shows WHERE artist_id = ?", [artistId]);
    return rows as any[];
  }
  const db = getDbWrite();
  return db.prepare("SELECT * FROM shows WHERE artist_id = ?").all(artistId) as any[];
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});