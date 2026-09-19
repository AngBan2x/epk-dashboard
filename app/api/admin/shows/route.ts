import { NextRequest, NextResponse } from "next/server";
import { getDbWrite, isTursoConfigured } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

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

// GET: List shows pending approval (admin only)
export async function GET(req: NextRequest) {
  try {
    const session = await validateAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autorizado - Se requiere rol de admin" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const pending = searchParams.get("pending");

    let query = `
      SELECT s.*, a.name as artist_name
      FROM shows s
      LEFT JOIN artists a ON s.artist_id = a.id
    `;
    const params: (string | number)[] = [];

    if (pending === "1") {
      query += " WHERE s.approved = 0";
    }

    query += " ORDER BY s.created_at DESC";

    const shows = await dbQuery(query, params);

    return NextResponse.json({ shows });
  } catch (error) {
    console.error("GET admin shows error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
