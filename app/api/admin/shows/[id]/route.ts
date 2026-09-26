import { NextRequest, NextResponse } from "next/server";
import { getDbWrite, isTursoConfigured } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { notifyApprovalDecision } from "@/lib/approval-notifications";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

export const dynamic = "force-dynamic";

async function validateAdminSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session || session.role !== "admin") return null;
  return { userId: session.userId, role: session.role };
}

function createFreshClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("@libsql/client");
  return createClient({ url: TURSO_URL!, authToken: TURSO_TOKEN! });
}

async function dbQuery(sql: string, params?: unknown[]): Promise<unknown[]> {
  if (isTursoConfigured()) {
    const client = createFreshClient();
    const bustSql = sql.trimStart().toUpperCase().startsWith("SELECT")
      ? `${sql} /*admin${Date.now()}*/`
      : sql;
    const result = await client.execute({ sql: bustSql, args: (params ?? []) as any[] });
    return result.rows as unknown[];
  }
  const db = getDbWrite();
  const stmt = db.prepare(sql);
  return params ? stmt.all(...params) : stmt.all();
}

async function dbRun(sql: string, params?: unknown[]): Promise<void> {
  if (isTursoConfigured()) {
    const client = createFreshClient();
    await client.execute({ sql, args: (params ?? []) as any[] });
    return;
  }
  const db = getDbWrite();
  const stmt = db.prepare(sql);
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

    if (resolvedAction === "revision" && (!notes || notes.length < 10)) {
      return NextResponse.json(
        { error: "El motivo de revisión debe tener al menos 10 caracteres" },
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

    if (show.artist_id) {
      const artists = await dbQuery("SELECT * FROM artists WHERE id = ?", [show.artist_id]) as any[];
      if (artists.length > 0 && artists[0].user_id) {
        const userId = artists[0].user_id;
        const data = { showId: id, trackTitle: show.venue_name, artistName: artists[0].name, showVenue: show.venue_name, showDate: show.date };

        if (resolvedAction === "revision") {
          await notifyApprovalDecision({
            userId,
            type: "revision_requested",
            title: "Tu show necesita cambios",
            message: `El show "${show.venue_name}" necesita cambios antes de ser aprobado. Motivo: ${notes}`,
            data,
            context: "show",
            adminNotes: notes,
          });
        } else if (nextApproved !== wasApproved) {
          const type = nextApproved ? "submission_approved" : "submission_rejected";
          const title = nextApproved ? "¡Tu show ha sido aprobado!" : "Tu show no fue aprobado";
          const message = nextApproved
            ? `"${show.venue_name}" el ${show.date || "sin fecha"} ya está visible en tu perfil.`
            : `El show "${show.venue_name}" no fue aprobado. ${notes ? `Razón: ${notes}` : "Puedes editarlo y volver a enviarlo."}`;

          await notifyApprovalDecision({
            userId,
            type,
            title,
            message,
            data,
            context: "show",
            adminNotes: notes,
          });
        }
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
