import { NextRequest, NextResponse } from "next/server";
import { updateTrack, getTrackById } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "artist" };
}

// GET /api/tracks/:id — Get track by ID
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const track = await getTrackById(id);
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }
    return NextResponse.json(track);
  } catch (error) {
    console.error("[API/tracks/:id] Error GET:", error);
    return NextResponse.json({ error: "Error al obtener track" }, { status: 500 });
  }
}

// PATCH /api/tracks/:id — Update track fields (lyrics, is_instrumental, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await validateSession(req);
    if (!session || (session.role !== "admin" && session.role !== "artist")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    // Verify track exists
    const existing = await getTrackById(id);
    if (!existing) {
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    // Only allow specific fields to be patched
    const allowedFields = ["lyrics", "is_instrumental", "production_details"];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    const updated = await updateTrack(id, updates);
    return NextResponse.json({ id: updated!.id, ...updates });
  } catch (error) {
    console.error("[API/tracks/:id] Error PATCH:", error);
    return NextResponse.json({ error: "Error al actualizar track" }, { status: 500 });
  }
}
