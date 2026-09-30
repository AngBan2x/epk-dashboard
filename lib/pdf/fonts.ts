import fs from "node:fs";
import path from "node:path";
import { PDF_FONTS } from "@/lib/pdf/theme";

/**
 * Fuentes del PDF. Los Helvetica que trae PDFKit son WinAnsi y no cubren el
 * castellano acentuado, asi que se registran estos dos ficheros Noto Serif
 * (OFL-1.1, con su licencia y procedencia en `lib/pdf/fonts/`) en vez de
 * intentar codificar los acentos a mano.
 *
 * Viven en el arbol de codigo y NO en `public/` a proposito. En una funcion de
 * Vercel el disco disponible es el bundle de la lambda, y `public/` es un
 * directorio estatico que se sube al CDN: no se puede leer con `fs` en tiempo
 * de ejecucion. Con las TTF en `public/` el PDF daba 500 en produccion
 * (200 en local), porque ahi si estan en disco. Desde `lib/pdf/fonts/` llegan
 * al bundle por la regla de `outputFileTracingIncludes` de `next.config.js`.
 * Si se mueven de aqui, hay que actualizar ahi la regla.
 *
 * `PRESSPLAY_FONT_DIR` permite tests y entornos con otro layout de ficheros.
 */
const FONT_FILES: Record<string, string> = {
  [PDF_FONTS.serif]: "NotoSerif-Regular.ttf",
  [PDF_FONTS.serifBold]: "NotoSerif-Bold.ttf",
};

let fontCache: Map<string, Buffer> | null = null;

function fontDirectory(): string {
  const override = process.env.PRESSPLAY_FONT_DIR;
  if (override && override.trim() !== "") return override.trim();
  return path.join(process.cwd(), "lib", "pdf", "fonts");
}

/**
 * Lee las TTF una vez y las cachea: son 1,2 MB y una funcion de Vercel puede
 * atender varias exportaciones seguidas, asi que releerlas en cada peticion
 * seria tirar trabajo a la basura.
 */
function loadFonts(): Map<string, Buffer> {
  if (fontCache) return fontCache;

  const dir = fontDirectory();
  const loaded = new Map<string, Buffer>();
  const missing: string[] = [];

  for (const [family, file] of Object.entries(FONT_FILES)) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) {
      missing.push(full);
      continue;
    }
    loaded.set(family, fs.readFileSync(full));
  }

  if (missing.length > 0) {
    // Sin TTF no hay salida valida: los Helvetica WinAnsi perderian los acentos.
    // Fallar aqui es mejor que emitir un PDF con "Amanece" partido.
    throw new Error(
      `Falta(n) ${missing.length} fuente(s) del PDF en ${dir}: ${missing.join(", ")}. ` +
        "Se necesitan para los acentos del castellano."
    );
  }

  fontCache = loaded;
  return loaded;
}

/**
 * Registra las fuentes en el documento. Idempotente: PDFKit lanza si se registra
 * dos veces el mismo nombre, asi que se marca el documento.
 */
export function registerPdfFonts(doc: PDFKit.PDFDocument): void {
  const marked = doc as PDFKit.PDFDocument & { __pressPlayFonts?: boolean };
  if (marked.__pressPlayFonts) return;

  for (const [family, buffer] of loadFonts()) {
    doc.registerFont(family, buffer);
  }
  marked.__pressPlayFonts = true;
}
