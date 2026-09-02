import { NextRequest, NextResponse } from "next/server";
import { getAllTracks, createTrack, updateTrack, deleteTrack } from "@/lib/db";

export const dynamic = "force-dynamic";

function validateSession(req: NextRequest): { userId: string; role: string } | null {
  const sessionCookie = req.cookies.get("auth_session");
  if (!sessionCookie) return null;

  try {
    const decoded = atob(sessionCookie.value);
    const session = JSON.parse(decoded) as { userId: string; role?: string };
    return { userId: session.userId, role: session.role || "artist" };
  } catch {
    return null;
  }
}

// GET /api/tracks — Listar todos los tracks (público)
export async function GET() {
  try {
    const tracks = await getAllTracks();
    return NextResponse.json({ tracks });
  } catch (error) {
    console.error("[API/tracks] Error GET:", error);
    return NextResponse.json({ error: "Error al obtener tracks" }, { status: 500 });
  }
}

// POST /api/tracks — Crear un track nuevo (solo admin)
export async function POST(req: NextRequest) {
  try {
    const session = validateSession(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { id, title, ...rest } = body;

    if (!id || !title) {
      return NextResponse.json({ error: "id y title son requeridos" }, { status: 400 });
    }

    const track = await createTrack({ id, title, ...rest });
    return NextResponse.json({ id: track.id, title: track.title, artist_name: track.artist_name }, { status: 201 });
  } catch (error) {
    console.error("[API/tracks] Error POST:", error);
    return NextResponse.json({ error: "Error al crear track" }, { status: 500 });
  }
}

// PUT /api/tracks — Actualizar un track existente (solo admin)
export async function PUT(req: NextRequest) {
  try {
    const session = validateSession(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    const updated = await updateTrack(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ id: updated.id, ...updates });
  } catch (error) {
    console.error("[API/tracks] Error PUT:", error);
    return NextResponse.json({ error: "Error al actualizar track" }, { status: 500 });
  }
}

// DELETE /api/tracks?id=xxx — Eliminar un track (solo admin)
export async function DELETE(req: NextRequest) {
  try {
    const session = validateSession(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    const deleted = await deleteTrack(id);
    if (!deleted) {
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ deleted: id });
  } catch (error) {
    console.error("[API/tracks] Error DELETE:", error);
    return NextResponse.json({ error: "Error al eliminar track" }, { status: 500 });
  }
}
