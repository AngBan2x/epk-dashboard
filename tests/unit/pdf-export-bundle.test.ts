import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildExportBundle, type ExportBundle } from "@/lib/export-bundle";
import { POST as exportPOST } from "@/app/api/export/route";
import { extractPdfPagesFlat } from "@/tests/helpers/pdf-text";
import { PDF_ARTIST_ID } from "@/tests/unit/pdf-fixtures";

/**
 * B5 — orquestacion (`buildExportBundle`) y capa HTTP (`POST /api/export`) del
 * PDF, en un solo fichero y con un solo PDF por test.
 *
 * `@/lib/db` va mockeado por dos razones. Una: las aserciones no dependen de lo
 * que haya en el catalogo. Dos —la importante—: un worker de vitest que carga
 * better-sqlite3 *y* genera un PDF con la TTF incrustada (pdfkit la comprime
 * con zlib) hace que Node 24.19 aborte al desmontar el isolate con
 * `RemoveEnvironmentCleanupHook: Assertion failed: (env) != nullptr`, y el
 * fichero entero se reporta como fallido aunque todos sus tests pasen. Sin base
 * de datos real en el proceso, el aborto no aparece.
 */
vi.mock("@/lib/db", async () => {
  const { PDF_ARTIST_ID: id, pdfTrack, pdfAlbum, pdfDossier } = await import("./pdf-fixtures");
  return {
    getArtistById: vi.fn(async (artistId: string) =>
      artistId === id
        ? { id: artistId, name: "Ñandú", genre: "Art Pop", location: "Valencia, Venezuela" }
        : null
    ),
    getDossierByArtistId: vi.fn(async () => pdfDossier),
    getTracksByArtist: vi.fn(async () => [pdfTrack, ...pdfAlbum]),
    getAllTracks: vi.fn(async () => [pdfTrack, ...pdfAlbum]),
  };
});

function expectPdf(pdf: Buffer): void {
  expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(pdf.subarray(-6).toString("latin1").trim()).toBe("%%EOF");
  expect(pdf.length).toBeGreaterThan(5_000);
}

