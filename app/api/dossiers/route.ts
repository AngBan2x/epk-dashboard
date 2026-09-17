import { NextRequest, NextResponse } from "next/server";
import { getDossierByArtistId, upsertDossier, type DossierData } from "@/lib/db";
import { getTursoClient } from "@/lib/turso";
import { isTursoConfigured, getDbWrite } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

function validateSession(req: NextRequest): { userId: string; role: string } | null {
  const session = validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

async function isArtistOwner(userId: string, artistId: string): Promise<boolean> {
  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (!client) return false;
    const result = await client.execute({
      sql: "SELECT id FROM artists WHERE id = ? AND user_id = ?",
      args: [artistId, userId],
    });
    return result.rows.length > 0;
  }
  const db = getDbWrite();
  const row = db.prepare("SELECT id FROM artists WHERE id = ? AND user_id = ?").get(artistId, userId);
  return !!row;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const artistId = searchParams.get("artist_id");
    if (!artistId) {
      return NextResponse.json({ error: "artist_id requerido" }, { status: 400 });
    }

    const dossier = await getDossierByArtistId(artistId);
    if (!dossier) {
      return NextResponse.json({ dossier: null, message: "Sin dossier — usando defaults del rider" });
    }
    return NextResponse.json({ dossier });
  } catch (error) {
    console.error("GET dossiers error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { artist_id, ...updates } = body;

    if (!artist_id) {
      return NextResponse.json({ error: "artist_id requerido" }, { status: 400 });
    }

    // Allow admin or the artist owner
    if (session.role !== "admin" && !(await isArtistOwner(session.userId, artist_id))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const dossier = await upsertDossier(artist_id, updates as Partial<DossierData>);
    return NextResponse.json({ dossier, message: "Dossier actualizado" });
  } catch (error) {
    console.error("PUT dossiers error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
