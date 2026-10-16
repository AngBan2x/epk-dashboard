/**
 * P13 — Mastodon.
 *
 * ## Por qué es el único OAuth por instancia
 *
 * Meta tiene una app y un dominio. Bluesky tiene un PDS. LinkedIn tiene su API.
 * Mastodon **no tiene un servidor**: hay miles, y cada uno es una instalación
 * distinta con su propio OAuth, su propio cliente y sus propias reglas. Por eso
 * `instancia` es una opción y no una constante, y por eso en este fichero no hay
 * ni un solo host escrito en el código.
 *
 * Esa consecuencia se nota en los límites, y es lo importante:
 *
 *   - El **500** caracteres de `limites.ts` es el valor por defecto del software,
 *     no una propiedad de Mastodon. Una instancia puede bajarlo. Por eso hay
 *     una opción `limiteTexto`: quien mida la instancia la pasa, y entonces el
 *     adaptador recorta al valor bueno en vez de al de por defecto.
 *   - **Medir 30 llamadas de subida de medio cada 30 minutos es lo que aprieta**,
 *     mucho antes que las 300 peticiones de statuses por 5 minutos. Está en la
 *     nota de la tabla y está repetido aquí, porque un diseño que sube seis
 *     imágenes en paralelo agota el presupuesto antes de haber publicado nada.
 *
 * ## Dos llamadas, y la primera es la cara
 *
 *   1. `POST /api/v1/media`    multipart con `file` → `{ id }`
 *   2. `POST /api/v1/statuses` `{ status, media_ids }` → `{ id, url }`
 *
 * A diferencia de Instagram, la subida de medios **no caduca** en unas horas. Aun
 * así, un medio subido y no usado se queda ahí, así que `subirMedio()` está
 * exportada por separado: quien quiera ver qué se ha subido antes de adjuntarlo
 * a un post puede hacerlo sin publicar nada.
 *
 * El paso 1 es `multipart/form-data` y por eso **no** se pone `Content-Type` a
 * mano: el `boundary` lo genera el transporte, y ponerlo a mano es la forma
 * habitual de que un multipart llegue vacío.
 *
 * ## Lo verificado y lo que no
 *
 * De `limites.ts` (2026-10-11): 300 peticiones / 5 min y medios 30 / 30 min. El
 * máximo de medios por estado **no está en la tabla** (`carrusel: null`) y aquí no
 * se escribe: no hay número, solo un aviso de que no se ha verificado.
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

export interface OpcionesMastodon {
  readonly http: CapaHttp;

  /**
   * Host de la instancia, con esquema. Ej. `https://mastodon.social`.
   *
   * Es una opción y no una constante por lo mismo que en el resto: no existe un
   * "Mastodon" único, y atar el código a una instancia sería atar el proyecto a
   * una decisión que `docs/PHASE_P13.md` deja expressly pendiente.
   */
  readonly instancia: string;

  /** Token de acceso de la app para esta instancia. */
  readonly accessToken: string;

  /**
   * Límite de caracteres **de esta instancia**, si se ha medido.
   *
   * Si viene, gana sobre el de `limites.ts` y el recorte usa este. Si no, se usa
   * el 500 de la tabla y se dice que es el valor por defecto. En los dos casos el
   * origen queda escrito en `ajustes`, porque un 500 que dejó de valer sin que
   * nadie lo dijera es un post truncado que nadie pidió.
   */
  readonly limiteTexto?: number;

  /** Texto alternativo del medio. Mastodon lo llama `description`. */
  readonly descripcionMedio?: string;
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

/** `ArrayBuffer` y no `Uint8Array`: ver el motivo en `descargar()` de `bluesky.ts`. */
async function descargar(http: CapaHttp, url: string, plataforma: Plataforma): Promise<ArrayBuffer> {
  const res = await http(url, { method: "GET" });
  if (!res.ok) {
    throw new ErrorApi(`No se pudo descargar la imagen (${res.status})`, plataforma, "medio", res.status, await cuerpoDe(res));
  }
  return res.arrayBuffer();
}

function hostDe(o: OpcionesMastodon): string {
  return o.instancia.replace(/\/+$/, "");
}

function cabeceras(o: OpcionesMastodon): Record<string, string> {
  return { Authorization: `Bearer ${o.accessToken}` };
}

/**
 * Solo `Authorization`. Ni `Content-Type` ni nada más.
 *
 * Es deliberado: el `boundary` del multipart lo pone el transporte cuando el
 * cuerpo es un `FormData`. Ponerlo a mano es la forma más común de que un
 * multipart llegue con un cuerpo vacío y sin ningún error visible.
 */
function cabecerasMultipart(o: OpcionesMastodon): Record<string, string> {
  return cabeceras(o);
}

function mimeDeUrl(url: string): string {
  const limpio = url.split("?")[0].split("#")[0].toLowerCase();
  if (limpio.endsWith(".png")) return "image/png";
  if (limpio.endsWith(".gif")) return "image/gif";
  if (limpio.endsWith(".webp")) return "image/webp";
  if (limpio.endsWith(".mp4")) return "video/mp4";
  return "image/jpeg";
}

function nombreDe(url: string): string {
  const partes = url.split("?")[0].split("#")[0].split("/");
  const ultimo = partes[partes.length - 1];
  return ultimo && ultimo !== "" ? ultimo : "medio";
}

// ---------------------------------------------------------------------------
// Validación y redacción
// ---------------------------------------------------------------------------

