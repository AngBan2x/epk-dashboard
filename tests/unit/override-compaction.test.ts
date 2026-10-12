/**
 * El arreglo de compactación, atado a un test.
 *
 * ## Qué pasó
 *
 * La compactación automática saltaba al ~50 % del contexto con
 * `space-bunny-free`, y el motivo no era la ventana. El modelo declara
 * `limit.output = 524288`: **exactamente la mitad** de sus 1.048.576 de
 * contexto. Si la salida máxima se descuenta del presupuesto de entrada, de
 * 1M solo quedan ~524K utilizables, y `reserved: 20000` —un 2 %— es ruido a
 * esa escala.
 *
 * `muse-spark-1.3` comparte los mismos 1M y llega al 87,5 % porque declara
 * `131072` de salida. La ventana no es el problema; la reserva sí.
 *
 * ## Por qué este test existe
 *
 * El arreglo es **una línea en un JSON que nadie abre**. Es exactamente el tipo
 * de cosa que sobrevive a un `git checkout`, a un revert de `opencode.json`, o a
 * que alguien lo quite "porque sobra". El síntoma sería la compactación al
 * 50 %, que no rompe nada: solo cuesta caro, y de forma intermitente, lo cual
 * hace que nadie lo relacione con una línea de configuración de tres meses antes.
 *
 * ## Lo que este test NO afirma
 *
 * No comprueba que la compactación ocurra al 95 %. Eso requiere ejecutar una
 * sesión real hasta llenarla, y ningún test unitario va a pagar ese coste. Lo
 * que ata es **la configuración**, que es lo que se puede degradar en silencio.
 * La comprobación empírica queda a mano y se anota en `docs/PHASE_P13.md`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const leer = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

interface Config {
  model?: string;
  compaction?: { auto?: boolean; prune?: boolean; reserved?: number };
  provider?: Record<string, { models?: Record<string, { limit?: { context?: number; output?: number } }> }>;
}

describe("el override de salida de space-bunny-free está puesto", () => {
  const cfg = JSON.parse(leer("opencode.json")) as Config;

  it("el modelo por defecto sigue siendo space-bunny-free", () => {
    // Si esto cambia, este test deja de describir el problema que corrige.
    expect(cfg.model).toBe("opencode/space-bunny-free");
  });

  it("declara limit.output de 32000", () => {
    const limit = cfg.provider?.opencode?.models?.["space-bunny-free"]?.limit;
    expect(limit, "no hay override de modelo en opencode.json").toBeDefined();
    expect(limit!.output).toBe(32000);
  });

  it("mantiene el contexto declarado, porque bajarlo también rompería cosas", () => {
    // El override va a `output`, no a `context`: bajar el contexto avisaría al
    // usuario y se notaría. El problema era la reserva, no la ventana.
    const limit = cfg.provider!.opencode!.models!["space-bunny-free"]!.limit!;
    expect(limit.context).toBe(1048576);
  });

  it("deja libre más del 90 % del contexto", () => {
    // El motivo del arreglo, escrito como aserción para que no se pueda
    // "ajustar" el número a algo que vuelva a dejarlo al 50 %.
    const limit = cfg.provider!.opencode!.models!["space-bunny-free"]!.limit!;
    const usable = (limit.context! - limit.output!) / limit.context!;
    expect(usable).toBeGreaterThan(0.9);
  });

  it("no toca la compactación, que no era el problema", () => {
    // Un `reserved` enorme parecería arreglarlo y en realidad lo empeoraría:
    // es un número absoluto, no un porcentaje, así que un valor grande castiga
    // igual al modelo de 200K que al de 1M.
    expect(cfg.compaction).toEqual({ auto: true, prune: true, reserved: 20000 });
  });
});

describe("AGENTS.md ya no miente sobre el umbral", () => {
  const agentes = leer("AGENTS.md");

  it("no afirma el 98 % que sí era falso", () => {
    expect(agentes).not.toContain("98% de los de 1M");
    expect(agentes).not.toContain("salta al **90% del modelo de 200K**");
  });

  it("da los tres números que sostienen la explicación", () => {
    // Sin la tabla, la corrección no se puede auditar: alguien leería que se
    // cambió un número sin saber contra qué se midió.
    expect(agentes).toContain("1.048.576");
    expect(agentes).toContain("524.288");
    expect(agentes).toContain("87,5 %");
    expect(agentes).toContain("50,0 %");
  });

  it("dice que la fórmula es inferida, no documentada", () => {
    // La fórmula `context - output` casa al 50,0 % exacto, pero opencode no la
    // publica. Presentarla como regla seria exactamente el fallo que este
    // fichero critica en otros sitios del repo.
    expect(agentes).toMatch(/es una inferencia, no una regla documentada/);
  });
});