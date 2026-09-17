import { NextRequest, NextResponse } from "next/server";
import { markNotificationAsRead, getUserNotifications } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

function validateSession(req: NextRequest): { userId: string; role: string } | null {
  const session = validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "artist" };
}

export async function GET(req: NextRequest) {
  try {
    const session = validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const notifications = await getUserNotifications(session.userId);
    return NextResponse.json(notifications);
  } catch (error) {
    console.error("GET notifications error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

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