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
): Promise<{ token: string | null; error: string | null }> {
  const url =
    `${HOST}/oauth/access_token` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&grant_type=authorization_code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code=${encodeURIComponent(codigo)}`;

  const r = await fetchImpl(url);
  const cuerpo = (await r.json().catch(() => ({}))) as {
    access_token?: string;
    error?: { message?: string } | string;
  };

  if (cuerpo.error !== undefined) {
    const msg =
      typeof cuerpo.error === "string" ? cuerpo.error : (cuerpo.error.message ?? "error desconocido");
    return { token: null, error: msg };
  }
  if (typeof cuerpo.access_token !== "string" || cuerpo.access_token === "") {
    return { token: null, error: "Threads no devolvio access_token" };
  }
  return { token: cuerpo.access_token, error: null };
}

/** Intercambia el token corto por uno de larga duracion (60 dias). */
export async function alargar(
  tokenCorto: string,
  appId: string,
  appSecret: string,
  fetchImpl: typeof fetch
): Promise<{ largo: string | null; dias: number | null; error: string | null }> {
  const url =
    `${HOST}/oauth/access_token` +
    `?grant_type=th_exchange_token` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(tokenCorto)}`;

  const r = await fetchImpl(url);
  const cuerpo = (await r.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string } | string;
  };

  if (cuerpo.error !== undefined) {
    const msg =
      typeof cuerpo.error === "string" ? cuerpo.error : (cuerpo.error.message ?? "error desconocido");
    return { largo: null, dias: null, error: msg };
  }
  if (typeof cuerpo.access_token !== "string" || cuerpo.access_token === "") {
    return { largo: null, dias: null, error: "Threads no devolvio access_token" };
  }
  if (cuerpo.access_token === tokenCorto) {
    return {
      largo: null,
      dias: null,
      error: "Threads devolvio el MISMO token de entrada: no se ha intercambiado nada.",
    };
  }

  return {
    largo: cuerpo.access_token,
    dias: typeof cuerpo.expires_in === "number" ? Math.round(cuerpo.expires_in / 86_400) : null,
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
    throw new Error(
      "Falta el authorization code.\n" +
        "  Se obtiene asi:\n" +
        "  1. developers.facebook.com > tu app > Casos de uso > Acceder a la API de Threads\n" +
        "     > Permisos de acceso web > anade el boton y acepta la invitacion.\n" +
        "  2. Abre el Authorization Window con THREADS_USER_ID=me:\n" +
        "     https://www.facebook.com/v19.0/dialog/oauth\n" +
        "       ?client_id=" + appId + "\n" +
        "       &redirect_uri=" + encodeURIComponent(redirectFlag ?? "http://localhost:3000/auth/meta/callback") + "\n" +
        "       &response_type=code\n" +
        "       &scope=threads_basic,threads_content_publish\n" +
        "     3. Meta redirige a tu redirect_uri con ?code=... — ese code es el que hace falta.\n" +
        "  Pasa despues:  npx tsx scripts/threads-token.ts --code=PEQUE_CODIGO"
    );
  }

  const redirectUri = redirectFlag ?? leer("THREADS_REDIRECT_URI") ?? "http://localhost:3000/auth/meta/callback";

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