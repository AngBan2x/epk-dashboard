/**
 * Extractor de texto de PDF sin dependencias.
 *
 * Por que no vale un regex ingenuo: PDFKit escribe el texto como IDs de glifo
 * en hexadecimal dentro de arrays TJ (`[<0013> 20 <0014>] TJ`), porque las
 * fuentes van incrustadas como subset. Para volver a Unicode hay que leer el
 * CMap ToUnicode de cada fuente y mapear por nombre de recurso (/F2, /F3...).
 *
 * Sirve para comprobar en los tests lo que en una captura es ilegible:
 * numeros de pie de pagina, acentos, que una entrada no se parta entre paginas.
 *
 * Uso:
 *   npx tsx scripts/rc29-pdf-text.ts <fichero.pdf>            # todo el texto
 *   npx tsx scripts/rc29-pdf-text.ts <fichero.pdf> <regex>    # solo coincidencias
 *   npx tsx scripts/rc29-pdf-text.ts <fichero.pdf> --pages    # resumen por pagina
 */
import fs from "fs";
import zlib from "zlib";
import path from "path";

const file = path.resolve(process.argv[2] ?? "");
const filter = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : null;
const pagesOnly = process.argv.includes("--pages");

if (!process.argv[2]) {
  console.error("uso: rc29-pdf-text.ts <fichero.pdf> [regex] [--pages]");
  process.exit(1);
}

const buf = fs.readFileSync(file);
const as = buf.toString("latin1");

/** Objetos "N 0 obj ... endobj" del PDF. */
function objects(): Map<number, { body: string; stream: Buffer | null }> {
  const out = new Map<number, { body: string; stream: Buffer | null }>();
  const re = /(\d+)\s+0\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(as)) !== null) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const bodyEnd = as.indexOf("endobj", bodyStart);
    if (bodyEnd === -1) continue;
    const body = as.slice(bodyStart, bodyEnd);
    let stream: Buffer | null = null;
    const sIdx = body.indexOf("stream");
    if (sIdx !== -1) {
      let dataStart = bodyStart + sIdx + "stream".length;
      while (as[dataStart] === "\r" || as[dataStart] === "\n") dataStart += 1;
      // Se respeta /Length si aparece: "endstream" puede aparecer por azar
      // dentro de datos binarios y cutting ahi rompe el stream.
      const lenMatch = body.match(/\/Length\s+(\d+)/);
      const dataEnd = lenMatch
        ? dataStart + Number(lenMatch[1])
        : as.indexOf("endstream", dataStart);
      if (dataEnd !== -1 && dataEnd <= buf.length) {
        const raw = buf.subarray(dataStart, dataEnd);
        stream = body.includes("/FlateDecode") ? tryInflate(raw, `obj ${num}:`) : raw;
      }
    }
    out.set(num, { body, stream });
    re.lastIndex = bodyEnd;
  }
  return out;
}

function tryInflate(raw: Buffer, where = ""): Buffer | null {
  for (const fn of [zlib.inflateSync, zlib.inflateRawSync]) {
    try {
      return fn(raw);
    } catch (e) {
      lastInflateError = `${where} ${(e as Error).message}`;
    }
  }
  return null;
}
let lastInflateError = "";

const objs = objects();

/** Nombre de recurso (/F2) -> mapa glifo->Unicode, via el /ToUnicode de cada fuente. */
function fontMaps(): Map<string, Map<number, string>> {
  const toUni = new Map<number, Map<number, string>>();
  for (const [num, { body, stream }] of objs) {
    if (!/\/Type\s*\/Font/.test(body)) continue;
    const tuMatch = body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!tuMatch) continue;
    const tu = objs.get(Number(tuMatch[1]));
    if (!tu?.stream) continue;
    toUni.set(num, parseCMap(tu.stream.toString("latin1")));
  }

  // Los /F2, /F3... viven en el diccionario /Font de /Resources.
  const maps = new Map<string, Map<number, string>>();
  for (const [, { body }] of objs) {
    const fontDict = body.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (!fontDict) continue;
    for (const m of fontDict[1].matchAll(/\/(F\d+)\s+(\d+)\s+0\s+R/g)) {
      const cmap = toUni.get(Number(m[2]));
      if (cmap) maps.set(m[1], cmap);
    }
  }
  return maps;
}

