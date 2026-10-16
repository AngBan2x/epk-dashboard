/**
 * RC.46 — Publicar en varias redes sociales desde local, una detrás de otra.
 *
 * ## Por qué un script y no una ruta web
 *
 * Porque el token tiene que vivir en algún sitio, y las dos opciones son:
 *
 * - En una función serverless: cualquiera con una sesión de admin válida en el
 *   sitio pasa a poder publicar en la cuenta de la marca. Eso no es lo mismo que
 *   "admin de una app de música": es control de la presencia en redes.
 * - En el `.env.local` de una persona: solo publica quien tiene ese fichero, y
 *   el secreto no sale de ese ordenador.
 *
 * Para un proyecto con una sola persona publicando, la segunda gana sin
 *讨论. Las variables de Threads **no están en Vercel** y no se van a poner.
 *
 * ## La pregunta que este script responde: "¿qué falló?"
 *
 * No hay transacción entre plataformas. Si Threads publica y Bluesky falla, el
 * post de Threads **ya está visible** y no hay forma de deshacerlo. Así que la
 * respuesta se construye en tres capas, y las tres están aquí:
 *
 * 1. **`preparar()` de todas antes de enviar nada.** La mayoría de los fallos —
 *    los baratos — se detectan sin publicar, y se sabe por plataforma.
 * 2. **Secuencial, parando en el primer fallo.** No `Promise.all`: rechaza en el
 *    primer error y **pierde los resultados de las demás**, así que publicando
 *    en cuatro y fallando una se creería que no salió ninguna. Y si el primer
 *    fallo es `sesion` (Bluesky), las siguientes van a fallar igual.
 * 3. **`estado: "no-intentado"` en el informe.** Es lo que evita la ambigüedad:
 *    después de un queda escrito que las demás no se intentaron, en vez de
 *    quedar en el aire.
 *
 * ## Lo que NO hace, a propósito
 *
 * **No borra nada si otra falla.** Cada plataforma tiene su "borrar", pero borrar
 * un post publicado porque falló otra red es peor que tener un cross-post
 * descuadrado, y es una decisión de una persona, no de un script.
 *
 * **No programa publicaciones.** Un post programado es un post que sale solo, sin
 * nadie mirando. Pide una cola, un reintento y un panel: es otra fase, y aquí un
 * `programar: <fecha>` sería un campo que no funciona.
 *
 * **Nunca imprime un token.** Ni por pantalla ni al informe.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "dotenv";

// Se carga **antes de nada**, y en el modulo, no en `main()`.
//
// En ES modules todos los imports se evaluan antes que cualquier sentencia del
// cuerpo del modulo, asi que un `config()` dentro de `main()` llegaria tarde:
// cuando se ejecutara, los adaptadores ya habrian leido `process.env` y
// `opcionesThreads` habria dicho que faltan las tres variables, aunque esten
// escritas. Es el mismo orden que rompe `scripts/lib/credentials.ts`.
config({ path: ".env.local" });

import {
  opcionesBluesky,
  opcionesFacebook,
  opcionesInstagram,
  opcionesLinkedin,
  opcionesMastodon,
  opcionesThreads,
} from "../lib/social/config";
import { preparar, type Preparado } from "../lib/social/preparar";
import { ErrorApi, type AdaptadorSocial, type Contenido, type Imagen } from "../lib/social/tipos";
import type { Plataforma } from "../lib/social/limites";
import { getTrackById } from "../lib/db";

const REAL_FETCH: (url: string, init: RequestInit) => Promise<Response> = (u, i) => fetch(u, i);

// ── El informe ──────────────────────────────────────────────────────────────

export type Estado = "publicado" | "fallo" | "no-intentado";

export interface Resultado {
  readonly plataforma: string;
  readonly estado: Estado;
  /** En qué punto falló, si falló. `null` si no llegó a tocar la plataforma. */
  readonly paso: string | null;
  readonly id: string | null;
  readonly url: string | null;
  readonly error: string | null;
}

