/**
 * P13 — LinkedIn.
 *
 * ## Por qué este no es "el par de Meta con otro nombre"
 *
 * Meta publica en dos fases porque el texto lo compone la app antes de que exista
 * el post. LinkedIn **no tiene contenedor**: el post se crea entero de una vez.
 * Lo que sí tiene es una subida de imagen en dos fases, que es otra cosa y no se
 * puede confundir con la anterior:
 *
 *   1. `POST /rest/images?action=initializeUpload`  → `{ uploadUrl, image }`
 *   2. `PUT {uploadUrl}`                              → los bytes
 *   3. `POST /rest/posts`                             → `{ author, commentary, content }`
 *
 * El paso 1 **no** sube nada: es una reserva. Dice "aquí puedes subir estos bytes
 * y el resultado será este urn". Por eso el orden es obligatorio, y por eso el
 * `urn` de la imagen se obtiene antes de tenerla.
 *
 * ## El texto va en `commentary`, y dentro de un objeto
 *
 * ```json
 * "commentary": { "text": "...", "locale": "es-ES" }
 * ```
 *
 * No es `"text"` suelto. Es el detalle que más se cuela mal cuando el ejemplo de
 * la documentación se lee de memoria, porque el nombre del campo *exterior*
 * (`commentary`) no es el del interior (`text`), y el API acepta `text` a nivel
 * superior sin decir nada. Aquí está escrito una sola vez, en un solo sitio, para
 * que no haya dos versiones.
 *
 * `locale` va por defecto en `es-ES` y es opción: el API lo pide siempre y un
 * idioma mal puesto cambia la indexación del post, que es justo lo que se quiere
 * de un texto en español.
 *
 * ## LinkedIn no publica sus límites. Punto.
 *
 * De la documentación, textual: *"Standard rate limits are not published in
 * documentation."* (está también en `LIMITES.linkedin.nota`, y la cita se
 * duplica ahí a propósito). Consecuencias en este fichero:
 *
 *   - `requiereRevision` es **siempre `true`**, sin mirar nada más.
 *   - No hay ningún número de cadencia escrito, ni aproximado, ni como
 *     constante "de sobra".
 *   - El `429` sale entero en `ErrorApi.cuerpo`, con su cuerpo y su código, para
 *     que la primera cuenta de uso real pueda **leer su propio límite** de ahí y
 *     anotarlo en `limites.ts` con su fecha. Ese es el procedimiento, no un
 *     número inventado ahora.
 *
 * ## Más de una imagen: se rechaza, no se adivina
 *
 * LinkedIn tiene `content.multiImage` para varias imágenes en un post. La forma
 * exacta de ese objeto **no está verificada aquí** y no hay ninguna llamada real
 * que la compruebe, así que este adaptador **no la implementa**: más de una
 * imagen es un error explícito en `validar()` y en `publicar()`. Es preferible un
 * error dicho en el sitio a un `400` de un endpoint que sí existe.
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

export interface OpcionesLinkedin {
  readonly http: CapaHttp;

  readonly apiHost?: string;

  /** Ruta de la API REST. Por defecto `/rest`. */
  readonly restPath?: string;

  /**
   * `urn:li:person:{id}` o `urn:li:organization:{id}`.
   *
   * El scope tiene que corresponder: `w_member_social` para un miembro,
   * `w_organization_social` para una página de empresa. Un URN de organización
   * con un token de miembro no da 403 limpio, así que se comprueba aquí y no en
   * la respuesta.
   */
  readonly authorUrn: string;

  /** `w_member_social` o `w_organization_social`. */
  readonly scope?: "w_member_social" | "w_organization_social";

  readonly accessToken: string;

  /** `locale` del `commentary`. Por defecto `es-ES`. */
  readonly locale?: string;

  /** `PUBLIC`, `CONNECTIONS` o `MEMBERS`. Omitido si no se dice nada. */
  readonly visibilidad?: "PUBLIC" | "CONNECTIONS" | "MEMBERS";
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
    // El 429 llega aquí con su cuerpo entero a propósito. Es la única forma de
    // descubrir el límite de LinkedIn: la documentación no lo publica.
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

/** `ArrayBuffer` y no `Uint8Array`: ver el motivo en `descargar()` de `bluesky.ts`. */
async function descargar(http: CapaHttp, url: string, plataforma: Plataforma): Promise<ArrayBuffer> {
  const res = await http(url, { method: "GET" });
  if (!res.ok) {
    throw new ErrorApi(`No se pudo descargar la imagen (${res.status})`, plataforma, "medio", res.status, await cuerpoDe(res));
  }
  return res.arrayBuffer();
}

