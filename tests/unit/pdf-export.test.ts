import { describe, it, expect, beforeAll } from "vitest";
import { buildPressPdf } from "@/lib/pdf";
import { pdfText } from "@/lib/pdf/pdf-text";
import { PDF_SECTION_TITLES } from "@/lib/pdf/theme";
import {
  filterPublicTracks,
  resolveDefaultSections,
  type ExportPayload,
} from "@/lib/downloadable-assets";
import type { Track } from "@/types/music";

/**
 * B5 — exportacion a PDF real con pdfkit.
 *
 * El texto del PDF va en flujos comprimidos con codificacion Identity-H, asi que
 * no se puede assertar sobre el. Lo observable desde fuera es la estructura: la
 * cabecera `%PDF-`, el numero de paginas (cada seccion arranca en pagina nueva,
 * mas la portada) y la presencia de `/FontFile2`, que es la prueba de que las TTF
 * van incrustadas y no se estan usando los Helvetica WinAnsi de PDFKit.
 *
 * Los PDF se generan una vez por escenario y se reutilizan entre aserciones:
 * cada generacion reanaliza las dos TTF con fontkit y sinteriza un subconjunto,
 * y unas cuantas docenas en el mismo worker cargan el proceso hasta que Node
 * aborta al desmontar el isolate.
 */

function countPages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

function makeTrack(over: Partial<Track> = {}): Track {
  return {
    id: "pdf-track-1",
    title: "Amanecer",
    artist_name: "Amanece",
    release_type: "Single",
    release_date: "2026-01-15",
    duration: "3:42",
    cover_image: "",
    audio_preview_url: "",
    spotify_url: "https://open.spotify.com/track/abc123",
    youtube_video_id: null,
    metrics: { streams: 128453, saves: 9120, playlist_additions: 340, top_countries: [] },
    production_details: {
      daw: "Ableton Live 12",
      guitars: null,
      effects_chain: null,
      tuning: null,
      key: "D minor",
      genre: "Art Pop",
      bpm: 118,
    },
    lyrics: null,
    status: "approved",
    ...over,
  } as Track;
}

function makePayload(over: Partial<ExportPayload> = {}): ExportPayload {
  return {
    artistName: "Amanece",
    artistId: "art-test-pdf",
    genre: "Art Pop",
    location: "Valencia, Venezuela",
    tracks: filterPublicTracks([makeTrack()]),
    generatedAt: new Date("2026-03-04T12:00:00Z"),
    ...over,
  };
}

function expectPdf(pdf: Buffer): void {
  expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(pdf.subarray(-6).toString("latin1").trim()).toBe("%%EOF");
  // Por debajo de 2 KB seria un PDF vacio; una portada con las fuentes
  // incrustadas ocupa bastante mas.
  expect(pdf.length).toBeGreaterThan(5_000);
}

describe("pdfText — acentos y caracteres no soportados", () => {
  it("conserva el castellano acentuado y la enye", () => {
    expect(pdfText("Amanece: Niño, Muñoz, ¿Sí? ¡Vamos!")).toBe("Amanece: Niño, Muñoz, ¿Sí? ¡Vamos!");
  });

  it("conserva la tipografia castellana (comillas angulares, raya y punto medio)", () => {
    expect(pdfText("«Así» — de 15.000 € · 50%")).toBe("«Así» — de 15.000 € · 50%");
  });

  it("normaliza a NFC para no perder el acento de una forma descompuesta", () => {
    // "o" + diaeresis combinante: es como queda el nombre si alguien lo guardo
    // desde un editor antiguo. Sin NFC el diacritico se descartaria.
    const decomposed = "Bjo\u0308rk";
    expect(decomposed).not.toBe("Björk");
    expect(pdfText(decomposed)).toBe("Björk");
  });

  it("transcribe las flechas y los checks, que las fuentes no tienen", () => {
    expect(pdfText("A → B")).toBe("A -> B");
    expect(pdfText("stems ✅ listos")).toBe("stems OK listos");
  });

  it("descarta emoji y alfabetos sin cobertura en vez de fallar", () => {
    expect(() => pdfText("🎵 Moscow 東京")).not.toThrow();
    expect(pdfText("🎵 Moscow 東京")).toBe("Moscow");
  });

  it("conserva los saltos de linea y convierte los tabuladores", () => {
    expect(pdfText("uno\ndos\ttres")).toBe("uno\ndos tres");
  });

  it("normaliza CRLF y recorta", () => {
    expect(pdfText("  uno\r\ndos  ")).toBe("uno\ndos");
  });

  it("acepta numeros, cadena vacia y valores no textuales", () => {
    expect(pdfText(12000)).toBe("12000");
    expect(pdfText("")).toBe("");
    expect(pdfText(null)).toBe("");
    expect(pdfText(undefined, "-")).toBe("-");
  });
});

