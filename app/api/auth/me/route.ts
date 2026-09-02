import { NextRequest, NextResponse } from "next/server";
import { getUserById, deleteUser } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get("auth_session");
    if (!sessionCookie) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    let session: { userId: string } | null = null;
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

    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const { password_hash, ...userWithoutPassword } = user;
    return NextResponse.json(userWithoutPassword, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("[API/auth/me] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener usuario" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get("auth_session");
    if (!sessionCookie) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    let session: { userId: string } | null = null;
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

    // Delete user and related data
    await deleteUser(session.userId);

    // Clear session cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set("auth_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[API/auth/me] DELETE Error:", error);
    return NextResponse.json(
      { error: "Error al eliminar usuario" },
      { status: 500 }
    );
  }
}