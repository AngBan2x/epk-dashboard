import { NextResponse } from "next/server";
import { getAllArtists } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/artists — Listar todos los artistas (público)
export async function GET() {
  try {
    const artists = await getAllArtists();
    return NextResponse.json({ artists });
  } catch (error) {
    console.error("[API/artists] Error GET:", error);
    return NextResponse.json({ error: "Error al obtener artistas" }, { status: 500 });
  }
}
