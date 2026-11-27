/**
 * P21.16 — `engines.node` está **acotado**, y no puede dejar de estarlo.
 *
 * La primera versión de este campo decía `">=24"`, que es exactamente lo que uno
 * escribe cuando quiere decir "Node 24 o mejor". En Vercel ese rango abierto no
 * se queda en 24: resuelve al major más nuevo que exista. El log del build lo
 * dice sin rodeos:
 *
 *     Warning: Due to "engines": { "node": ">=24" } in your package.json, the
 *     Node.js Version defined in your Project Settings ("24.x") will not apply,
 *     Node.js Version "26.x" will be used instead.
 *
 *     better-sqlite3@11.10.0 install: prebuilt-unavailable -> node-gyp rebuild
 *     gyp ERR! node -v v26.13.1
 *     Error: [BUILD_UTILS_SPAWN_1] Command "pnpm install" exited with 1
 *
 * Es decir: `pnpm install` sale 1 y **todos** los deploys fallan. Y el síntoma
 * que ve quien mira GitHub es "Deployment has failed", mientras la CI sigue
 * verde, porque allí el build corre en Node 24. Así estuvo desde `2c1bc76`
 * (2026-11-12) hasta el 2026-11-26: **13 días** de deploys rojos, y producción
 * congelada en el último commit que sí llegó.
 *
 * El binario nativo de `better-sqlite3` que usa este repo está compilado para el
 * ABI de Node 24 (AGENTS.md). Admitir un major más nuevo no es "flexible": es
 * prometer un binario que no existe.
 *
 * El evaluador de abajo es diminuto a propósito. Comprueba la **propiedad**
 * —admite 24, no admite 25 ni 26— y no la ortografía, para que `24.x` y
 * `>=24 <25` valgan igual. Un test que solo aceptara la cadena `"24.x"` se
 * pondría rojo ante un cambio correcto, y ese es el camino a que alguien lo
 * borre.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as {
  engines?: Record<string, string>;
};

const rangoActual = String(pkg.engines?.node ?? "");

/** Admite `24`, `24.x`, `>=24`, `<25` y combinaciones separadas por espacios. */
function admitido(rango: string, version: string): boolean {
  const mayor = Number(version.split(".")[0]);
  const partes = rango.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) throw new Error("rango vacío");
  return partes.every((parte) => {
    const comodin = /^(\d+)\.x$/.exec(parte);
    if (comodin) return mayor === Number(comodin[1]);
    const exacto = /^(\d+)$/.exec(parte);
    if (exacto) return mayor === Number(exacto[1]);
    const minimo = /^>=\s*(\d+)(?:\.\d+)*$/.exec(parte);
    if (minimo) return mayor >= Number(minimo[1]);
    const maximo = /^<\s*(\d+)(?:\.\d+)*$/.exec(parte);
    if (maximo) return mayor < Number(maximo[1]);
    throw new Error(`rango no soportado por este evaluador: "${parte}" (en "${rango}")`);
  });
}

describe("engines.node está acotado", () => {
  it("declara el major que el binario nativo soporta", () => {
    expect(rangoActual, "package.json no declara engines.node").not.toBe("");
    expect(admitido(rangoActual, "24.0.0")).toBe(true);
  });

  it("no admite el 25", () => {
    expect(admitido(rangoActual, "25.0.0")).toBe(false);
  });

  it("no admite el 26, que es el que Vercel eligió por su cuenta", () => {
    expect(admitido(rangoActual, "26.13.1")).toBe(false);
  });

  it("el valor que rompió los deploys no habría pasado este guard", () => {
    // Sin esto, el test de arriba podría estar pasando por casualidad: aquí se
    // demuestra que el rango viejo **sí** admitía 26 y el nuevo no.
    expect(admitido(">=24", "26.13.1")).toBe(true);
    expect(admitido(rangoActual, "26.13.1")).toBe(false);
  });

  it("el evaluador distingue un rango abierto de uno acotado", () => {
    // El instrumento también se mide: si `admitido` dijera siempre `false`,
    // los tres tests de arriba pasarían por el motivo equivocado.
    expect(admitido(">=24 <25", "24.5.0")).toBe(true);
    expect(admitido(">=24 <25", "25.0.0")).toBe(false);
    expect(admitido("24.x", "24.5.0")).toBe(true);
    expect(admitido("24.x", "25.0.0")).toBe(false);
  });
});
