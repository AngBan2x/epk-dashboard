/**
 * El PDF no puede depender de las fuentes estandar de pdfkit.
 *
 * Por que: el constructor de PDFKit hace `initFonts(options.font)`, y `initFonts`
 * llama a `this.font(defaultFont)` con default `'Helvetica'`, que acaba en un
 * `require('#standard-fonts/Helvetica')` DINAMICO. El tracer de Next no ve un
 * require dinamico, asi que `js/standard-fonts/` no viaja al bundle de la funcion
 * de Vercel y el PDF revienta en produccion con:
 *
 *   Cannot find module '/var/task/.../pdfkit/js/standard-fonts/Helvetica.cjs'
 *
 * En local nunca se ve, porque ahi `node_modules` esta completo. Es el peor tipo
 * de fallo: verde en local, 500 en produccion, sin forma de reproducirlo antes
 * de desplegar.
 *
 * La unica forma de llevar esas fuentes era `outputFileTracingIncludes`, pero
 * con pnpm cualquier glob a `node_modules` rompe el despliegue ("the framework
 * produced an invalid deployment package ... symlinked directories"). Asi que la
 * solucion no es llevarlas: es no necesitarlas. `lib/pdf/index.ts` pasa
 * `font: null` y el constructor se salta la fuente por defecto.
 *
 * Este test falla si alguien quita ese `font: null` o toca el constructor.
 */
import Module from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { buildPressPdf } from "@/lib/pdf";
import { pdfDossier, pdfTrack, PDF_ARTIST_ID } from "./pdf-fixtures";

type Loader = (request: string, ...rest: unknown[]) => unknown;

const mod = Module as unknown as { _load: Loader };
let original: Loader | null = null;

afterEach(() => {
  if (original) mod._load = original;
  original = null;
});

/** Genera un PDF registrando cualquier require de `standard-fonts`. */
async function standardFontsRequested(): Promise<string[]> {
  const seen: string[] = [];
  original = mod._load;
  const base = original;
  mod._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request.includes("standard-fonts")) seen.push(request);
    return base.call(this, request, ...rest);
  };
  await buildPressPdf(
    {
      artistName: "Artista Fuentes",
      artistId: PDF_ARTIST_ID,
      tracks: [pdfTrack],
      dossier: pdfDossier,
    },
    ["dossier", "rider", "catalog"]
  );
  return seen;
}

describe("fuentes del PDF", () => {
  it("no carga ninguna fuente estandar de pdfkit", async () => {
    const seen = await standardFontsRequested();
    expect(seen).toEqual([]);
  });

  it("sigue generando un PDF valido con las Noto Serif incrustadas", async () => {
    const pdf = await buildPressPdf(
      { artistName: "Björk", artistId: PDF_ARTIST_ID, tracks: [pdfTrack], dossier: pdfDossier },
      ["catalog"]
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Las Noto Serif van incrustadas: si desaparecieran, el PDF saldria con
    // Helvetica y perderia los acentos.
    expect(pdf.toString("latin1")).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+NotoSerif/);
  });
});
