// Canonical production-sheet field spec — single source of truth for
// ProductionDetails (track detail view + inline edit) and the release edit
// form. Same order, labels, placeholders and input styling everywhere.
//
// ── RC.32: `genre` y `sub_genre` de ESTE archivo son la ÚNICA fuente de ──────
// género de un release. No los quites y no los dupliques.
//
// El motivo, medido en el repo: `tracks` tiene TAMBIÉN una columna `genre`, y
// durante años eso produjo CUATRO géneros coexistiendo:
//
//   1. `production_details.genre`     → se renderiza (ProductionDetails.tsx:53,
//                                       70) y se exporta (downloadable-assets
//                                       .ts:438, 469, 531; pdf/sections.ts:236).
//   2. `production_details.sub_genre` → ídem, se muestra aparte.
//   3. `tracks.genre`                 → COLUMNA MUERTA. `parseTrack`
//                                       (`lib/db.ts`) no la expone, así que no
//                                       sale por ninguna lectura pública, y
//                                       `app/releases/[id]/page.tsx` no la
//                                       menciona ni una vez. Solo la escribían
//                                       los formularios.
//   4. `artists.genre`                → la del PERFIL del artista, que es otro
//                                       dato (scripts/seed-influential-catalog
//                                       .ts:570, 590 escribe esta, no la otra).
//
// El síntoma visible era que el formulario de edición tenía DOS inputs
// etiquetados "Género": el muerto (`tracks.genre`) y este. RC.32 quita el
// muerto del formulario y de la allowlist del PUT, y `production_details
// .genre` queda como única escritura. La COLUMNA `tracks.genre` no se dropea
// (migración de datos, fuera del alcance de esta ola) pero ya nadie la escribe:
// el seed tampoco la usaba.

export type ProductionFieldKey =
  | "daw"
  | "guitars"
  | "effects_chain"
  | "tuning"
  | "key"
  | "genre"
  | "sub_genre"
  | "bpm"
  | "mood"
  | "recording_date";

export interface ProductionField {
  key: ProductionFieldKey;
  label: string;
  placeholder: string;
  type: "text" | "number" | "date";
}

export const PRODUCTION_FIELDS: ProductionField[] = [
  { key: "daw", label: "DAW / Software", placeholder: "Pro Tools, Logic Pro, Ableton...", type: "text" },
  { key: "guitars", label: "Guitarras / Instrumentos", placeholder: "Fender Stratocaster, Gibson Les Paul...", type: "text" },
  { key: "effects_chain", label: "Cadena de Efectos", placeholder: "Reverb, Delay, Distortion...", type: "text" },
  { key: "tuning", label: "Afinación", placeholder: "Standard E, Drop D...", type: "text" },
  { key: "key", label: "Tonalidad", placeholder: "C major, A minor...", type: "text" },
  { key: "genre", label: "Género", placeholder: "Rock, Pop, Electrónica...", type: "text" },
  { key: "sub_genre", label: "Sub-género", placeholder: "Indie Rock, Synthpop...", type: "text" },
  { key: "bpm", label: "BPM", placeholder: "120", type: "number" },
  { key: "mood", label: "Mood", placeholder: "Energético, Melancólico, Alegre...", type: "text" },
  { key: "recording_date", label: "Fecha de grabación", placeholder: "", type: "date" },
];

export const PRODUCTION_INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent";

export const PRODUCTION_CREDITS_LABEL = "Créditos de producción";
export const PRODUCTION_CREDITS_PLACEHOLDER = "Productor, ingeniero de mezcla, masterización...";

/**
 * ## ¿Hay ficha técnica que mostrar?
 *
 * `ProductionDetails` **siempre** se puede pintar: con todo a `null` enseña
 * "Sin datos de producción", que es ruido —media tarjeta que dice que no hay
 * nada—. La pregunta la tiene que responder quien decide si monta el bloque, y
 * la respuesta es la misma en todas las vistas: la del padre de álbum, la de la
 * ficha y ahora la de la página de release.
 *
 * Por eso vive **aquí**, junto a la especificación de los campos, y no en la
 * página que la usa: la lógica que decide se comparte, la que lee no
 * (mismo criterio que `lib/release-page.ts`).
 *
 * ⚠️ **Un objeto con todos los campos a `null` NO cuenta como ficha.** Es lo que
 * escribe el seed en las cabeceras de álbum (`{"daw":null,"guitars":null,…}`),
 * y confundirlos es lo que pinta "Sin datos de producción" debajo del título de
 * un disco que sí tiene pistas con ficha.
 *
 * `production_credits` cuenta aunque no esté en `PRODUCTION_FIELDS`: es el campo
 * libre que la gente rellena cuando la ficha no encaja en los diez campos, y
 * perderlo sería justo el peor fallo de esta función.
 */
export function hasProductionDetails(
  details: Partial<Record<ProductionFieldKey | "production_credits", unknown>> | null | undefined
): boolean {
  if (!details) return false;
  return Object.values(details).some(
    (value) => value != null && String(value).trim() !== ""
  );
}
