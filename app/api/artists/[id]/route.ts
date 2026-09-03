import { NextRequest, NextResponse } from "next/server";
import { deleteArtist, updateArtist } from "@/lib/db";

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

// PUT /api/artists/:id — Actualizar artista (solo admin)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = validateSession(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    console.log("[PUT /api/artists/:id] id:", id, "body:", JSON.stringify(body).substring(0, 200));
    const updated = await updateArtist(id, body);
    console.log("[PUT /api/artists/:id] result:", updated ? "OK" : "NULL");
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
    const session = validateSession(req);
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
