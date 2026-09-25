import { NextRequest, NextResponse } from "next/server";
import { getDbWrite, isTursoConfigured } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { sendNotificationEmail } from "@/lib/email";

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
    const { approved } = body;

    if (typeof approved !== "boolean") {
      return NextResponse.json({ error: "approved debe ser un booleano" }, { status: 400 });
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
      [approved ? 1 : 0, now, id]
    );

    // Create notification for the artist
    if (approved !== wasApproved && show.artist_id) {
      const artists = await dbQuery("SELECT * FROM artists WHERE id = ?", [show.artist_id]) as any[];
      if (artists.length > 0 && artists[0].user_id) {
        const userId = artists[0].user_id;
        const notificationId = crypto.randomUUID();
        const type = approved ? "submission_approved" : "submission_rejected";
        const title = approved ? "¡Tu show ha sido aprobado!" : "Tu show no fue aprobado";
        const message = approved
          ? `"${show.venue_name}" el ${show.date || "sin fecha"} ya está visible en tu perfil.`
          : `El show "${show.venue_name}" no fue aprobado. Puedes editarlo y volver a enviarlo.`;

        await dbRun(
          `INSERT INTO notifications (id, user_id, type, title, message, data, read, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [notificationId, userId, type, title, message, JSON.stringify({ showId: id }), 0, now]
        );

        void sendNotificationEmail({
          userId,
          type: type as "submission_approved" | "submission_rejected",
          data: {
            userName: "",
            trackTitle: show.venue_name ?? "",
            artistName: artists[0].name ?? "",
            dashboardUrl: "/dashboard",
            context: "show",
            showVenue: show.venue_name ?? "",
            showDate: show.date ?? undefined,
          },
        });
      }
    }

    return NextResponse.json({
      message: approved ? "Show aprobado" : "Show rechazado",
      approved,
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
