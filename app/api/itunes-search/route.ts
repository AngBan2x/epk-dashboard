import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const SearchSchema = z.object({
  term: z.string().min(1, "Término de búsqueda requerido"),
  media: z.enum(["music", "podcast", "musicVideo", "audiobook", "shortFilm", "tvShow", "software", "ebook", "all"]).optional().default("music"),
  entity: z.enum(["album", "artist", "mix", "song", "musicVideo", "all"]).optional().default("song"),
  attribute: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional().default(20),
  country: z.string().length(2).optional().default("US"),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const validated = SearchSchema.parse(Object.fromEntries(searchParams));

    const itunesUrl = new URL("https://itunes.apple.com/search");
    itunesUrl.searchParams.set("term", validated.term);
    itunesUrl.searchParams.set("media", validated.media);
    itunesUrl.searchParams.set("entity", validated.entity);
    if (validated.attribute) itunesUrl.searchParams.set("attribute", validated.attribute);
    itunesUrl.searchParams.set("limit", String(validated.limit));
    itunesUrl.searchParams.set("country", validated.country);

    const response = await fetch(itunesUrl.toString(), {
      headers: {
        "Accept": "application/json",
      },
      // Cache for 1 hour
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Error consultando iTunes API" }, { status: 502 });
    }

    const data = await response.json();

    // Transform results for easier frontend use
    const results = (data.results || []).map((item: Record<string, unknown>) => ({
      trackId: item.trackId,
      trackName: item.trackName,
      artistName: item.artistName,
      artistId: item.artistId,
      collectionName: item.collectionName,
      collectionId: item.collectionId,
      artworkUrl100: item.artworkUrl100,
      artworkUrl600: typeof item.artworkUrl100 === "string" ? item.artworkUrl100.replace("100x100", "600x600") : "",
      previewUrl: item.previewUrl,
      trackTimeMillis: item.trackTimeMillis,
      primaryGenreName: item.primaryGenreName,
      releaseDate: item.releaseDate,
      trackNumber: item.trackNumber,
      discNumber: item.discNumber,
      trackPrice: item.trackPrice,
      collectionPrice: item.collectionPrice,
      currency: item.currency,
      country: item.country,
    }));

    return NextResponse.json({
      resultCount: data.resultCount,
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("iTunes search error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}