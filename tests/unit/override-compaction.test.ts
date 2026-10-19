/**
 * La compactación de `space-bunny-free`, y por qué **no** tiene arreglo por config.
 *
 * ## Qué pasó
 *
 * La compactación automática saltaba al ~50 % del contexto con
 * `space-bunny-free`. Durante meses se creyó que la causa era que el modelo declara
 * `limit.output = 524288` —exactamente la mitad de sus 1.048.576 de contexto— y
 * que se podía bajar ese número desde `opencode.json`.
 *
 * **No se podía.** Se midió el 2026-10-16 y aquí está la cuenta.
 *
 * ## El experimento, y por qué con mimo y no con space-bunny
 *
 * Probarlo con el modelo de 1M exigiría llenar medio millón de tokens: caro y
 * lento. Pero la pregunta es si el runtime **lee** el override, y eso se responde
 * con un modelo de 200K donde el efecto es brutal:
 *
 * - Contexto 200.000, salida real 32.000 → ventana útil **168.000** (84 %).
 * - Se puso `limit.output = 190000` en `opencode.json` → ventana **10.000** (5 %).
 *
 * Se Lanzó una sesión con `opencode run -m opencode/mimo-v2.6-flash-free
 * --format json` y se leyeron los `cache_read` de los eventos `step_finish`.
 *
 * | | `cache_read` observado | ventana si el override se honra |
 * |---|---|---|
 * | Resultado | **180.800** | 10.000 — imposible |
 *
 * **El runtime no aplica `provider.*.models.*.*.limit.output`.** Dos indicios de
 * por qué no podía: el schema marca `provider` como `deprecated: true`, y la
 * documentación de opencode solo explica `provider.*.models.*.variants`.
 *
 * ## Lo que este test ata, y lo que NO ata
 *
 * Ata **que la documentación no afirme un arreglo que no existe**. Eso sí se
 * puede degradar en silencio: alguien lee *"sube lo usable a ~95 %"*, lo da por
 * cierto, y compactar al 50 % le parece un misterio sin explicación.
 *
 * NO ata el comportamiento de la compactación. Eso solo se mide gastando una
 * sesión entera, y ningún test unitario paga ese coste. **Este fichero no puede
 * volver a ser la prueba de que el arreglo funciona**, porque no lo es.
 *
 * ## La lección, que es la del repo entero
 *
 * La versión anterior de este test afirmaba `usable > 0.9`, calculado sobre los
 * números del propio JSON: `1048576 − 32000` da 96,9 %, **sea cual sea el mundo**.
 * Pasaba siempre, y no protegía de nada. Un check que siempre pasa es peor que
 * ninguno, porque da la sensación de que algo está vigilado.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const leer = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

interface Config {
  model?: string;
  small_model?: string;
  compaction?: { auto?: boolean; prune?: boolean; reserved?: number };
  provider?: Record<string, unknown>;
  agent?: Record<string, { model?: string }>;
}

/**
 * Contexto declarado por models.dev para un modelo, o `null` si no se conoce.
 *
 * Va hardcodeado a proposito: la alternativa —consultar la API en cada test—
 * hace que el test dependa de la red, y un test que depende de la red falla
 * cuando la red falla, que es cuando menos te fias de el.
 */
const CONTEXTO_DECLARADO: Record<string, number> = {
  "opencode/minimax-m3.1-flash-free": 1_000_000,
  "opencode/nemotron-3.5-super-vl-free": 1_048_576,
  "opencode/muse-spark-1.3": 1_048_576,
  "opencode/space-bunny-free": 1_048_576,
  "opencode/mimo-v2.6-flash-free": 200_000,
  "opencode/nemotron-3.5-lightning-free": 262_144,
  "opencode/deepseek-v4.1-flash-free": 200_000,
  "opencode/glm-5.3-flash-free": 200_000,
};

