import { NextRequest, NextResponse } from "next/server";
import { getAllTracks, getAllArtists, getArtistByUserId, getShowsByArtists, getLikeCount, getSubscriberCount } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import type { Show } from "@/types/music";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await validateRequest(req);

    const allTracks = await getAllTracks();
    const tracks = allTracks.filter(t => !t.release_id);
    const artists = await getAllArtists();

    const showsByArtist: Record<string, Show[]> = {};
    if (artists.length > 0) {
      const allShows = await getShowsByArtists(artists.map(a => a.id));
      for (const art of artists) {
        showsByArtist[art.id] = allShows.filter(s => s.artist_id === art.id);
      }
    }

    if (!session) {
      return NextResponse.json({ tracks, artists, artistProfile: null, artistShows: [], showsByArtist, likes: 0, subscribers: 0 }, {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          "Surrogate-Control": "no-store",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    }

    let artistProfile = null;
    let artistShows: Show[] = [];
    let totalLikes = 0;
    let subscribers = 0;
    if (session.userId) {
      const profile = await getArtistByUserId(session.userId);
      if (profile) {
        artistProfile = profile;
        artistShows = (showsByArtist[profile.id] ?? []);
        subscribers = await getSubscriberCount(profile.id);
        // Count likes for artist's tracks
        const artistTracks = tracks.filter(t => t.artist_name === profile.name);
        for (const track of artistTracks) {
          totalLikes += await getLikeCount(track.id);
        }
      } else {
        // Admin: count all likes
        for (const track of tracks) {
          totalLikes += await getLikeCount(track.id);
        }
      }
    }

    return NextResponse.json({ tracks, artists, artistProfile, artistShows, showsByArtist, likes: totalLikes, subscribers }, {
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
