import { NextRequest, NextResponse } from "next/server";
import { markAllNotificationsAsRead } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = validateRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }

    await markAllNotificationsAsRead(session.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST notifications read-all error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}