import { NextRequest, NextResponse } from "next/server";
import type { InValue } from "@libsql/client";
import { bustSelectCache, getLocalDb, getTursoClientSync } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function validateAdminSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session || session.role !== "admin") return null;
  return { userId: session.userId, role: session.role };
}

// Ver `app/api/admin/releases/route.ts` para por qué se ramifica sobre el cliente
// y no sobre `isTursoConfigured()`. Resumen: `getTursoClientSync()` es nulo si y
// solo si `isTursoEnabled()` es falso, los dos leen `process.env` en tiempo de
// llamada, y antes el cliente se construía con `TURSO_URL`/`TURSO_TOKEN`
// congelados en el scope del módulo.
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
