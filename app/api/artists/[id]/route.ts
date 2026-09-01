import { NextRequest, NextResponse } from "next/server";
import { deleteArtist } from "@/lib/db";

function validateSession(req: NextRequest): { userId: string; role: string } | null {
  const sessionCookie = req.cookies.get("auth_session");
  if (!sessionCookie) return null;
  try {
    const decoded = atob(sessionCookie.value);
    const session = JSON.parse(decoded) as { userId: string; exp: number; role?: string };
    if (!session.exp || session.exp < Date.now()) return null;
    return { userId: session.userId, role: session.role || "artist" };
  } catch {
    return null;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = validateSession(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
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
