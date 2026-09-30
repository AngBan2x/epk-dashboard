/**
 * Bloquea dos defectos de maquetacion del PDF que los tests de bytes no ven.
 *
 * 1. Ficha de pista partida entre paginas. Pasaba de verdad: la cabecera
 *    ("02 SINGLE Se Va", fecha, duracion, metricas) se quedaba al pie de una
 *    pagina y sus metadatos (DAW, TONALIDAD, ENLACES, LETRA) aparecian
 *    huerfanos en la siguiente, sin nada que dijera a que pista pertenecian.
 *    El PDF era valido, tenia el tamano correcto y las fuentes bien
 *    incrustadas: solo se nota leyendo el texto.
 *
 * 2. Numeracion de pie de pagina incorrecta (`index + 1` mal calculado).
 *    unpDF totalmente valido tambien.
 */
import { describe, expect, it } from "vitest";
import { buildPressPdf } from "@/lib/pdf";
import { extractPdfPagesFlat } from "../helpers/pdf-text";
import { pdfDossier, pdfTrack, PDF_ARTIST_ID, makeManyTracks } from "./pdf-fixtures";

/**
 * Una pagina no debe EMPEZAR por un metadato suelto: si empieza asi, la ficha
 * se partio. Se permiten cabeceras legitimas (seccion, ficha de pista, rider).
 */
const ORPHAN_START =
  /^(DAW|TONALIDAD|G[EÉ]NERO|BPM|STREAMS|SAVES|PLAYLISTS|ENLACES|LETRA|STEMS|GALER[IÍ]A|TOP PA[IÍ]SES)\b/;

function trackWithLyrics(i: number) {
  return {
    ...pdfTrack,
    id: `${PDF_ARTIST_ID}-t${i}`,
    title: `Pista de prueba numero ${i}`,
    lyrics: Array.from({ length: 14 }, (_, n) => `Linea ${n + 1} de la letra de la pista ${i}`).join("\n"),
  };
}

describe("maquetacion del PDF", () => {
  it("ninguna ficha de pista queda partida entre dos paginas", async () => {
    const tracks = [1, 2, 3, 4, 5, 6].map(trackWithLyrics);
    const pdf = await buildPressPdf(
      { artistName: "Artista Maquetacion", artistId: PDF_ARTIST_ID, tracks, dossier: pdfDossier },
      ["catalog"]
    );
    const pages = extractPdfPagesFlat(pdf);

    expect(pages.length).toBeGreaterThan(1);

    const offenders = pages
      .map((text, i) => ({ page: i + 1, text }))
      .filter(({ text }) => ORPHAN_START.test(text));

    expect(
      offenders.map((o) => `p${o.page}: ${o.text.slice(0, 60)}`)
    ).toEqual([]);
  });

  it("el pie de pagina numera todas las hojas correctamente", async () => {
    const tracks = [1, 2, 3, 4, 5, 6].map(trackWithLyrics);
    const pdf = await buildPressPdf(
      { artistName: "Artista Maquetacion", artistId: PDF_ARTIST_ID, tracks, dossier: pdfDossier },
      ["catalog"]
    );
    const pages = extractPdfPagesFlat(pdf);
    const total = pages.length;

    const footers = pages
      .map((text, i) => ({ page: i + 1, match: text.match(/(\d+)\s*\/\s*(\d+)\s*$/) }))
      .filter((f) => f.match !== null);

    // La portada lleva su propio bloque de identidad y no un pie numerado.
    expect(footers.length).toBe(total - 1);
    // Se comparan los numeros, no la cadena: el extractor pierde los espacios
    // que PDFKit codifica como ajuste de kerning en vez de como glifo, asi que
    // "2 / 7" llega como "2/7". El espacio existe en el PDF; es el extractor el
    // que no lo ve.
    for (const f of footers) {
      expect(`p${f.page}: actual=${f.match?.[1]}/${f.match?.[2]}`).toBe(
        `p${f.page}: actual=${f.page}/${total}`
      );
    }
  });

  it("con muchas pistas cortas no aparecen paginas en blanco", async () => {
    const tracks = makeManyTracks(14).map((t) => ({ ...t, lyrics: "Coro: una linea" }));
    const pdf = await buildPressPdf(
      { artistName: "Artista Maquetacion", artistId: PDF_ARTIST_ID, tracks, dossier: pdfDossier },
      ["catalog"]
    );
    const pages = extractPdfPagesFlat(pdf);
    const vacias = pages.filter((p) => p.length < 12);
    // Solo se tolera la portada, que es un bloque fijo de identidad.
    expect(vacias.length).toBeLessThanOrEqual(1);
  });
});
