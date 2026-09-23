// Canonical production-sheet field spec — single source of truth for
// ProductionDetails (track detail view + inline edit) and the release edit
// form. Same order, labels, placeholders and input styling everywhere.

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
