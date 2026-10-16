/**
 * P13 — Instagram (Meta).
 *
 * ## Dos pasos, otro host, otros nombres
 *
 * Es el mismo par que Threads (contenedor → publicar) con dos diferencias que
 * hacen que copiar el fichero de Threads sea un error:
 *
 *   - El host es **`graph.instagram.com`**, no `graph.threads.net` ni
 *     `graph.facebook.com`. Hay tres dominios distintos para tres superficies del
 *     mismo API de Graph.
 *   - Los nombres no coinciden: `/{ig-user-id}/media` y `/{ig-user-id}/media_publish`,
 *     no `threads` y `threads_publish`. El `creation_id` del paso 1 sigue siendo
 *     un campo `id` en la respuesta, pero el concepto tiene otro nombre.
 *
 * El cuerpo del paso 1 va **form-encoded** (`application/x-www-form-urlencoded`),
 * no JSON. Meta acepta las dos formas en Graph, y aquí se eligió la que la
 * propia documentación de Content Publishing muestra para este endpoint; si
 * resulta que la acepta JSON, cambiarlo es una línea.
 *
 * ## El límite de caracteres no existe, y eso no es un permiso
 *
 * `limites.ts` tiene `instagram.texto: null`, y `null` significa **sin verificar**.
 * Es tentador leer Instagram y recordar "2200 caracteres" o "2.200 + 30 hashtags";
 * ese número viene de la aplicación cliente, no de la API, y por tanto caduca
 * sin que nadie avise. Este adaptador:
 *
 *   - **no recorta** el texto, porque recortar contra un número no verificado
 *     deja una publicación mutilada que nadie pidió mutilar;
 *   - marca **siempre** `requiereRevision: true`, porque la validación del texto
 *     no se ha podido hacer entera.
 *
 * Con lo verificado (carrusel ≤ 10, cadencia 100/24 h simple y 50/24 h carrusel)
 * no pasa lo mismo: esos sí están en la tabla y sí se aplican.
 *
 * ## Lo que este adaptador NO sabe
 *
 *   - **Solo se admite JPEG.** No hay forma de saberlo sin descargar el archivo.
 *     `validar()` es síncrono y sin red a propósito, así que aquí solo se mira la
 *     extensión de la URL, que es una heurística y no una comprobación. Si el
 *     archivo es JPEG con extensión `.png`, esto no lo pilla y la API sí.
 *   - **El contenedor caduca a las 24 h.** Por eso `crearContenedor()` está
 *     exportada: crear el contenedor y publicar tres días después es un 404, y
 *     conviene que quien lo use lo sepa antes y no por el camino.
 *   - **La forma del paso de carrusel.** Cada hijo se crea con su propia llamada
 *     a `/media` y `media_type=CHILD`; el padre luego lleva la lista de ids.
 *     Es lo que hace el API en dos fases, pero está señalado en el sitio donde
 *     ocurre porque no hay llamada real que lo confirme.
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

export interface OpcionesInstagram {
  readonly http: CapaHttp;

  /** `graph.instagram.com`. Configurable por el mismo motivo que en Threads. */
  readonly graphHost?: string;

  /** Instagram professional user id (Business o Creator). */
  readonly igUserId: string;

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

const HOST_POR_DEFECTO = "https://graph.instagram.com";

function hostDe(o: OpcionesInstagram): string {
  return (o.graphHost ?? HOST_POR_DEFECTO).replace(/\/+$/, "");
}

