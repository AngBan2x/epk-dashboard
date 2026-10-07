import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * Una variante `dark:` a medias es un bug **invisible en modo claro**.
 *
 * ## El bug
 *
 * `/admin/suggestions` tenía dos elementos escritos así:
 *
 * ```
 * bg-white dark:border-slate-800          ← faltaba dark:bg
 * bg-white hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700
 * ```
 *
 * En claro no se nota nada, porque `bg-white` es justo lo que quiere la luz. En
 * oscuro la tarjeta se queda **blanca** y el número —que sí llevaba
 * `dark:text-white`— queda **blanco sobre blanco**, invisible. Lo reportó el
 * usuario el 2026-10-06 con capturas de producción: cinco tarjetas, cuatro
 * blancas en una página oscura.
 *
 * ## Por qué cuesta verlo
 *
 * Es el fallo más caro de esta lista porque **no rompe nada**: no hay error de
 * build, no hay test en rojo, no hay aviso de accesibilidad. El único síntoma es
 * una caja que no cambia de color, y para verlo hace falta mirar la página en
 * oscuro — o tener a alguien mirándola.
 *
 * Y el diagnóstico natural es el equivocado: se sospecha del CSS, de
 * `darkMode`, del orden de las reglas. Los tres estaban bien. La causa era una
 * palabra de más en el `className`.
 *
 * ## Lo que ata este test
 *
 * Si un `className` pinta un fondo claro y **no** trae su `dark:bg`, se rojo.
 * Es una regla mecánica y con falsos positivos pocos: se excluyen los
 * `bg-white/N` con opacidad (decorativos sobre degradado) y las líneas que ya
 * llevan el `dark:` en otra parte de un className multilínea.
 */

/** Fondos claros que necesitan pareja oscura. */
const FONDO_CLARO =
  /(?<![\w:.-])bg-(white|slate-50|slate-100|gray-50|stone-50)(?![\w/-])/;

/**
 * Un `bg-white/10` sobre un degradado es decorativo y **no** necesita `dark:`:
 * es blanco al 10% tanto en claro como en oscuro, y el texto que va encima es
 * blanco en los dos casos. Por eso la opacidad queda fuera por el lookahead
 * `(?![\w/-])` de arriba.
 *
 * El **lookbehind** `(?<![\w:.-])` es lo que evita el falso positivo más
 * común: `hover:bg-slate-100 dark:hover:bg-slate-800` sí está bien, y sin el
 * lookbehind el regex leería el `bg-slate-100` del `hover:` como fondo sin
 * pareja.
 */

