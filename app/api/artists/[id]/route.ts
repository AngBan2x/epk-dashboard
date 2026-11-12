import { NextRequest, NextResponse } from "next/server";
import { deleteArtist, updateArtist, getArtistById, getPublicArtistById } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "artist" };
}

// GET /api/artists/:id — Obtener artista por ID (público)
//
// P17: sale por el lector de alcance público (`getPublicArtistById`), que
// filtra `is_active = 1` y `deleted_at IS NULL` en el SQL y **no** expone
// `user_id` —la FK que liga el artista con su cuenta de usuario— ni
// `deleted_at`. Antes devolvía la fila cruda: en producción, un anónimo
// recibía `"user_id":"demo-user-001"`.
//
// El admin sí ve los inactivos, porque para moderar hay que verlos. Es el
// mismo patrón que `GET /api/tracks/[id]`: primero el alcance público, y
// detrás el brazo privilegiado para quien puede verlo.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const publicArtist = await getPublicArtistById(id);
    if (publicArtist) {
      return NextResponse.json(publicArtist);
    }

    const session = await validateSession(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Artista no encontrado" }, { status: 404 });
    }

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
