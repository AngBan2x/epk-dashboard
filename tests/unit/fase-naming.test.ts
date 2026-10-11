import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/**
 * La palabra es "Fase", y solo "Fase".
 *
 * ## Por que hay un test para una convencion de prosa
 *
 * Porque una convencion que no ata nadie se pierde en dos meses. No es un
 * capricho de redaccion: el 2026-09-20 (commit `65681ed`, rc.20) se escribieron
 * dos titulos en ingles dentro de un log que por lo demas es castellano
 * (`## rc.20 - Bug Fixes + Phase P Verification` y `### Phase P Verification`),
 * y desde entonces la palabra se fue colando. El usuario lo|reporto en 2026-10-06
 * y la correccion fue en sentido inverso al que haria pensar el nombre de los
 * ficheros.
 *
 * ## Lo que NO se toca, y por que este test lo respeta
 *
 * `PHASE_P3.md` ... `PHASE_P10.md` y `docs/PHASES.md` siguen con "PHASE" en el
 * **nombre**, y las referencias a esos ficheros (~30 en la prosa) tambien. Es
 * lo que impide esto:
 *
 * - Renombrar los ficheros rompe los enlaces que los apuntan, y contradice el
 *   "ninguno de estos seis documentos se modifica sin motivo" de `PHASES.md` y
 *   el "no las renumeres" de `AGENTS.md`.
 * - `tests/e2e/phase-n-*.spec.ts` son nombres de test, no prosa.
 *
 * ## La trampa del propio test
 *
 * Un `expect(text).not.toContain("Phase")` a pelo **no sirve**: los ~30 enlaces
 * a `PHASE_P*.md` y las 6 rutas `phase-n-*.spec.ts` contienen la palabra, asi que
 * el test se pondria rojo con el repo entero en su estado correcto. Por eso se
 * filtra la prosa antes de mirar. Es la misma trampa de la que avisa
 * `AI_LOG.test.ts` con `not.toContain` contando comentarios: **un check que
 * siempre pasa no protege de nada, y uno que siempre falla hace cryo.**
 */

/** Rutas cuyo nombre lleva "PHASE" y que por eso quedan fuera de la prosa. */
const ES_NOMBRE_DE_FICHERO =
  /PHASE_P[\d~]|PHASES\.md|phase-n-[\w-]+\.spec\.ts|rewrite-invalid-path/;

/** Docs que se examinan. El codigo de aplicacion no se escanea. */
const RAICES = ["docs", ".opencode", "MASTER_PLAN.md", "README.md", "AGENTS.md"];

/** Titulo de un commit citado textualmente en el log. */
const CITA_DE_COMMIT = /^- `e1a7baf` — feat\(P1\.8\): setup Phase P Professional/;

function ficherosMarkdown(raiz: string): string[] {
  const absoluto = path.resolve(process.cwd(), raiz);
  let stats;
  try {
    stats = statSync(absoluto);
  } catch {
    return [];
  }
  if (stats.isFile()) return [raiz];
  if (!stats.isDirectory()) return [];

  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      // `node_modules` y artefactos no se examinan; aqui no hay, pero el filtro
      // evita que un futurodirectorio los traiga al test.
      if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(completa);
      else if (entrada.name.endsWith(".md")) salida.push(completa);
    }
  };
  recorrer(absoluto);
  return salida;
}

describe("Fase, no Phase", () => {
  const ficheros = RAICES.flatMap(ficherosMarkdown);

  it("hay docs que examinar (el test no pasa por estar vacio)", () => {
    expect(ficheros.length).toBeGreaterThan(20);
  });

  it("ninguna prosa usa 'Phase' para nombrar una fase", () => {
    const ofensores: string[] = [];

    for (const fichero of ficheros) {
      const lineas = readFileSync(fichero, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        // Una referencia a un fichero, un nombre de test, o la cita literal de
        // un subject de commit, no son prosa.
        if (ES_NOMBRE_DE_FICHERO.test(linea)) return;
        if (CITA_DE_COMMIT.test(linea.trim())) return;
        if (!/\bPhase\b|\bphases\b/.test(linea)) return;
        ofensores.push(
          `${path.relative(process.cwd(), fichero)}:${i + 1}  ${linea.trim().slice(0, 90)}`,
        );
      });
    }

    expect(ofensores).toEqual([]);
  });

  it("los titulos de todos los documentos de fase dicen FASE", () => {
    // La lista se **deriva** de los ficheros que existen, no está escrita a mano.
    // Estaba hardcodeada a P3–P10, así que P11 (que se creó anidada dentro de
    // PHASE_P3.md) y P12 quedaban fuera de la comprobación sin que nadie lo
    // notara: era la única puerta que vigila la convención, y no los veía.
    const docs = readdirSync(path.resolve(process.cwd(), "docs"))
      .filter((f) => /^PHASE_P\d+\.md$/.test(f))
      .sort();

    expect(docs.length).toBeGreaterThanOrEqual(10);

    for (const fichero of docs) {
      const fase = fichero.match(/PHASE_(P\d+)\.md/)![1];
      const primera = readFileSync(path.resolve(process.cwd(), "docs", fichero), "utf8")
        .split("\n")[0];
      expect(primera.startsWith(`# FASE ${fase}`), `${fichero}: «${primera}»`).toBe(true);
    }
  });

  it("toda fase del indice tiene documento, y todo documento esta en el indice", () => {
    // El otro lado del mismo problema: `docs/PHASES.md` se define a sí mismo como
    // «un índice, no un plan» que «solo dice dónde está cada uno y qué estado
    // tiene». P11 estuvo fuera del índice una ronda entera sin que la puerta
    // dijera nada, porque solo miraba una dirección.
    const indice = readFileSync(path.resolve(process.cwd(), "docs", "PHASES.md"), "utf8");
    const docs = readdirSync(path.resolve(process.cwd(), "docs")).filter((f) =>
      /^PHASE_P\d+\.md$/.test(f)
    );

    for (const fichero of docs) {
      const fase = fichero.match(/PHASE_(P\d+)\.md/)![1];
      expect(indice, `${fichero} no aparece en docs/PHASES.md`).toContain(fichero);
      // Y que la fila exista de verdad, no solo el nombre en prosa.
      expect(indice, `${fichero} no tiene fila en la tabla del índice`).toMatch(
        new RegExp(`\\|\\s*\\**${fase}\\**\\s*\\|`)
      );
    }
  });

  it("la plantilla de handoff no vuelve a introducir 'Phase'", () => {
    // El `doc-writer` genera los handoffs. Mientras su plantilla diga `[Phase]`,
    // cada handoff futuro reintroduce la palabra que este test prohibe.
    const agente = readFileSync(
      path.resolve(process.cwd(), ".opencode", "agents", "doc-writer.md"),
      "utf8",
    );
    expect(agente).not.toMatch(/\[Phase\]|\[Next Phase\]/);
  });
});
