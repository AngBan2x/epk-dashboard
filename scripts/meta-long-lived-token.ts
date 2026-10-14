/**
 * RC.37 — Intercambiar un token de corta duracion por uno de larga duracion.
 *
 * ## Por que hace falta
 *
 * El token que sale del Explorador de la Graph API dura **una hora**. Con el
 * flujo ese, cada vez que se acaba un token hay que pedir otro al usuario, y en
 * una sesion de trabajo eso pasa cada hora. No es un problema de permisos: es un
 * problema de caducidad.
 *
 * Con `META_APP_ID` y `META_KEY` —que llevaba meses en `.env.local` sin que nada
 * las usara— se hace un intercambio y sale:
 *
 * ```
 * GET /oauth/access_token
 *   ?grant_type=fb_exchange_token
 *   &client_id={META_APP_ID}
 *   &client_secret={META_KEY}
 *   &fb_exchange_token={token corto}
 * ```
 *
 * El token de usuario resultante dura **~60 dias**. Y de ese sale, consultando la
 * Page por su id, un **token de Page que no caduca nunca**:
 *
 * > "Long-lived Page access token do not have an expiration date and only expire
 * > or are invalidated under certain conditions."
 *
 * Que es justo lo que necesita `lib/social/facebook.ts`: `POST /{page-id}/feed`
 * con algo que siga valiendo dentro de seis meses.
 *
 * ## Por que el app secret no sale nunca de aqui
 *
 * Va en la URL de la llamada, asi que el pedido **tiene que hacerse desde el
 * servidor**. Este script corre en local y no imprime nada: ni el token corto,
 * ni el largo, ni el de Page. Solo cuenta caracteres y nombres.
 *
 * ## Si el token corto esta caducado
 *
 * El intercambio devuelve `190`. Se dice explicitamente, porque un `190` aqui
 * significa "pide otro al usuario", no "revisa los permisos".
 */

import { config } from "dotenv";

// Este import carga `.env.local` por su cuenta (ver `scripts/lib/credentials.ts`).
config({ path: ".env.local" });

import { escribirEnEnvLocal } from "./lib/env-local";

const HOST = "https://graph.facebook.com/v26.0";

interface Intercambio {
  readonly access_token?: string;
  readonly expires_in?: number;
  readonly error?: { readonly message?: string; readonly code?: number };
}

function leer(nombre: string): string {
  return (process.env[nombre] ?? "").trim();
}

function faltan(): string[] {
  return ["META_USER_ACCESS_TOKEN", "META_APP_ID", "META_KEY"].filter((k) => leer(k) === "");
}

/**
 * Intercambia un token corto por uno de larga duracion.
 *
 * Exportada para poder testearla con una capa HTTP falsa. Hace exactamente una
 * llamada GET y devuelve lo que Meta respondio, sin interpretar nada: quien
 * decide si el resultado sirve es `main`, que si puede dar un mensaje util.
 */
export async function intercambiar(
  tokenCorto: string,
  appId: string,
  appSecret: string,
  fetchImpl: typeof fetch
): Promise<{ largo: string | null; expiraEn: number | null; error: string | null }> {
  const url =
    `${HOST}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(tokenCorto)}`;

  const r = await fetchImpl(url);
  const cuerpo = (await r.json().catch(() => ({}))) as Intercambio;

  if (cuerpo.error !== undefined) {
    return { largo: null, expiraEn: null, error: cuerpo.error.message ?? "error desconocido" };
  }

  if (typeof cuerpo.access_token !== "string" || cuerpo.access_token === "") {
    return { largo: null, expiraEn: null, error: "Meta no devolvio access_token" };
  }

  // Un intercambio que devuelve el token **de entrada** no ha intercambiado nada.
  // Escribirlo seria inofensivo —el fichero queda igual— y el fallo apareceria
  // meses despues, cuando caducara, sin relacion con este script. Se para aqui
  // en vez de avisar por pantalla, porque un token de 1 hora que se ha guardado
  // creyendo que es de 60 dias es peor que ningun token.
  if (cuerpo.access_token === tokenCorto) {
    return {
      largo: null,
      expiraEn: null,
      error: "Meta devolvio el MISMO token de entrada: no se ha intercambiado nada.",
    };
  }

  return {
    largo: cuerpo.access_token,
    expiraEn: typeof cuerpo.expires_in === "number" ? cuerpo.expires_in : null,
    error: null,
  };
}

interface PageLeida {
  readonly id: string | null;
  readonly nombre: string | null;
  readonly token: string | null;
  readonly igUserId: string | null;
  readonly error: string | null;
}

