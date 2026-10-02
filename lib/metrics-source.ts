/**
 * RC.33 · Ola 3 — qué métrica se muestra, de dónde sale, y cuándo no se muestra
 * ninguna.
 *
 * ## El bug que arregla este módulo
 *
 * `parseMetrics` (`lib/db.ts`) devolvía `{ streams: 0, saves: 0, ... }` cuando la
 * columna venía `NULL`, `""` o con JSON roto. Eso **colapsaba "no lo sabemos" en
 * "cero"**, y como el pie de `EPKCard` hacía
 * `formatNumber((track.metrics?.streams ?? 0) + ytViews)`, la tarjeta pintaba un
 * `0` con tipografía de dato. Un `0` afirma algo —que nadie escuchó— y el
 * catálogo no puede afirmar eso cuando lo único que sabe es que nadie preguntó.
 *
 * Aquí la diferencia es explícita: `value: null` significa "no hay dato", y solo
 * `resolveMetrics` decide qué fuente gana. `0` sigue siendo un valor legítimo:
 * si una fuente **respondió** diciendo cero, cero es el dato.
 *
 * ## Módulo puro
 *
 * Cero red, cero `process.env`, cero `fetch`. La red vive fuera
 * (`lib/youtube.ts`, `lib/lastfm.ts`); este fichero solo decide. Por eso
 * `tests/unit/metrics-source.test.ts` corre sin mockear nada.
 */

import type { Metrics } from "@/types/music";

/**
 * De dónde sale el número que se enseña. `"itunes"` no significa "de iTunes":
 * el JSON curado de `tracks.metrics` lo escribe una persona (a veces con datos
 * inventados, y eso es una decisión del usuario que se respeta), así que la
 * etiqueta es la del origen del dato, no la del proveedor.
 */
export type MetricsSource = "itunes" | "youtube" | "lastfm" | "none";

/** Resultado de resolver una pista (o un álbum). `value: null` = sin dato. */
export interface ResolvedMetrics {
  value: number | null;
  source: MetricsSource;
}

/** Los tres candidatos de una fila. `null`/`undefined` = "esta fuente no habló". */
export interface MetricsCandidates {
  /** `tracks.metrics`, ya parseado. `null` cuando la columna no traía nada. */
  curated?: Metrics | null;
  /** `YouTubeStatPair.viewCount`, o `null` si el vídeo no tiene stats. */
  youtubeViewCount?: number | null;
  /** `LastfmTrackInfo.playcount`, o `null` si Last.fm no respondió. */
  lastfmPlaycount?: number | null;
}

/**
 * Orden de la cadena de fallback, y el orden en que se **agrega** un álbum.
 * El primero es el JSON curado, y gana aunque valga 0: si alguien escribió
 * `streams: 0` a propósito, ese 0 es un dato, no una ausencia.
 */
export const METRICS_SOURCE_ORDER: readonly MetricsSource[] = [
  "itunes",
  "youtube",
  "lastfm",
] as const;

/**
 * Un número cuenta como dato si es finito y no negativo. `NaN`, `Infinity`, los
 * negativos y `null`/`undefined` no cuentan.
 *
 * ⚠️ **El `0` SÍ cuenta, y el llamante es responsable de no mandar un `0` falso.**
 *   Los dos proveedores colapsan "no vino" a `0` antes de llegar aquí:
 *   `lib/youtube.ts:179` (`parseInt(stats?.viewCount || '0', 10)`) y
 *   `lib/lastfm.ts:160` (`parseInt(t.playcount ?? "0", 10) || 0`). Por eso el
 *   contrato es: **si la integración falló, pasa `null`; no `0`**. Es
 *   alcanzable sin adivinar, porque `fetchTrackInfo` (`lib/lastfm.ts:148`)
 *   devuelve un `IntegrationResult` discriminado: `ok` con `playcount: 0` es un
 *   cero real, y `not_found`/`quota`/`network` se traduce a `null`.
 */
function asValue(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v < 0) return null;
  return v;
}

/** Lee el valor de UNA fuente concreta. Es la base de "no mezclar". */
function valueFromSource(
  candidates: MetricsCandidates,
  source: MetricsSource,
): number | null {
  switch (source) {
    case "itunes":
      // El JSON curado presente siempre trae el número: `Metrics` no es
      // nullable por campo. Un objeto `{}` da 0, y 0 es lo que dice.
      return candidates.curated ? candidates.curated.streams : null;
    case "youtube":
      return asValue(candidates.youtubeViewCount);
    case "lastfm":
      return asValue(candidates.lastfmPlaycount);
    case "none":
      return null;
  }
}

