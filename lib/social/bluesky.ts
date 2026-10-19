/**
 * P13 — Bluesky (AT Protocol).
 *
 * ## Por qué aquí solo hay un paso "de publicación" y sin embargo hay tres llamadas
 *
 * Publicar un post es un `POST` a `app.bsky.feed.post`. Pero ese `POST` lleva
 * dentro un identificador de sesión y, si hay imagen, un *blob* que todavía no
 * existe. El orden es forzado por el protocolo, no por comodidad:
 *
 *   1. `com.atproto.server.createSession`  → `accessJwt`
 *   2. `com.atproto.repo.uploadBlob`       → una vez por imagen (**si hay**)
 *   3. `app.bsky.feed.post`                → el post, con `embed` si hace falta
 *
 * El paso 2 es el que surprises: **Bluesky no acepta una URL de imagen**. Meta sí
 * la descarga; el AT Protocol sube bytes. Por eso las capturas tienen que estar
 * en el CDN propio de todas formas, y por eso este adaptador es el primero que
 * se escribió: obliga a resolver la descarga binaria de las imágenes, y esa
 * parte la reutilizan LinkedIn y Mastodon.
 *
 * ## Lo verificado y lo que no
 *
 * El límite de 300 graphemes sale del lexicon `app.bsky.feed.post`, no de la web,
 * y está en `limites.ts` con su fecha. La cadencia no se ha buscado: está a
 * `null`, y por eso este adaptador **no** la escribe en ningún sitio.
 *
 * Lo que **no** está verificado y por tanto no se inventa aquí:
 *
 *   - El número máximo de imágenes por publicación. `limites.ts` tiene
 *     `carrusel: null` para esta plataforma, así que no hay un número que citar.
 *     Un borrador con imágenes sale con `requiereRevision: true` y el motivo.
 *   - El texto alternativo. `tipos.ts` define `Imagen` con **solo** `url`, así que
 *     no hay de dónde sacar un `alt`. El valor por defecto es la cadena vacía, que
 *     es la respuesta honesta, no una buena: la accesibilidad de la publicación la
 *     pierde quien la firma. Para eso está la opción `alt`.
 *   - Si la contraseña de la sesión es la de la cuenta o una *app password*. Este
 *     adaptador no decide: pasa lo que le den en `password`. El AT Protocol suele
 *     usar contraseñas de aplicación precisamente porque son revocables por
 *     separado, pero eso no lo hemos verificado contra la documentación aquí.
 *
 * ## `RateLimitExceeded`
 *
 * Un `400` cuyo cuerpo trae `RateLimitExceeded` **sí es un error**, y aquí se
 * lanza como tal. Lo que se conserva es el cuerpo entero en `ErrorApi.cuerpo`,
 * para que quien llame pueda distinguir "te has pasado de cuota" de "el texto no
 * valía". Un 400 de cuota que se devuelve como `id: null` parece una publicación
 * que se perdió, y esa es la peor de las dos lecturas.
 */

