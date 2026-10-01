#!/usr/bin/env tsx
/**
 * Carátulas reales desde **MusicBrainz + Cover Art Archive** (RC.32 · agente G).
 *
 * ## POR QUÉ ESTA FUENTE
 *
 * MusicBrainz / Cover Art Archive no existía en el repo (0 hits). Es la fuente
 * correcta para las releases cuya portada es una **foto de banco**: gratis, sin
 * clave, y con **licencia verificable** — el mismo criterio que ya se aplicó a
 * los retratos de artistas en `AI_LOG.md`.
 *
 * ## LO QUE NO SE USA: EL THUMBNAIL DE YOUTUBE
 *
 * `lib/youtube.ts:82-85` construye
 * `https://img.youtube.com/vi/<id>/maxresdefault.jpg`, y el catálogo lo usa hoy
 * como `cover_image` en varios sitios. Es tentador porque ya está escrito,
 * compila y "funciona".
 *
 * **No es una carátula.** `maxresdefault.jpg` es **el fotograma que el uploader
 * exportó como miniatura del vídeo**: una captura del visualizationizer, un
 * cartel automático de YouTube, o un fondo que el canal cambió al publicar. No
 * tiene nada que ver con la portada del disco, y depende de un vídeo que
 * alguien puede borrar.
 *
 * Puesta en `cover_image` se hace pasar por artwork. Y es **peor** que una foto
 * de banco, porque una foto de banco al menos parece lo que es; esto parece una
 * portada. Por eso hay una comprobación explícita
 * (`isYouTubeThumbnailUrl`) y un test que falla al revertirla.
 *
 * LA REGLA QUE SE APLICA
 *
 * ```
 * foto de banco vacía o presente   -> se sustituye
 * portada de iTunes (mzstatic.com) -> NO se toca
 * thumbnail de YouTube             -> NO se toca (no es artwork)
 * ```
 *
 * `shouldReplaceCover` decide eso, y `scripts/fetch-itunes-covers.ts` ya hacía lo
 * mismo por su lado.
 *
 * ## CÓMO SE DESAMBIGUA
 *
 * Aquí **no** hay holgura de título, a diferencia del audio: se exige
 * **artista exacto + título exacto**, y el año desempata. Ese año es
 * precisamente lo que separa el single de *Tour de France* (1983) del **álbum**
 * de 2003 con el mismo nombre, que es el error que ya se cometió con iTunes
 * (`fetch-itunes-previews.ts`, cabecera).
 *
 * Si un release no cuadra, queda `NO RESUELTO`. Una foto de banco es mala
 * música, pero un placeholder que se hace pasar por artwork es peor: por eso no
 * se sustituye un Unsplash por otro Unsplash.
 *
 * ## REGLAS DE LA API, RESPETADAS
 *
 * - **User-Agent identificable.** MusicBrainz **exige** uno y bloquea el
 *   anónimo. Va en cada petición.
 * - **~1 req/s.** Las peticiones son **secuenciales**, nunca en paralelo. Un
 *   `Promise.all` aquí es la forma más rápida de que MusicBrainz te cierre la
 *   puerta.
 *
 * ## CÓMO SE GUARDA LA URL
 *
 * Cover Art Archive es un **redirector**: `…/release/<mbid>/front` responde
 * `307` → la URL canónica `archive.org/download/mbid-…jpg` → `302` → un nodo
 * concreto (`dn710007.ca.archive.org`, `ia903209.us.archive.org`, …). Se guarda
 * la **canónica**, que es la que publica CAA y la que dura: guardar el nodo fija
 *
 * Un `Range: bytes=0-4096` evita bajarse la imagen entera, y la
 * verificacion se hace contra la URL **canonica** -la que se guarda-, no
 * contra la redireccion.
 * Dry-run por defecto. Verifica que el recurso es una imagen de verdad
 * (`content-type: image/*`, excluyendo SVG) antes de escribir nada.
 *
 * USO
 *
 * ```
 * npx tsx scripts/fetch-cover-art.ts              # dry-run
 * npx tsx scripts/fetch-cover-art.ts --apply      # escribe
 * npx tsx scripts/fetch-cover-art.ts --artist="Kraftwerk"
 * ```
 */

