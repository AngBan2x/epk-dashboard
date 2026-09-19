import { NextRequest, NextResponse } from "next/server";
import { getAllTracks, createTrack, updateTrack, deleteTrack, getDbWrite, isTursoConfigured } from "@/lib/db";
import { getTursoClient } from "@/lib/turso";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

// GET /api/tracks — Listar tracks: admin ve todos, público solo aprobados
export async function GET(req: NextRequest) {
  try {
    const session = await validateSession(req);
    const isAdmin = session?.role === "admin";

    let tracks;
    if (isAdmin) {
      // Admin sees all tracks
      tracks = await getAllTracks();
    } else {
      // Public/non-admin: only approved tracks
      if (isTursoConfigured()) {
        const client = getTursoClient();
        if (!client) throw new Error("Turso client not available");
        const result = await client.execute({
          sql: "SELECT * FROM tracks WHERE status = 'approved' ORDER BY created_at DESC",
          args: [],
        });
        tracks = result.rows;
      } else {
        const db = getDbWrite();
        tracks = db.prepare("SELECT * FROM tracks WHERE status = 'approved' ORDER BY created_at DESC").all();
      }
    }

    // Pagination: ?page=1&limit=10
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const total = tracks.length;
    const start = (page - 1) * limit;
    const paginatedTracks = start >= total ? [] : tracks.slice(start, start + limit);

    return NextResponse.json({ tracks: paginatedTracks, total, page, limit }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Surrogate-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("[API/tracks] Error GET:", error);
    return NextResponse.json({ error: "Error al obtener tracks" }, { status: 500 });
  }
}

// POST /api/tracks — Crear un track nuevo (solo admin)
export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
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
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
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
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
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