export interface Informe {
  readonly inicio: string;
  readonly modo: "preview" | "publish";
  readonly preparado: readonly Preparado[];
  readonly resultados: readonly Resultado[];
}

/**
 * Convierte un fallo en una línea de informe.
 *
 * ## Por qué `ErrorApi` y no `catch (e)` a secas
 *
 * Porque `ErrorApi` lleva `plataforma`, `paso`, `status` y el cuerpo crudo. Con
 * eso, "falló" deja de ser una palabra y pasa a ser "Bluesky, en `sesion`, 401,
 * *AuthenticationRequired*". Sin eso habría que **parsear el mensaje**, que es
 * justo lo que se rompe el día que alguien edita una cadena.
 *
 * ## Por qué el body puede ser largo
 *
 * El `cuerpo` de la API puede traer HTML de varios kilobytes. Se recorta a 400
 * caracteres: enough para diagnosticar y lo bastante corto para que el informe
 * siga siendo legible.
 */
export function falloDe(plataforma: string, e: unknown): Resultado {
  if (e instanceof ErrorApi) {
    const detalle = (e.cuerpo !== null && typeof e.cuerpo === "object"
      ? ((e.cuerpo as Record<string, unknown>)["error"] as { message?: string } | undefined)?.message
      : undefined) ?? (typeof e.cuerpo === "string" ? e.cuerpo : null);
    return {
      plataforma: e.plataforma || plataforma,
      estado: "fallo",
      paso: e.paso,
      id: null,
      url: null,
      error:
        `${e.status}${detalle !== null ? " · " + detalle : ""} · ${e.message}`.slice(0, 400),
    };
  }
  return {
    plataforma,
    estado: "fallo",
    paso: null,
    id: null,
    url: null,
    error: (e instanceof Error ? e.message : String(e)).slice(0, 400),
  };
}

// ── El motor ────────────────────────────────────────────────────────────────

export interface PlataformaPreparada {
  readonly adaptador: AdaptadorSocial;
}

/**
 * Prepara todas y **publica en orden, parando en el primer fallo**.
 *
 * Lo que hay que mirar en el resultado:
 *
 * - Todas las `preparado` están calculadas **antes** de la primera escritura.
 *   Si una no está lista, `resultados` va entero a `no-intentado` y no se ha
 *   publicado nada: eso es lo que hace el pre-flight útil.
 * - El primer `fallo` corta. Todo lo que viene después queda `no-intentado`,
 *   explícitamente.
 */
