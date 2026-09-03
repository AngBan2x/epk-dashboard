import { NextResponse } from "next/server";
import { getAllArtists } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/artists — Listar todos los artistas (público)
export async function GET() {
  try {
    const artists = await getAllArtists();
    return NextResponse.json({ artists }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Surrogate-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("[API/artists] Error GET:", error);
    return NextResponse.json({ error: "Error al obtener artistas" }, { status: 500 });
  }
}
