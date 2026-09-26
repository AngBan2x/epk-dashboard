import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getArtistById, updateShow } from "@/lib/db";
import { authorizeShowTransition } from "@/lib/show-transitions";
import { notifyArtistOwner, notifyArtistSubscribers } from "@/lib/subscriber-notifications";

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

    const artist = await getArtistById(updated.artist_id);
    const refundNote = validated.refund_note?.trim();
    const refundPart = refundNote ? ` Aviso de reembolso: ${refundNote}` : "";
    const title = "Show cancelado";
    const message = `El show "${updated.venue_name}" fue cancelado. Motivo: ${validated.reason}.${refundPart}`;
    const data = {
      show_id: updated.id,
      showId: updated.id,
      venue_name: updated.venue_name,
      showVenue: updated.venue_name,
      showDate: updated.date,
      artistName: artist?.name ?? "",
      reason: validated.reason,
      refund_note: refundNote ?? "",
      dashboardUrl: "/shows",
    };
    const emailData = {
      showVenue: updated.venue_name,
      showDate: updated.date ?? undefined,
      reason: validated.reason,
      refundNote: refundNote ?? undefined,
      artistName: artist?.name ?? "",
      dashboardUrl: "/shows",
    };

    await notifyArtistSubscribers({
      artistId: updated.artist_id,
      kind: "show_update",
      title,
      message,
      data,
      emailType: "show_cancelled",
      emailData,
    });
    await notifyArtistOwner({
      artistId: updated.artist_id,
      title,
      message,
      data,
      emailType: "show_cancelled",
      emailData,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST cancel show error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
