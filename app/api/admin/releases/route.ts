import { NextRequest, NextResponse } from "next/server";
import { getDbWrite, isTursoConfigured } from "@/lib/db";
import { getTursoClient } from "@/lib/turso";
import { decodeSessionToken, isSessionValid } from "@/lib/auth";

export const dynamic = "force-dynamic";

function validateAdminSession(req: NextRequest): { userId: string; role: string } | null {
  const sessionCookie = req.cookies.get("auth_session");
  if (!sessionCookie) return null;
  const session = decodeSessionToken(sessionCookie.value);
  if (!session || !isSessionValid(session)) return null;
  if (session.role !== "admin") return null;
  return { userId: session.userId, role: session.role };
}

async function dbQuery(sql: string, params?: unknown[]): Promise<unknown[]> {
  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (!client) throw new Error("Turso client not available");
    const result = await client.execute({ sql, args: (params ?? []) as any[] });
    return result.rows as unknown[];
  }
  const db = getDbWrite();
  const stmt = db.prepare(sql);
  return params ? stmt.all(...params) : stmt.all();
}

async function dbRun(sql: string, params?: unknown[]): Promise<void> {
  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (!client) throw new Error("Turso client not available");
    await client.execute({ sql, args: (params ?? []) as any[] });
    return;
  }
  const db = getDbWrite();
  const stmt = db.prepare(sql);
  stmt.run(...(params ?? []));
}

// GET: List all releases with artist info (admin only)
export async function GET(req: NextRequest) {
  try {
    const session = validateAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autorizado - Se requiere rol de admin" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let query = `
      SELECT t.*, a.name as artist_name, a.slug as artist_slug
      FROM tracks t
      LEFT JOIN artists a ON t.artist_name = a.name
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (status && status !== "all") {
      query += " AND t.status = ?";
      params.push(status);
    }

    query += " ORDER BY t.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const releases = await dbQuery(query, params);

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) as total FROM tracks WHERE 1=1";
    const countParams: (string | number)[] = [];
    if (status && status !== "all") {
      countQuery += " AND status = ?";
      countParams.push(status);
    }
    const countResult = await dbQuery(countQuery, countParams);
    const total = (countResult[0] as { total: number })?.total || 0;

    return NextResponse.json({
      releases,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET admin releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// PUT: Update release status (admin only)
export async function PUT(req: NextRequest) {
  try {
    const session = validateAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autorizado - Se requiere rol de admin" }, { status: 403 });
    }

    const body = await req.json();
    const { id, status, admin_notes } = body;

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    if (!status || !["draft", "pending", "approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Estado inválido. Debe ser: draft, pending, approved, rejected" }, { status: 400 });
    }

    // Check if release exists
    const existing = await dbQuery("SELECT * FROM tracks WHERE id = ?", [id]) as any[];
    if (!existing.length) {
      return NextResponse.json({ error: "Release no encontrado" }, { status: 404 });
    }

    const release = existing[0];
    const oldStatus = release.status || "draft";

    // Update status
    const now = new Date().toISOString();
    await dbRun(
      "UPDATE tracks SET status = ?, updated_at = ? WHERE id = ?",
      [status, now, id]
    );

    // Create notification for the artist if status changed to approved/rejected
    if (status !== oldStatus && (status === "approved" || status === "rejected")) {
      // Find the artist user
      const artist = await dbQuery("SELECT * FROM artists WHERE name = ?", [release.artist_name]) as any[];
      if (artist.length > 0 && artist[0].user_id) {
        const userId = artist[0].user_id;
        const notificationId = crypto.randomUUID();
        const type = status === "approved" ? "submission_approved" : "submission_rejected";
        const title = status === "approved" ? "¡Tu release ha sido aprobado!" : "Tu release no fue aprobado";
        const message = status === "approved"
          ? `"${release.title}" ya está disponible en el catálogo.`
          : `Razón: ${admin_notes || "No se especificó motivo."}`;

        await dbRun(
          `INSERT INTO notifications (id, user_id, type, title, message, data, read, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [notificationId, userId, type, title, message, JSON.stringify({ releaseId: id }), 0, now]
        );
      }
    }

    return NextResponse.json({ message: "Estado actualizado", status });
  } catch (error) {
    console.error("PUT admin releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}