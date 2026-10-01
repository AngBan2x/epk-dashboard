#!/usr/bin/env tsx
/**
 * Vídeos OFICIALES de YouTube para el catálogo (RC.32 · agente H).
 *
 * ── Por qué este script existe ─────────────────────────────────────────────
 * `tracks.youtube_video_id` es lo que hace que `lib/audio-priority.ts:139-154`
 * añada una fuente de tipo `youtube`. Hoy **0 de las 65 hijas** lo tienen: la vía
 * estaba abierta y nadie la había recorrido. Este script la recorre con una
 * condición que no se negocia.
 *
 * ── LO QUE ESTE SCRIPT NO ES ───────────────────────────────────────────────
 *
 * **No es una fuente de audio.** Un `youtube_video_id` en una pista convierte el
 * tracklist en capítulos de vídeo (`start_time`/`end_time`), pero **no hace que
 * la pista suene**: el reproductor prioriza el preview de audio, y una URL de
 * preview caída se queda sin sonido igual que antes. Además `end_time` sin
 * validar supera los 30 s, así que un vídeo entero como fuente es exactamente el
 * fallo que el gating de 30 s evita. Esto abre una vía que el seed no usaba; que
 * nadie asuma que la pista empezará a sonar.
 *
 * ── EL CANAL SE VERIFICA, NO SE ADIVINA ─────────────────────────────────────
 *
 * Un vídeo de «topic channel» autogenerado, un mashup, una tribute band o un
 * reaction **no** son el oficial, y nada en la respuesta de `search.list` te lo
 * dice. Por eso aquí no se usa `search.list`:
 *
 *   método              coste
 *   videos.list         1 unidad
 *   channels.list       1 unidad
 *   playlistItems.list  1 unidad
 *   search.list         bucket aparte: 100 llamadas/día para TODO el proyecto
 *
 * `search` daría algo peor y más caro. Aquí, por artista, son 2 unidades: una
 * `channels.list` y una `playlistItems.list` por página.
 *
 * La verificación es **estructural** y auditable
 * (`lib/youtube.ts:verifyOfficialChannel`, pura y testeada):
 *
 *  1. `snippet.type` no puede ser `"topic"` — un canal «topic» lo crea YouTube
 *     solo, sin dueño. El vídeo puede ser el correcto y el canal no lo es.
 *  2. El nombre del canal tiene que ser el del artista, exacto tras normalizar.
 *     «Pink Floyd Tribute» y «Kraftwerk2K» no pasan.
 *  3. La descripción del canal tiene que enlazar al **dominio oficial
 *     declarado a mano** más abajo. Solo quien controla el sitio puede escribir
 *     ese enlace, y es lo que separa un canal de una cuenta con el mismo nombre.
 *
 * Si falla cualquiera: `NO VERIFICADO` con el motivo, y **no se escribe nada**.
 * Dos canales de cinco Approval no es un resultado malo: es el correcto.
 *
 * ── LA DESAMBIGUACIÓN ──────────────────────────────────────────────────────
 * Artista exacto + título exacto, con el mismo criterio de tres estados que
 * `lib/seed-audio.ts`: una coincidencia **parcial** se rechaza. `"Stonemilker"`
 * contra `"Stonemilker (Strings)"` es una grabación distinta, y `"Tour de
 * France"` contra `"Tour de France (Version Allemande)"` también.
 *
 * ── `start_time` / `end_time` ──────────────────────────────────────────────
 * Los timestamps que hay hoy en la tabla son **inventados**: derivan de la
 * duración del álbum sembrada, no de ningún vídeo
 * (`tests/unit/seed-integrity.test.ts:18-21`). Este script **no los escribe**.
 * Si el vídeo tiene capítulos **reales** en su descripción, se calculan y se
 * **informan** (`deriveChapterTiming`), porque cambiar `start_time`/`end_time`
 * afecta al salto del reproductor y eso es de otra ola.
 *
 * USO
 *
 *   npx tsx scripts/fetch-official-videos.ts                 # dry-run
 *   npx tsx scripts/fetch-official-videos.ts --apply         # escribe
 *   npx tsx scripts/fetch-official-videos.ts --artist="Björk"
 *   npx tsx scripts/fetch-official-videos.ts --pages=3        # más páginas
 *   npx tsx scripts/fetch-official-videos.ts --channels       # solo verificar canales
 */

