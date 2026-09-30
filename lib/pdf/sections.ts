import {
  catalogTrackFields,
  dossierRecord,
  dossierText,
  formatDateLong,
  riderValue,
  type ExportPayload,
  type ExportSection,
} from "@/lib/downloadable-assets";
import { safeString } from "@/lib/null-safe";
import type { Track } from "@/types/music";
import { PDF_COLORS, PDF_FONTS, PDF_PAGE } from "@/lib/pdf/theme";
import { pdfText } from "@/lib/pdf/pdf-text";
import {
  drawFieldGrid,
  drawMetaLine,
  drawParagraph,
  drawSectionTitle,
  drawStats,
  drawSubtitle,
  ensureSpace,
  lineHeight,
  measure,
  rule,
  type FieldRow,
  type PdfDoc,
} from "@/lib/pdf/layout";

function now(payload: ExportPayload): Date {
  return payload.generatedAt ?? new Date();
}

function subtitleFor(payload: ExportPayload, section: ExportSection): string {
  const date = formatDateLong(now(payload));
  const artist = safeString(payload.artistName, "");
  if (section === "catalog") {
    return artist === "" ? `Generado el ${date}` : `${artist} · generado el ${date}`;
  }
  return `Generado el ${date}`;
}

function startSection(doc: PdfDoc, payload: ExportPayload, section: ExportSection): void {
  doc.addPage();
  drawSectionTitle(doc, section, subtitleFor(payload, section));
}

export function drawDossierSection(doc: PdfDoc, payload: ExportPayload): void {
  startSection(doc, payload, "dossier");
  const data = dossierRecord(payload);

  const genre = dossierText(data, "genre", safeString(payload.genre, ""));
  const location = dossierText(data, "location", safeString(payload.location, ""));

  const header: FieldRow[] = [];
  if (genre !== "") header.push({ label: "Género", value: genre });
  if (location !== "") header.push({ label: "Ubicación", value: location });
  if (header.length > 0) drawFieldGrid(doc, header);

  const biography = dossierText(
    data,
    "biography",
    `${safeString(payload.artistName)} es un artista multidisciplinario con trayectoria en produccion musical, composicion y performance en vivo.`
  );
  drawSubtitle(doc, "Biografía");
  drawParagraph(doc, biography, 11);

  const pressText = dossierText(data, "press_text");
  if (pressText !== "") {
    drawSubtitle(doc, "Prensa");
    // Cita de prensa: sangrada y en cursiva no disponible en la TTF, asi que se
    // distingue con la barra lateral y el color, como hace el HTML.
    const width = PDF_PAGE.content - 16;
    const height = doc.font(PDF_FONTS.serif).fontSize(10.5).heightOfString(pdfText(pressText), { width, lineGap: 3 });
    ensureSpace(doc, height + 16);
    const y = doc.y;
    doc.rect(PDF_PAGE.margin, y, 3, height).fill(PDF_COLORS.pink);
    doc.font(PDF_FONTS.serif).fontSize(10.5).fillColor(PDF_COLORS.slate);
    doc.text(pdfText(pressText), PDF_PAGE.margin + 16, y, { width, lineGap: 3 });
    doc.y = y + height + 8;
  }

  const influences = dossierText(data, "influences");
  if (influences !== "") {
    drawSubtitle(doc, "Influencias");
    const tags = influences
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");
    // El HTML los pinta como chips; en un PDF que puede imprimirse en gris, cada
    // chip es un recuadro con texto, y se numeran para que la lista se lea aun
    // sin color.
    let line = "";
    for (const [index, tag] of tags.entries()) {
      const piece = index === 0 ? tag : `· ${tag}`;
      const candidate = line === "" ? piece : `${line}   ${piece}`;
      if (doc.font(PDF_FONTS.serif).fontSize(10.5).widthOfString(candidate) > PDF_PAGE.content) {
        doc.font(PDF_FONTS.serif).fontSize(10.5).fillColor(PDF_COLORS.body).text(pdfText(line), PDF_PAGE.margin, doc.y, { width: PDF_PAGE.content });
        doc.y += 4;
        line = tag;
      } else {
        line = candidate;
      }
    }
    if (line !== "") {
      doc.font(PDF_FONTS.serif).fontSize(10.5).fillColor(PDF_COLORS.body).text(pdfText(line), PDF_PAGE.margin, doc.y, { width: PDF_PAGE.content });
      doc.y += 8;
    }
  }

  drawSubtitle(doc, "Contacto");
  const contact: FieldRow[] = [
    {
      label: "Email",
      value: dossierText(data, "contact_email", dossierText(data, "booking_email", "booking@epk-dashboard.com")),
    },
    { label: "Management", value: dossierText(data, "management", "PressPlay Records") },
  ];
  const website = dossierText(data, "website");
  if (website !== "") contact.push({ label: "Web", value: website });
  drawFieldGrid(doc, contact);
}

