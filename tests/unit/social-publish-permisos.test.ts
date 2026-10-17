/**
 * Quién puede ejecutar `scripts/social-publish.ts`.
 *
 * ## Que se esta atando
 *
 * **Que publicar es la unica accion restringida a un agente, y ese agente es
 * `social-publisher`.** Todo lo demas queda fuera.
 *
 * ## Por que este test mira el ORDEN y no solo si hay un `deny`
 *
 * Es la trampa de este mecanismo, y no es teorica: **esta medida en este repo.**
 * Las reglas de opencode se evaluan por patron, **gana la ultima que coincide**, y
 * las reglas de **agente** se anaden **despues** de las globales. Por eso un
 * `"bash": "allow"` a nivel de agente se normaliza a `{ "*": "allow" }` y aterriza
 * **encima** del `deny` global del script: la ultima coincidencia gana y el script
 * vuelve a estar abierto para ese agente.
 *
 * O sea: **un `deny` global que existe pero no es el ultimo no protege nada.** Un
 * test que solo mirase "hay un deny para este patron" pasaria con la configuracion
 * rota. Este test resuelve las reglas en el mismo orden que el runtime y exige que
 * la ultima que coincide sea `deny`.
 *
 * ## Que NO ata, y por que no se puede atar
 *
 * 1. **Que el runtime siga resolviendo en este orden.** Eso se demostro a mano, y un
 *    test unitario no lo puede repetir sin lanzar una sesion real. Si opencode
 *    cambia la precedencia, este test puede quedarse verde mientras el permiso real
 *    cambia: es un techo, no un suelo.
 *
 * 2. **La via del `./` inicial. NO ES UN AGUERO DEL TEST, ES DEL MOTOR.**
 *
 *    Medido el 2026-10-17: un comando que **empieza por `./`** no se comprueba.
 *    `zz social-publish.ts` cae en el deny; `./zz social-publish.ts` llega al shell.
 *    Y el alcance es general: el deny de bash del propio agente tambien se salta, asi
 *    que afecta a cualquier permiso de bash de opencode, incluido el de
 *    `social-drafter`. Ver R-1b en `docs/PHASE_P13.md`.
 *
 *    No se escribe aqui como test **a proposito**: no hay configuracion que lo
 *    arregle, asi que un `expect(...).toBe('deny')` estaria rojo para siempre sin que
 *    nadie pudiera hacer nada, y eso entrena a ignorar el fichero. Va en la doc, que es
 *    donde se lee lo que no se puede cerrar.
 *
 *    Por lo mismo, `coincide()` de aqui modela `*` como "cualquier caracter, `/`
 *    incluido". Es lo que hace el motor… **excepto en el caso de arriba**, que es
 *    justamente donde este fichero no puede llegar. La lista de `INVOCACIONES` es,
 *    entonces, "las formas que la configuracion cierra", no "todas las que existen".
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const leer = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

type Accion = "allow" | "deny" | "ask";
type Reglas = Record<string, unknown>;

interface Config {
  permission?: Reglas;
  agent?: Record<string, { permission?: Reglas } & Record<string, unknown>>;
}

const cfg = JSON.parse(leer("opencode.json")) as Config;

/** El agente unico autorizado a publicar. Nadie mas. */
const PUBLICADOR = "social-publisher";

const COMANDO = "npx tsx scripts/social-publish.ts --plataformas=threads";

/**
 * Las invocaciones que tienen que quedar cerradas.
 *
 * No son las dos documentadas: son **todas las que se midieron como via de
 * entrada** antes de cambiar al deny por nombre de fichero. Cada fila existe porque
 * se comprobó que la forma anterior (por ruta) la dejaba pasar.
 *
 * La que NO esta aquí, y a proposito, es la forma sin extension
 * (`npx tsx scripts/social-publish`). Va en un `it.fails` mas abajo, con su
 * nombre: si alguien la cierra, ese test avisa de que hay que actualizar el
 * resto en vez de dejar una nota vieja diciendo que seguia abierta.
 */
const INVOCACIONES = [
  "npx tsx scripts/social-publish.ts", // documentada
  "node --import tsx scripts/social-publish.ts", // la otra forma de ejecutar TS en Node
  "npx tsx ./scripts/social-publish.ts", // prefijo ./
  "npx tsx scripts\\social-publish.ts", // separador inverso
  "npm exec tsx scripts/social-publish.ts", // otro gestor de paquetes
  "pnpm dlx tsx scripts/social-publish.ts", // otro gestor, y descarga el paquete
  "./node_modules/.bin/tsx scripts/social-publish.ts", // el bin local
];

