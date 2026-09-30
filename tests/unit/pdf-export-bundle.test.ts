import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildExportBundle, type ExportBundle } from "@/lib/export-bundle";
import { POST as exportPOST } from "@/app/api/export/route";
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
  const { PDF_ARTIST_ID: id, pdfTrack, pdfDossier } = await import("./pdf-fixtures");
  return {
    getArtistById: vi.fn(async (artistId: string) =>
      artistId === id
        ? { id: artistId, name: "Ñandú", genre: "Art Pop", location: "Valencia, Venezuela" }
        : null
    ),
    getDossierByArtistId: vi.fn(async () => pdfDossier),
    getTracksByArtist: vi.fn(async () => [pdfTrack]),
    getAllTracks: vi.fn(async () => [pdfTrack]),
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
