import {
  parseDurationToSeconds,
  safeArray,
  safeNumber,
  safeString,
  sumDurations,
} from "@/lib/null-safe";
import { escapeHtml } from "@/lib/email-templates";
import type { Track, TopCountry } from "@/types/music";
import type { DossierData } from "@/lib/db";

export type ExportFormat = "html" | "json" | "pdf";
export type ExportSection = "dossier" | "rider" | "catalog";

export type DossierSource = DossierData | Readonly<Record<string, string | null>> | null;

export interface ExportPayload {
  artistName: string;
  artistId?: string | null;
  genre?: string | null;
  location?: string | null;
  tracks?: Track[];
  dossier?: DossierSource;
  generatedAt?: Date;
}

export const EXPORT_VERSION = "F9-2026";
export const EXPORT_SECTIONS: readonly ExportSection[] = ["dossier", "rider", "catalog"];

const DEFAULT_SECTIONS: Record<ExportFormat, ExportSection[]> = {
  html: ["catalog"],
  json: ["catalog"],
  // Igual que html/json: sin secciones explicitas se exporta el catalogo, que es
  // la unica que no necesita `artist_id` (dossier y rider dan 400 sin el).
  pdf: ["catalog"],
};

/**
 * Exportados (no privados) porque `lib/pdf/` construye el PDF con exactamente los
 * mismos valores que el HTML: duplicar estas tablas haria que un PDF y un HTML
 * del mismo artista dijeran cosas distintas.
 */
export const RIDER_DEFAULTS = {
  rider_pa_system: "Line Array - Minimo 15,000W RMS",
  rider_monitors: "Minimo 4 mezclas in-ear o wedge",
  rider_console: "Digital - minimo 32 canales",
  rider_subwoofers: "Minimo 4 sub-graves (18 o 21)",
  rider_guitar: "Amplificador Combo 100W o Head + Cabinet",
  rider_bass: "Amplificador Combo 300W minimo",
  rider_drums: "Kit completo + hardware + baquetas",
  rider_keyboards: "Piano digital 88 teclas con sustain",
  rider_lighting: "Iluminacion basica con focus en escenario",
  rider_stage_size: "Minimo 6m x 4m",
  rider_stage_conditions: "Escenario cubierto y seco",
  rider_hospitality: "Agua natural, cafe, frutas frescas, snacks antes del show",
  rider_transport: "Transporte desde hotel al venue incluido",
};

const DOSSIER_STYLES = `    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Georgia', serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #0f172a; }
    h1 { font-size: 2.5rem; border-bottom: 4px solid #db2777; padding-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; color: #be185d; margin-top: 2rem; }
    .meta { color: #475569; font-size: 0.9rem; margin: 0.3rem 0; }
    .section { margin: 1.5rem 0; padding: 1.5rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
    .press-text { font-style: italic; border-left: 3px solid #db2777; padding-left: 1rem; margin: 1rem 0; }
    .tags { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
    .tag { display: inline-block; background: #fce7f3; color: #be185d; border-radius: 9999px; padding: 0.2rem 0.8rem; font-size: 0.8rem; font-weight: bold; }
    @media print { body { padding: 1rem; } }`;

const CATALOG_STYLES = `    body { font-family: 'Georgia', serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #0f172a; }
    h1 { font-size: 2.5rem; border-bottom: 4px solid #db2777; padding-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; color: #be185d; margin-top: 2rem; }
    .track { border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; margin: 1rem 0; }
    .badge { display: inline-block; background: #fce7f3; color: #be185d; border-radius: 9999px; padding: 0.2rem 0.8rem; font-size: 0.8rem; font-weight: bold; margin-bottom: 0.5rem; }
    .meta { color: #475569; font-size: 0.9rem; margin: 0.3rem 0; }
    .stats { display: flex; gap: 2rem; margin: 1rem 0; flex-wrap: wrap; }
    .stat { text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: bold; color: #db2777; }
    .stat-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; }
    .links { display: inline-flex; gap: 0.75rem; flex-wrap: wrap; }
    .links a { color: #db2777; font-size: 0.85rem; text-decoration: underline; }
    .lyrics { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem 1rem; font-size: 0.85rem; white-space: pre-wrap; color: #334155; margin: 0.5rem 0 0; font-family: 'Georgia', serif; }
    @media print { body { padding: 1rem; } .track { break-inside: avoid; } }`;

