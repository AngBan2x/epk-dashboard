/**
 * Diagnostico de credenciales sociales — solo lectura.
 *
 * ## Que hace y que NO hace
 *
 * Imprime, por plataforma, si estan todas las variables y **cuales faltan por su
 * nombre**. No imprime ningun valor: ni los tokens, ni su longitud, ni un hash.
 * Ese limite es deliberado y no es prudencia gratuita — la salida de este script
 * va a un terminal, y a veces a un issue, y un informe que dice
 * "META_ACCESS_TOKEN: ok (217 caracteres)" acaba con el prefijo de un token
 * pegado en un sitio publico.
 *
 * Tampoco llama a ninguna API. Que un token este *sirviendo* solo se comprueba
 * contra Meta, y eso lo hace `scripts/social-smoke.ts`.
 *
 * ## Uso
 *
 *   npx tsx scripts/social-check.ts
 *
 * Sale con codigo 1 si alguna plataforma esta incompleta, para poder encadenarlo
 * en un gate.
 */

import { config } from "dotenv";

// El modulo que LEE el entorno lo CARGA (ver `scripts/lib/credentials.ts`): en
// ES modules los imports se evaluan antes que el cuerpo del modulo, asi que un
// `config()` aqui correria despues de que `config.ts` ya hubiera leido un
// `process.env` vacio.
config({ path: ".env.local" });

import { informe } from "../lib/social/config";

const PLATAFORMA_ETIQUETA: Record<string, string> = {
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
};

function linea(estado: boolean): string {
  return estado ? "OK     " : "INCOMPLETA";
}

console.log("Credenciales de redes sociales (nombres de variable, nunca valores)\n");

const datos = informe();
let completas = 0;

for (const p of datos) {
  const etiqueta = PLATAFORMA_ETIQUETA[p.plataforma] ?? p.plataforma;
  console.log(`  [${linea(p.configurada)}]  ${etiqueta}`);

  if (!p.configurada) {
    console.log(`             falta: ${p.faltan.join(", ")}`);
    console.log(`             ${p.motivo}`);
  } else {
    completas += 1;
  }
}

console.log("");
console.log(`  ${completas}/${datos.length} plataformas con las variables definidas.`);

if (completas < datos.length) {
  console.log("");
  console.log("  Definingolas todas no basta: un token puede estar definido y caducado,");
  console.log("  o ser de una app equivocada. Eso lo comprueba social-smoke.ts.");
  process.exitCode = 1;
}