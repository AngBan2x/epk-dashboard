#!/usr/bin/env tsx
/**
 * RC.37 — Sacar el token de Page y el ID de Instagram de un token de usuario.
 *
 * ## El problema que resuelve
 *
 * El login devuelve **un token de usuario**, y ese no es el que necesita
 * `facebook.ts`. Para `POST /{page-id}/feed` hace falta un **token de Page**, que
 * es otro objeto distinto. `lib/social/config.ts` mapeaba una sola variable a los
 * dos papeles; en producción eso es un 401 que habla de permisos del usuario y
 * no del token, que es la forma más cara de fallar que hay.
 *
 * ## Un GET y las tres cosas
 *
 * ```
 * GET /me/accounts?fields=id,name,access_token,instagram_business_account
 * ```
 *
 * Cada elemento trae `id` (Page), `access_token` (de Page) e
 * `instagram_business_account.id`. **Un solo GET** da las tres credenciales. Se
 *Confirmed de que existe una segunda llamada para "sacar el token de la Page"
 * que resultaba innecesaria.
 *
 * ## Por qué NO elige la Page a ciegas
 *
 * `/me/accounts` devuelve *todas* las Pages sobre las que el usuario tiene
 * tareas. Con más de una, quedarse con la primera significa publicar en una Page
 * que nadie ha mirado, y el síntoma llega **después** del post, en la cuenta
 * equivocada. Con varias, este script para y las lista; con `--page-id` se elige
 * a mano. Hay un test que ata ese comportamiento.
 *
 * ## Dry-run por defecto
 *
 * Como `scripts/qa-cleanup.ts` y `scripts/create-demo-artist.ts`. Escribe en
 * `.env.local`, que está en `.gitignore`, pero un token pegado en el sitio
 * equivocado es un token filtrado: un `--apply` sin querer escribe el token real
 * en un fichero de pruebas.
 *
 * ## Uso
 *
 * ```
 * npx tsx scripts/meta-page-token.ts                       # dry-run
 * npx tsx scripts/meta-page-token.ts --apply               # escribe
 * npx tsx scripts/meta-page-token.ts --apply --page-id=123 # si hay varias Pages
 * ```
 *
 * ## Lo que imprime
 *
 * Nombres de variable y longitudes. **Ningún valor.** Ya lo dice
 * `scripts/social-check.ts`: un informe que dice "META_PAGE_ACCESS_TOKEN: ok
 * (217 caracteres)" acaba con un token pegado en un issue.
 */

import { config } from "dotenv";

// El módulo que LEE el entorno lo CARGA (ver `scripts/lib/credentials.ts`): en
// ES modules los imports se evaluan antes que el cuerpo del módulo, así que un
// `config()` en el consumidor corre DESPUÉS de que otro ya haya leído un
// `process.env` vacío.
config({ path: ".env.local" });

import { escribirEnEnvLocal } from "./lib/env-local";
import {
  leerCuentas,
  elegirPage,
  type PageElegida,
  type RespuestaCuentas,
} from "../lib/social/meta";

const API_VERSION = "v26.0";
const HOST = `https://graph.facebook.com/${API_VERSION}`;

const CAMPOS = "id,name,access_token,instagram_business_account";

async function desdeMeAccounts(token: string): Promise<PageElegida> {
  const url = `${HOST}/me/accounts?fields=${encodeURIComponent(CAMPOS)}&access_token=${encodeURIComponent(token)}`;

  const respuesta = await fetch(url);
  const cuerpo = (await respuesta.json()) as RespuestaCuentas;

  if (!respuesta.ok || cuerpo.error) {
    throw errorDeApi(cuerpo, respuesta.status);
  }

  return elegirPage(leerCuentas(cuerpo));
}

/** Error de la API de Meta, con su codigo, para no perderlo al formatear. */
function errorDeApi(cuerpo: RespuestaCuentas, estado: number): Error {
  const mensaje =
    cuerpo.error && typeof cuerpo.error.message === "string" ? cuerpo.error.message : "sin mensaje";

  const caducado = mensaje.includes("190") || mensaje.toLowerCase().includes("expired");
  const explicacion = [
    caducado ? "El token ha caducado o esta mal formado. Vuelve al login y pega uno nuevo." : null,
    estado === 401 ? "El token no es valido, o le falta `pages_show_list`." : null,
    estado === 403 ? "El token no tiene permiso para esta operacion." : null,
  ]
    .filter((x): x is string => x !== null)
    .join(" ");

  return new Error(`La API de Meta respondio ${estado}: ${mensaje}${explicacion ? `\n  ${explicacion}` : ""}`);
}

/** La escritura en .env.local vive en scripts/lib/env-local.ts: lo comparten este
 * script y meta-long-lived-token.ts, y duplicar la regexp en ambos es duplicar
 * el modo de romperse. Ahi esta escrito el por que de la flag m.
 */