describe("buildPressPdf", () => {
  let pdf: Buffer;
  let rider: Buffer;
  let dosSecciones: Buffer;
  let tresSecciones: Buffer;

  beforeAll(async () => {
    // Secuencial y no con Promise.all: cuatro documentos de tres secciones a la
    // vez multiplican la memoria y el trabajo de zlib de este worker, y eso
    // dispara el aborto nativo de Node 24.19 al desmontar el isolate.
    pdf = await buildPressPdf(makePayload(), ["catalog"]);
    rider = await buildPressPdf(makePayload(), ["rider", "rider"]);
    dosSecciones = await buildPressPdf(makePayload(), ["dossier", "rider"]);
    tresSecciones = await buildPressPdf(makePayload(), ["dossier", "rider", "catalog"]);
  });

  it("devuelve un PDF valido y con tamano razonable", () => {
    expectPdf(pdf);
  });

  it("incrusta la TTF en vez de usar los Helvetica WinAnsi de PDFKit", () => {
    // /FontFile2 es el programa de la fuente TrueType incrustada. Sin esto, los
    // acentos se perderian en silencio porque PDFKit no lanza ante un glifo
    // ausente: dibuja .notdef.
    expect(pdf.toString("latin1")).toContain("/FontFile2");
  });

  it("una seccion genera portada + esa seccion, y las repetidas no duplican paginas", () => {
    expect(countPages(rider)).toBe(2);
  });

  it("con dos secciones el PDF contiene las dos: portada + dossier + rider", () => {
    expect(countPages(dosSecciones)).toBe(3);
  });

  it("con tres secciones sale una pagina mas que con dos", () => {
    expect(countPages(tresSecciones)).toBe(countPages(dosSecciones) + 1);
    expect(countPages(tresSecciones)).toBe(4);
  });

  it("no rompe con acentos, enye y emoji en nombre, dossier, rider y catalogo", async () => {
    expectPdf(
      await buildPressPdf(
        makePayload({
          artistName: "Ñandú 🎵",
          genre: "Art Pop",
          location: "Reikjavík",
          dossier: {
            biography: "Biografía con eñes, acentos y signos: ¿qué? ¡sí!",
            press_text: "Texto de «prensa» → con flecha 🎵",
            influences: "Måneskin, Björk, Ñandú",
            contact_email: "prensa@nandú.test",
            management: "Gestión Añil",
            website: "https://nandu.test",
            rider_special_notes: "Sin pirotecnia → 100% 🔥",
          },
          tracks: filterPublicTracks([
            makeTrack({ title: "Érase una vez → 🎵", lyrics: "Línea con ñ\nSegunda línea con á é í ó ú" }),
          ]),
        }),
        ["dossier", "rider", "catalog"]
      )
    );
  });

  it("genera un PDF aunque el catalogo este vacio", async () => {
    const vacio = await buildPressPdf(makePayload({ tracks: [] }), ["catalog"]);
    expectPdf(vacio);
    expect(countPages(vacio)).toBe(2);
  });

  it("genera un PDF aunque el payload venga sin dossier ni tracks", async () => {
    expectPdf(
      await buildPressPdf(
        { artistName: "Sin datos", generatedAt: new Date("2026-01-01T00:00:00Z") },
        ["dossier", "rider", "catalog"]
      )
    );
  });
});

describe("resolveDefaultSections con pdf", () => {
  it("usa el catalogo, la unica seccion que no necesita artist_id", () => {
    expect(resolveDefaultSections("pdf")).toEqual(["catalog"]);
  });
});

describe("PDF_SECTION_TITLES", () => {
  it("cubre las tres secciones con el castellano acentuado", () => {
    expect(PDF_SECTION_TITLES).toEqual({
      dossier: "Dossier de prensa",
      rider: "Rider técnico",
      catalog: "Catálogo",
    });
  });
});

