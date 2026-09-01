import { NextRequest, NextResponse } from "next/server";
import { getAllTracks, getAllArtists, getArtistByUserId, getShowsByArtist } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    const tracks = getAllTracks();
    const artists = getAllArtists();

    let artistProfile = null;
    let artistShows: ReturnType<typeof getShowsByArtist> = [];

    if (userId) {
      artistProfile = getArtistByUserId(userId);
      if (artistProfile) {
        artistShows = getShowsByArtist(artistProfile.id);
      }
    }

    const showsByArtist: Record<string, ReturnType<typeof getShowsByArtist>> = {};
    for (const art of artists) {
      showsByArtist[art.id] = getShowsByArtist(art.id);
    }

    return NextResponse.json({ tracks, artists, artistProfile, artistShows, showsByArtist });
  } catch (error) {
    console.error("GET dashboard error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
