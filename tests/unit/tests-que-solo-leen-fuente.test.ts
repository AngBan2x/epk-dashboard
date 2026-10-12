/**
 * P12, fila 12 — la deuda que queda, enumerada y con su motivo.
 *
 * ## Qué mide esto
 *
 * Un test que **lee el fuente** y afirma que el fuente dice una cosa es más
 * débil que uno que lo ejecuta: si el texto se cumple pero el comportamiento
 * no, el primero sigue verde. Eso no lo hace malo — hay comprobaciones donde
 * leer el fuente es lo correcto y no hay alternativa — pero sí lo hace
 * *distinguible*, y esa distinción estaba escondida: nadie había contado
 * cuántos tests de los 79 no ejecutan nada.
 *
 * ## Por qué esto NO es una lista de "tests que arreglar"
 *
 * Dos de las tres categorías de abajo no se pueden convertir, y una auditoría
 * que las metiera en un "pendientes" mandaría a alguien a hacer un trabajo
 * imposible. El objetivo es que la lista sea **fiel**, no que esté vacía.
 *
 * - `solo-fuente-por-naturaleza`: leer el fichero es la única forma. Un `.md`
 *   no se importa; un meta-test sobre otros tests solo puede leerlos; y una
 *   clase de Tailwind no se puede comprobar en jsdom, porque jsdom no aplica
 *   la cascada de CSS —no hay hoja de estilos, hay una cadena de texto.
 * - `con-gemelo-que-ejecuta`: el fichero de fuente y su gemelo que ejecuta
 *   cubren lo mismo entre los dos. Convertirlo sería duplicar.
 * - `sin-gemelo-que-ejecute`: **esta sí es deuda real**, y son las tres que se
 *   listan al final con el motivo de por que siguen asi.
 *
 * ## El motivo de que la lista sea un `Set` declarado aquí
 *
 * Un fichero nuevo que lea fuente y no importe nada del proyecto **no entra**
 * automáticamente: hay que añadirlo a mano, con su categoría y su motivo. Al
 * añadirlo a mano se lee el motivo, y al leerlo se decide si de verdad cabe.
 * Una lista automática sería una alarma que se apaga sola: en dos semanas
 * tendría veinte entradas sin justificar y nadie la miraría.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(process.cwd(), "tests/unit");

/**
 * Módulos que no son "el proyecto". Incluye los builtins con y sin el
 * prefijo `node:`, porque un test puede escribir cualquiera de las dos formas.
 *
 * Esto no es un detalle: la primera versión de este filtro solo excluía
 * `node:*`, así que `dark-mode-pairing.test.ts`, que importa `"fs"`, se
 * contaba como "importa el proyecto" y salía de la lista. El fichero llevaba
 * siete tests de análisis de clases Tailwind y aparecía como si ejecutara
 * código. Una lista de deuda que se vacía por un predicado mal escrito
 * miente en la dirección que más caro sale: **parece que no hay deuda**.
 */
const NO_ES_PROYECTO = new Set([
  "vitest", "fs", "path", "os", "url", "crypto", "assert", "util",
  "node:fs", "node:path", "node:os", "node:url", "node:crypto", "node:assert", "node:util",
]);

