import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as exportPOST } from "@/app/api/export/route";

/**
 * B2 (Fase B del PLAN rc.29→rc.31) + P5/P6 (RC.31).
 *
 * Dos cosas se fijan aquí, y las dos se leen del fuente porque no hay DOM en este
 * entorno y porque lo que hay que verificar es exactamente qué líneas existen:
 *
 * 1. `DownloadCenter` NO vuelve a traer el botón "Actualizar datos del dossier",
 *    que era código muerto (`refreshDossier` solo incrementaba `dossierRevision`,
 *    cuyo atributo `data-dossier-revision` no leía nadie).
 * 2. Las descargas son UN componente: 3 secciones × 3 formatos. El widget está
 *    en `components/CatalogDownloadButton.tsx` y `DownloadCenter` lo monta. Las
 *    opciones ya no viven en `DownloadCenter`, así que las aserciones de ids
 *    también se movieron de fichero con el código: dejarlas donde el código ya no
 *    está las convertiría en un test que pasa siempre.
 */
const DOWNLOAD_CENTER_PATH = path.resolve(process.cwd(), "components/DownloadCenter.tsx");
const CATALOG_BUTTON_PATH = path.resolve(process.cwd(), "components/CatalogDownloadButton.tsx");
const rawSource = readFileSync(DOWNLOAD_CENTER_PATH, "utf8");
const rawGridSource = readFileSync(CATALOG_BUTTON_PATH, "utf8");

/**
 * Se eliminan los comentarios antes de assertar: el propio archivo documenta por
 * qué se borró el botón y nombra `refreshDossier`, `dossierRevision` y
 * `data-dossier-revision` en esa explicación. Sin filtrarlos, el test de
 * ausencia no distinguiría "el código volvió" de "el comentario se queda".
 *
 * Ojo: las aserciones positivas SÍ miran los comentarios, y para eso está
 * `rawSource`. Los literales de las aserciones negativas están en el cuerpo del
 * test, no en los comentarios del componente.
 */
const source = rawSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

const gridSource = rawGridSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

