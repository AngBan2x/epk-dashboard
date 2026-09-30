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

/**
 * UNA sola fuente de verdad: `getTursoClientSync()` devuelve `null` SI Y SOLO SI
 * `isTursoEnabled()` es falso (los dos leen `process.env` en tiempo de llamada),
 * así que ramificar sobre `client !== null` hace imposible la discrepancia que
 * antes existía entre `isTursoConfigured()` —que elegía la rama— y el cliente que
 * ejecutaba, y además convierte el fallback local en algo incondicional en vez de
 * depender de que un flag esté de acuerdo.
 *
 * Antes además leía `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` en el scope del
 * módulo (`process.env` congelado al importar el bundle), con lo que un env
 * cargado tarde caía en la rama local de una ruta de escritura.
 *
 * `getLocalDb()` es de solo lectura; `getLocalDbWrite()` solo se alcanza cuando no
 * hay Turso, que es el único caso en que tiene sentido escribir en el archivo
 * local. Nunca se abre en producción porque la rama de Turso devuelve antes.
 */
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

    const notification = {
      artistNotified: false,
      artistFound: false,
      subscribersNotified: 0,
      reason: null as string | null,
    };

    if (status !== oldStatus && (status === "approved" || status === "rejected" || status === "revision")) {
      // Find the artist user
      const artist = (await dbQuery("SELECT * FROM artists WHERE name = ?", [release.artist_name])) as Array<Record<string, unknown>>;
      notification.artistFound = artist.length > 0;
      if (artist.length > 0 && artist[0].user_id) {
        const userId = String(artist[0].user_id);
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

        const decision = await notifyApprovalDecision({
          userId,
          type,
          title,
          message,
          data: { releaseId: id, trackTitle: release.title, artistName: release.artist_name },
          context: "release",
          adminNotes: admin_notes ?? undefined,
        });
        notification.artistNotified = decision.notificationCreated;
        notification.reason = decision.reason ?? null;
      } else if (artist.length > 0) {
        notification.reason = "El artista no tiene una cuenta vinculada (artists.user_id vacío): no se le pudo avisar.";
      }

      if (status === "approved" && artist.length > 0) {
        const artistName = String(artist[0].name ?? release.artist_name ?? "");
        const title = "Nuevo release publicado";
        const message = `"${release.title}" de ${artistName} ya está disponible en PressPlay.`;

        const fanout = await notifyArtistSubscribers({
          artistId: String(artist[0].id),
          kind: "release",
          title,
          message,
          data: {
            releaseId: id,
            track_id: id,
            trackTitle: release.title,
            artistName,
            dashboardUrl: "/releases",
          },
          emailType: "new_release",
          emailData: {
            trackTitle: release.title,
            artistName,
            dashboardUrl: `/releases/${id}`,
          },
        });
        notification.subscribersNotified = fanout.notified;
      }
    }

    return NextResponse.json({ message: "Estado actualizado", status, notification });
  } catch (error) {
    console.error("PUT admin releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
