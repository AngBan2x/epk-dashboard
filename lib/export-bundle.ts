import { getAllTracks, getTracksByArtist, getArtistById, getDossierByArtistId, type DossierData } from "@/lib/db";
import {
  EXPORT_SECTIONS,
  buildBundleHtml,
  buildBundleJson,
  buildCatalogHtml,
  buildDossierHtml,
  buildRiderHtml,
  filterPublicTracks,
  resolveDefaultSections,
  sanitizeFilename,
  type ExportFormat,
  type ExportPayload,
  type ExportSection,
} from "@/lib/downloadable-assets";
import { safeString } from "@/lib/null-safe";
import type { Track } from "@/types/music";

export interface ExportBundleOptions {
  format: ExportFormat;
  artistId?: string | null;
  include?: ExportSection[] | null;
}

export interface ExportBundle {
  filename: string;
  contentType: string;
  body: string;
}

export class ExportError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ExportError";
    this.status = status;
  }
}

const SECTIONS_REQUIRING_ARTIST: ExportSection[] = ["dossier", "rider"];

function normalizeSections(include: ExportSection[] | null | undefined, format: ExportFormat): ExportSection[] {
  const requested = include && include.length > 0 ? include : resolveDefaultSections(format);
  return EXPORT_SECTIONS.filter((section) => requested.includes(section));
}

function artistSlug(artistName: string): string {
  const cleaned = safeString(artistName, "").replace(/[^a-zA-Z0-9]/g, "");
  return cleaned || "PressPlay";
}

function exportFilename(
  sections: ExportSection[],
  artistId: string | null,
  slug: string,
  date: string,
  extension: string
): string {
  if (sections.length === 1) {
    const section = sections[0];
    if (section === "catalog") {
      // El catálogo público (sin artist_id) también se llama "Catalogo": antes
      // heredaba el nombre del dossier, `EPK_Dossier_<fecha>.<ext>`, porque solo
      // lo usaba el botón JSON y nadie miraba el nombre.
      return artistId
        ? `PressPlay_Catalogo_${slug}_${date}.${extension}`
        : `PressPlay_Catalogo_${date}.${extension}`;
    }
    if (section === "rider") return `PressPlay_Rider_Tecnico_${slug}.${extension}`;
    return `PressPlay_Dossier_${slug}.${extension}`;
  }
  return `PressPlay_Export_${slug}_${date}.${extension}`;
}

function singleSectionHtml(section: ExportSection, payload: ExportPayload): string {
  if (section === "dossier") return buildDossierHtml(payload);
  if (section === "rider") return buildRiderHtml(payload);
  return buildCatalogHtml(payload);
}

export async function buildExportBundle(options: ExportBundleOptions): Promise<ExportBundle> {
  const format: ExportFormat = options.format === "html" ? "html" : "json";
  const sections = normalizeSections(options.include, format);
  const artistId = options.artistId?.trim() || null;

  if (!artistId && sections.some((section) => SECTIONS_REQUIRING_ARTIST.includes(section))) {
    throw new ExportError(400, "Las secciones dossier y rider requieren artist_id");
  }

  let artistName = "PressPlay";
  let genre: string | null = null;
  let location: string | null = null;
  let tracks: Track[] = [];
  let dossier: DossierData | null = null;

  if (artistId) {
    const artist = await getArtistById(artistId);
    if (!artist) throw new ExportError(404, "Artista no encontrado");
    artistName = safeString(artist.name, "PressPlay");
    genre = artist.genre ?? null;
    location = artist.location ?? null;
    dossier = await getDossierByArtistId(artistId);
    tracks = await getTracksByArtist(artistId);
  } else {
    tracks = await getAllTracks();
  }

  const now = new Date();
  const payload: ExportPayload = {
    artistName,
    artistId,
    genre: dossier?.genre ?? genre,
    location: dossier?.location ?? location,
    tracks: filterPublicTracks(tracks),
    dossier,
    generatedAt: now,
  };

  const date = now.toISOString().slice(0, 10);
  const slug = artistSlug(artistName);
  const filename = exportFilename(sections, artistId, slug, date, format);

  if (format === "json") {
    return {
      filename: sanitizeFilename(filename),
      contentType: "application/json; charset=utf-8",
      body: buildBundleJson(payload, sections),
    };
  }

  return {
    filename: sanitizeFilename(filename),
    contentType: "text/html; charset=utf-8",
    body: sections.length === 1 ? singleSectionHtml(sections[0], payload) : buildBundleHtml(payload, sections),
  };
}
