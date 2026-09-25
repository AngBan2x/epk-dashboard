import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getNotificationById, setNotificationRead } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

const UpdateNotificationSchema = z.object({
  read: z.boolean({
    required_error: "read requerido",
    invalid_type_error: "read debe ser booleano",
  }),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await validateRequest(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const existing = await getNotificationById(params.id);
    if (!existing || existing.user_id !== session.userId) {
      return NextResponse.json({ error: "Notificación no encontrada" }, { status: 404 });
    }

    const body = await req.json();
    const validated = UpdateNotificationSchema.parse(body);

    const updated = await setNotificationRead(existing.id, validated.read);
    if (!updated) {
      return NextResponse.json({ error: "Notificación no encontrada" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
    }
    console.error("PATCH notification error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
