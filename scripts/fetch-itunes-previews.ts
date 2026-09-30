#!/usr/bin/env tsx
/**
 * Previews de audio de iTunes para el catálogo (P3, RC.31).
 *
 * POR QUÉ ESTE SCRIPT
 *
 * El 100% del catálogo estaba sin audio: 77 de 83 pistas con
 * `audio_preview_url = ""`. Y la causa **no es CORS** — el agente D1 lo midió
 * con `curl -I` mandando `Origin: https://epk-dashboard.vercel.app`:
 *
 *   audio-ssl.itunes.apple.com -> 200 OK
 *     Access-Control-Allow-Origin: *
 *     Access-Control-Allow-Headers: range
 *     Accept-Ranges: bytes
 *
 * El CDN sí manda ACAO. El arreglo anotado en `AI_LOG.md:1268` ("removido
 * crossOrigin para evitar CORS con CDN Apple") resolvía un problema que no
 * existía.
 *
 * Lo que sí falla son las **URLs**: las 6 escritas a mano en
 * `scripts/seed-f9-catalog.ts` caducaron y hoy dan 404 (comprobado con `curl
 * -I`). El "Error al iniciar reproducción — archivo no disponible" de la
 * pantalla es una URL muerta.
 *
 * LO QUE NO SE HACE AQUÍ
 *
 *  - **No se escribe un cliente HTTP de iTunes.** Se reutiliza
 *    `searchITunes(term, limit, "song")` de `lib/itunes.ts`, que ya normaliza
 *    la respuesta y expone `previewUrl` e `itunes_track_id`.
 *  - **No se confía en el primer resultado.** Este repo ya se equivocó dos
 *    veces con iTunes (retratos de artistas, `AI_LOG.md:5448-5449`). Con audio
 *    equivocarse es peor: suena a otra canción y nadie lo nota. Artista y
 *    título tienen que coincidir **exactamente**, y cuando la portada del
 *    release salió de iTunes además tiene que salir de esa colección. Lo que no
 *    se puede confirmar queda `NO RESUELTO` y **no se rellena**.
 *  - **No se da por bueno un 200 de papel.** Antes de ofrecer una URL se hace
 *    una petición HTTP de verdad y se imprime el código y el `content-type`.
 *    Una URL que no dé 200 no se escribe.
 *
 * TAMBIÉN SE RELLENA `itunes_track_id`
 *
 * Las 83 filas lo tenían a `null`. `lib/itunes.ts` devuelve el `trackId` del
 * resultado elegido, así que se escribe **del mismo resultado** que dio la URL:
 * si uno se aceptara y el otro no, la pareja dejaría de describir la misma
 * pista. `lib/downloadable-assets.ts:299` ya lo lee para construir el enlace de
 * Apple Music, así que hasta ahora ese enlace salía vacío para todo el
 * catálogo.
 *
 * Las filas que YA tenían una URL viva se verifican y **no se tocan**: es más
 * rápido que re-buscar pistas que ya funcionan y evita cambiar URLs buenas por
 * otras equivalentes sin motivo.
 *
 * USO
 *
 *   npx tsx scripts/fetch-itunes-previews.ts              # dry-run
 *   npx tsx scripts/fetch-itunes-previews.ts --apply      # escribe
 *   npx tsx scripts/fetch-itunes-previews.ts --artist="Pink Floyd"
 *   npx tsx scripts/fetch-itunes-previews.ts --limit=10
 *
 * `--delay=ms` existe solo para depurar; el valor por defecto respeta el límite
 * de la Search API de iTunes (~20 llamadas/min).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { getDbWrite, isTursoEnabled, tursoExec, tursoExecUpdate } from "../lib/db";
import { searchITunes } from "../lib/itunes";
import {
  hasITunesArtwork,
  resolveAudioPreview,
  selectPendingUpdates,
  verifyPreviewUrl,
  type AudioCandidate,
  type PreviewResolution,
  type WantedTrack,
} from "../lib/seed-audio";

/** ~19 llamadas/min contra la Search API de iTunes. */
const SEARCH_DELAY_MS = 3_200;
const SEARCH_LIMIT = 25;
/** Espera extra antes de declarar que iTunes no tiene nada. */
const EMPTY_RETRY_MS = 12_000;