/** Un test "lee fuente" si abre ficheros del repo con fs. */
function leeFuente(fichero: string): boolean {
  const src = readFileSync(path.join(DIR, fichero), "utf8");
  return /readFileSync|readFile\(|readdirSync|existsSync/.test(src);
}

/** Y "ejecuta proyecto" si importa algo del repo que no sea vitest ni builtin. */
function importaProyecto(fichero: string): boolean {
  const src = readFileSync(path.join(DIR, fichero), "utf8");
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
  return imports.some((i) => !NO_ES_PROYECTO.has(i));
}

/**
 * Este fichero se excluye a sí mismo, por la misma razón que
 * `puertas-que-fallan.test.ts`: lee el fuente de otros tests, que es
 * literalmente su trabajo. Sin la exclusión, la lista no cuadra nunca con las
 * tres categorías y el test que vigila la lista se declara a sí mismo deuda.
 */
const YO = "tests-que-solo-leen-fuente.test.ts";

/** Lectura de fuente sin ejecutar nada: la categoría que este test vigila. */
const soloFuente = (): string[] =>
  readdirSync(DIR)
    .filter((f) => f.endsWith(".test.ts") && f !== YO)
    .filter((f) => leeFuente(f) && !importaProyecto(f))
    .sort();

const NATURALEZA = new Set([
  "cifras-de-la-documentacion.test.ts", // mide .md: no hay nada que importar
  "fase-naming.test.ts",              // deriva la lista de docs del directorio
  "puertas-que-fallan.test.ts",       // meta-test: solo puede leer otros tests
  "dark-mode-pairing.test.ts",        // clases Tailwind: jsdom no aplica la cascada CSS
  "override-compaction.test.ts",     // mide opencode.json y AGENTS.md: tampoco se importan
  "capturas-social.test.ts",         // mide JPEG en disco: una imagen no se importa
]);

const CON_GEMELO = new Set([
  "allowlist-de-columnas.test.ts",        // allowlist-ejecutada.test.ts importa @/lib/db
  "image-robustness.test.ts",             // artist-images-script.test.ts importa @/lib/artist-images
  "no-audio-y-enlace-al-artista.test.ts", // release-type-normalization.test.ts importa el helper
]);

const DEUDA_REAL = new Set(["admin-catalog.test.ts"]);

describe("todo test que lee fuente está clasificado, con su motivo", () => {
  it.each(soloFuente())("%s está en una de las tres categorías", (f) => {
    expect(
      NATURALEZA.has(f) || CON_GEMELO.has(f) || DEUDA_REAL.has(f),
      `${f} lee el fuente y no importa nada del proyecto, pero no está en ninguna categoría. ` +
        `O lee el fuente porque no hay otra forma, o tiene un gemelo que ejecuta, o es deuda real. ` +
        `Decidir cuál de las tres es parte del trabajo, y por eso no se deduce: se declara.`,
    ).toBe(true);
  });

  it("ninguna categoría se solapa con otra", () => {
    for (const f of NATURALEZA) expect(CON_GEMELO.has(f) || DEUDA_REAL.has(f), `${f} en dos categorías`).toBe(false);
    for (const f of CON_GEMELO) expect(DEUDA_REAL.has(f), `${f} en dos categorías`).toBe(false);
  });

  it("todas las entradas declaradas siguen existiendo", () => {
    // Una categoría que apunta a un fichero borrado es una categoría que ya no
    // protege nada, y es la forma más fácil de que esto se pudra en silencio.
    for (const f of [...NATURALEZA, ...CON_GEMELO, ...DEUDA_REAL]) {
      expect(readdirSync(DIR), `${f} ya no existe`).toContain(f);
    }
  });
});

describe("la deuda real está acotada y es una sola", () => {
  it("admin-catalog: doce aserciones sobre el fuente del panel", () => {
    // Doce tests que comprueban que la pestaña existe, que está en el tipo, en
    // el diccionario de acentos, que hay botón, que hay bloque de render, y que
    // el valor "se lee del body" y "se añade a la sentencia con parámetro, no
    // interpolado".
    //
    // Las dos últimas **sí** se podrían ejecutar contra la capa de datos, y
    // serían el test que de verdad detecta una inyección. Las otras diez son
    // estructura de JSX, y para eso leer el fuente es lo correcto.
    //
    // Convertirlo requiere tocar `app/admin/page.tsx` para extraer la lectura del
    // body y la construcción del SQL a funciones testeables. Es trabajo de otra
    // ronda, no un apaño de cinco minutos, y fingir que está cerrado porque el
    // fichero "tiene muchos tests" es exactamente el fallo que este test
    // existe para evitar.
    expect(DEUDA_REAL.size).toBe(1);
    expect([...DEUDA_REAL]).toEqual(["admin-catalog.test.ts"]);
  });

  it("el recuento no crece sin que alguien lo decida", () => {
    // Si esto falla, ha aparecido un test nuevo que lee fuente. Puede ser
    // correcto; lo que no puede es aparecer por descuido.
    expect(soloFuente().length).toBe(
      NATURALEZA.size + CON_GEMELO.size + DEUDA_REAL.size,
    );
  });
});