/** Lee la Page con un token de usuario y saca su token de Page. */
export async function leerPage(
  pageId: string,
  tokenUsuario: string,
  fetchImpl: typeof fetch
): Promise<PageLeida> {
  const url =
    `${HOST}/${encodeURIComponent(pageId)}` +
    `?fields=id,name,access_token,instagram_business_account` +
    `&access_token=${encodeURIComponent(tokenUsuario)}`;

  const r = await fetchImpl(url);
  const cuerpo = await r.json().catch(() => ({}));

  if (!r.ok) {
    const err = (cuerpo as { error?: { message?: string } }).error;
    return { id: null, nombre: null, token: null, igUserId: null, error: err?.message ?? `HTTP ${r.status}` };
  }

  const p = cuerpo as {
    id?: string;
    name?: string;
    access_token?: string;
    instagram_business_account?: { id?: string };
  };
  const ig = p.instagram_business_account;

  return {
    id: p.id ?? null,
    nombre: p.name ?? null,
    token: typeof p.access_token === "string" ? p.access_token : null,
    igUserId: typeof ig?.id === "string" ? ig.id : null,
    error: null,
  };
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes("--apply");

  const ausentes = faltan();
  if (ausentes.length > 0) {
    throw new Error(
      `Faltan variables en .env.local: ${ausentes.join(", ")}\n` +
        `  META_APP_ID y META_KEY son el App ID y el App Secret de la app de Facebook.\n` +
        `  Panel > Configuracion de la app > Basico > App Secret > Mostrar.`
    );
  }

  const corto = leer("META_USER_ACCESS_TOKEN");
  const appId = leer("META_APP_ID");
  const appSecret = leer("META_KEY");
  const pageId = leer("META_PAGE_ID");

  if (pageId === "") {
    throw new Error(
      "Falta META_PAGE_ID en .env.local.\n" +
        "  El id de profile.php?id=... NO es el de la Graph API. El bueno sale en el\n" +
        "  dialogo de Facebook Login for Business, en 'Elige las Paginas a las que\n" +
        "  quieras que acceda', y es el que tiene 16 digitos."
    );
  }

  console.log(`\nRC.37 · token de larga duracion\n`);
  console.log(`  app     ${appId}`);
  console.log(`  Page    ${pageId}`);
  console.log(`  corto   ${corto.length} caracteres`);

  // 1. El intercambio.
  const { largo, expiraEn, error } = await intercambiar(corto, appId, appSecret, fetch);
  if (largo === null) {
    const caducado = /\b190\b|expired|invalid session/i.test(error ?? "");
    throw new Error(
      `El intercambio ha fallado: ${error}\n` +
        (caducado
          ? `  El token corto ha caducado. Vuelve al Explorador, Generate Access Token\n` +
            `  con instagram_basic, instagram_content_publish, pages_show_list y\n` +
            `  pages_read_engagement, y pegalo de nuevo como META_USER_ACCESS_TOKEN.\n` +
            `  El Explorador NO da tokens largos: da uno de 1 hora, y este script es\n` +
            `  el que lo convierte.`
          : `  Si no es un 190, el problema no es el token. Revisa que META_APP_ID y\n` +
            `  META_KEY sean los de ESTA app.`)
    );
  }

  const dias = expiraEn === null ? null : Math.round(expiraEn / 86_400);
  console.log(`  largo   ${largo.length} caracteres  (caduca en ${dias ?? "?"} dias)`);

  // 2. El token de Page, que ya no caduca.
  const page = await leerPage(pageId, largo, fetch);
  if (page.error !== null) {
    throw new Error(`No se ha podido leer la Page ${pageId}: ${page.error}`);
  }
  if (page.token === null) {
    throw new Error(
      `Meta no ha devuelto token de Page para ${pageId}.\n` +
        `  Un token de usuario sin tarea sobre la Page no puede derivar uno de Page.\n` +
        `  El usuario ${leer("META_USER_ACCESS_TOKEN").slice(0, 12)}... tiene que administrar\n` +
        `  la Page. Es el caso de una Page recien creada: la tarea tarda en reflejarse.`
    );
  }

  console.log(`  Page    "${page.nombre}" (${page.id})`);
  console.log(`  token de Page  ${page.token.length} caracteres  (no caduca)`);
  console.log(`  Instagram      ${page.igUserId ?? "SIN VINCULAR"}`);
  console.log("");

  if (!aplicar) {
    console.log("  Dry-run: no se ha escrito nada. Usa --apply.");
    return;
  }

  escribirEnEnvLocal("META_USER_ACCESS_TOKEN", largo);
  escribirEnEnvLocal("META_PAGE_ACCESS_TOKEN", page.token);
  if (page.id !== null) escribirEnEnvLocal("META_PAGE_ID", page.id);
  if (page.igUserId !== null) escribirEnEnvLocal("META_IG_USER_ID", page.igUserId);

  console.log("  Escrito en .env.local:");
  console.log("    META_USER_ACCESS_TOKEN    <el largo, ~60 dias>");
  console.log("    META_PAGE_ACCESS_TOKEN   <el de Page, sin caducidad>");
  if (page.igUserId !== null) console.log("    META_IG_USER_ID          <el de Instagram>");
  console.log("");
  console.log("  Ningun valor se ha impreso. Comprobacion:");
  console.log("    npx tsx scripts/social-smoke.ts");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});