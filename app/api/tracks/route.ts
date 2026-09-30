import { NextRequest, NextResponse } from "next/server";
import {
  getAllTracks,
  getApprovedTracks,
  createTrack,
  updateTrack,
  deleteTrack,
  getTrackById,
  getArtistByName,
} from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { notifyApprovalDecision } from "@/lib/approval-notifications";
import { notifyArtistSubscribers } from "@/lib/subscriber-notifications";

export const dynamic = "force-dynamic";

const TRACK_STATUSES = ["draft", "pending", "approved", "rejected", "revision"];

async function notifyApprovedTrack(trackId: string, previousStatus: string | null | undefined): Promise<void> {
  try {
    if (previousStatus === "approved") return;
    const track = await getTrackById(trackId);
    if (!track || track.status !== "approved") return;

    const artist = track.artist_name ? await getArtistByName(track.artist_name) : null;
    if (artist?.user_id) {
      await notifyApprovalDecision({
        userId: artist.user_id,
        type: "submission_approved",
        title: "¡Tu release ha sido aprobado!",
        message: `"${track.title}" ya está disponible en el catálogo.`,
        data: { trackId: track.id, trackTitle: track.title, artistName: track.artist_name },
        context: "track",
      });
    }

    if (artist && !track.release_id) {
      await notifyArtistSubscribers({
        artistId: artist.id,
        kind: "release",
        title: "Nuevo release publicado",
        message: `"${track.title}" de ${artist.name} ya está disponible en PressPlay.`,
        data: {
          trackId: track.id,
          track_id: track.id,
          trackTitle: track.title,
          artistName: artist.name,
          dashboardUrl: "/releases",
        },
        emailType: "new_release",
        emailData: {
          trackTitle: track.title,
          artistName: artist.name,
          dashboardUrl: `/releases/${track.id}`,
        },
      });
    }
  } catch (notificationError) {
    console.error("tracks notificación (no fatal):", notificationError);
  }
}

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

// ── Por qué no hay SQL suelto en esta ruta ──────────────────────────────────
// La versión anterior traía su propio `dbQuery`, que ramificaba con
// `isTursoConfigured()` de `@/lib/db` (lee `process.env` en TIEMPO DE LLAMADA)
// pero ejecutaba con `getTursoClient()` de `@/lib/turso` (lee el env al
// IMPORTAR el módulo, `lib/turso.ts:31-32`): con el env cargando tarde —el caso
// normal en un bundle de Vercel— la primera decía "turso" y la segunda devolvía
// `null`, se lanzaba y la ruta respondía 500 en vez de listar nada. El patrón
// bueno es `getTursoClientSync() !== null`: devuelve `null` si y solo si
// `isTursoEnabled()` es falso, y los dos leen `process.env` en tiempo de
// llamada, así que no hay dos fuentes de verdad que puedan discrepar.
//
// Ya no hace falta aquí: el listado público pasó a `getApprovedTracks()`
// (`lib/db.ts`), que es donde vive la decisión de backend Y el acotado de la
// forma de la respuesta. Ver el comentario de ese lector para por qué el
// `SELECT *` con `WHERE status='approved'` no bastaba: el `admin_notes` de un
// rechazo viajaba dentro de la fila aprobada.

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
      // Public/non-admin: only approved tracks, and in the whitelisted `Track`
      // shape. `admin_notes` is not part of that type, so it cannot travel out.
      tracks = await getApprovedTracks();
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
    if (typeof rest.status === "string" && TRACK_STATUSES.includes(rest.status)) {
      await updateTrack(id, { status: rest.status });
      if (rest.status === "approved") {
        await notifyApprovedTrack(id, null);
      }
    }
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

    const existingTrack = await getTrackById(id);
    const updated = await updateTrack(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    if (updates.status === "approved") {
      await notifyApprovedTrack(id, existingTrack?.status ?? null);
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
