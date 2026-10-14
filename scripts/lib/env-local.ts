/**
 * Escribir una variable en `.env.local` sin perder el resto del fichero.
 *
 * ## Por que vive aqui y no duplicado en dos scripts
 *
 * Porque hay dos (`meta-page-token.ts` y `meta-long-lived-token.ts`) que escriben
 * las mismas claves, y una copia de la regexp en dos sitios es una copia que se
 * desincroniza: uno terminaAnchorando y el otro no, y solo se nota cuando
 * `.env.local` queda con dos `META_PAGE_ID` y la que gana depende del orden de
 * lectura.
 *
 * ## El detalle que hace que sobreescriba y no duplique
 *
 * La regexp es `^CLAVE=.*$` **con la flag `m`**. Sin ella, `^` y `$` anclan a
 * principio y fin del *fichero*, no de la linea, asi que solo encontraria una
 * coincidencia si la clave fuese la unica del fichero — y en ese caso no
 * sobreescribiria nada, anadiria una segunda linea con la misma clave.
 *
 * Y `.trimEnd()` antes de anadir evita que la ultima linea previa se coma el
 * salto, que es como se rompe un `.env` sin que se vea.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** Sobrescribe `clave` si existe, o la anade al final. */
export function escribirEnEnvLocal(clave: string, valor: string): void {
  const ruta = ".env.local";

  const linea = `${clave}=${valor}`;
  // `m` es lo que hace que ^ y $ apliquen a cada linea y no al fichero entero.
  const patron = new RegExp(`^${clave}=.*$`, "m");

  let contenido = existsSync(ruta) ? readFileSync(ruta, "utf8") : "";

  contenido = patron.test(contenido)
    ? contenido.replace(patron, linea)
    : `${contenido.trimEnd()}\n${linea}\n`;

  writeFileSync(ruta, contenido, "utf8");
}