import { NextRequest, NextResponse } from "next/server";
import { getAllTracks, getAllArtists, getArtistByUserId, getShowsByArtists } from "@/lib/db";
import type { Show } from "@/types/music";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    const allTracks = await getAllTracks();
    const tracks = allTracks.filter(t => !t.release_id);
    const artists = await getAllArtists();

    let artistProfile = null;
    let allShows: Show[] = [];

    if (artists.length > 0) {
      allShows = await getShowsByArtists(artists.map(a => a.id));
    }

    let artistShows: Show[] = [];
    if (userId) {
      const profile = await getArtistByUserId(userId);
      if (profile) {
        artistProfile = profile;
        artistShows = allShows.filter(s => s.artist_id === profile.id);
      }
    }

    const showsByArtist: Record<string, Show[]> = {};
    for (const art of artists) {
      showsByArtist[art.id] = allShows.filter(s => s.artist_id === art.id);
    }

    return NextResponse.json({ tracks, artists, artistProfile, artistShows, showsByArtist }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Surrogate-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("GET dashboard error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
