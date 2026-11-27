/**
 * D16 — lo que el dueño ve de sus shows archivados.
 *
 * La mitad de datos ya estaba: `getShowsByArtist()` **no** filtra por
 * `deleted_at`, así que el artista recibe sus archivados. La mitad que faltaba
 * era la de la vista, y una vista no se puede probar si la decisión está
 * enterrada en un `.map()` de JSX. Aquí está la decisión, ejecutable.
 *
 * Los lectores públicos son otra función y otro alcance:
 * `getApprovedShows()` y `getApprovedShowsByArtist()` filtran
 * `deleted_at IS NULL`. Que el dueño vea lo suyo no lo ve nadie más.
 */

import type { Show } from "@/types/music";

/** Un show está archivado si tiene `deleted_at`. No hay otro estado intermedio. */
export function isArchived(show: Pick<Show, "deleted_at">): boolean {
  return Boolean(show.deleted_at);
}

/**
 * Orden para el dueño: activos primero, archivados al final.
 *
 * El SQL ordena por fecha ASC y un show archivado es pasado por definición, así
 * que sin esto los archivados saldrían **los primeros**, que es justo al revés
 * de lo útil. `Array.prototype.sort` es estable, así que dentro de cada grupo se
 * respeta la fecha que trajo el SQL.
 */
export function orderForOwner<T extends Pick<Show, "deleted_at">>(shows: readonly T[]): T[] {
  return [...shows].sort((a, b) => Number(isArchived(a)) - Number(isArchived(b)));
}

/**
 * Etiqueta del contador de la sección.
 *
 * "5 shows" cuando no hay archivados —el caso normal, y el que no debe cambiar—,
 * y "5 shows · 1 archivado" cuando sí los hay. El plural se decide por el
 * número de archivados, no por el total: "5 shows · 1 archivados" es el tipo de
 * detalle que hace que una interfaz parezca descuidada.
 */
export function showsCountLabel(total: number, archived: number): string {
  const base = `${total} shows`;
  if (archived <= 0) return base;
  return `${base} · ${archived} archivado${archived === 1 ? "" : "s"}`;
}

const DIA_MS = 86_400_000;

export interface PurgeCandidate<T> {
  show: T;
  /** `Date.parse(deleted_at)`, ya validado. */
  archivedAt: number;
  /** Días completos archivado. Para el informe, no para decidir. */
  days: number;
}

export interface PurgeSelection<T> {
  /** Archivados hace más de la ventana: los únicos que la purga puede borrar. */
  candidates: PurgeCandidate<T>[];
  /** Con `deleted_at` que no es una fecha. **Nunca** se borran: no se sabe su edad. */
  unreadable: T[];
}

/**
 * La parte peligrosa de P20.2, aislada para poder probarla.
 *
 * La purga es un `DELETE` duro, así que la decisión de *qué* se borra no puede
 * vivir en el script, donde solo se puede leer: vive aquí y se ejecuta en un
 * test. La ventana es de gracia, no de retención: un show archivado ayer puede
 * ser un clic equivocado, y `deleted_at` es lo único que permite deshacerlo.
 *
 * Un `deleted_at` ilegible **no** se purga. La alternativa —tratarlo como
 * "antiquísimo"— convierte un dato corrupto en un borrado irreversible.
 */
export function selectPurgeable<T extends Pick<Show, "deleted_at">>(
  shows: readonly T[],
  options: { days: number; now?: number },
): PurgeSelection<T> {
  const now = options.now ?? Date.now();
  const cutoff = now - options.days * DIA_MS;
  const candidates: PurgeCandidate<T>[] = [];
  const unreadable: T[] = [];

  for (const show of shows) {
    if (!show.deleted_at) continue;
    const archivedAt = Date.parse(show.deleted_at);
    if (Number.isNaN(archivedAt)) {
      unreadable.push(show);
      continue;
    }
    if (archivedAt <= cutoff) {
      candidates.push({ show, archivedAt, days: Math.floor((now - archivedAt) / DIA_MS) });
    }
  }

  return { candidates, unreadable };
}
