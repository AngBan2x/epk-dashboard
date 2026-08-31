import { NextRequest, NextResponse } from "next/server";
import { getMetricsHistoryByTrack } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const trackId = searchParams.get("track_id");
    const limit = parseInt(searchParams.get("limit") || "30", 10);

    if (!trackId) {
      return NextResponse.json({ error: "track_id requerido" }, { status: 400 });
    }

    const history = getMetricsHistoryByTrack(trackId);
    return NextResponse.json(history.slice(0, limit));
  } catch (error) {
    console.error("GET metrics history error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}