// C4 — el vocabulario de show, en un solo sitio.
//
// Antes este fichero **redefinía** `ShowStatus` con 13 literales, 7 alias legacy
// y un `| string` al final. Ese `| string` era el problema: al ser un `string`
// cualquiera, `ShowStatus` no restringía nada, y tres ficheros declaraban tres
// listas distintas (`types/music.ts`, este, y el `z.enum` de `app/api/shows`).
// La autoridad es ahora `types/music.ts`, y aquí solo se derivan las piezas que
// la UI necesita.
//
// ## Los 8 estados, en dos mitades
//
//   Elegibles (6)  proximamente · confirmado · activo · pospuesto ·
//                  cancelado · suspendido        -> `SHOW_STATUS_SELECTABLE`
//   Derivados (2)  hoy · pasado                  -> los pone la fecha
//
// `hoy` y `pasado` no se pueden elegir a propósito: dependen de la fecha del show
// y de la de hoy, así que ofrecerlos en un `<select>` es ofrecer a elegir una
// mentira. Los calcula `computeDynamicStatus`
// (`lib/show-dynamic-status.ts`).
//
// ## Por qué se retiraron los otros
//
//   `finalizado`   = `pasado` con otra palabra.
//   `en_venta`     = `activo`. `disponible` = `activo`. Tres nombres, un estado.
//   `agotado`      = inventario de entradas, no ciclo de vida. Y los datos para
//                   saberlo ya existen: `ticket_url` null es "no hay entradas",
//                   `approved` false es "no hay venta".
//   `reprogramado` = `pospuesto` + una fecha nueva. Los dos datos, otra vez.
//
// Comprobado contra Turso antes de retirar nada (2026-10-05): `shows` tiene **1
// fila**, y su estado es `proximamente`. Ningún estado retirado tenía un solo
// registro, así que la poda no mueve nada de la base.
//
// ## Los alias legacy también se fueron
//
// `proximo`, `pendiente`, `aprobado`, `rechazado`, `propuesto`, `completado` y
// `en_vivo` no los usaba nadie: en el repositorio solo aparecían en las tablas de
// este fichero, y el vocabulario de *release* tiene `pending`/`approved`/
// `rejected`, que es otra cosa y ya se llama así. Mantener alias que nada
// produce es una lista que hay que creer.
//
// Si algún día aparece un valor viejo en la base, `toShowStatus` lo estrecha al
// vocabulario y avisa por `console.warn`: la respuesta sigue siendo válida para
// el tipo, y el dato raro queda a la vista en el log en vez de romperse en
// silencio ni quedarse tipado como `string` para siempre.

import type { ShowStatus } from "@/types/music";

/**
// Los 6 estados que elige una persona, en el orden que se ven en el `<select>`.
 *
// Es la lista que usan `SHOW_STATUS_OPTIONS` (la UI), el `z.enum` de
// `POST`/`PUT /api/shows` y la comprobación de que `ShowStatus` la contiene
// entera. Derivarla de aquí en vez de reescribirla en tres sitios es lo que
// impide que vuelvan a separarse.
 */
export const SHOW_STATUS_SELECTABLE = [
  "proximamente",
  "confirmado",
  "activo",
  "pospuesto",
  "cancelado",
  "suspendido",
] as const satisfies readonly ShowStatus[];

/**
// Los 2 que calcula la fecha. Se exportan para poder referenciarlos (y para que
// un test afirme que **no** están en `SHOW_STATUS_SELECTABLE`, que es el error
// que tendría sentido alguien reintroduciendo).
 */
export const SHOW_STATUS_DERIVED = ["hoy", "pasado"] as const satisfies readonly ShowStatus[];

/** Etiquetas legibles. Solo los 8: lo que no esté, cae al raw en `showStatusLabel`. */
const SHOW_STATUS_LABELS: Record<ShowStatus, string> = {
  proximamente: "Próximamente",
  confirmado: "Confirmado",
  activo: "Activo",
  pospuesto: "Pospuesto",
  cancelado: "Cancelado",
  suspendido: "Suspendido",
  hoy: "Hoy",
  pasado: "Pasado",
};

