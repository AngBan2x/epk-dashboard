import type { ExportSection } from "@/lib/downloadable-assets";
import { PDF_COLORS, PDF_FONTS, PDF_PAGE, PDF_SECTION_TITLES } from "@/lib/pdf/theme";
import { pdfText } from "@/lib/pdf/pdf-text";

export type PdfDoc = PDFKit.PDFDocument;

/**
 * Opciones de `text`. Se derivan de la firma de un metodo sin sobrecargas porque
 * `@types/pdfkit` no exporta `TextOptions` desde el namespace `PDFKit`.
 */
type TextOptions = NonNullable<Parameters<PdfDoc["widthOfString"]>[1]>;

/**
 * Y maximo del contenido. Queda 28 puntos por encima de `page.maxY()` (que es
 * donde PDFKit corta solo) para que el pie de pagina no se solape con el ultimo
 * bloque cuando uno se pasa de alto.
 */
const BOTTOM_LIMIT = PDF_PAGE.height - PDF_PAGE.margin - 28;

/**
 * Salta de pagina si `needed` no cabe y devuelve cuanto queda libre. Todo bloque
 * que se componga de varios textos pasa por aqui: PDFKit solo pagina solo cuando
 * le das un `width` y el texto no cabe, y si eso ocurre a mitad de una ficha la
 * dejaria partida entre dos paginas.
 */
export function ensureSpace(doc: PdfDoc, needed: number): number {
  const available = BOTTOM_LIMIT - doc.y;
  if (available < needed) {
    doc.addPage();
    return BOTTOM_LIMIT - doc.y;
  }
  return available;
}

/** Alto que ocuparia un texto con el ancho dado, sin dibujarlo. */
export function measure(
  doc: PdfDoc,
  value: string,
  width: number,
  size: number,
  lineGap = 0
): number {
  return doc.font(PDF_FONTS.serif).fontSize(size).heightOfString(value, { width, lineGap });
}

/** Alto de una linea con el cuerpo y el interlineado dados. */
export function lineHeight(doc: PdfDoc, size: number, lineGap = 0): number {
  return measure(doc, "Ag", PDF_PAGE.content, size, lineGap);
}

export function rule(
  doc: PdfDoc,
  x: number,
  y: number,
  width: number,
  color: string = PDF_COLORS.hairline,
  thickness = 1
): void {
  doc
    .moveTo(x, y)
    .lineTo(x + width, y)
    .lineWidth(thickness)
    .strokeColor(color)
    .stroke();
}

/**
 * Barra de marca de tres bandas. El unico elemento de color plano que sobrevive
 * a una impresion en blanco y negro, asi que hace de logotipo en portada y en
 * cada cabecera de seccion.
 */
export function brandStripe(doc: PdfDoc, y: number, height = 5, width = PDF_PAGE.width): void {
  const band = width / 3;
  doc.rect(0, y, band, height).fill(PDF_COLORS.indigo);
  doc.rect(band, y, band, height).fill(PDF_COLORS.violet);
  doc.rect(band * 2, y, band, height).fill(PDF_COLORS.pink);
}

export interface CoverInput {
  artistName: string;
  genre: string;
  location: string;
  dateLine: string;
  sections: readonly ExportSection[];
}