/** La que se escapa. Deuda con nombre: R-1 en docs/PHASE_P13.md. */
const SIN_EXTENSION = "npx tsx scripts/social-publish";

/**
 * Comodines de opencode: `*` cero o mas caracteres, `?` exactamente uno, el resto
 * literal. Es la misma regla que dice la documentacion.
 */
function coincide(patron: string, comando: string): boolean {
  const fuente = patron.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${fuente}$`).test(comando);
}

/** Normaliza `"allow"` / `{ "*": "allow" }` a una lista ordenada de reglas. */
function aReglas(valor: unknown): { patron: string; accion: Accion }[] {
  if (valor === undefined || valor === null) return [];
  if (typeof valor === "string") return [{ patron: "*", accion: valor as Accion }];
  if (typeof valor !== "object") return [];
  // El orden de claves de un objeto de JS es el de insercion, y JSON.parse lo
  // conserva: es el mismo orden que lee el runtime.
  return Object.entries(valor as Reglas).map(([patron, accion]) => ({
    patron,
    accion: accion as Accion,
  }));
}

/**
 * Las reglas que **manda** el runtime: globales primero, despues las del agente.
 * Gana la ultima que coincide.
 */
function resolver(agente: string): { patron: string; accion: Accion }[] {
  return [
    ...aReglas((cfg.permission ?? {}).bash),
    ...aReglas(cfg.agent?.[agente]?.permission?.bash),
  ];
}

function ganador(agente: string, comando: string): Accion | null {
  const reglas = resolver(agente);
  for (let i = reglas.length - 1; i >= 0; i--) {
    if (coincide(reglas[i].patron, comando)) return reglas[i].accion;
  }
  return null;
}

const agentes = Object.keys(cfg.agent ?? {});

describe(`el ${PUBLICADOR} es el unico que puede publicar`, () => {
  it(`${PUBLICADOR} existe y es un subagente`, () => {
    expect(cfg.agent?.[PUBLICADOR], "no hay ningun agente autorizado a publicar").toBeDefined();
    expect(cfg.agent?.[PUBLICADOR]?.mode).toBe("subagent");
  });

  it(`ningun otro agente puede alcanzar el script por ninguna de las dos formas de invocarlo`, () => {
    const fugas: string[] = [];

    for (const agente of agentes) {
      if (agente === PUBLICADOR) continue;
      for (const invocacion of INVOCACIONES) {
        const accion = ganador(agente, invocacion);
        // `null` significa que ninguna regla coincide, y sin reglas no hay bash.
        // Eso tambien es "no puede publicar", asi que solo cuenta `allow`.
        if (accion === "allow") fugas.push(`${agente} -> allow en "${invocacion}"`);
      }
    }

    // El mensaje importa: sin el, el fallo dice "expected [] to have length 0" y
    // no dice que agente abrir de mas.
    expect(
      fugas,
      `estos agentes pueden publicar y no deberian:\n  ${fugas.join("\n  ")}\n` +
        "Su regla de bash propia gana al deny global porque las reglas de agente se\n" +
        "anaden despues de las globales y gana la ultima que coincide. Añadir el deny\n" +
        "del script DENTRO de su bloque `permission` lo arregla."
    ).toEqual([]);
  });

  it("el deny global del script existe y es por nombre de fichero", () => {
    const globales = aReglas((cfg.permission ?? {}).bash);
    const denegados = globales.filter((r) => r.accion === "deny" && r.patron !== "*").map((r) => r.patron);

    for (const invocacion of INVOCACIONES) {
      expect(
        denegados.some((p) => coincide(p, invocacion)),
        `el permiso raiz no cierra "${invocacion}". Sin esto, un agente sin regla de\n` +
          "bash propia no tendria nada que lo parara."
      ).toBe(true);
    }

    // Y el `.ts` tiene que estar DENTRO del patron: sin el, el deny se come los
    // tests, que se llaman `social-publish.test.ts`. Esto no lo comprueba el test de
    // abajo —comprueba que no se los haya comido—, asi que se ata aqui el motivo.
    expect(
      denegados.some((p) => p.includes("social-publish.ts")),
      `ningun deny global nombra el fichero con su extension: ${JSON.stringify(denegados)}`
    ).toBe(true);
  });

  it.fails("SIN_EXTENSION sigue escapando, y hay que actualizar esto cuando se cierre", () => {
    // `it.fails` = "afirmo que esto sigue roto". La asercion de dentro **quiere**
    // `deny` y por eso falla hoy; `it.fails` la da por buena mientras siga fallando.
    // Si alguien cierra la forma sin extension, la asercion pasa, `it.fails` se
    // pone en rojo, y ese rojo es el aviso de que la nota R-1 y la lista de
    // invocaciones de arriba se han quedado viejas. Con un `expect(...).toBe('deny')`
    // normal, el dia que alguien lo arreglara el guard se quedaria en rojo sin decir
    // por que, que es peor que no atar nada.
    expect(ganador("api-tester", SIN_EXTENSION)).toBe("deny");
    expect(ganador("orchestrator", SIN_EXTENSION)).toBe("deny");
  });

  it("el deny global va DESPUES del allow global, porque gana la ultima", () => {
    // Al reves el allow global se comeria el deny, y no habria ningun agente
    // al que el deny global protegiera.
    const globales = aReglas((cfg.permission ?? {}).bash);

    const allowGlobal = globales.findIndex((r) => r.patron === "*" && r.accion === "allow");
    const ultimoDenegado = globales.reduce((ultimo, r, i) => (r.accion === "deny" ? i : ultimo), -1);

    expect(allowGlobal).toBeGreaterThanOrEqual(0);
    expect(ultimoDenegado, "no hay ningun deny global que ganar").toBeGreaterThan(allowGlobal);
  });
});

/**
 * El otro lado del broadening. Un deny que se cierra de mas tambien es un fallo,
 * y este es el que hace: el deny es por **nombre de fichero**, y los ficheros del
 * repo se llaman `social-publish.test.ts` y `social-publish-permisos.test.ts`.
 * Detras de `social-publish` viene `.test.ts`, no `.ts`, asi que el `.ts` va dentro
 * del patron a proposito.
 *
 * Sin esta comprobacion, ampliar el deny a `*social-publish*` (lo que haria un
 * agenteQuantity que quisiera cerrar mas) **no se veria aqui**: el guard seguiria
 * verde, porque ese patron mas ancho tambien casa con los comandos de prueba.
 * Se veria en el siguiente `npx vitest run`, que es donde de verdad duele.
 */
describe("el deny por nombre de fichero no se come los tests que se llaman igual", () => {
  const LEGITIMOS = [
    "npx vitest run tests/unit/social-publish.test.ts",
    "npx vitest run tests/unit/social-publish-permisos.test.ts",
    "npx vitest run tests/unit/social-publish.test.ts tests/unit/override-compaction.test.ts",
  ];

  it("ningun deny del repo se come los comandos de los tests que se llaman igual", () => {
    // Sin esta comprobacion, ampliar el deny a `*social-publish*` — lo que haria
    // alguien que quisiera cerrar mas — **no se veria aqui**: el guard seguiria
    // verde, porque un patron mas ancho tambien casa con los comandos de prueba.
    // Se veria en el siguiente `npx vitest run`, que es donde de verdad duele.
    const LEGITIMOS = [
      "npx vitest run tests/unit/social-publish.test.ts",
      "npx vitest run tests/unit/social-publish-permisos.test.ts",
      "npx vitest run tests/unit/social-publish.test.ts tests/unit/override-compaction.test.ts",
    ];

    // Se mira el **patron de cada deny**, no el resultado por agente: `social-drafter`
    // y `social-publisher` deniegan todo bash a proposito y no lanzan tests, asi que
    // exigirles que puedan es exigirles lo contrario de lo que son. El `*` se excluye
    // por la misma razon: bloquear todo bash es otra decision, ya tomada y deliberada.
    // Lo que no vale es que una regla **especifica de este fichero** los pille de paso.
    const especificas = (r: { patron: string; accion: Accion }) =>
      r.accion === "deny" && r.patron !== "*";

    const reglas: { donde: string; patron: string }[] = [
      ...aReglas((cfg.permission ?? {}).bash)
        .filter(especificas)
        .map((r) => ({ donde: "raiz", patron: r.patron })),
      ...agentes.flatMap((agente) =>
        aReglas(cfg.agent?.[agente]?.permission?.bash)
          .filter(especificas)
          .map((r) => ({ donde: agente, patron: r.patron }))
      ),
    ];

    const rotos: string[] = [];
    for (const { donde, patron } of reglas) {
      for (const comando of LEGITIMOS) {
        if (coincide(patron, comando)) rotos.push(`${donde}: deny "${patron}" absorbe "${comando}"`);
      }
    }

    expect(
      rotos,
      `estos deny de bash se comen los comandos de test:\n  ${rotos.join("\n  ")}\n` +
        "El deny va por nombre de FICHERO: `*social-publish.ts*` no puede absorber el\n" +
        "`.test.ts` de estos dos ficheros, y esa es justo la diferencia entre cerrar\n" +
        "el script de publicacion y romper el suite. Ampliar a `*social-publish*` los\n" +
        "mata a todos."
    ).toEqual([]);
  });
});

describe(`el ${PUBLICADOR} no crece`, () => {
  const permiso = () => cfg.agent?.[PUBLICADOR]?.permission ?? {};

  it("no gana edit, write ni task en ninguna forma", () => {
    // Publicar es lo que puede. Tocar el codigo o delegar en otro agente
    // convertiria a este en un agente general con acceso al token, que es
    // exactamente el riesgo que el diseño queria cerrar.
    for (const tool of ["edit", "write", "task"] as const) {
      const reglas = aReglas(permiso()[tool]);

      // Sin regla significa "lo que diga el raiz", y el raiz los tiene en allow.
      // Para este agente no vale: tiene que haber un deny explicito.
      const actiona = reglas.some((r) => r.accion === "allow");

      expect(actiona, `${PUBLICADOR} tiene "${tool}" en allow. Debe ser deny explicito.`).toBe(false);
      expect(
        reglas.some((r) => r.accion === "deny"),
        `${PUBLICADOR} no declara deny explicito de "${tool}", asi que hereda el allow global.`
      ).toBe(true);
    }
  });

  it("sigue teniendo bash, y solo para el script", () => {
    const bash = aReglas(permiso().bash);
    const permits = bash.filter((r) => r.accion === "allow");

    expect(permits.length, "sin ningun allow de bash este agente no puede hacer nada").toBeGreaterThan(0);
    expect(ganador(PUBLICADOR, COMANDO)).toBe("allow");

    // Y el catch-all en deny, para que "un comando" no sea "cualquier comando".
    expect(bash.some((r) => r.patron === "*" && r.accion === "deny")).toBe(true);
  });

  it("no se le permite un comando que no sea el script", () => {
    // La razon de ser `social-publisher` es la publicacion. Con bash abierto a
    // demas seria un agente mas, con token.
    expect(ganador(PUBLICADOR, "npx vitest run")).not.toBe("allow");
    expect(ganador(PUBLICADOR, "cat .env.local")).not.toBe("allow");
  });
});

describe("social-drafter sigue sin poder publicar ni ejecutar nada", () => {
  const permiso = () => cfg.agent?.["social-drafter"]?.permission ?? {};

  it("declarado en los dos sitios, como el resto", () => {
    // El `.md` es documentacion y el `.json` es configuracion, pero mientras
    // existan los dos, alguien lee el que quiere. Que no se separen.
    expect(cfg.agent?.["social-drafter"], "social-drafter ha desaparecido de opencode.json").toBeDefined();
    expect(leer(".opencode/agents/social-drafter.md")).toMatch(/name:\s*social-drafter/);
  });

  it("bash en deny, no en allow", () => {
    const bash = aReglas(permiso().bash);

    expect(bash.some((r) => r.accion === "deny"), "social-drafter ha perdido el deny de bash").toBe(true);
    expect(bash.some((r) => r.accion === "allow")).toBe(false);
    expect(ganador("social-drafter", COMANDO)).toBe("deny");
  });
});

describe("el md del publicador dice lo que hace", () => {
  const md = leer(".opencode/agents/social-publisher.md");

  it("declara el mismo permiso que el json", () => {
    expect(md).toMatch(/name:\s*social-publisher/);
    expect(md).toMatch(/"npx tsx scripts\/social-publish\.ts\*":\s*"allow"/);
    expect(md).toMatch(/"\*":\s*"deny"/);
  });

  it("dice que el preview va primero y que la publicacion la pide una persona", () => {
    // Un `.md` que no dice esto es decoracion. La regla de no publicar sin
    // peticion humana no la puede imponer un flag.
    expect(md).toMatch(/preview/i);
    expect(md).toMatch(/--confirmar/);
    expect(md).toMatch(/expl[ií]cit/i);
  });

  it("dice que si el preview falla no se publica", () => {
    // Publicar a medias es peor que no publicar: no hay transaccion entre
    // plataformas y lo que salio no se puede deshacer.
    expect(md).toMatch(/Si el preview falla, no publicas/);
  });
});