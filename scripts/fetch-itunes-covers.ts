#!/usr/bin/env tsx
/**
 * Portadas REALES de los 9 releases del seed, vía iTunes `entity=album` (P1,
 * RC.31).
 *
 * Las que hay ahora son fotos genéricas de Unsplash: Björk con un concierto de
 * rock, Radiohead con una guitarra. El propio `scripts/check-image-urls.ts:20-21`
 * las etiqueta como *"Candidatos de tema musical. NO se dan por buenos"*, así que
 * nunca se miraron. Este script no es iTunes dentro del seed (haría el seed
 * dependiente de red e ilegible de forma reproducible), sino un paso aparte con
 * dry-run, Exactly como manda el plan.
 *
 * POR QUÉ NO SE CONFÍA EN EL PRIMER RESULTADO
 *
 * Este repo ya cometió ese error dos veces, y de las dos veces la base de datos
 * quedó con la imagen equivocada como si fuera la buena:
 *  - Con retratos de artista, iTunes + Unsplash-por-nombre dieron el sujeto
 *    equivocado (`AI_LOG.md`, "Imagenes artistas corregidas": "Unsplash por
 *    nombre da basura: caballos, calles").
 *  - La primera siembra metió `https://example.com/covers/*.jpg`, que es el
 *    dominio reservado por la RFC y nunca resuelve.
 * Por eso, para CADA candidato se exige que el artista y el título coincidan con
 * el release real y que el año sea plausible, y en el caso de *The Dark Side of
 * the Moon* hay DOS candidatos con título y año idénticos (el original y el
 * remaster del 50 aniversario): se imprime la lista, no solo el ganador.
 *
 * LO QUE NO SE PONE
 *
 * Si iTunes no devuelve algo razonable para un release, se marca `NO RESUELTO` y
 * se deja como está, para decisión de una persona. Con los datos de este repo
 * pasan tres, y los tres por la misma razón: **el single no está en el catálogo
 * de iTunes**, solo el álbum del que sale la pista.
 *  - *Ashes to Ashes* (Bowie, 1980): iTunes devuelve la canción dentro de
 *    *Scary Monsters*, y las colecciones que se llaman "Ashes to Ashes" son de
 *    Joe Sample, Jaurim, Warpaint y Magdalena Bay.
 *  - *Tour de France* (Kraftwerk, 1983): el único "Tour de France" de Kraftwerk
 *    es el álbum de 2003, 20 años posterior. Su portada NO es la del single.
 *  - *The Model / Computer Love* (Kraftwerk, 1981): no existe lacollection
 *    combined; iTunes devuelve *The Man-Machine* y *Computer World*.
 * Poner la portada de *Scary Monsters* o del álbum de 2003 como si fuera la del
 * single de 1980/1983 sería exactamente el fallo que este script existe para
 * evitar.
 *
 * REVISIÓN VISUAL, NO OPCIONAL
 *
 * Even en `--apply` este script descarga las imágenes a disco y escribe un
 * `index.html` con el título de su release al lado. La ruta sale por consola.
 * Aplicar arte sin mirarlo repite el error de Unsplash; el propio script dice
 * que las descarga, pero el que las mira es quien decide.
 *
 * ESCRITURA
 *
 * `cover_image` está en el padre Y en cada hija (el seed copia el mismo valor a
 * todas). Escribir solo el padre dejaría la portada nueva en la tarjeta del
 * release y la vieja en las 65 pistas.
 *
 * Uso:
 *   npx tsx scripts/fetch-itunes-covers.ts            # dry-run + descarga para revisar
 *   npx tsx scripts/fetch-itunes-covers.ts --apply    # escribe cover_image
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";

import { getDbWrite, isTursoEnabled, tursoExec, tursoExecUpdate } from "../lib/db";
import { getHighResArtwork, searchITunes } from "../lib/itunes";
import { SEED_ARTISTS, SEED_RELEASES } from "./seed-influential-catalog";

/** Convención del repo para evidencia visual local: nunca se versiona. */
const REVIEW_DIR = path.resolve(
  process.cwd(),
  "tests/screenshots/itunes-covers"
);

const SEED_ARTIST_NAMES = SEED_ARTISTS.map((a) => a.name);

