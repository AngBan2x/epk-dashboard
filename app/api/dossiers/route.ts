import { NextRequest, NextResponse } from "next/server";
import {
  getArtistById,
  getDossierByArtistId,
  upsertDossier,
  type DossierData,
} from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

/**
 * Propiedad real contra `artists.user_id`, no contra un `user_id` de query.
 *
 * Antes la comprobación era un `SELECT` crudo que ramificaba entre
 * `getTursoClient()` de `@/lib/turso` (que lee `process.env` al importar el
 * módulo) y `getDbWrite()`. Dos fuentes de verdad para una decisión y, en el peor
 * caso, una escritura en la réplica local de producción. `getArtistById()` ya
 * ramifica con `isTursoEnabled()` en tiempo de llamada por los dos lados.
 */
async function isArtistOwner(userId: string, artistId: string): Promise<boolean> {
  if (!userId || !artistId) return false;
  const artist = await getArtistById(artistId);
  return !!artist && artist.user_id === userId;
}

export async function GET(req: NextRequest) {
  try {
    // S1: el GET devolvía el dossier completo —bio, contacto, booking, management—
    // sin ninguna comprobación de sesión ni de propiedad, con `isArtistOwner`
    // definido tres líneas más arriba y usado solo en el PUT. Con solo conocer un
    // `artist_id` (que viaja en la URL pública de la ficha del artista) bastaba
    // para leerlos.
    //
    // El material de prensa sigue siendo público por la vía que lo publica:
    // `POST /api/export`, que es anónimo a propósito (`app/api/export/route.ts:9-14`)
    // y renderiza las mismas secciones dossier y rider, `contact_email` y
    // `management` incluidos. Este endpoint deja de ser el camino alternativo sin
    // sesión, y queda con la misma puerta que su escritura: admin o dueño.
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const artistId = searchParams.get("artist_id");
    if (!artistId) {
      return NextResponse.json({ error: "artist_id requerido" }, { status: 400 });
    }

    if (session.role !== "admin" && !(await isArtistOwner(session.userId, artistId))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
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
    const session = await validateSession(req);
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
