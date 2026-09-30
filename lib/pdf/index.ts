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
  const doc = new PDFDocument({
    size: PDF_PAGE.size,
    margin: PDF_PAGE.margin,
    bufferPages: true,
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
