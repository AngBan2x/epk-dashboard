/**
 * C4 — el vocabulario de show, cerrado y en un solo sitio.
 *
 * ## Por qué este fichero existe
 *
 * Antes de C4 el vocabulario estaba declarado **cuatro veces**:
 *
 *   1. `types/music.ts`               → 13 literales
 *   2. `lib/show-status.ts`           → los mismos 13 + 7 alias legacy + `| string`
 *   3. `components/BookingModule.tsx` → 10, que no coincidían con ninguno
 *   4. `app/api/shows/route.ts`       → `z.enum` de 13, en POST y en PUT
 *
 * Cuatro listas y ninguna comprobación de que coincidieran. Y el `| string` del
 * punto 2 era lo que lo wateringdownaba todo: un `ShowStatus` no restringía nada,
 * así que un estado inventado pasaba por TypeScript sin quejarse y el `z.enum` —
 * que sí restringía, y a 13 — era lo único que de verdad filtraba. Es decir: el
 * backend aceptaba `finalizado` y `en_venta` mientras el compilador decía que no
 * podían existir.
 *
 * Estos tests atan las cuatro cosas a la misma lista. Si alguien añade un estado
 * a `ShowStatus` y olvida el `<select>` o el Zod, aquí se pone rojo.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  SHOW_STATUS_SELECTABLE,
  SHOW_STATUS_DERIVED,
  SHOW_STATUS_OPTIONS,
  showStatusLabel,
  showStatusClass,
  toShowStatus,
} from "@/lib/show-status";
import type { ShowStatus } from "@/types/music";

const TYPES_SRC = readFileSync(resolve(process.cwd(), "types/music.ts"), "utf8");
const SHOWS_ROUTE = readFileSync(resolve(process.cwd(), "app/api/shows/route.ts"), "utf8");
const SHOW_FORM = readFileSync(resolve(process.cwd(), "components/ShowForm.tsx"), "utf8");
const SHOW_COVER = readFileSync(resolve(process.cwd(), "components/shows/ShowCover.tsx"), "utf8");
const DB_SRC = readFileSync(resolve(process.cwd(), "lib/db.ts"), "utf8");

/**
 * Quita los comentarios antes de comparar.
 *
 * Sin esto, cualquier `not.toContain("en_venta")` de este fichero se rompe solo:
 * los comentarios que **documentan** lo que se retiró citan los estados
 * retirados, que es justo lo que tienen que hacer. Un comentario no es código,
 * y un `not.toContain` sobre el fichero entero los cuenta igual.
 *
 * Es la tercera vez que este repo se cruza con eso (los dos primeros en C3), y
 * por eso está aquí como helper y no copiado test a test.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Los 8, para comparar contra el tipo sin tener que invocarlo en runtime. */
const LOS_8: ShowStatus[] = [
  "proximamente",
  "confirmado",
  "activo",
  "pospuesto",
  "cancelado",
  "suspendido",
  "hoy",
  "pasado",
];