import fs from "node:fs";
import {
  isImageContentType,
  isStockPhotoUrl,
  isYouTubeThumbnailUrl,
  matchReleaseIdentity,
  rankMusicBrainzRelease,
  resolveCoverArt,
  selectCoverUpdates,
  type CoverResolution,
  type CoverWanted,
  type ImageProbe,
  type MusicBrainzRelease,
} from "../lib/deezer";

/**
 * MusicBrainz **exige** un User-Agent identificable y además limita a ~1 req/s
 * (`https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limit`). Con un
 * User-Agent anónimo devuelve 503 y encola; sin `sleep` entre peticiones
 * agota la cola y bloquea la IP. De ahí el retardo y el bucle secuencial.
 */
const USER_AGENT =
  "PressPlay/1.0 (https://epk-dashboard.vercel.app; catalogo@epk-dashboard.vercel.app)";
/** ~1 req/s: el límite declarado de MusicBrainz. */
const MB_DELAY_MS = 1_100;
const MB_LIMIT = 8;

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
// Acceso a datos — @libsql/client directo (ver nota en fetch-deezer-previews.ts)
// ---------------------------------------------------------------------------

interface TrackRow {
  id: string;
  title: string;
  artist_name: string;
  release_id: string | null;
  release_date: string | null;
  cover_image: string | null;
}

function parseRow(raw: Record<string, unknown>): TrackRow {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    artist_name: String(raw.artist_name ?? ""),
    release_id: raw.release_id == null ? null : String(raw.release_id),
    release_date: raw.release_date == null ? null : String(raw.release_date),
    cover_image: raw.cover_image == null ? null : String(raw.cover_image),
  };
}

function isTursoBackend(): boolean {
  return !!process.env.TURSO_DATABASE_URL && !!process.env.TURSO_AUTH_TOKEN;
}

async function readRows(): Promise<TrackRow[]> {
  const sql = `SELECT t.id, t.title, t.artist_name, t.release_id, t.release_date, t.cover_image
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

async function writeCover(trackId: string, coverImage: string): Promise<number> {
  const sql = "UPDATE tracks SET cover_image = ? WHERE id = ?";
  if (isTursoBackend()) {
    const { createClient } = await import("@libsql/client");
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL as string,
      authToken: process.env.TURSO_AUTH_TOKEN as string,
    });
    const result = await client.execute({ sql, args: [coverImage, trackId] });
    return Number(result.rowsAffected ?? 0);
  }
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const path = require("node:path") as typeof import("node:path");
  const db = new Database(path.join(process.cwd(), "data", "music_catalog.db"));
  try {
    return Number(db.prepare(sql).run(coverImage, trackId).changes ?? 0);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// MusicBrainz
// ---------------------------------------------------------------------------

/**
 * Una fila de `_nom` es o el nombre del artista o el nombre del *track* que
 * aporta. En `artist-credit` solo el primero es el artista; el resto son
 * colaboradores y SIEMPRE producen `Artist & Guest`, que no es el artista del
 * catálogo.
 */
function artistNameFromCredit(credit: unknown): string {
  const entries = Array.isArray(credit) ? credit : [];
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    if (name) names.push(name);
    // `joinphrase` (" & ", " feat. ") significa que hay más de un artista.
    const join = typeof record.joinphrase === "string" ? record.joinphrase : "";
    if (join.trim()) return names.join("").trim();
  }
  return names.join(", ");
}

async function searchMusicBrainzReleases(
  artist: string,
  title: string
): Promise<MusicBrainzRelease[]> {
  const query = `release:"${title}" AND artist:"${artist}"`;
  const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(
    query
  )}&fmt=json&limit=${MB_LIMIT}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en la búsqueda de MusicBrainz`);
  const data = (await res.json()) as { releases?: unknown[] };
  const list = Array.isArray(data.releases) ? data.releases : [];
  return list.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      title: String(r.title ?? ""),
      artistNames: artistNameFromCredit(r["artist-credit"]).split(", ").filter(Boolean),
      date: typeof r.date === "string" ? r.date : null,
      status: typeof r.status === "string" ? r.status : null,
      primaryType: typeof r["primary-type"] === "string" ? r["primary-type"] : null,
    };
  });
}