export async function publicarEnOrden(
  preparats: readonly { readonly adaptador: AdaptadorSocial; readonly preparado: Preparado }[],
  hacer: (adaptador: AdaptadorSocial, preparado: Preparado) => Promise<{ id: string | null; url: string | null }>
): Promise<readonly Resultado[]> {
  const resultados: Resultado[] = preparats.map((p) => ({
    plataforma: p.adaptador.plataforma,
    estado: "no-intentado",
    paso: null,
    id: null,
    url: null,
    error: null,
  }));

  // El pre-flight se mira **entero y antes de empezar**, no en cada vuelta.
  //
  // Mirarlo dentro del bucle hacia que la primera plataforma, que estaba lista,
  // se publicara antes de descubrir que la segunda no lo estaba. Y entonces
  // "el pre-flight impide empezar" seria falso justo en el caso que importa: una
  // plataforma valida y otra no.
  const noListas = preparats.filter((p) => !p.preparado.listo);
  if (noListas.length > 0) {
    for (const { adaptador, preparado } of noListas) {
      const i = preparats.indexOf(preparats.find((p) => p.adaptador.plataforma === adaptador.plataforma)!);
      resultados[i] = {
        ...resultados[i],
        estado: "no-intentado",
        error: `No se intentó: ${preparado.errores.join(" ")}`,
      };
    }
    return resultados;
  }

  for (let i = 0; i < preparats.length; i++) {
    const { adaptador, preparado } = preparats[i];

    try {
      const r = await hacer(adaptador, preparado);
      resultados[i] = { ...resultados[i], estado: "publicado", id: r.id, url: r.url };
    } catch (e) {
      resultados[i] = falloDe(adaptador.plataforma, e);
      // Corta aquí. Lo que sigue queda `no-intentado`, y esa es la respuesta a
      // "qué falló": exactamente esto, escrito.
      return resultados;
    }
  }

  return resultados;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

interface Flags {
  readonly de: string | null;
  readonly track: string | null;
  readonly plataformas: readonly Plataforma[];
  readonly publicar: boolean;
  readonly confirmar: boolean;
  readonly informe: string | null;
}

/**
 * `--plataformas` es **obligatorio** y no tiene valor por defecto.
 *
 * Un "publicar en todas las configuradas" por defecto es un accidente esperando:
 * bastaría con que se olvidara el flag en una plataforma nueva para que saliera
 * sola. Con `--plataformas=threads` no hay forma de que salga en Bluesky.
 */
export function leerFlags(argv: readonly string[]): Flags {
  const get = (nombre: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(`--${nombre}=`.length);

  const bruto = get("plataformas");
  if (bruto === undefined) {
    throw new Error(
      "Falta --plataformas.\n" +
        "  Es obligatorio a proposito: no hay valor por defecto. Publicar en todas\n" +
        "  las configuradas es un accidente esperando.\n\n" +
        "  Ejemplo:  --plataformas=threads\n" +
        "            --plataformas=threads,mastodon"
    );
  }

  const admitidas: readonly Plataforma[] = [
    "threads",
    "bluesky",
    "instagram",
    "facebook",
    "linkedin",
    "mastodon",
  ];
  const pedidas = bruto.split(",").map((s) => s.trim()).filter((s) => s !== "");
  const malas = pedidas.filter((p) => !admitidas.includes(p as Plataforma));
  if (malas.length > 0) {
    throw new Error(
      `Plataforma desconocida: ${malas.join(", ")}\n` +
        `  Admitidas: ${admitidas.join(", ")}`
    );
  }
  if (pedidas.length === 0) throw new Error("--plataformas no puede ir vacio.");

  return {
    de: get("de") ?? null,
    track: get("track") ?? null,
    plataformas: pedidas as readonly Plataforma[],
    publicar: argv.includes("--publish"),
    confirmar: argv.includes("--confirmar"),
    informe: get("informe") ?? null,
  };
}

async function adaptadorDe(p: Plataforma): Promise<AdaptadorSocial | string> {
  const mod = await import(`../lib/social/${p}`);
  const opciones = {
    bluesky: opcionesBluesky,
    facebook: opcionesFacebook,
    instagram: opcionesInstagram,
    linkedin: opcionesLinkedin,
    mastodon: opcionesMastodon,
    threads: opcionesThreads,
  }[p](REAL_FETCH);

  if (!opciones.ok) return `Faltan en .env.local: ${opciones.faltan.join(", ")}`;
  const creado = mod.crearAdaptador(opciones.valor);
  return creado as AdaptadorSocial;
}

async function contenidoDe(args: { de: string | null; track: string | null }): Promise<Contenido> {
  if (args.track !== null) {
    // `getTrackById` es `async`: con Turso va por red. Por eso `contenidoDe`
    // es `async` y hay que esperarlo, no usar el resultado directo.
    const track = await getTrackById(args.track);
    if (track === null) throw new Error(`No hay ningún track con id ${args.track}.`);
    return {
      titulo: track.title,
      cuerpo: track.artist_name,
      // La URL suelta, no un `Imagen`: `contenidoDe` devuelve `Contenido`, y
      // aquí se rellena más abajo.
      imagenes: track.cover_image !== "" ? [{ url: track.cover_image }] : [],
    };
  }
  if (args.de !== null) {
    const crudo = JSON.parse(readFileSync(args.de, "utf8")) as Partial<Contenido>;
    return {
      titulo: typeof crudo.titulo === "string" ? crudo.titulo : "",
      cuerpo: typeof crudo.cuerpo === "string" ? crudo.cuerpo : "",
      enlace: typeof crudo.enlace === "string" ? crudo.enlace : undefined,
      imagenes: Array.isArray(crudo.imagenes)
        ? crudo.imagenes.filter((i): i is Imagen => typeof i?.url === "string")
        : [],
    };
  }
  throw new Error("Falta --de=<fichero.json> o --track=<id>.");
}

/**
 * Avisa de lo que va a caducar **antes** de que caduque.
 *
 * ## Por qué esto existe y no un calendario
 *
 * Los tokens de Threads valen 60 días y los permission grants 90 si el perfil es
 * público. El grant se extiende refrescando; el token, no: **pasados los 60 días
 * no hay renewal** y hay que volver al panel de Threads a por otro.
 *
 * Un script que avisa el día antes es más útil que uno que avisa el día después,
 * porque el día después ya no se arregla desde aquí.
 */
export function avisoDeCaducidad(diasRestantes: number | null): string | null {
  if (diasRestantes === null) return null;
  if (diasRestantes < 0) {
    return (
      `El token de Threads CADUCA HACE ${Math.abs(diasRestantes)} dias. ` +
        "Un token de Threads no se puede renovar despues de caducar: hay que generar " +
        "otro en el panel (Generador de identificadores de usuario)."
    );
  }
  if (diasRestantes === 0) {
    return (
      "El token de Threads caduca HOY. Todavia se puede refrescar, pero el " +
      "refresco tiene que ser antes de que caduque, no despues."
    );
  }
  if (diasRestantes <= 14) {
    return (
      `El token de Threads caduca en ${diasRestantes} dias. El permission grant ` +
        "dura 90 dias si el perfil es publico, asi que refrescar lo extiende."
    );
  }
  return null;
}

/** Días que lleva escrito el token, o `null` si no se puede saber. */
export function antiguedadDelToken(dias: number | null): number | null {
  if (dias === null) return null;
  return 60 - dias;
}

/**
 * Días desde que se escribió `.env.local`.
 *
 * ## Por qué el mtime del fichero y no una variable de fecha
 *
 * Porque una variable `THREADS_TOKEN_ESCRITO_EL` se queda vieja en cuanto se
 * regenera el token, y **nadie se acuerda de actualizarla**. El mtime lo cambia
 * quien lo cambia, siempre, sin querer.
 *
 * ## Y por qué es una aproximación, no la verdad
 *
 * `.env.local` se toca por muchas cosas, no solo por el token. Editarlo por otra
 * razón pone el contador a cero y se pierde el aviso. Va en la dirección
 * segura: avisa de más, no de menos. Por eso el aviso nunca dice "todo bien"
 * cuando no sabe: en ese caso **no dice nada**.
 */
function diasDesde(ruta: string): number | null {
  try {
    const ms = Date.now() - statSync(ruta).mtimeMs;
    return Math.floor(ms / 86_400_000);
  } catch {
    return null;
  }
}

function guardarInforme(informe: Informe, destino: string | null): string {
  const marca = new Date().toISOString().replace(/[:.]/g, "-");
  const ruta = destino ?? `informes/publicacion-${marca}.json`;
  mkdirSync(dirname(ruta), { recursive: true });
  // El informe no lleva tokens: solo plataformas, pasos, ids y errores.
  writeFileSync(ruta, JSON.stringify(informe, null, 2), "utf8");
  return ruta;
}

async function main(): Promise<void> {
  const flags = leerFlags(process.argv.slice(2));
  const contenido = await contenidoDe(flags);

  console.log("RC.46 · publicar en redes sociales\n");

  // 1. Adaptadores y pre-flight de TODAS, antes de escribir nada.
  const preparats: {
    readonly adaptador: AdaptadorSocial;
    readonly preparado: Preparado;
  }[] = [];
  const sinConfigurar: string[] = [];

  for (const p of flags.plataformas) {
    const a = await adaptadorDe(p);
    if (typeof a === "string") {
      sinConfigurar.push(`${p}: ${a}`);
      continue;
    }
    const preparado = await preparar(a, contenido, REAL_FETCH);
    preparats.push({ adaptador: a, preparado });

    const marca = preparado.listo ? "listo " : "FALLA ";
    console.log(
      `  ${marca}${p.padEnd(10)} ${preparado.caracteres} caracteres` +
        (preparado.ajustes.length > 0 ? `  (${preparado.ajustes.join("; ")})` : "")
    );
    for (const e of preparado.errores) console.log(`             ERROR  ${e}`);
    for (const a2 of preparado.avisos) console.log(`             aviso  ${a2}`);
  }
  for (const s of sinConfigurar) console.log(`  sin cfg  ${s}`);

  // Solo se avisa cuando se ha pedido Threads. El token de Threads caduca a los
  // 60 dias y **no se renueva despues**: eso no se puede arreglar desde aqui.
  if (flags.plataformas.includes("threads")) {
    const dias = diasDesde(".env.local");
    const aviso = avisoDeCaducidad(antiguedadDelToken(dias));
    if (aviso !== null) console.log(`\n  AVISO   ${aviso}`);
    else if (dias !== null) console.log(`\n  token   escrito hace ${dias} dias; caduca en ${60 - dias}`);
  }

  console.log("");

  // 2. Si alguna no está lista, no se empieza.
  const algunaNoLista = preparats.some((p) => !p.preparado.listo);
  if (algunaNoLista || preparats.length === 0) {
    const resultados: readonly Resultado[] = flags.plataformas.map((p) => ({
      plataforma: p,
      estado: "no-intentado" as const,
      paso: null,
      id: null,
      url: null,
      error: "No se intentó: el pre-flight dio error.",
    }));
    guardarInforme(
      { inicio: new Date().toISOString(), modo: "preview", preparado: preparats.map((p) => p.preparado), resultados },
      flags.informe
    );
    console.log("  No se publica nada: hay plataformas que no están listas.");
    process.exit(1);
  }

  // 3. Preview es el modo por defecto, y no publica.
  if (!flags.publicar) {
    guardarInforme(
      {
        inicio: new Date().toISOString(),
        modo: "preview",
        preparado: preparats.map((p) => p.preparado),
        resultados: preparats.map((p) => ({
          plataforma: p.adaptador.plataforma,
          estado: "no-intentado" as const,
          paso: null,
          id: null,
          url: null,
          error: null,
        })),
      },
      flags.informe
    );
    console.log("  Vista previa. Para publicar de verdad: --publish --confirmar");
    return;
  }

  if (!flags.confirmar) {
    console.log("  Falta --confirmar. No se ha publicado nada.");
    process.exit(1);
  }

  // 4. Aquí sí: una detrás de otra, parando en el primer fallo.
  const resultados = await publicarEnOrden(preparats, (adaptador, preparado) =>
    adaptador.publicar({ texto: preparado.texto, imagenes: preparado.imagenes.map((i) => ({ url: i.url })) })
  );
  const ruta = guardarInforme(
    { inicio: new Date().toISOString(), modo: "publish", preparado: preparats.map((p) => p.preparado), resultados },
    flags.informe
  );

  console.log("");
  for (const r of resultados) {
    const marca = r.estado === "publicado" ? "OK    " : r.estado === "fallo" ? "FALLO " : "----- ";
    console.log(`  ${marca}${r.plataforma.padEnd(10)}${r.error ?? r.url ?? r.id ?? ""}`);
    if (r.paso !== null) console.log(`           paso: ${r.paso}`);
  }
  console.log(`\n  Informe: ${ruta}`);

  if (resultados.some((r) => r.estado === "fallo")) process.exit(1);
}

if (process.argv[1] !== undefined && process.argv[1].includes("social-publish")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}