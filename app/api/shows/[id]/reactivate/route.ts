import { NextRequest, NextResponse } from "next/server";
import { updateShow } from "@/lib/db";
import { showStatusLabel } from "@/lib/show-status";
import { authorizeShowTransition, hasFutureDate } from "@/lib/show-transitions";
import type { ShowStatus } from "@/types/music";

export const dynamic = "force-dynamic";

const REACTIVABLE_STATUSES = ["cancelado", "pospuesto", "suspendido"];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authorizeShowTransition(req, params.id);
    if (!auth.ok) return auth.response;
    const { show } = auth;

    if (!REACTIVABLE_STATUSES.includes(show.status)) {
      return NextResponse.json(
        { error: `Solo se puede reactivar un show en estado "Cancelado", "Pospuesto" o "Suspendido" (actual: "${showStatusLabel(show.status)}")` },
        { status: 409 }
      );
    }

    const nextStatus: ShowStatus = hasFutureDate(show.date) ? "confirmado" : "proximamente";

    const updated = await updateShow(show.id, {
      status: nextStatus,
      postponement_reason: null,
    });
    if (!updated) {
      return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("POST reactivate show error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
