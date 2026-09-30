/**
 * Genera `lib/pdf/fonts.generated.ts` con las Noto Serif en base64.
 *
 * Por que base64 y no ficheros en disco: el PDF leia las TTF con `fs`, y eso
 * obligaba a depender de que las fuentes estuvieran en el bundle de la funcion
 * de Vercel (`outputFileTracingIncludes`). En local funcionaba siempre y en
 * produccion daba 500, que es la peor combinacion posible: un fallo que no se
 * puede reproducir antes de desplegar. Con la fuente dentro del modulo no hay
 * disco, ni tracing, ni regla que mantener sincronizada con la ruta del
 * fichero.
 *
 * Uso:
 *   npx tsx scripts/build-pdf-font-embed.ts
 *
 * Si `lib/pdf/fonts/*.ttf` no esta, las descarga de la fuente oficial de Noto
 * (OFL-1.1). El resultado es determinista: la misma entrada da el mismo fichero.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const FONT_DIR = path.join(ROOT, "lib", "pdf", "fonts");
const OUT = path.join(ROOT, "lib", "pdf", "fonts.generated.ts");

/** Noto Serif hinted, el mismo juego que se usaba antes de incrustar. */
const SOURCES: Record<string, string> = {
  "NotoSerif-Regular.ttf":
    "https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSerif/NotoSerif-Regular.ttf",
  "NotoSerif-Bold.ttf":
    "https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSerif/NotoSerif-Bold.ttf",
};

function toBase64(file: string): string {
  return fs.readFileSync(file).toString("base64");
}

(async () => {
  const parts: string[] = [];
  for (const [name, url] of Object.entries(SOURCES)) {
    const local = path.join(FONT_DIR, name);
    let b64: string;
    if (fs.existsSync(local)) {
      b64 = toBase64(local);
    } else {
      process.stdout.write(`descargando ${name}... `);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`No se pudo descargar ${name}: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(FONT_DIR, { recursive: true });
      fs.writeFileSync(local, buf);
      b64 = buf.toString("base64");
      process.stdout.write(`${buf.length} bytes\n`);
    }
    // Magic de TrueType: si no es 0x00010000, el fichero esta corrupto y la
    // base64 seria basura silenciosa que solo falla al generar el PDF.
    const head = Buffer.from(b64, "base64").subarray(0, 4).toString("hex");
    if (head !== "00010000") throw new Error(`${name} no parece una TTF (magic ${head})`);
    parts.push(`  "${name}":\n    "${b64}",`);
    console.log(`${name}: ${Buffer.from(b64, "base64").length} bytes -> ${b64.length} en base64`);
  }

  const out = `/**
 * GENERADO AUTOMATICAMENTE por scripts/build-pdf-font-embed.ts. No editar a mano.
 *
 * Noto Serif (OFL-1.1), incrustada en base64 para que el generador de PDF no
 * dependa de leer ficheros en tiempo de ejecucion. Licencia y procedencia en
 * lib/pdf/fonts/ (OFL.txt y PROVENANCE.md).
 *
 * Son las fuentes COMPLETAS a proposito: PDFKit las subconjunta por documento
 * al incrustarlas, asi que el tamano aqui no se traslada al PDF que descarga
 * el usuario. Recortarlas aqui solo anadiria un paso de build que se puede
 * romper sin avisar.
 */

export const EMBEDDED_PDF_FONTS: Readonly<Record<string, string>> = {
${parts.join("\n")}
};
`;

  fs.writeFileSync(OUT, out, "utf8");
  console.log(`\nescrito ${path.relative(ROOT, OUT)} (${(out.length / 1024).toFixed(0)} KB)`);
})();
