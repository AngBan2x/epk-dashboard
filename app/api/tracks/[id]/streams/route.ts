import { NextRequest, NextResponse } from "next/server";
import { getTrackById, incrementTrackStreams, getMetricsHistoryByTrack } from "@/lib/db";

// GET /api/tracks/:id/streams — Return stream data for a track
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const track = await getTrackById(id);
    if (!track) {
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    const metricsHistory = await getMetricsHistoryByTrack(id);

    return NextResponse.json({
      track_id: id,
      streams: track.streams,
      metrics_history: metricsHistory,
    });
  } catch (error) {
    console.error("[API/tracks/[id]/streams] Error GET:", error);
    return NextResponse.json({ error: "Error al obtener streams" }, { status: 500 });
  }
}

// POST /api/tracks/:id/streams — Increment stream count (play event)
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const track = await getTrackById(id);
    if (!track) {
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    const newCount = await incrementTrackStreams(id);

    return NextResponse.json({ track_id: id, streams: newCount });
  } catch (error) {
    console.error("[API/tracks/[id]/streams] Error POST:", error);
    return NextResponse.json({ error: "Error al incrementar streams" }, { status: 500 });
  }
}
