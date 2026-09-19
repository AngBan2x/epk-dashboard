import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllShows, getShowsByArtist, getShowById, createShow, updateShow, deleteShow, getArtistById } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import type { ShowStatus } from "@/types/music";

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

const CreateShowSchema = z.object({
  artist_id: z.string().min(1, "artist_id requerido"),
  venue_name: z.string().min(1, "venue_name requerido"),
  city: z.string().optional(),
  country: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  price_range: z.string().optional(),
  status: z.enum(["proximamente", "activo", "pospuesto", "hoy", "pasado", "cancelado", "suspendido", "confirmado", "en_venta", "agotado", "reprogramado", "disponible", "finalizado"]).optional(),
  ticket_url: z.string().optional(),
  payment_methods: z.array(z.object({ type: z.enum(["cash", "card", "transfer", "ticket_platform", "other"]), details: z.string().optional(), platform_url: z.string().optional() })).optional(),
  postponement_reason: z.string().optional(),
  flyer_url: z.string().optional(),
  ticket_link: z.string().optional(),
  description: z.string().optional(),
  guest_artists: z.array(z.object({ name: z.string(), role: z.string().optional() })).optional(),
  notes: z.string().optional(),
});

const UpdateShowSchema = z.object({
  id: z.string().min(1, "id requerido"),
  venue_name: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  price_range: z.string().optional(),
  status: z.enum(["proximamente", "activo", "pospuesto", "hoy", "pasado", "cancelado", "suspendido", "confirmado", "en_venta", "agotado", "reprogramado", "disponible", "finalizado"]).optional(),
  ticket_url: z.string().optional(),
  payment_methods: z.array(z.object({ type: z.enum(["cash", "card", "transfer", "ticket_platform", "other"]), details: z.string().optional(), platform_url: z.string().optional() })).optional(),
  postponement_reason: z.string().optional(),
  flyer_url: z.string().optional(),
  ticket_link: z.string().optional(),
  description: z.string().optional(),
  guest_artists: z.array(z.object({ name: z.string(), role: z.string().optional() })).optional(),
  notes: z.string().optional(),
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
    const { id, ...data } = validated;

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
