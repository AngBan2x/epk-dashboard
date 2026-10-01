#!/usr/bin/env tsx
/**
 * Previews de audio de **Deezer** para el catálogo (RC.32 · agente G).
 *
 * ## Qué hace
 *
 * Busca en `api.deezer.com` un preview de 30 s para las pistas que no tienen
 * ninguna fuente reproducible, y **los deja apuntados**. Lo segundo es lo
 * importante, y a continuacion se explica por queé.
 *
 * ## POR QUÉ ESTE SCRIPT NO ESCRIBE NADA (y no es un fallo)
 *
 * Dos mediciones, hechas **antes** de escribir este script.
 *
 * ### 1 — No hace falta proxy por CORS
 *
 * El plan (`docs/PLAN_RC32.md:155`) decía "Deezer (con proxy por CORS)", igual
 * que se dijo de Spotify. **Es falso**, y `curl -sI` con
 * `Origin: https://epk-dashboard.vercel.app` lo demuestra:
 *
 * ```
 * cdnt-preview.dzcdn.net -> HTTP/1.1 200 OK
 *   Access-Control-Allow-Origin: *
 *   Access-Control-Allow-Headers: Range
 *   Accept-Ranges: bytes
 *   Content-Type: audio/mpeg
 * ```
 *
 * El `<audio>` reproduce cross-origin sin problema. No hay proxy que escribir.
 *
 * ### 2 — Pero la URL caduca a los 15 minutos
 *
 * La URL de preview no es un recurso estable: es un recurso **firmado** por
 * Akamai, con `?hdnea=exp=…~acl=…~data=…~hmac=…`. `exp` es un expiry de verdad:
 *
 * ```
 * exp - ahora = 900 s exactos   (medido con dos tokens frescos)
 * ```
 *
 * Y la firma es obligatoria — la misma ruta **sin** la query firmada devuelve
 *
 * ```
 * HTTP/1.1 403 Forbidden
 * ```
 *
 * así que no hay forma de estabilizar la URL quitando la query. Guardarla en
 * `audio_preview_url` reproduciría **exactamente** el bug que
 * `scripts/fetch-itunes-previews.ts` documenta en su cabecera: las 6 URLs
 * escritas a mano en el seed caducaron, la tarjeta enseña "Reproducir" y el
 * `<audio>` responde "archivo no disponible". Es **peor** que no tener audio,
 * porque parece funcionar.
 *
 * Por eso el script **identifica** las pistas que Deezer puede dar, las imprime
 * con su código HTTP, su `content-type` y su vida restante, y **no escribe**.
 * `buildDeezerUpdate` devuelve `null` para toda URL de Deezer y eso es el
 * comportamiento correcto, no un fallo pendiente.
 *
 * Lo que hace falta para cerrar el asunto es una resolución **en tiempo de
 * ejecución** (un endpoint propio que, dada artista+título, pida el preview
 * fresco a Deezer y devuelva la URL firmada). Eso es una ruta de API, y
 * `app/api/**` no es de este agente: queda publicado, no implementado.
 *
 * ## LO QUE SÍ HACE, Y ESTÁ HECHO A MEDIDA
 *
 * - **La desambiguación es la parte real del trabajo.** 9 de las 17 pistas sin
 *   fuente se identifican con certeza. Las 8 restantes quedan `NO RESUELTO` con
 *   el motivo, y ese es el resultado correcto.
 * - **Verifica HTTP cada URL antes de ofrecerla**, y lo imprime: código,
 *   `content-type`, `ACAO` y TTL. Una URL que no dé 200 no se ofrece.
 * - **No rellena `itunes_track_id`.** No hay columna `deezer_track_id` y no se
 *   inventa un campo; escribir un id de Deezer en la columna de iTunes haría que
 *   `lib/downloadable-assets.ts:299` construyera un enlace de Apple Music a otra
 *   canción.
 *
 * ## SOBRE LA CLAVE
 *
 * La API **no necesita `appId`**: `api.deezer.com/track/3135556` responde 200
 * sin credencial (el token va incrustado con `application_id=42`, el del
 * reproductor web). Aun así el script acepta `DEEZER_APP_ID` del entorno por si
 * algún día hace falta, y **avisa** si no lo hay, en vez de fallar después con
 * un 403 críptico.
 *
 * USO
 *
 * ```
 * npx tsx scripts/fetch-deezer-previews.ts              # dry-run
 * npx tsx scripts/fetch-deezer-previews.ts --apply      # escribe (hoy: 0 filas)
 * npx tsx scripts/fetch-deezer-previews.ts --artist="Kraftwerk"
 * npx tsx scripts/fetch-deezer-previews.ts --limit=3
 * ```
 */

