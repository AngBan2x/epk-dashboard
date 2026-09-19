import { NextRequest, NextResponse } from "next/server";
import { getAllArtists, getDbWrite, isTursoConfigured } from "@/lib/db";
import { getTursoClient } from "@/lib/turso";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

// GET /api/artists — Listar artistas: admin ve todos, público solo aprobados
export async function GET(req: NextRequest) {
  try {
    const session = await validateSession(req);
    const isAdmin = session?.role === "admin";

    let artists;
    if (isAdmin) {
      artists = await getAllArtists();
    } else {
      if (isTursoConfigured()) {
        const client = getTursoClient();
        if (!client) throw new Error("Turso client not available");
        const result = await client.execute({
          sql: "SELECT * FROM artists WHERE is_active = 1 ORDER BY created_at DESC",
          args: [],
        });
        artists = result.rows;
      } else {
        const db = getDbWrite();
        artists = db.prepare("SELECT * FROM artists WHERE is_active = 1 ORDER BY created_at DESC").all();
      }
    }

    return NextResponse.json({ artists }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Surrogate-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("[API/artists] Error GET:", error);
    return NextResponse.json({ error: "Error al obtener artistas" }, { status: 500 });
  }
}