function post(body: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("buildExportBundle con format pdf", () => {
  let conArtista: ExportBundle;

  beforeAll(async () => {
    conArtista = await buildExportBundle({ format: "pdf", artistId: PDF_ARTIST_ID });
  });

  it("devuelve contentType application/pdf, nombre .pdf y un PDF real en el body", () => {
    expect(conArtista.contentType).toBe("application/pdf");
    expect(conArtista.filename).toMatch(/^PressPlay_.*\.pdf$/);
    expect(Buffer.isBuffer(conArtista.body)).toBe(true);
    expectPdf(conArtista.body as Buffer);
  });

  it("llama al archivo segun la seccion pedida", async () => {
    const rider = await buildExportBundle({
      format: "pdf",
      artistId: PDF_ARTIST_ID,
      include: ["rider"],
    });
    expect(rider.filename).toMatch(/^PressPlay_Rider_Tecnico_.*\.pdf$/);

    const dossier = await buildExportBundle({
      format: "pdf",
      artistId: PDF_ARTIST_ID,
      include: ["dossier"],
    });
    expect(dossier.filename).toMatch(/^PressPlay_Dossier_.*\.pdf$/);
  });

  it("funciona sin artist_id porque el catalogo es la seccion por defecto", async () => {
    const publico = await buildExportBundle({ format: "pdf" });

    expect(publico.contentType).toBe("application/pdf");
    expect(publico.filename).toMatch(/^PressPlay_Catalogo_.*\.pdf$/);
    expectPdf(publico.body as Buffer);
  });

  it("sigue rechazando dossier y rider sin artist_id", async () => {
    await expect(buildExportBundle({ format: "pdf", include: ["dossier"] })).rejects.toThrow(
      /requieren artist_id/
    );
    await expect(buildExportBundle({ format: "pdf", include: ["rider"] })).rejects.toThrow(
      /requieren artist_id/
    );
  });

  it("sigue devolviendo 404 si el artist_id no existe", async () => {
    await expect(
      buildExportBundle({ format: "pdf", artistId: "no-existe-este-artista" })
    ).rejects.toThrow(/no encontrado/);
  });

  it("no rompe los formatos anteriores al anadir pdf", async () => {
    const json = await buildExportBundle({ format: "json", artistId: PDF_ARTIST_ID });
    expect(json.contentType).toContain("application/json");
    expect(typeof json.body).toBe("string");
    expect(json.filename).toMatch(/\.json$/);

    const html = await buildExportBundle({ format: "html", artistId: PDF_ARTIST_ID });
    expect(html.contentType).toContain("text/html");
    expect(typeof html.body).toBe("string");
    expect(html.filename).toMatch(/\.html$/);
  });
});

describe("POST /api/export con format pdf", () => {
  let res: Response;

  beforeAll(async () => {
    res = await exportPOST(post({ format: "pdf", include: ["catalog"] }, "203.0.113.40"));
  });

  it("devuelve 200 con application/pdf, nombre .pdf y Cache-Control", () => {
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /filename="PressPlay_Catalogo_[^"]+\.pdf"/
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("el cuerpo de la respuesta es un PDF real", async () => {
    expectPdf(Buffer.from(await res.arrayBuffer()));
  });

  it("rechaza un format que no existe con 400 y mensaje actualizado", async () => {
    const bad = await exportPOST(post({ format: "docx" }, "203.0.113.41"));

    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error?: string };
    expect(body.error).toContain("pdf");
  });

  it("sigue aceptando html y json", async () => {
    const html = await exportPOST(post({ format: "html", include: ["catalog"] }, "203.0.113.42"));
    expect(html.status).toBe(200);
    expect(html.headers.get("Content-Type")).toContain("text/html");

    const json = await exportPOST(post({ format: "json", include: ["catalog"] }, "203.0.113.43"));
    expect(json.status).toBe(200);
    expect(json.headers.get("Content-Type")).toContain("application/json");
  });
});

/**
 * GAP-A — `trackToJson` emitía 20 claves y ninguna decía a qué álbum pertenecía
 * una pista. En un export legible por máquina eso no es un detalle: sin
 * `release_id` no se puede reconstruir un tracklist, y sin `disc_number`/
 * `track_number` tampoco el de un multidisco.
 *
 * La forma se asserta como CONJUNTO DE CLAVES, no campo a campo: si alguien
 * quita `release_id`, la aserción de "está presente" falla, pero una que solo
 * mirara el valor (`null` cuando no hay dato) seguiría pasando.
 */
describe("GAP-A — el catálogo JSON dice a qué release pertenece cada pista", () => {
  let tracks: Array<Record<string, unknown>>;

  beforeAll(async () => {
    const res = await exportPOST(post({ format: "json", include: ["catalog"] }, "203.0.113.50"));
    expect(res.status).toBe(200);
    const document = (await res.json()) as { catalog: { tracks: Array<Record<string, unknown>> } };
    tracks = document.catalog.tracks;
  });

  it("cada pista trae release_id, disc_number y track_number", () => {
    const albumChild = tracks.find((t) => t.id === "track-fixture-album-1");
    const albumParent = tracks.find((t) => t.id === "track-fixture-album");
    expect(albumChild).toBeDefined();
    expect(albumParent).toBeDefined();

    expect(albumChild!.release_id).toBe("track-fixture-album");
    expect(albumChild!.disc_number).toBe(1);
    expect(albumChild!.track_number).toBe(1);

    // El padre: sin release al que pertenecer, y el número de pista es null, no
    // 0 — un 0 sería un dato falso ("pista 0").
    expect(albumParent!.release_id).toBeNull();
    expect(albumParent!.track_number).toBeNull();
  });

  it("las claves existen aunque el valor sea null (no desaparecen del objeto)", () => {
    for (const track of tracks) {
      expect(Object.prototype.hasOwnProperty.call(track, "release_id")).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(track, "disc_number")).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(track, "track_number")).toBe(true);
    }
    // `pdfTrack` no declara `disc_number`, así que sale `null`. Lo que se fija
    // es el contrato: sin dato es `null`, NUNCA 0 — un 0 se lee como "disco 0" o
    // "pista 0", que es un dato falso, mientras que `null` se lee como "no lo
    // hay". Por eso el JSON emite `?? null` y no `safeNumber(...)`.
    const single = tracks.find((t) => t.id === "track-fixture-1")!;
    expect(single.release_id).toBeNull();
    expect(single.disc_number).toBeNull();
    expect(single.disc_number).not.toBe(0);
  });
});

