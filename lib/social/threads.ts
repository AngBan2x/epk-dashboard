/**
 * P13 — Threads (Meta).
 *
 * ## Por qué esto introduce el patrón "contenedor → publicar"
 *
 * Publicar es **dos** llamadas y la primera no publica nada:
 *
 *   1. `POST /v1.0/{threads-user-id}/threads`           → `{ id }` (el `creation_id`)
 *   2. `POST /v1.0/{threads-user-id}/threads_publish`   → `{ id, permalink }`
 *
 * El paso 1 se llama "crear contenedor" y su resultado es un borrador de la
 * plataforma: se puede crear, mirar y hasta borrar sin que exista un post. La
 * idea de Threads es que la app construya el texto por su cuenta y luego lo
 * publique solo cuando el usuario lo confirma.
 *
 * Aquí se usan los dos pasos juntos porque el límite de esta fase es no publicar:
 * quien llegue a la frontera con credenciales querrá poder **quedarse en el
 * paso 1** y enseñarle el contenedor a un humano. Por eso `publicar()` tiene
 * `crearContenedor()` debajo, exportada aparte y sin publicar nada por su cuenta.
 *
 * ## El host, que es la trampa
 *
 * Threads usa **`graph.threads.net`**, no `graph.facebook.com`. Es el mismo API
 * de Graph con otro dominio, y el error de escribir el de Facebook es un 404 con
 * un cuerpo que no sugiere el dominio equivocado. El host va en las opciones,
 * con este valor por defecto, para que cambiarlo sea una línea y no una búsqueda.
 *
 * ## Lo verificado y lo que no
 *
 * Verificado el 2026-10-11 (`limites.ts`): 500 caracteres, 250 posts / 24 h,
 * carrusel de hasta 20. La tabla es la fuente; aquí no hay ningún número escrito
 * a mano.
 *
 * Sin verificar, y por tanto sin escribir:
 *
 *   - **La forma de cada elemento de `children`.** Se usa
 *     `{ media_type: "IMAGE", url }`, que es lo que devuelve la memoria de la
 *     documentación del contenedor, pero no lo he contrastado contra el texto
 *     primario y no hay ninguna llamada real que lo compruebe. Está marcado en el
 *     sitio donde ocurre (`subirEmbed`). Si la API lo rechaza, el arreglo es de
 *     una línea y está señalada.
 *   - **El ancho de la imagen.** Está en `limites.ts` (entre 320 y 1440 px) pero
 *     comprobarlo exige descargar la imagen, y `validar()` es síncrono y sin red
 *     a propósito. Queda como aviso, no como comprobación: quien prepare el
 *     archivo tiene que saberlo antes, no descubrirlo con un 400.
 *   - Si `permalink` viene siempre en el paso 2. La documentación también menciona
 *     `text_post_id` para posts solo de texto, y ese caso no trae enlace.
 */

import { LIMITES, cabeElTexto, limiteDeTexto } from "./limites";
import { recortar,
  type AdaptadorSocial,
  type Borrador,
  type CapaHttp,
  type Contenido,
  type Imagen,
  type Publicacion,
  type ResultadoPublicacion,
  type ResultadoValidacion,
} from "./tipos";
import { ErrorApi } from "./tipos";
import type { Paso, Plataforma } from "./tipos";

export interface OpcionesThreads {
  readonly http: CapaHttp;

  /**
   * `graph.threads.net`, **no** `graph.facebook.com`. Configurable porque el
   * dominio también cambia entre entornos y porque probarlo con capa simulada
   * necesita poder apuntar a otro sitio.
   */
  readonly graphHost?: string;

  /** Threads user id. No es el id de Instagram: es el del usuario de Threads. */
  readonly threadsUserId: string;

  /** Token de largo alcance de la app de Meta. */
  readonly accessToken: string;
}

// ---------------------------------------------------------------------------
// Utilidades de HTTP. Duplicadas a propósito: ver la nota de `bluesky.ts`.
// ---------------------------------------------------------------------------


async function cuerpoDe(res: Response): Promise<unknown> {
  const texto = await res.text();
  if (!texto) return {};
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return texto;
  }
}

async function exigirOk(
  res: Response,
  que: string,
  plataforma: Plataforma,
  paso: Paso
): Promise<unknown> {
  const cuerpo = await cuerpoDe(res);
  if (!res.ok) {
    throw new ErrorApi(`${que} respondió ${res.status} ${res.statusText}`, plataforma, paso, res.status, cuerpo);
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

const HOST_POR_DEFECTO = "https://graph.threads.net";

function hostDe(o: OpcionesThreads): string {
  return (o.graphHost ?? HOST_POR_DEFECTO).replace(/\/+$/, "");
}

function cabeceras(o: OpcionesThreads, conCuerpoJson: boolean): Record<string, string> {
  return {
    Authorization: `Bearer ${o.accessToken}`,
    ...(conCuerpoJson ? { "Content-Type": "application/json" } : {}),
  };
}

// ---------------------------------------------------------------------------
// Validación y redacción
// ---------------------------------------------------------------------------

function componerTexto(contenido: Contenido): string {
  const partes: string[] = [];
  if (contenido.titulo.trim()) partes.push(contenido.titulo.trim());
  if (contenido.cuerpo.trim()) partes.push(contenido.cuerpo.trim());
  if (contenido.enlace) partes.push(contenido.enlace);
  return partes.join("\n\n");
}

function validarThreads(publicacion: Publicacion): ResultadoValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];

  const limite = limiteDeTexto("threads");
  if (limite === null) {
    avisos.push("No hay límite de texto verificado para Threads.");
  } else if (!cabeElTexto("threads", publicacion.texto)) {
    errores.push(`El texto es de ${[...publicacion.texto].length} caracteres y el máximo son ${limite}.`);
  }

  const total = publicacion.imagenes.length;
  if (total > 1) {
    const maximo = LIMITES.threads.carrusel;
    if (maximo === null) {
      avisos.push("No hay máximo de carrusel verificado para Threads.");
    } else if (total > maximo) {
      errores.push(`Un carrusel admite ${maximo} imágenes y van ${total}.`);
    }
  }

  if (total > 0) {
    // Se sabe el dato y no se puede comprobar aquí: `validar()` no hace red.
    avisos.push(
      "Las imágenes no se han comprobado: Threads exige entre 320 y 1440 px de ancho, JPEG/PNG/WEBP y 8 MB como máximo, y eso solo se ve descargando el archivo.",
    );
  }

  return { ok: errores.length === 0, errores, avisos };
}

