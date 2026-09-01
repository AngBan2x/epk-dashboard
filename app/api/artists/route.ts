import { NextRequest, NextResponse } from "next/server";
import { getAllArtists, getArtistById, updateArtist } from "@/lib/db";

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

// GET /api/artists — Listar todos los artistas (público)
export async function GET() {
  try {
    const artists = await getAllArtists();
    return NextResponse.json({ artists });
  } catch (error) {
    console.error("[API/artists] Error GET:", error);
    return NextResponse.json({ error: "Error al obtener artistas" }, { status: 500 });
  }
}

// PUT /api/artists?id=xxx — Actualizar artista (solo admin)
export async function PUT(req: NextRequest) {
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

    const body = await req.json();
    const updated = await updateArtist(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Artista no encontrado" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/artists] Error PUT:", error);
    return NextResponse.json({ error: "Error al actualizar artista" }, { status: 500 });
  }
}
