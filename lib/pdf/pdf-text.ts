/**
 * Los Helvetica estandar de PDFKit son WinAnsi: no tienen los signos del
 * castellano (n con tilde, enye, interrogantes de apertura) ni los emoji y
 * flechas que hoy usan los HTML del dossier. Se registra una TTF real (ver
 * `fonts.ts`) para que "Bjork" salga con diacritico y no con un hueco.
 *
 * PDFKit NO lanza error ante un glifo ausente: lo dibuja como .notdef, o sea un
 * hueco silencioso. Por eso el sanitizado de `pdfText` no es cosmetico, es la
 * unica red de seguridad: sin el, un nombre con emoji perderia caracteres sin
 * avisar y el PDF saldria con huecos que nadie podria explicar.
 */

/**
 * Equivalentes ASCII solo para los caracteres que las fuentes NO tienen. Se
 * verifico glifo a glifo contra la cmap de NotoSerif: faltan las flechas
 * (U+2190..), los checks (U+2713, U+2714, U+2705) y los emoji. Guiones,
 * comillas (incluidas las angulares Ongoing «» que usa el castellano),
 * puntos suspensivos y el interpunct quedan como estan porque si estan.
 */
const TRANSLITERATIONS: Record<string, string> = {
  // Los controles van antes que el rango de soportes porque U+0009 y U+000A
  // estan por debajo de U+0020: sin esta entrada el filtro se los comia y una
  // letra con sus saltos de linea salia como un solo parrafo.
  "\n": "\n",
  "\t": " ",
  "\u2192": "->", // →
  "\u2190": "<-", // ←
  "\u21d2": "=>", // ⇒
  "\u2194": "<->", // ↔
  "\u2191": "^", // ↑
  "\u2193": "v", // ↓
  "\u2713": "OK", // ✓
  "\u2714": "OK", // ✔
  "\u2705": "OK", // ✅
  "\u2611": "OK", // ☑
  "\u274c": "X", // ❌
  "\u26a0": "!", // ⚠
  "\u2605": "*", // ★
  "\u2606": "*", // ☆
  "\u00a0": " ", // nbsp
  "\u2007": " ", // figure space
  "\u202f": " ", // narrow nbsp
  "\u200c": "", // ZWNJ
  "\u200d": "", // ZWJ
  "\ufeff": "", // BOM
};

/**
 * Cobertura real de las TTF registradas, comprobada con fontkit sobre
 * NotoSerif-Regular y -Bold: no hay ni un hueco entre U+0020 y U+024F, y el
 * bloque U+2000-U+215F (rayas, comillas, puntos, espacio fino, ©, ®, ™, €) esta
 * completo. Cualquier punto de codigo fuera de estos rangos se transcribe con
 * la tabla de arriba o se descarta.
 */
const SUPPORTED = /[ -\u024f\u2000-\u215f\u2184\u2189]/u;

/**
 * Normaliza y transcribe texto de datos de usuario para escribirlo con las
 * fuentes registradas. Nunca lanza: un nombre con caracteres exoticos sale sin
 * el glifo problematico en vez de tumbar la exportacion entera.
 */
export function pdfText(value: unknown, fallback = ""): string {
  const raw = typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
  if (raw === "") return "";

  // NFC antes de filtrar: un "o" + diaeresis combinante (U+006F U+0308) llega de
  // la base de datos en dos formas segun quien lo escribio, y la forma
  // descompuesta perderia el acento al descartarse el diacritico.
  const normalized = raw.replace(/\r\n?/g, "\n").normalize("NFC");

  let out = "";
  for (const char of normalized) {
    const mapped = TRANSLITERATIONS[char];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    out += SUPPORTED.test(char) ? char : "";
  }

  // La transcripcion puede dejar dobles espacios (p.ej. tras una elipsis) y los
  // datos de usuario traen saltos y tabuladores sueltos.
  return out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]*\n[ \t]*/g, "\n").trim();
}