/**
 * Petición HTTP de verdad a la portada, y devolución de la URL **canónica**.
 *
 * Cover Art Archive es un redirector de **dos** saltos, y cada uno importa:
 *
 * ```
 * https://coverartarchive.org/release/<mbid>/front
 *   307 → https://archive.org/download/mbid-<mbid>/mbid-<mbid>-<n>.jpg   ← canónica
 *   302 → https://dn710007.ca.archive.org/0/items/mbid-<mbid>/…          ← nodo concreto
 * ```
 *
 * Lo que se guarda es la **canónica** (el `Location` del 307), no el `res.url`
 * de `fetch` con `redirect: "follow"`, que es el nodo. Archive.org reparte las
 * peticiones entre máquinas (`dn710007`, `ia903209`, …) y los nodos se rotan;
 * guardar uno fija la imagen a una máquina concreta. La forma `archive.org/download/…`
 * es la que CAA publica y la que dura.
 *
 * Aun así la verificación se hace **contra la URL que se va a guardar**, con
 * `Range` para no bajarse la imagen entera: se comprueba el recurso real, no una
 * redirección que podría estar muerta.
 */
async function probeCoverArt(url: string): Promise<ImageProbe> {
  if (typeof url !== "string" || url.trim() === "") {
    return { ok: false, reason: "sin-portada", detail: "URL vacía" };
  }
  const target = url.trim();
  const headers = {
    "User-Agent": USER_AGENT,
    Range: "bytes=0-4096",
    Origin: "https://epk-dashboard.vercel.app",
  };

  // 1) El 307 de CAA, sin seguir: de ahí sale la URL canónica.
  let canonical = target;
  try {
    const hop = await fetch(target, { method: "GET", headers, redirect: "manual" });
    const location = hop.headers.get("location");
    if (location) canonical = new URL(location, target).toString();
  } catch {
    // Si el primer salto falla, se intenta igualmente con la URL original.
  }

  // 2) Se verifica la canónica sí o sí.
  let res: Response;
  try {
    res = await fetch(canonical, { method: "GET", headers, redirect: "follow" });
  } catch (error) {
    return {
      ok: false,
      reason: "sin-portada",
      detail: `la petición falló: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const httpStatus = res.status;
  if (httpStatus !== 200 && httpStatus !== 206) {
    return { ok: false, reason: "sin-portada", detail: `HTTP ${httpStatus}` };
  }
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!isImageContentType(contentType)) {
    return {
      ok: false,
      reason: "no-es-imagen",
      detail: `content-type "${contentType || "(vacío)"}"`,
    };
  }

  const declared = res.headers.get("content-range") ?? "";
  const totalMatch = declared.match(/\/(\d+)$/);
  const contentLength = Number(res.headers.get("content-length") ?? "0");
  const bytes = totalMatch ? Number(totalMatch[1]) : contentLength;

  return { ok: true, url: canonical, httpStatus, contentType, bytes };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function argValue(flag: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}

async function main(): Promise<void> {
  loadEnv();

  const apply = process.argv.slice(2).includes("--apply");
  const onlyArtist = argValue("--artist");

  const engine = isTursoBackend() ? "Turso" : "SQLite local";

  console.log(`\n${apply ? "🖼️  APLICANDO" : "🔍 DRY-RUN"} — carátulas desde Cover Art Archive (RC.32 · G)`);
  console.log(`Motor: ${engine}`);
  console.log(`Fuente: MusicBrainz (search) → Cover Art Archive (front). Sin clave.`);
  console.log(`User-Agent identificable ✓   Ritmo: 1 req cada ${MB_DELAY_MS} ms, secuencial ✓`);
  console.log(`El thumbnail de YouTube se RECHAZA como carátula: es un fotograma del vídeo, no la portada del disco.\n`);

  const rows = await readRows();

  /**
   * Solo las releases con foto de banco. Las hijas heredan la portada del padre
   * en su propia columna, así que se corrigen todas: arreglar solo el padre
   * dejaría la foto de banco en las hijas.
   */
  const candidates = rows.filter((r) => {
    if (onlyArtist && r.artist_name !== onlyArtist) return false;
    return isStockPhotoUrl(r.cover_image) || (r.cover_image ?? "").trim() === "";
  });

  console.log(`Pistas en la base de datos: ${rows.length}`);
  console.log(`Con foto de banco o sin portada: ${candidates.length}`);
  const parents = new Set(candidates.filter((r) => !r.release_id).map((r) => r.id));
  const inherited = candidates.filter((r) => r.release_id && parents.has(r.release_id)).length;
  console.log(`  de ellas, ${parents.size} release(s) y ${inherited} hija(s) que heredan la portada\n`);

  // Se resuelve **una vez por release** (las hijas heredan la misma portada) y se
  // reparte el resultado: son la misma consulta y no tiene sentido repetirla.
  const byRelease = new Map<string, TrackRow[]>();
  for (const row of candidates) {
    const key = row.release_id ?? row.id;
    const list = byRelease.get(key) ?? [];
    list.push(row);
    byRelease.set(key, list);
  }

  const resolutions: CoverResolution[] = [];
  let mbCalls = 0;
  let caaCalls = 0;

  for (const [releaseId, members] of byRelease) {
    const parent = members[0];
    const wanted: CoverWanted = {
      id: parent.id,
      title: parent.title,
      artistName: parent.artist_name,
      releaseDate: parent.release_date,
      currentCoverImage: parent.cover_image,
    };

    console.log(`${"-".repeat(96)}`);
    console.log(
      `${parent.artist_name} — ${parent.title}   (release ${releaseId}, ${members.length} fila(s))`
    );
    console.log(`  fecha en el catálogo: ${parent.release_date ?? "(sin fecha)"}`);
    console.log(`  portada actual: ${(parent.cover_image ?? "(ninguna)").slice(0, 78)}`);

    let releases: MusicBrainzRelease[] = [];
    try {
      releases = await searchMusicBrainzReleases(parent.artist_name, parent.title);
      mbCalls += 1;
    } catch (error) {
      console.log(
        `  MusicBrainz → ERROR: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    await sleep(MB_DELAY_MS);

    // Solo se pasa a Cover Art Archive lo que ya pasó la comprobación de
    // identidad. Preguntar por un release equivocado es gastar cuota.
    const ranked = releases
      .filter((r) => matchReleaseIdentity(r, wanted).ok)
      .sort((a, b) => rankMusicBrainzRelease(b, wanted) - rankMusicBrainzRelease(a, wanted));
    console.log(`  MusicBrainz → ${releases.length} release(s), ${ranked.length} con artista+título exactos`);
    for (const r of releases.slice(0, 6)) {
      const identity = matchReleaseIdentity(r, wanted);
      console.log(
        `    ${identity.ok ? "✓" : "·"} "${r.title}" (${r.date ?? "sin fecha"}) ${r.status ?? ""} — ${identity.ok ? "pasa" : identity.detail}`
      );
    }

    let resolution: CoverResolution;
    if (ranked.length === 0) {
      resolution = {
        wanted,
        release: null,
        verified: null,
        reason:
          releases.length === 0
            ? "MusicBrainz no devolvió ningún release para esta búsqueda"
            : `ningún release pasó la verificación de artista + título exactos (${releases.length} descartado(s))`,
        rejected: [],
        usedQualifiedTitle: false,
      };
    } else {
      let caaProbeCount = 0;
      resolution = await resolveCoverArt(wanted, ranked, async (url) => {
        caaProbeCount += 1;
        caaCalls += 1;
        const result = await probeCoverArt(url);
        await sleep(MB_DELAY_MS);
        return result;
      });
      if (caaProbeCount > 0) {
        console.log(`  Cover Art Archive → ${caaProbeCount} consulta(s) de portada`);
      }
    }

    for (const r of resolution.rejected) {
      console.log(`    descartado ${r.label} — ${r.detail} [${r.reason}]`);
    }

    if (resolution.release && resolution.verified) {
      const v = resolution.verified;
      console.log(
        `  ✓ ${resolution.release.title} (${resolution.release.id}, ${resolution.release.date ?? "sin fecha"})`
      );
      console.log(`      portada: ${v.url}`);
      console.log(`      HTTP ${v.httpStatus}   content-type: ${v.contentType}   ~${v.bytes} bytes`);
      if (isYouTubeThumbnailUrl(v.url)) {
        console.log(`      ✗✗ esa URL es un thumbnail de YouTube: NO se acepta como carátula`);
      }
    } else {
      console.log(`  ✗ NO RESUELTO — ${resolution.reason}`);
      console.log(`      Se deja la foto de banco: es mala, pero un placeholder que parece artwork es peor.`);
    }
    console.log();

    resolutions.push(resolution);
    // La misma resolución para cada hija que hereda esta portada.
    for (const member of members.slice(1)) {
      resolutions.push({
        ...resolution,
        wanted: { ...wanted, id: member.id, currentCoverImage: member.cover_image },
      });
    }
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  const resolved = resolutions.filter((r) => r.verified !== null);
  const unresolved = resolutions.filter((r) => r.verified === null);
  const updates = selectCoverUpdates(resolutions);

  console.log(`${"=".repeat(96)}`);
  console.log(`RESUELTAS: ${resolved.length} de ${candidates.length} fila(s)`);
  for (const r of resolved) {
    console.log(`  ✓ ${r.wanted.artistName} — ${r.wanted.title}  (${r.wanted.id})`);
    console.log(`      ${r.verified?.url}`);
  }
  console.log(`NO RESUELTAS: ${unresolved.length}`);
  for (const r of unresolved) {
    console.log(`  ✗ ${r.wanted.artistName} — ${r.wanted.title}  (${r.wanted.id})`);
    console.log(`      ${r.reason}`);
  }
  console.log(`\nA escribir: ${updates.length} fila(s)   (de ${candidates.length} candidatas)`);
  console.log(`Consultas: MusicBrainz ${mbCalls} · Cover Art Archive ${caaCalls}`);
  console.log(`${"=".repeat(96)}`);

  if (!apply) {
    console.log("\n🔍 DRY-RUN. No se escribió nada. Añade --apply para escribir las carátulas verificadas.");
    return;
  }

  let written = 0;
  const failed: { id: string; detail: string }[] = [];
  for (const update of updates) {
    try {
      const changes = await writeCover(update.id, update.cover_image);
      if (changes > 0) {
        written += changes;
        console.log(`  ↻ ${update.id} → ${update.cover_image.slice(0, 88)}`);
      } else {
        failed.push({ id: update.id, detail: "0 filas afectadas" });
      }
    } catch (error) {
      failed.push({ id: update.id, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(`\n✅ ${written} fila(s) actualizadas en ${engine}.`);
  console.log(`   ${unresolved.length} fila(s) quedan con la portada de banco: no se rellenaron.`);
  if (failed.length > 0) {
    console.log(`   ⚠️  ${failed.length} escritura(s) fallaron:`);
    for (const f of failed) console.log(`      ${f.id}: ${f.detail}`);
  }
}

const invokedDirectly = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("fetch-cover-art.ts");

if (invokedDirectly) {
  main().catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
}
