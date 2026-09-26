import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateShow } from "@/lib/db";
import { authorizeShowTransition } from "@/lib/show-transitions";

export const dynamic = "force-dynamic";

const CancelShowSchema = z.object({
  reason: z.string().min(10, "El motivo debe tener al menos 10 caracteres"),
  refund_note: z.string().max(500, "La nota de reembolso no puede superar 500 caracteres").optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authorizeShowTransition(req, params.id);
    if (!auth.ok) return auth.response;
    const { show } = auth;

    const body = await req.json();
    const validated = CancelShowSchema.parse(body);

    const updated = await updateShow(show.id, {
      status: "cancelado",
      postponement_reason: validated.reason,
    });
    if (!updated) {
      return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST cancel show error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