/**
 * Cuántos años puede desviarse el candidato y seguir siendo el MISMO release.
 *
 * 0 = el año coincide. 1 =asterisco y aviso: se acepta porque hay un caso
 * conocido (*Vulnicura Strings*, álbum de 2015 con `release_date` 2016-11-04 en
 * el seed), pero se reporta. >1 = otro release, aunque el título y el artista
 * coincidan: la portada sería de otra edición, así que se descarta.
 */
const MAX_YEAR_DRIFT = 1;

/** Normaliza para comparar: sin mayúsculas, sin diacríticos, sin puntuación. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function yearOf(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

type TitleMatch = "exacto" | "parcial" | "distinto";

function matchTitle(candidate: string, wanted: string): TitleMatch {
  const a = normalize(candidate);
  const b = normalize(wanted);
  if (!a || !b) return "distinto";
  if (a === b) return "exacto";
  if (a.includes(b) || b.includes(a)) return "parcial";
  return "distinto";
}

function matchArtist(candidate: string, wanted: string): boolean {
  const a = normalize(candidate);
  const b = normalize(wanted);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

interface Candidate {
  /** Nombre de la colección en iTunes. */
  collectionName: string;
  artistName: string;
  releaseDate: string | undefined;
  artwork600: string;
  /** De qué pasada salió: `album` no siempre encuentra lo que `song` sí. */
  via: "album" | "song";
  title: TitleMatch;
  yearDelta: number | null;
  yearOk: boolean;
  /** El `releaseDate` del seed es `YYYY-MM-DD`, no solo el año. */
  exactDate: boolean;
}

interface Resolved {
  sr: (typeof SEED_RELEASES)[number];
  candidates: Candidate[];
  chosen: Candidate | null;
  /** Por qué no se eligió, para la salida y el informe. */
  reason: string;
}

const slugify = (value: string) =>
  normalize(value).replace(/\s+/g, "-");

/** Un resultado de `searchITunes`, sea `album` o `song`. */
function toCandidate(
  raw: { collectionName?: string; artistName: string; releaseDate?: string; artworkUrl600?: string; artworkUrl100?: string },
  sr: (typeof SEED_RELEASES)[number],
  via: "album" | "song"
): Candidate | null {
  // Con `entity=song` el nombre del release viene en `collectionName`; con
  // `entity=album` también. Nunca se usa `trackName`: en la pasada `album`
  // viene vacío y `safeString` lo devuelve como "—".
  const collectionName = (raw.collectionName ?? "").trim();
  if (!collectionName) return null;

  const artwork =
    getHighResArtwork(raw.artworkUrl600 ?? raw.artworkUrl100, 600) ??
    getHighResArtwork(raw.artworkUrl100, 600);
  if (!artwork) return null;

  if (!matchArtist(raw.artistName, sr.artistName)) return null;

  const wantedYear = yearOf(sr.releaseDate);
  const gotYear = yearOf(raw.releaseDate);
  const yearDelta =
    wantedYear != null && gotYear != null ? gotYear - wantedYear : null;

  return {
    collectionName,
    artistName: raw.artistName,
    releaseDate: raw.releaseDate,
    artwork600: artwork,
    via,
    title: matchTitle(collectionName, sr.title),
    yearDelta,
    // Sin año no se puede verificar, así que no se acepta: el mismo
    // razonamiento que rechaza un título de otro artista.
    yearOk: yearDelta != null && Math.abs(yearDelta) <= MAX_YEAR_DRIFT,
    exactDate:
      !!raw.releaseDate &&
      !!sr.releaseDate &&
      raw.releaseDate.slice(0, 10) === sr.releaseDate.slice(0, 10),
  };
}

function rank(c: Candidate): number {
  let score = 0;
  if (c.title === "exacto") score += 100;
  else if (c.title === "parcial") score += 40;
  // El día exacto pesa más que el año. Sin esto, *Heroes* se resolvía a
  // `"Heroes" (2017 Remaster)`: es una colección de 10 pistas fechada el
  // 1977-10-14, mientras que el seed es el single del 1977-09-23, que en
  // iTunes es `Heroes / Helden / Héros - EP`. Mismo año, así que el desempate
  // acababa en la longitud del nombre, y ganaba la compilación.
  if (c.exactDate) score += 60;
  if (c.yearDelta === 0) score += 30;
  else score += 10;
  // Ante dos candidatos con el mismo título y año (el original y su remaster
  // del 50 aniversario), gana el más simple: el nombre con menos adornos es el
  // de la edición original, que es la que se sembró.
  score -= Math.min(c.collectionName.length, 60) / 10;
  return score;
}

