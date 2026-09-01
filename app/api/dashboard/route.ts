import { NextRequest, NextResponse } from "next/server";
import { getAllTracks, getAllArtists, getArtistByUserId, getShowsByArtist } from "@/lib/db";
import type { Show } from "@/types/music";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    const tracks = await getAllTracks();
    const artists = await getAllArtists();

    let artistProfile = null;
    let artistShows: Show[] = [];

    if (userId) {
      artistProfile = await getArtistByUserId(userId);
      if (artistProfile) {
        artistShows = await getShowsByArtist(artistProfile.id);
      }
    }

    const showsByArtist: Record<string, Show[]> = {};
    for (const art of artists) {
      showsByArtist[art.id] = await getShowsByArtist(art.id);
    }

    return NextResponse.json({ tracks, artists, artistProfile, artistShows, showsByArtist });
  } catch (error) {
    console.error("GET dashboard error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
