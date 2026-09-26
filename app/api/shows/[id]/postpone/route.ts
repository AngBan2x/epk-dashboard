import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateShow } from "@/lib/db";
import { showStatusLabel } from "@/lib/show-status";
import { authorizeShowTransition, parseShowDate, startOfToday } from "@/lib/show-transitions";

export const dynamic = "force-dynamic";

const PostponeShowSchema = z.object({
  new_date: z.string().min(1, "new_date requerido"),
  reason: z.string().min(10, "El motivo debe tener al menos 10 caracteres"),
});

const BLOCKED_STATUSES = ["pasado", "cancelado", "suspendido"];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authorizeShowTransition(req, params.id);
    if (!auth.ok) return auth.response;
    const { show } = auth;

    const body = await req.json();
    const validated = PostponeShowSchema.parse(body);

    if (BLOCKED_STATUSES.includes(show.status)) {
      return NextResponse.json(
        { error: `No se puede posponer un show en estado "${showStatusLabel(show.status)}"` },
        { status: 409 }
      );
    }

    const newDate = parseShowDate(validated.new_date);
    if (!newDate) {
      return NextResponse.json(
        { error: "new_date debe tener un formato de fecha válido (YYYY-MM-DD)" },
        { status: 400 }
      );
    }
    if (newDate.getTime() <= startOfToday().getTime()) {
      return NextResponse.json(
        { error: "La nueva fecha debe ser posterior a hoy" },
        { status: 400 }
      );
    }

    const updated = await updateShow(show.id, {
      date: validated.new_date,
      status: "pospuesto",
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
    console.error("POST postpone show error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