/**
 * P15 — los 9 padres del catálogo semilla traen `duration = "00:00"` porque son
 * la fila agrupadora del release, y ese literal se imprimía en los TRES formatos
 * de prensa. Aquí se comprueba que los tres dicen lo mismo, y que lo que dicen es
 * la suma real de las hijas.
 */
describe("P15 — la duración del release sale de sus hijas en los 3 formatos", () => {
  // 3:45 (225 s) + 6:07 (367 s) = 592 s = "9:52".
  const ESPERADA = "9:52";

  it("JSON: el padre imprime la suma, no su \"00:00\"", async () => {
    const bundle = await buildExportBundle({
      format: "json",
      artistId: PDF_ARTIST_ID,
      include: ["catalog"],
    });
    const document = JSON.parse(bundle.body as string) as {
      catalog: { tracks: Array<{ id: string; duration: string }> };
    };
    const parent = document.catalog.tracks.find((t) => t.id === "track-fixture-album");
    expect(parent!.duration).toBe(ESPERADA);
    expect(parent!.duration).not.toBe("00:00");
  });

  it("HTML: el padre imprime la misma suma que el JSON", async () => {
    const bundle = await buildExportBundle({
      format: "html",
      artistId: PDF_ARTIST_ID,
      include: ["catalog"],
    });
    const html = bundle.body as string;
    expect(html).toContain(ESPERADA);
    expect(html).not.toContain("00:00");
    // El formato es `M:SS`, como las hijas: `09:52` al lado de `3:45` se leía
    // como un dato de otra naturaleza.
    expect(html).not.toContain("09:52");
  });

  it("PDF: el padre imprime la misma suma, y se lee del texto del PDF", async () => {
    const bundle = await buildExportBundle({
      format: "pdf",
      artistId: PDF_ARTIST_ID,
      include: ["catalog"],
    });
    const pages = extractPdfPagesFlat(bundle.body as Buffer);
    expect(pages.length).toBeGreaterThan(0);

    const rendered = pages.join("\n");
    const albumPage = pages.find((page) => page.includes("Cielo Roto"));
    expect(albumPage).toBeDefined();
    // Sin `extractPdfPages` esto no se podría afirmar: el texto del PDF va en
    // flujos comprimidos con codificacion Identity-H.
    expect(rendered).toContain(ESPERADA);
    expect(rendered).not.toContain("00:00");
  });

  it("las hijas conservan su propia duración: no se suman entre sí", async () => {
    const bundle = await buildExportBundle({
      format: "json",
      artistId: PDF_ARTIST_ID,
      include: ["catalog"],
    });
    const document = JSON.parse(bundle.body as string) as {
      catalog: { tracks: Array<{ id: string; duration: string }> };
    };
    const durations = new Map(document.catalog.tracks.map((t) => [t.id, t.duration]));

    expect(durations.get("track-fixture-album-1")).toBe("3:45");
    expect(durations.get("track-fixture-album-2")).toBe("6:07");
    expect(durations.get("track-fixture-1")).toBe("3:42");
  });
});
