import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllShows, getShowsByArtist, getShowById, createShow, updateShow, deleteShow } from "@/lib/db";
import type { ShowStatus } from "@/types/music";

export const dynamic = "force-dynamic";

const CreateShowSchema = z.object({
  artist_id: z.string().min(1, "artist_id requerido"),
  venue_name: z.string().min(1, "venue_name requerido"),
  city: z.string().optional(),
  country: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  price_range: z.string().optional(),
  status: z.enum(["proximamente", "activo", "pospuesto", "hoy", "pasado", "cancelado", "suspendido", "confirmado", "en_venta", "agotado"]).optional(),
  ticket_url: z.string().optional(),
  payment_methods: z.array(z.object({ type: z.enum(["cash", "card", "transfer", "ticket_platform", "other"]), value: z.string(), isPrimary: z.boolean() })).optional(),
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
  status: z.enum(["proximamente", "activo", "pospuesto", "hoy", "pasado", "cancelado", "suspendido", "confirmado", "en_venta", "agotado"]).optional(),
  ticket_url: z.string().optional(),
  payment_methods: z.array(z.object({ type: z.enum(["cash", "card", "transfer", "ticket_platform", "other"]), value: z.string(), isPrimary: z.boolean() })).optional(),
  postponement_reason: z.string().optional(),
  flyer_url: z.string().optional(),
  ticket_link: z.string().optional(),
  description: z.string().optional(),
  guest_artists: z.array(z.object({ name: z.string(), role: z.string().optional() })).optional(),
  notes: z.string().optional(),
});

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
      return NextResponse.json(show);
    }

    if (artistId) {
      const shows = await getShowsByArtist(artistId);
      return NextResponse.json({ shows });
    }

    const shows = await getAllShows();
    return NextResponse.json({ shows }, {
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
    const body = await req.json();
    const validated = CreateShowSchema.parse(body);
    const show = await createShow(validated);
    return NextResponse.json(show, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = UpdateShowSchema.parse(body);
    const { id, ...data } = validated;
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
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
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
