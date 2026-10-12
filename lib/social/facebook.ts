/**
 * P13 — Facebook Page.
 *
 * ## Por qué este no es el par de Threads con otro nombre
 *
 * Threads crea un contenedor y luego lo publica. Facebook no tiene contenedor:
 * el endpoint **ya es** la publicación. Lo que cambia según haya imagen o no es
 * **qué endpoint** se llama, porque son dos publicaciones distintas:
 *
 *   - Sin imagen → `POST /{page-id}/feed`    con `{ message, link? }`
 *   - Con imagen → `POST /{page-id}/photos`  con `{ url, caption? }`
 *
 * `photos` devuelve **dos** ids: `id` es el identificador del objeto foto y
 * `post_id` es la publicación. Devolver el primero como si fuera la publicación
 * da un enlace que no lleva al post, así que se devuelve el segundo y el primero
 * se deja accesible en el error si algo falla.
 *
 * ## El token es de la Page, no del usuario
 *
 * Publicar en una Page pide el **page access token**, que va en
 * `Authorization: Bearer`. Con un token de usuario la llamada responde 401 aunque
 * ese usuario sea administrador de la Page: son tokens con_objects distintos.
 * Por eso la opción se llama `pageAccessToken` y no `accessToken`, para que el
 * error se vea en el punto donde se pasa el valor y no tres capas más abajo.
 *
 * ## Lo verificado y lo que no
 *
 * De `limites.ts` (2026-10-11): el límite de caracteres **no está publicado** en
 * la API, así que `facebook.texto` es `null` y el texto **no se recorta**. Y la
 * cadencia no es un número sino `4800 × usuarios comprometidos` / 24 h, que con
 * una cuenta nueva son 4800 llamadas — y publicar un post con imagen son varias,
 * no una. Ese multiplicador no se codifica en ninguna parte: es una decisión de
 * la cuenta, no del adaptador.
 *
 * Sin verificar y por tanto sin escribir: nada más. En concreto **no** hay aquí
 * un límite de caracteres de Facebook, ni siquiera el 63.206 que parece
 * intuitivo, porque no viene de la API y caduca sin aviso.
 */

import { LIMITES, cabeElTexto, limiteDeTexto } from "./limites";
import {
  recortar,
  type AdaptadorSocial,
  type Borrador,
  type CapaHttp,
  type Contenido,
  type Imagen,
  type Publicacion,
  type ResultadoPublicacion,
  type ResultadoValidacion,
} from "./tipos";

export interface OpcionesFacebook {
  readonly http: CapaHttp;

  readonly graphHost?: string;

  /** Versión del Graph API. Va en opciones porque en pruebas y en staging no es la misma. */
  readonly apiVersion?: string;

  /** Id de la Page (`Page ID`, no el id numérico del usuario). */
  readonly pageId: string;

  /** Token **de la Page**. Un token de usuario da 401 aquí aunque sea su administrador. */
  readonly pageAccessToken: string;
}

/** `publicar` acepta el enlace aparte, y esta es la razón. Ver el bloque de abajo. */
export interface ExtrasFacebook {
  /**
   * Enlace a poner en el campo `link` de `/feed`.
   *
   * `Publicacion` no lleva un campo `enlace` —solo `texto` e `imagenes`—, y
   * `redactar()` ya lo metió dentro del texto. Así que hay dos caminos y son
   * excluyentes: o se compone aquí con `link` y `redactar()` recibe el contenido
   * sin enlace, o se deja el enlace dentro de `message` y no se pasa esta
   * opción. Pasarlo con el enlace ya dentro del texto lo duplica.
   */
  readonly enlace?: string;
}

// ---------------------------------------------------------------------------
// Utilidades de HTTP. Duplicadas a propósito: ver la nota de `bluesky.ts`.
// ---------------------------------------------------------------------------

class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly status: number,
    readonly cuerpo: unknown,
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }
}

async function cuerpoDe(res: Response): Promise<unknown> {
  const texto = await res.text();
  if (!texto) return {};
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return texto;
  }
}

async function exigirOk(res: Response, que: string): Promise<unknown> {
  const cuerpo = await cuerpoDe(res);
  if (!res.ok) {
    throw new ErrorApi(`${que} respondió ${res.status} ${res.statusText}`, res.status, cuerpo);
  }
  return cuerpo;
}

function comoRegistro(cuerpo: unknown, que: string): Record<string, unknown> {
  if (cuerpo !== null && typeof cuerpo === "object" && !Array.isArray(cuerpo)) {
    return cuerpo as Record<string, unknown>;
  }
  throw new Error(`${que} respondió algo que no es un objeto JSON.`);
}

function exigirCampo(registro: Record<string, unknown>, campo: string, que: string): string {
  const valor = registro[campo];
  if (typeof valor !== "string" || valor === "") {
    throw new Error(`${que} respondió 2xx sin \`${campo}\`. No se da por publicado lo que no vino.`);
  }
  return valor;
}

const HOST_POR_DEFECTO = "https://graph.facebook.com";
const VERSION_POR_DEFECTO = "v26.0";

