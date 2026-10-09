#!/usr/bin/env tsx
/**
 * QA Cleanup Script - Limpia filas de pruebas E2E por patrón
 *
 * Idempotente, seguro, dry-run por defecto.
 * NUNCA borra datos reales: solo filas con prefijos/slugs de QA identificables.
 *
 * Patrones QA detectados:
 * - users: email contiene @qa.test, @e2e.test, @test.local, nombre empieza con "QA " o "E2E "
 * - artists: name/slug contiene "-qa-", "-e2e-", "-test-", "QA ", "E2E ", "Test "
 * - tracks: title empieza por "QA " o "E2E ", o contiene "[QA]", "[E2E]", "[TEST]", o su
 *   artist_name coincide con un artista QA
 * - shows: venue_name contiene "[QA]", "[E2E]", "[TEST]", artist_id coincide con artista QA
 * - notifications: title/message contiene "[QA]", "[E2E]", "[TEST]"
 * - subscriptions: artist_id/subscriber_id coincide con QA
 * - track_submissions: track_data contiene patrones QA
 * - metrics_history: track_id coincide con track QA
 * - likes: track_id/user_id coincide con QA
 * - dossiers: artist_id coincide con artista QA
 *
 * Uso:
 *   npx tsx scripts/qa-cleanup.ts           # dry-run (default)
 *   npx tsx scripts/qa-cleanup.ts --apply   # ejecutar limpieza
 *   npx tsx scripts/qa-cleanup.ts --help    # ayuda
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  getAllUsers,
  getAllArtists,
  getAllTracks,
  getAllShows,
  getAllNotifications,
  getAllTrackSubmissions,
  getDbWrite,
  isTursoEnabled,
  tursoExecUpdate,
} from "../lib/db";
import type { User, ArtistProfile, Track, Show } from "@/types/music";

const QA_USER_EMAIL_PATTERNS = ["@qa.test", "@e2e.test", "@test.local", "@example.com"];
const QA_USER_NAME_PREFIXES = ["QA ", "E2E ", "Test "];
const QA_ARTIST_PATTERNS = ["-qa-", "-e2e-", "-test-", "QA ", "E2E ", "Test ", "SEED"];
const QA_TRACK_PATTERNS = ["[QA]", "[E2E]", "[TEST]", "[SEED]"];
/** Prefijos con los que los specs nombran sus releases: `QA P45 Draft 1791…`. */
const QA_TRACK_TITLE_PREFIXES = ["QA ", "E2E "];
const QA_SHOW_PATTERNS = ["[QA]", "[E2E]", "[TEST]", "[SEED]"];
const QA_NOTIFICATION_PATTERNS = ["[QA]", "[E2E]", "[TEST]"];

