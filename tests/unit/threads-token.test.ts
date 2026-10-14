/**
 * Tests de `scripts/threads-token.ts`.
 *
 * ## Que se esta atando
 *
 * 1. **El token largo nunca es el corto.** Si Threads devolviera el de entrada,
 *    el script lo escribiria y `.env.local` quedaria igual: un token de 1 hora
 *    guardado creyendo que dura 60 dias, y el fallo apareceria semanas despues.
 *
 * 2. **Los dos tokens de Threads son distintos entre si**, y ninguno es el de
 *    Facebook. Threads corre en `graph.threads.net` y su token lo emite otro par
 *    de credenciales; `lib/social/config.ts` ya tiene un test que protege la
 *    separacion de Threads respecto a Facebook, y aqui se protege el canje.
 *
 * 3. **El authorization code se gasta.** Si el canje falla, el mensaje lo dice,
 *    porque el codigo valia 1 hora y no hay forma de recuperarlo: sin ese aviso
 *    el error se lee como "el codigo esta mal" y se pierde la causa real.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canjearCodigo, alargar, leerPerfil } from "../../scripts/threads-token";

function httpFalso(cuerpo: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(cuerpo), {
      status: ok ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

const CODIGO = "AQB-un-codigo-de-prueba-que-es-de-un-solo-uso";
const APP_ID = "1390840160777783";
const SECRET = "secret-de-threads-de-prueba";
const REDIRECT = "http://localhost:3000/auth/meta/callback";

describe("canjearCodigo", () => {
  it("devuelve el token corto con el codigo correcto", async () => {
    const r = await canjearCodigo(
      CODIGO,
      APP_ID,
      SECRET,
      REDIRECT,
      httpFalso({ access_token: "TOKEN-CORTO-THREADS", token_type: "bearer" })
    );

    expect(r.error).toBeNull();
    expect(r.token).toBe("TOKEN-CORTO-THREADS");
  });

  it("manda grant_type, el code, el redirect_uri y el client_id", async () => {
    let cuerpo = "";
    const espia: typeof fetch = (async (_u: string, i?: RequestInit) => {
      cuerpo = String(i?.body);
      return new Response(JSON.stringify({ access_token: "x" }));
    }) as unknown as typeof fetch;

    await canjearCodigo(CODIGO, APP_ID, SECRET, REDIRECT, espia);

    expect(cuerpo).toContain("grant_type=authorization_code");
    expect(cuerpo).toContain("code=");
    expect(cuerpo).toContain("redirect_uri=");
    expect(cuerpo).toContain(`client_id=${APP_ID}`);
  });

  it("va a .com con POST, que es lo que documenta Threads", async () => {
    let pedido: { url: string; init: RequestInit | undefined } = { url: "", init: undefined };
    const espia: typeof fetch = (async (u: string, init?: RequestInit) => {
      pedido = { url: u, init };
      return new Response(JSON.stringify({ access_token: "x" }));
    }) as unknown as typeof fetch;

    await canjearCodigo(CODIGO, APP_ID, SECRET, REDIRECT, espia);

    // El canje va a graph.threads.**com**, no a .net. Con `.net` responde 404:
    // el endpoint de OAuth existe una sola vez y en un solo host.
    expect(pedido.url).toBe("https://graph.threads.com/oauth/access_token");
    expect(pedido.url).not.toContain(".net");
    expect(pedido.init?.method).toBe("POST");
  });

  it("el secret viaja en el CUERPO, no en la query", async () => {
    let init: RequestInit | undefined;
    const espia: typeof fetch = (async (_u: string, i?: RequestInit) => {
      init = i;
      return new Response(JSON.stringify({ access_token: "x" }));
    }) as unknown as typeof fetch;

    await canjearCodigo(CODIGO, APP_ID, SECRET, REDIRECT, espia);

    // En la query el secret queda en el historial del navegador y en los logs
    // del proxy. En el cuerpo, no.
    expect(String(init?.body)).toContain(`client_secret=${SECRET}`);
    expect(String(init?.body)).toContain("grant_type=authorization_code");
  });

  it("devuelve el user_id que viene en la misma respuesta", async () => {
    // El canje trae `user_id` junto al token: no hace falta una segunda llamada
    // para saber quien es, y por eso `THREADS_USER_ID` sale de aqui.
    const r = await canjearCodigo(
      CODIGO,
      APP_ID,
      SECRET,
      REDIRECT,
      httpFalso({ access_token: "tok", user_id: 17841405793187218 })
    );

    expect(r.token).toBe("tok");
    expect(r.userId).toBe("17841405793187218");
  });

  it("un user_id numerico se convierte a string, no se queda number", async () => {
    // `user_id` puede venir como numero. `THREADS_USER_ID` es string en todas
    // partes, y un number colado en la variable haria que la comparacion con
    // el id del API fallara sin motivo aparente.
    const r = await canjearCodigo(
      CODIGO,
      APP_ID,
      SECRET,
      REDIRECT,
      httpFalso({ access_token: "tok", user_id: 17841405793187218 })
    );

    expect(typeof r.userId).toBe("string");
  });

  it("sin user_id devuelve null y no lo inventa", async () => {
    const r = await canjearCodigo(CODIGO, APP_ID, SECRET, REDIRECT, httpFalso({ access_token: "tok" }));

    expect(r.token).toBe("tok");
    expect(r.userId).toBeNull();
  });

  it("un code caducado o gastado dice que es de un solo uso", async () => {
    const r = await canjearCodigo(
      CODIGO,
      APP_ID,
      SECRET,
      REDIRECT,
      httpFalso({ error: { message: "This authorization code has expired." } }, false)
    );

    expect(r.token).toBeNull();
    expect(r.error).toMatch(/expired/i);
  });

  it("sin access_token devuelve error, no un null silencioso", async () => {
    const r = await canjearCodigo(CODIGO, APP_ID, SECRET, REDIRECT, httpFalso({ token_type: "bearer" }));

    expect(r.token).toBeNull();
    expect(r.error).toMatch(/no devolvio access_token/);
  });
});

describe("alargar", () => {
  it("devuelve el token largo con su caducidad en dias", async () => {
    const r = await alargar(
      "TOKEN-CORTO",
      APP_ID,
      SECRET,
      httpFalso({ access_token: "TOKEN-LARGO", expires_in: 5_184_000 })
    );

    expect(r.error).toBeNull();
    expect(r.largo).toBe("TOKEN-LARGO");
    expect(r.dias).toBe(60);
  });

  it("NUNCA devuelve el mismo token que le han dado", async () => {
    // El fallo que este test evita: un token de 1 hora escrito como si durara
    // 60 dias, con `.env.local` identico y el problema visible semanas despues.
    const r = await alargar("TOKEN-CORTO", APP_ID, SECRET, httpFalso({ access_token: "TOKEN-CORTO" }));

    expect(r.largo).toBeNull();
    expect(r.error).toMatch(/MISMO token/i);
  });

  it("usa grant_type=th_exchange_token, que es el de Threads", async () => {
    let cuerpo = "";
    const espia: typeof fetch = (async (_u: string, i?: RequestInit) => {
      cuerpo = String(i?.body);
      return new Response(JSON.stringify({ access_token: "largo" }));
    }) as unknown as typeof fetch;

    await alargar("corto", APP_ID, SECRET, espia);

    // El de Facebook es `fb_exchange_token`. Si alguien copia el script de
    // Facebook, este test falla.
    //
    // La comparacion no puede ser "no contiene fb_exchange_token": `th_exchange_
    // token` **contiene** esa subcadena, asi que un `not.toContain` de la version
    // de Facebook se cumple con el valor correcto y no protegeria nada. Se
    // compara el parametro entero.
    expect(cuerpo).toContain("grant_type=th_exchange_token");
    expect(cuerpo).not.toMatch(/[?&]grant_type=fb_exchange_token/);
    expect(cuerpo).not.toMatch(/[?&]grant_type=fb_exchange/);
  });

  it("va tambien a graph.threads.com, el mismo endpoint", async () => {
    let pedida = "";
    const espia: typeof fetch = (async (u: string) => {
      pedida = u;
      return new Response(JSON.stringify({ access_token: "largo" }));
    }) as unknown as typeof fetch;

    await alargar("corto", APP_ID, SECRET, espia);

    expect(pedida).toBe("https://graph.threads.com/oauth/access_token");
  });
});

describe("leerPerfil", () => {
  it("devuelve el user id y el usuario", async () => {
    const p = await leerPerfil("tok", httpFalso({ id: "77602", username: "pressplay_epk" }));

    expect(p.error).toBeNull();
    expect(p.id).toBe("77602");
    expect(p.usuario).toBe("pressplay_epk");
  });

  it("un token invalido devuelve el error, no un id inventado", async () => {
    const p = await leerPerfil(
      "malo",
      httpFalso({ error: { message: "Invalid OAuth 2.0 Access Token" } }, false)
    );

    expect(p.id).toBeNull();
    expect(p.error).toMatch(/invalid/i);
  });
});

describe("el secret de Threads no se filtra", () => {
  const fuente = readFileSync(path.join(process.cwd(), "scripts/threads-token.ts"), "utf8");

  it("no se imprime el app secret", () => {
    expect(fuente).not.toMatch(/console\.(log|error)\([^)]*appSecret/);
  });

  it("el secret no se escribe en .env.local", () => {
    for (const linea of fuente.split("\n").filter((l) => l.includes("escribirEnEnvLocal("))) {
      expect(linea).not.toContain("THREADS_KEY");
      expect(linea).not.toContain("appSecret");
    }
  });

  it("no imprime el authorization code ni ningun token", () => {
    for (const linea of fuente.split("\n").filter((l) => /console\.(log|error)/.test(l))) {
      expect(linea).not.toMatch(/\$\{codigo\}/);
      expect(linea).not.toMatch(/\$\{corto\}/);
      expect(linea).not.toMatch(/\$\{largo\}/);
    }
  });
});