describe("no queda ningún arreglo de compactación por configuración", () => {
  const cfg = JSON.parse(leer("opencode.json")) as Config;

  it("el modelo por defecto tiene 1M+ de contexto", () => {
    // **El invariante, no el nombre.** El nombre del modelo ya ha cambiado dos
    // veces por cuota agotada; un test que atara `space-bunny-free` se rompio
    // solo, y no por un fallo del repo. Lo que importa es la propiedad:
    // un modelo con 200K hace thrashing de compactacion, y con 1M no.
    //
    // La tabla de arriba es la fuente. Un modelo que no este en ella hace fallar
    // el test, que es lo que se quiere: anadir un modelo es una decision que
    // hay que verificar contra models.dev, no una linea suelta.
    const contexto = cfg.model === undefined ? 0 : CONTEXTO_DECLARADO[cfg.model];
    expect(
      contexto,
      `el modelo ${cfg.model} no esta en la tabla de contexto declarado`
    ).toBeGreaterThanOrEqual(1_000_000);
  });

  it("ningun agente usa un modelo de 200K", () => {
    // El mismo motivo, aplicado a los subagentes: un builder con 200K
    // compacta en bucle y no avanza. Se comprueba sobre TODOS los agentes,
    // no solo sobre los que se usan hoy.
    const bajos = Object.entries(cfg.agent ?? {})
      .filter(([, a]) => a.model !== undefined)
      .filter(([, a]) => (CONTEXTO_DECLARADO[a.model as string] ?? 0) < 1_000_000)
      .map(([n, a]) => `${n} -> ${a.model}`);

    expect(
      bajos,
      "estos agentes usan un modelo de menos de 1M de contexto: van a compactar en bucle"
    ).toEqual([]);
  });

  it("el small_model tampoco es de 200K", () => {
    // `small_model` es el que se usa para titulos y tareas cortas. Con 200K se
    // queda sin margen en cuanto la sesion principal ha llenado contexto, y el
    // resultado es una compactacion que no compensa.
    const contexto = cfg.small_model === undefined ? 0 : CONTEXTO_DECLARADO[cfg.small_model];
    expect(contexto).toBeGreaterThanOrEqual(1_000_000);
  });

  it("no declara ningún override de límite de modelo", () => {
    // La línea se quitó porque no hacía nada. Dejarla sería peor que quitarla:
    // es una linea de configuracion que *parece* arreglar un problema y no lo
    // hace, y eso es exactamente lo que hace que alguien no entienda por que la
    // compactacion sigue al 50 %.
    const provider = cfg.provider ?? {};
    const conOverrides = Object.entries(provider).filter(([, v]) => {
      const modelos = (v as { models?: Record<string, { limit?: unknown }> })?.models;
      return modelos !== undefined && Object.values(modelos).some((m) => m.limit !== undefined);
    });

    expect(
      conOverrides,
      "ha vuelto un override de limit: está medido que no hace nada. Ver AGENTS.md"
    ).toHaveLength(0);
  });

  it("no toca la compactación, porque tampoco era el problema", () => {
    // `reserved` sigue a 20000. Bajarlo a 0 Ganaría un 1,9 % de los 524K reales
    // y se haría a costa de dejar sin margen para la propia salida del modelo,
    // que es un modo de fallo nuevo a cambio de una ganancia irrelevante.
    expect(cfg.compaction).toEqual({ auto: true, prune: true, reserved: 20000 });
  });
});

describe("AGENTS.md dice la verdad sobre la compactación", () => {
  const agentes = leer("AGENTS.md");

  it("no afirma que el override suba la ventana", () => {
    // La frase que lived 7 años de commits y era falsa.
    expect(agentes).not.toMatch(/Sobrescribe `space-bunny-free\.limit\.output`/i);
    expect(agentes).not.toMatch(/Sube lo usable a ~95/);
  });

  it("afirma explícitamente que no funciona", () => {
    expect(agentes).toMatch(/NO hay arreglo por configuración/);
    expect(agentes).toMatch(/no lo aplica|No lo aplica/);
  });

  it("da los tres números que sostienen la explicación", () => {
    // Sin la tabla, la corrección no se puede auditar: alguien leería que se
    // cambió un número sin saber contra qué se midió.
    expect(agentes).toContain("1.048.576");
    expect(agentes).toContain("524.288");
    expect(agentes).toContain("87,5 %");
    expect(agentes).toContain("50,0 %");
  });

  it("documenta el experimento, para que no haya que repetirlo", () => {
    // El paso a paso. Una conclusion sin procedimiento no se puede revisar ni
    // volver a comprobar cuando opencode cambie.
    expect(agentes).toMatch(/180\.800/);
    expect(agentes).toMatch(/deprecated/);
  });

  it("dice que la fórmula es inferida, no documentada", () => {
    // `context - output` casa al 50,0 % exacto, pero opencode no la publica.
    // Con el dato de `cache_read` hay aun un cabo suelto, y se dice.
    expect(agentes).toMatch(/sigue siendo una inferencia/);
  });

  it("apunta a la delegacion como la defensa real", () => {
    // Un tope de ~524K no se arregla con configuracion. Se arregla con subagentes,
    // cuyo contexto es independiente. Sin esto, la primera mitad del fichero se
    // lee como "no hay solución" y la gente busca otra vez el mismo numero.
    expect(agentes).toMatch(/La defensa real es la delegación/);
  });
});