function post(body: unknown, ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost:3000/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("B2 — DownloadCenter sin botón de regenerar dossier", () => {
  it("no contiene el texto del botón eliminado", () => {
    expect(source).not.toContain("Actualizar datos del dossier");
  });

  it("no contiene el handler refreshDossier ni su estado dossierRevision", () => {
    expect(source).not.toContain("refreshDossier");
    expect(source).not.toContain("dossierRevision");
  });

  it("no expone el atributo data-dossier-revision que nadie leía", () => {
    expect(source).not.toContain("data-dossier-revision");
  });

  it("no expone el prop onSaved ni el useEffect vacío que lo consumía", () => {
    expect(source).not.toMatch(/onSaved/);
    expect(source).not.toMatch(/useEffect/);
  });

  it("documenta por qué se pudo borrar el botón", () => {
    // Esta aserción sí mira el comentario, no el código ejecutable. Se cambió
    // "no leia nadie" por "no leía nadie": el archivo está en UTF-8 y escribe la
    // tilde, y un literal sin ella solo pasaría por casualidad en una codificación
    // y no en la otra.
    expect(rawSource).toMatch(/no hay cache de/i);
    expect(rawSource).toMatch(/lib\/export-bundle\.ts/);
    expect(rawSource).toMatch(/no leía nadie/i);
  });
});

/**
 * P5/P6 — la redundancia que había aquí: `DownloadCenter` declaraba 5 opciones,
 * de las cuales `catalog-json` y `catalog-html` eran el MISMO
 * `include: ["catalog"]` con distinto `format`, y `press-pdf` (las 3 secciones
 * en PDF) solo aparecía cuando la rejilla 3×3 no cabía.
 */
describe("P5/P6 — las 3 secciones × 3 formatos viven en un solo componente", () => {
  it("DownloadCenter monta el grid y no vuelve a declarar opciones", () => {
    expect(source).toContain("DownloadGrid");
    // Si alguien reintroduce una lista de opciones aquí, el widget vuelve a
    // duplicar descargas y estas aserciones fallan.
    expect(source).not.toContain("DownloadOption");
    expect(source).not.toContain("handleDownload");
    expect(source).not.toContain("/api/export");
  });

  it("declara exactamente las 3 secciones, con sus ids de `include`", () => {
    expect(gridSource).toContain('id: "dossier"');
    expect(gridSource).toContain('id: "rider"');
    expect(gridSource).toContain('id: "catalog"');
    // Los ids antiguos eran 4 y dos de ellos eran el mismo `include`.
    expect(gridSource).not.toContain('id: "catalog-json"');
    expect(gridSource).not.toContain('id: "catalog-html"');
    expect(gridSource).not.toContain('id: "press-pdf"');
  });

  it("los tres formatos son botones, no badges", () => {
    for (const format of ["html", "json", "pdf"]) {
      expect(gridSource).toContain(`{ id: "${format}", label: "${format.toUpperCase()}" }`);
    }
    // El formato pasó a ser el botón: el badge decorativo se fue con él.
    expect(gridSource).not.toContain("badge");
    expect(gridSource).toContain("onClick={() => handleDownload(row, format.id)}");
  });

  it("los botones están centrados y el formato manda en el texto", () => {
    expect(gridSource).toContain("justify-center");
    expect(gridSource).toContain("text-center");
  });

  it("usa container query, no breakpoint de viewport", () => {
    // El componente se usa en una celda de 304-347px en /track/[id] mientras el
    // viewport puede medir 1440px: un `sm:grid-cols-*` partiría esa celda.
    // Medido en scripts/rc30-measure-ficha.ts, el arreglo de la container query
    // arregló 7 checks en 1024-1440px.
    expect(gridSource).toContain("[container-type:inline-size]");
    expect(gridSource).toContain("@container(min-width:30rem)");
    expect(gridSource).not.toMatch(/sm:grid-cols-/);
  });

  it("marca dossier y rider como secciones que exigen artist_id", () => {
    expect(gridSource).toMatch(/requiresArtist: true/);
    expect(gridSource).toMatch(/requiresArtist: false/);
    // Sin artist_id esas 6 celdas se degradan, no se pide y se recibe un 400.
    expect(gridSource).toContain("row.requiresArtist");
  });

  it("no promete portada en el catálogo ni métricas en el dossier", () => {
    // `catalogTrackFields` no tiene campo de portada y `catalogTrackHtml` no
    // renderiza ningún <img>; el dossier tampoco imprime métricas.
    expect(gridSource).not.toContain("con portada");
    expect(gridSource).not.toMatch(/dossier.*métricas/);
  });
});

describe("B2 — POST /api/export sigue respondiendo tras borrar el botón", () => {
  it("devuelve 200 con JSON y Content-Disposition para el catálogo público", async () => {
    const res = await exportPOST(post({ format: "json", include: ["catalog"] }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toMatch(/filename="PressPlay_Catalogo_[^"]+\.json"/);
  });

  it("devuelve 200 con HTML y nombre de catálogo (no EPK_Dossier) tras B4", async () => {
    const res = await exportPOST(post({ format: "html", include: ["catalog"] }, "203.0.113.2"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /filename="PressPlay_Catalogo_[^"]+\.html"/
    );
    expect(res.headers.get("Content-Disposition")).not.toContain("EPK_Dossier");

    const body = await res.text();
    expect(body).toContain("PressPlay &mdash; Catálogo");
    expect(body).not.toContain("<title>EPK Dossier de Prensa</title>");
  });

  it("sigue validando el cuerpo y rejecting combinaciones inválidas", async () => {
    const res = await exportPOST(post({ include: ["dossier"] }, "203.0.113.3"));
    // dossier sin artist_id es un error de negocio, no un 500.
    expect(res.status).toBe(400);
  });
});
