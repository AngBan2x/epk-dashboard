import { NextRequest, NextResponse } from "next/server";
import { syncLocalToTurso, ensureTursoSchema, isTursoConfigured } from "@/lib/turso";
import { getAllTracks } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(request: NextRequest) {
  try {
    if (!isTursoConfigured()) {
      return NextResponse.json(
        { status: "error", message: "Turso no configurado. Configure TURSO_DATABASE_URL y TURSO_AUTH_TOKEN." },
        { status: 503 }
      );
    }

    const schemaReady = await ensureTursoSchema();
    if (!schemaReady) {
      return NextResponse.json(
        { status: "error", message: "Error creando esquema en Turso" },
        { status: 500 }
      );
    }

    const tracks = getAllTracks();
    const localTracks = tracks.map((track) => ({
      id: track.id,
      title: track.title,
      release_type: track.release_type,
      release_date: track.release_date,
      duration: track.duration,
      cover_image: track.cover_image,
      audio_preview_url: track.audio_preview_url,
      spotify_url: track.spotify_url,
      youtube_video_id: track.youtube_video_id,
      metrics: JSON.stringify(track.metrics),
      production_details: JSON.stringify(track.production_details),
      lyrics: track.lyrics,
    }));

    const result = await syncLocalToTurso(localTracks);

    return NextResponse.json({
      status: "ok",
      message: `Sincronización completada: ${result.synced} tracks sincronizados, ${result.failed} fallidos`,
      synced: result.synced,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Error en sync:", error);
    return NextResponse.json(
      { status: "error", message: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Endpoint de sincronización con Turso. Use POST para sincronizar.",
    usage: "POST /api/sync",
  });
}