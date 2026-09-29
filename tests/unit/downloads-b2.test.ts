import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as exportPOST } from "@/app/api/export/route";

/**
 * Regresión de B2 (Fase B del PLAN rc.29→rc.31).
 *
 * Se borró el botón "Actualizar datos del dossier" de `DownloadCenter` por ser
 * código muerto: `refreshDossier` descartaba la respuesta y solo incrementaba
 * `dossierRevision`, cuyo atributo `data-dossier-revision` no leía nadie.
 *
 * El test falla si alguien reintroduce el botón, el handler, el estado, el
 * atributo o el prop `onSaved` que solo existían para alimentar ese contador.
 * Se lee el fuente porque no hay DOM en este entorno de pruebas, y porque lo que
 * hay que verificar es exactamente la ausencia de esa línea de código.
 */
const DOWNLOAD_CENTER_PATH = path.resolve(process.cwd(), "components/DownloadCenter.tsx");
const rawSource = readFileSync(DOWNLOAD_CENTER_PATH, "utf8");

/**
 * Se eliminan los comentarios antes de assertar: el propio archivo documenta por
 * qué se borró el botón y nombra `refreshDossier`, `dossierRevision` y
 * `data-dossier-revision` en esa explicación. Sin filtrarlos, el test de
 * ausencia no distinguiría "el código volvió" de "el comentario se queda".
 */
const source = rawSource
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

  it("mantiene las 4 opciones de descarga reales", () => {
    // El botón muerto era el 5º control; los 4 que quedan deben sobrevivir a B2.
    expect(source).toContain('id: "dossier"');
    expect(source).toContain('id: "rider"');
    expect(source).toContain('id: "catalog-json"');
    expect(source).toContain('id: "catalog-html"');
    expect(source).toContain('onClick={() => handleDownload(option)}');
  });

  it("documenta por qué se pudo borrar el botón", () => {
    // Esta aserción sí mira el comentario, no el código ejecutable.
    expect(rawSource).toMatch(/no hay cache de/i);
    expect(rawSource).toMatch(/lib\/export-bundle\.ts/);
    expect(rawSource).toMatch(/no leia nadie/i);
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