const RIDER_GROUPS: Array<{ title: string; columns: 1 | 2; fields: Array<{ label: string; key: Parameters<typeof riderValue>[1] }> }> = [
  {
    title: "Equipo de sonido",
    columns: 2,
    fields: [
      { label: "Sistema PA", key: "rider_pa_system" },
      { label: "Monitores", key: "rider_monitors" },
      { label: "Consola FOH", key: "rider_console" },
      { label: "Subwoofers", key: "rider_subwoofers" },
    ],
  },
  {
    title: "Backline",
    columns: 2,
    fields: [
      { label: "Guitarra", key: "rider_guitar" },
      { label: "Bajo", key: "rider_bass" },
      { label: "Batería", key: "rider_drums" },
      { label: "Teclados", key: "rider_keyboards" },
    ],
  },
  {
    title: "Escenario",
    columns: 2,
    fields: [
      { label: "Iluminación", key: "rider_lighting" },
      { label: "Tamaño mínimo", key: "rider_stage_size" },
      { label: "Condiciones", key: "rider_stage_conditions" },
    ],
  },
  {
    title: "Hospitality",
    columns: 1,
    fields: [{ label: "Water & food", key: "rider_hospitality" }],
  },
  {
    title: "Transporte",
    columns: 1,
    fields: [{ label: "Traslado", key: "rider_transport" }],
  },
];

export function drawRiderSection(doc: PdfDoc, payload: ExportPayload): void {
  startSection(doc, payload, "rider");
  const data = dossierRecord(payload);

  drawFieldGrid(doc, [{ label: "Artista", value: safeString(payload.artistName) }], { columns: 1 });

  for (const group of RIDER_GROUPS) {
    drawSubtitle(doc, group.title);
    drawFieldGrid(
      doc,
      group.fields.map((field) => ({ label: field.label, value: riderValue(data, field.key) })),
      { columns: group.columns }
    );
  }

  const notes = dossierText(data, "rider_special_notes");
  if (notes !== "") {
    drawSubtitle(doc, "Notas especiales");
    drawParagraph(doc, notes, 10.5);
  }
}

/** Cuantas lineas de letra entran. El HTML las imprime enteras; en el PDF se
 *  recortan con elipsis porque una letra de trescientas lineas sola se come el
 *  documento entero. */
const LYRICS_MAX_LINES = 18;

export function drawCatalogSection(doc: PdfDoc, payload: ExportPayload, tracks: Track[]): void {
  startSection(doc, payload, "catalog");

  const artist = safeString(payload.artistName, "");
  const total = tracks.length;

  doc
    .font(PDF_FONTS.serifBold)
    .fontSize(9)
    .fillColor(PDF_COLORS.violet)
    .text(
      pdfText(
        total === 0
          ? "Este catálogo todavía no tiene lanzamientos publicados."
          : `${total} ${total === 1 ? "lanzamiento publicado" : "lanzamientos publicados"}${artist === "" ? "" : ` de ${artist}`}`
      ),
      PDF_PAGE.margin,
      doc.y,
      { width: PDF_PAGE.content }
    );
  doc.y += 6;
  rule(doc, PDF_PAGE.margin, doc.y, PDF_PAGE.content, PDF_COLORS.hairline);
  doc.y += 18;

  tracks.forEach((track, index) => {
    drawTrackRow(doc, index + 1, catalogTrackFields(track));
  });
}

type TrackFields = ReturnType<typeof catalogTrackFields>;

const LABEL_SPACING = 0.8;

/** Metadatos de la pista como lista etiqueta/valor, en orden de impresion. */
function trackMetaLines(fields: TrackFields): Array<[string, string]> {
  const lines: Array<[string, string]> = [];
  if (fields.daw !== "") lines.push(["DAW", fields.daw]);
  if (fields.key !== "") lines.push(["Tonalidad", fields.key]);
  if (fields.genre !== "") lines.push(["Género", fields.genre]);
  if (fields.bpm != null) lines.push(["BPM", String(fields.bpm)]);
  if (fields.topCountries !== "") lines.push(["Top países", fields.topCountries]);
  if (fields.links.length > 0) {
    lines.push(["Enlaces", fields.links.map((link) => `${link.label}: ${link.href}`).join("   ")]);
  }
  if (fields.hasStems) lines.push(["Stems", "Multicanal disponibles"]);
  if (fields.galleryCount > 0) {
    lines.push(["Galería", `${fields.galleryCount} ${fields.galleryCount === 1 ? "imagen" : "imágenes"}`]);
  }
  return lines;
}

/**
 * Alto que ocupara una ficha de pista COMPLETA, para reservarlo antes de
 * dibujarla.
 *
 * Sin esto una ficha se partia entre paginas: la cabecera ("02 SINGLE Se Va",
 * fecha, duracion y las tres metricas) se quedaba al pie de una pagina y sus
 * metadatos (DAW, TONALIDAD, ENLACES, LETRA) aparecian huérfanos en la
 * siguiente, sin nada que dijera a qué pista pertenecían. En un dossier de
 * prensa eso es directamente inutil: un第三人 no sabe qué está leyendo.
 *
 * Se replica aquí la aritmética de `drawTrackRow` sharing los mismos helpers,
 * y las lineas de metadatos salen de la MISMA función que las dibuja, para que
 * medir y dibujar no puedan divergir.
 */
