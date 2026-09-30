/**
 * Extractor de texto de PDF sin dependencias, para tests.
 *
 * Existe porque comprobar el contenido de un PDF mirando bytes no sirve: un PDF
 * con la numeracion de pie de pagina rota o una ficha de pista partida entre
 * dos paginas es un PDF valido, con el tamano correcto y las fuentes bien
 * incrustadas. La unica forma de detectarlo es leer el texto.
 *
 * Por que es tanIndirecto: PDFKit incrusta las fuentes como subset y escribe
 * el texto como IDs de glifo en hexadecimal dentro de arrays TJ
 * (`[<0013> 20 <0014>] TJ`). Para volver a Unicode hay que leer el CMap
 * ToUnicode de cada fuente. Y los numeros que hay dentro de un TJ son ajustes
 * de kerning, no espacios: si se cuentan como separador, "5 / 5" sale
 * deformado y las aserciones sobre el pie mienten.
 */
import zlib from "zlib";

interface PdfObject {
  body: string;
  stream: Buffer | null;
}

function readObjects(buf: Buffer): Map<number, PdfObject> {
  const as = buf.toString("latin1");
  const out = new Map<number, PdfObject>();
  const re = /(\d+)\s+0\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(as)) !== null) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const bodyEnd = as.indexOf("endobj", bodyStart);
    if (bodyEnd === -1) continue;
    const body = as.slice(bodyStart, bodyEnd);
    out.set(num, { body, stream: readStream(buf, as, bodyStart, body, num) });
    re.lastIndex = bodyEnd;
  }
  return out;
}

function readStream(
  buf: Buffer,
  as: string,
  bodyStart: number,
  body: string,
  num: number
): Buffer | null {
  const sIdx = body.indexOf("stream");
  if (sIdx === -1) return null;
  let dataStart = bodyStart + sIdx + "stream".length;
  while (as[dataStart] === "\r" || as[dataStart] === "\n") dataStart += 1;
  // /Length es mas fiable que buscar "endstream": esa palabra puede aparecer por
  // azar dentro de datos binarios y cortar ahi rompe el stream.
  const lenMatch = body.match(/\/Length\s+(\d+)/);
  const dataEnd = lenMatch
    ? dataStart + Number(lenMatch[1])
    : as.indexOf("endstream", dataStart);
  if (dataEnd === -1 || dataEnd > buf.length) return null;
  const raw = buf.subarray(dataStart, dataEnd);
  if (!body.includes("/FlateDecode")) return raw;
  try {
    return zlib.inflateSync(raw);
  } catch {
    try {
      return zlib.inflateRawSync(raw);
    } catch {
      return null;
    }
  }
}

function hexToUni(hex: string): string {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    const code = parseInt(hex.slice(i, i + 4), 16);
    if (!Number.isNaN(code) && code > 0) out += String.fromCharCode(code);
  }
  return out;
}

function parseCMap(text: string): Map<number, string> {
  const map = new Map<number, string>();

  for (const block of text.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const m of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+(?:\s+[0-9A-Fa-f]+)*)>/g)) {
      map.set(parseInt(m[1], 16), hexToUni(m[2]));
    }
  }

  for (const block of text.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    // Forma escalar: <lo> <hi> <inicio>, los intermedios se incrementan.
    for (const m of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const base = parseInt(m[3], 16);
      for (let g = lo; g <= hi && g - lo < 4096; g += 1) {
        map.set(g, String.fromCodePoint(base + (g - lo)));
      }
    }
    // Forma array: <lo> <hi> [<d0> <d1> ...]. Es la que escribe fontkit para
    // fuentes subset, o sea la de PDFKit. Sin esta rama todos los glifos se
    // resuelven a basura aunque el CMap sea correcto.
    for (const m of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = parseInt(m[1], 16);
      const dests = [...m[3].matchAll(/<([0-9A-Fa-f]+(?:\s+[0-9A-Fa-f]+)*)>/g)];
      dests.forEach((d, i) => map.set(lo + i, hexToUni(d[1])));
    }
  }
  return map;
}

function buildFontMaps(objs: Map<number, PdfObject>): Map<string, Map<number, string>> {
  const toUni = new Map<number, Map<number, string>>();
  for (const [num, { body, stream }] of objs) {
    if (!/\/Type\s*\/Font/.test(body)) continue;
    const tuMatch = body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!tuMatch) continue;
    const tu = objs.get(Number(tuMatch[1]));
    if (!tu?.stream) continue;
    toUni.set(num, parseCMap(tu.stream.toString("latin1")));
  }

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

function decodeStreamText(stream: string, maps: Map<string, Map<number, string>>): string {
  const out: string[] = [];
  let map: Map<number, string> | undefined;

  const decodeHex = (h: string): string => {
    let s = "";
    for (let i = 0; i < h.length; i += 4) {
      s += map?.get(parseInt(h.slice(i, i + 4), 16)) ?? "";
    }
    return s;
  };

  const blockRe = /BT([\s\S]*?)ET/g;
  let bm: RegExpExecArray | null;
  while ((bm = blockRe.exec(stream)) !== null) {
    const block = bm[1];
    const fontOp = block.match(/\/(F\d+)\s+[\d.]+\s+Tf/);
    if (fontOp) map = maps.get(fontOp[1]);
    if (!map) continue;
    for (const m of block.matchAll(
      /\[((?:[^\][]|\\.)*)\]\s*TJ|<([0-9A-Fa-f]+)>\s*Tj|\(((?:\\.|[^\\()])*)\)\s*Tj/g
    )) {
      if (m[1] !== undefined) {
        for (const h of m[1].matchAll(/<([0-9A-Fa-f]+)>/g)) out.push(decodeHex(h[1]));
        for (const lit of m[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g)) {
          out.push(lit[1].replace(/\\([()\\])/g, "$1"));
        }
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

/** Texto de cada pagina del PDF, en orden. */
export function extractPdfPages(pdf: Buffer | Uint8Array): string[] {
  const buf = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  const objs = readObjects(buf);
  const maps = buildFontMaps(objs);
  const pages: string[] = [];

  for (const [, { body }] of objs) {
    if (!/\/Type\s*\/Page\b/.test(body)) continue;
    // Un objeto /Page no tiene stream propio: su contenido esta en /Contents.
    for (const m of body.matchAll(/(\d+)\s+0\s+R/g)) {
      const target = objs.get(Number(m[1]));
      if (!target?.stream) continue;
      const text = target.stream.toString("latin1");
      if (!/\bTJ\b|\bTj\b/.test(text)) continue;
      pages.push(decodeStreamText(text, maps));
    }
  }
  return pages;
}

/** Texto de cada pagina normalizado a espacios simples, util para comparar. */
export function extractPdfPagesFlat(pdf: Buffer | Uint8Array): string[] {
  return extractPdfPages(pdf).map((p) => p.replace(/\s+/g, " ").trim());
}