function baseDe(o: OpcionesFacebook): string {
  const host = (o.graphHost ?? HOST_POR_DEFECTO).replace(/\/+$/, "");
  return `${host}/${o.apiVersion ?? VERSION_POR_DEFECTO}/${encodeURIComponent(o.pageId)}`;
}

function cabeceras(o: OpcionesFacebook): Record<string, string> {
  return {
    Authorization: `Bearer ${o.pageAccessToken}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Validación y redacción
// ---------------------------------------------------------------------------

/**
 * Aquí el enlace **no** se mete en el texto.
 *
 * Es la única plataforma de las seis con un campo propio para el enlace, así que
 * componerlo aquí y además mandarlo en `link` sería ponerlo dos veces. Los
 * drafts salen con el enlace fuera del texto y quien publique lo pasa en
 * `ExtrasFacebook.enlace`.
 */
function componerTexto(contenido: Contenido): string {
  const partes: string[] = [];
  if (contenido.titulo.trim()) partes.push(contenido.titulo.trim());
  if (contenido.cuerpo.trim()) partes.push(contenido.cuerpo.trim());
  return partes.join("\n\n");
}

function validarFacebook(publicacion: Publicacion): ResultadoValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];

  const limite = limiteDeTexto("facebook");
  if (limite === null) {
    avisos.push(
      "Facebook no publica el límite de caracteres en la API. El texto no se ha podido validar ni recortar: revísalo a mano.",
    );
  } else if (!cabeElTexto("facebook", publicacion.texto)) {
    errores.push(`El texto es de ${[...publicacion.texto].length} caracteres y el máximo serían ${limite}.`);
  }

  const total = publicacion.imagenes.length;
  if (total > 1) {
    avisos.push(
      "Este adaptador publica una sola imagen. Más de una iría por album, que es otro endpoint y no está implementado.",
    );
  }
  if (total === 1) {
    avisos.push("Con imagen se usa `/photos`, que devuelve `post_id` además del id de la foto.");
  }

  return { ok: errores.length === 0, errores, avisos };
}

async function redactarFacebook(contenido: Contenido): Promise<Borrador> {
  const bruto = componerTexto(contenido);
  const ajustes: string[] = [];
  let texto = bruto;

  const limite = limiteDeTexto("facebook");
  if (limite === null) {
    ajustes.push("Texto sin recortar: Facebook no publica su límite de caracteres en la API.");
  } else {
    const corte = recortar(bruto, limite, LIMITES.facebook.unidad);
    texto = corte.texto;
    if (corte.recortado) ajustes.push(`Texto recortado a ${limite} caracteres.`);
  }

  const imagenes: readonly Imagen[] = (contenido.imagenes ?? []).slice(0, 1);

  const publicacion: Publicacion = { texto, imagenes };
  const validacion = validarFacebook(publicacion);

  if ((contenido.imagenes ?? []).length > imagenes.length) {
    ajustes.push("Se ha dejado fuera la segunda imagen y siguientes: haría falta el endpoint de álbum.");
  }

  return {
    plataforma: "facebook",
    publicacion,
    ajustes: [...ajustes, ...validacion.errores],
    requiereRevision: true,
  };
}

// ---------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------

export async function publicar(
  o: OpcionesFacebook,
  publicacion: Publicacion,
  extras: ExtrasFacebook = {},
): Promise<ResultadoPublicacion> {
  const headers = cabeceras(o);

  if (publicacion.imagenes.length === 0) {
    const cuerpo: Record<string, unknown> = { message: publicacion.texto };
    if (extras.enlace) cuerpo["link"] = extras.enlace;

    const registro = comoRegistro(
      await exigirOk(
        await o.http(`${baseDe(o)}/feed`, {
          method: "POST",
          headers,
          body: JSON.stringify(cuerpo),
        }),
        "POST /feed",
      ),
      "POST /feed",
    );

    const id = exigirCampo(registro, "id", "POST /feed");
    return { id, url: `https://www.facebook.com/${encodeURIComponent(id)}` };
  }

  const cuerpo: Record<string, unknown> = { url: publicacion.imagenes[0].url };
  if (publicacion.texto) cuerpo["caption"] = publicacion.texto;

  const registro = comoRegistro(
    await exigirOk(
      await o.http(`${baseDe(o)}/photos`, {
        method: "POST",
        headers,
        body: JSON.stringify(cuerpo),
      }),
      "POST /photos",
    ),
    "POST /photos",
  );

  // `post_id` es la publicación; `id` es el objeto foto. Se exige el primero y,
  // por qué está aquí: devolver el segundo produce un enlace que no lleva al post.
  const postId = exigirCampo(registro, "post_id", "POST /photos");
  return { id: postId, url: `https://www.facebook.com/${encodeURIComponent(postId)}` };
}

// ---------------------------------------------------------------------------
// La interfaz que consumen los demás
// ---------------------------------------------------------------------------

export function crearAdaptador(o: OpcionesFacebook): AdaptadorSocial {
  return {
    plataforma: "facebook",
    requiereAnclaje: "Una Facebook Page con rol CREATE_CONTENT y MANAGE.",
    validar: validarFacebook,
    redactar: redactarFacebook,
    publicar: (publicacion) => publicar(o, publicacion),
  };
}