interface CleanupStats {
  users: number;
  artists: number;
  tracks: number;
  shows: number;
  notifications: number;
  subscriptions: number;
  track_submissions: number;
  metrics_history: number;
  likes: number;
  dossiers: number;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    console.log(`
QA Cleanup Script

Usage:
  npx tsx scripts/qa-cleanup.ts [options]

Options:
  --apply     Ejecutar limpieza real (default: dry-run)
  --help, -h  Mostrar esta ayuda

Limpia filas de pruebas E2E por patrones identificables.
NUNCA borra datos reales - solo filas con prefijos/slugs QA.

Tablas afectadas (orden de borrado por FKs):
1. metrics_history (track_id -> tracks)
2. likes (track_id/user_id)
3. track_submissions (user_id)
4. notifications (user_id)
5. subscriptions (artist_id/subscriber_id)
6. shows (artist_id)
7. dossiers (artist_id)
8. tracks (artist_name)
9. artists (id)
10. users (id)
    `);
    process.exit(0);
  }

  console.log(`\n${apply ? "🧹 LIMPIANDO" : "🔍 DRY-RUN"} - QA Cleanup\n`);

  // 1. Identificar usuarios QA
  const allUsers = await getAllUsers();
  const qaUsers = allUsers.filter(isQAUser);
  const qaUserIds = new Set(qaUsers.map((u) => u.id));
  console.log(`Usuarios QA detectados: ${qaUsers.length}`);
  qaUsers.forEach((u) => console.log(`  - ${u.name} (${u.email})`));

  // 2. Identificar artistas QA
  const allArtists = await getAllArtists();
  const qaArtists = allArtists.filter(isQAArtist);
  const qaArtistIds = new Set(qaArtists.map((a) => a.id));
  const qaArtistNames = new Set(qaArtists.map((a) => a.name));
  console.log(`\nArtistas QA detectados: ${qaArtists.length}`);
  qaArtists.forEach((a) => console.log(`  - ${a.name} (${a.id})${a.user_id ? ` user_id=${a.user_id}` : ""}`));

  // 3. Identificar tracks QA
  const allTracks = await getAllTracks();
  const qaTracks = allTracks.filter((t) => isQATrack(t, qaArtistNames));
  const qaTrackIds = new Set(qaTracks.map((t) => t.id));
  console.log(`\nTracks QA detectados: ${qaTracks.length}`);

  // 4. Identificar shows QA
  const allShows = await getAllShows();
  const qaShows = allShows.filter((s) => isQAShow(s, qaArtistIds));
  const qaShowIds = new Set(qaShows.map((s) => s.id));
  console.log(`Shows QA detectados: ${qaShows.length}`);

  // 5. Notificaciones QA (por user_id QA o contenido)
  const allNotifications = await getAllNotifications();
  const qaNotifications = allNotifications.filter(
    (n) => qaUserIds.has(n.user_id) || QA_NOTIFICATION_PATTERNS.some((p) => n.title.includes(p) || n.message.includes(p))
  );
  const qaNotificationIds = new Set(qaNotifications.map((n) => n.id));
  console.log(`Notificaciones QA detectadas: ${qaNotifications.length}`);

  // 6. Track submissions QA
  const allSubmissions = await getAllTrackSubmissions();
  const qaSubmissions = allSubmissions.filter(
    (s) => qaUserIds.has(s.user_id) || (s.track_data && QA_TRACK_PATTERNS.some((p) => s.track_data.includes(p)))
  );
  const qaSubmissionIds = new Set(qaSubmissions.map((s) => s.id));
  console.log(`Track submissions QA detectadas: ${qaSubmissions.length}`);

  // Stats
  const stats: CleanupStats = {
    users: qaUsers.length,
    artists: qaArtists.length,
    tracks: qaTracks.length,
    shows: qaShows.length,
    notifications: qaNotifications.length,
    subscriptions: 0,
    track_submissions: qaSubmissions.length,
    metrics_history: 0,
    likes: 0,
    dossiers: 0,
  };

  if (!apply) {
    console.log("\n" + "=".repeat(50));
    console.log("RESUMEN DRY-RUN (no se borra nada)");
    console.log("=".repeat(50));
    printStats(stats);
    console.log("\n💡 Ejecuta con --apply para ejecutar la limpieza");
    return;
  }

  // EJECUTAR LIMPIEZA EN ORDEN DE FKs
  console.log("\n📝 Ejecutando limpieza en orden de dependencias...\n");

  // 1. metrics_history (track_id -> tracks)
  stats.metrics_history = await deleteMetricsHistory(qaTrackIds);
  console.log(`  ✅ metrics_history: ${stats.metrics_history} filas`);

  // 2. likes (track_id, user_id)
  stats.likes = await deleteLikes(qaTrackIds, qaUserIds);
  console.log(`  ✅ likes: ${stats.likes} filas`);

  // 3. track_submissions (user_id)
  stats.track_submissions = await deleteTrackSubmissions(qaSubmissionIds);
  console.log(`  ✅ track_submissions: ${stats.track_submissions} filas`);

  // 4. notifications (user_id)
  stats.notifications = await deleteNotifications(qaNotificationIds);
  console.log(`  ✅ notifications: ${stats.notifications} filas`);

  // 5. subscriptions (artist_id, subscriber_id)
  stats.subscriptions = await deleteSubscriptions(qaArtistIds, qaUserIds);
  console.log(`  ✅ subscriptions: ${stats.subscriptions} filas`);

  // 6. shows (artist_id)
  stats.shows = await deleteShows(qaShowIds);
  console.log(`  ✅ shows: ${stats.shows} filas`);

  // 7. dossiers (artist_id)
  stats.dossiers = await deleteDossiers(qaArtistIds);
  console.log(`  ✅ dossiers: ${stats.dossiers} filas`);

  // 8. tracks (id)
  stats.tracks = await deleteTracks(qaTrackIds);
  console.log(`  ✅ tracks: ${stats.tracks} filas`);

  // 9. artists (id)
  stats.artists = await deleteArtists(qaArtistIds);
  console.log(`  ✅ artists: ${stats.artists} filas`);

  // 10. users (id)
  stats.users = await deleteUsers(qaUserIds);
  console.log(`  ✅ users: ${stats.users} filas`);

  console.log("\n" + "=".repeat(50));
  console.log("LIMPIEZA COMPLETADA");
  console.log("=".repeat(50));
  printStats(stats);
}