interface TrackRow {
  id: string;
  title: string;
  artist_name: string;
  release_id: string | null;
  release_date: string | null;
  audio_preview_url: string | null;
  itunes_track_id: string | null;
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
    itunes_track_id: raw.itunes_track_id == null ? null : String(raw.itunes_track_id),
    cover_image: raw.cover_image == null ? null : String(raw.cover_image),
  };
}

async function readRows(sql: string, args: unknown[] = []): Promise<Record<string, unknown>[]> {
  if (isTursoEnabled()) {
    return (await tursoExec(sql, args)) as Record<string, unknown>[];
  }
  return getDbWrite()
    .prepare(sql)
    .all(...(args as never[])) as unknown as Record<string, unknown>[];
}

async function writePreview(trackId: string, url: string, itunesTrackId: string): Promise<number> {
  const sql = "UPDATE tracks SET audio_preview_url = ?, itunes_track_id = ? WHERE id = ?";
  if (isTursoEnabled()) return tursoExecUpdate(sql, [url, itunesTrackId, trackId]);
  const result = getDbWrite().prepare(sql).run(url, itunesTrackId, trackId);
  return Number(result.changes ?? 0);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function argValue(flag: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}

function shortUrl(url: string): string {
  const file = url.split("/").pop() ?? url;
  return file.length > 44 ? `…${file.slice(-40)}` : file;
}

async function main() {
  const apply = process.argv.slice(2).includes("--apply");
  const onlyArtist = argValue("--artist");
  const limitArg = argValue("--limit");
  const limit = limitArg ? Number(limitArg) : Number.POSITIVE_INFINITY;
  const delay = Number(argValue("--delay") ?? SEARCH_DELAY_MS);

  const engine = isTursoEnabled() ? "Turso" : "SQLite local";
  console.log(`\n${apply ? "🔊 APLICANDO" : "🔍 DRY-RUN"} — previews de audio iTunes (P3)`);
  console.log(`Motor: ${engine}`);
  console.log(
    "Cada URL se verifica con una petición HTTP real antes de ofrecerse. Nada se escribe sin --apply.\n"
  );

  const rows = (
    await readRows(
      `SELECT t.id, t.title, t.artist_name, t.release_id, t.release_date,
              t.audio_preview_url, t.itunes_track_id, t.cover_image
         FROM tracks t
        ORDER BY t.artist_name, t.release_id IS NULL DESC, t.created_at, t.id`
    )
  ).map(parseRow);

  const byId = new Map(rows.map((r) => [r.id, r]));
  console.log(`Pistas en la base de datos: ${rows.length}\n`);

  /**
   * El ancla de colección: el título del release, pero SOLO si la portada de
   * ese release se resolvió por iTunes (`mzstatic.com`). Sin ancla no se exige
   * colección, y se dice en la salida en vez de fingir que se comprobó.
   */
  const anchorFor = (row: TrackRow): { title: string | null; release: TrackRow | null } => {
    const parent = row.release_id ? byId.get(row.release_id) ?? null : row;
    if (!parent) return { title: null, release: null };
    return hasITunesArtwork(parent.cover_image) ? { title: parent.title, release: parent } : { title: null, release: parent };
  };

  const selected = rows
    .filter((r) => (onlyArtist ? r.artist_name === onlyArtist : true))
    .slice(0, Number.isFinite(limit) ? limit : rows.length);

  const resolutions: PreviewResolution[] = [];
  const keptAlive: { row: TrackRow; httpStatus: number; contentType: string }[] = [];
  let searchCalls = 0;

  for (const [index, row] of selected.entries()) {
    const anchor = anchorFor(row);
    const wanted: WantedTrack = {
      id: row.id,
      title: row.title,
      artistName: row.artist_name,
      releaseDate: row.release_date,
      expectedCollection: anchor.title,
      currentPreviewUrl: row.audio_preview_url,
      currentITunesTrackId: row.itunes_track_id,
    };

    console.log(`${"-".repeat(96)}`);
    console.log(`[${index + 1}/${selected.length}] ${row.artist_name} — ${row.title}   (${row.id})`);
    console.log(
      `  release: ${row.release_id ? `${row.release_id}` : "(padre)"}` +
        (anchor.release && anchor.release.id !== row.id ? ` · "${anchor.release.title}"` : "")
    );
    console.log(
      `  ancla de colección: ${
        anchor.title
          ? `"${anchor.title}" (portada de iTunes en ${anchor.release?.id})`
          : `ninguna — la portada no viene de iTunes${
              anchor.release ? ` (${anchor.release.cover_image?.slice(0, 60) ?? "sin portada"})` : ""
            }`
      }`
    );
    console.log(
      `  actual: audio_preview_url=${
        row.audio_preview_url ? shortUrl(row.audio_preview_url) : '"" (vacío)'
      }  itunes_track_id=${row.itunes_track_id ?? "null"}`
    );

    // Una fila que YA tiene preview se verifica primero: si sigue viva no se
    // toca. Es más rápido que re-buscar 6 pistas que ya funcionan, y evita
    // cambiar URLs buenas por otras equivalentes sin motivo.
    const existing = (row.audio_preview_url ?? "").trim();
    if (existing) {
      const probe = await verifyPreviewUrl(existing);
      if (probe.ok) {
        console.log(`  ✓ la URL actual sigue viva — se conserva sin re-buscar`);
        console.log(
          `      HTTP ${probe.httpStatus}  content-type: ${probe.contentType}  ACAO: ${probe.accessControlAllowOrigin}`
        );
        keptAlive.push({ row, httpStatus: probe.httpStatus, contentType: probe.contentType });
        console.log();
        continue;
      }
      console.log(`  ✗ la URL actual está MUERTA (${probe.detail}) — se busca una fresca`);
    }

    /**
     * Términos de búsqueda, de más ancho a más estrecho. No es "más intentos
     * hasta que salga algo": cada intento pasa EXACTAMENTE el mismo filtro
     * (artista + título exactos, colección si hay ancla, y la prueba HTTP). Lo
     * único que cambia es la relevancia que devuelve iTunes.
     *
     * Hace falta porque con `limit = 10` el resultado exacto se queda fuera en
     * casos reales: "Pink Floyd Speak to Me" devuelve a Roger Waters, David
     * Gilmour y varias tribute bands, y el de Pink Floyd no aparece; "David
     * Bowie Heroes" devuelve el remaster de 2017, la "Single Version" y la
     * versión en vivo de 1978, y la de 1977 tampoco. Poner el título del álbum
     * delante lo hace subir en la lista sin relajar nada.
     */
    const terms = [
      `${row.artist_name} ${row.title}`.trim(),
      anchor.title
        ? `${anchor.title} ${row.title}`.trim()
        : `${row.title} ${row.artist_name}`.trim(),
    ];

    // Se inicializa con una resolución vacía para que el tipo no sea nullable;
    // `terms` siempre tiene al menos un elemento, así que el bucle sobrescribe.
    let resolution = await resolveAudioPreview(wanted, [], verifyPreviewUrl);
    let candidates: AudioCandidate[] = [];
    for (const [attempt, term] of terms.entries()) {
      if (attempt > 0) await sleep(delay);
      candidates = (await searchITunes(term, SEARCH_LIMIT, "song")) as AudioCandidate[];
      searchCalls += 1;
      console.log(`  iTunes "${term}" → ${candidates.length} resultado(s)`);

      resolution = await resolveAudioPreview(wanted, candidates, verifyPreviewUrl);
      if (resolution.chosen) break;

      if (attempt < terms.length - 1) {
        if (candidates.length === 0) {
          // `searchITunes` se traga los errores de red y devuelve `[]`, así que
          // un array vacío no distingue "no existe" de "nos limitaron la cuota".
          // Una espera antes del siguiente intento separa los dos casos.
          await sleep(EMPTY_RETRY_MS);
        }
        console.log(`    sin coincidencia exacta; se reintenta con "${terms[attempt + 1]}"`);
      }
    }
    resolutions.push(resolution);

    for (const r of resolution.rejected.slice(0, 4)) {
      console.log(`    descartado ${r.label} — ${r.detail}`);
    }
    if (resolution.rejected.length > 4) {
      console.log(`    … y ${resolution.rejected.length - 4} descartado(s) más`);
    }
    for (const r of resolution.httpRejected) {
      console.log(`    DESCARTADO POR HTTP ${r.label} — ${r.detail} (${r.reason})`);
    }

    if (resolution.chosen && resolution.verified) {
      const v = resolution.verified;
      console.log(
        `  ✓ ${resolution.chosen.trackName} — ${resolution.chosen.artistName}` +
          (resolution.chosen.collectionName ? ` [${resolution.chosen.collectionName}]` : "")
      );
      console.log(`      iTunes trackId: ${resolution.chosen.trackId}`);
      console.log(`      url:  ${v.url}`);
      console.log(
        `      HTTP ${v.httpStatus}   content-type: ${v.contentType}   ACAO: ${v.accessControlAllowOrigin}` +
          `   (${v.usedRangeGet ? "GET con Range" : "HEAD"})`
      );
      if (resolution.chosen.releaseDate) {
        console.log(`      fecha en iTunes: ${String(resolution.chosen.releaseDate).slice(0, 10)}`);
      }
    } else {
      console.log(`  ✗ NO RESUELTO — ${resolution.reason}`);
    }
    console.log();

    if (index < selected.length - 1) await sleep(delay);
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  const resolved = resolutions.filter((r) => r.chosen);
  const unresolved = resolutions.filter((r) => !r.chosen);
  const updates = selectPendingUpdates(resolutions);

  console.log(`${"=".repeat(96)}`);
  console.log(`Vivas tal cual (no se tocan): ${keptAlive.length}`);
  for (const k of keptAlive) {
    console.log(`  ✓ ${k.row.artist_name} — ${k.row.title}  (HTTP ${k.httpStatus}, ${k.contentType})`);
  }
  console.log(`Resueltas de ${selected.length - keptAlive.length} buscadas: ${resolved.length}`);
  console.log(`NO RESUELTAS: ${unresolved.length}`);
  for (const r of unresolved) {
    console.log(`  ✗ ${r.wanted.artistName} — ${r.wanted.title}  (${r.wanted.id})`);
    console.log(`      ${r.reason}`);
  }

  // ── Validación de los releases con portada de iTunes ──────────────────────
  //
  // Si la portada de un release salió de iTunes, el preview de sus pistas
  // debería salir de esa MISMA colección. Esto es lo que separa "metí una URL
  // que responde" de "metí la pista correcta".
  const releaseParents = rows.filter((r) => !r.release_id && r.artist_name);
  const anchored = releaseParents.filter((r) => hasITunesArtwork(r.cover_image));
  console.log(`\n${"=".repeat(96)}`);
  console.log(`Validación de releases con portada de iTunes: ${anchored.length}`);
  for (const parent of anchored) {
    const children = rows.filter((r) => r.release_id === parent.id);
    const childIds = new Set(children.map((c) => c.id));
    const res = resolutions.filter(
      (r) => r.wanted.expectedCollection === parent.title && (childIds.has(r.wanted.id) || r.wanted.id === parent.id)
    );
    const ok = res.filter((r) => r.chosen);
    const bad = res.filter((r) => !r.chosen);
    console.log(`  ${parent.artist_name} — ${parent.title}   (${parent.id})`);
    console.log(
      `    portada: iTunes ✓   pistas: ${children.length}   con preview verificado: ${ok.length}   sin resolver: ${bad.length}`
    );
    for (const b of bad) {
      console.log(`      ✗ ${b.wanted.title} — ${b.reason}`);
    }
  }
  const unanchored = releaseParents.filter((r) => !hasITunesArtwork(r.cover_image));
  if (unanchored.length > 0) {
    console.log(`\n  Releases SIN portada de iTunes (sin ancla de colección, P1 pendiente): ${unanchored.length}`);
    for (const p of unanchored) {
      console.log(`    · ${p.artist_name} — ${p.title}  (${p.id})`);
    }
  }

  console.log(`\nLlamadas a la Search API: ${searchCalls}`);
  console.log(`${"=".repeat(96)}`);

  if (!apply) {
    console.log("\n🔍 DRY-RUN. No se escribió nada. Añade --apply para escribir los previews verificados.");
    console.log(`   A escribir con --apply: ${updates.length} fila(s).`);
    return;
  }

  let written = 0;
  const failed: { id: string; detail: string }[] = [];
  for (const update of updates) {
    try {
      const changes = await writePreview(update.id, update.audio_preview_url, update.itunes_track_id);
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

const invokedDirectly = (process.argv[1] ?? "")
  .replace(/\\/g, "/")
  .endsWith("fetch-itunes-previews.ts");

if (invokedDirectly) {
  main().catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
}