export function drawCover(doc: PdfDoc, input: CoverInput): void {
  const left = PDF_PAGE.margin;
  const width = PDF_PAGE.content;

  brandStripe(doc, 0, 6);
  brandStripe(doc, PDF_PAGE.height - 6, 6);

  doc
    .font(PDF_FONTS.serifBold)
    .fontSize(15)
    .fillColor(PDF_COLORS.indigo)
    .text("PressPlay", left, PDF_PAGE.margin + 84, { characterSpacing: 3 });
  doc
    .font(PDF_FONTS.serifBold)
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text("ELECTRONIC PRESS KIT", left, doc.y + 4, { width, characterSpacing: 2 });

  // El nombre manda: es lo que decide si el dossier sirve para algo, asi que va
  // con el mayor cuerpo del documento y con el interlineado cerrado para que dos
  // lineas de mayusculas no dejen un hueco enorme. Se coloca a un tercio de
  // altura, que es donde la vista entra primero en una portada.
  const name = pdfText(input.artistName, "PressPlay");
  const top = PDF_PAGE.height * 0.3;
  doc.font(PDF_FONTS.serifBold).fontSize(38).fillColor(PDF_COLORS.ink);
  ensureSpace(doc, measure(doc, name, width, 38, -4));
  doc.text(name, left, top, { width, lineGap: -4 });

  doc.y += 6;
  rule(doc, left, doc.y, width, PDF_COLORS.pink, 3);
  doc.y += 16;

  const meta = [input.genre, input.location].filter((entry) => entry !== "").join("  ·  ");
  if (meta !== "") {
    doc.font(PDF_FONTS.serif).fontSize(12).fillColor(PDF_COLORS.slate).text(pdfText(meta), left, doc.y, { width });
    doc.y += 6;
  }

  // La portada es la unica hoja sin pie, asi que es la que dice que secciones
  // vienen despues.
  if (input.sections.length > 0) {
    const labels = input.sections.map((section) => PDF_SECTION_TITLES[section]).join("   /   ");
    doc
      .font(PDF_FONTS.serifBold)
      .fontSize(8.5)
      .fillColor(PDF_COLORS.muted)
      .text(pdfText(labels).toUpperCase(), left, doc.y, { width, characterSpacing: 1.4 });
  }

  const footY = PDF_PAGE.height - PDF_PAGE.margin - 44;
  rule(doc, left, footY, width);
  doc
    .font(PDF_FONTS.serif)
    .fontSize(9)
    .fillColor(PDF_COLORS.slate)
    .text(pdfText(`Generado por PressPlay · ${input.dateLine}`), left, footY + 10, { width });
}

/** Cabecera de seccion: eyebrow, titular y filete de color. */
export function drawSectionTitle(doc: PdfDoc, section: ExportSection, subtitle: string): void {
  brandStripe(doc, 0, 4);

  const title = pdfText(PDF_SECTION_TITLES[section]);
  doc
    .font(PDF_FONTS.serifBold)
    .fontSize(8.5)
    .fillColor(PDF_COLORS.pink)
    .text(title.toUpperCase(), PDF_PAGE.margin, PDF_PAGE.margin, { characterSpacing: 2 });
  doc.y += 4;

  ensureSpace(doc, measure(doc, title, PDF_PAGE.content, 24, -2) + 40);
  doc.font(PDF_FONTS.serifBold).fontSize(24).fillColor(PDF_COLORS.ink).text(title, PDF_PAGE.margin, doc.y, { width: PDF_PAGE.content, lineGap: -2 });

  if (subtitle !== "") {
    doc.y += 2;
    const body = pdfText(subtitle);
    ensureSpace(doc, measure(doc, body, PDF_PAGE.content, 10.5));
    doc.font(PDF_FONTS.serif).fontSize(10.5).fillColor(PDF_COLORS.slate).text(body, PDF_PAGE.margin, doc.y, { width: PDF_PAGE.content });
    doc.y += 4;
  }

  rule(doc, PDF_PAGE.margin, doc.y + 8, PDF_PAGE.content, PDF_COLORS.indigo, 2);
  doc.y += 24;
}

/** Subtitulo dentro de una seccion (Biografia, Equipo de sonido, ...). */
export function drawSubtitle(doc: PdfDoc, label: string): void {
  ensureSpace(doc, 34);
  doc
    .font(PDF_FONTS.serifBold)
    .fontSize(11)
    .fillColor(PDF_COLORS.indigo)
    .text(pdfText(label), PDF_PAGE.margin, doc.y, { width: PDF_PAGE.content, characterSpacing: 0.6 });
  doc.y += 3;
  rule(doc, PDF_PAGE.margin, doc.y, PDF_PAGE.content);
  doc.y += 12;
}