async function redactarThreads(contenido: Contenido): Promise<Borrador> {
  const bruto = componerTexto(contenido);
  const ajustes: string[] = [];
  let texto = bruto;

  const limite = limiteDeTexto("threads");
  if (limite === null) {
    ajustes.push("Texto sin recortar: el límite de Threads no está verificado.");
  } else {
    const corte = recortar(bruto, limite, LIMITES.threads.unidad);
    texto = corte.texto;
    if (corte.recortado) ajustes.push(`Texto recortado a ${limite} caracteres.`);
  }

  const imagenes: readonly Imagen[] = contenido.imagenes ?? [];
  const publicacion: Publicacion = { texto, imagenes };
  const validacion = validarThreads(publicacion);

  return {
    plataforma: "threads",
    publicacion,
    ajustes,
    requiereRevision: validacion.avisos.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------

interface Contenedor {
  readonly creationId: string;
}

/**
 * Paso 1: crear el contenedor. No publica nada.
 *
 * Exportado aparte a propósito: es el punto donde se para una publicación para
 * enseñarla. Un `publicar()` que la contiene y no hace más es el sitio natural
 * para añadir, más adelante, un "crear y mostrar" sin tocar el flujo de publicar.
 */
export async function crearContenedor(o: OpcionesThreads, publicacion: Publicacion): Promise<Contenedor> {
  const total = publicacion.imagenes.length;

  // Un `IMAGE` lleva la imagen en la raíz del cuerpo; un `CAROUSEL` la lleva en
  // `children`. La bifurcación existe porque el API no tiene una forma común.
  const cuerpo =
    total === 0
      ? { media_type: "TEXT", text: publicacion.texto }
      : total === 1
        ? { media_type: "IMAGE", text: publicacion.texto, image_url: publicacion.imagenes[0].url }
        : {
            media_type: "CAROUSEL",
            text: publicacion.texto,
            // POR CONFIRMAR contra la documentación primaria del contenedor:
            // la forma de cada elemento de `children`. No hay ninguna llamada
            // real en esta fase que lo confirme. Si la API lo rechaza, el 400
            // viene del paso 1 y el arreglo es este objeto.
            children: publicacion.imagenes.map((i) => ({ media_type: "IMAGE", url: i.url })),
          };

  const registro = comoRegistro(
    await exigirOk(
      await o.http(`${hostDe(o)}/v1.0/${encodeURIComponent(o.threadsUserId)}/threads`, {
        method: "POST",
        headers: cabeceras(o, true),
        body: JSON.stringify(cuerpo),
      }),
      "POST /threads (crear contenedor)",
      "threads",
      "contenedor",
    ),
    "POST /threads (crear contenedor)",
  );

  return { creationId: exigirCampo(registro, "id", "POST /threads (crear contenedor)") };
}

/** Paso 2: publicar el contenedor que se acaba de crear. */
export async function publicar(o: OpcionesThreads, publicacion: Publicacion): Promise<ResultadoPublicacion> {
  const contenedor = await crearContenedor(o, publicacion);

  const registro = comoRegistro(
    await exigirOk(
      await o.http(`${hostDe(o)}/v1.0/${encodeURIComponent(o.threadsUserId)}/threads_publish`, {
        method: "POST",
        headers: cabeceras(o, true),
        body: JSON.stringify({ creation_id: contenedor.creationId }),
      }),
      "POST /threads_publish",
      "threads",
      "publicar",
    ),
    "POST /threads_publish",
  );

  return {
    id: exigirCampo(registro, "id", "POST /threads_publish"),
    // Un post de solo texto viene con `text_post_id` y sin `permalink`: no hay
    // enlace que componer y se devuelve `null` en vez de uno inventado.
    url: typeof registro["permalink"] === "string" ? (registro["permalink"] as string) : null,
  };
}

// ---------------------------------------------------------------------------
// La interfaz que consumen los demás
// ---------------------------------------------------------------------------

export function crearAdaptador(o: OpcionesThreads): AdaptadorSocial {
  return {
    plataforma: "threads",
    requiereAnclaje: "Una cuenta de Threads, que exige a su vez una de Instagram profesional (Business o Creator) vinculada.",
    validar: validarThreads,
    redactar: redactarThreads,
    publicar: (publicacion) => publicar(o, publicacion),
  };
}