const RIDER_STYLES = `    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #0f172a; line-height: 1.6; }
    h1 { font-size: 2rem; color: #0f172a; border-bottom: 4px solid #10b981; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
    h2 { font-size: 1.3rem; color: #047857; margin: 2rem 0 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .section { margin-bottom: 2rem; padding: 1.5rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    .item { padding: 0.75rem; background: white; border-radius: 8px; border: 1px solid #e2e8f0; }
    .item-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .item-value { font-size: 1rem; color: #0f172a; font-weight: 500; }
    .notes { padding: 1rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; color: #92400e; font-size: 0.9rem; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem; text-align: center; }
    @media print { body { padding: 1rem; } .section { break-inside: avoid; } }`;

const RIDER_STYLES_SCOPED = `    #rider-section h1 { font-size: 2rem; color: #0f172a; border-bottom: 4px solid #10b981; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
    #rider-section h2 { font-size: 1.3rem; color: #047857; margin: 2rem 0 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
    #rider-section .section { margin-bottom: 2rem; padding: 1.5rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
    #rider-section .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    #rider-section .item { padding: 0.75rem; background: white; border-radius: 8px; border: 1px solid #e2e8f0; }
    #rider-section .item-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 600; }
    #rider-section .item-value { font-size: 1rem; color: #0f172a; font-weight: 500; }
    #rider-section .notes { padding: 1rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; color: #92400e; font-size: 0.9rem; }`;

export function dossierRecord(payload: ExportPayload): Readonly<Record<string, string | null>> {
  const source = payload.dossier;
  if (!source) return {};
  const record: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(source)) {
    record[key] = typeof value === "string" ? value : null;
  }
  return record;
}