export interface FieldRow {
  label: string;
  value: string;
}

/**
 * Rejilla etiqueta/valor. Es el patron del rider y del bloque de contacto del
 * dossier. Se dibuja por parejas de celdas porque el alto de una fila lo marca
 * el valor mas alto: si no, el texto largo de la columna izquierda se
 * solaparia con el de la derecha.
 */
export function drawFieldGrid(doc: PdfDoc, rows: FieldRow[], options: { columns?: 1 | 2 } = {}): void {
  const columns = options.columns ?? 2;
  const gap = 18;
  const columnWidth = columns === 2 ? (PDF_PAGE.content - gap) / 2 : PDF_PAGE.content;
  const labelSize = 7.5;
  const valueSize = 10;
  const labelLead = 11;

  for (let start = 0; start < rows.length; start += columns) {
    const cells = rows
      .slice(start, start + columns)
      .map((row) => ({ label: pdfText(row.label), value: pdfText(row.value) }))
      .filter((cell) => cell.label !== "" || cell.value !== "");
    if (cells.length === 0) continue;

    const valueHeight = Math.max(
      ...cells.map((cell) => measure(doc, cell.value, columnWidth, valueSize, 1.5))
    );
    const rowHeight = labelLead + Math.max(valueHeight, 12);

    ensureSpace(doc, rowHeight + 8);
    const top = doc.y;

    cells.forEach((cell, index) => {
      const x = PDF_PAGE.margin + index * (columnWidth + gap);
      doc.font(PDF_FONTS.serifBold).fontSize(labelSize).fillColor(PDF_COLORS.muted);
      doc.text(cell.label.toUpperCase(), x, top, { width: columnWidth, characterSpacing: 1 });
      doc
        .font(PDF_FONTS.serif)
        .fontSize(valueSize)
        .fillColor(PDF_COLORS.body)
        .text(cell.value, x, top + labelLead, { width: columnWidth, lineGap: 1.5 });
    });

    doc.y = top + rowHeight + 8;
  }
}

export interface StatCell {
  label: string;
  value: string;
}

/** Tira de metricas (streams, saves, playlists) con la cifra destacada. */
export function drawStats(doc: PdfDoc, stats: StatCell[]): void {
  const visible = stats.filter((cell) => pdfText(cell.value) !== "");
  if (visible.length === 0) return;

  const gap = 10;
  const width = (PDF_PAGE.content - gap * (visible.length - 1)) / visible.length;
  const height = 34;

  ensureSpace(doc, height + 10);
  const top = doc.y;

  visible.forEach((cell, index) => {
    const x = PDF_PAGE.margin + index * (width + gap);
    doc.roundedRect(x, top, width, height, 6).fill(PDF_COLORS.surface);
    doc
      .font(PDF_FONTS.serifBold)
      .fontSize(13)
      .fillColor(PDF_COLORS.pink)
      .text(pdfText(cell.value), x + 8, top + 7, { width: width - 16, align: "center" });
    doc
      .font(PDF_FONTS.serifBold)
      .fontSize(7)
      .fillColor(PDF_COLORS.muted)
      .text(pdfText(cell.label).toUpperCase(), x + 6, top + 23, {
        width: width - 12,
        align: "center",
        characterSpacing: 0.8,
      });
  });

  doc.y = top + height + 14;
}

/**
 * Parrafo que fluye entre paginas. No hace falta trocearlo a mano: PDFKit
 * pagina solo en cuanto se le pasa un `width`. `maxLines` recorta con elipsis,
 * que es lo que evita que una letra de trescientas lineas se coma el PDF.
 *
 * Los saltos de linea explicitos se dibujan segmento a segmento porque
 * `_fragment` de PDFKit borra los "\n" antes de componer.
 */