/**
 * Resuelve qué fuente gana para una fila, y con qué valor.
 *
 * Gana la **primera** de la cadena que tenga dato. Las que estén por debajo no
 * se miran: no se suman streams curados con vistas de YouTube porque no son la
 * misma unidad.
 */
export function resolveMetrics(candidates: MetricsCandidates): ResolvedMetrics {
  for (const source of METRICS_SOURCE_ORDER) {
    const value = valueFromSource(candidates, source);
    if (value !== null) return { value, source };
  }
  return { value: null, source: "none" };
}

/** Primera fuente de la cadena que tenga alguna hija con dato. */
function firstSourceAmong(children: readonly MetricsCandidates[]): MetricsSource {
  for (const source of METRICS_SOURCE_ORDER) {
    for (const child of children) {
      if (valueFromSource(child, source) !== null) return source;
    }
  }
  return "none";
}

/**
 * ## Por qué un álbum NO puede mezclar fuentes
 *
 * Un scrobble de Last.fm y una vista de YouTube no son la misma escucha, y un
 * "stream" curado a mano tampoco. Sumarlos produce un número grande y sin
 * significado —44M de scrobbles más 2,1M de streams no son 46,1M de nada— que
 * además **cambia según qué fuente respondió primero**, o sea que el mismo
 * álbum daría dos cifras distintas en dos visitas. Un número que no es
 * reproducible no es un dato: es ruido con formato de miles.
 *
 * ## La regla que se aplica
 *
 * 1. Se elige **una** fuente: la del padre si el padre tiene alguna; si el padre
 *    no tiene ninguna, la primera de la cadena que tenga alguna hija.
 * 2. Solo se suman las hijas con dato **en esa fuente**. Las que solo tienen
 *    dato en otra se ignoran enteras — no caen a la siguiente fuente, porque eso
 *    rompería el punto 1.
 * 3. La fuente se propaga tal cual, para que la UI pueda decir de dónde salió.
 *
 * El padre se suma con las hijas: en el catálogo real la fila padre tiene
 * streams propios del álbum y las hijas los suyos, así que dejarla fuera
 * cambiaría el total. Cuando el padre no aporta nada, `valueFromSource` devuelve
 * `null` y no estorba.
 */
export function resolveAlbumMetrics(
  head: MetricsCandidates,
  children: readonly MetricsCandidates[],
): ResolvedMetrics {
  const headSource = resolveMetrics(head).source;
  const source = headSource !== "none" ? headSource : firstSourceAmong(children);
  if (source === "none") return { value: null, source: "none" };

  let total = 0;
  let contributors = 0;
  for (const candidate of [head, ...children]) {
    const value = valueFromSource(candidate, source);
    if (value === null) continue;
    total += value;
    contributors += 1;
  }
  // `contributors` solo puede ser 0 si la fuente no era "none", lo cual no
  // ocurre; se deja explícito para que el tipo sea `number` y no haya un
  // `total: 0` que se cuele como respuesta cuando en realidad no sumando nada.
  if (contributors === 0) return { value: null, source: "none" };
  return { value: total, source };
}

/** Cómo se llama cada fuente, para el `title` del pie. Sin dato incluido. */
export const METRICS_SOURCE_LABELS: Record<MetricsSource, string> = {
  itunes: "métricas curadas del catálogo",
  youtube: "vistas de YouTube",
  lastfm: "scrobbles de Last.fm",
  none: "sin dato",
};

/**
 * Texto del `title` del pie. El "—" necesita explicación: sin esto, un guion
 * suelto parece un bug de render, y el usuario no puede distinguirlo de un
 * número que se perdió. Cuando hay dato, el tooltip dice de dónde salió, que es
 * justo lo que antes no se podía saber porque la suma mezclaba las tres.
 */
export function metricsTooltip(
  resolution: ResolvedMetrics,
  extra?: string | null,
): string {
  const base =
    resolution.source === "none"
      ? "Sin dato: ninguna fuente tiene una cifra para esta pista"
      : `Valor de ${METRICS_SOURCE_LABELS[resolution.source]}`;
  return extra ? `${base}. ${extra}` : base;
}
