import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

function getDb() {
  return new Database(DB_PATH);
}

// GET /api/tracks — Listar todos los tracks
export async function GET() {
  try {
    const db = getDb();
    const tracks = db.prepare("SELECT * FROM tracks").all();
    db.close();
    return NextResponse.json(tracks);
  } catch (error) {
    console.error("[API/tracks] Error GET:", error);
    return NextResponse.json({ error: "Error al obtener tracks" }, { status: 500 });
  }
}

// POST /api/tracks — Crear un track nuevo
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      title,
      artist_name = "Artista EPK",
      release_type = "Single",
      release_date = "",
      duration = "00:00",
      cover_image = "",
      audio_preview_url = "",
      spotify_url = null,
      youtube_video_id = null,
      itunes_track_id = null,
      metrics = {},
      production_details = {},
      lyrics = null,
      stems_urls = null,
      video_embed_url = null,
      gallery_images = null,
    } = body;

    if (!id || !title) {
      return NextResponse.json({ error: "id y title son requeridos" }, { status: 400 });
    }

    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO tracks (
        id, title, artist_name, release_type, release_date, duration, cover_image,
        audio_preview_url, spotify_url, youtube_video_id, itunes_track_id,
        metrics, production_details, lyrics, stems_urls, video_embed_url, gallery_images
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title,
      artist_name,
      release_type,
      release_date,
      duration,
      cover_image,
      audio_preview_url,
      spotify_url,
      youtube_video_id,
      itunes_track_id,
      JSON.stringify(metrics),
      JSON.stringify(production_details),
      lyrics,
      stems_urls ? JSON.stringify(stems_urls) : null,
      video_embed_url,
      gallery_images ? JSON.stringify(gallery_images) : null
    );
    db.close();

    return NextResponse.json({ id, title, artist_name }, { status: 201 });
  } catch (error) {
    console.error("[API/tracks] Error POST:", error);
    return NextResponse.json({ error: "Error al crear track" }, { status: 500 });
  }
}

// PUT /api/tracks — Actualizar un track existente
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    const db = getDb();
    const existing = db.prepare("SELECT * FROM tracks WHERE id = ?").get(id);
    if (!existing) {
      db.close();
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    const fields = Object.keys(updates)
      .filter((k) => k !== "id")
      .map((k) => `${k} = ?`)
      .join(", ");
    const values = Object.keys(updates)
      .filter((k) => k !== "id")
      .map((k) => {
        const v = updates[k];
        if (typeof v === "object" && v !== null) return JSON.stringify(v);
        return v;
      });

    if (fields.length > 0) {
      db.prepare(`UPDATE tracks SET ${fields} WHERE id = ?`).run(...values, id);
    }
    db.close();

    return NextResponse.json({ id, ...updates });
  } catch (error) {
    console.error("[API/tracks] Error PUT:", error);
    return NextResponse.json({ error: "Error al actualizar track" }, { status: 500 });
  }
}

// DELETE /api/tracks?id=xxx — Eliminar un track
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
    db.close();

    if (result.changes === 0) {
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ deleted: id });
  } catch (error) {
    console.error("[API/tracks] Error DELETE:", error);
    return NextResponse.json({ error: "Error al eliminar track" }, { status: 500 });
  }
}