function mimeDeUrl(url: string): string {
  const limpio = url.split("?")[0].split("#")[0].toLowerCase();
  if (limpio.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

const HOST_POR_DEFECTO = "https://api.linkedin.com";

/**
 * `X-Restli-Protocol-Version: 2.0.0` no viene en el enunciado de esta fase.
 *
 * Es lo que exige la API REST de LinkedIn y sin él las respuestas vienen como
 * LinkedIn en lugar de JSON, que es un 200 con un cuerpo que no se puede parsear.
 * Se pone explícito, y no como cabecera implícita, para que quien lea sepa que
 * está ahí por un motivo y no de paso.
 */
const PROTOCOLO_RESTLI = "2.0.0";

function cabeceras(o: OpcionesLinkedin, contentType: string): Record<string, string> {
  return {
    Authorization: `Bearer ${o.accessToken}`,
    "X-Restli-Protocol-Version": PROTOCOLO_RESTLI,
    "Content-Type": contentType,
  };
}

function restDe(o: OpcionesLinkedin): string {
  const host = (o.apiHost ?? HOST_POR_DEFECTO).replace(/\/+$/, "");
  const ruta = o.restPath ?? "/rest";
  return `${host}${ruta.startsWith("/") ? ruta : `/${ruta}`}`;
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

function validarLinkedin(publicacion: Publicacion): ResultadoValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];

  const limite = limiteDeTexto("linkedin");
  if (limite === null) {
    avisos.push("LinkedIn no publica ningún límite en la documentación; el texto no se ha podido validar.");
  } else if (!cabeElTexto("linkedin", publicacion.texto)) {
    errores.push(`El texto es de ${[...publicacion.texto].length} caracteres y el máximo serían ${limite}.`);
  }

  if (publicacion.imagenes.length > 1) {
    errores.push(
      "Este adaptador solo publica una imagen. Varias requerirían `content.multiImage`, cuya forma no está verificada aquí.",
    );
  }

  // El aviso del `429` va siempre, no solo cuando hay error: es la instrucción
  // operativa de este adaptador y tiene que estar delante de quien lo usa.
  avisos.push(LIMITES.linkedin.nota ?? "LinkedIn no publica sus límites de cadencia.");

  return { ok: errores.length === 0, errores, avisos };
}

async function redactarLinkedin(contenido: Contenido): Promise<Borrador> {
  const bruto = componerTexto(contenido);
  const ajustes: string[] = [];
  let texto = bruto;

  const limite = limiteDeTexto("linkedin");
  if (limite === null) {
    ajustes.push("Texto sin recortar: LinkedIn no publica ningún límite de texto.");
  } else {
    const corte = recortar(bruto, limite, LIMITES.linkedin.unidad);
    texto = corte.texto;
    if (corte.recortado) ajustes.push(`Texto recortado a ${limite} caracteres.`);
  }

  const imagenes: readonly Imagen[] = contenido.imagenes ?? [];
  const publicacion: Publicacion = { texto, imagenes };
  const validacion = validarLinkedin(publicacion);

  return {
    plataforma: "linkedin",
    publicacion,
    ajustes: [...ajustes, ...validacion.errores],
    requiereRevision: true,
  };
}

// ---------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------

/** Reserva, subida y devolución del `urn` de una imagen. */
async function subirImagen(o: OpcionesLinkedin, imagen: Imagen): Promise<string> {
  const reserva = comoRegistro(
    await exigirOk(
      await o.http(`${restDe(o)}/images?action=initializeUpload`, {
        method: "POST",
        headers: cabeceras(o, "application/json"),
        body: JSON.stringify({ owner: o.authorUrn }),
      }),
      "POST /images?action=initializeUpload",
      "linkedin",
      "medio",
    ),
    "POST /images?action=initializeUpload",
  );

  // El `uploadUrl` viene completo y con su propio host: **no** se le aplica el
  // `apiHost` de las opciones, porque no es el mismo.
  const uploadUrl = exigirCampo(reserva, "uploadUrl", "POST /images?action=initializeUpload");
  const urn = exigirCampo(reserva, "image", "POST /images?action=initializeUpload");

  const bytes = await descargar(o.http, imagen.url, "linkedin");

  await exigirOk(
    await o.http(uploadUrl, {
      method: "PUT",
      headers: cabeceras(o, mimeDeUrl(imagen.url)),
      body: bytes,
    }),
    "PUT al uploadUrl de la imagen",
    "linkedin",
    "medio",
  );

  return urn;
}

export async function publicar(o: OpcionesLinkedin, publicacion: Publicacion): Promise<ResultadoPublicacion> {
  if (publicacion.imagenes.length > 1) {
    throw new Error(
      "LinkedIn con más de una imagen necesita `content.multiImage`, que no está implementado porque su forma no está verificada.",
    );
  }

  const cuerpo: Record<string, unknown> = {
    author: o.authorUrn,
    // El nombre exterior no coincide con el interior. Ver la cabecera del fichero.
    commentary: {
      text: publicacion.texto,
      locale: o.locale ?? "es-ES",
    },
    ...(o.visibilidad ? { visibility: o.visibilidad } : {}),
  };

  if (publicacion.imagenes.length === 1) {
    const urn = await subirImagen(o, publicacion.imagenes[0]);
    cuerpo["content"] = { media: { id: urn } };
  }

  const registro = comoRegistro(
    await exigirOk(
      await o.http(`${restDe(o)}/posts`, {
        method: "POST",
        headers: cabeceras(o, "application/json"),
        body: JSON.stringify(cuerpo),
      }),
      "POST /rest/posts",
      "linkedin",
      "publicar",
    ),
    "POST /rest/posts",
  );

  // `POST /rest/posts` devuelve un `urn:li:share:{id}` y **no** una URL pública.
  // Así que `url` es `null`: componer una sería inventar, no deducir.
  return { id: exigirCampo(registro, "id", "POST /rest/posts"), url: null };
}

// ---------------------------------------------------------------------------
// La interfaz que consumen los demás
// ---------------------------------------------------------------------------

export function crearAdaptador(o: OpcionesLinkedin): AdaptadorSocial {
  return {
    plataforma: "linkedin",
    requiereAnclaje: `Una cuenta de LinkedIn (miembro o página de empresa) con el scope ${
      o.scope ?? "w_member_social"
    } y su token.`,
    validar: validarLinkedin,
    redactar: redactarLinkedin,
    publicar: (publicacion) => publicar(o, publicacion),
  };
}