/**
// El `<select>` del formulario: solo los 6 elegibles.
 *
// Antes tenía 13 opciones, incluidas `hoy`, `pasado` y `finalizado` — tres
// maneras de escribir lo mismo que la fecha ya decidía.
 */
export const SHOW_STATUS_OPTIONS: ReadonlyArray<{ value: ShowStatus; label: string }> =
  SHOW_STATUS_SELECTABLE.map((value) => ({ value, label: SHOW_STATUS_LABELS[value] }));

/** Clases del badge, del mismo tono que el gradiente de `components/shows/ShowCover.tsx`. */
const SHOW_STATUS_STYLES: Record<ShowStatus, string> = {
  proximamente: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  confirmado: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  activo: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  pospuesto: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  cancelado: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
  suspendido: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  hoy: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  pasado: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

/**
// `string` y no `ShowStatus` a propósito: **`shows.status` es TEXT**, así que lo
// que llega de la base no está tipado por nada, y esta función es el borde.
// Quien llama ya sabe que lo pasa por `toShowStatus` (o por
// `computeDynamicStatus`, que ya devuelve `ShowStatus`).
 */
export function showStatusClass(status: string): string {
  return (
    SHOW_STATUS_STYLES[status as ShowStatus] ||
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
  );
}

export function showStatusLabel(status: string): string {
  return SHOW_STATUS_LABELS[status as ShowStatus] || status;
}

/**
// Estrecha lo que sale de la base al vocabulario cerrado, y **avisa** si no
// encaja.
 *
// El aviso es la parte importante. Sin él, un valor inválido se convertiría en
// `proximamente` y nadie se enteraría: el show se mostraría como próximo en
// un catálogo donde ya se pasó. Con él, la fila se degrada al estado por
// defecto (que es lo que el `DEFAULT_SHOW_STATUS` de siempre significaba) y el
// log deja la anomalía a un `grep` de distancia.
 *
// `onUnknown` existe para que los tests no griten por consola y para que quien
// quiera pueda recoger el valor en vez de imprimir.
 */
export function toShowStatus(raw: unknown, onUnknown?: (value: unknown) => void): ShowStatus {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "proximamente" || value === "confirmado" || value === "activo" || value === "pospuesto" || value === "cancelado" || value === "suspendido" || value === "hoy" || value === "pasado") {
    return value;
  }
  if (onUnknown) {
    onUnknown(raw);
  } else {
    console.warn(
      `[show-status] "${String(raw)}" no está en el vocabulario y se trata como "proximamente".` +
        ` Si es un estado retirado (finalizado, en_venta, disponible, agotado, ` +
        `reprogramado o un alias legacy), corresponde a: ${legacyEquivalent(raw)}`
    );
  }
  return "proximamente";
}

/**
// Qué estado sustituye a cada retirado, solo para el mensaje del `warn`.
 *
// Vive en el log y no en ninguna decisión: cuando aparece el aviso, el dato ya
// está arreglado y lo que se quiere es saber de dónde vino. Sin este mapa, el
// aviso diría "trátalo como proximamente" y no diría qué hacer.
 */
function legacyEquivalent(raw: unknown): string {
  switch (String(raw).trim()) {
    case "finalizado":
      return "pasado";
    case "en_venta":
    case "disponible":
    case "aprobado":
      return "activo";
    case "reprogramado":
      return "pospuesto (y revisa la fecha)";
    case "agotado":
      return 'el estado que corresponda; el inventario se deduce de `ticket_url` y `approved`';
    case "proximo":
    case "pendiente":
      return "proximamente";
    case "propuesto":
    case "completado":
      return 'el que corresponda; estos alias nunca tuvo estado propio';
    case "en_vivo":
      return "hoy, si la fecha es hoy";
    default:
      return "ninguno: no es un estado retirado";
  }
}

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  ticket_platform: "Plataforma de Tickets",
  other: "Otro",
};

export function paymentMethodLabel(type: string): string {
  return PAYMENT_TYPE_LABELS[type] || type;
}