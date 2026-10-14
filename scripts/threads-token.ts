#!/usr/bin/env tsx
/**
 * RC.39 — Token de Threads.
 *
 * ## Por que Threads no se resuelve con lo de Facebook
 *
 * La documentacion de Meta es explicita:
 *
 * > "When creating your app there will be **2 app IDs and app secrets**. For
 * > Threads API implementation purposes, use the **Threads app ID** and its
 * > corresponding app secret."
 *
 * Threads no es un permiso mas de la app de Facebook: es un par de credenciales
 * propio. Ya estan en `.env.local` (`THREADS_APP_ID`, `THREADS_KEY`), y son
 * distintas de las de Facebook —comprobado, no son el mismo numero.
 *
 * ## El flujo, y por que tiene estos pasos
 *
 * 1. El usuario se autentica en el **Authorization Window** y Meta redirige con
 *    un **authorization code** en la query. Ese codigo vale **1 hora**.
 * 2. El codigo se cambia por un **access token de corta duracion** (tambien 1 hora).
 * 3. Ese token corto se **intercambia** por uno de larga duracion (**60 dias**),
 *    igual que en Facebook.
 *
 * Los pasos 2 y 3 los hace este script con `THREADS_APP_ID` y `THREADS_KEY`. El
 * paso 1 lo tiene que hacer el usuario en su navegador.
 *
 * ## Por que NO se usa el token de Facebook
 *
 * El adaptador ya tiene un test que se pone rojo si alguien hace que Threads lea
 * `META_ACCESS_TOKEN`: no son intercambiables. Threads corre en
 * `graph.threads.net`, que es otro dominio, y su token lo emite otra app.
 *
 * ## Lo que este script NO imprime
 *
 * Ningun token. Solo la longitud, el user id y la fecha de caducidad. El
 * authorization code es de un solo uso y de una hora: si se queda en un terminal
 * o en un historial, se gasta sin dar cuenta.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { escribirEnEnvLocal } from "./lib/env-local";

const HOST = "https://graph.threads.net";
/** El endpoint del canje vive en `.com`, no en `.net`. Comprobado. */
const CANJE = "https://graph.threads.com/oauth/access_token";
const VERSION = "v1.0";

function leer(nombre: string): string {
  return (process.env[nombre] ?? "").trim();
}

/**
 * Cambia un authorization code por un token de corta duracion.
 *
 * Exportada para testearla con una capa HTTP falsa. `client_secret` va en la
 * query porque el endpoint es un GET de OAuth; el **secreto no se imprime** y no
 * se escribe en ningun sitio del codigo.
 */
export async function canjearCodigo(
  codigo: string,
  appId: string,
  appSecret: string,
  redirectUri: string,
  fetchImpl: typeof fetch
): Promise<{ token: string | null; error: string | null; userId: string | null }> {
  const cuerpo = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code: codigo,
  });

  // `POST` con cuerpo `application/x-www-form-urlencoded`. **No** es multipart:
  // la documentacion de Threads usa `-F`, que es multipart, pero tambien acepta
  // form-urlencoded y este va bien con un token que no debe salir en la URL —
  // el secret viaja en el CUERPO, no en la query.
  const r = await fetchImpl(CANJE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: cuerpo.toString(),
  });
  const json = (await r.json().catch(() => ({}))) as {
    access_token?: string;
    user_id?: string | number;
    error?: { message?: string } | string;
  };

  if (json.error !== undefined) {
    const msg =
      typeof json.error === "string" ? json.error : (json.error.message ?? "error desconocido");
    return { token: null, error: msg, userId: null };
  }
  if (typeof json.access_token !== "string" || json.access_token === "") {
    return { token: null, error: "Threads no devolvio access_token", userId: null };
  }
  return {
    token: json.access_token,
    error: null,
    userId: typeof json.user_id === "string" || typeof json.user_id === "number" ? String(json.user_id) : null,
  };
}

/** Intercambia el token corto por uno de larga duracion (60 dias). */
export async function alargar(
  tokenCorto: string,
  appId: string,
  appSecret: string,
  fetchImpl: typeof fetch
): Promise<{ largo: string | null; dias: number | null; error: string | null }> {
  const cuerpo = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: tokenCorto,
  });

  const r = await fetchImpl(CANJE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: cuerpo.toString(),
  });
  const json = (await r.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string } | string;
  };

  if (json.error !== undefined) {
    const msg =
      typeof json.error === "string" ? json.error : (json.error.message ?? "error desconocido");
    return { largo: null, dias: null, error: msg };
  }
  if (typeof json.access_token !== "string" || json.access_token === "") {
    return { largo: null, dias: null, error: "Threads no devolvio access_token" };
  }
  if (json.access_token === tokenCorto) {
    return {
      largo: null,
      dias: null,
      error: "Threads devolvio el MISMO token de entrada: no se ha intercambiado nada.",
    };
  }

  return {
    largo: json.access_token,
    dias: typeof json.expires_in === "number" ? Math.round(json.expires_in / 86_400) : null,
    error: null,
  };
}

