import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toggleLike, getLikeCount, hasUserLikedTrack, getUserLikes } from "@/lib/db";

const ToggleLikeSchema = z.object({
  track_id: z.string().min(1, "track_id requerido"),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const trackId = searchParams.get("track_id");
    const userId = searchParams.get("user_id");

    if (trackId && userId) {
      const [count, liked] = await Promise.all([
        getLikeCount(trackId),
        hasUserLikedTrack(userId, trackId),
      ]);
      return NextResponse.json({ track_id: trackId, count, liked });
    }

    if (trackId) {
      const count = getLikeCount(trackId);
      return NextResponse.json({ track_id: trackId, count });
    }

    if (userId) {
      const likes = getUserLikes(userId);
      return NextResponse.json(likes);
    }

    return NextResponse.json({ error: "track_id o user_id requerido" }, { status: 400 });
  } catch (error) {
    console.error("GET likes error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = ToggleLikeSchema.parse(body);

    // Get user from auth header (simplified - in real app use auth context)
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }

    const result = toggleLike(userId, validated.track_id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST likes error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}