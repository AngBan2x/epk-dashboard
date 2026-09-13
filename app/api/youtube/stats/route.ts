import { NextRequest, NextResponse } from "next/server";
import { getVideoStats } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  try {
    const stats = await getVideoStats(videoId);
    if (!stats) {
      return NextResponse.json({ error: "Video not found or API key missing" }, { status: 404 });
    }
    return NextResponse.json(stats);
  } catch (error) {
    console.error("YouTube stats error:", error);
    return NextResponse.json({ error: "YouTube API error" }, { status: 500 });
  }
}
