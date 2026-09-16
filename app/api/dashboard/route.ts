import { NextRequest, NextResponse } from "next/server";
import { getAllTracks, getAllArtists, getArtistByUserId, getShowsByArtist } from "@/lib/db";
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

    const testTracks = tracks.filter(t => t.title.toLowerCase().includes("test"));
    return NextResponse.json({ tracks, artists, artistProfile, artistShows, showsByArtist, _debug: { total: tracks.length, testCount: testTracks.length, testTitles: testTracks.map(t => t.title) } }, {
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