describe("C4 — ShowStatus es un tipo cerrado, no un string disfrazado", () => {
  it("la unión de types/music.ts son exactamente los 8 estados", () => {
    // Se lee la fuente, no el tipo: `ShowStatus` no existe en runtime, y un
    // `expectTypeOf` no falla al compilar roto, solo documenta.
    const match = TYPES_SRC.match(/export type ShowStatus =([\s\S]*?);/);
    expect(match).not.toBeNull();
    const literales = (match?.[1] ?? "").match(/"([a-z_]+)"/g)?.map((s) => s.replace(/"/g, "")) ?? [];
    expect(literales.sort()).toEqual([...LOS_8].sort());
  });

  it("ya no queda un `| string` al final (era lo que anulaba el tipo entero)", () => {
    const match = TYPES_SRC.match(/export type ShowStatus =([\s\S]*?);/);
    expect(match?.[1]).not.toContain("string");
  });

  it("`lib/show-status.ts` NO redeclara ShowStatus: lo importa", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/show-status.ts"), "utf8");
    expect(src).not.toMatch(/export type ShowStatus/);
    expect(src).toMatch(/import type \{ ShowStatus \} from "@\/types\/music"/);
  });
});

describe("C4 — 6 elegibles + 2 derivados, y no se mezclan", () => {
  it("los 6 elegibles son los que se pueden elegir", () => {
    expect([...SHOW_STATUS_SELECTABLE].sort()).toEqual(
      ["proximamente", "confirmado", "activo", "pospuesto", "cancelado", "suspendido"].sort()
    );
  });

  it("los 2 derivados son `hoy` y `pasado`", () => {
    expect([...SHOW_STATUS_DERIVED].sort()).toEqual(["hoy", "pasado"].sort());
  });

  it("elegibles + derivados = los 8, sin repetidos ni huecos", () => {
    const todos = [...SHOW_STATUS_SELECTABLE, ...SHOW_STATUS_DERIVED];
    expect(todos).toHaveLength(8);
    expect(new Set(todos).size).toBe(8);
    expect([...todos].sort()).toEqual([...LOS_8].sort());
  });

  /**
   * El error que tendría sentido alguien reintroduciendo: dejar `hoy` o `pasado`
   * en el `<select>` "para que se pueda corregir a mano". Con eso, un show del
   * pasado se deshace en cuanto alguien lo guarda y la fecha aún no ha pasado.
   */
  it("ningún derivado aparece entre las opciones del formulario", () => {
    const valores = SHOW_STATUS_OPTIONS.map((o) => o.value);
    expect(valores).not.toContain("hoy");
    expect(valores).not.toContain("pasado");
    expect(valores).toHaveLength(SHOW_STATUS_SELECTABLE.length);
  });

  it("el `<select>` del formulario usa la lista, no una reescrita", () => {
    expect(SHOW_FORM).toContain("SHOW_STATUS_OPTIONS.map");
  });

  it("todo estado tiene etiqueta y clase (si no, se cae al raw y se nota)", () => {
    for (const estado of LOS_8) {
      expect(showStatusLabel(estado)).not.toBe(estado);
      expect(showStatusClass(estado)).toMatch(/bg-/);
    }
  });
});

describe("C4 — la API acepta los 6 y solo los 6", () => {
  it("el `z.enum` se deriva de la lista, no la reescribe", () => {
    // Si alguien vuelve a escribir los literales a mano, esto no lo pilla: lo
    // pilla el hecho de que la lista exista y se use. Es la defensa barata.
    const codigo = sinComentarios(SHOWS_ROUTE);
    expect(codigo).toContain("z.enum(SHOW_STATUS_SELECTABLE)");
    expect(codigo).not.toContain('"finalizado"');
    expect(codigo).not.toContain('"en_venta"');
  });

  it("`hoy` y `pasado` no se pueden mandar en un POST", () => {
    // Consecuencia de lo anterior, escrita porque es la que importa: la fecha
    // es la única fuente de esos dos.
    expect([...SHOW_STATUS_SELECTABLE]).not.toContain("hoy");
    expect([...SHOW_STATUS_SELECTABLE]).not.toContain("pasado");
  });
});

describe("C4 — lo retirado no queda en el código como literas que alguien use", () => {
  const RETIRADOS = [
    "finalizado",
    "en_venta",
    "disponible",
    "agotado",
    "reprogramado",
    "proximo",
    "pendiente",
    "propuesto",
    "completado",
    "en_vivo",
  ];

  it("los estilos de la portada solo tienen los 8", () => {
    const codigo = sinComentarios(SHOW_COVER);
    for (const retirado of RETIRADOS) {
      expect(codigo).not.toMatch(new RegExp(`^\\s+${retirado}:`, "m"));
    }
  });

  it("`lib/db.ts` ya no castea el status: lo estrecha de verdad", () => {
    const codigo = sinComentarios(DB_SRC);
    expect(codigo).not.toContain("as ShowStatus");
    expect(codigo).toContain("toShowStatus(row.status)");
  });
});

describe("C4 — `toShowStatus` estrecha y avisa", () => {
  it("pasa los 8 sin quejarse", () => {
    const vistos: unknown[] = [];
    for (const estado of LOS_8) {
      expect(toShowStatus(estado, (v) => vistos.push(v))).toBe(estado);
    }
    expect(vistos).toHaveLength(0);
  });

  it("un retirado cae al default y avisa con el equivalente", () => {
    const vistos: unknown[] = [];
    expect(toShowStatus("finalizado", (v) => vistos.push(v))).toBe("proximamente");
    expect(vistos).toEqual(["finalizado"]);
  });

  it("sin manejador, avisa por consola (que es lo que verá quien despleguó)", () => {
    // No se comprueba el texto exacto: se comprueba que **dice algo**. Un
    // Un `console.warn` vací­o es un log que no ayuda a nadie.
    const original = console.warn;
    const lineas: string[] = [];
    console.warn = (...args: unknown[]) => {
      lineas.push(String(args[0]));
    };
    try {
      toShowStatus("en_venta");
    } finally {
      console.warn = original;
    }
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toContain("en_venta");
    expect(lineas[0]).toContain("activo");
  });

  it("lo que no es string (null, número, undefined) también cae al default", () => {
    for (const raro of [null, undefined, 42, {}, []]) {
      expect(toShowStatus(raro, () => {})).toBe("proximamente");
    }
  });

  it("los espacios sobrantes no rompen nada", () => {
    // Un `status` con espacios es un dato escrito a mano: no es un estado
    // distinto, es el mismo con la caja sucia.
    expect(toShowStatus("  confirmado  ", () => {})).toBe("confirmado");
  });
});