export function dossierText(data: Readonly<Record<string, string | null>>, key: string, fallback = ""): string {
  const value = data[key];
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

export function riderValue(data: Readonly<Record<string, string | null>>, key: keyof typeof RIDER_DEFAULTS): string {
  return dossierText(data, key, RIDER_DEFAULTS[key]);
}

export function formatDateLong(date: Date): string {
  return date.toLocaleDateString("es-VE", { year: "numeric", month: "long", day: "numeric" });
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("es-VE").format(value);
}

function safeHref(value: unknown): string | null {
  const raw = safeString(value, "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  return raw;
}

function htmlDocument(titleHtml: string, styles: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleHtml}</title>
  <style>
${styles}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function dossierFooter(now: Date): string {
  return `
  <div style="margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem; text-align: center;">
    <p>Generado por PressPlay &middot; ${now.getFullYear()}</p>
  </div>`;
}

function riderFooter(now: Date): string {
  return `
  <div class="footer">
    <p>Generado por PressPlay &middot; ${now.getFullYear()}</p>
  </div>`;
}

function riderBody(payload: ExportPayload, includeFooter: boolean): string {
  const now = payload.generatedAt ?? new Date();
  const artistName = escapeHtml(safeString(payload.artistName));
  const date = escapeHtml(formatDateLong(now));
  const data = dossierRecord(payload);
  const notes = dossierText(data, "rider_special_notes");

  return `
  <h1>Rider Tecnico &mdash; ${artistName}</h1>
  <p><strong>Artista:</strong> ${artistName}</p>
  <p><strong>Fecha:</strong> ${date}</p>

  <div class="section">
    <h2>Equipo de Sonido</h2>
    <div class="grid">
      <div class="item"><div class="item-label">Sistema PA</div><div class="item-value">${escapeHtml(riderValue(data, "rider_pa_system"))}</div></div>
      <div class="item"><div class="item-label">Monitores</div><div class="item-value">${escapeHtml(riderValue(data, "rider_monitors"))}</div></div>
      <div class="item"><div class="item-label">Consola FOH</div><div class="item-value">${escapeHtml(riderValue(data, "rider_console"))}</div></div>
      <div class="item"><div class="item-label">Subwoofers</div><div class="item-value">${escapeHtml(riderValue(data, "rider_subwoofers"))}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Backline</h2>
    <div class="grid">
      <div class="item"><div class="item-label">Guitarra</div><div class="item-value">${escapeHtml(riderValue(data, "rider_guitar"))}</div></div>
      <div class="item"><div class="item-label">Bajo</div><div class="item-value">${escapeHtml(riderValue(data, "rider_bass"))}</div></div>
      <div class="item"><div class="item-label">Bateria</div><div class="item-value">${escapeHtml(riderValue(data, "rider_drums"))}</div></div>
      <div class="item"><div class="item-label">Teclados</div><div class="item-value">${escapeHtml(riderValue(data, "rider_keyboards"))}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Escenario</h2>
    <div class="grid">
      <div class="item"><div class="item-label">Iluminacion</div><div class="item-value">${escapeHtml(riderValue(data, "rider_lighting"))}</div></div>
      <div class="item"><div class="item-label">Tamano minimo</div><div class="item-value">${escapeHtml(riderValue(data, "rider_stage_size"))}</div></div>
      <div class="item"><div class="item-label">Condiciones</div><div class="item-value">${escapeHtml(riderValue(data, "rider_stage_conditions"))}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Hospitality</h2>
    <p>${escapeHtml(riderValue(data, "rider_hospitality"))}</p>
  </div>

  <div class="section">
    <h2>Transporte</h2>
    <p>${escapeHtml(riderValue(data, "rider_transport"))}</p>
  </div>

  ${notes ? `<div class="section"><h2>Notas Especiales</h2><div class="notes">${escapeHtml(notes)}</div></div>` : ""}
  ${includeFooter ? riderFooter(now) : ""}`;
}

function dossierBody(payload: ExportPayload, includeFooter: boolean): string {
  const now = payload.generatedAt ?? new Date();
  const artistName = escapeHtml(safeString(payload.artistName));
  const date = escapeHtml(formatDateLong(now));
  const data = dossierRecord(payload);

  const genre = dossierText(data, "genre", safeString(payload.genre, ""));
  const location = dossierText(data, "location", safeString(payload.location, ""));
  const biography = dossierText(
    data,
    "biography",
    `${safeString(payload.artistName)} es un artista multidisciplinario con trayectoria en produccion musical, composicion y performance en vivo.`
  );
  const pressText = dossierText(data, "press_text");
  const influences = dossierText(data, "influences");
  const contactEmail = dossierText(data, "contact_email", dossierText(data, "booking_email", "booking@epk-dashboard.com"));
  const management = dossierText(data, "management", "PressPlay Records");
  const website = dossierText(data, "website");
  const websiteHref = safeHref(website);

  const tags = influences
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => `<span class="tag">${escapeHtml(entry)}</span>`)
    .join("\n      ");

  return `
  <h1>${artistName} &mdash; Dossier de Prensa</h1>
  <p class="meta">Generado el ${date}</p>
  ${genre ? `<p class="meta"><strong>Genero:</strong> ${escapeHtml(genre)}</p>` : ""}
  ${location ? `<p class="meta"><strong>Ubicacion:</strong> ${escapeHtml(location)}</p>` : ""}

  <div class="section">
    <h2>Biografia</h2>
    <p>${escapeHtml(biography)}</p>
  </div>

  ${pressText ? `<div class="section"><h2>Prensa</h2><div class="press-text">${escapeHtml(pressText)}</div></div>` : ""}

  ${influences ? `
  <div class="section">
    <h2>Influencias</h2>
    <div class="tags">
      ${tags}
    </div>
  </div>` : ""}

  <div class="section">
    <h2>Contacto</h2>
    <p class="meta"><strong>Email:</strong> ${escapeHtml(contactEmail)}</p>
    ${management ? `<p class="meta"><strong>Management:</strong> ${escapeHtml(management)}</p>` : ""}
    ${website ? `<p class="meta"><strong>Web:</strong> ${websiteHref ? `<a href="${escapeHtml(websiteHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(website)}</a>` : escapeHtml(website)}</p>` : ""}
  </div>
  ${includeFooter ? dossierFooter(now) : ""}`;
}

export function collectTrackLinks(track: Track): Array<{ label: string; href: string }> {
  const links: Array<{ label: string; href: string }> = [];
  const push = (label: string, raw: unknown) => {
    const href = safeHref(raw);
    if (!href) return;
    if (links.some((link) => link.href === href)) return;
    links.push({ label, href });
  };

  push("Spotify", track.spotify_url);

  const youtubeId = safeString(track.youtube_video_id, "");
  if (/^[A-Za-z0-9_-]{5,20}$/.test(youtubeId)) {
    push("YouTube", `https://www.youtube.com/watch?v=${youtubeId}`);
  }

  const itunesId = safeString(track.itunes_track_id, "");
  if (/^\d{5,15}$/.test(itunesId)) {
    push("Apple Music", `https://itunes.apple.com/track/id=${itunesId}`);
  }

  push("Video", track.video_embed_url);

  const external = track.external_links ?? null;
  if (external) {
    const labels: Record<string, string> = {
      spotify: "Spotify",
      apple_music: "Apple Music",
      youtube: "YouTube",
      soundcloud: "SoundCloud",
      bandcamp: "Bandcamp",
      tiktok: "TikTok",
      instagram: "Instagram",
    };
    for (const key of Object.keys(labels)) {
      push(labels[key], external[key]);
    }
  }

  return links;
}

/** Etiqueta de duración ya calculada (`"42:46"`), tal y como la emite `sumDurations`. */
export interface ResolvedDuration {
  seconds: number;
  label: string;
}

/**
 * P15 — los 9 padres del catálogo semilla tienen `duration = "00:00"`, y ese
 * literal se imprimía en los tres formatos de prensa (HTML, PDF y JSON): un
 * álbum de 10 pistas decía durar cero. La columna del padre no se rellena
 * porque un release es la fila agrupadora, no una pista reproducible.
 *
 * La duración real sale de sumar las hijas (`tracks.release_id = padre.id`).
 * Se usa `sumDurations()` del contrato de `lib/null-safe.ts` —que ya sabe
 * distinguir `"—"`, `""`, `null` y `"H:MM:SS"`— en vez de un parser propio.
 *
 * El mapa se construye desde la lista YA filtrada que se está exportando: no se
 * usan duraciones de hijas que el export público decidió no incluir, para no
 * abrir un camino nuevo a filtrar datos de borradores.
 */
export function buildReleaseDurations(
  tracks: readonly Track[]
): Map<string, ResolvedDuration> {
  const childrenByRelease = new Map<string, string[]>();
  for (const track of safeArray<Track>(tracks)) {
    const releaseId = safeString(track.release_id, "");
    if (releaseId === "") continue;
    const bucket = childrenByRelease.get(releaseId);
    if (bucket) bucket.push(track.duration);
    else childrenByRelease.set(releaseId, [track.duration]);
  }

  const durations = new Map<string, ResolvedDuration>();
  for (const [releaseId, values] of childrenByRelease) {
    const total = sumDurations(values);
    if (total) durations.set(releaseId, total);
  }
  return durations;
}

/**
 * Duración a imprimir para una pista, con el orden de preferencia:
 * 1. la columna de la pista, si es una duración real (> 0 segundos);
 * 2. la suma de sus hijas, si la tiene (el caso del padre con `"00:00"`);
 * 3. la columna tal cual, para no inventar un dato que no existe.
 *
 * Una hija con `"00:00"` es un dato real — una pista de duración desconocida— y
 * por eso no se sustituye: solo se reparan los padres, que sí son sumables.
 */
export function resolveCatalogDuration(
  track: Track,
  releaseDurations?: ReadonlyMap<string, ResolvedDuration> | null
): string {
  const declared = safeString(track.duration);
  const parsed = parseDurationToSeconds(declared);
  if (parsed != null && parsed > 0) return declared;

  const total = releaseDurations?.get(safeString(track.id, ""));
  if (total) return total.label;

  return declared;
}

/**
 * Contexto compartido por los tres formatos de prensa. Se construye una vez por
 * render (`catalogBody`, `drawCatalogSection`, `buildCatalogJson`) a partir de
 * la lista ya filtrada, para que HTML, PDF y JSON muestren la MISMA duración y
 * no puedan divergir.
 */
export interface CatalogDurationContext {
  releaseDurations: ReadonlyMap<string, ResolvedDuration>;
}

/**
 * Datos de una pista ya aplanados y formateados, sin HTML. Es la unica fuente
 * de verdad del catalogo: la consumen `catalogTrackHtml` y el generador de PDF
 * (`lib/pdf/sections.ts`), de modo que ambos formatos muestran los mismos campos
 * con los mismos valores.
 */
export interface CatalogTrackFields {
  title: string;
  releaseType: string;
  releaseDate: string;
  duration: string;
  streams: string;
  saves: string;
  playlists: string;
  daw: string;
  key: string;
  genre: string;
  bpm: number | null;
  topCountries: string;
  links: Array<{ label: string; href: string }>;
  lyrics: string;
  hasStems: boolean;
  galleryCount: number;
}

export function catalogTrackFields(
  track: Track,
  context?: CatalogDurationContext | null
): CatalogTrackFields {
  const production = track.production_details;
  return {
    title: safeString(track.title),
    releaseType: safeString(track.release_type),
    releaseDate: safeString(track.release_date),
    duration: resolveCatalogDuration(track, context?.releaseDurations),
    streams: formatCount(safeNumber(track.metrics?.streams)),
    saves: formatCount(safeNumber(track.metrics?.saves)),
    playlists: formatCount(safeNumber(track.metrics?.playlist_additions)),
    daw: safeString(production?.daw, ""),
    key: safeString(production?.key, ""),
    genre: safeString(production?.genre, ""),
    bpm: production?.bpm != null ? safeNumber(production.bpm) : null,
    topCountries: safeArray<TopCountry>(track.metrics?.top_countries)
      .filter((entry) => safeString(entry.country, "") !== "")
      .map((entry) => `${safeString(entry.country, "")} ${safeNumber(entry.pct)}%`)
      .join(", "),
    links: collectTrackLinks(track),
    lyrics: safeString(track.lyrics, ""),
    hasStems: Boolean(track.stems_urls),
    galleryCount: safeArray(track.gallery_images).length,
  };
}

function catalogTrackHtml(track: Track, context?: CatalogDurationContext | null): string {
  const data = catalogTrackFields(track, context);
  const duration = escapeHtml(data.duration);
  const links = data.links;

  return `
  <div class="track">
    <span class="badge">${escapeHtml(data.releaseType)}</span>
    <h2>${escapeHtml(data.title)}</h2>
    <div class="stats">
      <div class="stat"><div class="stat-value">${data.streams}</div><div class="stat-label">Streams</div></div>
      <div class="stat"><div class="stat-value">${data.saves}</div><div class="stat-label">Saves</div></div>
      <div class="stat"><div class="stat-value">${data.playlists}</div><div class="stat-label">Playlists</div></div>
      <div class="stat"><div class="stat-value">${duration}</div><div class="stat-label">Duración</div></div>
    </div>
    <p class="meta"><strong>Lanzamiento:</strong> ${escapeHtml(data.releaseDate)}</p>
    ${data.daw ? `<p class="meta"><strong>DAW:</strong> ${escapeHtml(data.daw)}</p>` : ""}
    ${data.key ? `<p class="meta"><strong>Tonalidad:</strong> ${escapeHtml(data.key)}</p>` : ""}
    ${data.genre ? `<p class="meta"><strong>Género:</strong> ${escapeHtml(data.genre)}</p>` : ""}
    ${data.bpm != null ? `<p class="meta"><strong>BPM:</strong> ${data.bpm}</p>` : ""}
    ${data.topCountries ? `<p class="meta"><strong>Top países:</strong> ${escapeHtml(data.topCountries)}</p>` : ""}
    ${
      links.length > 0
        ? `<p class="meta"><strong>Enlaces:</strong> <span class="links">${links
            .map(
              (link) =>
                `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`
            )
            .join("")}</span></p>`
        : ""
    }
    ${data.lyrics ? `<p class="meta"><strong>Letra:</strong></p><pre class="lyrics">${escapeHtml(data.lyrics)}</pre>` : ""}
    ${data.hasStems ? `<p class="meta">✅ Stems multicanal disponibles</p>` : ""}
    ${data.galleryCount > 0 ? `<p class="meta"><strong>Galería:</strong> ${data.galleryCount} ${data.galleryCount === 1 ? "imagen" : "imágenes"}</p>` : ""}
  </div>`;
}

function catalogBody(payload: ExportPayload, headingHtml = "🎵 PressPlay — Dossier de Prensa"): string {
  const now = payload.generatedAt ?? new Date();
  const tracks = safeArray<Track>(payload.tracks);
  const context: CatalogDurationContext = { releaseDurations: buildReleaseDurations(tracks) };

  return `
  <h1>${headingHtml}</h1>
  <p class="meta">Generado el ${escapeHtml(formatDateLong(now))}</p>
  ${payload.artistId ? `<p class="meta"><strong>Artista:</strong> ${escapeHtml(safeString(payload.artistName))}</p>` : ""}
  <p class="meta">Total de tracks en catálogo: <strong>${tracks.length}</strong></p>

  ${tracks.map((track) => catalogTrackHtml(track, context)).join("\n")}`;
}

function trackToJson(
  track: Track,
  context?: CatalogDurationContext | null
): Record<string, unknown> {
  const production = track.production_details;
  return {
    id: safeString(track.id),
    title: safeString(track.title),
    artist_name: safeString(track.artist_name),
    // GAP-A: sin `release_id` el export legible por máquina no decía a qué
    // álbum pertenecía una pista. `disc_number`/`track_number` cierran el mismo
    // hueco: permiten reconstruir el tracklist de un multidisco. Los tres se
    // emiten tal cual, `null` cuando no hay dato, para no mentir con un 0.
    release_id: track.release_id ?? null,
    disc_number: track.disc_number ?? null,
    track_number: track.track_number ?? null,
    release_type: safeString(track.release_type),
    release_date: safeString(track.release_date),
    duration: resolveCatalogDuration(track, context?.releaseDurations),
    cover_image: safeString(track.cover_image, ""),
    audio_preview_url: safeString(track.audio_preview_url, ""),
    metrics: {
      streams: safeNumber(track.metrics?.streams),
      saves: safeNumber(track.metrics?.saves),
      playlist_additions: safeNumber(track.metrics?.playlist_additions),
      top_countries: safeArray<TopCountry>(track.metrics?.top_countries),
    },
    production_details: production ?? null,
    lyrics: track.lyrics ?? null,
    genre: production?.genre ?? null,
    spotify_url: track.spotify_url ?? null,
    youtube_video_id: track.youtube_video_id ?? null,
    itunes_track_id: track.itunes_track_id ?? null,
    video_embed_url: track.video_embed_url ?? null,
    external_links: track.external_links ?? null,
    isrc: track.isrc ?? null,
    composers: track.composers ?? null,
    stems_available: Boolean(track.stems_urls),
    gallery_images_count: safeArray(track.gallery_images).length,
  };
}

export function filterPublicTracks(tracks: Track[]): Track[] {
  return safeArray<Track>(tracks).filter((track) => {
    const status = safeString(track.status, "").trim().toLowerCase();
    return status === "approved" || status === "published";
  });
}

export function resolveDefaultSections(format: ExportFormat): ExportSection[] {
  return [...DEFAULT_SECTIONS[format]];
}

export function sanitizeFilename(filename: string): string {
  const cleaned = safeString(filename, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[.\s]+/, "")
    .replace(/_+$/, "")
    .slice(0, 120);
  return cleaned || "export";
}

export function buildDossierJson(payload: ExportPayload): string {
  const now = payload.generatedAt ?? new Date();
  const data = dossierRecord(payload);

  const document = {
    exported_at: now.toISOString(),
    version: EXPORT_VERSION,
    artist: {
      id: payload.artistId || null,
      name: safeString(payload.artistName),
      genre: dossierText(data, "genre", safeString(payload.genre, "")),
      location: dossierText(data, "location", safeString(payload.location, "")),
    },
    dossier: {
      biography: dossierText(
        data,
        "biography",
        `${safeString(payload.artistName)} es un artista multidisciplinario con trayectoria en produccion musical, composicion y performance en vivo.`
      ),
      press_text: dossierText(data, "press_text"),
      influences: dossierText(data, "influences"),
      contact_email: dossierText(data, "contact_email", dossierText(data, "booking_email", "booking@epk-dashboard.com")),
      booking_email: dossierText(data, "booking_email"),
      management: dossierText(data, "management", "PressPlay Records"),
      website: dossierText(data, "website"),
      updated_at: dossierText(data, "updated_at"),
    },
  };

  return JSON.stringify(document, null, 2);
}

export function buildRiderJson(payload: ExportPayload): string {
  const now = payload.generatedAt ?? new Date();
  const data = dossierRecord(payload);

  const document = {
    exported_at: now.toISOString(),
    version: EXPORT_VERSION,
    artist: {
      id: payload.artistId || null,
      name: safeString(payload.artistName),
    },
    rider: {
      pa_system: riderValue(data, "rider_pa_system"),
      monitors: riderValue(data, "rider_monitors"),
      console: riderValue(data, "rider_console"),
      subwoofers: riderValue(data, "rider_subwoofers"),
      guitar: riderValue(data, "rider_guitar"),
      bass: riderValue(data, "rider_bass"),
      drums: riderValue(data, "rider_drums"),
      keyboards: riderValue(data, "rider_keyboards"),
      lighting: riderValue(data, "rider_lighting"),
      stage_size: riderValue(data, "rider_stage_size"),
      stage_conditions: riderValue(data, "rider_stage_conditions"),
      hospitality: riderValue(data, "rider_hospitality"),
      transport: riderValue(data, "rider_transport"),
      special_notes: dossierText(data, "rider_special_notes"),
    },
  };

  return JSON.stringify(document, null, 2);
}

export function buildCatalogJson(payload: ExportPayload): string {
  const now = payload.generatedAt ?? new Date();
  const tracks = safeArray<Track>(payload.tracks);
  const context: CatalogDurationContext = { releaseDurations: buildReleaseDurations(tracks) };

  const document: Record<string, unknown> = {
    exported_at: now.toISOString(),
    version: EXPORT_VERSION,
  };
  if (payload.artistId) {
    document.artist = {
      id: payload.artistId,
      name: safeString(payload.artistName),
      genre: safeString(payload.genre, ""),
      location: safeString(payload.location, ""),
    };
  }
  document.catalog = {
    total_tracks: tracks.length,
    tracks: tracks.map((track) => trackToJson(track, context)),
  };

  return JSON.stringify(document, null, 2);
}

export function buildBundleJson(payload: ExportPayload, sections: readonly ExportSection[]): string {
  const now = payload.generatedAt ?? new Date();
  const merged: Record<string, unknown> = {};

  for (const section of EXPORT_SECTIONS) {
    if (!sections.includes(section)) continue;
    const raw =
      section === "dossier"
        ? buildDossierJson(payload)
        : section === "rider"
          ? buildRiderJson(payload)
          : buildCatalogJson(payload);
    const document = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(document)) {
      if (key === "exported_at" || key === "version") continue;
      merged[key] = value;
    }
  }

  return JSON.stringify({ exported_at: now.toISOString(), version: EXPORT_VERSION, ...merged }, null, 2);
}

