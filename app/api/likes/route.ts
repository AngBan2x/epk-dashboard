import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toggleLike, getLikeCount, hasUserLikedTrack, getUserLikes } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

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
    const session = await validateRequest(req);
    const sessionUserId = session?.userId ?? null;
    const requestedUserId = searchParams.get("user_id");

    // P17: `?user_id=` sin sesión devolvía los likes de **otro** usuario.
    //
    // La pregunta "¿cuánta gente ha marcado esta pista?" es pública — sale en
    // cada EPKCard. La pregunta "¿qué le ha gustado a esta persona?" no lo es:
    // es su historial de actividad, y se knebía con un `?user_id=` cualquiera.
    //
    // Dos reglas, dos motivos distintos: sin sesión, 401 (no hay a quién
    // preguntarle); con sesión, 403 salvo que sea el propio o un admin.
    if (requestedUserId && !sessionUserId) {
      return NextResponse.json({ error: "Autenticación requerida" }, { status: 401 });
    }
    if (
      requestedUserId &&
      sessionUserId &&
      requestedUserId !== sessionUserId &&
      session?.role !== "admin"
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const userId = requestedUserId || sessionUserId;

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
    const userId = await getUserIdFromSession(req);
    if (!userId) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }

    const blocked = enforceRateLimit(req, "likes", userId, 60);
    if (blocked) return blocked;

    const body = await req.json();
    const validated = ToggleLikeSchema.parse(body);

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