function componerTexto(contenido: Contenido): string {
  const partes: string[] = [];
  if (contenido.titulo.trim()) partes.push(contenido.titulo.trim());
  if (contenido.cuerpo.trim()) partes.push(contenido.cuerpo.trim());
  // El enlace va en el propio status: es lo único que Mastodon auto-enlaza.
  if (contenido.enlace) partes.push(contenido.enlace);
  return partes.join("\n\n");
}

function limiteEfectivo(o: OpcionesMastodon): number | null {
  return o.limiteTexto ?? limiteDeTexto("mastodon");
}

function validarMastodon(o: OpcionesMastodon, publicacion: Publicacion): ResultadoValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];

  const limite = limiteEfectivo(o);
  const longitud = [...publicacion.texto].length;

  if (limite === null) {
    avisos.push("No hay límite de texto verificado para esta instancia de Mastodon.");
  } else if (longitud > limite) {
    if (o.limiteTexto === undefined) {
      // Sin límite medido solo se avisa, no se falla: el 500 de la tabla es el
      // valor por defecto del software y esta instancia puede tener otro.
      avisos.push(`El texto supera los ${limite} caracteres, que es el valor por defecto. Mide la instancia.`);
    } else {
      errores.push(`El texto es de ${longitud} caracteres y el máximo de esta instancia son ${limite}.`);
    }
  }

  if (publicacion.imagenes.length > 0) {
    avisos.push(
      "El máximo de medios por estado no está verificado (`carrusel: null`). Recuerda además que subir medios son 30 llamadas cada 30 minutos: es el límite que aprieta antes que el de publicaciones.",
    );
  }

  return { ok: errores.length === 0, errores, avisos };
}

async function redactarMastodon(o: OpcionesMastodon, contenido: Contenido): Promise<Borrador> {
  const bruto = componerTexto(contenido);
  const ajustes: string[] = [];
  let texto = bruto;

  const limite = limiteEfectivo(o);
  if (limite === null) {
    ajustes.push("Texto sin recortar: no hay límite verificado para esta instancia.");
  } else {
    const corte = recortar(bruto, limite, LIMITES.mastodon.unidad);
    texto = corte.texto;
    if (corte.recortado) {
      ajustes.push(
        o.limiteTexto === undefined
          ? `Texto recortado a ${limite} caracteres, el valor por defecto de Mastodon.`
          : `Texto recortado a ${limite} caracteres, tomados de la configuración de la instancia.`,
      );
    }
  }

  const imagenes: readonly Imagen[] = contenido.imagenes ?? [];
  const publicacion: Publicacion = { texto, imagenes };
  const validacion = validarMastodon(o, publicacion);

  return {
    plataforma: "mastodon",
    publicacion,
    ajustes: [...ajustes, ...validacion.errores],
    requiereRevision: validacion.avisos.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------

/**
 * Paso 0: subir un medio y quedarse con su id.
 *
 * Exportada porque **cada medio es una llamada** y todas comparten una cuota de
 * 30 por 30 minutos. Quien vaya a subir siete imágenes necesita poder decidir
 * cuándo, no descubrirlo con un 429 en la sexta.
 */
export async function subirMedio(o: OpcionesMastodon, imagen: Imagen): Promise<string> {
  const bytes = await descargar(o.http, imagen.url, "mastodon");
  const blob = new Blob([bytes], { type: mimeDeUrl(imagen.url) });

  const form = new FormData();
  form.append("file", blob, nombreDe(imagen.url));
  if (o.descripcionMedio) form.append("description", o.descripcionMedio);

  const registro = comoRegistro(
    await exigirOk(
      await o.http(`${hostDe(o)}/api/v1/media`, {
        method: "POST",
        headers: cabecerasMultipart(o),
        body: form,
      }),
      "POST /api/v1/media",
      "mastodon",
      "medio",
    ),
    "POST /api/v1/media",
  );

  return exigirCampo(registro, "id", "POST /api/v1/media");
}

/** Paso 1: publicar el status con los medios ya subidos. */
export async function publicar(o: OpcionesMastodon, publicacion: Publicacion): Promise<ResultadoPublicacion> {
  const mediaIds: string[] = [];
  // Secuencial a propósito, y no por descuido: el límite son 30 subidas por 30
  // minutos, y nada en este adaptador las lanza en paralelo. Un `Promise.all`
  // aquí cambiaría un 429 lento y recuperable por un 429 de golpe.
  for (const imagen of publicacion.imagenes) {
    mediaIds.push(await subirMedio(o, imagen));
  }

  const cuerpo: Record<string, unknown> = { status: publicacion.texto };
  if (mediaIds.length > 0) cuerpo["media_ids"] = mediaIds;

  const registro = comoRegistro(
    await exigirOk(
      await o.http(`${hostDe(o)}/api/v1/statuses`, {
        method: "POST",
        headers: cabeceras(o),
        body: JSON.stringify(cuerpo),
      }),
      "POST /api/v1/statuses",
      "mastodon",
      "publicar",
    ),
    "POST /api/v1/statuses",
  );

  return {
    id: exigirCampo(registro, "id", "POST /api/v1/statuses"),
    url: typeof registro["url"] === "string" ? (registro["url"] as string) : null,
  };
}

// ---------------------------------------------------------------------------
// La interfaz que consumen los demás
// ---------------------------------------------------------------------------

export function crearAdaptador(o: OpcionesMastodon): AdaptadorSocial {
  return {
    plataforma: "mastodon",
    requiereAnclaje: `Una cuenta registrada en ${hostDe(o)} con su app y su token de acceso.`,
    validar: (publicacion) => validarMastodon(o, publicacion),
    redactar: (contenido) => redactarMastodon(o, contenido),
    publicar: (publicacion) => publicar(o, publicacion),
  };
}
