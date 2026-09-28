import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { validateRequest } from "@/lib/auth";
import {
  getUserById,
  getPasswordHash,
  isEmailTaken,
  updateUserEmail,
  updateUserPassword,
  softDeleteUser,
  getSoftDeletedUserByEmail,
  restoreUser,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;
const GRACE_DAYS = 30;

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "subscriber" };
}

export async function GET(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const { password_hash, ...safeUser } = user as unknown as Record<string, unknown>;
    void password_hash;
    return NextResponse.json(safeUser);
  } catch (error) {
    console.error("GET user settings error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = (await req.json()) as {
      email?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    if (typeof body.email === "string" && body.email.trim()) {
      const email = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Email inválido" }, { status: 400 });
      }
      if (await isEmailTaken(email, session.userId)) {
        return NextResponse.json({ error: "Este email ya está en uso" }, { status: 400 });
      }
      await updateUserEmail(session.userId, email);
      return NextResponse.json({ success: true, message: "Email actualizado" });
    }

    if (body.currentPassword && body.newPassword) {
      if (typeof body.newPassword !== "string" || body.newPassword.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json(
          { error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` },
          { status: 400 }
        );
      }

      const passwordHash = await getPasswordHash(session.userId);
      if (!passwordHash) {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
      }

      const validPassword = await bcrypt.compare(body.currentPassword, passwordHash);
      if (!validPassword) {
        return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 400 });
      }

      const hashed = await bcrypt.hash(body.newPassword, 10);
      await updateUserPassword(session.userId, hashed);
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
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = (await req.json()) as { password?: string };
    if (!body.password) {
      return NextResponse.json({ error: "Contraseña requerida" }, { status: 400 });
    }

    const passwordHash = await getPasswordHash(session.userId);
    if (!passwordHash) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const validPassword = await bcrypt.compare(body.password, passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 400 });
    }

    await softDeleteUser(session.userId);

    return NextResponse.json({
      success: true,
      message: `Cuenta suspendida con ${GRACE_DAYS} días de gracia`,
      graceDays: GRACE_DAYS,
      restore: true,
    });
  } catch (error) {
    console.error("DELETE user settings error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    const deleted = await getSoftDeletedUserByEmail(email);
    if (!deleted) {
      return NextResponse.json({ error: "No hay ninguna cuenta suspendida con ese email" }, { status: 404 });
    }

    const deletedAt = deleted.deleted_at ? new Date(deleted.deleted_at as unknown as string).getTime() : 0;
    const daysLeft = GRACE_DAYS - Math.floor((Date.now() - deletedAt) / (24 * 60 * 60 * 1000));
    if (daysLeft <= 0) {
      return NextResponse.json(
        { error: "El periodo de gracia ha terminado; la cuenta ya fue purgada" },
        { status: 410 }
      );
    }

    const passwordHash = deleted.password_hash;
    if (!passwordHash) {
      return NextResponse.json({ error: "Cuenta irrecuperable" }, { status: 410 });
    }
    if (!body.password || !(await bcrypt.compare(body.password, passwordHash))) {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
    }

    await restoreUser(deleted.id);
    return NextResponse.json({
      success: true,
      message: `Cuenta restaurada. Te quedaban ${daysLeft} días de gracia.`,
      daysLeft,
    });
  } catch (error) {
    console.error("PUT user settings (restore) error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
