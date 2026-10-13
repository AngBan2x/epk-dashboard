/**
 * P13 — La fuente unica de las credenciales sociales.
 *
 * ## Por que un modulo y no `process.env` en cada adaptador
 *
 * Porque hay seis plataformas y cada una necesita un conjunto distinto de
 * variables. Repartidas por los seis adaptadores, esas lecturas serian seis
 * lugares donde un nombre mal escrito produce `undefined` — y un `undefined` que
 * llega a una cabecera `Authorization` se convierte en una peticion a la API
 * real que responde 401 con un error que no dice "te falta una variable", sino
 * algo sobre permisos del usuario que no es el problema.
 *
 * Concentrarlas aqui convierte ese fallo en un mensaje que dice exactamente
 * que falta. Es la misma razon por la que `scripts/lib/credentials.ts` existe
 * para las credenciales de test: **una fuente de verdad, y que falle antes de
 * salir a la red**.
 *
 * ## Por que distingue "falta" de "vacio"
 *
 * `process.env.X ?? DEF` no cae en el default ante una cadena vacia, solo ante
 * `null`/`undefined`. Y una variable presente pero vacia es exactamente lo que
 * deja un `.env.local` con `META_ACCESS_TOKEN=` forgetting borrar el valor. Con
 * `??` ese caso pasa por "definido" y el token viaja vacio.
 *
 * El mismo razonamiento que en `scripts/lib/credentials.ts`, y por el mismo
 * autor: no es un detalle de estilo, es la diferencia entre "no lo he
 * configurado" y "lo he configurado mal" — dos fallos que se diagnostican en
 * sitios distintos.
 *
 * ## Lo que este modulo NO hace
 *
 * No llama a ninguna API, no valida que un token funcione y no imprime ningun
 * valor. Solo responde "tengo lo que esta plataforma necesita" y devuelve las
 * opciones ya en la forma que espera `crearAdaptador()`. Que un token sea
 * *correcto* solo se comprueba contra la API, y eso ya lo hacen los tests de
 * integracion y, mas adelante, una publicacion de prueba real.
 */

import type { CapaHttp } from "./tipos";
import type { OpcionesBluesky } from "./bluesky";
import type { OpcionesThreads } from "./threads";
import type { OpcionesInstagram } from "./instagram";
import type { OpcionesFacebook } from "./facebook";
import type { OpcionesLinkedin } from "./linkedin";
import type { OpcionesMastodon } from "./mastodon";
import type { Plataforma } from "./limites";

/**
 * Lee una variable tratando la cadena vacia como "no definida".
 *
 * Ver la nota del encabezado. El `??` no sirve aqui por la razon de alli.
 */
function leer(nombre: string): string {
  const bruto = process.env[nombre];
  if (bruto === undefined || bruto === null) return "";
  return bruto.trim();
}

/**
 * El host de Graph por defecto.
 *
 * Threads **no** comparte host con Facebook: su API vive en `graph.threads.com`.
 * Es el mismo dominio para threads y para Instagram, y distinto del de Facebook.
 * Los tres lo pasan por defecto, pero separarlos aqui deja el motivo escrito
 * junto al valor.
 */
const HOST_FACEBOOK = "https://graph.facebook.com";

/** Variables que hacen falta para cada plataforma, y por que. */
export interface RequisitosPlataforma {
  readonly plataforma: Plataforma;
  /** Nombres exactos que hay que definir en `.env.local`. */
  readonly variables: readonly string[];
  /** Que pasa si falta algo, en una frase. Para el mensaje de error. */
  readonly motivo: string;
}

export const REQUISITOS: readonly RequisitosPlataforma[] = [
  {
    plataforma: "bluesky",
    variables: ["BLUESKY_USERNAME", "BLUESKY_APP_PASSWORD", "BLUESKY_PDS", "BLUESKY_REPO"],
    motivo:
      "el `repo` es el DID de la cuenta (`did:plc:...`) y el `password` es una app password, no la contrasena de la cuenta",
  },
  {
    plataforma: "mastodon",
    variables: ["MASTODON_URL", "MASTODON_ACCESS_TOKEN"],
    motivo: "el token es un token de acceso de la instancia, no el correo ni la contrasena",
  },
  {
    plataforma: "facebook",
    variables: ["META_PAGE_ID", "META_ACCESS_TOKEN"],
    motivo:
      "el token es un token de Page (`/me/accounts` en Login for Business), no el token de usuario: sin el de Page no puede publicar en la pagina",
  },
  {
    plataforma: "instagram",
    variables: ["META_IG_USER_ID", "META_ACCESS_TOKEN"],
    motivo: "la cuenta debe ser Profesional y estar vinculada a la Page; el `META_IG_USER_ID` es el ID numerico, no el `@nombre`",
  },
  {
    plataforma: "threads",
    variables: ["THREADS_APP_ID", "THREADS_USER_ID", "THREADS_ACCESS_TOKEN"],
    motivo:
      "Threads usa su propio App ID y su propio token: el token de Facebook no vale, aunque la cuenta sea la misma",
  },
  {
    plataforma: "linkedin",
    variables: ["LINKEDIN_AUTHOR_URN", "LINKEDIN_ACCESS_TOKEN"],
    motivo: "el URN tiene forma `urn:li:person:ID` o `urn:li:organization:ID`",
  },
];

/**
 * Una credencial ausente, describida por su nombre de variable y no por su valor.
 *
 * Existe como tipo y no como `string` suelto para que no se pueda imprimir por
 * error: no hay ningun valor dentro, solo el nombre de lo que falta.
 */
export type VariableAusente = string;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; faltan: VariableAusente[] };

function reunirFaltantes(variables: readonly string[]): VariableAusente[] {
  return variables.filter((v) => leer(v) === "");
}

