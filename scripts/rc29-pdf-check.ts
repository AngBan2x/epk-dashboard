/**
 * Genera un PDF real de la exportacion `pdf` con datos de Turso y lo deja en
 * tests/screenshots/rc29/ para inspeccion visual.
 *
 * B5 no se da por bueno solo porque los bytes empiecen por %PDF-: un PDF con la
 * numeracion de pie rota o una ficha de pista partida entre dos paginas es un
 * PDF perfectamente valido. Por eso el texto se lee con el extractor de
 * tests/helpers/pdf-text.ts, que es el mismo que usan los tests.
 *
 * Uso:
 *   npx tsx scripts/rc29-pdf-check.ts                    # artista real, 3 secciones
 *   npx tsx scripts/rc29-pdf-check.ts --artist <id>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { buildExportBundle } from "../lib/export-bundle";
import { getAllArtists } from "../lib/db";
import { extractPdfPagesFlat } from "../tests/helpers/pdf-text";

const OUT = path.join(process.cwd(), "tests", "screenshots", "rc29");
const argOf = (flag: string, fallback: string) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const forced = argOf("--artist", "");
  const artists = await getAllArtists();
  const pick = forced || artists[0]?.id;
  if (!pick) throw new Error("no hay artistas");
  const name = artists.find((a) => a.id === pick)?.name ?? "x";
  console.log(`artistas en Turso: ${artists.length}`);
  console.log(`generando pdf de ${name} (${pick}) con las 3 secciones\n`);

  const started = Date.now();
  const bundle = await buildExportBundle({
    format: "pdf",
    artistId: pick,
    include: ["dossier", "rider", "catalog"],
  });
  const ms = Date.now() - started;
  if (!Buffer.isBuffer(bundle.body)) {
    console.error("FALLA: el body de un PDF deberia ser Buffer");
    process.exit(1);
  }
  const pdf = bundle.body;

  const file = path.join(OUT, `export-pdf-${name.replace(/[^\w]+/g, "-")}.pdf`);
  fs.writeFileSync(file, pdf);

  const asText = pdf.toString("latin1");
  const head = pdf.subarray(0, 8).toString("latin1");
  const tail = pdf.subarray(-6).toString("latin1");
  const pages = extractPdfPagesFlat(pdf);

  console.log(`filename:    ${bundle.filename}`);
  console.log(`contentType: ${bundle.contentType}`);
  console.log(`bytes:       ${pdf.length.toLocaleString("es-ES")}`);
  console.log(`tiempo:      ${ms} ms`);
  console.log(`cabecera:    ${JSON.stringify(head)}`);
  console.log(`cierre:      ${JSON.stringify(tail.replace(/\r?\n/g, "\\n"))}`);
  console.log(
    `fuentes:     ${(asText.match(/\/BaseFont\s*\/([A-Za-z0-9+\-]+)/g) ?? [])
      .map((f) => f.replace("/BaseFont /", ""))
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ")}`
  );
  console.log(`\npaginas: ${pages.length}`);
  pages.forEach((t, i) => {
    console.log(`  p${i + 1} (${t.length} car.): ${t.slice(0, 78)}`);
  });

  const problems: string[] = [];
  if (!head.startsWith("%PDF-")) problems.push("no empieza por %PDF-");
  if (!tail.trim().endsWith("%%EOF")) problems.push("no termina en %%EOF");
  if (pages.length === 0) problems.push("no se extrajo texto de ninguna pagina");

  // Ninguna pagina debe empezar por un metadato suelto: seria una ficha de
  // pista partida entre paginas.
  const orphan = /^(DAW|TONALIDAD|G[EÉ]NERO|BPM|STREAMS|SAVES|PLAYLISTS|ENLACES|LETRA|STEMS|GALER[IÍ]A)\b/;
  pages.forEach((t, i) => {
    if (orphan.test(t)) problems.push(`p${i + 1} empieza por un metadato huerfano: ${t.slice(0, 50)}`);
  });

  // Los pies deben decir "n / total" con la numeracion correcta.
  pages.forEach((t, i) => {
    const m = t.match(/(\d+)\s*\/\s*(\d+)\s*$/);
    if (!m) return;
    if (Number(m[1]) !== i + 1 || Number(m[2]) !== pages.length) {
      problems.push(`pie de p${i + 1} dice "${m[1]} / ${m[2]}" y deberia ser "${i + 1} / ${pages.length}"`);
    }
  });

  console.log(`\nescrito en: ${path.relative(process.cwd(), file)}`);
  if (problems.length) {
    console.log("\nPROBLEMAS:");
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log("\nOK: PDF valido, sin fichas partidas y con la numeracion correcta");
})();
