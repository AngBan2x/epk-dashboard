/**
 * P13 — La forma que tienen que cumplir todos los adaptadores.
 *
 * ## Por qué la capa HTTP es un parámetro y no un `fetch` de dentro
 *
 * Porque los seis adaptadores se escriben **sin una sola credencial**, contra
 * especificación. La prueba de eso solo es posible si el transporte está
 * inyectado: si cada adaptador llama a `fetch` directamente, habría que
 * lanzarlo contra la API real —y eso necesita las claves que esta fase no
 * tiene— o no probarlo.
 *
 * Con la capa inyectada, un test le da al adaptador un `fetch` falso que devuelve
 * lo que le pidan, y comprueba qué **habría** enviado. Eso no prueba que la API
 * acepte el cuerpo; prueba que el cuerpo es el que dice la documentación, que es
 * de donde puede salir el error.
 *
 * Lo que **no** cubre está escrito en `docs/PHASE_P13.md`, y es lo primero que
 * hay que comprobar cuando lleguen las claves.
 *
 * ## Por qué publicar es un método aparte de redactar
 *
 * Porque son cosas distintas con consecuencias distintas. `redactar` es barato,
 * reversible y no toca nada. `publicar` es lo único que sale de la base de datos
 * y llega a una audiencia real. Separarlos en la interfaz deja claro cuál es
 * cuál, y hace que un adaptador que solo redacta siga siendo utilizable si el
 * admin decide no publicar nada.
 */

import type { Plataforma } from "./limites";

/** Reexportada para que los seis adaptadores importen de un solo sitio. */
export type { Plataforma };

// ── El error que se puede diagnosticar ──────────────────────────────────────

/**
 * En qué punto del flujo falló.
 *
 * ## Por qué un vocabulario cerrado y no texto libre
 *
 * Porque la pregunta que hay que poder contestar es **"¿qué falló?"**, y
 * contestarla con una cadena obliga a parsear el mensaje de error. Eso se rompe
 * el día que alguien edita una cadena, y falla sin avisar: el informe sale
 * vacío y parece que no hubo fallo.
 *
 * Con un vocabulario cerrado, `paso` se puede filtrar y comparar. Y la
 * distinción importa: `createSession` de Bluesky es `sesion`, no `publicar`.
 * Esa diferencia es exactamente la que separa "el texto era demasiado largo" de
 * "la contraseña de la app está mal", que son fallos opuestos.
 *
 * `medio` es el paso de subir el fichero, que en Threads e Instagram se
 * hace **antes** de crear el contenedor: si falla ahí, no existe nada que
 * borrar después.
 */
export type Paso = "sesion" | "medio" | "contenedor" | "publicar" | "consulta";

/**
 * Un fallo de la API que se sabe de dónde viene.
 *
 * Antes de RC.46 esta clase estaba **copiada en los seis adaptadores**, idéntica
 * byte a byte. Añadir un campo obligaba a seis ediciones que podían divergir
 * sin que nada lo indicara, y el informe de una publicación ya no se podía
 * construir porque el paso viajaba dentro del texto.
 *
 * Ahora es una clase sola, y `plataforma` y `paso` son campos.
 */
export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly plataforma: Plataforma,
    readonly paso: Paso,
    readonly status: number,
    readonly cuerpo: unknown,
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }
}

/**
 * Lo que Meta (o cualquier API) dice en su cuerpo de error.
 *
 * Se digs `error.message` (Meta), `error` (Bluesky) o `message` (Mastodon) sin
 * normalizar: el texto se muestra a quien lee el informe y **corregirlo** las
 * veces que se equivoca escondería un cambio real de la plataforma.
 */
