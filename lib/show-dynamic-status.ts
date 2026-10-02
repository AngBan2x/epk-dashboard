/**
 * RC.33 Ola 5 — el estado de un show se deriva de su fecha, y la derivación vive
 * aquí. No en un route handler.
 *
 * ── Por qué se extrajo ──────────────────────────────────────────────────────
 * `computeDynamicStatus` estaba **dentro** de `GET /api/shows`
 * (`app/api/shows/route.ts`), y solo la llamaban los 5 puntos de ese mismo
 * handler. `/api/dashboard` —que es la ruta que alimenta el dashboard del
 * artista y el carrusel del catálogo— devolvía el `status` CRUDO de la columna, y
 * el componente `ShowsBooking` pintaba su etiqueta con ese valor. De ahí el bug
 * reportado: un show con `status = 'proximamente'` (el default del formulario,
 * `components/ShowForm.tsx:30`) y una fecha ya pasada salía con el badge
 * "Próximamente". Una función que solo se ejecuta en una de las dos rutas que
 * sirven el mismo dato no es una función del dominio: es un accidente de
 * instalación.
 *
 * ── La regla, sin cambios de semántica ─────────────────────────────────────
 *   - `cancelado` / `suspendido`: NO se recalculan. Son decisiones editoriales
 *     de una persona; la fecha no puede deshacerlas.
 *   - sin `date`: se conserva lo guardado (o el default).
 *   - fecha de hoy: `"hoy"`.
 *   - fecha anterior a hoy: `"pasado"`.
 *   - fecha futura: se conserva lo guardado (o el default).
 *   - fecha ilegible: se conserva lo guardado. Nunca lanza.
 *
 * ── Mejora 1: una sola referencia por respuesta ────────────────────────────
 * Antes cada llamada hacía su propio `new Date()`. Con cinco llamadas en el
 * mismo `GET`, una respuesta que cruzara medianoche podía decidir dos veces lo
 * mismo de forma distinta: un show de hoy evaluado a las 23:59 salía `"hoy"` en
 * la fila 1 y `"pasado"` en la fila 5, en la MISMA respuesta. Ahora el
 * instante de
 * referencia se fija una vez y se pasa por parámetro (`computeDynamicStatus`) o
 * se encapsula (`createDynamicStatusResolver`).
 *
 * ── Mejora 2: días civiles, no instantes ──────────────────────────────────
 * `date` es un día, no un momento: viene de un `<input type="date">` y se
 * guarda como `"YYYY-MM-DD"`. `new Date("2025-12-31")` es la medianoche **UTC**,
 * mientras que el "hoy" del servidor se calculaba con la medianoche **local**.
 * En cualquier huso horario al oeste de UTC (y durante la primera hora del día en
 * los al este) las dos medianoches no coinciden y el show de ayer se leía como
 * "hoy" o el de hoy como "pasado". Aquí se comparan días civiles: se extraen
 * año/mes/día y se comparan como enteros UTC, así que el resultado no depende de
 * la zona horaria ni del cambio de hora. Comportamiento idéntico en UTC —que es
 * donde corre producción— y correcto en el resto.
 *
 * ── Lo único que este módulo sigue mintiendo ───────────────────────────────
 * `status` es TEXT en la base y el vocabulario válido son 13 literales
 * (`types/music.ts:355`), pero además hay un `| string` laxo en
 * `lib/show-status.ts:4-18` y los arrays Zod de la API. Este módulo devuelve
 * `string` —honesto— y quien llama estrecha a `ShowStatus` en el borde de la
 * respuesta, que es donde ese `as` ya estaba. `withDynamicStatus` lo hace una
 * sola vez por array. Unificar las tres definiciones es deuda mayor y no se toca
 * aquí: cambiaría el contrato de `lib/show-status.ts` entero.
 */

import type { ShowStatus } from "@/types/music";

/** Lo mínimo que hace falta de un show para decidir su estado. */
export interface ShowStatusInput {
  status: string;
  date: string | null;
}

/** Default del formulario (`ShowForm.tsx`) y del resto del dominio. */
export const DEFAULT_SHOW_STATUS = "proximamente";

