import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllShows, getShowsByArtist, getShowById, createShow, updateShow, deleteShow, getArtistById, createNotification } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { sendNotificationEmail } from "@/lib/email";
import type { ShowStatus } from "@/types/music";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

const CreateShowSchema = z.object({
  artist_id: z.string().min(1, "artist_id requerido"),
  venue_name: z.string().min(1, "venue_name requerido"),
  city: z.string().nullish(),
  country: z.string().nullish(),
  date: z.string().nullish(),
  time: z.string().nullish(),
  price_range: z.string().nullish(),
  status: z.enum(["proximamente", "activo", "pospuesto", "hoy", "pasado", "cancelado", "suspendido", "confirmado", "en_venta", "agotado", "reprogramado", "disponible", "finalizado"]).optional(),
  ticket_url: z.string().nullish(),
  payment_methods: z.array(z.object({ type: z.enum(["cash", "card", "transfer", "ticket_platform", "other"]), details: z.string().optional(), platform_url: z.string().optional() })).nullish(),
  postponement_reason: z.string().nullish(),
  flyer_url: z.string().nullish(),
  ticket_link: z.string().nullish(),
  description: z.string().nullish(),
  guest_artists: z.array(z.object({ name: z.string(), role: z.string().optional() })).nullish(),
  notes: z.string().nullish(),
});

const UpdateShowSchema = z.object({
  id: z.string().min(1, "id requerido"),
  venue_name: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string().nullish(),
  date: z.string().nullish(),
  time: z.string().nullish(),
  price_range: z.string().nullish(),
  status: z.enum(["proximamente", "activo", "pospuesto", "hoy", "pasado", "cancelado", "suspendido", "confirmado", "en_venta", "agotado", "reprogramado", "disponible", "finalizado"]).optional(),
  ticket_url: z.string().nullish(),
  payment_methods: z.array(z.object({ type: z.enum(["cash", "card", "transfer", "ticket_platform", "other"]), details: z.string().optional(), platform_url: z.string().optional() })).nullish(),
  postponement_reason: z.string().nullish(),
  flyer_url: z.string().nullish(),
  ticket_link: z.string().nullish(),
  description: z.string().nullish(),
  guest_artists: z.array(z.object({ name: z.string(), role: z.string().optional() })).nullish(),
  notes: z.string().nullish(),
});

function computeDynamicStatus(show: { status: string; date: string | null }): string {
  if (show.status === "cancelado" || show.status === "suspendido") return show.status;
  if (!show.date) return show.status || "proximamente";
  const now = new Date();
  const showDate = new Date(show.date);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (showDate >= todayStart && showDate < todayEnd) return "hoy";
  if (showDate < todayStart) return "pasado";
  return show.status || "proximamente";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const artistId = searchParams.get("artist_id");
    const showId = searchParams.get("id");

    if (showId) {
      const show = await getShowById(showId);
      if (!show) {
        return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
      }
      return NextResponse.json({ ...show, status: computeDynamicStatus(show) as ShowStatus });
    }

    if (artistId) {
      const shows = await getShowsByArtist(artistId);
      return NextResponse.json({ shows: shows.map(s => ({ ...s, status: computeDynamicStatus(s) as ShowStatus })) });
    }

    const shows = await getAllShows();
    return NextResponse.json({ shows: shows.map(s => ({ ...s, status: computeDynamicStatus(s) as ShowStatus })) }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Surrogate-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("GET shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (session.role !== "admin" && session.role !== "artist") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const validated = CreateShowSchema.parse(body);

    // FK validation: verify artist_id exists
    const artist = await getArtistById(validated.artist_id);
    if (!artist) {
      return NextResponse.json({ error: "Artista no encontrado" }, { status: 400 });
    }

    // Artists can only create shows for themselves; admins can create for anyone
    if (session.role === "artist" && artist.user_id !== session.userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const show = await createShow(validated);

    // Create notification for the artist
    const artistForNotification = await getArtistById(validated.artist_id);
    if (artistForNotification && artistForNotification.user_id) {
      await createNotification({
        id: randomUUID(),
        user_id: artistForNotification.user_id,
        type: "show_pending_review",
        title: "Show enviado para revisión",
        message: `Tu show en ${validated.venue_name} ha sido enviado para revisión. Será publicado tras aprobación del equipo.`,
        data: JSON.stringify({ show_id: show.id, venue_name: validated.venue_name }),
        read: false,
      });

      void sendNotificationEmail({
        userId: artistForNotification.user_id,
        type: "show_pending_review",
        data: {
          userName: "",
          trackTitle: validated.venue_name,
          artistName: artistForNotification.name,
          dashboardUrl: "/dashboard",
          context: "show",
          showVenue: validated.venue_name,
          showDate: validated.date ?? undefined,
        },
      });
    }

    return NextResponse.json(show, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const validated = UpdateShowSchema.parse(body);
    const { id, ...rawData } = validated;
    // Strip null values — DB functions expect undefined for missing fields
    const data = Object.fromEntries(Object.entries(rawData).filter(([, v]) => v !== null));

    if (session.role !== "admin" && session.role !== "artist") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // Ownership check: artists can only update their own shows; admins can update any
    if (session.role === "artist") {
      const existing = await getShowById(id);
      if (!existing) {
        return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
      }
      const artist = await getArtistById(existing.artist_id);
      if (!artist || artist.user_id !== session.userId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    const show = await updateShow(id, data);
    if (!show) {
      return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
    }
    return NextResponse.json(show);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("PUT shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    if (session.role !== "admin" && session.role !== "artist") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // Ownership check: artists can only delete their own shows; admins can delete any
    if (session.role === "artist") {
      const existing = await getShowById(id);
      if (!existing) {
        return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
      }
      const artist = await getArtistById(existing.artist_id);
      if (!artist || artist.user_id !== session.userId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    const deleted = await deleteShow(id);
    if (!deleted) {
      return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
