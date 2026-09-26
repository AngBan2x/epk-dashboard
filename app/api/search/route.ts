import { NextRequest, NextResponse } from "next/server";
import { searchArtists, searchReleases, searchShows } from "@/lib/db";
import {
  MIN_QUERY_LENGTH,
  normalizeQuery,
  parseOrderParam,
  parseScopeParam,
  parseSortParam,
  type SearchResponse,
  type SearchResults,
} from "@/lib/search";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

const EMPTY_RESULTS: SearchResults = { artists: [], releases: [], shows: [] };

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawQuery = (searchParams.get("q") ?? "").trim();
    const query = normalizeQuery(rawQuery);

    if (query.length < MIN_QUERY_LENGTH) {
      return NextResponse.json(
        {
          error: `La búsqueda debe tener al menos ${MIN_QUERY_LENGTH} caracteres`,
          query: rawQuery,
          scope: parseScopeParam(null),
          sort: parseSortParam(null),
          order: parseOrderParam(null),
          results: EMPTY_RESULTS,
          total: 0,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const scope = parseScopeParam(searchParams.get("scope"));
    const sort = parseSortParam(searchParams.get("sort"));
    const order = parseOrderParam(searchParams.get("order"));
    const state = { sort, order };

    const [artists, releases, shows] = await Promise.all([
      scope.includes("artist") ? searchArtists(query, state) : Promise.resolve([]),
      scope.includes("release") ? searchReleases(query, state) : Promise.resolve([]),
      scope.includes("show") ? searchShows(query, state) : Promise.resolve([]),
    ]);

    const results: SearchResults = {
      artists: artists.map((artist) => ({
        id: artist.id,
        title: artist.name,
        subtitle: [artist.genre, artist.location].filter(Boolean).join(" · ") || null,
        image: artist.image || null,
        url: `/artists/${artist.id}`,
      })),
      releases: releases.map((release) => ({
        id: release.id,
        title: release.title,
        subtitle: [release.artist_name, release.release_type].filter(Boolean).join(" · ") || null,
        image: release.image || null,
        url: `/releases/${release.id}`,
      })),
      shows: shows.map((show) => ({
        id: show.id,
        title: show.venue_name,
        subtitle: [show.city, show.country, show.date].filter(Boolean).join(" · ") || null,
        image: show.image || null,
        url: `/shows?venue=${encodeURIComponent(show.venue_name)}`,
      })),
    };

    const response: SearchResponse = {
      query: rawQuery,
      scope,
      sort,
      order,
      results,
      total: artists.length + releases.length + shows.length,
    };

    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("GET search error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
