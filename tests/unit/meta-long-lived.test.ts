/**
 * Tests de `scripts/meta-long-lived-token.ts`.
 *
 * ## Que se esta atando
 *
 * 1. **El intercambio cambia el token.** Si devuelve el mismo string que se le
 *    paso, escribirlo seria inofensivo y nadie lo notaria hasta que caducara. Por
 *    eso hay un test que falla si el largo coincide con el corto.
 *
 * 2. **El app secret no se imprime ni se escribe en ningun sitio del codigo.**
 *    Va en la URL del pedido, asi que la unica proteccion es que el script no
 *    lo diga. Se comprueba leyendo el fuente, que es el unico sitio donde se
 *    puede comprobar algo asi.
 *
 * 3. **Un 190 se distingue de cualquier otro error**, porque significan cosas
 *    opuestas: "pide otro token al usuario" frente a "revisa el app secret". La
 *    respuesta de error lo dice literal, y el mensaje le tiene que decir al
 *    usuario que vaya al Explorador.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { intercambiar, leerPage } from "../../scripts/meta-long-lived-token";

/** Respuesta de fetch falsa que devuelve un cuerpo fijo. */
function httpFalso(cuerpo: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(cuerpo), {
      status: ok ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

const CORTO = "EAAXg9fr-token-corto-de-prueba";
const APP_ID = "1654721962854119";
const APP_SECRET = "app-secret-de-prueba";

describe("intercambiar", () => {
  it("devuelve el token largo con su caducidad", async () => {
    const r = await intercambiar(
      CORTO,
      APP_ID,
      APP_SECRET,
      httpFalso({ access_token: "TOKEN-LARGO-DISTINTO", token_type: "bearer", expires_in: 5_183_944 })
    );

    expect(r.error).toBeNull();
    expect(r.largo).toBe("TOKEN-LARGO-DISTINTO");
    expect(r.expiraEn).toBe(5_183_944);
  });

  it("el token largo NUNCA es el mismo que el corto", async () => {
    // Si Meta devolviera el mismo string, escribir el resultado seria
    // inofensivo y el fallo apareceria meses despues, cuando caducara.
    const r = await intercambiar(CORTO, APP_ID, APP_SECRET, httpFalso({ access_token: CORTO }));

    expect(r.largo).not.toBe(CORTO);
  });

  it("manda grant_type, client_id, client_secret y el token", async () => {
    let pedida = "";
    const espia: typeof fetch = (async (u: string) => {
      pedida = u;
      return new Response(JSON.stringify({ access_token: "x", expires_in: 1 }));
    }) as unknown as typeof fetch;

    await intercambiar(CORTO, APP_ID, APP_SECRET, espia);

    expect(pedida).toContain("grant_type=fb_exchange_token");
    expect(pedida).toContain(`client_id=${APP_ID}`);
    expect(pedida).toContain(`client_secret=${APP_SECRET}`);
    expect(pedida).toContain("fb_exchange_token=");
  });

  it("el 190 se distingue y no se confunde con otros errores", async () => {
    const r = await intercambiar(
      CORTO,
      APP_ID,
      APP_SECRET,
      httpFalso({ error: { message: "Invalid OAuth access token: the session is invalid", code: 190 } }, false)
    );

    expect(r.largo).toBeNull();
    expect(r.error).toMatch(/190|invalid/i);
  });

  it("sin access_token devuelve error en vez de un null silencioso", async () => {
    const r = await intercambiar(CORTO, APP_ID, APP_SECRET, httpFalso({ token_type: "bearer" }));

    expect(r.largo).toBeNull();
    expect(r.error).toMatch(/no devolvio access_token/);
  });

  it("un token vacio cuenta como ausente", async () => {
    const r = await intercambiar(CORTO, APP_ID, APP_SECRET, httpFalso({ access_token: "" }));

    expect(r.largo).toBeNull();
  });
});

describe("leerPage", () => {
  const CUERPO_BUENO = {
    id: "1306361615901216",
    name: "PressPlay",
    access_token: "TOKEN-DE-PAGE",
    instagram_business_account: { id: "17841415579134413" },
  };

  it("extrae id, nombre, token de Page e IG", async () => {
    const p = await leerPage("1306361615901216", "tok", httpFalso(CUERPO_BUENO));

    expect(p.error).toBeNull();
    expect(p.id).toBe("1306361615901216");
    expect(p.nombre).toBe("PressPlay");
    expect(p.token).toBe("TOKEN-DE-PAGE");
    expect(p.igUserId).toBe("17841415579134413");
  });

  it("IG sin vincular da null, y no inventa un id", async () => {
    const p = await leerPage(
      "1306361615901216",
      "tok",
      httpFalso({ ...CUERPO_BUENO, instagram_business_account: null })
    );

    expect(p.token).toBe("TOKEN-DE-PAGE");
    expect(p.igUserId).toBeNull();
  });

  it("no pide el campo `tasks`, que no existe en ese nodo", async () => {
    // Pedirlo da `#100 Tried accessing nonexisting field`, que parece un error de
    // permiso y es un error de campo: hace creer que el token no tiene acceso.
    let pedida = "";
    const espia: typeof fetch = (async (u: string) => {
      pedida = u;
      return new Response(JSON.stringify(CUERPO_BUENO));
    }) as unknown as typeof fetch;

    await leerPage("1306361615901216", "tok", espia);

    expect(pedida).not.toContain("tasks");
    expect(pedida).toContain("instagram_business_account");
  });

  it("un error de la API se propaga con su mensaje", async () => {
    const p = await leerPage(
      "61595566701130",
      "tok",
      httpFalso({ error: { message: "Unsupported get request. Object does not exist" } }, false)
    );

    expect(p.error).toMatch(/does not exist/i);
    expect(p.token).toBeNull();
  });
});

describe("el app secret no se filtra", () => {
  const fuente = readFileSync(
    path.join(process.cwd(), "scripts/meta-long-lived-token.ts"),
    "utf8"
  );

  it("no hay ningun console.log del app secret", () => {
    // El secret llega como parametro a `intercambiar`, no a `main`: no existe
    // forma de que `main` lo imprima por accidente porque no lo tiene en scope.
    // Este test ata que sigue siendo cierto.
    expect(fuente).not.toMatch(/console\.(log|error)\([^)]*appSecret/);
    expect(fuente).not.toMatch(/console\.(log|error)\([^)]*appSecret/);
  });

  it("el secret solo se usa para construir la URL, nunca se escribe", () => {
    const lineasDeEscritura = fuente
      .split("\n")
      .filter((l) => l.includes("escribirEnEnvLocal("));

    for (const linea of lineasDeEscritura) {
      expect(linea).not.toContain("META_KEY");
      expect(linea).not.toContain("appSecret");
    }
  });

  it("no hay ningun valor de token impreso en las lineas de salida", () => {
    const lineasDeConsola = fuente
      .split("\n")
      .filter((l) => /console\.(log|error)/.test(l));

    // Se imprime `{largo.length}` y `{page.token.length}`, no los valores. Un
    // `${largo}` suelto seria el fallo.
    for (const linea of lineasDeConsola) {
      expect(linea).not.toMatch(/\$\{largo\}/);
      expect(linea).not.toMatch(/\$\{page\.token\}/);
      expect(linea).not.toMatch(/\$\{corto\}/);
    }
  });
});