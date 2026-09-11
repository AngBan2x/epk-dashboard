import { NextRequest, NextResponse } from "next/server";
import { getTrackById, incrementTrackStreams } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/tracks/[id]/streams — Increment stream count for a track (public, debounced client-side)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Track id is required" }, { status: 400 });
    }

    // Validate track exists
    const track = await getTrackById(id);
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    // Increment stream count
    const updatedStreams = await incrementTrackStreams(id);

    return NextResponse.json(
      { streams: updatedStreams },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("[API/tracks/[id]/streams] Error:", error);
    return NextResponse.json(
      { error: "Error incrementing stream count" },
      { status: 500 }
    );
  }
}