function cabeceras(o: OpcionesInstagram): Record<string, string> {
  return {
    Authorization: `Bearer ${o.accessToken}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

function baseDe(o: OpcionesInstagram): string {
  return `${hostDe(o)}/${encodeURIComponent(o.igUserId)}`;
}

/**
 * Heurística, y se dice en el nombre.
 *
 * Sirve para avisar de lo obvio, no para validar: un JPEG servido con extensión
 * `.png` pasa por aquí como si fuera PNG. Se prefiere un aviso con falsos
 * positivos que un 400 de la API con el archivo ya subido.
 */
function pareceJpeg(url: string): boolean {
  const limpio = url.split("?")[0].split("#")[0].toLowerCase();
  return limpio.endsWith(".jpg") || limpio.endsWith(".jpeg");
}

// ---------------------------------------------------------------------------
// Validación y redacción
// ---------------------------------------------------------------------------

function componerTexto(contenido: Contenido): string {
  const partes: string[] = [];
  if (contenido.titulo.trim()) partes.push(contenido.titulo.trim());
  if (contenido.cuerpo.trim()) partes.push(contenido.cuerpo.trim());
  // El enlace va dentro del caption porque `Publicacion` no lleva un campo
  // `enlace` aparte y el caption es el único sitio donde puede ir.
  if (contenido.enlace) partes.push(contenido.enlace);
  return partes.join("\n\n");
}

function validarInstagram(publicacion: Publicacion): ResultadoValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];

  const limite = limiteDeTexto("instagram");
  if (limite === null) {
    avisos.push(
      "Instagram no publica el límite de caracteres en la API. El texto no se ha podido validar ni recortar: revísalo a mano.",
    );
  } else if (!cabeElTexto("instagram", publicacion.texto)) {
    errores.push(`El texto es de ${[...publicacion.texto].length} caracteres y el máximo serían ${limite}.`);
  }

  const total = publicacion.imagenes.length;
  if (total === 0) {
    // No es un error de esta capa, pero Instagram sin imagen es un contenedor
    // vacío. Se avisa porque es mejor que un 400 y porque se detecta aquí.
    avisos.push("No hay imagen: Instagram solo publica con un contenedor de imagen o carrusel.");
  } else {
    const maximo = LIMITES.instagram.carrusel;
    if (total > 1 && maximo !== null && total > maximo) {
      errores.push(`Un carrusel admite ${maximo} imágenes y van ${total}.`);
    }
    if (total === 1) {
      if (!pareceJpeg(publicacion.imagenes[0].url)) {
        avisos.push("Instagram solo admite JPEG. La extensión de la URL no lo parece.");
      }
      avisos.push("El formato no se ha comprobado de verdad: eso exige descargar el archivo.");
    }
  }

  return { ok: errores.length === 0, errores, avisos };
}

async function redactarInstagram(contenido: Contenido): Promise<Borrador> {
  const bruto = componerTexto(contenido);
  const ajustes: string[] = [];
  let texto = bruto;

  const limite = limiteDeTexto("instagram");
  if (limite === null) {
    ajustes.push("Texto sin recortar: Instagram no publica su límite de caracteres en la API.");
  } else {
    const corte = recortar(bruto, limite, LIMITES.instagram.unidad);
    texto = corte.texto;
    if (corte.recortado) ajustes.push(`Texto recortado a ${limite} caracteres.`);
  }

  const imagenes: readonly Imagen[] = contenido.imagenes ?? [];
  const publicacion: Publicacion = { texto, imagenes };
  const validacion = validarInstagram(publicacion);

  return {
    plataforma: "instagram",
    publicacion,
    // Los errores duros de la validación entran en `ajustes` para que no se
    // pierdan al leer solo el borrador. Los avisos no se repiten aquí: los trae
    // `validar()`, que es quien los emite.
    ajustes: [...ajustes, ...validacion.errores],
    // Siempre `true`, y deliberadamente sin mirar `validacion`: mientras el
    // límite de texto de Instagram no esté verificado, no existe un borrador de
    // Instagram que venga validado entero.
    requiereRevision: true,
  };
}

// ---------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------

interface Contenedor {
  readonly creationId: string;
}

async function crearContenedorHijo(o: OpcionesInstagram, imagen: Imagen): Promise<Contenedor> {
  const form = new URLSearchParams({
    // POR CONFIRMAR: `media_type=CHILD` es el patrón de dos fases del API para
    // carruseles. Sin una llamada real no se puede descartar que el hijo se
    // distinga por otro medio. Si falla, es este POST el que devuelve el error.
    media_type: "CHILD",
    image_url: imagen.url,
  });

  const registro = comoRegistro(
    await exigirOk(
      await o.http(`${baseDe(o)}/media`, {
        method: "POST",
        headers: cabeceras(o),
        body: form.toString(),
      }),
      "POST /media (hijo de carrusel)",
      "instagram",
      "medio",
    ),
    "POST /media (hijo de carrusel)",
  );

  return { creationId: exigirCampo(registro, "id", "POST /media (hijo de carrusel)") };
}

/**
 * Paso 1: crear el contenedor. No publica nada y **caduca a las 24 h**.
 *
 * Exportada aparte porque esa caducidad es una relojera, no un aviso: quien cree
 * el contenedor y publique después tiene que saberlo al decidir, no al fallar.
 */
export async function crearContenedor(o: OpcionesInstagram, publicacion: Publicacion): Promise<Contenedor> {
  const total = publicacion.imagenes.length;

  const campos: Record<string, string> = {};
  if (publicacion.texto) campos["caption"] = publicacion.texto;

  if (total > 1) {
    const hijos: string[] = [];
    for (const imagen of publicacion.imagenes) {
      hijos.push((await crearContenedorHijo(o, imagen)).creationId);
    }
    campos["media_type"] = "CAROUSEL";
    campos["children"] = hijos.join(",");
  } else if (total === 1) {
    campos["media_type"] = "IMAGE";
    campos["image_url"] = publicacion.imagenes[0].url;
  } else {
    // Sin imagen no hay contenedor que valga. Se dice aquí y no en un 404.
    throw new Error("Instagram necesita al menos una imagen: no hay un contenedor de solo texto.");
  }

  const registro = comoRegistro(
    await exigirOk(
      await o.http(`${baseDe(o)}/media`, {
        method: "POST",
        headers: cabeceras(o),
        body: new URLSearchParams(campos).toString(),
      }),
      "POST /media (crear contenedor)",
      "instagram",
      "contenedor",
    ),
    "POST /media (crear contenedor)",
  );

  return { creationId: exigirCampo(registro, "id", "POST /media (crear contenedor)") };
}

/** Paso 2: publicar el contenedor. */
export async function publicar(o: OpcionesInstagram, publicacion: Publicacion): Promise<ResultadoPublicacion> {
  const contenedor = await crearContenedor(o, publicacion);

  const registro = comoRegistro(
    await exigirOk(
      await o.http(`${baseDe(o)}/media_publish`, {
        method: "POST",
        headers: cabeceras(o),
        body: new URLSearchParams({ creation_id: contenedor.creationId }).toString(),
      }),
      "POST /media_publish",
      "instagram",
      "publicar",
    ),
    "POST /media_publish",
  );

  const id = exigirCampo(registro, "id", "POST /media_publish");

  // El API solo devuelve el id numérico. La URL se compone con el patrón público
  // de instagram.com; no es parte de la respuesta, así que va en comentario y no
  // se puede comprobar contra la API.
  return { id, url: `https://www.instagram.com/p/${encodeURIComponent(id)}/` };
}

// ---------------------------------------------------------------------------
// La interfaz que consumen los demás
// ---------------------------------------------------------------------------

export function crearAdaptador(o: OpcionesInstagram): AdaptadorSocial {
  return {
    plataforma: "instagram",
    requiereAnclaje:
      "Una cuenta de Instagram profesional (Business o Creator). Una personal no puede usar la API, y hace falta una app de Meta con rol de administrador sobre ella.",
    validar: validarInstagram,
    redactar: redactarInstagram,
    publicar: (publicacion) => publicar(o, publicacion),
  };
}