/** Lee el perfil de Threads para obtener el `threadsUserId`. */
export async function leerPerfil(
  token: string,
  fetchImpl: typeof fetch
): Promise<{ id: string | null; usuario: string | null; error: string | null }> {
  const r = await fetchImpl(
    `${HOST}/${VERSION}/me?fields=id,username&access_token=${encodeURIComponent(token)}`
  );
  const cuerpo = (await r.json().catch(() => ({}))) as {
    id?: string;
    username?: string;
    error?: { message?: string } | string;
  };

  if (!r.ok) {
    const e = cuerpo.error;
    const msg = typeof e === "string" ? e : (e?.message ?? `HTTP ${r.status}`);
    return { id: null, usuario: null, error: msg };
  }

  return { id: cuerpo.id ?? null, usuario: cuerpo.username ?? null, error: null };
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes("--apply");
  const flags = process.argv.slice(2);
  const codigoFlag = flags.find((f) => f.startsWith("--code="))?.slice("--code=".length);
  const tokenFlag = flags.find((f) => f.startsWith("--token="))?.slice("--token=".length);
  const redirectFlag = flags.find((f) => f.startsWith("--redirect-uri="))?.slice("--redirect-uri=".length);

  const appId = leer("THREADS_APP_ID");
  const appSecret = leer("THREADS_KEY");

  if (appId === "" || appSecret === "") {
    throw new Error(
      "Faltan THREADS_APP_ID o THREADS_KEY en .env.local.\n" +
        "  Son el App ID y el App Secret **de Threads**, no los de Facebook. Threads usa\n" +
        "  su propio par de credenciales (ver docs/PHASE_P13.md)."
    );
  }

  console.log(`\nRC.39 · token de Threads`);
  console.log(`  app  ${appId}`);

  // ── Via del generador del dashboard ──────────────────────────────────────
  //
  // El flujo normal es Authorization Window -> code -> token. Ese flujo esta
  // atascado en `1349168` ("la URI no esta incluida en la lista de autorizacion
  // OAuth"), que se ha resistido a cuatro intentos de configuracion.
  //
  // Pero el panel trae un **Generador de identificadores de usuario** que emite
  // un token de larga duracion **directo**, sin Authorization Window y sin
  // `redirect_uri`. Solo funciona para cuentas que ya son **evaluadores de
  // Threads** de la app, que es el caso de `pressplayepk`.
  //
  // El flag `--token=` gana sobre la variable de entorno para no dejar el token
  // en el historial de PowerShell: en PowerShell se pondria
  // `$env:THREADS_DASHBOARD_TOKEN` en la sesion, no en un comando.
  const tokenDirecto = tokenFlag || leer("THREADS_DASHBOARD_TOKEN") || "";
  if (tokenDirecto !== "") {
    const perfil = await leerPerfil(tokenDirecto, fetch);
    if (perfil.error !== null || perfil.id === null) {
      throw new Error(
        `El token del generador no puede leer el perfil: ${perfil.error}\n` +
          "  Dos causas, segun lo que diga el mensaje de Meta:\n" +
          "  - La cuenta no es **evaluadora de Threads** de esta app.\n" +
          "  - El perfil es privado: el generador no emite tokens para esos perfiles."
      );
    }
    console.log(`  token  ${tokenDirecto.length} caracteres (generador del dashboard)`);
    console.log(`  user   ${perfil.id}  (@${perfil.usuario})\n`);

    if (!aplicar) {
      console.log("  Dry-run. Usa --apply para escribir.");
      return;
    }

    // No se pasa por `th_exchange_token`: el token del generador ya es largo, y
    // ese canje **consume** el token de entrada. Pasarselo lo gastaria.
    escribirEnEnvLocal("THREADS_ACCESS_TOKEN", tokenDirecto);
    escribirEnEnvLocal("THREADS_USER_ID", perfil.id);
    console.log("  Escrito: THREADS_ACCESS_TOKEN, THREADS_USER_ID");
    console.log("  Ningun valor impreso. Comprobacion:");
    console.log("    npx tsx scripts/social-smoke.ts");
    return;
  }

  // Si ya hay token largo, solo hay que leer el perfil para saber el user id.
  const yaHay = leer("THREADS_ACCESS_TOKEN");
  if (yaHay !== "" && codigoFlag === undefined) {
    console.log(`  ya hay token (${yaHay.length} chars), solo se lee el perfil\n`);
    const perfil = await leerPerfil(yaHay, fetch);
    if (perfil.error !== null) throw new Error(`El token guardado no vale: ${perfil.error}`);
    console.log(`  Threads user id  ${perfil.id}  (@${perfil.usuario})`);
    return;
  }

  const codigo = codigoFlag ?? leer("THREADS_AUTH_CODE");
  if (codigo === "") {
    const redirect =
      redirectFlag || leer("THREADS_REDIRECT_URI") || "http://localhost:3000/auth/meta/callback";
    throw new Error(
      [
        "Falta el authorization code.",
        "",
        "  Se obtiene asi:",
        "",
        "  1. developers.facebook.com > tu app > Casos de uso",
        "     > Acceder a la API de Threads > Permisos de acceso web",
        "     > anade el boton y acepta la invitacion.",
        "",
        "  2. Abre el Authorization Window **de Threads**, que esta en threads.com:",
        "",
        `     https://threads.com/oauth/authorize?client_id=${appId}`,
        `       &redirect_uri=${encodeURIComponent(redirect)}`,
        "       &response_type=code",
        "       &scope=threads_basic,threads_content_publish",
        "",
        "  3. Threads redirige a esa URI con ?code=... — ese code es el que hace falta.",
        "",
        "     NO vale la de facebook.com/dialog/oauth: esa es el login de Facebook",
        "     y rechaza el App ID de Threads con PLATFORM_INVALID_APP_ID.",
        "",
        "     Threads anade un #_ al final del code. El code es lo de antes del #_.",
        "",
        "  Luego:",
        "",
        "     npx tsx scripts/threads-token.ts --code=PEQUE_CODIGO --apply",
      ].join("\n")
    );
  }
  // `||` y no `??`, y en los tres sitios donde aparece este valor.
  //
  // `??` solo salta ante `null`/`undefined`, no ante `""`. Con
  // `THREADS_REDIRECT_URI=` (presente pero vacía, que es justo lo que hace un
  // editor al guardar una variable sin valor) `??` se queda con `""` y el canje
  // sale con `redirect_uri=` a pelo. Threads lo rechaza, y el error que devuelve
  // no dice nada de la redirect_uri: parece un code caducado, que no es.
  const redirectUri =
    redirectFlag || leer("THREADS_REDIRECT_URI") || "http://localhost:3000/auth/meta/callback";

  // 2. code -> token corto
  const { token: corto, error: errCorto } = await canjearCodigo(codigo, appId, appSecret, redirectUri, fetch);
  if (corto === null) {
    throw new Error(
      `No se ha podido canjear el codigo: ${errCorto}\n` +
        "  Los authorization codes duran **1 hora** y son de un solo uso. Si falla,\n" +
        "  pide uno nuevo: no hay forma de recuperarlo."
    );
  }
  console.log(`  corto  ${corto.length} caracteres`);

  // 3. corto -> largo
  const { largo, dias, error: errLargo } = await alargar(corto, appId, appSecret, fetch);
  if (largo === null) {
    throw new Error(`No se ha podido alargar el token: ${errLargo}`);
  }
  console.log(`  largo  ${largo.length} caracteres  (caduca en ${dias ?? "?"} dias)`);

  // 4. El user id
  const perfil = await leerPerfil(largo, fetch);
  if (perfil.error !== null || perfil.id === null) {
    throw new Error(`El token largo no puede leer el perfil: ${perfil.error}`);
  }
  console.log(`  user   ${perfil.id}  (@${perfil.usuario})`);
  console.log("");

  if (!aplicar) {
    console.log("  Dry-run. Usa --apply para escribir.");
    return;
  }

  escribirEnEnvLocal("THREADS_ACCESS_TOKEN", largo);
  escribirEnEnvLocal("THREADS_USER_ID", perfil.id);

  console.log("  Escrito: THREADS_ACCESS_TOKEN, THREADS_USER_ID");
  console.log("  Ningun valor impreso. Comprobacion:");
  console.log("    npx tsx scripts/social-smoke.ts");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});