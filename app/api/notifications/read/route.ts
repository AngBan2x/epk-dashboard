import { NextRequest, NextResponse } from "next/server";
import { markNotificationAsRead } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const updated = await markNotificationAsRead(id);
    if (!updated) {
      return NextResponse.json({ error: "Notificación no encontrada" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("POST notification read error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}