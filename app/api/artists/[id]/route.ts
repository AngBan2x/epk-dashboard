import { NextRequest, NextResponse } from "next/server";
import { deleteArtist, updateArtist, getArtistById } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "artist" };
}

// GET /api/artists/:id — Obtener artista por ID (público)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const artist = await getArtistById(id);
    if (!artist) {
      return NextResponse.json({ error: "Artista no encontrado" }, { status: 404 });
    }
    return NextResponse.json(artist);
  } catch (error) {
    console.error("[API/artists/[id]] Error GET:", error);
    return NextResponse.json({ error: "Error al obtener artista" }, { status: 500 });
  }
}

// PUT /api/artists/:id — Actualizar artista (solo admin)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await validateSession(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const updated = await updateArtist(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Artista no encontrado" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/artists/[id]] Error PUT:", error);
    return NextResponse.json({ error: "Error al actualizar artista" }, { status: 500 });
  }
}

// DELETE /api/artists/:id — Eliminar artista (solo admin)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await validateSession(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = params;
    const deleted = await deleteArtist(id);

    if (!deleted) {
      return NextResponse.json({ error: "Artista no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ deleted: id });
  } catch (error) {
    console.error("[API/artists/[id]] Error DELETE:", error);
    return NextResponse.json({ error: "Error al eliminar artista" }, { status: 500 });
  }
}
