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
  const borrador = await adaptador.redactar(contenido);
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