/** Un className entero, aunque se parta en varias líneas. */
const CLASS_NAME = /className=\{?["`]([\s\S]*?)["`]/g;

/**
 * Quita los bloques de comentario, **siguiendo el estado línea a línea**.
 *
 * Sin esto, un `className` **mencionado dentro de un JSDoc** —que es justo lo
 * que pasa cuando alguien explica un fallo anterior citando el código roto— se
 * cuenta como si estuviera en el marcado, y el test se pone rojo por el
 * comentario que documenta el arreglo.
 *
 * Se hace lineal y no con una expresion regular, porque esa empareja desde el
 * primer asterisco hasta el primero que ve, y con varios comentarios en el
 * fichero se come codigo de verdad y deja trozos sueltos. Ya paso: el
 * comentario de seguridad de `app/admin/suggestions/page.tsx` se colaba.
 *
 * Ojo al escribir esto: citar el terminador de bloque de comentario **dentro**
 * de un bloque de comentario lo cierra antes de tiempo, y el fichero deja de
 * compilar. Le ha pasado a este mismo comentario.
 */
function sinComentarios(fuente: string): string {
  const salida: string[] = [];
  let enBloque = false;

  for (const linea of fuente.split("\n")) {
    let limpia = linea;

    if (enBloque) {
      const cierre = limpia.indexOf("*/");
      if (cierre === -1) {
        salida.push("");
        continue;
      }
      limpia = limpia.slice(cierre + 2);
      enBloque = false;
    }

    // Comentario de bloque que abre y cierra en la misma linea.
    let desde = 0;
    for (;;) {
      const abre = limpia.indexOf("/*", desde);
      if (abre === -1) break;
      const cierra = limpia.indexOf("*/", abre + 2);
      if (cierra === -1) {
        limpia = limpia.slice(0, abre);
        enBloque = true;
        break;
      }
      limpia = limpia.slice(0, abre) + limpia.slice(cierra + 2);
      desde = abre;
    }

    // Comentario de linea. Se protege lo que va entre comillas dobles, porque
    // una doble barra dentro de una URL no es un comentario.
    const conComillas: string[] = [];
    limpia = limpia.replace(/"[^"]*"/g, (c) => {
      conComillas.push(c);
      return "\u0000" + (conComillas.length - 1) + "\u0000";
    });
    const guion = limpia.indexOf("//");
    if (guion !== -1) limpia = limpia.slice(0, guion);
    limpia = limpia.replace(/\u0000(\d+)\u0000/g, (_, i) => conComillas[Number(i)]);

    salida.push(limpia);
  }

  return salida.join("\n");
}

function tsxDe(ruta: string): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const completa = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(completa);
      else if (/\.tsx$/.test(e.name)) salida.push(completa);
    }
  };
  recorrer(ruta);
  return salida;
}

describe("nadie deja una variante dark a medias", () => {
  const raiz = path.resolve(process.cwd(), "components");
  const AlsoApp = path.resolve(process.cwd(), "app");
  const ficheros = [...tsxDe(raiz), ...tsxDe(AlsoApp)];

  it("el arbol se ha recorrido de verdad", () => {
    expect(ficheros.length).toBeGreaterThan(50);
  });

  it("cada rama de un className con fondo claro lleva su dark:bg", () => {
    const ofensores: string[] = [];

    /**
     * Un className no es siempre una lista de clases: often es un *ternary*,
     * y entonces hay **dos** listas que se evalúan en momentos distintos.
     *
     * Por eso no se busca "algun `dark:bg` en la cadena", sino en **cada
     * segmento** entre comillas. Con la comprobacion laxa, la rama activa
     * (`bg-primary-50 dark:bg-primary-950/40`) tapaba a la inactiva
     * (`bg-white ... dark:border-slate-800`, sin fondo) de
     * `app/admin/approvals/page.tsx`, y las cuatro pestañas de filtro se
     * quedaban blancas en oscuro. Lo vio el navegador, no el test.
     */
    const segmentos = (clases: string): string[] =>
      clases.split(/['"`]/).filter((s) => s.trim().length > 0);

    for (const fichero of ficheros) {
      const fuente = sinComentarios(readFileSync(fichero, "utf8"));
      CLASS_NAME.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = CLASS_NAME.exec(fuente)) !== null) {
        for (const seg of segmentos(m[1])) {
          if (!FONDO_CLARO.test(seg)) continue;
          if (/dark:bg-/.test(seg)) continue;
          const linea = fuente.slice(0, m.index).split("\n").length;
          ofensores.push(
            `${path.relative(process.cwd(), fichero)}:${linea}  ${seg.trim().replace(/\s+/g, " ").slice(0, 84)}`,
          );
        }
      }
    }

    expect(ofensores).toEqual([]);
  });

  it("la ternaria de las pestanas de filtro de /admin/approvals esta cubierta", () => {
    // El caso concreto que la comprobacion laxa dejaba pasar: se localiza la
    // rama inactiva por sus clases de borde y se le exige un fondo oscuro.
    const fuente = readFileSync(
      path.resolve(process.cwd(), "app", "admin", "approvals", "page.tsx"),
      "utf8",
    );
    const inactiva = fuente.match(/bg-white hover:border-slate-300[^\n]*/);
    expect(inactiva).not.toBeNull();
    expect(inactiva![0]).toMatch(/dark:bg-slate-900/);
  });
});

describe("el buzon de sugerencias, en concreto", () => {
  const fuente = readFileSync(
    path.resolve(process.cwd(), "app", "admin", "suggestions", "page.tsx"),
    "utf8",
  );

  it("las tarjetas de estadística tienen fondo oscuro en la rama inactiva", () => {
    // La activa ya lo tenía (`dark:bg-primary-950/40`); a la inactiva le faltaba.
    expect(fuente).toMatch(/dark:bg-slate-800/);
    expect(fuente).toMatch(/dark:hover:bg-slate-700/);
  });

  it("la franja del panel tiene fondo oscuro", () => {
    expect(fuente).toMatch(/dark:bg-slate-900/);
  });

  it("y el motivo está escrito, para que nadie lo revierta por cleaning", () => {
    expect(fuente).toMatch(/patr[oó]n a medias/);
    // Y que el comentario nombre el fallo concreto, no solo "se arregló".
    expect(fuente).toContain("`dark:border` y no `dark:bg`");
  });
});

describe("las otras dos paginas con la misma franja", () => {
  /**
   * El mismo `dark:` a medias, copiado a mano en tres paginas. La del buzon
   * publico y la de aprobaciones estaban escritas con el mismo className, asi
   * que arreglar solo una dejaba dos iguales de rotas.
   */
  const paginas = [
    path.join("app", "suggestions", "page.tsx"),
    path.join("app", "admin", "approvals", "page.tsx"),
  ];

  for (const relativa of paginas) {
    it(`${relativa.replace(/\\/g, "/")} no deja la franja blanca en oscuro`, () => {
      const fuente = readFileSync(path.resolve(process.cwd(), relativa), "utf8");
      expect(fuente).toMatch(
        /className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"/,
      );
    });
  }
});