export function detalleApi(cuerpo: unknown): string | null {
  if (typeof cuerpo === "string") return cuerpo;
  if (cuerpo === null || typeof cuerpo !== "object") return null;
  const r = cuerpo as Record<string, unknown>;

  const directo = r["error_message"] ?? r["error_description"] ?? r["message"];
  if (typeof directo === "string" && directo !== "") return directo;

  const envuelto = r["error"];
  if (typeof envuelto === "string" && envuelto !== "") return envuelto;
  if (envuelto !== null && typeof envuelto === "object") {
    const m = (envuelto as Record<string, unknown>)["message"];
    if (typeof m === "string" && m !== "") return m;
  }
  return null;
}

/**
 * Una capa de HTTP mínima. No es la de `fetch` a propósito: es lo más pequeño
 * que los adaptadores necesitan, y un tipo pequeño es un tipo que un test puede
 * implementar de verdad en cinco líneas.
 */
export type CapaHttp = (url: string, init: RequestInit) => Promise<Response>;

export interface Imagen {
  /** URL absoluta y accesible sin sesión. Meta la va a descargar ella. */
  readonly url: string;
}

export interface Publicacion {
  readonly texto: string;
  readonly imagenes: readonly Imagen[];
}

/** Resultado de publicar. El `id` es lo que devuelve la plataforma, si devuelve. */
export interface ResultadoPublicacion {
  readonly id: string | null;
  readonly url: string | null;
}

export interface AdaptadorSocial {
  readonly plataforma: Plataforma;

  /** Si la cuenta necesita estar enlazada a algo externo (una Page, un IG profesional). */
  readonly requiereAnclaje?: string;

  /**
   * Prepara la publicación sin enviarla.
   *
   * Existe para poder validar y previsualizar sin red. Un adaptador que valida
   * solo al publicar es un adaptador cuyo error se descubre cuando ya salió.
   */
  validar(publicacion: Publicacion): ResultadoValidacion;

  redactar(contenido: Contenido): Promise<Borrador>;

  /**
   * Publica de verdad.
   *
   * Se añadió a la interfaz después de escribir los seis adaptadores. Faltaba,
   * y sin ella un `AdaptadorSocial` no sirve para publicar: `crearAdaptador()`
   * devolvía algo con `validar` y `redactar`, y el `publicar()` de verdad era
   * una función suelta que había que importar de cada módulo por separado.
   *
   * El error no era de estilo. Era que un adaptador que se puede construir pero
   * no usar por la interfaz no es un adaptador: es la mitad de uno, y quien lo
   * reciba por el tipo no tiene forma de saber que le falta algo.
   */
  publicar(publicacion: Publicacion): Promise<ResultadoPublicacion>;
}

export interface Borrador {
  readonly plataforma: Plataforma;
  readonly publicacion: Publicacion;
  /** Si el texto se recortó para caber, y por qué. Nunca en silencio. */
  readonly ajustes: readonly string[];
  /** `true` si no se pudo validar por completo, p. ej. límite sin verificar. */
  readonly requiereRevision: boolean;
}

export interface Contenido {
  readonly titulo: string;
  readonly cuerpo: string;
  readonly enlace?: string;
  readonly imagenes?: readonly Imagen[];
}

export interface ResultadoValidacion {
  readonly ok: boolean;
  readonly errores: readonly string[];
  readonly avisos: readonly string[];
}

/** Corta por graphemes o por unidades UTF-16, según lo que diga la plataforma. */
export function recortar(texto: string, limite: number, unidad: "graphemes" | "utf16"): { texto: string; recortado: boolean } {
  if (unidad === "utf16") {
    const chars = [...texto];
    if (chars.length <= limite) return { texto, recortado: false };
    return { texto: chars.slice(0, limite).join(""), recortado: true };
  }

  // Graphemes: se corta por clusters, no por unidades UTF-16. Cortar por UTF-16
  // parte los emojis por la mitad, y un emoji a medias no es un emoji: es un
  // carácter de reemplazo que se ve roto en la publicación.
  const segmenter = new Intl.Segmenter("es", { granularity: "grapheme" });
  const partes = [...segmenter.segment(texto)];
  if (partes.length <= limite) return { texto, recortado: false };
  return { texto: partes.slice(0, limite).map((s) => s.segment).join(""), recortado: true };
}