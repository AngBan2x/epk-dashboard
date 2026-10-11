/**
 * P12 — las puertas que no fallan.
 *
 * ## Por qué este fichero existe
 *
 * `scripts/turso-check.ts` imprimía un número por check y **nunca podía salir
 * con código distinto de 0**: los errores de query se capturaban y se
 * imprimían, y las expectativas eran tres líneas de prosa escritas a mano. Los
 * guards que añadió `a35fa6f` —incluido
 * `tracks_release_type_con_mayusculas`, puesto a cero a propósito— no protegían
 * nada. `AGENTS.md:83` lleva desde hace tiempo escribiendo que *"un check que
 * siempre pasa no protege de nada"*, y este repo lo tenía escrito y no lo
 * tenía aplicado.
 *
 * Estos tests comprueban lo que se puede comprobar sin una base de datos: que
 * el script **tiene** la capacidad de fallar y que su lista de expectativas es
 * la única fuente de verdad. El comportamiento contra Turso se verifica
 * ejecutando el script, que es lo que hace `PHASE_P12.md` al cerrar la fila 1.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

const TURSO_CHECK = read("scripts/turso-check.ts");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("turso-check puede fallar", () => {
  it("termina con código de salida 1 cuando un check no cuadra", () => {
    // Sin esto, el script es una impresión: el CI leería verde con la base de
    // datos rota.
    expect(sinComentarios(TURSO_CHECK)).toMatch(/process\.exitCode\s*=\s*1/);
  });

  it("cuenta como fallo una query que no se pudo ejecutar", () => {
    // Un `catch` que solo imprime convierte "no lo comprobé" en "todo bien".
    // La diferencia es justo la que hace que el check proteja o no.
    expect(sinComentarios(TURSO_CHECK)).toMatch(/fallos\.push\([^)]*la query falló/);
  });

  it("compara el resultado contra un valor esperado", () => {
    expect(sinComentarios(TURSO_CHECK)).toMatch(/const comprobar\s*=/);
    expect(sinComentarios(TURSO_CHECK)).toMatch(/actual\s*===\s*esperado/);
  });

  it("imprime las expectativas desde ESPERADO, no desde una lista a mano", () => {
    // Antes había tres `console.log("(esperado 0: ...")` a mano **y** una lista
    // de verdad: dos fuentes para lo mismo, y la de a mano era la que se leía.
    // No se puede distinguir una de otra por su forma —la línea generada es
    // idéntica en apariencia—, así que lo que se comprueba es de dónde sale:
    // si el bucle recorre `ESPERADO`, no hay lista que se pueda desincronizar.
    expect(sinComentarios(TURSO_CHECK)).toMatch(
      /for \(const \[(\w+), (\w+)\] of Object\.entries\(ESPERADO\)\)/
    );
  });

  it("todo check con valor esperado está en ESPERADO", () => {
    // La lista se imprime desde ESPERADO, así que si un check se queda fuera,
    // su valor esperado no sale por ninguna parte. Esta es la comprobación que
    // hace imposible el drift del punto anterior.
    const esperado = TURSO_CHECK.match(/const ESPERADO[^=]*=\s*\{([\s\S]*?)\n  \};/);
    expect(esperado, "no se encuentra la tabla ESPERADO").not.toBeNull();
    const declarados = [...(esperado![1].matchAll(/^\s*(\w+):/gm))].map((m) => m[1]);

    // Los checks que el script nombra con un valor que hay que sostener.
    const obligatorios = [
      "tracks_release_type_con_mayusculas",
      "seed_vulnicura_como_EP",
      "seed_padres_duracion_cero",
      "seed_errata_ashe_to_ashes",
      "seed_titulos_con_comillas",
      "seed_huerfanas",
      "suggestions_email_duplicado_en_24h",
    ];
    for (const label of obligatorios) {
      expect(declarados, `${label} se consulta pero no tiene valor esperado`).toContain(label);
    }
  });

  it("Vulnicura se espera en minúsculas, que es lo que hace el check significativo", () => {
    // Si volviera a `= 'EP'`, el check daría 0 con la columna en minúsculas: verde
    // por el motivo equivocado. El `lower()` es lo que lo hace comprobable.
    expect(TURSO_CHECK).toMatch(/seed_vulnicura_como_EP:\s*6,/);
    expect(sinComentarios(TURSO_CHECK)).toMatch(/lower\(release_type\)\s*=\s*'ep'/);
  });
});

describe("ningún test afirma que no afirma", () => {
  /**
   * `268b573` subió nueve tests que eran literalmente `expect(true).toBe(true)`.
   * Pasaban con cualquier código, incluidos los que no tenían nada que ver. Es
   * la forma más barata de tener una suite verde, y por eso hace falta una
   * puerta que la prohíba: nadie lo va a notar leyendo.
   */
  const TAUTOLOGIAS = [
    /expect\(\s*(true|1|['"]\w*['"])\s*\)\s*\.\s*to(Be|Equal)\(\s*\1\s*\)/,
    /expect\(\s*(true|1)\s*\)\s*\.\s*toBeTruthy\(\s*\)/,
  ];

  const ficherosDeTest = readdirSync(path.resolve(process.cwd(), "tests"), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((d) => d.isFile() && d.name.endsWith(".test.ts"))
    .map((d) => path.join(d.parentPath ?? d.path, d.name))
    // Este fichero contiene los patrones literales que escanea. Sin excluirlo,
    // se detecta a sí mismo y la comprobación no vale para nada.
    .filter((f) => !f.endsWith("puertas-que-fallan.test.ts"));

  it("hay tests que examinar", () => {
    expect(ficherosDeTest.length).toBeGreaterThan(20);
  });

  it.each(ficherosDeTest)("%s no tiene aserciones tautológicas", (fichero) => {
    // Se escanea el código **sin comentarios**: un test que *documenta* una
    // aserción tautológica —este fichero lo hace, y el de admin-catalog citaba la
    // suya al explicar qué estaba mal— no es una aserción tautológica. Marcarlo
    // sería empujar a no escribir la explicación, que es lo contrario de lo que
    // se busca.
    const src = sinComentarios(readFileSync(path.resolve(process.cwd(), fichero), "utf8"));
    for (const patron of TAUTOLOGIAS) {
      expect(src, `${fichero} contiene una aserción tautológica (${patron})`).not.toMatch(patron);
    }
  });

  it.each(ficherosDeTest)("%s no tiene un it() con el cuerpo vacío", (fichero) => {
    // Un `it("nombre", () => {});` no comprueba nada y se lee como que sí.
    const src = sinComentarios(readFileSync(path.resolve(process.cwd(), fichero), "utf8"));
    expect(src, `${fichero} tiene un it() sin cuerpo`).not.toMatch(/it\([^)]*,\s*\(\)\s*=>\s*\{\s*\}\s*\)/);
  });
});
