import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSubscription,
  getArtistById,
  getSubscriptionByUserAndArtist,
  getSubscriptionsBySubscriber,
  updateSubscription,
} from "@/lib/db";
import { validateRequest } from "@/lib/auth";

const CreateSubscriptionSchema = z.object({
  artist_id: z.string().min(1, "artist_id requerido"),
  notify_releases: z.boolean().optional(),
  notify_shows: z.boolean().optional(),
});

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "artist" };
}

export async function GET(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const artistId = searchParams.get("artist_id");
    const userIdParam = searchParams.get("user_id");

    let targetUserId = session.userId;
    if (userIdParam) {
      if (session.role !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      targetUserId = userIdParam;
    }

    if (artistId) {
      const subscription = await getSubscriptionByUserAndArtist(targetUserId, artistId);
      return NextResponse.json({
        artist_id: artistId,
        subscribed: subscription !== null,
        subscription,
      });
    }

    const subscriptions = await getSubscriptionsBySubscriber(targetUserId);
    const result = await Promise.all(
      subscriptions.map(async (subscription) => {
        const artist = await getArtistById(subscription.artist_id);
        return {
          ...subscription,
          artist: artist
            ? { id: artist.id, name: artist.name, image: artist.profile_image }
            : null,
        };
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET subscriptions error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const validated = CreateSubscriptionSchema.parse(body);

    const artist = await getArtistById(validated.artist_id);
    if (!artist) {
      return NextResponse.json({ error: "Artista no encontrado" }, { status: 400 });
    }

    if (artist.user_id && artist.user_id === session.userId) {
      return NextResponse.json(
        { error: "No puedes suscribirte a tu propio perfil" },
        { status: 400 }
      );
    }

    const existing = await getSubscriptionByUserAndArtist(session.userId, validated.artist_id);

    if (existing) {
      const updates: { notify_releases?: boolean; notify_shows?: boolean } = {};
      if (validated.notify_releases !== undefined) updates.notify_releases = validated.notify_releases;
      if (validated.notify_shows !== undefined) updates.notify_shows = validated.notify_shows;
      const updated = await updateSubscription(existing.id, updates);
      return NextResponse.json(updated ?? existing, { status: 200 });
    }

    const created = await createSubscription({
      id: crypto.randomUUID(),
      subscriber_id: session.userId,
      artist_id: validated.artist_id,
      notify_releases: validated.notify_releases ?? true,
      notify_shows: validated.notify_shows ?? true,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST subscriptions error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