/**
 * Estados que la fecha no toca. Un cancelado sigue cancelado aunque la fecha ya
 * haya pasado: la cancelación es una decisión editorial, no un reloj.
 */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["cancelado", "suspendido"]);

const MS_PER_DAY = 86_400_000;

interface CalendarDay {
  y: number;
  m: number;
  d: number;
}

/** Días locales del instante de referencia. */
function calendarDayOf(instant: Date): CalendarDay {
  return { y: instant.getFullYear(), m: instant.getMonth(), d: instant.getDate() };
}

/**
 * `"YYYY-MM-DD"` (con o sin hora detrás) → día civil, sin pasar por `Date`, que
 * interpretaría un día suelto como medianoche UTC.
 *
 * Si la cadena no empieza por una fecha se intenta `new Date` (fechas completas
 * o valores ISO con hora), y de ahí se toman los componentes **locales**: en un
 * instante con hora, "qué día es" es una pregunta de la zona horaria del
 * espectador. Si tampoco eso es una fecha válida, se devuelve `null` y quien
 * llama conserva el estado guardado — una fila con `date` basura no puede
 * romper la respuesta.
 */
function parseCalendarDay(raw: string): CalendarDay | null {
  const head = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (head) {
    const y = Number(head[1]);
    const m = Number(head[2]) - 1;
    const d = Number(head[3]);
    // `Date.UTC` normaliza en silencio ("2025-13-40" -> marzo de 2026), así que
    // se compara contra lo pedido para detectar esas cadenas.
    const probe = new Date(Date.UTC(y, m, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m || probe.getUTCDate() !== d) {
      return null;
    }
    return { y, m, d };
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return calendarDayOf(parsed);
}

/** Entero comparable de un día civil. Los meses van de 0 a 11, como en `Date`. */
function dayIndex(day: CalendarDay): number {
  return Date.UTC(day.y, day.m, day.d);
}

/**
 * Días de calendario entre la fecha del show y la referencia. Negativo = pasado,
 * 0 = hoy, positivo = futuro, `null` = fecha no utilizable.
 */
export function calendarDaysFromReference(showDate: string, reference: Date): number | null {
  const day = parseCalendarDay(showDate);
  if (!day) return null;
  return Math.round((dayIndex(day) - dayIndex(calendarDayOf(reference))) / MS_PER_DAY);
}

/**
 * Estado efectivo de un show, recalculado por fecha.
 *
 * `reference` es inyectable a propósito: fijarlo hace que un lote de shows se
 * juzgue contra un único instante (dos llamadas que cruzan medianoche no pueden
 * discrepar) y permite testear sin reloj real.
 */
export function computeDynamicStatus(show: ShowStatusInput, reference: Date = new Date()): string {
  if (TERMINAL_STATUSES.has(show.status)) return show.status;
  if (!show.date) return show.status || DEFAULT_SHOW_STATUS;

  const delta = calendarDaysFromReference(show.date, reference);
  if (delta === 0) return "hoy";
  if (delta !== null && delta < 0) return "pasado";
  return show.status || DEFAULT_SHOW_STATUS;
}

/**
 * Calculadora con el instante ya cerrado. Un route handler la crea una vez por
 * petición y la reutiliza en todas las filas de la respuesta.
 */
export function createDynamicStatusResolver(
  reference: Date = new Date()
): (show: ShowStatusInput) => string {
  const frozen = new Date(reference.getTime());
  return (show: ShowStatusInput): string => computeDynamicStatus(show, frozen);
}

/**
 * Forma de lista: copia el array con el `status` ya resuelto y con el tipo que
 * los consumidores esperan. Es la que usa `/api/dashboard`, que reparte shows
 * por artista; las listas de `/api/shows` usan el resolvedor equivalente. Las
 * dos rutas pasan por este módulo, que es el punto: si una dejara de hacerlo,
 * los tests de `tests/unit/show-dynamic-status.test.ts` se ponen rojos.
 */
export function withDynamicStatus<T extends ShowStatusInput>(
  shows: readonly T[],
  reference: Date = new Date()
): Array<Omit<T, "status"> & { status: ShowStatus }> {
  const resolve = createDynamicStatusResolver(reference);
  return shows.map((show) => ({ ...show, status: resolve(show) as ShowStatus }));
}