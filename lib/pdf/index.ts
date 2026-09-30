import PDFDocument from "pdfkit";
import {
  EXPORT_SECTIONS,
  formatDateLong,
  type ExportPayload,
  type ExportSection,
} from "@/lib/downloadable-assets";
import { safeArray, safeString } from "@/lib/null-safe";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { PDF_PAGE } from "@/lib/pdf/theme";
import { drawCover, drawFooters, type PdfDoc } from "@/lib/pdf/layout";
import { drawCatalogSection, drawDossierSection, drawRiderSection } from "@/lib/pdf/sections";

/**
 * PDFKit solo escribe en un stream. Esta funcion acumula los chunks y resuelve
 * con el Buffer completo: la API que ve el resto del proyecto es una promesa, no
 * un stream, porque `buildExportBundle` tiene que devolver el cuerpo entero
 * para ponerlo en un `Content-Disposition`.
 */
function collect(doc: PdfDoc): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/**
 * Genera el PDF de prensa de un artista.
 *
 * @param payload  Mismo payload que consumen los constructores HTML/JSON.
 * @param sections Secciones a incluir, en el orden de `EXPORT_SECTIONS`.
 * @returns Buffer con el PDF completo.
 */
export async function buildPressPdf(
  payload: ExportPayload,
  sections: readonly ExportSection[]
): Promise<Buffer> {
  // `bufferPages` es imprescindible: los pies de pagina se pintan al final,
  // cuando ya se sabe cuantas paginas hay, y eso exige poder volver a ellas.
  //
  // `font: null` NO es cosmetico. El constructor de PDFKit hace
  // `initFonts(options.font)`, y `initFonts` carga la fuente por defecto con
  // `this.font(defaultFont)` cuando defaultFont es truthy. Sin esto pide
  // `require('#standard-fonts/Helvetica')` en el constructor, ANTES de que
  // registremos las Noto Serif, y ese require es dinamico: el tracer de Next no
  // lo ve y el directorio no viaja a la funcion de Vercel. En produccion:
  //   Cannot find module '/var/task/.../pdfkit/js/standard-fonts/Helvetica.cjs'
  // Pasando `null` en vez de dejar `undefined`, el default `'Helvetica'` no se
  // aplica y nunca se toca una fuente estandar. Hay un test que lo fija
  // (tests/unit/pdf-standard-fonts.test.ts).
  //
  // Consecuencia a tener en cuenta: `doc._font` empieza a null, asi que hay que
  // poner fuente antes de cada `text()`. Todo el layout lo hace, y si algún dia
  // se escribe texto sin fuente falla de forma ruidosa, que es lo preferable a
  // depender de ficheros que el despliegue puede no llevar.
  const doc = new PDFDocument({
    size: PDF_PAGE.size,
    margin: PDF_PAGE.margin,
    bufferPages: true,
    // El `as` es necesario porque los tipos de pdfkit declaran `font?: string`.
    // Se miente aqui a proposito: `null` es exactamente lo que hace que el
    // constructor no cargue Helvetica, y el PDF lo demuestra (si esto se rompe,
    // falla tests/unit/pdf-standard-fonts.test.ts).
    font: null as unknown as string,
    info: {
      Title: `${safeString(payload.artistName, "PressPlay")} — PressPlay`,
      Author: "PressPlay",
      Subject: "Electronic Press Kit",
      Creator: "PressPlay",
      Producer: "PressPlay",
    },
  });

  const done = collect(doc);

  try {
    registerPdfFonts(doc);

    const requested = EXPORT_SECTIONS.filter((section) => sections.includes(section));
    const generated = payload.generatedAt ?? new Date();

    drawCover(doc, {
      artistName: safeString(payload.artistName, "PressPlay"),
      genre: safeString(payload.genre, ""),
      location: safeString(payload.location, ""),
      dateLine: formatDateLong(generated),
      sections: requested,
    });

    for (const section of requested) {
      if (section === "dossier") drawDossierSection(doc, payload);
      else if (section === "rider") drawRiderSection(doc, payload);
      else drawCatalogSection(doc, payload, safeArray(payload.tracks));
    }

    drawFooters(doc, formatDateLong(generated));
  } catch (error) {
    // Sin `doc.end()` el stream nunca cierra y la promesa se queda colgada
    // para siempre en vez de rechazar.
    doc.end();
    throw error;
  }

  doc.end();
  return done;
}

export { pdfText } from "@/lib/pdf/pdf-text";
