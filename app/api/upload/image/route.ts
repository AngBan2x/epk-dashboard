import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { getTrackById, getDbWrite, isTursoConfigured } from "@/lib/db";
import { getTursoClient } from "@/lib/turso";
import { uploadImage, deleteImage } from "@/lib/blob";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "artist" };
}

async function dbQuery(sql: string, params?: unknown[]): Promise<unknown[]> {
  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (!client) throw new Error("Turso client not available");
    const result = await client.execute({ sql, args: (params ?? []) as any[] });
    return result.rows as unknown[];
  }
  const db = getDbWrite();
  const stmt = db.prepare(sql);
  return params ? stmt.all(...params) : stmt.all();
}

async function dbRun(sql: string, params?: unknown[]): Promise<void> {
  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (!client) throw new Error("Turso client not available");
    await client.execute({ sql, args: (params ?? []) as any[] });
    return;
  }
  const db = getDbWrite();
  const stmt = db.prepare(sql);
  stmt.run(...(params ?? []));
}

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const trackId = formData.get("trackId") as string | null;
    const kind = formData.get("kind") as string | null; // "profile" | "banner" (alternative to trackId)
    const artistId = formData.get("artistId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    }
    if (!trackId && !(kind && artistId)) {
      return NextResponse.json({ error: "trackId o kind+artistId requeridos" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de archivo no válido. Solo se permiten JPG, PNG o WebP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "El archivo supera el límite de 5MB" },
        { status: 400 }
      );
    }

    const track = trackId ? await getTrackById(trackId) : null;
    if (trackId && !track) {
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    // Verify ownership: track owner (via artist name) or profile/banner owner (via artistId)
    let ownerUserId = session.userId;
    let prefix: string;
    if (trackId && track) {
      const artistRow = await dbQuery(
        "SELECT id, user_id FROM artists WHERE name = ?",
        [track.artist_name]
      ) as { id: string; user_id: string }[];
      const ownsTrack = artistRow.length > 0 && artistRow[0].user_id === session.userId;

      if (!ownsTrack && session.role !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      ownerUserId = artistRow.length > 0 ? artistRow[0].user_id : session.userId;
      prefix = `${ownerUserId}/${trackId}`;
    } else {
      // Profile/banner upload for an artist
      if (kind !== "profile" && kind !== "banner") {
        return NextResponse.json({ error: "kind debe ser profile o banner" }, { status: 400 });
      }
      const artistRow = await dbQuery(
        "SELECT id, user_id FROM artists WHERE id = ?",
        [artistId]
      ) as { id: string; user_id: string }[];
      if (artistRow.length === 0) {
        return NextResponse.json({ error: "Artista no encontrado" }, { status: 404 });
      }
      if (artistRow[0].user_id !== session.userId && session.role !== "admin") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      ownerUserId = artistRow[0].user_id;
      prefix = `${ownerUserId}/profile`;
    }

    const { url: imageUrl, filename } = await uploadImage(file, prefix);

    // Profile/banner uploads return the URL only (no tracks write)
    if (!trackId) {
      return NextResponse.json({ url: imageUrl, kind }, { status: 201 });
    }

    // Append to gallery_images in the tracks table (items are objects; legacy string URLs preserved)
    const existing = await dbQuery(
      "SELECT gallery_images FROM tracks WHERE id = ?",
      [trackId]
    ) as { gallery_images: string | null }[];

    let galleryImages: Array<string | Record<string, unknown>> = [];
    if (existing.length > 0 && existing[0].gallery_images) {
      try {
        const parsed = JSON.parse(existing[0].gallery_images);
        if (Array.isArray(parsed)) {
          galleryImages = parsed.filter(
            (item: unknown) =>
              typeof item === "string" ||
              (typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).url === "string")
          );
        }
      } catch {
        galleryImages = [];
      }
    }

    const newItem = {
      id: `img-${Date.now()}`,
      url: imageUrl,
      title: filename.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ") || "Asset de Prensa",
      category: "Prensa",
    };
    galleryImages.push(newItem);

    await dbRun(
      "UPDATE tracks SET gallery_images = ? WHERE id = ?",
      [JSON.stringify(galleryImages), trackId]
    );

    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error("[API/upload/image] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? `Error al subir la imagen: ${error.message}` : "Error al subir la imagen" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const trackId = searchParams.get("trackId");
    const imageUrl = searchParams.get("url");

    if (!trackId || !imageUrl) {
      return NextResponse.json({ error: "trackId y url requeridos" }, { status: 400 });
    }

    const track = await getTrackById(trackId);
    if (!track) {
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    // Verify ownership
    const artistRow = await dbQuery(
      "SELECT user_id FROM artists WHERE name = ?",
      [track.artist_name]
    ) as { user_id: string }[];
    const ownsTrack = artistRow.length > 0 && artistRow[0].user_id === session.userId;

    if (!ownsTrack && session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Remove URL from gallery_images
    const existing = await dbQuery(
      "SELECT gallery_images FROM tracks WHERE id = ?",
      [trackId]
    ) as { gallery_images: string | null }[];

    let galleryImages: Array<string | Record<string, unknown>> = [];
    if (existing.length > 0 && existing[0].gallery_images) {
      try {
        const parsed = JSON.parse(existing[0].gallery_images);
        if (Array.isArray(parsed)) {
          galleryImages = parsed.filter(
            (item: unknown) =>
              typeof item === "string" ||
              (typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).url === "string")
          );
        }
      } catch {
        galleryImages = [];
      }
    }

    const filteredImages = galleryImages.filter((img) =>
      typeof img === "string" ? img !== imageUrl : img.url !== imageUrl
    );

    await dbRun(
      "UPDATE tracks SET gallery_images = ? WHERE id = ?",
      [JSON.stringify(filteredImages), trackId]
    );

    // Delete from Blob storage (best-effort)
    await deleteImage(imageUrl);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/upload/image DELETE] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? `Error al eliminar la imagen: ${error.message}` : "Error al eliminar la imagen" },
      { status: 500 }
    );
  }
}
