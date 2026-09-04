import { NextRequest, NextResponse } from "next/server";
import { getDbWrite } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    const db = getDbWrite();

    let query = "SELECT * FROM tracks WHERE 1=1";
    const params: string[] = [];

    if (userId) {
      query += " AND artist_id = ?";
      params.push(userId);
    }

    query += " ORDER BY created_at DESC";

    const stmt = db.prepare(query);
    const releases = params.length > 0 ? stmt.all(...params) : stmt.all();

    return NextResponse.json(releases);
  } catch (error) {
    console.error("GET releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDbWrite();

    const id = crypto.randomUUID();
    const {
      title,
      artist_name,
      artist_id,
      release_date,
      genre,
      cover_image,
      description,
      type,
      tracks,
      external_links,
    } = body;

    const stmt = db.prepare(`
      INSERT INTO tracks (id, title, artist_name, artist_id, release_date, genre, cover_image, description, type, tracks_json, external_links, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `);

    stmt.run(
      id,
      title,
      artist_name || "",
      artist_id || "",
      release_date || "",
      genre || "",
      cover_image || "",
      description || "",
      type || "single",
      JSON.stringify(tracks || []),
      JSON.stringify(external_links || {})
    );

    return NextResponse.json({ id, message: "Release creado exitosamente" }, { status: 201 });
  } catch (error) {
    console.error("POST releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    const db = getDbWrite();

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const fields = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = Object.values(updates);

    const stmt = db.prepare(`UPDATE tracks SET ${fields} WHERE id = ?`);
    stmt.run(...values, id);

    return NextResponse.json({ message: "Release actualizado" });
  } catch (error) {
    console.error("PUT releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const db = getDbWrite();

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    db.prepare("DELETE FROM tracks WHERE id = ?").run(id);

    return NextResponse.json({ message: "Release eliminado" });
  } catch (error) {
    console.error("DELETE releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
