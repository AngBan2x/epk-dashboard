import { NextRequest, NextResponse } from "next/server";
import { markAllNotificationsAsRead } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }

    markAllNotificationsAsRead(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST notifications read-all error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}