/**
 * Consulta la Page directamente por su id, saltándose `/me/accounts`.
 *
 * ## Por qué hace falta este camino
 *
 * Porque hay **dos** clases de problema que se ven igual desde fuera:
 *
 * - Una Page **nueva** que el usuario todavía no tiene asignada como tarea.
 * - Un token que **no ve** ninguna Page.
 *
 * En las dos, `/me/accounts` devuelve `data: []`. Y con la lista vacía no hay
 * forma de obtener **ningún** token de Page, que es justo lo que hace falta.
 *
 * ## El id que hay que usar
 *
 * **El de `facebook.com/profile.php?id=...` NO es el de la Graph API.**
 *
 * ```
 * 61595566701130    -> "Object does not exist"
 * 1306361615901216  -> responde
 * ```
 *
 * ## Un detalle que costó tiempo
 *
 * Pedir `fields=...,tasks` falla con `#100 Tried accessing nonexisting field
 * (tasks)`. Es un error de **campo**, no de permiso: `tasks` no existe en ese
 * nodo, y confundirlos hace creer que el token no tiene acceso cuando sí lo
 * tiene. Aquí solo se piden campos que existen.
 */
async function consultarPageDirecta(pageId: string, token: string): Promise<PageElegida> {
  const url =
    `${HOST}/${encodeURIComponent(pageId)}?fields=${encodeURIComponent(CAMPOS)}` +
    `&access_token=${encodeURIComponent(token)}`;

  const respuesta = await fetch(url);
  const cuerpo = (await respuesta.json()) as RespuestaCuentas & {
    id?: string;
    name?: string;
    access_token?: string;
    instagram_business_account?: { id?: string };
  };

  if (!respuesta.ok) {
    const mensaje = typeof cuerpo.error?.message === "string" ? cuerpo.error.message : "sin mensaje";
    if (/does not exist|Unsupported get request/i.test(mensaje)) {
      throw new Error(
        `La Page ${pageId} no existe para este token.\n` +
          `  El id de profile.php?id=... NO es el de la Graph API. El bueno es el\n` +
          `  que sale en el dialogo "Elige las Paginas a las que quieras que acceda".\n` +
          `  API: ${mensaje}`
      );
    }
    throw errorDeApi(cuerpo, respuesta.status);
  }

  const ig = cuerpo.instagram_business_account;

  return {
    id: cuerpo.id ?? pageId,
    nombre: cuerpo.name ?? null,
    accessToken: cuerpo.access_token ?? "",
    igUserId: typeof ig?.id === "string" ? ig.id : null,
    otras: [],
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const aplicar = args.includes("--apply");

  const pedido = args.find((a) => a.startsWith("--page-id="))?.slice("--page-id=".length);

  const tokenUsuario = (process.env.META_USER_ACCESS_TOKEN ?? "").trim();
  if (tokenUsuario === "") {
    throw new Error(
      "Falta META_USER_ACCESS_TOKEN en .env.local.\n" +
        "  Sale de la pagina app/auth/meta/callback, que lo lee del login de Meta.\n" +
        "  El valor va con el prefijo EAA... y tiene que estar entero: pegado a mano\n" +
        "  y truncado devuelve un 401 identico al de uno caducado, y no hay forma\n" +
        "  de distinguirlos."
    );
  }

  const elegida = pedido
    ? await consultarPageDirecta(pedido, tokenUsuario)
    : await desdeMeAccounts(tokenUsuario);

  console.log(`\nRC.37 · token de Page y ID de Instagram`);
  console.log(`  Page: ${elegida.id}  ${elegida.nombre ?? "(sin nombre)"}`);
  console.log(`  Instagram vinculado: ${elegida.igUserId ?? "NINGUNO"}`);
  console.log("");
  console.log("  A escribir en .env.local:");
  console.log(`    META_PAGE_ID            ${elegida.id}`);
  console.log(`    META_PAGE_ACCESS_TOKEN  <${elegida.accessToken.length} caracteres>`);
  console.log(`    META_IG_USER_ID         ${elegida.igUserId ?? "<no se escribe: IG no esta vinculado>"}`);
  console.log("");

  if (elegida.igUserId === null) {
    console.log("  AVISO: la API no ha devuelto una cuenta de Instagram vinculada a esta Page.");
    console.log("  Se escribe el token de Page, pero META_IG_USER_ID quedara vacio y");
    console.log("  `social-check.ts` seguira marcando Instagram como incompleta.");
    console.log("");
  }

  if (!aplicar) {
    console.log("  Dry-run: no se ha escrito nada. Usa --apply.");
    return;
  }

  escribirEnEnvLocal("META_PAGE_ID", elegida.id);
  escribirEnEnvLocal("META_PAGE_ACCESS_TOKEN", elegida.accessToken);
  if (elegida.igUserId !== null) {
    escribirEnEnvLocal("META_IG_USER_ID", elegida.igUserId);
  }

  console.log("  Escrito en .env.local. Nada se ha impreso: ningun token sale por pantalla.");
  console.log("");
  console.log("  Comprobacion:");
  console.log("    npx tsx scripts/social-check.ts");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});