export function buildRiderHtml(payload: ExportPayload): string {
  return htmlDocument(
    `Rider Tecnico - ${escapeHtml(safeString(payload.artistName))}`,
    RIDER_STYLES,
    riderBody(payload, true)
  );
}

export function buildDossierHtml(payload: ExportPayload): string {
  return htmlDocument(
    `PressPlay &mdash; Dossier de Prensa`,
    DOSSIER_STYLES,
    dossierBody(payload, true)
  );
}

/**
 * Catálogo standalone. El título y el encabezado son propios del catálogo: antes
 * ambos decían "EPK Dossier de Prensa", que es el título de la otra sección y
 * confundía al abrir el archivo.
 */
export function buildCatalogHtml(payload: ExportPayload): string {
  return htmlDocument(
    `PressPlay &mdash; Catálogo`,
    CATALOG_STYLES,
    catalogBody(payload, "🎵 PressPlay — Catálogo")
  );
}

export function buildBundleHtml(payload: ExportPayload, sections: readonly ExportSection[]): string {
  const now = payload.generatedAt ?? new Date();
  const parts: string[] = [];

  for (const section of EXPORT_SECTIONS) {
    if (!sections.includes(section)) continue;
    if (section === "dossier") parts.push(dossierBody(payload, false));
    if (section === "rider") parts.push(`<div id="rider-section">\n${riderBody(payload, false)}\n</div>`);
    if (section === "catalog") parts.push(catalogBody(payload));
  }
  parts.push(dossierFooter(now));

  const styles = `${DOSSIER_STYLES}\n${CATALOG_STYLES}\n${RIDER_STYLES_SCOPED}`;
  return htmlDocument(`PressPlay &mdash; Dossier de Prensa`, styles, parts.join("\n"));
}

/**
 * Genera HTML para el Rider Tecnico descargable.
 * Si se proveen datos de dossier, los usa; si no, usa defaults.
 */
export function generateRiderHTML(artistName: string, dossierData?: DossierSource): string {
  return buildRiderHtml({ artistName, dossier: dossierData, generatedAt: new Date() });
}

/**
 * Genera HTML para el Dossier de Prensa descargable.
 * Si se proveen datos de dossier, los usa; si no, usa defaults.
 */
export function generateDossierHTML(artistName: string, dossierData?: DossierSource): string {
  return buildDossierHtml({ artistName, dossier: dossierData, generatedAt: new Date() });
}