function isQAUser(user: User): boolean {
  const email = user.email.toLowerCase();
  const name = user.name;

  if (QA_USER_EMAIL_PATTERNS.some((p) => email.includes(p))) return true;
  if (QA_USER_NAME_PREFIXES.some((p) => name.startsWith(p))) return true;
  return false;
}

function isQAArtist(artist: ArtistProfile): boolean {
  const name = artist.name.toLowerCase();
  const slug = (artist.slug || "").toLowerCase();

  return QA_ARTIST_PATTERNS.some((p) => name.includes(p.toLowerCase()) || slug.includes(p.toLowerCase()));
}

function isQATrack(track: Track, qaArtistNames: Set<string>): boolean {
  const title = track.title;
  const artistName = track.artist_name;

  if (QA_TRACK_PATTERNS.some((p) => title.includes(p))) return true;
  // **Prefijo** `QA `, no solo `[QA]`. Los specs de E2E crean títulos como
  // "QA P45 Draft 1791474488372" y "QA P45 UI Revision …", sin corchetes, así que
  // con los patrones de este script pasaban desapercibidos: el dry-run informed
  // "Tracks QA detectados: 0" con dos filas QA*P45* en producción. Es el mismo
  // criterio que ya se usa para los nombres de usuario (`QA_USER_NAME_PREFIXES`).
  if (QA_TRACK_TITLE_PREFIXES.some((p) => title.startsWith(p))) return true;
  if (qaArtistNames.has(artistName)) return true;
  return false;
}

function isQAShow(show: Show, qaArtistIds: Set<string>): boolean {
  const venue = show.venue_name || "";

  if (QA_SHOW_PATTERNS.some((p) => venue.includes(p))) return true;
  if (qaArtistIds.has(show.artist_id)) return true;
  return false;
}

async function deleteMetricsHistory(trackIds: Set<string>): Promise<number> {
  if (trackIds.size === 0) return 0;
  const placeholders = Array.from(trackIds).map(() => "?").join(", ");
  const ids = Array.from(trackIds);

  if (isTursoEnabled()) {
    await tursoExecUpdate(`DELETE FROM metrics_history WHERE track_id IN (${placeholders})`, ids);
    return ids.length; // approximate
  }
  const db = getDbWrite();
  const result = db.prepare(`DELETE FROM metrics_history WHERE track_id IN (${placeholders})`).run(...ids);
  return result.changes;
}

async function deleteLikes(trackIds: Set<string>, userIds: Set<string>): Promise<number> {
  let total = 0;
  if (trackIds.size > 0) {
    const placeholders = Array.from(trackIds).map(() => "?").join(", ");
    const ids = Array.from(trackIds);
    if (isTursoEnabled()) {
      await tursoExecUpdate(`DELETE FROM likes WHERE track_id IN (${placeholders})`, ids);
      total += ids.length;
    } else {
      const db = getDbWrite();
      total += db.prepare(`DELETE FROM likes WHERE track_id IN (${placeholders})`).run(...ids).changes;
    }
  }
  if (userIds.size > 0) {
    const placeholders = Array.from(userIds).map(() => "?").join(", ");
    const ids = Array.from(userIds);
    if (isTursoEnabled()) {
      await tursoExecUpdate(`DELETE FROM likes WHERE user_id IN (${placeholders})`, ids);
      total += ids.length;
    } else {
      const db = getDbWrite();
      total += db.prepare(`DELETE FROM likes WHERE user_id IN (${placeholders})`).run(...ids).changes;
    }
  }
  return total;
}

async function deleteTrackSubmissions(submissionIds: Set<string>): Promise<number> {
  if (submissionIds.size === 0) return 0;
  const placeholders = Array.from(submissionIds).map(() => "?").join(", ");
  const ids = Array.from(submissionIds);

  if (isTursoEnabled()) {
    await tursoExecUpdate(`DELETE FROM track_submissions WHERE id IN (${placeholders})`, ids);
    return ids.length;
  }
  const db = getDbWrite();
  return db.prepare(`DELETE FROM track_submissions WHERE id IN (${placeholders})`).run(...ids).changes;
}

async function deleteNotifications(notificationIds: Set<string>): Promise<number> {
  if (notificationIds.size === 0) return 0;
  const placeholders = Array.from(notificationIds).map(() => "?").join(", ");
  const ids = Array.from(notificationIds);

  if (isTursoEnabled()) {
    await tursoExecUpdate(`DELETE FROM notifications WHERE id IN (${placeholders})`, ids);
    return ids.length;
  }
  const db = getDbWrite();
  return db.prepare(`DELETE FROM notifications WHERE id IN (${placeholders})`).run(...ids).changes;
}

