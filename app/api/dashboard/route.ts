import { NextRequest, NextResponse } from "next/server";
import {
  getAllTracks,
  getAllArtists,
  getArtistByUserId,
  getShowsByArtists,
  getTotalLikesForTracks,
  getSubscriberCount,
} from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import type { ArtistProfile, Show } from "@/types/music";

export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate",
  "Surrogate-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
};

function stripUserId(artists: ArtistProfile[]): Omit<ArtistProfile, "user_id">[] {
  return artists.map(({ user_id: _user_id, ...rest }) => rest);
}

export async function GET(req: NextRequest) {
  try {
    const session = await validateRequest(req);
    const isAdmin = session?.role === "admin";

    const [artistProfile, allTracks, allArtists] = await Promise.all([
      session?.userId ? getArtistByUserId(session.userId) : Promise.resolve(null),
      getAllTracks(),
      getAllArtists(),
    ]);

    const standaloneTracks = allTracks.filter((t) => !t.release_id);
    const tracks = isAdmin
      ? standaloneTracks
      : standaloneTracks.filter(
          (t) => t.status === "approved" || (!!artistProfile && t.artist_name === artistProfile.name)
        );

    const artists = isAdmin ? allArtists : stripUserId(allArtists);

    const showsByArtist: Record<string, Show[]> = {};
    if (artists.length > 0) {
      const allShows = await getShowsByArtists(artists.map((a) => a.id));
      for (const art of artists) {
        showsByArtist[art.id] = allShows.filter((s) => s.artist_id === art.id);
      }
    }

    if (!session) {
      return NextResponse.json(
        {
          tracks,
          artists,
          artistProfile: null,
          artistShows: [],
          showsByArtist,
          likes: 0,
          subscribers: 0,
        },
        { headers: noStore }
      );
    }

    const targetTracks = artistProfile
      ? tracks.filter((t) => t.artist_name === artistProfile.name)
      : tracks;

    const [totalLikes, subscribers] = await Promise.all([
      getTotalLikesForTracks(targetTracks.map((t) => t.id)),
      artistProfile ? getSubscriberCount(artistProfile.id) : Promise.resolve(0),
    ]);

    const artistShows: Show[] = artistProfile ? showsByArtist[artistProfile.id] ?? [] : [];

    return NextResponse.json(
      { tracks, artists, artistProfile, artistShows, showsByArtist, likes: totalLikes, subscribers },
      { headers: noStore }
    );
  } catch (error) {
    console.error("GET dashboard error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