export function drawParagraph(doc: PdfDoc, value: string, size = 10.5, maxLines?: number): void {
  const body = pdfText(value);
  if (body === "") return;

  const lineGap = 3;
  const width = PDF_PAGE.content;
  const oneLine = lineHeight(doc, size, lineGap);
  let budget = maxLines ?? Number.POSITIVE_INFINITY;

  for (const segment of body.split("\n")) {
    if (budget <= 0) break;
    if (segment === "") {
      // Linea en blanco de la letra: se cuenta igual para no saltarse el corte.
      ensureSpace(doc, oneLine);
      doc.y += oneLine;
      budget -= 1;
      continue;
    }

    const full = measure(doc, segment, width, size, lineGap);
    const capacity = oneLine * budget;
    const options: TextOptions = { width, lineGap };
    if (budget !== Number.POSITIVE_INFINITY) {
      options.height = capacity;
      options.ellipsis = true;
    }

    ensureSpace(doc, Math.min(full, budget === Number.POSITIVE_INFINITY ? 80 : capacity));
    doc.font(PDF_FONTS.serif).fontSize(size).fillColor(PDF_COLORS.body).text(segment, PDF_PAGE.margin, doc.y, options);

    // `round` y no `ceil`: `heightOfString` acumula el alto linea a linea y el
    // cociente sale 1.0000000000000038, que `ceil` redondea a 2 y hacia que cada
    // linea de la letra gastase el doble de presupuesto.
    budget -= Math.max(1, Math.round(full / oneLine));
  }
}

/** Linea "Etiqueta: valor" de los metadatos del catalogo. */
export function drawMetaLine(doc: PdfDoc, label: string, value: string): void {
  const body = pdfText(value);
  if (body === "") return;

  const width = PDF_PAGE.content;
  const labelText = `${pdfText(label).toUpperCase()}:`;
  const spacing = 0.8;
  // El ancho de la etiqueta se mide con sus propias opciones: `widthOfString`
  // solo suma el `characterSpacing` si se le pasa, y si no, el valor se le
  // montaria encima de la etiqueta ("TONALIDAD:D minor").
  const labelWidth =
    doc.font(PDF_FONTS.serifBold).fontSize(7.5).widthOfString(labelText, { characterSpacing: spacing }) + 6;
  const valueHeight = measure(doc, body, width - labelWidth, 9.5, 1.5);

  ensureSpace(doc, valueHeight + 4);
  const y = doc.y;
  doc
    .font(PDF_FONTS.serifBold)
    .fontSize(7.5)
    .fillColor(PDF_COLORS.muted)
    .text(labelText, PDF_PAGE.margin, y + 1.5, { characterSpacing: spacing });
  doc.font(PDF_FONTS.serif).fontSize(9.5).fillColor(PDF_COLORS.body);
  doc.text(body, PDF_PAGE.margin + labelWidth, y, { width: width - labelWidth, lineGap: 1.5 });
  doc.y = y + Math.max(valueHeight, 13) + 3;
}

/**
 * Pies de pagina de todas las hojas menos la portada (que lleva su propio
 * bloque). Se pintan al final, ya con el total de paginas conocido: por eso el
 * generador abre el documento con `bufferPages`.
 */
export function drawFooters(doc: PdfDoc, generatedAt: string): void {
  const range = doc.bufferedPageRange();
  for (let index = 1; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const y = PDF_PAGE.height - PDF_PAGE.margin - 12;
    rule(doc, PDF_PAGE.margin, y - 8, PDF_PAGE.content);
    doc.font(PDF_FONTS.serif).fontSize(7.5).fillColor(PDF_COLORS.muted);
    doc.text(pdfText(`PressPlay · ${generatedAt}`), PDF_PAGE.margin, y, { width: PDF_PAGE.content / 2 });
    doc.text(`${index + 1} / ${range.count}`, PDF_PAGE.margin + PDF_PAGE.content / 2, y, {
      width: PDF_PAGE.content / 2,
      align: "right",
    });
  }
  doc.flushPages();
}
