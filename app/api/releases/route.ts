import { NextRequest, NextResponse } from "next/server";
import { getDbWrite, isTursoConfigured } from "@/lib/db";
import { getTursoClient } from "@/lib/turso";
import { decodeSessionToken, isSessionValid } from "@/lib/auth";

export const dynamic = "force-dynamic";

function validateSession(req: NextRequest): { userId: string; role: string } | null {
  const sessionCookie = req.cookies.get("auth_session");
  if (!sessionCookie) return null;
  const session = decodeSessionToken(sessionCookie.value);
  if (!session || !isSessionValid(session)) return null;
  return { userId: session.userId, role: session.role };
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    const id = searchParams.get("id");

    if (id) {
      let query = "SELECT * FROM tracks WHERE id = ?";
      const params = [id];
      if (userId) {
        query += " AND artist_id = ?";
        params.push(userId);
      }
      const releases = await dbQuery(query, params);
      return NextResponse.json(releases[0] || null);
    }

    let query = "SELECT * FROM tracks WHERE 1=1";
    const params: string[] = [];

    if (userId) {
      query += " AND artist_id = ?";
      params.push(userId);
    }

    query += " ORDER BY created_at DESC";

    const releases = await dbQuery(query, params);
    return NextResponse.json(releases);
  } catch (error) {
    console.error("GET releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();

    const id = crypto.randomUUID();
    const {
      title,
      artist_name,
      release_date,
      cover_image,
      type,
      external_links,
      tracks,
      genre,
      description,
      duration,
    } = body;

    const youtubeVideoId = external_links?.youtube_video_id;

    await dbRun(
      `INSERT INTO tracks (id, title, artist_name, release_type, release_date, cover_image, genre, description, duration, youtube_video_id, external_links, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, title, artist_name || "", type || "single", release_date || "", cover_image || "", genre || "", description || "", duration || "", youtubeVideoId || "", JSON.stringify(external_links || {}), "draft"]
    );

    // Insert tracks if provided
    if (tracks && Array.isArray(tracks)) {
      for (const track of tracks) {
        if (track.title) {
          const trackId = crypto.randomUUID();
          await dbRun(
            `INSERT INTO tracks (id, title, artist_name, release_type, release_date, cover_image, duration, isrc, youtube_video_id, external_links, artist_name, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [trackId, track.title, artist_name || "", type || "single", release_date || "", cover_image || "", track.duration || "", track.isrc || "", null, JSON.stringify({}), artist_name || ""]
          );
        }
      }
    }

    return NextResponse.json({ id, message: "Release creado exitosamente" }, { status: 201 });
  } catch (error) {
    console.error("POST releases error:", error);
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
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    // Check ownership
    const existing = await dbQuery("SELECT artist_id FROM tracks WHERE id = ?", [id]) as { artist_id: string }[];
    if (!existing.length) {
      return NextResponse.json({ error: "Release no encontrado" }, { status: 404 });
    }
    if (existing[0].artist_id !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Handle youtube_video_id from external_links
    if (updates.external_links && updates.external_links.youtube_video_id) {
      updates.youtube_video_id = updates.external_links.youtube_video_id;
    }

    // Handle external_links JSON stringify
    if (updates.external_links) {
      updates.external_links = JSON.stringify(updates.external_links);
    }

    const fields = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = Object.values(updates);

    await dbRun(`UPDATE tracks SET ${fields} WHERE id = ?`, [...values, id]);
    return NextResponse.json({ message: "Release actualizado" });
  } catch (error) {
    console.error("PUT releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    // Check ownership
    const existing = await dbQuery("SELECT artist_id FROM tracks WHERE id = ?", [id]) as { artist_id: string }[];
    if (!existing.length) {
      return NextResponse.json({ error: "Release no encontrado" }, { status: 404 });
    }
    if (existing[0].artist_id !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await dbRun("DELETE FROM tracks WHERE id = ?", [id]);
    return NextResponse.json({ message: "Release eliminado" });
  } catch (error) {
    console.error("DELETE releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
