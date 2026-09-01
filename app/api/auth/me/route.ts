import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get("auth_session");
    if (!sessionCookie) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    let session: { userId: string; exp: number } | null = null;
    try {
      const decoded = atob(sessionCookie.value);
      session = JSON.parse(decoded);
    } catch {
      return NextResponse.json(
        { error: "Sesión inválida" },
        { status: 401 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: "Sesión inválida" },
        { status: 401 }
      );
    }

    // Verificar expiración
    if (session.exp < Date.now()) {
      return NextResponse.json(
        { error: "Sesión expirada" },
        { status: 401 }
      );
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const { password_hash, ...userWithoutPassword } = user;
    return NextResponse.json(userWithoutPassword);
  } catch (error) {
    console.error("[API/auth/me] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener usuario" },
      { status: 500 }
    );
  }
}