import { NextRequest, NextResponse } from "next/server";
import type { InValue } from "@libsql/client";
import {
  bustSelectCache,
  getLocalDb,
  getLocalDbWrite,
  getTursoClientSync,
} from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { notifyApprovalDecision } from "@/lib/approval-notifications";
import { notifyArtistSubscribers } from "@/lib/subscriber-notifications";

export const dynamic = "force-dynamic";

async function validateAdminSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session || session.role !== "admin") return null;
  return { userId: session.userId, role: session.role };
}

// Ver `app/api/admin/releases/route.ts` para por qué se ramifica sobre el cliente
// y no sobre `isTursoConfigured()`. Esta ruta era la más expuesta de las tres: el
// PATCH decide `approved` y dispara el fan-out a suscriptores, así que caer en la
// réplica local en producción approved un show y avisaba por email sin cambiar
// nada en Turso. `getLocalDbWrite()` solo se alcanza sin Turso, que es el único
// caso en que escribir en el archivo local tiene sentido.
async function dbQuery(sql: string, params?: unknown[]): Promise<unknown[]> {
  const client = getTursoClientSync();
  if (client) {
    const result = await client.execute({
      sql: bustSelectCache(sql),
      args: (params ?? []) as InValue[],
    });
    return result.rows as unknown[];
  }
  const stmt = getLocalDb().prepare(sql);
  return params ? stmt.all(...params) : stmt.all();
}

async function dbRun(sql: string, params?: unknown[]): Promise<void> {
  const client = getTursoClientSync();
  if (client) {
    await client.execute({ sql, args: (params ?? []) as InValue[] });
    return;
  }
  const stmt = getLocalDbWrite().prepare(sql);
  stmt.run(...(params ?? []));
}

// PATCH: Approve or reject a show (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await validateAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autorizado - Se requiere rol de admin" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { approved, admin_notes, action, reason } = body;

    const notes =
      typeof admin_notes === "string" && admin_notes.trim()
        ? admin_notes.trim()
        : typeof reason === "string" && reason.trim()
          ? reason.trim()
          : undefined;

    const validActions = ["approve", "reject", "revision"];
    let resolvedAction: "approve" | "reject" | "revision";
    let nextApproved: boolean;

    if (action !== undefined && action !== null) {
      if (typeof action !== "string" || !validActions.includes(action)) {
        return NextResponse.json({ error: "action debe ser approve, reject o revision" }, { status: 400 });
      }
      resolvedAction = action as "approve" | "reject" | "revision";
      nextApproved = resolvedAction === "approve";
    } else if (typeof approved === "boolean") {
      resolvedAction = approved ? "approve" : "reject";
      nextApproved = approved;
    } else {
      return NextResponse.json(
        { error: "Envía approved (boolean) o action (approve | reject | revision)" },
        { status: 400 }
      );
    }

    if (resolvedAction !== "approve" && (!notes || notes.length < 10)) {
      return NextResponse.json(
        { error: "El motivo debe tener al menos 10 caracteres" },
        { status: 400 }
      );
    }

    // Check if show exists
    const existing = await dbQuery("SELECT * FROM shows WHERE id = ?", [id]) as any[];
    if (!existing.length) {
      return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
    }

    const show = existing[0];
    const wasApproved = Number(show.approved) === 1;
    const now = new Date().toISOString();

    // Update approved status
    await dbRun(
      "UPDATE shows SET approved = ?, updated_at = ? WHERE id = ?",
      [nextApproved ? 1 : 0, now, id]
    );

    const notification = {
      artistNotified: false,
      artistFound: false,
      subscribersNotified: 0,
      reason: null as string | null,
    };

    if (show.artist_id) {
      const artists = (await dbQuery("SELECT * FROM artists WHERE id = ?", [show.artist_id])) as Array<Record<string, unknown>>;
      notification.artistFound = artists.length > 0;
      if (artists.length > 0 && artists[0].user_id) {
        const userId = String(artists[0].user_id);
        const data = { showId: id, trackTitle: show.venue_name, artistName: String(artists[0].name), showVenue: show.venue_name, showDate: show.date };

        if (resolvedAction === "revision") {
          const decision = await notifyApprovalDecision({
            userId,
            type: "revision_requested",
            title: "Tu show necesita cambios",
            message: `El show "${show.venue_name}" necesita cambios antes de ser aprobado. Motivo: ${notes}`,
            data,
            context: "show",
            adminNotes: notes,
          });
          notification.artistNotified = decision.notificationCreated;
          notification.reason = decision.reason ?? null;
        } else if (nextApproved !== wasApproved) {
          const type = nextApproved ? "submission_approved" : "submission_rejected";
          const title = nextApproved ? "¡Tu show ha sido aprobado!" : "Tu show no fue aprobado";
          const message = nextApproved
            ? `"${show.venue_name}" el ${show.date || "sin fecha"} ya está visible en tu perfil.`
            : `El show "${show.venue_name}" no fue aprobado. ${notes ? `Razón: ${notes}` : "Puedes editarlo y volver a enviarlo."}`;

          const decision = await notifyApprovalDecision({
            userId,
            type,
            title,
            message,
            data,
            context: "show",
            adminNotes: notes,
          });
          notification.artistNotified = decision.notificationCreated;
          notification.reason = decision.reason ?? null;
        }
      } else if (artists.length > 0) {
        notification.reason =
          "El artista no tiene una cuenta vinculada (artists.user_id vacío): no se le pudo avisar.";
      }

      if (resolvedAction === "approve" && nextApproved && !wasApproved) {
        const artistName = artists.length > 0 ? String(artists[0].name ?? "") : "";
        const title = "Nuevo show publicado";
        const message = `El show "${show.venue_name}" de ${artistName}${show.date ? ` el ${show.date}` : ""} ya es público en PressPlay.`;
        const subscriberData = {
          show_id: id,
          showId: id,
          venue_name: show.venue_name,
          showVenue: show.venue_name,
          showDate: show.date,
          artistName,
          artistId: show.artist_id,
          dashboardUrl: "/shows",
        };

        const fanout = await notifyArtistSubscribers({
          artistId: show.artist_id,
          kind: "show",
          title,
          message,
          data: subscriberData,
          emailType: "new_show",
          emailData: {
            showVenue: show.venue_name,
            showDate: show.date ?? undefined,
            artistName,
            dashboardUrl: "/shows",
          },
        });
        notification.subscribersNotified = fanout.notified;
      }
    }

    return NextResponse.json({
      message: resolvedAction === "revision"
        ? "Revisión solicitada"
        : nextApproved
          ? "Show aprobado"
          : "Show rechazado",
      approved: nextApproved,
      action: resolvedAction,
      notification,
    });
  } catch (error) {
    console.error("PATCH admin shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// DELETE: Delete a show (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await validateAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autorizado - Se requiere rol de admin" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await dbQuery("SELECT * FROM shows WHERE id = ?", [id]) as any[];
    if (!existing.length) {
      return NextResponse.json({ error: "Show no encontrado" }, { status: 404 });
    }

    await dbRun("DELETE FROM shows WHERE id = ?", [id]);

    return NextResponse.json({ message: "Show eliminado" });
  } catch (error) {
    console.error("DELETE admin shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
