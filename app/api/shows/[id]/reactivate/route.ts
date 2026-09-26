import { NextRequest, NextResponse } from "next/server";
import { getArtistById, updateShow } from "@/lib/db";
import { showStatusLabel } from "@/lib/show-status";
import { authorizeShowTransition, hasFutureDate } from "@/lib/show-transitions";
import { notifyArtistOwner, notifyArtistSubscribers } from "@/lib/subscriber-notifications";
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

    const artist = await getArtistById(updated.artist_id);
    const statusLabel = showStatusLabel(updated.status);
    const title = "Show reactivado";
    const message = `El show "${updated.venue_name}" fue reactivado y está ${statusLabel}${updated.date ? ` el ${updated.date}` : ""}.`;
    const data = {
      show_id: updated.id,
      showId: updated.id,
      venue_name: updated.venue_name,
      showVenue: updated.venue_name,
      showDate: updated.date,
      artistName: artist?.name ?? "",
      status: updated.status,
      statusLabel,
      dashboardUrl: "/shows",
    };
    const emailData = {
      showVenue: updated.venue_name,
      showDate: updated.date ?? undefined,
      artistName: artist?.name ?? "",
      dashboardUrl: "/shows",
    };

    await notifyArtistSubscribers({
      artistId: updated.artist_id,
      kind: "show_update",
      title,
      message,
      data,
      emailType: "show_reactivated",
      emailData,
    });
    await notifyArtistOwner({
      artistId: updated.artist_id,
      title,
      message,
      data,
      emailType: "show_reactivated",
      emailData,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("POST reactivate show error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
