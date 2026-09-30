import fs from "node:fs";
import path from "node:path";
import { PDF_FONTS } from "@/lib/pdf/theme";
import { EMBEDDED_PDF_FONTS } from "@/lib/pdf/fonts.generated";

/**
 * Fuentes del PDF. Los Helvetica que trae PDFKit son WinAnsi y no cubren el
 * castellano acentuado, asi que se usan dos Noto Serif (OFL-1.1) en vez de
 * intentar codificar los acentos a mano.
 *
 * Van INCRUSTADAS en el modulo (`fonts.generated.ts`, generado por
 * `scripts/build-pdf-font-embed.ts`) y no como ficheros que leer con `fs`. Se
 * hizo asi porque la version con `fs` + `outputFileTracingIncludes` devolvia 500
 * en produccion y 200 en local: dependia de que las TTF estuvieran en el disco
 * de la funcion de Vercel, cosa que no se puede comprobar sin desplegar. Sin
 * disco no hay nada que sincronizar ni nada que pueda faltar.
 *
 * `PRESSPLAY_FONT_DIR` permite cargar de disco en tests y entornos con otro
 * layout; si no se define, se usa lo incrustado.
 */
const FONT_FILES: Record<string, string> = {
  [PDF_FONTS.serif]: "NotoSerif-Regular.ttf",
  [PDF_FONTS.serifBold]: "NotoSerif-Bold.ttf",
};

let fontCache: Map<string, Buffer> | null = null;

function fontDirectory(): string | null {
  const override = process.env.PRESSPLAY_FONT_DIR;
  return override && override.trim() !== "" ? override.trim() : null;
}

/**
 * Decodifica las fuentes una vez y las cachea: son 1,2 MB, y una funcion de
 * Vercel puede atender varias exportaciones seguidas, asi que decodificarlas en
 * cada peticion seria tirar trabajo a la basura.
 */
function loadFonts(): Map<string, Buffer> {
  if (fontCache) return fontCache;

  const loaded = new Map<string, Buffer>();
  const dir = fontDirectory();

  for (const [family, file] of Object.entries(FONT_FILES)) {
    if (dir) {
      const full = path.join(dir, file);
      if (!fs.existsSync(full)) {
        throw new Error(
          `PRESSPLAY_FONT_DIR apunta a ${dir} pero no esta ${file}. ` +
            "Para los acentos del castellano hacen falta las Noto Serif."
        );
      }
      loaded.set(family, fs.readFileSync(full));
      continue;
    }
    const b64 = EMBEDDED_PDF_FONTS[file];
    if (!b64) {
      // Sin fuente no hay salida valida: los Helvetica WinAnsi perderian los
      // acentos. Fallar aqui es mejor que emitir un PDF con "Amanece" partido.
      throw new Error(
        `La fuente ${file} no esta incrustada en lib/pdf/fonts.generated.ts. ` +
          "Regenerala con: npx tsx scripts/build-pdf-font-embed.ts"
      );
    }
    loaded.set(family, Buffer.from(b64, "base64"));
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