import fs from "node:fs";
import {
  buildOfficialVideoUpdate,
  createQuotaMeter,
  deriveChapterTiming,
  formatDuration,
  matchOfficialVideoTitle,
  parseISO8601Duration,
  probeOfficialVideo,
  resolveOfficialVideo,
  selectOfficialVideoUpdates,
  verifyOfficialChannel,
  type OfficialChannelCandidate,
  type OfficialChannelVerification,
  type OfficialVideoCandidate,
  type OfficialVideoResolution,
  type OfficialVideoUpdate,
  type YouTubeChannel,
} from "../lib/youtube";
import { setArtistYouTubeChannelId } from "../lib/turso";

// ─── Los handles, declarados a mano ─────────────────────────────────────────
//
// El dominio oficial va AL LADO del handle a propósito: la verificación compara
// lo que el canal enlace en su descripción contra este dato, así que la
// comparación es explícita y revisable, no una heurística interna del script.
//
// Cada línea es una AFIRMACIÓN que alguien tiene que poder revisar. Si un
// artista cambia de canal oficial, se corrige aquí y se vuelve a correr; no se
// "adivina" un handle nuevo.
/** Tope de seguridad: si esto no está, el bucle se sale por cuota antes de avisar. */
const MAX_PLAYLIST_PAGES = 6;
const DEFAULT_PLAYLIST_PAGES = 2;
const PLAYLIST_PAGE_SIZE = 50;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * Exportado para que `tests/unit/official-videos.test.ts` pueda comprobar que
 * cada artista tiene handle **y** dominio oficial declarados. No es un dato de
 * runtime: es la lista que alguien tiene que poder revisar.
 */
export const OFFICIAL_CHANNEL_CANDIDATES: OfficialChannelCandidate[] = [
  { artistName: "Pink Floyd", handle: "pinkfloyd", officialDomain: "pinkfloyd.com" },
  { artistName: "Radiohead", handle: "radiohead", officialDomain: "radiohead.com" },
  { artistName: "Björk", handle: "bjork", officialDomain: "bjork.com" },
  { artistName: "David Bowie", handle: "davidbowie", officialDomain: "davidbowie.com" },
  { artistName: "Kraftwerk", handle: "kraftwerk", officialDomain: "kraftwerk.com" },
];

// ─── Acceso a datos ─────────────────────────────────────────────────────────

interface ArtistRow {
  id: string;
  name: string;
  youtube_channel_id: string | null;
}

interface TrackRow {
  id: string;
  title: string;
  artist_name: string;
  release_id: string | null;
  release_date: string | null;
  youtube_video_id: string | null;
  video_embed_url: string | null;
}

function loadEnv(): void {
  let text: string;
  try {
    text = fs.readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function isTursoBackend(): boolean {
  return !!process.env.TURSO_DATABASE_URL && !!process.env.TURSO_AUTH_TOKEN;
}

async function tursoClient() {
  const { createClient } = await import("@libsql/client");
  return createClient({
    url: process.env.TURSO_DATABASE_URL as string,
    authToken: process.env.TURSO_AUTH_TOKEN as string,
  });
}

function localDb() {
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const path = require("node:path") as typeof import("node:path");
  return new Database(path.join(process.cwd(), "data", "music_catalog.db"));
}

async function readArtists(): Promise<ArtistRow[]> {
  const sql = `SELECT id, name, youtube_channel_id FROM artists ORDER BY name`;
  if (isTursoBackend()) {
    const client = await tursoClient();
    const result = await client.execute(sql);
    return result.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        name: String(row.name ?? ""),
        youtube_channel_id:
          row.youtube_channel_id == null ? null : String(row.youtube_channel_id),
      };
    });
  }
  const db = localDb();
  try {
    return (db.prepare(sql).all() as unknown[]).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        name: String(row.name ?? ""),
        youtube_channel_id:
          row.youtube_channel_id == null ? null : String(row.youtube_channel_id),
      };
    });
  } finally {
    db.close();
  }
}

