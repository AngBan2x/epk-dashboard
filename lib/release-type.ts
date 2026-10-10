/**
 * `tracks.release_type` — el vocabulario y la normalización, en un solo sitio.
 *
 * ## Por qué este módulo existe
 *
 * `release_type` se guardaba como TEXTO libre y se escribía de dos maneras:
 * `single` (minúsculas, desde `POST /api/releases`) y `Single` / `Album` /
 * `EP` (mayúsculas, desde el catálogo semilla y desde `createTrack`). El
 * resultado no era "dos estilos equivalentes": `getTracksByReleaseType()`
 * (`lib/db.ts`) filtra con `WHERE release_type = ?`, y en SQLite esa
 * comparación **distingue mayúsculas**. Filtrar por `'single'` devolvía 8 de
 * 21 singles, y las 65 filas hijas seguían en `Album` / `Single`.
 *
 * Por eso el valor canónico es **minúscula**, y por eso la capitalización se
 * decide en un sitio: `capitalizeReleaseType()` (`lib/null-safe.ts`) la vuelve a
 * poner para la UI, de modo que la tabla puede ser uniforme y la pantalla no.
 *
 * ## `Vulnicura Strings` es `ep`, y eso es una decisión de catálogo
 *
 * *Vulnicura Strings* son las versiones con cuerdas de un álbum de 12 pistas:
 * describirlas como `album` sería más fiel al disco. Aun así el valor es `ep`,
 * por decisión explícita del propietario del catálogo. Este módulo no intenta
 * argumentar esa decisión — la registra, la aplica y hace que un cambio futuro
 * sea visible en el dry-run en vez de pasar inadvertido.
 */

/** Los tres valores válidos, en minúscula. Es el vocabulario canónico. */
export const RELEASE_TYPE_VALUES = ["album", "ep", "single"] as const;

export type ReleaseTypeValue = (typeof RELEASE_TYPE_VALUES)[number];

/**
 * Lo que se escribe cuando el llamante no dice nada.
 *
 * Minúscula por el mismo motivo que el resto: `POST /api/releases` ya usaba
 * `"single"` como default, y tener dos defaults distintos en dos rutas
 * reintroducía la mezcla que este módulo arregla.
 */
export const DEFAULT_RELEASE_TYPE: ReleaseTypeValue = "single";

/** Release del catálogo semilla marcado deliberadamente como EP. */
export const VULNICURA_RELEASE_TITLE = "Vulnicura Strings";
export const VULNICURA_RELEASE_TYPE: ReleaseTypeValue = "ep";

/**
 * Minúscula y sin espacios. `""` para lo que no es una cadena, y también para
 * una cadena vacía: en los dos casos la fila **no se toca**, porque no hay
 * ningún valor que normalizar y inventar uno sería escribir un dato falso.
 */
export function normalizeReleaseType(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export interface ReleaseTypeRow {
  id: string;
  title: string;
  release_id: string | null;
  release_type: string | null;
}

export interface ReleaseTypeChange {
  id: string;
  title: string;
  release_id: string | null;
  /** Valor actual. Nunca `null`: una fila sin valor no entra en `changes`. */
  from: string;
  to: string;
  /**
   * Por qué cambia:
   *  - `minusculas`  → solo se le quitan las mayúsculas.
   *  - `catalogo-ep` → además se le pone el valor decidido para el catálogo.
   */
  motivo: "minusculas" | "catalogo-ep";
}

export interface ReleaseTypePlan {
  /** Filas que hay que escribir, en el orden en que vinieron. */
  changes: ReleaseTypeChange[];
  /** Filas ya canónicas: se cuenta para poder decir "no había nada que hacer". */
  unchanged: number;
  /**
   * Filas con `release_type` nulo o vacío. **No se modifican**: sin valor no
   * hay nada que normalizar, y el script lo dice en vez de rellenarlo solo.
   */
  sinValor: string[];
}

/**
 * Calcula qué filas hay que reescribir para dejar `release_type` uniforme.
 *
 * Pura: no lee la base de datos ni escribe nada. La lee
 * `scripts/normalize-release-type.ts` (que sí escribe, y solo con `--apply`) y
 * la testean `tests/unit/release-type-normalization.test.ts` sin abrir Turso.
 *
 * La selección de las filas de *Vulnicura Strings* es la misma que la del guard
 * de `scripts/turso-check.ts`: **el padre** es la fila con ese título y
 * `release_id IS NULL`, y sus hijas son las que apuntan a él. Buscar por título
 * a secas traería también las hijas, que no se llaman igual.
 */
export function planReleaseTypeNormalization(
  rows: readonly ReleaseTypeRow[]
): ReleaseTypePlan {
  const vulnicuraParents = new Set(
    rows
      .filter((r) => r.title === VULNICURA_RELEASE_TITLE && r.release_id === null)
      .map((r) => r.id)
  );
  const esVulnicura = (r: ReleaseTypeRow): boolean =>
    vulnicuraParents.has(r.id) ||
    (r.release_id !== null && vulnicuraParents.has(r.release_id));

  const changes: ReleaseTypeChange[] = [];
  const sinValor: string[] = [];
  let unchanged = 0;

  for (const row of rows) {
    const actual = row.release_type;
    if (typeof actual !== "string" || actual.trim() === "") {
      sinValor.push(row.id);
      continue;
    }

    const minusculas = actual.trim().toLowerCase();
    const esCatalogo = esVulnicura(row);
    const objetivo = esCatalogo ? VULNICURA_RELEASE_TYPE : minusculas;

    if (objetivo === actual) {
      unchanged += 1;
      continue;
    }

    changes.push({
      id: row.id,
      title: row.title,
      release_id: row.release_id,
      from: actual,
      to: objetivo,
      motivo: esCatalogo && objetivo !== minusculas ? "catalogo-ep" : "minusculas",
    });
  }

  return { changes, unchanged, sinValor };
}

/**
 * Flags de los scripts de datos: **sin `--apply` no se escribe**.
 *
 * `--dry` existe para que quien lo teclee crea que va a forzar algo lo vea
 * explícito, pero no cambia el default: el default YA es no escribir.
 *
 * Va aquí, y no en el propio script, para que el test pueda atar el
 * comportamiento sin arrancar el proceso y para que los dos scripts de datos
 * compartan exactamente la misma interpretación de los flags.
 */
export function parseDataScriptFlags(
  argv: readonly string[]
): { apply: boolean; dryRequested: boolean } {
  const flags = argv.map((f) => f.trim().toLowerCase());
  const apply = flags.includes("--apply");
  return { apply, dryRequested: apply ? false : flags.includes("--dry") };
}