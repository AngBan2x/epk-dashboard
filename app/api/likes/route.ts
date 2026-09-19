import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toggleLike, getLikeCount, hasUserLikedTrack, getUserLikes } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

const ToggleLikeSchema = z.object({
  track_id: z.string().min(1, "track_id requerido"),
});

async function getUserIdFromSession(req: NextRequest) {
  const session = await validateRequest(req);
  return session?.userId ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const trackId = searchParams.get("track_id");
    const userId = searchParams.get("user_id") || (await getUserIdFromSession(req));

    if (!trackId && !userId) {
      return NextResponse.json({ error: "Autenticación requerida" }, { status: 401 });
    }

    if (trackId && userId) {
      const [count, liked] = await Promise.all([
        getLikeCount(trackId),
        hasUserLikedTrack(userId, trackId),
      ]);
      return NextResponse.json({ track_id: trackId, count, liked });
    }

    if (trackId) {
      const count = await getLikeCount(trackId);
      return NextResponse.json({ track_id: trackId, count });
    }

    const likes = await getUserLikes(userId!);
    return NextResponse.json(likes);
  } catch (error) {
    console.error("GET likes error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = ToggleLikeSchema.parse(body);

    const userId = await getUserIdFromSession(req);
    if (!userId) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }

    const result = await toggleLike(userId, validated.track_id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST likes error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
