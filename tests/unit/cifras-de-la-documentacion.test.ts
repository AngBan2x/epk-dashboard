/**
 * P12, fila 12 — los recuentos de la documentación, medidos.
 *
 * Una cifra en un documento vale lo que vale el día que se escribió, y esa
 * es exactamente la razón por la que caduca: nadie se acuerda de volver a
 * mirarla. Estos tests no comprueban que el texto esté "bien escrito".
 * Comprueban que los números que dice **sigan siendo ciertos**, que es la
 * única parte de un documento que se puede verificar sin fe.
 *
 * ## Por qué medir líneas contando saltos de línea
 *
 * `Get-Content f.md | Measure-Object -Line` **no cuenta las líneas vacías**.
 * En `docs/ai-log/01-f0-f9.md` devuelve 437 cuando el fichero tiene 531.
 *
 * No es una curiosidad: con ese método, los seis ficheros de `docs/ai-log/`
 * parecían descuadrar cada uno de una manera distinta (36, 89, 191, 269, 433,
 * 486), y la conclusión "el patrón +5 en los seis era falso" parecía sólida.
 * Era el instrumento el que estaba mal. Con saltos de línea, el +5 es real y
 * la hipótesis era correcta. Un número mal medido no da un error evidente:
 * da un error *plausible*.
 *
 * ## Por qué hay una fecha de commit al lado de cada cifra
 *
 * Un número sin fecha es imposible de evaluar: si el doc dice 1500 y la suite
 * tiene 1509, no se sabe si el doc va atrasado o si el test está mal. Con el
 * commit al lado, la pregunta tiene respuesta.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const leer = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

/** Recuento de líneas que sí cuenta las vacías. */
const lineas = (rel: string) =>
  (readFileSync(path.resolve(process.cwd(), rel), "utf8").match(/\n/g) ?? []).length;

/** Y el que no las cuenta, que existe para poder explicar por qué no se usa. */
const lineasSinVacias = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8").split("\n").filter((l) => l.trim() !== "").length;

describe("el recuento de líneas es el que cuenta las vacías", () => {
  it("los dos métodos no coinciden, y por eso se usa el primero", () => {
    // No es un test de que el código esté bien: es el hecho que hace que el
    // resto de cifras de este fichero sean de fiar.
    const conVacias = lineas("docs/ai-log/01-f0-f9.md");
    const sinVacias = lineasSinVacias("docs/ai-log/01-f0-f9.md");
    expect(conVacias).toBeGreaterThan(sinVacias);
    expect(conVacias - sinVacias).toBeGreaterThan(80); // hay muchas líneas en blanco
  });
});

describe("AI_LOG.md: los seis recuentos de docs/ai-log/", () => {
  const ESPERADO: Record<string, number> = {
    "01-f0-f9.md": 531,
    "02-refactor-fases-a-l.md": 1133,
    "03-hotfixes-y-sesiones.md": 207,
    "04-v4-alpha-beta.md": 2336,
    "05-rc10-rc28.md": 1438,
    "06-tranches-a-hoy.md": 1628,
  };

  it("los ficheros que se nombran son exactamente los que existen", () => {
    const reales = readdirSync(path.resolve(process.cwd(), "docs/ai-log"))
      .filter((f) => f.endsWith(".md"))
      .sort();
    expect(reales).toEqual(Object.keys(ESPERADO).sort());
  });

  it.each(Object.entries(ESPERADO))(
    "%s tiene las líneas que dice la tabla",
    (fichero, n) => {
      // El separador de millar va a mano y no con `toLocaleString`: en Node,
      // `(1133).toLocaleString("es")` devuelve `"1133"`, no `"1.133"`, porque
      // sin ICU completo el locale se ignora. Una tabla construída con el
      // método "correcto" y comparada con otro "correcto" puede no casar
      // nunca, y el fallo se lee como un bug del documento.
      const conPunto = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      expect(lineas(`docs/ai-log/${fichero}`), `${fichero} grew`).toBe(n);
      expect(leer("docs/AI_LOG.md")).toContain(`\`ai-log/${fichero}\` | ${conPunto} |`);
    },
  );

  it("la tabla de AI_LOG.md dice esos mismos números, con los seis ficheros", () => {
    const log = leer("docs/AI_LOG.md");
    const filas = log.match(/\| `ai-log\/[^`]+\.md` \| [\d.]+ \|/g) ?? [];
    expect(filas.length).toBe(Object.keys(ESPERADO).length);
  });
});

describe("las cifras de test llevan el commit donde se midieron", () => {
  it("AGENTS.md dice 1592 tests en 80 ficheros, con el commit al lado", () => {
    const agentes = leer("AGENTS.md");
    expect(agentes).toContain("**1592 tests**");
    expect(agentes).toContain("80 archivos");
    // Sin commit, el 1592 no se puede evaluar: si la suite crece, no hay forma
    // de distinguir "el doc va atrasado" de "el test se rompió".
    expect(agentes).toMatch(/1592 tests\*\*[^|]*medido en `\w+`/);
  });

  it("README.md no lleva una cifra suelta", () => {
    // README es lo primero que lee alguien que no eres tú. Un 1146/1146 sin
    // contexto ahí es la peor versión del problema.
    const readme = leer("README.md");
    expect(readme).toContain("1592/1592 en 80 archivos");
    expect(readme).not.toContain("1146/1146");
  });

  it("ningún documento de estado vivo afirma 1146 tests", () => {
    // Los docs/ai-log/ y los HANDOFF conservan su 1146 a propósito: describen
    // lo que valía en su fecha. Estos tres, en cambio, se leen como actuales.
    const vivos = ["AGENTS.md", "README.md"];
    for (const doc of vivos) {
      expect(leer(doc), `${doc} afirma 1146`).not.toContain("1146");
    }
  });
});

describe("el invariante de Turso se cuenta, no se recuerda", () => {
  it("los 93 guards existen de verdad y con esa forma", () => {
    // AGENTS.md decía "83 guards `if (isTursoConfigured()) return;`". Ese patrón
    // tiene 1 ocurrencia en todo el repo: la está contando él mismo, en un
    // comentario. Quien fuera a verificar el invariante abría el patrón que el
    // doc le daba, no encontraba nada, y no podía distinguir entre "el doc
    // mintió" y "el invariante caducó".
    const db = leer("lib/db.ts");
    const guards = db.match(/if \(isTursoEnabled\(\)\) \{/g) ?? [];
    expect(guards.length).toBe(93);

    const agentes = leer("AGENTS.md");
    expect(agentes).toContain("**93 guards `if (isTursoEnabled()) {` de `lib/db.ts`");
    // Y el patrón que se daba por bueno no existe fuera del comentario:
    expect((leer("lib/turso.ts").match(/isTursoConfigured\(\)\) return;/g) ?? []).length).toBe(0);
  });
});