function measureTrackEntry(doc: PdfDoc, fields: TrackFields): number {
  const width = PDF_PAGE.content;
  const gutter = 26;
  const dateWidth = 108;
  const titleWidth = width - gutter - dateWidth - 12;

  const title = pdfText(fields.title, "—");
  const titleHeight = measure(doc, title, titleWidth, 12.5, -1);
  const hasType = pdfText(fields.releaseType) !== "";

  // Cabecera + filete + margen hasta las metricas.
  let h = (hasType ? 11 : 0) + titleHeight + 8 + 1 + 12;

  const visibleStats = [fields.streams, fields.saves, fields.playlists].filter(
    (v) => pdfText(v) !== ""
  ).length;
  if (visibleStats > 0) h += 34 + 10 + 2;

  for (const [label, value] of trackMetaLines(fields)) {
    const labelWidth =
      doc
        .font(PDF_FONTS.serifBold)
        .fontSize(7.5)
        .widthOfString(`${pdfText(label).toUpperCase()}:`, { characterSpacing: LABEL_SPACING }) + 6;
    const valueHeight = measure(doc, pdfText(value), width - labelWidth, 9.5, 1.5);
    h += Math.max(valueHeight, 13) + 3;
  }

  if (fields.lyrics !== "") {
    h += 4 + 10 + 3;
    const full = measure(doc, pdfText(fields.lyrics), width, 9, 0);
    h += Math.min(full, lineHeight(doc, 9, 0) * LYRICS_MAX_LINES);
  }

  return h + 10 + 1 + 18;
}

function drawTrackRow(doc: PdfDoc, position: number, fields: TrackFields): void {
  const left = PDF_PAGE.margin;
  const width = PDF_PAGE.content;

  // Linea de cabecera de la pista: indice, tipo y titulo a la izquierda, fecha y
  // duracion a la derecha. Es la "linea por pista" de la tabla.
  const gutter = 26;
  const dateWidth = 108;
  const titleWidth = width - gutter - dateWidth - 12;
  const title = pdfText(fields.title, "—");
  const titleHeight = measure(doc, title, titleWidth, 12.5, -1);
  const hasType = pdfText(fields.releaseType) !== "";

  // Se reserva la ficha ENTERA, no solo la cabecera: ver `measureTrackEntry`.
  ensureSpace(doc, measureTrackEntry(doc, fields));
  const top = doc.y;

  doc
    .font(PDF_FONTS.serifBold)
    .fontSize(8)
    .fillColor(PDF_COLORS.muted)
    .text(String(position).padStart(2, "0"), left, top + 2, { width: gutter });

  if (hasType) {
    doc
      .font(PDF_FONTS.serifBold)
      .fontSize(7.5)
      .fillColor(PDF_COLORS.pink)
      .text(pdfText(fields.releaseType).toUpperCase(), left + gutter, top + 1, {
        width: titleWidth,
        characterSpacing: 1.1,
      });
  }

  doc
    .font(PDF_FONTS.serifBold)
    .fontSize(12.5)
    .fillColor(PDF_COLORS.ink)
    .text(title, left + gutter, top + (hasType ? 11 : 0), { width: titleWidth, lineGap: -1 });

  doc
    .font(PDF_FONTS.serif)
    .fontSize(9)
    .fillColor(PDF_COLORS.slate)
    .text(pdfText(fields.releaseDate), left + width - dateWidth, top + 2, { width: dateWidth, align: "right" });
  doc
    .font(PDF_FONTS.serifBold)
    .fontSize(10)
    .fillColor(PDF_COLORS.indigo)
    .text(pdfText(fields.duration), left + width - dateWidth, top + 16, { width: dateWidth, align: "right" });

  doc.y = top + (hasType ? 11 : 0) + titleHeight + 8;
  rule(doc, left, doc.y, width, PDF_COLORS.hairline);
  doc.y += 12;

  drawStats(doc, [
    { label: "Streams", value: fields.streams },
    { label: "Saves", value: fields.saves },
    { label: "Playlists", value: fields.playlists },
  ]);
  doc.y += 2;

  for (const [label, value] of trackMetaLines(fields)) drawMetaLine(doc, label, value);

  if (fields.lyrics !== "") {
    doc.y += 4;
    doc.font(PDF_FONTS.serifBold).fontSize(7.5).fillColor(PDF_COLORS.muted);
    doc.text("LETRA", PDF_PAGE.margin, doc.y, { width: PDF_PAGE.content, characterSpacing: 1 });
    doc.y += 3;
    drawParagraph(doc, fields.lyrics, 9, LYRICS_MAX_LINES);
  }

  doc.y += 10;
  rule(doc, PDF_PAGE.margin, doc.y, PDF_PAGE.content, PDF_COLORS.hairline);
  doc.y += 18;
}