import { LIMITES, cabeElTexto, contarGraphemes, limiteDeTexto } from "./limites";
import { recortarSinPartirUrl,
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

export interface OpcionesBluesky {
  /** Inyectada, no importada: es lo que permite probar el adaptador sin red. */
  readonly http: CapaHttp;

  /** Host del PDS, con esquema. Ej. `https://bsky.social`. */
  readonly pds: string;

  /** DID del usuario. No es el handle: el repositorio se direcciona por DID. */
  readonly repo: string;

  /** Handle o correo con el que se abre la sesión. */
  readonly identifier: string;

  /** Lo que el PDS acepte como contraseña. Ver la nota del bloque de arriba. */
  readonly password: string;

  /** Si se envía, va como `langs: [idioma]`. El lexicon lo define opcional. */
  readonly idioma?: string;

  /** `rkey` explícito. Por defecto se genera un TID. Existe para tests. */
  readonly rkey?: string;

  /** Reloj inyectable, por el mismo motivo: los TID tienen que ser reproducibles. */
  readonly ahora?: () => Date;

  /** Texto alternativo de todas las imágenes. Vacío si no se dice nada. */
  readonly alt?: string;
}

// ---------------------------------------------------------------------------
// Utilidades de HTTP.
//
// Duplicadas en los seis ficheros a propósito: la instrucción de esta fase era
// "solo los seis nuevos, nada más en `lib/social/`", y un séptimo módulo
// compartido habría sido exactamente eso. Son unas treinta líneas; el día que
// crece, se extraen, y ese día hay una prueba que lo decide.
// ---------------------------------------------------------------------------

/** Un 4xx no se maquilla de éxito. Ver la nota sobre `RateLimitExceeded`. */

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

/**
 * Descarga los bytes de una imagen por la capa inyectada.
 *
 * Devuelve el `ArrayBuffer` tal cual y no un `Uint8Array` por debajo: con los
 * genéricos de los typed arrays de TypeScript 5.7, un `Uint8Array` nace como
 * `Uint8Array<ArrayBufferLike>` y `BodyInit` solo acepta `ArrayBufferView<ArrayBuffer>`.
 * El `ArrayBuffer` no tiene ese problema y además sirve tal cual para el `Blob` de
 * Mastodon.
 */
async function descargar(http: CapaHttp, url: string, plataforma: Plataforma): Promise<ArrayBuffer> {
  const res = await http(url, { method: "GET" });
  if (!res.ok) {
    throw new ErrorApi(`No se pudo descargar la imagen (${res.status})`, plataforma, "medio", res.status, await cuerpoDe(res));
  }
  return res.arrayBuffer();
}

/** El binario sube con su tipo, no con `application/octet-content` a ver qué pasa. */
function mimeDeUrl(url: string): string {
  const limpio = url.split("?")[0].split("#")[0].toLowerCase();
  if (limpio.endsWith(".png")) return "image/png";
  if (limpio.endsWith(".webp")) return "image/webp";
  if (limpio.endsWith(".gif")) return "image/gif";
  if (limpio.endsWith(".heic") || limpio.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

/**
 * TID: microsegundos desde epoch en base32-sortable, trece caracteres.
 *
 * El `rkey` de un post lo elige el cliente, y tiene que ser un TID: el protocolo
 * ordena lexicográficamente, así que un rkey monotono es lo que hace que el feed
 * se comporte. En microsegundos da 1,7·10¹⁵, por debajo de `Number.MAX_SAFE_INTEGER`
 * (9,0·10¹⁵), así que cabe en aritmética normal y no hace falta `BigInt` — que
 * además no compila con el `target: ES2017` de `tsconfig.json`.
 *
 * Los caracteres de relleno son la prueba de que el formato es el bueno: los 65
 * bits del encoding se rellenan con ceros, y el cero del alfabeto base32-sortable
 * es `"2"`. Un TID real empieza por `"222"`.
 */
function generarTid(fecha: Date): string {
  const alfabeto = "234567abcdefghijklmnopqrstuvwxyz";
  let resto = Math.floor(fecha.getTime()) * 1000;
  let salida = "";
  for (let i = 0; i < 13; i++) {
    salida = alfabeto[resto % 32] + salida;
    resto = Math.floor(resto / 32);
  }
  return salida;
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

function validarBluesky(publicacion: Publicacion): ResultadoValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];

  const limite = limiteDeTexto("bluesky");
  if (limite === null) {
    // `cabeElTexto` ya devuelve `false` cuando no sabemos, así que la pregunta
    // correcta no es "¿cabe?" sino "¿sabemos?".
    avisos.push("No hay límite de texto verificado para Bluesky; no se puede afirmar que el texto cabrá.");
  } else {
    const largo = contarGraphemes(publicacion.texto);
    if (!cabeElTexto("bluesky", publicacion.texto)) {
      errores.push(`El texto son ${largo} graphemes y el máximo son ${limite}.`);
    }
  }

  if (publicacion.imagenes.length > 0) {
    avisos.push(
      `El máximo de imágenes por post no está verificado (\`carrusel: null\` en limites.ts). Van ${publicacion.imagenes.length}.`,
    );
  }

  return { ok: errores.length === 0, errores, avisos };
}

async function redactarBluesky(contenido: Contenido): Promise<Borrador> {
  const bruto = componerTexto(contenido);
  const ajustes: string[] = [];
  let requiereRevision = false;
  let texto = bruto;

  const limite = limiteDeTexto("bluesky");
  if (limite === null) {
    // Recortar contra un número inventado deja un post truncado sin que nadie lo
    // pidiera, y el recorte es irreversible en la plataforma. Se deja entero y se
    // avisa: la decisión es de quien lea, no de aquí.
    requiereRevision = true;
    ajustes.push("Texto sin recortar: el límite de Bluesky no está verificado.");
  } else {
    const corte = recortarSinPartirUrl(bruto, limite, LIMITES.bluesky.unidad);
    texto = corte.texto;
    if (corte.recortado) {
      ajustes.push(`Texto recortado a ${limite} ${LIMITES.bluesky.unidad}.`);
    }
    if (corte.urlIncompleta) {
      // El recorte habria partido la URL: se ha quitado entera en vez de dejar
      // un enlace roto. Un post sin enlace es mejor que un post con un enlace
      // que no lleva a ninguna parte, y el recorte es irreversible.
      ajustes.push("El recorte partía el enlace: se ha quitado la URL entera en vez de dejarla rota.");
    }
  }

  const imagenes: readonly Imagen[] = contenido.imagenes ?? [];
  if (imagenes.length > 0) {
    requiereRevision = true;
    ajustes.push("Número de imágenes sin verificar y sin texto alternativo en `Imagen`: revísalas antes de publicar.");
  }

  const publicacion: Publicacion = { texto, imagenes };
  const validacion = validarBluesky(publicacion);

  return {
    plataforma: "bluesky",
    publicacion,
    ajustes,
    requiereRevision: requiereRevision || validacion.avisos.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------

interface Sesion {
  readonly accessJwt: string;
  readonly handle: string | null;
}

/**
 * Abre sesión en el PDS y devuelve el `accessJwt`.
 *
 * ## Por qué es `export` y no un detalle interno
 *
 * Porque es la **única** forma de comprobar que unas credenciales de Bluesky
 * sirven, y durante meses el script de comprobación se saltó esta función y se
 * hizo su propia llamada a `getProfile` mandando **el app password como bearer**.
 *
 * Eso no puede funcionar nunca: un app password sirve para autenticarse en
 * `createSession`, y lo que autoriza las llamadas después es el `accessJwt` que
 * esa llamada devuelve. Son dos cosas distintas y el error sale como un `400`
 * sin explicación, que se lee como "credenciales malas" cuando están bien.
 *
 * ## Lo que devuelve
 *
 * El `handle` a pelo, para que el informe diga a qué cuenta pertenece. La API
 * `getProfile` sí lo devolvería, pero llegar hasta ella exige esta sesión antes:
 * sin ella no hay forma honesta de preguntar.
 */
export async function abrirSesion(o: OpcionesBluesky): Promise<Sesion> {
  return crearSesion(o);
}

async function crearSesion(o: OpcionesBluesky): Promise<Sesion> {
  const registro = comoRegistro(
    await exigirOk(
      await o.http(`${o.pds}/xrpc/com.atproto.server.createSession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: o.identifier, password: o.password }),
      }),
      "com.atproto.server.createSession",
      "bluesky",
      "sesion",
    ),
    "com.atproto.server.createSession",
  );

  return {
    accessJwt: exigirCampo(registro, "accessJwt", "com.atproto.server.createSession"),
    handle: typeof registro["handle"] === "string" ? (registro["handle"] as string) : null,
  };
}

interface ImagenBluesky {
  readonly $type: "app.bsky.embed.images";
  readonly images: readonly { readonly image: unknown; readonly alt: string }[];
}

async function subirEmbed(o: OpcionesBluesky, jwt: string, imagenes: readonly Imagen[]): Promise<ImagenBluesky> {
  const subidas: { image: unknown; alt: string }[] = [];

  for (const imagen of imagenes) {
    const bytes = await descargar(o.http, imagen.url, "bluesky");
    const blob = await exigirOk(
      await o.http(`${o.pds}/xrpc/com.atproto.repo.uploadBlob`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": mimeDeUrl(imagen.url),
        },
        body: bytes,
      }),
      "com.atproto.repo.uploadBlob",
      "bluesky",
      "medio",
    );

    // **El registro espera el objeto interno del blob, no el envoltorio.**
    //
    // `uploadBlob` responde `{"blob": {"$type":"blob","ref":{...},"mimeType":...,
    // "size":...}}`, pero el lexicon `app.bsky.feed.post` define
    // `images[].image` como un **blob**, o sea el objeto de dentro. Reenviar el
    // cuerpo entero hace que el PDS lo lea como un objeto con una propiedad
    // `blob` y responda:
    //
    //   Invalid app.bsky.feed.post record: Expected blob value type
    //   (got {"blob": ...}) at $.record.embed.images[0].image
    //
    // El error nombra el campo exacto, pero el mensaje dice "got {"blob": ...}",
    // que es la forma de decir "esto no es un blob, es algo que contiene un
    // blob". Pasó de verdad: el `uploadBlob` devolvía 200 y el `createRecord`
    // rechazaba el registro.
    const interno = (blob as { blob?: unknown }).blob;
    if (interno === undefined || interno === null) {
      throw new ErrorApi(
        "com.atproto.repo.uploadBlob respondió sin el objeto del blob",
        "bluesky",
        "medio",
        200,
        blob,
      );
    }

    subidas.push({ image: interno, alt: o.alt ?? "" });
  }

  return { $type: "app.bsky.embed.images", images: subidas };
}

export async function publicar(o: OpcionesBluesky, publicacion: Publicacion): Promise<ResultadoPublicacion> {
  const sesion = await crearSesion(o);

  const embed =
    publicacion.imagenes.length > 0 ? await subirEmbed(o, sesion.accessJwt, publicacion.imagenes) : undefined;

  const fecha = (o.ahora ?? (() => new Date()))();
  // Se calcula una vez y se reutiliza: el `rkey` que se envía y el `rkey` del
  // enlace tienen que ser el mismo, y depender de que dos llamadas puras coincidan
  // es una forma innecesaria de que dejen de coincidir.
  const rkey = o.rkey ?? generarTid(fecha);

  const registro = comoRegistro(
    await exigirOk(
      await o.http(`${o.pds}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sesion.accessJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: o.repo,
          collection: "app.bsky.feed.post",
          rkey,
          record: {
            $type: "app.bsky.feed.post",
            text: publicacion.texto,
            createdAt: fecha.toISOString(),
            ...(o.idioma ? { langs: [o.idioma] } : {}),
            ...(embed ? { embed } : {}),
          },
        }),
      }),
      "com.atproto.repo.createRecord",
      "bluesky",
      "publicar",
    ),
    "com.atproto.repo.createRecord",
  );

  const uri = exigirCampo(registro, "uri", "app.bsky.feed.post");

  // La API no devuelve URL pública, solo el `uri`. La de bsky.app se compone con
  // el `handle` de la sesión y el `rkey` enviado. Es una convención de la web, no
  // parte del contrato de la API: por eso es `null` cuando no hay handle, en vez
  // de inventarse uno.
  const url =
    sesion.handle === null
      ? null
      : `https://bsky.app/profile/${encodeURIComponent(sesion.handle)}/post/${encodeURIComponent(rkey)}`;

  return { id: uri, url };
}

// ---------------------------------------------------------------------------
// La interfaz que consumen los demás
// ---------------------------------------------------------------------------

export function crearAdaptador(o: OpcionesBluesky): AdaptadorSocial {
  return {
    plataforma: "bluesky",
    validar: validarBluesky,
    redactar: redactarBluesky,
    // `publicar` entra en la interfaz en P13. Antes era una función suelta y
    // `crearAdaptador()` devolvía algo con lo que se podía preparar pero no
    // enviar, que es la mitad de un adaptador.
    publicar: (publicacion) => publicar(o, publicacion),
  };
}
