import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

function validateSession(req: NextRequest): { userId: string; role: string } | null {
  const sessionCookie = req.cookies.get("auth_session");
  if (!sessionCookie) return null;
  try {
    const decoded = atob(sessionCookie.value);
    const session = JSON.parse(decoded) as { userId: string; role?: string };
    return { userId: session.userId, role: session.role || "artist" };
  } catch {
    return null;
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { getDbWrite } = await import("@/lib/db");
    const db = getDbWrite();

    // Update email
    if (body.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return NextResponse.json({ error: "Email inválido" }, { status: 400 });
      }

      // Check if email already exists
      const existing = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(body.email, session.userId) as any;
      if (existing) {
        return NextResponse.json({ error: "Este email ya está en uso" }, { status: 400 });
      }

      db.prepare("UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?").run(body.email, session.userId);

      return NextResponse.json({ success: true, message: "Email actualizado" });
    }

    // Update password
    if (body.currentPassword && body.newPassword) {
      const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(session.userId) as any;

      if (!user) {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
      }

      const validPassword = await bcrypt.compare(body.currentPassword, user.password_hash);
      if (!validPassword) {
        return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 400 });
      }

      const hashedPassword = await bcrypt.hash(body.newPassword, 10);
      db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hashedPassword, session.userId);

      return NextResponse.json({ success: true, message: "Contraseña actualizada" });
    }

    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  } catch (error) {
    console.error("PATCH user settings error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.password) {
      return NextResponse.json({ error: "Contraseña requerida" }, { status: 400 });
    }

    const { getDbWrite } = await import("@/lib/db");
    const db = getDbWrite();

    const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(session.userId) as any;

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const validPassword = await bcrypt.compare(body.password, user.password_hash);
    if (!validPassword) {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 400 });
    }

    // 30-day grace period: set deleted_at instead of actually deleting
    db.prepare("UPDATE users SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(session.userId);

    return NextResponse.json({ success: true, message: "Cuenta marcada para eliminación (30 días de gracia)" });
  } catch (error) {
    console.error("DELETE user settings error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
