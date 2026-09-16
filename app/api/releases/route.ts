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
            `INSERT INTO tracks (id, title, artist_name, release_type, release_date, cover_image, duration, isrc, youtube_video_id, release_id, start_time, end_time, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'))`,
            [
              trackId,
              track.title,
              artist_name || "",
              type || "single",
              release_date || "",
              cover_image || "",
              track.duration || "",
              track.isrc || "",
              youtubeVideoId || null,
              id,  // release_id = parent release id
              track.start_time || 0,
              track.end_time || 0,
            ]
          );
        }
      }

      // For single-track releases, copy duration from child to parent
      if (tracks.length === 1 && tracks[0].duration) {
        await dbRun("UPDATE tracks SET duration = ? WHERE id = ?", [tracks[0].duration, id]);
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

    // Check ownership: tracks use artist_name, verify via artists table
    const existing = await dbQuery("SELECT artist_name FROM tracks WHERE id = ?", [id]) as { artist_name: string }[];
    if (!existing.length) {
      return NextResponse.json({ error: "Release no encontrado" }, { status: 404 });
    }
    const artistRow = await dbQuery("SELECT user_id FROM artists WHERE name = ?", [existing[0].artist_name]) as { user_id: string }[];
    const ownsTrack = artistRow.length > 0 && artistRow[0].user_id === session.userId;
    if (!ownsTrack && session.role !== "admin") {
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

    const ALLOWED_COLUMNS = new Set([
      "title", "artist_name", "release_date", "cover_image", "release_type",
      "genre", "description", "duration", "youtube_video_id", "external_links",
      "status", "spotify_url", "audio_preview_url", "itunes_track_id",
      "stems_urls", "video_embed_url", "gallery_images", "disc_number",
      "is_double_single", "sides_b", "isrc", "composers", "is_instrumental",
      "streams", "metrics", "production_details", "lyrics",
    ]);

    const safeKeys = Object.keys(updates).filter((k) => ALLOWED_COLUMNS.has(k));
    if (safeKeys.length === 0) {
      return NextResponse.json({ error: "Sin campos válidos para actualizar" }, { status: 400 });
    }

    const fields = safeKeys.map((key) => `${key} = ?`).join(", ");
    const values = safeKeys.map((key) => updates[key]);

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

    // Check ownership: tracks use artist_name, verify via artists table
    const existing = await dbQuery("SELECT artist_name FROM tracks WHERE id = ?", [id]) as { artist_name: string }[];
    if (!existing.length) {
      return NextResponse.json({ error: "Release no encontrado" }, { status: 404 });
    }
    const artistRow = await dbQuery("SELECT user_id FROM artists WHERE name = ?", [existing[0].artist_name]) as { user_id: string }[];
    const ownsTrack = artistRow.length > 0 && artistRow[0].user_id === session.userId;
    if (!ownsTrack && session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await dbRun("DELETE FROM tracks WHERE id = ?", [id]);
    return NextResponse.json({ message: "Release eliminado" });
  } catch (error) {
    console.error("DELETE releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