async function gatherCandidates(
  sr: (typeof SEED_RELEASES)[number]
): Promise<{ accepted: Candidate[]; rejected: string[] }> {
  const accepted: Candidate[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  // Dos pasadas, y este orden importa: `album` es el correcto para un álbum
  // (devuelve la colección tal cual), y `song` es el que rescue a
  // *The Dark Side of the Moon*, que el índice de álbumes de iTunes no devuelve
  // para "Pink Floyd The Dark Side of the Moon" pero sí aparece como colección
  // de sus canciones. `song` también mete ruido (devuelve la colección que
  // contiene la canción, que puede ser un disco entero), y por eso la
  // verificación de título y año lo descarta.
  for (const via of ["album", "song"] as const) {
    const results = await searchITunes(
      `${sr.artistName} ${sr.title}`,
      10,
      via
    );
    for (const raw of results) {
      const candidate = toCandidate(raw, sr, via);
      if (!candidate) {
        rejected.push(
          `${via}: "${raw.collectionName ?? raw.trackName}" de ${raw.artistName} (artista o título no coinciden)`
        );
        continue;
      }
      if (candidate.title === "distinto") {
        rejected.push(
          `${via}: "${candidate.collectionName}" de ${candidate.artistName} (el título no contiene "${sr.title}")`
        );
        continue;
      }
      if (!candidate.yearOk) {
        rejected.push(
          `${via}: "${candidate.collectionName}" de ${candidate.artistName} (año ${yearOf(candidate.releaseDate)} vs ${yearOf(sr.releaseDate)}: otro release, no una reedición)`
        );
        continue;
      }
      const key = `${normalize(candidate.collectionName)}|${candidate.artwork600}`;
      if (seen.has(key)) continue;
      seen.add(key);
      accepted.push(candidate);
    }
  }

  accepted.sort((a, b) => rank(b) - rank(a));
  return { accepted, rejected };
}

async function readRows(sql: string, args: unknown[] = []) {
  if (isTursoEnabled()) return (await tursoExec(sql, args)) as Record<string, unknown>[];
  return getDbWrite()
    .prepare(sql)
    .all(...(args as never[])) as unknown as Record<string, unknown>[];
}

interface ParentRow {
  id: string;
  title: string;
  artist_name: string;
}

async function writeCover(releaseId: string, cover: string): Promise<number> {
  const sql = `UPDATE tracks SET cover_image = ? WHERE id = ? OR release_id = ?`;
  if (isTursoEnabled()) return tursoExecUpdate(sql, [cover, releaseId, releaseId]);
  const result = getDbWrite()
    .prepare(sql)
    .run(cover, releaseId, releaseId);
  return Number(result.changes ?? 0);
}

async function download(candidate: Candidate, file: string): Promise<boolean> {
  try {
    const res = await fetch(candidate.artwork600);
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return false;
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * "coincide" / "+1 año(s)" / "?" para un `yearDelta` que puede ser `null`.
 * Un candidato sin año no llega nunca a `chosen` (`yearOk` lo rechaza), pero
 * el tipo no lo sabe y aquí no se quiere un `+NaN` en la salida.
 */
function yearDeltaLabel(c: Candidate): string {
  if (c.yearDelta == null) return "?";
  if (c.yearDelta === 0) return c.exactDate ? "coincide (misma fecha)" : "coincide";
  return `${c.yearDelta > 0 ? "+" : ""}${c.yearDelta} año(s)`;
}

function reviewHtml(results: Resolved[]): string {
  const resolved = results.filter((r) => r.chosen);
  const unresolved = results.filter((r) => !r.chosen);
  const card = (r: Resolved) => {
    const c = r.chosen!;
    const file = path.basename(`${slugify(r.sr.artistName)}--${slugify(r.sr.title)}.jpg`);
    const year = yearOf(c.releaseDate);
    return `<figure>
  <img src="${escapeHtml(file)}" alt="Portada de ${escapeHtml(r.sr.title)}" width="260" height="260">
  <figcaption>
    <strong>${escapeHtml(r.sr.title)}</strong><br>
    ${escapeHtml(r.sr.artistName)} &middot; seed ${yearOf(r.sr.releaseDate)} &rarr; iTunes ${year}
    &middot; <em>${c.title === "exacto" ? "título exacto" : "título parcial"}</em>
    &middot; <em>año ${escapeHtml(yearDeltaLabel(c))}</em>
    &middot; <em>via ${c.via}</em><br>
    <small>${escapeHtml(c.collectionName)} &mdash; ${escapeHtml(c.artistName)}</small><br>
    <small><a href="${escapeHtml(c.artwork600)}">${escapeHtml(c.artwork600)}</a></small>
  </figcaption>
</figure>`;
  };
  const pending = (r: Resolved) => `<figure class="pending">
  <div class="placeholder">SIN PORTADA</div>
  <figcaption>
    <strong>${escapeHtml(r.sr.title)}</strong><br>
    ${escapeHtml(r.sr.artistName)} &middot; seed ${yearOf(r.sr.releaseDate)}<br>
    <small><b>NO RESUELTO:</b> ${escapeHtml(r.reason)}</small>
  </figcaption>
</figure>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Revisión visual de portadas iTunes — PressPlay</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; background: #0f0f19; color: #e8e8f0; padding: 32px; }
  h1 { font-size: 20px; }
  h2 { font-size: 16px; margin-top: 36px; color: #a5b4fc; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 28px; }
  figure { margin: 0; background: #1a1a2b; border-radius: 12px; padding: 16px; }
  img { border-radius: 8px; display: block; background: #000; }
  figcaption { margin-top: 12px; font-size: 13px; }
  small { color: #9aa0c0; word-break: break-all; }
  .placeholder { width: 260px; height: 260px; display: grid; place-items: center;
                background: repeating-linear-gradient(45deg, #2a2a3d, #2a2a3d 12px, #22223a 12px, #22223a 24px);
                border-radius: 8px; color: #f87171; font-weight: 700; }
</style></head>
<body>
<h1>Revisión visual de portadas iTunes &mdash; catálogo semilla de PressPlay</h1>
<p><b>${resolved.length}</b> resueltas de 9 &middot; <b>${unresolved.length}</b> sin resolver.
Esta página es la revisión: si una de estas no es la portada de ese disco, no se aplica.</p>
<h2>Resueltas (${resolved.length})</h2>
<div class="grid">
${resolved.map(card).join("\n")}
</div>
<h2>Sin resolver (${unresolved.length}) &mdash; NO se aplicó nada, queda a decisión</h2>
<div class="grid">
${unresolved.map(pending).join("\n")}
</div>
</body></html>
`;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");

  console.log(
    `\n${apply ? "🖼️  APLICANDO" : "🔍 DRY-RUN"} — portadas iTunes del catálogo semilla (P1)\n`
  );
  console.log(`Motor: ${isTursoEnabled() ? "Turso" : "SQLite local"}`);

  // Los 9 padres ya sembrados, para saber a qué release_id pertenece cada
  // portada y poder escribir también las hijas.
  const placeholders = SEED_ARTIST_NAMES.map(() => "?").join(", ");
  const parents = (await readRows(
    `SELECT id, title, artist_name FROM tracks
      WHERE release_id IS NULL AND artist_name IN (${placeholders})
      ORDER BY artist_name, created_at, id`,
    SEED_ARTIST_NAMES
  )) as unknown as ParentRow[];

  console.log(`Padres de releases del seed en la base de datos: ${parents.length}\n`);

  const results: Resolved[] = [];

  for (const sr of SEED_RELEASES) {
    const { accepted, rejected } = await gatherCandidates(sr);
    const parent = parents.find(
      (p) => p.artist_name === sr.artistName && p.title === sr.title
    );

    const chosen = accepted[0] ?? null;
    const reason = chosen
      ? ""
      : accepted.length === 0
        ? "ningún candidato de iTunes pasó la verificación de artista + título + año"
        : "";

    results.push({ sr, candidates: accepted, chosen, reason });

    console.log(
      `${"-".repeat(96)}\n${sr.artistName} — ${sr.title}   [seed ${sr.releaseDate}, ${
        parent ? parent.id : "PADRE NO ENCONTRADO"
      }]`
    );
    console.log(
      `  ${chosen ? `PROPUESTA: "${chosen.collectionName}" (${chosen.artistName}, ${String(
        chosen.releaseDate
      ).slice(0, 10)}, via ${chosen.via})` : "NO RESUELTO — se deja la portada actual"}`
    );
    if (chosen) {
      const year = yearDeltaLabel(chosen);
      console.log(
        `  año: ${yearOf(sr.releaseDate)} vs ${yearOf(chosen.releaseDate)} → ${year}${
          chosen.title === "parcial" ? ", además título parcial" : ""
        }`
      );
      console.log(`  url: ${chosen.artwork600}`);
    }
    if (accepted.length > 1) {
      console.log(`  otros candidatos que también pasaron la verificación:`);
      for (const c of accepted.slice(1)) {
        console.log(
          `    - "${c.collectionName}" (${c.artistName}, ${String(c.releaseDate).slice(0, 10)}, via ${c.via})`
        );
      }
    }
    for (const r of rejected.slice(0, 4)) {
      console.log(`  descartado ${r}`);
    }
    if (rejected.length > 4) {
      console.log(`  ... y ${rejected.length - 4} descartado(s) más`);
    }
    console.log();
  }

  // ------------------------------------------------------------------
  // Descarga + índice de revisión visual. Ocurre también en `--apply`: es la
  // revisión la que habilita el --apply, y tenerla a mano al aplicar evita el
  // "lo escribí sin mirar".
  // ------------------------------------------------------------------
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  console.log("Descargando las portadas para revisión visual…");
  for (const r of results) {
    if (!r.chosen) continue;
    const file = path.join(
      REVIEW_DIR,
      `${slugify(r.sr.artistName)}--${slugify(r.sr.title)}.jpg`
    );
    const ok = await download(r.chosen, file);
    console.log(`  ${ok ? "OK  " : "FALLA"} ${path.relative(process.cwd(), file)}`);
    if (!ok) {
      // La URL se lee ANTES de limpiar `chosen`, o no queda de dónde decir
      // qué imagen no se pudo bajar.
      r.reason = `no se pudo descargar ${r.chosen.artwork600}`;
      r.chosen = null;
    }
  }
  const indexFile = path.join(REVIEW_DIR, "index.html");
  fs.writeFileSync(indexFile, reviewHtml(results), "utf8");
  console.log(`\nÍndice de revisión visual: ${path.relative(process.cwd(), indexFile)}`);
  console.log(
    "Ábrelo y comprueba una por una que la imagen es la de ese disco. Sin eso, el --apply repite el fallo de Unsplash."
  );

  const ok = results.filter((r) => r.chosen);
  const pending = results.filter((r) => !r.chosen);
  console.log(`\n${"=".repeat(96)}`);
  console.log(`Resueltas: ${ok.length}/9 · Sin resolver: ${pending.length}/9`);
  for (const r of pending) {
    console.log(`  NO RESUELTO — ${r.sr.artistName} — ${r.sr.title}`);
    for (const c of r.candidates) {
      console.log(`      (candidato aceptado pero descartado: "${c.collectionName}")`);
    }
    if (r.reason) console.log(`      ${r.reason}`);
  }
  console.log("=".repeat(96));

  if (!apply) {
    console.log("\n🔍 DRY-RUN. No se escribió nada. Añade --apply para escribir las portadas.");
    return;
  }

  let written = 0;
  for (const r of ok) {
    const parent = parents.find(
      (p) => p.artist_name === r.sr.artistName && p.title === r.sr.title
    );
    if (!parent) {
      console.log(`  ⏭️  ${r.sr.title}: no hay padre en la base de datos, no se escribe.`);
      continue;
    }
    const changes = await writeCover(parent.id, r.chosen!.artwork600);
    written += changes;
    console.log(
      `  ↻ ${r.sr.artistName} — ${r.sr.title}: ${changes} fila(s) (padre + hijas)`
    );
  }
  console.log(
    `\n✅ ${written} filas actualizadas en ${isTursoEnabled() ? "Turso" : "SQLite local"}.`
  );
  console.log(`   ${pending.length} release(s) se quedan con su portada actual.`);
}

const invokedDirectly = (process.argv[1] ?? "")
  .replace(/\\/g, "/")
  .endsWith("fetch-itunes-covers.ts");

if (invokedDirectly) {
  main().catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
}