function parseCMap(text: string): Map<number, string> {
  const map = new Map<number, string>();

  for (const block of text.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const m of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+(?:\s+[0-9A-Fa-f]+)*)>/g)) {
      map.set(parseInt(m[1], 16), hexToUni(m[2]));
    }
  }

  for (const block of text.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    // Forma escalar: <lo> <hi> <start>, los intermedios se incrementan.
    for (const m of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const base = parseInt(m[3], 16);
      for (let g = lo; g <= hi && g - lo < 4096; g += 1) {
        map.set(g, String.fromCodePoint(base + (g - lo)));
      }
    }
    // Forma array: <lo> <hi> [<d0> <d1> ...]. Es la que escribe fontkit, y es la
    // unica que usa el PDFKit con fuentes subset. Sin esta rama, todos los
    // glifos se resuelven a basura aunque el CMap este bien.
    for (const m of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = parseInt(m[1], 16);
      const dests = [...m[3].matchAll(/<([0-9A-Fa-f]+(?:\s+[0-9A-Fa-f]+)*)>/g)];
      dests.forEach((d, i) => map.set(lo + i, hexToUni(d[1])));
    }
  }
  return map;
}

function hexToUni(hex: string): string {
  let out = "";
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const code = parseInt(hex.slice(i, i + 4), 16);
    if (!Number.isNaN(code) && code > 0) out += String.fromCharCode(code);
  }
  return out;
}

const maps = fontMaps();

/** Texto de una pagina, en orden, resolviendo /Fn segun el fuente activo. */
function pageText(pageStream: string): string {
  const out: string[] = [];
  let current = "";
  let map: Map<number, string> | undefined;

  const decodeHex = (h: string): string => {
    let s = "";
    for (let i = 0; i < h.length; i += 4) {
      const gid = parseInt(h.slice(i, i + 4), 16);
      s += map?.get(gid) ?? "";
    }
    return s;
  };

  // Se recorren bloques BT..ET. Dentro, los numeros sueltos de un array TJ
  // son ajustes de kerning, NO espacios: si se Catan como separadores, "5 / 5"
  // sale como "5/5" con huecos y las aserciones sobre el pie de pagina mienten.
  const blockRe = /BT([\s\S]*?)ET/g;
  let bm: RegExpExecArray | null;
  while ((bm = blockRe.exec(pageStream)) !== null) {
    const block = bm[1];
    const fontOp = block.match(/\/(F\d+)\s+[\d.]+\s+Tf/);
    if (fontOp) {
      current = fontOp[1];
      map = maps.get(current);
    }
    if (!map) continue;
    for (const m of block.matchAll(/\[((?:[^\][]|\\.)*)\]\s*TJ|<([0-9A-Fa-f]+)>\s*Tj|\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
      if (m[1] !== undefined) {
        for (const h of m[1].matchAll(/<([0-9A-Fa-f]+)>/g)) out.push(decodeHex(h[1]));
        for (const lit of m[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g)) out.push(lit[1].replace(/\\([()\\])/g, "$1"));
      } else if (m[2] !== undefined) {
        out.push(decodeHex(m[2]));
      } else if (m[3] !== undefined) {
        out.push(m[3].replace(/\\([()\\])/g, "$1"));
      }
    }
    out.push("\n");
  }
  return out.join("");
}

const pageStreams: string[] = [];
for (const [, { body }] of objs) {
  if (!/\/Type\s*\/Page\b/.test(body)) continue;
  // Un objeto /Page NO tiene stream propio: su contenido esta en /Contents,
  // que puede ser "N 0 R" o un array "[a 0 R b 0 R]".
  const refs = [...body.matchAll(/(\d+)\s+0\s+R/g)]
    .map((m) => Number(m[1]))
    .filter((n) => objs.get(n)?.stream && /\bTJ\b|\bTj\b/.test(objs.get(n)!.stream!.toString("latin1")));
  for (const n of refs) pageStreams.push(objs.get(n)!.stream!.toString("latin1"));
}

const texts = pageStreams.map((s) => pageText(s));
const total = texts.length;

if (pagesOnly) {
  console.log(`${file}\npaginas con texto: ${total}`);
  if (lastInflateError) console.log(`ultimo fallo de inflate: ${lastInflateError}`);
  console.log();
  texts.forEach((t, i) => {
    const first = t.slice(0, 60).replace(/\n/g, " ");
    console.log(`  p${i + 1}: ${t.length} car.  ${first}`);
  });
} else if (filter) {
  const re = new RegExp(filter, "i");
  texts.forEach((t, i) => {
    t.split("\n").forEach((line) => {
      if (re.test(line)) console.log(`p${i + 1}: ${line}`);
    });
  });
} else {
  texts.forEach((t, i) => console.log(`\n--- pagina ${i + 1} ---\n${t}`));
}
