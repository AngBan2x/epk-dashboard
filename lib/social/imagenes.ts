/**
 * RC.45 — Si Meta podrá descargar el medio **antes** de que salga el post.
 *
 * ## Por qué existe
 *
 * Threads **descarga** la imagen en el momento del intento de publicación:
 *
 * > "We download media used in publishing attempts so the media must be hosted on
 * > a publicly accessible server at the time of the attempt."
 *
 * La consecuencia práctica es que un medio que no se puede descargar **no falla
 * con un error de "imagen no válida"**, falla con un 400 opaco, o peor: crea el
 * contenedor y deja la publicación a medias. Y una publicación a medias ya es
 * visible para la audiencia.
 *
 * Por eso esto se comprueba en el `preview()`, que es barato y no escribe nada,
 * y no en el `publicar()`, que es caro e irreversible.
 *
 * ## Lo que NO se comprueba
 *
 * **Las dimensiones.** Threads exige entre 320 y 1440 px de ancho y una relación
 * de aspecto de 10:1 como máximo. Saber eso exige descargar el fichero entero y
 * parsear la cabecera de JPEG, PNG o WEBP. No se hace: se avisa de que existe el
 * requisito y se deja que lo decida Meta. Un aviso honesto es mejor que una
 * comprobación que da seguridad falsa.
 *
 * ## Por qué `HEAD` y no `GET`
 *
 * Un `HEAD` no baja el cuerpo. Con `GET` se descargarían varios MB solo para
 * mirar la primera línea, una vez por cada publicación. Algunos CDN además
 * responden distinto a `HEAD` que a `GET`, así que un `HEAD` que falla no
 * demuestra que el `GET` vaya a fallar: se registra como **aviso**, no como
 * error, cuando el problema es del servidor de la imagen.
 */

import type { CapaHttp } from "./tipos";

/** El límite que dice la documentación de Threads para el tamaño del fichero. */
export const MAX_BYTES_THREADS = 8 * 1024 * 1024;

export const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"] as const;

export interface InformeImagen {
  readonly url: string;
  /** `false` solo cuando hay un problema que **no** depende de cómo conteste el CDN. */
  readonly ok: boolean;
  readonly problema: string | null;
  readonly aviso: string | null;
  readonly contentType: string | null;
  readonly bytes: number | null;
}

function urlParseable(valor: string): URL | null {
  try {
    return new URL(valor);
  } catch {
    return null;
  }
}

/**
 * El fallo que **no** depende de la red, y por tanto no se intenta de nuevo.
 *
 * Se separa del `HEAD` a propósito: una URL mal escrita no se arregla reintentando,
 * y una que no es `https` tampoco. Mezclarlas con un `504` del CDN haría que el
 * preview mostrara el mismo error para tres cosas que se arreglan de tres
 * maneras distintas.
 */
export function falloEstatico(url: string): string | null {
  const u = urlParseable(url);
  if (u === null) return "La URL no es válida.";

  if (u.protocol !== "https:") {
    return `La URL es ${u.protocol.replace(":", "")} y Meta la descarga: tiene que ser https.`;
  }

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost")) {
    return "La URL apunta a localhost: Meta está en otro servidor y no puede descargarla.";
  }

  return null;
}

/**
 * Comprueba una imagen. Hace red solo si la URL pasa el filtro estático.
 *
 * Devuelve `ok: true` cuando no hay nada que impedir la publicación, y mete en
 * `aviso` lo que no se ha podido verificar. Un `HEAD` que falla deja la imagen
 * utilizable **con aviso**, porque el requisito real de Threads es que el `GET`
 * de la imagen funcione, y eso no lo responde un `HEAD`.
 */
export async function comprobarImagen(url: string, http: CapaHttp): Promise<InformeImagen> {
  const estatico = falloEstatico(url);
  if (estatico !== null) {
    return { url, ok: false, problema: estatico, aviso: null, contentType: null, bytes: null };
  }

  let res: Response;
  try {
    res = await http(url, { method: "HEAD" });
  } catch (e) {
    // No red, o el CDN no contesta a HEAD. No se bloquea la publicación por esto.
    return {
      url,
      ok: true,
      problema: null,
      aviso: `No se ha podido comprobar la imagen (${e instanceof Error ? e.message : "sin red"}). Si Meta no puede descargarla, la publicación fallará en el paso 1.`,
      contentType: null,
      bytes: null,
    };
  }

  if (!res.ok) {
    return {
      url,
      ok: true,
      problema: null,
      aviso: `La imagen respondió ${res.status} a un HEAD. Puede que sí se pueda descargar: hay que comprobarlo con GET.`,
      contentType: null,
      bytes: null,
    };
  }

  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const cabecera = res.headers.get("content-length");
  const bytes = cabecera !== null && /^\d+$/.test(cabecera) ? Number(cabecera) : null;

  if (contentType === "" || !contentType.startsWith("image/")) {
    return {
      url,
      ok: false,
      problema: `La URL no devuelve una imagen sino \`${contentType || "sin content-type"}\`. Threads solo acepta JPEG, PNG y WEBP.`,
      aviso: null,
      contentType: contentType || null,
      bytes,
    };
  }

  if (!(TIPOS_ACEPTADOS as readonly string[]).includes(contentType)) {
    return {
      url,
      ok: false,
      problema: `Threads solo acepta JPEG, PNG y WEBP, y esto es \`${contentType}\`.`,
      aviso: null,
      contentType,
      bytes,
    };
  }

  if (bytes !== null && bytes > MAX_BYTES_THREADS) {
    return {
      url,
      ok: false,
      problema: `La imagen pesa ${(bytes / 1024 / 1024).toFixed(1)} MB y Threads admite 8 MB como máximo.`,
      aviso: null,
      contentType,
      bytes,
    };
  }

  const avisos: string[] = [];
  if (bytes === null) {
    avisos.push("La imagen no declara tamaño: no se ha podido comprobar el límite de 8 MB.");
  }
  avisos.push(
    "Las dimensiones no se han comprobado: Threads exige entre 320 y 1440 px de ancho y relación 10:1 como máximo.",
  );

  return { url, ok: true, problema: null, aviso: avisos.join(" "), contentType, bytes };
}

/** Comprueba varias en paralelo. El orden de los informes es el de las URLs. */
export async function comprobarImagenes(
  urls: readonly string[],
  http: CapaHttp
): Promise<readonly InformeImagen[]> {
  return Promise.all(urls.map((u) => comprobarImagen(u, http)));
}
