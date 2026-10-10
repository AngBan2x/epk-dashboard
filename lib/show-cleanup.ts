/**
 * La ventana de limpieza de shows, en un módulo sin base de datos.
 *
 * ## Por qué está aquí y no en el route handler
 *
 * `app/api/shows/cleanup/route.ts` hacía el corte **por día UTC**, no por 48 h:
 *
 *     const cutoffDate = new Date();
 *     cutoffDate.setHours(cutoffDate.getHours() - 48);   // <- setHours, local
 *     const cutoffStr = cutoffDate.toISOString().split("T")[0];
 *
 * Tres fallos en tres líneas. `setHours` usa la zona **local** (el servidor corre
 * en UTC, así que hoy no se nota, pero el código dice otra cosa). Y
 * `.split("T")[0]` tira la hora: el resultado es una fecha, no un instante, así
 * que el corte real cae a medianoche UTC y no a las 48 h. Un show de ayer a las
 * 20:00 se borraba a las 00:00 de anteayer — 44 h después de tocarse, no 48.
 *
 * Aquí el corte es un **instante** (`showCleanupCutoff`) y cada show se compara
 * con el suyo, así que el borde es real: 47 h 59 min no se borra, 48 h 1 min sí.
 *
 * ## Qué instante se le atribuye a un show
 *
 * `shows.date` es un día civil (`YYYY-MM-DD`, viene de un `<input type="date">`),
 * no un momento. `shows.time` es texto libre y en producción es `"HH:MM"`.
 *
 *   - `time` interpretable → el instante es ese día civil **a esa hora**.
 *   - `time` ausente o no interpretable → **00:00 de ese día**. Es el mismo
 *     punto donde caía el corte viejo (`date < cutoffDía`), así que no cambia el
 *     comportamiento de quien no rellena la hora; solo se afina cuando sí la hay.
 *   - `date` ausente o ilegible → el show **no se borra nunca**. Una fila sin
 *     fecha no puede estar "pasada", y borrarla sería pérdida de datos disfrazada
 *     de limpieza. El route handler avisa por consola.
 *
 * Todo se interpreta en **UTC**, y es una decisión, no un descuido: `date` y
 * `time` no llevan zona, así que no hay ninguna correcta que deducir. UTC es la
 * única que no depende de dónde corra el servidor, y hace que estas funciones
 * sean puras y testeables sin reloj real ni huso.
 */

export const SHOW_CLEANUP_GRACE_HOURS = 48;

const MS_PER_HOUR = 60 * 60 * 1000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})/;

/** Lo mínimo de una fila de `shows` para decidir si ya pasó. */
export interface ShowInstantInput {
  date: string | null | undefined;
  time?: string | null;
}

export type ShowInstant =
  | { kind: "instant"; ms: number; assumedMidnight: boolean }
  | { kind: "sin-fecha" }
  | { kind: "fecha-ilegible"; raw: string };

/**
 * Instante de inicio del show en epoch ms (UTC), o por qué no se pudo calcular.
 *
 * `Date.UTC` normaliza en silencio lo que no existe (`"2026-13-40"` sale marzo
 * de 2027), así que la fecha se vuelve a montar y se compara con lo pedido.
 */
export function showStartInstant(
  date: string | null | undefined,
  time?: string | null
): ShowInstant {
  const d = typeof date === "string" ? date.trim() : "";
  if (d === "") return { kind: "sin-fecha" };

  const dm = DATE_RE.exec(d);
  if (!dm) return { kind: "fecha-ilegible", raw: d };

  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return { kind: "fecha-ilegible", raw: d };
  }

  const t = typeof time === "string" ? time.trim() : "";
  const tm = t === "" ? null : TIME_RE.exec(t);
  const hours = tm ? Number(tm[1]) : 0;
  const minutes = tm ? Number(tm[2]) : 0;
  const validTime = hours <= 23 && minutes <= 59;

  return {
    kind: "instant",
    ms: Date.UTC(
      year,
      month - 1,
      day,
      validTime ? hours : 0,
      validTime ? minutes : 0
    ),
    assumedMidnight: !validTime,
  };
}

/**
 * Instante a partir del cual un show se considera pasado: `now - 48 h`.
 *
 * Inyectar `now` no es solo para los tests: fija el corte una vez y todas las
 * filas se juzgan contra él, así que una petición que cruza medianoche no puede
 * decidir dos veces lo mismo de forma distinta (mismo motivo que
 * `createDynamicStatusResolver` en `lib/show-dynamic-status.ts`).
 */
export function showCleanupCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - SHOW_CLEANUP_GRACE_HOURS * MS_PER_HOUR);
}

/**
 * ¿Este show ya pasó la ventana?
 *
 * El borde es `>=`: a las 48 h 0 min exactos ya cuenta como pasado. El
 *ancellado usa `<=` sobre instantes, que es lo mismo.
 */
export function isShowPastCutoff(row: ShowInstantInput, cutoff: Date): boolean {
  const instant = showStartInstant(row.date, row.time);
  if (instant.kind !== "instant") return false;
  return instant.ms <= cutoff.getTime();
}