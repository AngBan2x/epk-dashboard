import { NextRequest, NextResponse } from "next/server";
import { updateTrack, getTrackById, getApprovedTrackById, isArtistOwnerOfTrackName } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { validateTrackNumber } from "@/lib/validations";

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "artist" };
}

// GET /api/tracks/:id — Get track by ID
//
// S0/P4: esta ruta es PÚBLICA (no está en el `matcher` de `middleware.ts`) y
// usaba `getTrackById`, que no filtra por estado. Con eso, un borrador o un
// release rechazado era legible por cualquiera que tuviera el id, y el
// `admin_notes` interno también viajaba en la respuesta.
//
// Ahora sale por el lector de alcance público (aprobado + parseado con
// `parseTrack`, que es la forma acotada por el tipo `Track`). El dueño
// verificado y el admin siguen viendo los estados propios mediante
// `artists.user_id`, que es la única fuente de ownership fiable aquí: `tracks`
// se relaciona con `artists` por nombre, no por FK.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const approved = await getApprovedTrackById(id);
    if (approved) return NextResponse.json(approved);

    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    const track = await getTrackById(id);
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }
    if (session.role === "admin") return NextResponse.json(track);

    const owns = await isArtistOwnerOfTrackName(track.artist_name, session.userId);
    if (!owns) {
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

    // RC.33 Ola 0 — el hueco de autorización que este mismo fichero documentaba
    // sin cerrar. El GET de arriba sí comprobaba ownership (línea 47) y el PATCH no:
    // aceptaba a cualquier `artist` autenticado para reescribir `lyrics`,
    // `production_details`, `gallery_images`, `start_time`/`end_time` y
    // `track_number` de CUALQUIER pista por id. Con 12 artistas en el catálogo, eso
    // es "puedo escribir la letra de Pink Floyd".
    //
    // El admin conserva el bypass, igual que en `PUT /api/releases:681` y en
    // `DELETE /api/releases:934`. La prueba de propiedad va por
    // `isArtistOwnerOfTrackName` porque `tracks` se relaciona con `artists` por
    // nombre y no por FK: no hay otro sitio fiable donde mirar.
    if (session.role === "artist") {
      const owns = await isArtistOwnerOfTrackName(existing.artist_name, session.userId);
      if (!owns) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    // Only allow specific fields to be patched
    const allowedFields = ["lyrics", "is_instrumental", "production_details", "start_time", "end_time", "gallery_images", "track_number"];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        // M0: this route is a passthrough, so numbers must be bounded here.
        // Rejects NaN / Infinity / negatives / non-integers with a 400 instead
        // of letting raw input reach the column (mass-assignment guard).
        if (field === "track_number") {
          const trackNumber = validateTrackNumber(body[field]);
          if (trackNumber === undefined) {
            return NextResponse.json(
              { error: "track_number debe ser un entero >= 0 o null" },
              { status: 400 }
            );
          }
          updates[field] = trackNumber;
          continue;
        }
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