import fs from "node:fs";
import {
  DEEZER_PREVIEW_TOKEN_TTL_SECONDS,
  MIN_DURABLE_PREVIEW_TTL_SECONDS,
  collectionMatches,
  hasITunesArtwork,
  isTrackResult,
  matchDeezerTitle,
  resolveDeezerPreview,
  selectDeezerUpdates,
  type AudioProbe,
  type DeezerCandidate,
  type DeezerResolution,
  type DeezerWanted,
} from "../lib/deezer";

/**
 * `api.deezer.com` **no** publica un tipo de letra fijo. Este `User-Agent` se
 * manda igualmente porque es lo que un cliente identificable debe hacer, y
 * porque deja constancia en la petición de quién es.
 */
const USER_AGENT = "PressPlay/1.0 (https://epk-dashboard.vercel.app)";
/**
 * Límite de la API pública. No se pide más de lo que se usa: son ~20 llamadas
 * para 17 pistas, con reintento por pista.
 */
const SEARCH_DELAY_MS = 350;
const SEARCH_LIMIT = 10;
/** `album/{id}/tracks`: tope generoso, porque un álbum puede traer muchas. */
const ALBUM_TRACK_LIMIT = 50;

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

// ---------------------------------------------------------------------------
// Acceso a datos — @libsql/client directo, como `scripts/turso-check.ts`
// ---------------------------------------------------------------------------
//
// No se usa `lib/db.ts` ni `lib/turso.ts`: los está reescribiendo el agente A y
// el F **en este momento**, y atar este script a sus exportaciones crea un
// acoplamiento que se rompe bajo los pies. El acceso directo es el patrón que ya
// usa `scripts/turso-check.ts` y no depende de nadie.

interface TrackRow {
  id: string;
  title: string;
  artist_name: string;
  release_id: string | null;
  release_date: string | null;
  audio_preview_url: string | null;
  cover_image: string | null;
}

function parseRow(raw: Record<string, unknown>): TrackRow {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    artist_name: String(raw.artist_name ?? ""),
    release_id: raw.release_id == null ? null : String(raw.release_id),
    release_date: raw.release_date == null ? null : String(raw.release_date),
    audio_preview_url: raw.audio_preview_url == null ? null : String(raw.audio_preview_url),
    cover_image: raw.cover_image == null ? null : String(raw.cover_image),
  };
}

function isTursoBackend(): boolean {
  return !!process.env.TURSO_DATABASE_URL && !!process.env.TURSO_AUTH_TOKEN;
}

async function readRows(): Promise<TrackRow[]> {
  const sql = `SELECT t.id, t.title, t.artist_name, t.release_id, t.release_date,
                      t.audio_preview_url, t.cover_image
                 FROM tracks t
                ORDER BY t.artist_name, t.release_id IS NULL DESC, t.created_at, t.id`;
  if (isTursoBackend()) {
    const { createClient } = await import("@libsql/client");
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL as string,
      authToken: process.env.TURSO_AUTH_TOKEN as string,
    });
    const result = await client.execute(sql);
    return result.rows.map((r) => parseRow(r as Record<string, unknown>));
  }
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const path = require("node:path") as typeof import("node:path");
  const db = new Database(path.join(process.cwd(), "data", "music_catalog.db"));
  try {
    return (db.prepare(sql).all() as unknown[]).map((r) =>
      parseRow(r as Record<string, unknown>)
    );
  } finally {
    db.close();
  }
}

