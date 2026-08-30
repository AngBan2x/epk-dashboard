import { safeString, safeArray } from "./null-safe";

export interface ITunesTrackResult {
  trackId: number;
  artistName: string;
  trackName: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackTimeMillis?: number;
}

export interface ITunesSearchResponse {
  resultCount: number;
  results: ITunesTrackResult[];
}

const ITUNES_SEARCH_API = "https://itunes.apple.com/search";

// Cache en memoria para evitar llamadas redundantes a la API
const itunesCache = new Map<string, ITunesTrackResult[]>();

/**
 * Transforma la URL de portada estándar de iTunes (100x100) a Ultra HD (600x600 o más)
 */
export function getHighResArtwork(url: string | null | undefined, size = 600): string | null {
  if (!url || typeof url !== "string") return null;
  // Reemplaza dimensiones del patrón /100x100bb.jpg o /100x100bb.png
  return url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
}

/**
 * Busca canciones o artistas en la API de iTunes
 */
export async function searchITunes(
  term: string,
  limit = 5,
  entity: "song" | "musicArtist" | "album" = "song"
): Promise<ITunesTrackResult[]> {
  const cleanTerm = term.trim();
  if (!cleanTerm) return [];

  const cacheKey = `${cleanTerm}:${entity}:${limit}`;
  if (itunesCache.has(cacheKey)) {
    return itunesCache.get(cacheKey)!;
  }

  try {
    const url = new URL(ITUNES_SEARCH_API);
    url.searchParams.set("term", cleanTerm);
    url.searchParams.set("entity", entity);
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("media", "music");

    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 }, // Revalidación por 1 hora en Next.js
    });

    if (!res.ok) {
      console.warn(`[iTunes API] Error status ${res.status} para término "${cleanTerm}"`);
      return [];
    }

    const data: ITunesSearchResponse = await res.json();
    const rawResults = safeArray<ITunesTrackResult>(data?.results);

    const formattedResults: ITunesTrackResult[] = rawResults.map((item) => ({
      trackId: item.trackId,
      artistName: safeString(item.artistName),
      trackName: safeString(item.trackName),
      collectionName: item.collectionName,
      previewUrl: item.previewUrl,
      artworkUrl100: item.artworkUrl100,
      artworkUrl600: getHighResArtwork(item.artworkUrl100, 600) ?? undefined,
      releaseDate: item.releaseDate,
      primaryGenreName: item.primaryGenreName,
      trackTimeMillis: item.trackTimeMillis,
    }));

    itunesCache.set(cacheKey, formattedResults);
    return formattedResults;
  } catch (error) {
    console.error("[iTunes API] Fallo al consultar servicio externo:", error);
    return [];
  }
}

/**
 * Obtiene la previsualización de audio y arte en alta definición de un track específico
 */
export async function getTrackMedia(
  artist: string,
  trackTitle: string
): Promise<{ previewUrl: string | null; highResCover: string | null }> {
  const query = `${artist} ${trackTitle}`;
  const results = await searchITunes(query, 1, "song");

  if (results.length === 0) {
    return { previewUrl: null, highResCover: null };
  }

  const track = results[0];
  return {
    previewUrl: track.previewUrl ?? null,
    highResCover: track.artworkUrl600 ?? track.artworkUrl100 ?? null,
  };
}
