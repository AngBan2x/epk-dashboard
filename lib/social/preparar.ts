/**
 * RC.46 — La comprobación que ocurre **antes** de enviar nada a ninguna red.
 *
 * ## Por qué una etapa entera y no una función dentro del publicador
 *
 * Porque la pregunta "¿qué falló?" tiene dos mitades y solo una se puede
 * resolver antes de empezar:
 *
 * 1. **Lo que se puede prever.** Texto que no cabe, imagen que Meta no puede
 *    descargar, token que no está, formato que no vale. Todo eso se sabe con la
 *    red apagada, y se sabe **por plataforma**. Si una sola no está lista, no se
 *    empieza: nada sale, y el informe dice exactamente cuál era.
 * 2. **Lo que no se puede prever.** Un `429`, un token revocado a las tres de la
 *    mañana, un CDN caído. Eso solo aparece al publicar, y por eso el
 *    `publicar` va aparte y lleva su propio registro.
 *
 * Mezclar las dos es lo que hace que un script de publicación sea inutilizable:
 * si valida y escribe en el mismo bucle, un fallo en la quinta plataforma ya
 * ha dejado cuatro posts fuera y no hay forma de saberlo.
 *
 * ## Por qué comprueba las imágenes y no solo el texto
 *
 * Threads **descarga** el medio en el momento del intento. Una imagen que no se
 * puede bajar no da un error de "imagen inválida": da un `400` opaco, o deja la
 * publicación a medias — que ya la ve gente. Detectar eso aquí, gratis, es
 * exactamente lo que evita el peor desenlace.
 *
 * ## Lo que NO se comprueba
 *
 * **Si la plataforma está configurada.** Eso lo dice `config.ts`, y quien llama
 * ya lo ha consultado: `preparar()` recibe un adaptador que existe, luego las
 * credenciales ya están. Comprobarlo aquí sería una segunda fuente de verdad
 * sobre lo mismo, y las dos se desincronizarían.
 */

import { comprobarImagenes, type InformeImagen } from "./imagenes";
import type { AdaptadorSocial, Contenido } from "./tipos";

/**
 * Normaliza el contenido antes de redactar, para que el enlace no aparezca dos
 * veces: una dentro del cuerpo y otra como enlace separado que cada adaptador
 * añade al final (`componerTexto` en threads, y los equivalentes en el resto).
 *
 * Solo quita la última línea con contenido si es equivalente al enlace. Todo lo
 * demás se deja intacto.
 */
function urlEquals(a: string, b: string): boolean {
  // **Por qué se normaliza antes de comparar y no se comparan las cadenas.**
  //
  // La primera versión de esto comparaba `new URL(x).hostname` y `pathname`, con
  // un `catch` que devolvía `a === b` si la URL no parseaba. Y aquí está el
  // problema: `new URL("epk-dashboard.vercel.app")` **lanza**, porque no tiene
  // esquema. O sea, justo el caso real —el cuerpo con el dominio pelado y el
  // `enlace` con `https://`— caía siempre en el `catch` y devolvía `false`.
  //
  // El fix no arreglaba nada, y no se notó porque el test usaba el mismo formato
  // en los dos lados. Se notó al publicar: el post salió con el enlace dos
  // veces en Mastodon y en Instagram.
  //
  // Por eso aquí se mete un esquema por defecto antes de parsear: `"foo.com"` y
  // `"https://foo.com"` son la misma dirección, y quien escribe el borrador
  // escribe las dos formas.
  const normalizar = (s: string): URL | null => {
    const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
    try {
      return new URL(conEsquema);
    } catch {
      return null;
    }
  };

  const ua = normalizar(a);
  const ub = normalizar(b);
  if (ua === null || ub === null) return a === b;

  const host = (u: URL) => u.hostname.replace(/^www\./i, "");
  const ruta = (u: URL) => u.pathname.replace(/\/+$/, "");

  return host(ua) === host(ub) && ruta(ua) === ruta(ub);
}

function normalizarContenido(contenido: Contenido): Contenido {
  if (!contenido.enlace) return contenido;
  const enlace = contenido.enlace.trim();
  if (!enlace) return contenido;
  const lineas = contenido.cuerpo.split("\n");
  let idx = lineas.length - 1;
  while (idx >= 0 && lineas[idx].trim() === "") idx--;
  if (idx >= 0 && urlEquals(lineas[idx].trim(), enlace)) {
    const nuevas = lineas.slice(0, idx);
    while (nuevas.length > 0 && nuevas[nuevas.length - 1].trim() === "") nuevas.pop();
    return { ...contenido, cuerpo: nuevas.join("\n") };
  }
  return contenido;
}

export interface Preparado {
  readonly plataforma: string;
  /** Texto ya recortado a lo que quepa. Es lo que se publicaría, no lo que se escribió. */
  readonly texto: string;
  readonly caracteres: number;
  readonly ajustes: readonly string[];
  readonly errores: readonly string[];
  readonly avisos: readonly string[];
  readonly imagenes: readonly InformeImagen[];
  /**
   * `true` si **no hay errores**.
   *
   * Los avisos no bloquean: son cosas que no se pueden comprobar desde aquí, y
   * bloquear con ellas convertiría un "no sé" en un "no".
   */
  readonly listo: boolean;
}

/**
 * Redacta, valida y comprueba las imágenes. **No escribe en ninguna plataforma.**
 *
 * Es la única mitad de la publicación que se puede repetir sin miedo, y por eso
 * es la que se ejecuta siempre primero.
 */
export async function preparar(
  adaptador: AdaptadorSocial,
  contenido: Contenido,
  http: (url: string, init: RequestInit) => Promise<Response>
): Promise<Preparado> {
  // Evitar que el enlace quede duplicado: una vez dentro del cuerpo y otra como
  // enlace separado que el adaptador añade al final. Esto protege a las seis
  // plataformas desde un solo punto.
  const contenidoLimpio = normalizarContenido(contenido);
  const borrador = await adaptador.redactar(contenidoLimpio);
  const validacion = adaptador.validar(borrador.publicacion);

  const informes =
    borrador.publicacion.imagenes.length > 0
      ? await comprobarImagenes(
          borrador.publicacion.imagenes.map((i) => i.url),
          http
        )
      : [];

  const problemasDeImagen = informes.filter((i) => !i.ok).map((i) => i.problema as string);
  const avisosDeImagen = informes.filter((i) => i.aviso !== null).map((i) => i.aviso as string);

  const errores = [...validacion.errores, ...problemasDeImagen];
  const avisos = [...validacion.avisos, ...avisosDeImagen];

  return {
    plataforma: adaptador.plataforma,
    texto: borrador.publicacion.texto,
    caracteres: [...borrador.publicacion.texto].length,
    ajustes: borrador.ajustes,
    errores,
    avisos,
    imagenes: informes,
    listo: errores.length === 0,
  };
}