async function readTracks(artistName: string): Promise<TrackRow[]> {
  const sql = `SELECT id, title, artist_name, release_id, release_date,
                      youtube_video_id, video_embed_url
                 FROM tracks WHERE artist_name = ?
                ORDER BY release_id IS NULL DESC, id`;
  if (isTursoBackend()) {
    const client = await tursoClient();
    const result = await client.execute({ sql, args: [artistName] });
    return result.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        title: String(row.title ?? ""),
        artist_name: String(row.artist_name ?? ""),
        release_id: row.release_id == null ? null : String(row.release_id),
        release_date: row.release_date == null ? null : String(row.release_date),
        youtube_video_id:
          row.youtube_video_id == null ? null : String(row.youtube_video_id),
        video_embed_url: row.video_embed_url == null ? null : String(row.video_embed_url),
      };
    });
  }
  const db = localDb();
  try {
    return (db.prepare(sql).all(artistName) as unknown[]).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        title: String(row.title ?? ""),
        artist_name: String(row.artist_name ?? ""),
        release_id: row.release_id == null ? null : String(row.release_id),
        release_date: row.release_date == null ? null : String(row.release_date),
        youtube_video_id:
          row.youtube_video_id == null ? null : String(row.youtube_video_id),
        video_embed_url: row.video_embed_url == null ? null : String(row.video_embed_url),
      };
    });
  } finally {
    db.close();
  }
}

async function writeTrackVideo(id: string, videoId: string, embedUrl: string): Promise<number> {
  const sql = "UPDATE tracks SET youtube_video_id = ?, video_embed_url = ? WHERE id = ?";
  if (isTursoBackend()) {
    const client = await tursoClient();
    const result = await client.execute({ sql, args: [videoId, embedUrl, id] });
    return Number(result.rowsAffected ?? 0);
  }
  const db = localDb();
  try {
    return Number(db.prepare(sql).run(videoId, embedUrl, id).changes ?? 0);
  } finally {
    db.close();
  }
}

// ─── API de YouTube ─────────────────────────────────────────────────────────

function parseChannel(raw: unknown): YouTubeChannel | null {
  const item = (raw ?? {}) as Record<string, unknown>;
  if (item.id == null) return null;
  const snippet = (item.snippet ?? {}) as Record<string, unknown>;
  const contentDetails = (item.contentDetails ?? {}) as Record<string, unknown>;
  const statistics = (item.statistics ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id),
    title: typeof snippet.title === "string" ? snippet.title : "",
    description: typeof snippet.description === "string" ? snippet.description : "",
    type: typeof snippet.type === "string" ? snippet.type : null,
    customUrl: typeof snippet.customUrl === "string" ? snippet.customUrl : null,
    uploadsPlaylistId:
      typeof contentDetails.relatedPlaylists === "object" && contentDetails.relatedPlaylists
        ? String(((contentDetails.relatedPlaylists as Record<string, unknown>).uploads as string) ?? "")
        : "",
    subscriberCount: Number(statistics.subscriberCount ?? 0) || 0,
    viewCount: Number(statistics.viewCount ?? 0) || 0,
  };
}

async function youtubeFetch(
  pathAndQuery: string,
  meter: ReturnType<typeof createQuotaMeter>,
  method: keyof typeof import("../lib/youtube").YOUTUBE_QUOTA_COST,
  label: string,
): Promise<unknown> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY no está en .env.local");
  const res = await fetch(`${YOUTUBE_API_BASE}/${pathAndQuery}&key=${encodeURIComponent(apiKey)}`);
  meter.charge(method, label);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(
      `${method} respondió ${res.status}${body?.error?.message ? `: ${body.error.message}` : ""}`
    );
  }
  return res.json();
}

async function fetchChannelByHandle(
  handle: string,
  meter: ReturnType<typeof createQuotaMeter>,
): Promise<YouTubeChannel | null> {
  const payload = (await youtubeFetch(
    `channels?part=snippet,contentDetails,statistics&forHandle=${encodeURIComponent(`@${handle}`)}`,
    meter,
    "channels",
    `channels.list @${handle}`,
  )) as { items?: unknown[] };
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.length > 0 ? parseChannel(items[0]) : null;
}

