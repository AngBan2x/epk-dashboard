import { NextRequest, NextResponse } from "next/server";
import {
  getArtistInfo,
  getTrackInfo,
  getTopTracks,
  getTopAlbums,
} from "@/lib/lastfm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist");
  const track = searchParams.get("track");
  const method = searchParams.get("method") || "artist";

  if (!artist) {
    return NextResponse.json({ error: "artist requerido" }, { status: 400 });
  }

  try {
    const result: Record<string, unknown> = {};

    if (method === "artist" || method === "top-tracks" || method === "top-albums") {
      result.artist = await getArtistInfo(artist);
    }

    if (method === "track" && track) {
      result.track = await getTrackInfo(artist, track);
    } else {
      result.track = null;
    }

    if (method === "artist" || method === "top-tracks") {
      result.topTracks = await getTopTracks(artist, 5);
    }

    if (method === "artist" || method === "top-albums") {
      result.topAlbums = await getTopAlbums(artist, 5);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Last.fm API error:", error);
    return NextResponse.json(
      { artist: null, track: null, topTracks: [], topAlbums: [] },
    );
  }
}
