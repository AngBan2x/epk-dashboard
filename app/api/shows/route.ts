import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllShows, getShowsByArtist, getShowById, createShow, updateShow, deleteShow } from "@/lib/db";
import type { ShowStatus } from "@/types/music";

const CreateShowSchema = z.object({
  artist_id: z.string().min(1, "artist_id requerido"),
  venue_name: z.string().min(1, "venue_name requerido"),
  city: z.string().optional(),
  country: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  price_range: z.string().optional(),
  status: z.enum(["disponible", "agotado", "proximamente", "vip", "cancelado", "pausado"]).optional(),
  ticket_url: z.string().optional(),
});

const UpdateShowSchema = z.object({
  id: z.string().min(1, "id requerido"),
  venue_name: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  price_range: z.string().optional(),
  status: z.enum(["disponible", "agotado", "proximamente", "vip", "cancelado", "pausado"]).optional(),
  ticket_url: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const artistId = searchParams.get("artist_id");
    const showId = searchParams.get("id");

    if (showId) {
      const show = getShowById(showId);
      if (!show) {
        return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
      }
      return NextResponse.json(show);
    }

    if (artistId) {
      const shows = getShowsByArtist(artistId);
      return NextResponse.json({ shows });
    }

    const shows = getAllShows();
    return NextResponse.json({ shows });
  } catch (error) {
    console.error("GET shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = CreateShowSchema.parse(body);
    const show = createShow(validated);
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
    const show = updateShow(id, data);
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
    const deleted = deleteShow(id);
    if (!deleted) {
      return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