async function fetchUploadsPlaylist(
  playlistId: string,
  maxPages: number,
  meter: ReturnType<typeof createQuotaMeter>,
): Promise<OfficialVideoCandidate[]> {
  const videos: OfficialVideoCandidate[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const query =
      `playlistItems?part=snippet,contentDetails&maxResults=${PLAYLIST_PAGE_SIZE}` +
      `&playlistId=${encodeURIComponent(playlistId)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const payload = (await youtubeFetch(
      query,
      meter,
      "playlistItems",
      `playlistItems.list ${playlistId} pág ${page + 1}`,
    )) as {
      items?: unknown[];
      nextPageToken?: string;
    };

    for (const raw of Array.isArray(payload.items) ? payload.items : []) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const snippet = (item.snippet ?? {}) as Record<string, unknown>;
      const contentDetails = (item.contentDetails ?? {}) as Record<string, unknown>;
      if (typeof item.videoId !== "string" || !item.videoId) continue;
      const duration =
        typeof contentDetails.duration === "string" ? contentDetails.duration : "";
      videos.push({
        videoId: item.videoId,
        title: typeof snippet.title === "string" ? snippet.title : "",
        description: typeof snippet.description === "string" ? snippet.description : "",
        durationSeconds: duration ? parseISO8601Duration(duration) : 0,
        videoOwnerChannelId:
          typeof snippet.videoOwnerChannelId === "string" ? snippet.videoOwnerChannelId : null,
        publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : null,
      });
    }

    pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : null;
    if (!pageToken) break;
    if (page === maxPages - 1) {
      console.log(
        `    (la playlist del canal tiene más páginas; se pararon ${maxPages}. Sube --pages= si quieres más.`
      );
    }
  }

  return videos;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function argValue(flag: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}

async function main(): Promise<void> {
  loadEnv();

  const apply = process.argv.slice(2).includes("--apply");
  const onlyChannels = process.argv.slice(2).includes("--channels");
  const onlyArtist = argValue("--artist");
  const pagesArg = argValue("--pages");
  const pages = Math.min(
    MAX_PLAYLIST_PAGES,
    Math.max(1, pagesArg ? Number(pagesArg) : DEFAULT_PLAYLIST_PAGES),
  );

  const engine = isTursoBackend() ? "Turso" : "SQLite local";

  console.log(`\n${apply ? "▶️  APLICANDO" : "🔍 DRY-RUN"} — vídeos oficiales de YouTube (RC.32 · H)`);
  console.log(`Motor: ${engine}`);
  console.log(`Canales declarados a mano: ${OFFICIAL_CHANNEL_CANDIDATES.length}`);
  console.log(`Páginas de la playlist por canal: ${pages} (tope ${MAX_PLAYLIST_PAGES})`);
  console.log("search.list NO se usa: 100 llamadas/día de un bucket aparte, para algo peor.");
  console.log("");
  console.log("⚠️  ESTO NO ES FUENTE DE AUDIO.");
  console.log("   Un youtube_video_id convierte el tracklist en capítulos de vídeo, pero el reproductor");
  console.log("   sigue priorizando el preview de audio: la pista NO empezará a sonar por esto.");
  console.log("");

  const meter = createQuotaMeter();
  const artists = await readArtists();
  const candidates = OFFICIAL_CHANNEL_CANDIDATES.filter(
    (c) => (onlyArtist ? c.artistName === onlyArtist : true),
  );

  const channelUpdates: { artist: ArtistRow; channelId: string }[] = [];
  const resolutions: OfficialVideoResolution[] = [];

  for (const [index, declared] of candidates.entries()) {
    console.log(`${"-".repeat(96)}`);
    console.log(`[${index + 1}/${candidates.length}] ${declared.artistName}`);
    console.log(
      `  declarado a mano: handle "@${declared.handle}"  ·  sitio oficial ${declared.officialDomain}`
    );

    const artist =
      artists.find((a) => a.name === declared.artistName) ??
      artists.find((a) => a.name.normalize("NFD").replace(/[̀-ͯ]/g, "") ===
        declared.artistName.normalize("NFD").replace(/[̀-ͯ]/g, ""));

    let channel: YouTubeChannel | null = null;
    let verification: OfficialChannelVerification;
    try {
      channel = await fetchChannelByHandle(declared.handle, meter);
      verification = verifyOfficialChannel(declared, channel);
    } catch (error) {
      console.log(`  ✗ channels.list falló — ${error instanceof Error ? error.message : String(error)}`);
      console.log(`  NO VERIFICADO (sin datos: no se puede decidir, y no se decide a favor)`);
      console.log();
      continue;
    }

    if (!verification.ok || !verification.channel) {
      console.log(`  ✗ NO VERIFICADO — ${verification.reason}`);
      console.log(`      ${verification.detail}`);
      if (verification.descriptionDomains.length > 0) {
        console.log(
          `      dominios en la descripción del canal: ${verification.descriptionDomains.join(", ")}`
        );
      }
      console.log("      No se escribe nada para este artista.");
      console.log();
      continue;
    }

    const verified = verification.channel;
    console.log(`  ✓ VERIFICADO — ${verification.detail}`);
    console.log(`      tipo: ${verified.type ?? "(sin dato)"}`);
    console.log(
      `      ${verified.subscriberCount.toLocaleString("es-ES")} suscriptores · ${verified.viewCount.toLocaleString("es-ES")} visualizaciones`
    );
    console.log(`      id: ${verified.id}  ·  uploads: ${verified.uploadsPlaylistId}`);

    const artistId = artist?.id ?? null;
    if (artistId) {
      const already = (artist?.youtube_channel_id ?? "").trim();
      console.log(
        already === verified.id
          ? `      artists.youtube_channel_id ya es ${verified.id} — no cambia`
          : `      artists.youtube_channel_id: ${already || "(vacío)"} → ${verified.id}`
      );
      if (already !== verified.id) {
        channelUpdates.push({ artist: { id: artistId, name: declared.artistName, youtube_channel_id: already }, channelId: verified.id });
      }
    } else {
      console.log(`      ⚠️  no hay fila en artists con ese nombre: se busca el vídeo pero no se guarda el canal`);
    }
    console.log();

    if (onlyChannels || !verified.uploadsPlaylistId || !artistId) continue;

    let uploads: OfficialVideoCandidate[] = [];
    try {
      uploads = await fetchUploadsPlaylist(verified.uploadsPlaylistId, pages, meter);
    } catch (error) {
      console.log(
        `  ✗ playlistItems.list falló — ${error instanceof Error ? error.message : String(error)}`
      );
      console.log();
      continue;
    }
    console.log(`  playlist de subidas: ${uploads.length} vídeo(s) leídos`);

    const tracks = await readTracks(declared.artistName);
    console.log(`  pistas del catálogo: ${tracks.length}`);
    console.log();

    for (const track of tracks) {
      const wanted = {
        id: track.id,
        title: track.title,
        artistName: track.artist_name,
        currentVideoId: track.youtube_video_id,
        currentEmbedUrl: track.video_embed_url,
      };

      // Vista rápida antes de gastar la comprobación HTTP.
      const nearMisses = uploads.filter(
        (u) => matchOfficialVideoTitle(u.title, track.title) !== "distinto",
      );
      const exactTitle = nearMisses.filter(
        (u) => matchOfficialVideoTitle(u.title, track.title) === "exacto",
      );

      const resolution = await resolveOfficialVideo(wanted, uploads, {
        channelId: verified.id,
        verify: (videoId) => probeOfficialVideo(videoId),
      });
      resolutions.push(resolution);

      const update = buildOfficialVideoUpdate(resolution);
      const kind = track.release_id ? "hija" : "release";
      console.log(`  ─ ${track.artist_name} — ${track.title}  (${kind}, ${track.id})`);

      if (!update || !resolution.chosen || !resolution.verified) {
        const rejectedExact = resolution.rejected.filter((r) => r.reason === "titulo-parcial");
        console.log(`      ✗ NO RESUELTO — ${resolution.reason}`);
        for (const r of rejectedExact.slice(0, 2)) {
          console.log(`          ${r.label}: ${r.detail}`);
        }
        for (const r of resolution.httpRejected.slice(0, 2)) {
          console.log(`          ${r.label}: ${r.detail}`);
        }
        console.log(
          `      (títulos cercanos en la playlist: ${exactTitle.length} exactos, ${rejectedExact.length} parciales)`
        );
        console.log();
        continue;
      }

      const chosen = resolution.chosen;
      const durationLabel = chosen.durationSeconds ? ` ${formatDuration(chosen.durationSeconds)}` : "";
      console.log(`      ✓ ${chosen.title}${durationLabel}`);
      console.log(`          ${chosen.videoId}   ${resolution.verified.detail}`);
      if (resolution.verified.oembedTitle) {
        console.log(`          YouTube lo titula: "${resolution.verified.oembedTitle}"`);
      }

      const timing = deriveChapterTiming(
        resolution.chapters,
        track.title,
        chosen.durationSeconds ?? 0,
      );
      if (resolution.chapters.length > 0) {
        console.log(
          `          capítulos reales en la descripción: ${resolution.chapters.length}` +
            (timing
              ? `  ·  este track: ${Math.round(timing.startTime)}s–${Math.round(timing.endTime)}s (INFORMADO, no escrito)`
              : `  ·  ningún capítulo con el título exacto (NO se escribe start_time/end_time)`)
        );
      } else {
        console.log(
          `          sin capítulos reales: los start_time/end_time del seed son INVENTADOS (derivados de la`
        );
        console.log(
          `          duración del álbum), así que se dejan como están. No se escribe nada aquí.`
        );
      }

      const unchanged =
        (track.youtube_video_id ?? "").trim() === update.youtube_video_id &&
        (track.video_embed_url ?? "").trim() === update.video_embed_url;
      if (unchanged) {
        console.log(`      = ya estaba escrito (${update.youtube_video_id}) — no cambia`);
      } else {
        console.log(`      → youtube_video_id = ${update.youtube_video_id}`);
      }
      console.log();
    }
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  const updates: OfficialVideoUpdate[] = selectOfficialVideoUpdates(resolutions);
  const resolved = resolutions.filter((r) => r.chosen !== null);

  console.log(`${"=".repeat(96)}`);
  console.log(`Canales verificados: ${channelUpdates.length} de ${candidates.length}`);
  for (const u of channelUpdates) {
    console.log(`  ✓ ${u.artist.name} → ${u.channelId}`);
  }
  console.log(`Pistas con vídeo verificado: ${resolved.length} de ${resolutions.length}`);
  for (const r of resolved) {
    console.log(`  ✓ ${r.wanted.artistName} — ${r.wanted.title}  → ${r.chosen?.videoId}`);
  }
  console.log(`A escribir en tracks: ${updates.length} fila(s)`);
  console.log(`A escribir en artists.youtube_channel_id: ${channelUpdates.length} fila(s)`);
  console.log("");
  console.log("Consumo de cuota del API v3:");
  console.log(`  llamadas: ${meter.calls}   unidades: ${meter.spent} / 10 000 diarias`);
  for (const charge of meter.charges) {
    console.log(`    ${String(charge.units).padStart(3)} u  ${charge.method.padEnd(14)} ${charge.label}`);
  }
  console.log(`  search.list: 0 llamadas (bucket aparte sin tocar)`);
  console.log(`${"=".repeat(96)}`);

  if (!apply) {
    console.log("\n🔍 DRY-RUN. No se escribió nada. Añade --apply para escribir lo verificado.");
    return;
  }

  let writtenArtists = 0;
  for (const u of channelUpdates) {
    try {
      await setArtistYouTubeChannelId(u.artist.id, u.channelId);
      writtenArtists++;
      console.log(`  ↻ artists.${u.artist.name}.youtube_channel_id = ${u.channelId}`);
    } catch (error) {
      console.log(
        `  ⚠️  ${u.artist.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  let writtenTracks = 0;
  const failed: { id: string; detail: string }[] = [];
  for (const update of updates) {
    try {
      const changes = await writeTrackVideo(
        update.id,
        update.youtube_video_id,
        update.video_embed_url,
      );
      if (changes > 0) {
        writtenTracks += changes;
        console.log(`  ↻ ${update.id} → ${update.youtube_video_id}`);
      } else {
        failed.push({ id: update.id, detail: "0 filas afectadas" });
      }
    } catch (error) {
      failed.push({ id: update.id, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(`\n✅ ${writtenTracks} fila(s) de tracks y ${writtenArtists} de artists en ${engine}.`);
  console.log("   Recuerda: esto NO hace que las pistas suenen. El reproductor sigue usando el preview.");
  if (failed.length > 0) {
    console.log(`   ⚠️  ${failed.length} escritura(s) fallaron:`);
    for (const f of failed) console.log(`      ${f.id}: ${f.detail}`);
  }
}

const invokedDirectly = (process.argv[1] ?? "")
  .replace(/\\/g, "/")
  .endsWith("fetch-official-videos.ts");

if (invokedDirectly) {
  main().catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
}