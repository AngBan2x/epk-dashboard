import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserById, getAllUsers, isTursoEnabled, tursoExecUpdate, getLocalDbWrite } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

const RoleSchema = z.object({
  role: z.enum(["artist", "subscriber", "admin"]),
});

async function validateAdminSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session || session.role !== "admin") return null;
  return { userId: session.userId, role: session.role };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await validateAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const validated = RoleSchema.parse(body);

    const targetUser = await getUserById(params.id);
    if (!targetUser) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Prevent demoting the last admin
    if (targetUser.role === "admin" && validated.role !== "admin") {
      const allUsers = await getAllUsers();
      const adminCount = allUsers.filter((u) => u.role === "admin").length;
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "No se puede degradar al último administrador" },
          { status: 400 }
        );
      }
    }

    // Idempotent: if role is already the same, return success
    if (targetUser.role === validated.role) {
      return NextResponse.json({
        user: { ...targetUser, role: validated.role },
        reauthRequired: true,
        message: "El rol ya era el solicitado",
      });
    }

    // Update role in database
    if (isTursoEnabled()) {
      await tursoExecUpdate("UPDATE users SET role = ? WHERE id = ?", [validated.role, params.id]);
    } else {
      const db = getLocalDbWrite();
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(validated.role, params.id);
    }

    const updatedUser = await getUserById(params.id);

    return NextResponse.json({
      user: updatedUser,
      reauthRequired: true,
      message: "Rol actualizado. El usuario debe volver a iniciar sesión para que el cambio surta efecto.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("PATCH admin user role error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}