async function deleteSubscriptions(artistIds: Set<string>, userIds: Set<string>): Promise<number> {
  let total = 0;
  if (artistIds.size > 0) {
    const placeholders = Array.from(artistIds).map(() => "?").join(", ");
    const ids = Array.from(artistIds);
    if (isTursoEnabled()) {
      await tursoExecUpdate(`DELETE FROM subscriptions WHERE artist_id IN (${placeholders})`, ids);
      total += ids.length;
    } else {
      const db = getDbWrite();
      total += db.prepare(`DELETE FROM subscriptions WHERE artist_id IN (${placeholders})`).run(...ids).changes;
    }
  }
  if (userIds.size > 0) {
    const placeholders = Array.from(userIds).map(() => "?").join(", ");
    const ids = Array.from(userIds);
    if (isTursoEnabled()) {
      await tursoExecUpdate(`DELETE FROM subscriptions WHERE subscriber_id IN (${placeholders})`, ids);
      total += ids.length;
    } else {
      const db = getDbWrite();
      total += db.prepare(`DELETE FROM subscriptions WHERE subscriber_id IN (${placeholders})`).run(...ids).changes;
    }
  }
  return total;
}

async function deleteShows(showIds: Set<string>): Promise<number> {
  if (showIds.size === 0) return 0;
  const placeholders = Array.from(showIds).map(() => "?").join(", ");
  const ids = Array.from(showIds);

  if (isTursoEnabled()) {
    await tursoExecUpdate(`DELETE FROM shows WHERE id IN (${placeholders})`, ids);
    return ids.length;
  }
  const db = getDbWrite();
  return db.prepare(`DELETE FROM shows WHERE id IN (${placeholders})`).run(...ids).changes;
}

async function deleteDossiers(artistIds: Set<string>): Promise<number> {
  if (artistIds.size === 0) return 0;
  const placeholders = Array.from(artistIds).map(() => "?").join(", ");
  const ids = Array.from(artistIds);

  if (isTursoEnabled()) {
    await tursoExecUpdate(`DELETE FROM dossiers WHERE artist_id IN (${placeholders})`, ids);
    return ids.length;
  }
  const db = getDbWrite();
  return db.prepare(`DELETE FROM dossiers WHERE artist_id IN (${placeholders})`).run(...ids).changes;
}

async function deleteTracks(trackIds: Set<string>): Promise<number> {
  if (trackIds.size === 0) return 0;
  const placeholders = Array.from(trackIds).map(() => "?").join(", ");
  const ids = Array.from(trackIds);

  if (isTursoEnabled()) {
    await tursoExecUpdate(`DELETE FROM tracks WHERE id IN (${placeholders})`, ids);
    return ids.length;
  }
  const db = getDbWrite();
  return db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(...ids).changes;
}

async function deleteArtists(artistIds: Set<string>): Promise<number> {
  if (artistIds.size === 0) return 0;
  const placeholders = Array.from(artistIds).map(() => "?").join(", ");
  const ids = Array.from(artistIds);

  if (isTursoEnabled()) {
    await tursoExecUpdate(`DELETE FROM artists WHERE id IN (${placeholders})`, ids);
    return ids.length;
  }
  const db = getDbWrite();
  return db.prepare(`DELETE FROM artists WHERE id IN (${placeholders})`).run(...ids).changes;
}

async function deleteUsers(userIds: Set<string>): Promise<number> {
  if (userIds.size === 0) return 0;
  const placeholders = Array.from(userIds).map(() => "?").join(", ");
  const ids = Array.from(userIds);

  if (isTursoEnabled()) {
    await tursoExecUpdate(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
    return ids.length;
  }
  const db = getDbWrite();
  return db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...ids).changes;
}

function printStats(stats: CleanupStats) {
  console.log(`  users:              ${stats.users}`);
  console.log(`  artists:            ${stats.artists}`);
  console.log(`  tracks:             ${stats.tracks}`);
  console.log(`  shows:              ${stats.shows}`);
  console.log(`  notifications:      ${stats.notifications}`);
  console.log(`  subscriptions:      ${stats.subscriptions}`);
  console.log(`  track_submissions:  ${stats.track_submissions}`);
  console.log(`  metrics_history:    ${stats.metrics_history}`);
  console.log(`  likes:              ${stats.likes}`);
  console.log(`  dossiers:           ${stats.dossiers}`);
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  console.log(`  TOTAL:              ${total}`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});