async function writePreviewUrl(trackId: string, url: string): Promise<number> {
  const sql = "UPDATE tracks SET audio_preview_url = ? WHERE id = ?";
  if (isTursoBackend()) {
    const { createClient } = await import("@libsql/client");
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL as string,
      authToken: process.env.TURSO_AUTH_TOKEN as string,
    });
    const result = await client.execute({ sql, args: [url, trackId] });
    return Number(result.rowsAffected ?? 0);
  }
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const path = require("node:path") as typeof import("node:path");
  const db = new Database(path.join(process.cwd(), "data", "music_catalog.db"));
  try {
    return Number(db.prepare(sql).run(url, trackId).changes ?? 0);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Deezer
// ---------------------------------------------------------------------------

function deezerUrl(pathname: string): string {
  const appId = (process.env.DEEZER_APP_ID ?? "").trim();
  const base = `https://api.deezer.com${pathname}`;
  return appId ? `${base}${base.includes("?") ? "&" : "?"}app_id=${encodeURIComponent(appId)}` : base;
}

async function deezerJson(pathname: string): Promise<unknown> {
  const res = await fetch(deezerUrl(pathname), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en ${pathname}`);
  }
  return res.json();
}

function toCandidate(raw: unknown): DeezerCandidate | null {
  const r = raw as Record<string, unknown>;
  if (!r || typeof r.id !== "number") return null;
  const artist = r.artist as Record<string, unknown> | undefined;
  const album = r.album as Record<string, unknown> | undefined;
  return {
    id: r.id,
    title: String(r.title ?? ""),
    artistName: String(artist?.name ?? ""),
    albumTitle: String(album?.title ?? ""),
    albumId: typeof album?.id === "number" ? album.id : undefined,
    previewUrl: typeof r.preview === "string" ? r.preview : undefined,
    releaseDate: typeof r.release_date === "string" ? r.release_date : null,
    type: typeof r.type === "string" ? r.type : undefined,
  };
}

/** `search` devuelve tracks y albums mezclados. */
async function searchDeezer(term: string): Promise<DeezerCandidate[]> {
  const data = await deezerJson(`/search?q=${encodeURIComponent(term)}&limit=${SEARCH_LIMIT}`);
  const list = (data as { data?: unknown[] }).data ?? [];
  return list.map(toCandidate).filter((c): c is DeezerCandidate => c !== null);
}

/**
 * `/track/{id}` — el detalle de una pista.
 *
 * Hace falta porque **`/search` no devuelve `release_date`** (sí el `preview`),
 * y sin la fecha no se puede desempatar una reedición de otra. Se llama **solo**
 * para los candidatos que ya pasaron el filtro, nunca en bloque.
 */
async function fetchTrackDetail(id: number): Promise<DeezerCandidate | null> {
  try {
    return toCandidate(await deezerJson(`/track/${id}`));
  } catch {
    return null;
  }
}

/**
 * `search/album` — los álbumes cuyo título encaja con el ancla.
 *
 * Existe por un caso **medido**: la búsqueda libre de `"Björk Stonemilker
 * (Strings)"` solo devuelve `Stonemilker (Live)`, que se descarta. El álbum
 * *"Vulnicura Strings (…Strings, Voice And Viola Organista Only)"* sí está, y
 * sus pistas se llaman `Stonemilker`, `Family`, `Lionsong`, `Black Lake`,
 * `Notget` **a secas**. La búsqueda libre no encuentra la pista correcta; el
 * álbum sí, y enumerarlo da los títulos **reales**, que es justo lo que la
 * desambiguación necesita.
 */
async function searchDeezerAlbum(albumTitle: string): Promise<Array<{ id: number; title: string; artistName: string }>> {
  const data = await deezerJson(`/search/album?q=${encodeURIComponent(albumTitle)}&limit=${SEARCH_LIMIT}`);
  const list = (data as { data?: unknown[] }).data ?? [];
  const out: Array<{ id: number; title: string; artistName: string }> = [];
  for (const raw of list) {
    const r = raw as Record<string, unknown>;
    if (!r || typeof r.id !== "number") continue;
    const artist = r.artist as Record<string, unknown> | undefined;
    out.push({
      id: r.id,
      title: String(r.title ?? ""),
      artistName: String(artist?.name ?? ""),
    });
  }
  return out;
}

/** `album/{id}/tracks` — las pistas del álbum, con sus títulos reales. */
async function fetchAlbumTracks(albumId: number): Promise<DeezerCandidate[]> {
  const data = await deezerJson(`/album/${albumId}/tracks?limit=${ALBUM_TRACK_LIMIT}`);
  const list = (data as { data?: unknown[] }).data ?? [];
  return list
    .map(toCandidate)
    .filter((c): c is DeezerCandidate => c !== null)
    .map((c) => ({ ...c, type: "track" }));
}

/**
 * Candidatos sacados del **álbum del ancla**, cacheados por título de colección.
 *
 * Las 5 hijas de Björk comparten ancla, y las 3 de Kraftwerk también: sin caché
 * se repetiría la misma búsqueda 5 veces. `collectionMatches` es el filtro, y es
 * el mismo que usa `resolveDeezerPreview`, así que el disco se elige con la
 * misma regla con la que luego se exige que el candidato venga de él.
 */
const albumCache = new Map<string, DeezerCandidate[]>();

async function albumCandidates(anchorTitle: string): Promise<DeezerCandidate[]> {
  const cached = albumCache.get(anchorTitle);
  if (cached) return cached;

  const tracks: DeezerCandidate[] = [];
  let albums: Array<{ id: number; title: string; artistName: string }> = [];
  try {
    albums = await searchDeezerAlbum(anchorTitle);
  } catch {
    albumCache.set(anchorTitle, tracks);
    return tracks;
  }

  const matching = albums.filter((a) => collectionMatches(a.title, anchorTitle)).slice(0, 3);
  for (const album of matching) {
    await sleep(SEARCH_DELAY_MS);
    try {
      const albumTracks = await fetchAlbumTracks(album.id);
      // `search/album` sí trae el nombre del artista; `/album/{id}/tracks` no lo
      // garantiza, así que se completa desde el álbum para que el filtro de
      // artista pueda decidir.
      for (const track of albumTracks) {
        if (!track.artistName) track.artistName = album.artistName;
        track.albumTitle = track.albumTitle || album.title;
      }
      tracks.push(...albumTracks);
    } catch {
      // Un álbum sin pistas legibles no invalida los demás.
    }
  }

  albumCache.set(anchorTitle, tracks);
  return tracks;
}

const OK_CONTENT_TYPES = ["audio/", "application/octet-stream"];

/**
 * Petición HTTP de verdad a la URL, **con `Origin`**, porque lo que importa es
 * si el CDN responde como lo vería el navegador.
 *
 * Se acepta 200 y también 206: un `GET` con `Range` a un recurso con
 * `Accept-Ranges: bytes` devuelve 206, y eso también es "existe".
 */
async function probePreviewUrl(url: string): Promise<AudioProbe> {
  if (typeof url !== "string" || url.trim() === "") {
    return { ok: false, reason: "sin-preview", detail: "URL vacía" };
  }
  const target = url.trim();

  const attempt = async (method: "HEAD" | "GET"): Promise<Response> =>
    fetch(target, {
      method,
      headers: {
        Origin: "https://epk-dashboard.vercel.app",
        "User-Agent": USER_AGENT,
        ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
      },
      redirect: "follow",
    });

  let res: Response;
  try {
    res = await attempt("HEAD");
  } catch (error) {
    return {
      ok: false,
      reason: "http-no-200",
      detail: `la petición falló: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let usedRangeGet = false;
  if (res.status === 405 || res.status === 501) {
    try {
      res = await attempt("GET");
    } catch (error) {
      return {
        ok: false,
        reason: "http-no-200",
        detail: `la petición falló: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    usedRangeGet = true;
  }

  const httpStatus = res.status;
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const acao = res.headers.get("access-control-allow-origin");

  if (httpStatus !== 200 && !(usedRangeGet && httpStatus === 206)) {
    return { ok: false, reason: "http-no-200", detail: `HTTP ${httpStatus}` };
  }
  if (!OK_CONTENT_TYPES.some((prefix) => contentType.toLowerCase().startsWith(prefix))) {
    return {
      ok: false,
      reason: "content-type-no-audio",
      detail: `content-type "${contentType || "(vacío)"}"`,
    };
  }
  if (!acao) {
    return {
      ok: false,
      reason: "sin-acao",
      detail: "el CDN no devolvió Access-Control-Allow-Origin",
    };
  }

  return { ok: true, url: target, httpStatus, contentType, accessControlAllowOrigin: acao };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function argValue(flag: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}

function shortUrl(url: string): string {
  const file = url.split("?")[0].split("/").pop() ?? url;
  return file.length > 44 ? `…${file.slice(-40)}` : file;
}

async function main(): Promise<void> {
  loadEnv();

  const apply = process.argv.slice(2).includes("--apply");
  const onlyArtist = argValue("--artist");
  const limitArg = argValue("--limit");
  const limit = limitArg ? Number(limitArg) : Number.POSITIVE_INFINITY;

  const engine = isTursoBackend() ? "Turso" : "SQLite local";
  const startedAt = Date.now();

  console.log(`\n${apply ? "🔊 APLICANDO" : "🔍 DRY-RUN"} — previews de audio Deezer (RC.32 · G)`);
  console.log(`Motor: ${engine}`);
  console.log(`Clave: ${(process.env.DEEZER_APP_ID ?? "").trim() ? "DEEZER_APP_ID presente" : "sin DEEZER_APP_ID — no hace falta: la API pública responde 200 sin credencial"}`);
  console.log(
    `CORS: medido, el CDN de Deezer manda Access-Control-Allow-Origin: * → NO hace falta proxy.`
  );
  console.log(
    `Caducidad: el token hdnea expira a los ${DEEZER_PREVIEW_TOKEN_TTL_SECONDS} s (medido). ` +
      `Nada con menos de ${Math.round(MIN_DURABLE_PREVIEW_TTL_SECONDS / 86400)} días de vida se escribe.\n`
  );

  const rows = await readRows();
  const byId = new Map(rows.map((r) => [r.id, r]));

  /**
   * El ancla de colección: el título del release padre, pero SOLO si su portada
   * se resolvió por iTunes (`mzstatic.com`). Sin ancla no hay prueba de cuál es
   * la grabación, y entonces solo vale una coincidencia exacta de título.
   */
  const anchorFor = (row: TrackRow): string | null => {
    const parent = row.release_id ? byId.get(row.release_id) ?? null : row;
    if (!parent) return null;
    return hasITunesArtwork(parent.cover_image) ? parent.title : null;
  };

  // Solo las pistas sin ninguna fuente reproducible. Una fila que ya tiene
  // preview no se toca: es más rápido que re-buscar pistas que ya suenan, y
  // evita cambiar URLs buenas por otras equivalentes sin motivo.
  const missing = rows.filter((r) => {
    const has = (r.audio_preview_url ?? "").trim();
    return has === "" || has === "-" || has === "—";
  });
  const selected = missing
    .filter((r) => (onlyArtist ? r.artist_name === onlyArtist : true))
    .slice(0, Number.isFinite(limit) ? limit : missing.length);

  console.log(`Pistas en la base de datos: ${rows.length}`);
  console.log(`Sin preview previo: ${missing.length}`);
  console.log(`A buscar en Deezer: ${selected.length}\n`);

  const resolutions: DeezerResolution[] = [];
  let searchCalls = 0;

  for (const [index, row] of selected.entries()) {
    const anchor = anchorFor(row);
    const wanted: DeezerWanted = {
      id: row.id,
      title: row.title,
      artistName: row.artist_name,
      releaseDate: row.release_date,
      expectedCollection: anchor,
      currentPreviewUrl: row.audio_preview_url,
    };

    console.log(`${"-".repeat(96)}`);
    console.log(`[${index + 1}/${selected.length}] ${row.artist_name} — ${row.title}   (${row.id})`);
    console.log(`  release: ${row.release_id ? `hija de ${row.release_id}` : "padre"}`);
    console.log(`  fecha en el catálogo: ${row.release_date ?? "(sin fecha)"}`);
    console.log(
      `  ancla de colección: ${
        anchor ? `"${anchor}" (la portada del release viene de iTunes)` : "ninguna"
      }`
    );

    // Dos términos, de más ancho a más estrecho. No son "más intentos hasta que
    // salga algo": cada intento pasa **el mismo filtro** (artista exacto, título
    // exacto o calificado con ancla, y la prueba HTTP). Solo cambia la
    // relevancia que devuelve Deezer.
    const terms = [
      `${row.artist_name} ${row.title}`.trim(),
      anchor ? `${anchor} ${row.title}`.trim() : `${row.title} ${row.artist_name}`.trim(),
    ];

    let resolution: DeezerResolution | null = null;

    for (const [attempt, term] of terms.entries()) {
      if (attempt > 0) await sleep(SEARCH_DELAY_MS);
      let candidates: DeezerCandidate[] = [];
      try {
        candidates = await searchDeezer(term);
        searchCalls += 1;
      } catch (error) {
        console.log(`  Deezer "${term}" → ERROR: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const trackCount = candidates.filter(isTrackResult).length;
      console.log(
        `  Deezer "${term}" → ${candidates.length} resultado(s), ${trackCount} de tipo track`
      );

      /**
       * Con ancla se añaden las pistas del **álbum del ancla**. Es lo que
       * encuentra los títulos reales de las versiones de cuerdas de Björk, que
       * la búsqueda libre no saca (medido: solo devuelve `Stonemilker (Live)`).
       */
      let albumTracks: DeezerCandidate[] = [];
      if (anchor) {
        albumTracks = await albumCandidates(anchor);
        if (albumTracks.length > 0) {
          console.log(`  álbum del ancla "${anchor}" → ${albumTracks.length} pista(s) enumeradas`);
        }
      }

      // `/search` no trae `release_date`. Se enriquece con `/track/{id}` **solo**
      // los que pasaron artista+título+colección, para no gastar llamadas.
      const combined = [...candidates, ...albumTracks];
      const viable = combined.filter((c) => {
        if (!isTrackResult(c)) return false;
        if (!c.artistName || c.artistName.toLowerCase() !== row.artist_name.toLowerCase()) return false;
        return matchDeezerTitle(c.title, row.title, anchor !== null) !== "distinto";
      });
      const enriched: DeezerCandidate[] = [];
      for (const c of combined) {
        if (!viable.includes(c)) {
          enriched.push(c);
          continue;
        }
        const detail = await fetchTrackDetail(c.id);
        enriched.push(
          detail ? { ...c, releaseDate: detail.releaseDate ?? c.releaseDate, albumTitle: detail.albumTitle || c.albumTitle } : c
        );
        await sleep(SEARCH_DELAY_MS);
      }

      resolution = await resolveDeezerPreview(wanted, enriched, probePreviewUrl, startedAt);
      for (const r of resolution.rejected.slice(0, 4)) {
        console.log(`    descartado ${r.label} — ${r.detail} [${r.reason}]`);
      }
      if (resolution.rejected.length > 4) {
        console.log(`    … y ${resolution.rejected.length - 4} descartado(s) más`);
      }
      for (const r of resolution.httpRejected) {
        console.log(`    DESCARTADO POR HTTP ${r.label} — ${r.detail} [${r.reason}]`);
      }
      if (resolution.chosen) break;
      if (attempt < terms.length - 1) {
        console.log(`    sin coincidencia; se reintenta con "${terms[attempt + 1]}"`);
      }
    }

    const final = resolution ?? {
      wanted,
      chosen: null,
      verified: null,
      reason: "Deezer no respondió a ninguna búsqueda",
      httpRejected: [],
      rejected: [],
      usedQualifiedTitle: false,
      ttlSeconds: null,
    };
    resolutions.push(final);

    if (final.chosen && final.verified) {
      const v = final.verified;
      console.log(`  ✓ ${final.chosen.title} — ${final.chosen.artistName}  [${final.chosen.albumTitle}]`);
      if (final.usedQualifiedTitle) {
        console.log(
          `      ⚠ título NO idéntico: aceptado porque el ancla "${wanted.expectedCollection}" prueba la grabación`
        );
      }
      console.log(`      deezer id: ${final.chosen.id}`);
      console.log(`      url:  ${v.url}`);
      console.log(
        `      HTTP ${v.httpStatus}   content-type: ${v.contentType}   ACAO: ${v.accessControlAllowOrigin}`
      );
      console.log(
        `      vida restante: ${final.ttlSeconds ?? "?"} s  (el token caduca a los ${DEEZER_PREVIEW_TOKEN_TTL_SECONDS} s)`
      );
    } else {
      console.log(`  ✗ NO RESUELTO — ${final.reason}`);
    }
    console.log();

    if (index < selected.length - 1) await sleep(SEARCH_DELAY_MS);
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  const identified = resolutions.filter((r) => r.chosen);
  const unresolved = resolutions.filter((r) => !r.chosen);
  const updates = selectDeezerUpdates(resolutions, startedAt);
  const qualified = resolutions.filter((r) => r.usedQualifiedTitle);

  console.log(`${"=".repeat(96)}`);
  console.log(`IDENTIFICADAS en Deezer: ${identified.length} de ${selected.length}`);
  for (const r of identified) {
    console.log(
      `  ✓ ${r.wanted.artistName} — ${r.wanted.title}  → "${r.chosen?.title}" [${r.chosen?.albumTitle}]` +
        `  TTL ${r.ttlSeconds ?? "?"} s`
    );
  }
  console.log(`NO RESUELTAS: ${unresolved.length}`);
  for (const r of unresolved) {
    console.log(`  ✗ ${r.wanted.artistName} — ${r.wanted.title}  (${r.wanted.id})`);
    console.log(`      ${r.reason}`);
  }
  if (qualified.length > 0) {
    console.log(`\nTítulo aceptado SIN coincidencia exacta (con ancla de colección): ${qualified.length}`);
    for (const r of qualified) {
      console.log(`  · ${r.wanted.artistName} — "${r.wanted.title}" ← "${r.chosen?.title}" (ancla: ${r.wanted.expectedCollection})`);
    }
  }

  console.log(`\nLlamadas a api.deezer.com: ${searchCalls}`);
  console.log(`${"=".repeat(96)}`);

  if (updates.length === 0) {
    console.log(
      `\n⛔ 0 filas escribibles: toda URL de preview de Deezer caduca a los ${DEEZER_PREVIEW_TOKEN_TTL_SECONDS} s.`
    );
    console.log(
      `   Escribirla produciría una tarjeta con "Reproducir" que responde "archivo no disponible"` +
        ` — el mismo bug que las URLs caducadas del seed.`
    );
    console.log(
      `   Las ${identified.length} pistas identificadas arriba sí se pueden reproducir: hace falta resolver`
    );
    console.log(
      `   el preview en tiempo de ejecución (endpoint propio → Deezer → URL firmada). Pendiente de otro agente: app/api/**.`
    );
    if (apply) {
      console.log(`   --apply no tiene nada que escribir. Saliendo sin cambios.`);
    }
    return;
  }

  if (!apply) {
    console.log(`\n🔍 DRY-RUN. No se escribió nada. Añade --apply para escribir ${updates.length} fila(s).`);
    return;
  }

  let written = 0;
  const failed: { id: string; detail: string }[] = [];
  for (const update of updates) {
    try {
      const changes = await writePreviewUrl(update.id, update.audio_preview_url);
      if (changes > 0) {
        written += changes;
        console.log(`  ↻ ${update.id} → HTTP ${update.verified.httpStatus} ${shortUrl(update.audio_preview_url)}`);
      } else {
        failed.push({ id: update.id, detail: "0 filas afectadas" });
      }
    } catch (error) {
      failed.push({ id: update.id, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(`\n✅ ${written} fila(s) actualizadas en ${engine}.`);
  console.log(`   ${unresolved.length} pista(s) quedan SIN preview: no se rellenaron.`);
  if (failed.length > 0) {
    console.log(`   ⚠️  ${failed.length} escritura(s) fallaron:`);
    for (const f of failed) console.log(`      ${f.id}: ${f.detail}`);
  }
}

const invokedDirectly = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("fetch-deezer-previews.ts");

if (invokedDirectly) {
  main().catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
}