/**
 * Dice si una plataforma tiene lo necesario, sin devolver nada sensible.
 *
 * Pensado para que un script o un panel pueda mostrar "Instagram: falta
 * META_IG_USER_ID" sin poder filtrar un token por accidente: el tipo de retorno
 * son nombres de variables, no valores.
 */
export function estaConfigurada(plataforma: Plataforma): boolean {
  const req = REQUISITOS.find((r) => r.plataforma === plataforma);
  if (!req) return false;
  return reunirFaltantes(req.variables).length === 0;
}

/** Faltantes de una plataforma concreta, en el orden de `REQUISITOS`. */
export function faltanPara(plataforma: Plataforma): VariableAusente[] {
  const req = REQUISITOS.find((r) => r.plataforma === plataforma);
  if (!req) return [];
  return reunirFaltantes(req.variables);
}

/**
 * Un informe por plataforma, para pintar un panel o imprimir en consola.
 *
 * Deliberadamente no incluye ningun valor: solo si esta o no, y que falta. Un
 * informe que dice "META_ACCESS_TOKEN: ok (217 caracteres)" invita a que alguien
 * lo pege en un issue.
 */
export interface InformePlataforma {
  readonly plataforma: Plataforma;
  readonly configurada: boolean;
  readonly faltan: readonly VariableAusente[];
  readonly motivo: string;
}

export function informe(): readonly InformePlataforma[] {
  return REQUISITOS.map((req) => {
    const faltan = reunirFaltantes(req.variables);
    return {
      plataforma: req.plataforma,
      configurada: faltan.length === 0,
      faltan: [...faltan],
      motivo: req.motivo,
    };
  });
}

/** Mensaje unico para el fallo: que falta, y por que. Sin ningun valor. */
function fallo(faltan: VariableAusente[], plataforma: Plataforma): string {
  const req = REQUISITOS.find((r) => r.plataforma === plataforma);
  const porque = req ? `\n  ${req.motivo}` : "";
  return (
    `Faltan variables para ${plataforma}: ${faltan.join(", ")}.` +
    `${porque}\n  Definelas en .env.local o en el secret store de CI. Los valores no se imprimen.`
  );
}

// ── Bluesky ────────────────────────────────────────────────────────────────

export function opcionesBluesky(http: CapaHttp): Resultado<OpcionesBluesky> {
  const faltan = reunirFaltantes([
    "BLUESKY_USERNAME",
    "BLUESKY_APP_PASSWORD",
    "BLUESKY_PDS",
    "BLUESKY_REPO",
  ]);
  if (faltan.length > 0) return { ok: false, faltan };
  return {
    ok: true,
    valor: {
      http,
      identifier: leer("BLUESKY_USERNAME"),
      password: leer("BLUESKY_APP_PASSWORD"),
      pds: leer("BLUESKY_PDS"),
      repo: leer("BLUESKY_REPO"),
    },
  };
}

// ── Mastodon ───────────────────────────────────────────────────────────────

export function opcionesMastodon(http: CapaHttp): Resultado<OpcionesMastodon> {
  const faltan = reunirFaltantes(["MASTODON_URL", "MASTODON_ACCESS_TOKEN"]);
  if (faltan.length > 0) return { ok: false, faltan };
  return {
    ok: true,
    valor: {
      http,
      instancia: leer("MASTODON_URL"),
      accessToken: leer("MASTODON_ACCESS_TOKEN"),
    },
  };
}

// ── Facebook ───────────────────────────────────────────────────────────────

export function opcionesFacebook(http: CapaHttp): Resultado<OpcionesFacebook> {
  const faltan = reunirFaltantes(["META_PAGE_ID", "META_ACCESS_TOKEN"]);
  if (faltan.length > 0) return { ok: false, faltan };
  return {
    ok: true,
    valor: {
      http,
      graphHost: HOST_FACEBOOK,
      pageId: leer("META_PAGE_ID"),
      pageAccessToken: leer("META_ACCESS_TOKEN"),
    },
  };
}

// ── Instagram ──────────────────────────────────────────────────────────────

export function opcionesInstagram(http: CapaHttp): Resultado<OpcionesInstagram> {
  const faltan = reunirFaltantes(["META_IG_USER_ID", "META_ACCESS_TOKEN"]);
  if (faltan.length > 0) return { ok: false, faltan };
  return {
    ok: true,
    valor: {
      http,
      graphHost: HOST_FACEBOOK,
      igUserId: leer("META_IG_USER_ID"),
      accessToken: leer("META_ACCESS_TOKEN"),
    },
  };
}

// ── Threads ────────────────────────────────────────────────────────────────

export function opcionesThreads(http: CapaHttp): Resultado<OpcionesThreads> {
  const faltan = reunirFaltantes(["THREADS_APP_ID", "THREADS_USER_ID", "THREADS_ACCESS_TOKEN"]);
  if (faltan.length > 0) return { ok: false, faltan };
  return {
    ok: true,
    valor: {
      http,
      threadsUserId: leer("THREADS_USER_ID"),
      accessToken: leer("THREADS_ACCESS_TOKEN"),
    },
  };
}

// ── LinkedIn ───────────────────────────────────────────────────────────────

export function opcionesLinkedin(http: CapaHttp): Resultado<OpcionesLinkedin> {
  const faltan = reunirFaltantes(["LINKEDIN_AUTHOR_URN", "LINKEDIN_ACCESS_TOKEN"]);
  if (faltan.length > 0) return { ok: false, faltan };
  return {
    ok: true,
    valor: {
      http,
      authorUrn: leer("LINKEDIN_AUTHOR_URN"),
      accessToken: leer("LINKEDIN_ACCESS_TOKEN"),
    },
  };
}

export { fallo as mensajeDeFalta };