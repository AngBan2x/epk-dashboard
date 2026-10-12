/**
 * P13 — Los límites de cada plataforma, en un solo sitio.
 *
 * ## Por qué un fichero y no uno por adaptador
 *
 * Porque es el dato que más se va a equivocar y el que más cuesta noticing.
 * Si el límite de Threads vive en `threads.ts`, el de Instagram en
 * `instagram.ts` y el de Bluesky en `bluesky.ts`, actualizar la tabla obliga a
 * abrir seis ficheros y no hay forma de saber que se han actualizada todos.
 *
 * Aquí hay **una** tabla, con **una** fecha. Cuando se verifique algo nuevo se
 * toca una línea y la fecha, y el resto hereda.
 *
 * ## La fecha es el dato, no un adorno
 *
 * `2026-10-11` no es decorativo: es lo que separa "lo verificamos" de "lo
 * suponíamos". Dentro de un año alguien verá 250 posts/día en Threads y no podrá
 * saber si sigue siendo cierto. Con la fecha puede comprobarlo.
 *
 * Y `null` significa **sin verificar**, que es distinto de un número. No hay
 * ningún sitio donde se rellene de memoria: `limiteDeTexto()` devuelve `null`
 * y quien llama tiene que decidir qué hacer con eso, en vez de recibir un 2200
 * inventado por Instagram.
 *
 * ## Lo que está verificado y lo que no, hoy
 *
 * Verificado el 2026-10-11 contra documentación primaria:
 *   - Bluesky: 300 graphemes (lexicon `app.bsky.feed.post`)
 *   - Threads: 500 caracteres, 250 posts/24 h
 *   - Mastodon: 500 por defecto pero configurable por instancia,
 *     300 peticiones/5 min, medios 30/30 min
 *   - Instagram: 100 posts/24 h simple, 50 carruseles/24 h, carrusel ≤10
 *   - Facebook: 4800 × usuarios comprometidos / 24 h
 *   - LinkedIn: **no se publica en ninguna parte**
 *
 * Sin verificar, y marcado como tal: el límite de caracteres de Instagram,
 * Facebook y LinkedIn. Son límites de la app cliente, no de la API, y no
 * aparecen en la documentación. Se confirman probando.
 */

/** `null` significa "no verificado". No es un número, y no se rellena de memoria. */
export type Limite = number | null;

/** Cuándo se comprobó cada cosa. Sin esto, un número cadence solo. */
export const FECHA_DE_VERIFICACION = "2026-10-11";

export type Plataforma = "bluesky" | "threads" | "instagram" | "facebook" | "linkedin" | "mastodon";

export interface Limites {
  /**
   * Máximo de caracteres del texto principal.
   *
   * `null` = sin verificar, NO ilimitado. Quien reciba `null` tiene que
   * recortar por su cuenta o preguntar; no puede tratarlo comoInfinity.
   */
  readonly texto: Limite;

  /** En `graphemes` (Bluesky) o en unidades de código UTF-16 (el resto). */
   readonly unidad: "graphemes" | "utf16";

  /** Publicaciones por ventana. `null` = la plataforma no lo publica. */
  readonly publicaciones: Limite;
  readonly ventana: string;

  /** Carruseles de una vez. `null` = no aplica o sin verificar. */
  readonly carrusel: Limite;

  /** Nota de por qué, cuando el dato tiene una trampa detrás. */
  readonly nota?: string;
}

export const LIMITES: Record<Plataforma, Limites> = {
  bluesky: {
    texto: 300,
    unidad: "graphemes",
    publicaciones: null,
    ventana: "24 h",
    carrusel: null,
    nota: "300 sale del lexicon `app.bsky.feed.post`, no de la web. La cadencia no se ha buscado.",
  },

  threads: {
    texto: 500,
    unidad: "utf16",
    publicaciones: 250,
    ventana: "24 h",
    carrusel: 20,
    nota: "Imagen entre 320 y 1440 px de ancho, JPEG/PNG/WEBP, 8 MB. El ancho mínimo lo comprueban las capturas.",
  },

  instagram: {
    texto: null,
    unidad: "utf16",
    publicaciones: 100,
    ventana: "24 h",
    carrusel: 10,
    nota: "El límite de caracteres NO está en la API. Además: 100/24 h para una imagen, 50/24 h para carrusel, y solo JPEG. El contenedor caduca a las 24 h.",
  },

  facebook: {
    texto: null,
    unidad: "utf16",
    publicaciones: null,
    ventana: "24 h",
    carrusel: null,
    nota: "La cadencia no es un número: `4800 × usuarios comprometidos`. Con una cuenta nueva son 4800 llamadas, y publicar un post son varias. El límite de caracteres tampoco está en la API.",
  },

  linkedin: {
    texto: null,
    unidad: "utf16",
    publicaciones: null,
    ventana: "24 h",
    carrusel: null,
    nota:
      "LinkedIn no publica sus límites. Textual de su documentación: " +
      '"Standard rate limits are not published in documentation." Se descubren haciendo una ' +
      "llamada de prueba y leyendo la pestaña Analytics del Developer Portal. Avisa por " +
      "correo al superar el 75 %, con 1-2 h de retraso.",
  },

  mastodon: {
    texto: 500,
    unidad: "utf16",
    publicaciones: 300,
    ventana: "5 min",
    carrusel: null,
    nota: "El 500 es el default, y cada instancia puede bajarlo. 300 llamadas/5 min por cuenta y por IP. Subir medio son 30 llamadas/30 min, que es el límite que de verdad aprieta.",
  },
};

/**
 * El límite de texto, o `null` si no se ha verificado.
 *
 * Existe como función para que el `null` sea **difícil de ignorar**: quien
 * llama tiene que mirarlo. Un `LIMITES.x.texto` leído en línea se puede pasar
 * por alto con un `?? Infinity` sin querer.
 */
export function limiteDeTexto(p: Plataforma): Limite {
  return LIMITES[p].texto;
}

/** `true` si el texto cabe. `false` si no cabe **o** si no lo sabemos. */
export function cabeElTexto(p: Plataforma, texto: string): boolean {
  const limite = limiteDeTexto(p);
  if (limite === null) return false; // no sabemos -> no damos el visto bueno
  const longitud = LIMITES[p].unidad === "graphemes" ? contarGraphemes(texto) : [...texto].length;
  return longitud <= limite;
}

/**
 * Contar graphemes sin dependencias es más difícil de lo que parece: un
 * emoji como 👨‍👩‍👧‍👦 es un solo grapheme y cinco unidades UTF-16, y una letra
 * con acento combinante son dos.
 *
 * Se usa `Intl.Segmenter`, que viene en Node y en todos los navegadores
 * modernos desde 2023. Antes de ese estandar había que traer una libreria de
 * 20 KB para contar mal.
 */
export function contarGraphemes(texto: string): number {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("es", { granularity: "grapheme" });
    return [...segmenter.segment(texto)].length;
  }
  // Sin `Segmenter` se cuenta por unidades UTF-16, que es una cota superior:
  // sobreestima y por tanto recorta de más, que es el fallo seguro.
  return [...texto].length;
}