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

// GET: List all releases with artist info (admin only)
export async function GET(req: NextRequest) {
  try {
    const session = await validateAdminSession(req);
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
      WHERE t.release_id IS NULL
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
    let countQuery = "SELECT COUNT(*) as total FROM tracks WHERE release_id IS NULL";
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
    const session = await validateAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autorizado - Se requiere rol de admin" }, { status: 403 });
    }

    const body = await req.json();
    const { id, status, admin_notes } = body;

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    if (!status || !["draft", "pending", "approved", "rejected", "revision"].includes(status)) {
      return NextResponse.json({ error: "Estado inválido. Debe ser: draft, pending, approved, rejected, revision" }, { status: 400 });
    }

    // Check if release exists
    const existing = await dbQuery("SELECT * FROM tracks WHERE id = ?", [id]) as any[];
    if (!existing.length) {
      return NextResponse.json({ error: "Release no encontrado" }, { status: 404 });
    }

    const release = existing[0];
    const oldStatus = release.status || "draft";

    const now = new Date().toISOString();
    await dbRun(
      "UPDATE tracks SET status = ?, admin_notes = ?, updated_at = ? WHERE id = ?",
      [status, admin_notes ?? null, now, id]
    );

    if (status !== oldStatus && (status === "approved" || status === "rejected" || status === "revision")) {
      // Find the artist user
      const artist = await dbQuery("SELECT * FROM artists WHERE name = ?", [release.artist_name]) as any[];
      if (artist.length > 0 && artist[0].user_id) {
        const userId = artist[0].user_id;
        let type: "submission_approved" | "submission_rejected" | "revision_requested";
        let title: string;
        let message: string;

        switch (status) {
          case "approved":
            type = "submission_approved";
            title = "¡Tu release ha sido aprobado!";
            message = `"${release.title}" ya está disponible en el catálogo.`;
            break;
          case "rejected":
            type = "submission_rejected";
            title = "Tu release no fue aprobado";
            message = `Razón: ${admin_notes || "No se especificó motivo."}`;
            break;
          case "revision":
            type = "revision_requested";
            title = "Tu release necesita cambios";
            message = admin_notes || "Por favor revisa y actualiza la información.";
            break;
          default:
            throw new Error(`Estado de revisión no soportado: ${status}`);
        }

        await notifyApprovalDecision({
          userId,
          type,
          title,
          message,
          data: { releaseId: id, trackTitle: release.title, artistName: release.artist_name },
          context: "release",
          adminNotes: admin_notes ?? undefined,
        });
      }
    }

    return NextResponse.json({ message: "Estado actualizado", status });
  } catch (error) {
    console.error("PUT admin releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
