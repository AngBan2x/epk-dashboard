import type { ExportSection } from "@/lib/downloadable-assets";

/**
 * Identidad visual de PressPlay en el PDF. Se toma de `tailwind.config` y no de
 * los estilos HTML: los `.html` de `lib/downloadable-assets.ts` son documentos
 * sueltos con su propia paleta (rosa/beig para el dossier, verde para el rider),
 * mientras que el PDF es un unico documento de marca y usa indigo/violeta/pink.
 */
export const PDF_COLORS = {
  indigo: "#4f46e5",
  violet: "#8b5cf6",
  pink: "#ec4899",
  emerald: "#059669",
  ink: "#0f172a",
  body: "#1e293b",
  slate: "#475569",
  muted: "#94a3b8",
  hairline: "#e2e8f0",
  surface: "#f8fafc",
  white: "#ffffff",
} as const;

export const PDF_FONTS = {
  serif: "PressPlaySerif",
  serifBold: "PressPlaySerifBold",
} as const;

export const PDF_PAGE = {
  size: "A4" as const,
  /** A4 en puntos. */
  width: 595.28,
  height: 841.89,
  margin: 52,
  /** Ancho util entre margenes. */
  content: 595.28 - 52 * 2,
} as const;

export const PDF_SECTION_TITLES: Record<ExportSection, string> = {
  dossier: "Dossier de prensa",
  rider: "Rider técnico",
  catalog: "Catálogo",
};
