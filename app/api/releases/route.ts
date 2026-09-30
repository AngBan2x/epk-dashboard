import { NextRequest, NextResponse } from "next/server";
import type { InValue } from "@libsql/client";
import { z } from "zod";
import {
  bustSelectCache,
  getApprovedTrackById,
  getLocalDbWrite,
  getTursoClientSync,
  isArtistOwnerOfTrackName,
} from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { validateTrackNumber } from "@/lib/validations";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyApprovalDecision } from "@/lib/approval-notifications";
import { notifyArtistSubscribers } from "@/lib/subscriber-notifications";

const CreateReleaseSchema = z.object({
  title: z.string().min(1, "title requerido"),
  artist_name: z.string().min(1, "artist_name requerido"),
  release_date: z.string().optional(),
  cover_image: z.string().optional(),
  type: z.string().optional(),
  external_links: z.record(z.unknown()).optional(),
  tracks: z.array(z.object({ title: z.string(), duration: z.string().optional(), isrc: z.string().optional(), start_time: z.number().optional(), end_time: z.number().optional() })).optional(),
  genre: z.string().optional(),
  description: z.string().optional(),
  duration: z.string().optional(),
  status: z.enum(["draft", "pending"]).optional(),
});

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

// ── UNA sola fuente de verdad para la decisión Turso/local (GAP-B residual) ──
//
// Antes los helpers de esta ruta ramificaban con `isTursoConfigured()` de
// `@/lib/db` —que es alias de `isTursoEnabled()`, lee `process.env` en TIEMPO DE
// LLAMADA— y ejecutaban con `getTursoClient()` de `@/lib/turso` —que lee el env
// al IMPORTAR el módulo, `lib/turso.ts:31-32`. Con el env llegando después de esa
// primera evaluación, el caso normal en un bundle de Vercel, la primera decía
// "turso" y la segunda devolvía `null`: se lanzaba `"Turso client not
// available"` y la ruta respondía 500 en vez de degradar. Dos fuentes de verdad
// que no pueden coincidir, y una línea de `throw` en el hueco entre ellas.
//
// `getTursoClientSync() !== null` cierra el hueco: devuelve `null` si y solo si
// `isTursoEnabled()` es falso, y los dos leen `process.env` en tiempo de llamada.
// Es el mismo criterio que aplicaron E3 en `app/api/tracks/route.ts` y en las
// otras cinco rutas que aplanó.
//
// El handle local es `getLocalDbWrite()` y solo se abre cuando NO hay cliente:
// `getLocalDb()` es de solo lectura y esta ruta escribe (POST/PUT/DELETE), así
// que detrás de un cliente nunca se abre un `better-sqlite3` en un bundle de
// Vercel. Antes no existía este brazo —`getDbWrite()` era el que se llamaba, y
// la rama local no tenía forma de degradar—.
async function dbQuery(sql: string, params?: unknown[]): Promise<unknown[]> {
  const client = getTursoClientSync();
  if (client) {
    const result = await client.execute({
      sql: bustSelectCache(sql),
      args: (params ?? []) as InValue[],
    });
    return result.rows as unknown[];
  }
  const stmt = getLocalDbWrite().prepare(sql);
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

async function getArtistNamesByUserId(userId: string): Promise<string[]> {
  const rows = await dbQuery("SELECT name FROM artists WHERE user_id = ?", [userId]) as { name: string }[];
  return rows.map((row) => row.name).filter((name) => typeof name === "string" && name.length > 0);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    const id = searchParams.get("id");

    let artistNames: string[] | null = null;
    let publicOnly = false;
    if (userId) {
      artistNames = await getArtistNamesByUserId(userId);
      if (artistNames.length === 0) {
        return NextResponse.json(id ? null : []);
      }
      const session = await validateSession(req);
      publicOnly = !session || (session.role !== "admin" && session.userId !== userId);
    }
    const visibilityClause = publicOnly ? " AND status = 'approved'" : "";

    if (id) {
      if (artistNames) {
        // Camino `?id=X&user_id=Y`: el alcance ya está acotado por los nombres
        // de artista del usuario. Para el dueño o el admin sigue viendo todos
        // los estados; para el resto, solo `approved`. Se mantiene el `SELECT *`
        // porque aquí el llamante ya está autenticado y por rol o por
        // propiedad, y el formulario de edición necesita `description`/`genre`,
        // que no forman parte del tipo `Track`.
        let query = "SELECT * FROM tracks WHERE id = ?";
        const params: string[] = [id];
        query += ` AND artist_name IN (${artistNames.map(() => "?").join(", ")})${visibilityClause}`;
        params.push(...artistNames);
        const releases = await dbQuery(query, params);
        return NextResponse.json(releases[0] || null);
      }

      // Camino `?id=X` SIN `user_id`: este es público. Antes hacía
      // `SELECT * FROM tracks WHERE id = ?` a secas, lo que devolvía la fila
      // CRUDA: un `draft`/`pending`/`rejected` legible por cualquiera con el id
      // y la columna `tracks.admin_notes` —el motivo interno de rechazo del
      // admin— traveling en la respuesta porque `parseTrack` no la expone.
      //
      // Ahora: primero el lector de alcance público (aprobado + parseado). Solo
      // si no está aprobado se exige sesión, y entonces se comprueba rol de
      // admin o propiedad real contra `artists.user_id` (no un `user_id` de
      // query, que sería falsificable).
      const approved = await getApprovedTrackById(id);
      if (approved) return NextResponse.json(approved);

      const session = await validateSession(req);
      if (!session) return NextResponse.json(null);

      // `getTrackById` pasa por `parseTrack`, que NO expone `admin_notes`,
      // `description` ni `genre`. Para el dueño y el admin eso es una pérdida
      // real: el formulario de edición muestra el motivo del rechazo y
      // edita la descripción. Por eso el camino privilegiado devuelve la fila
      // cruda, igual que el camino `?id&user_id` de arriba, y el público es el
      // único que pasa por `parseTrack`.
      const privileged = await dbQuery("SELECT * FROM tracks WHERE id = ?", [id]) as Record<string, unknown>[];
      const row = privileged[0];
      if (!row) return NextResponse.json(null);

      if (session.role === "admin") return NextResponse.json(row);

      const owns = await isArtistOwnerOfTrackName(String(row.artist_name ?? ""), session.userId);
      if (owns) return NextResponse.json(row);

      return NextResponse.json(null);
    }

    let query = "SELECT * FROM tracks WHERE 1=1";
    const params: string[] = [];

    if (artistNames) {
      query += ` AND artist_name IN (${artistNames.map(() => "?").join(", ")})${visibilityClause}`;
      params.push(...artistNames);
    }

    query += " ORDER BY created_at DESC";

    const releases = await dbQuery(query, params);
    return NextResponse.json(releases);
  } catch (error) {
    console.error("GET releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (session.role !== "admin" && session.role !== "artist") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const blocked = enforceRateLimit(req, "releases", session.userId, 10);
    if (blocked) return blocked;

    const body = await req.json();

    const parsed = CreateReleaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    if (session.role === "artist") {
      const owner = await dbQuery("SELECT name FROM artists WHERE user_id = ?", [session.userId]) as { name: string }[];
      if (!owner.length || owner[0].name !== parsed.data.artist_name) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    const id = crypto.randomUUID();
    const {
      title,
      artist_name,
      release_date,
      cover_image,
      type,
      external_links,
      tracks,
      genre,
      description,
      duration,
      status,
    } = parsed.data;

    const youtubeVideoId = external_links?.youtube_video_id;

    const initialStatus = status || "draft";

    await dbRun(
      `INSERT INTO tracks (id, title, artist_name, release_type, release_date, cover_image, genre, description, duration, youtube_video_id, external_links, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, title, artist_name || "", type || "single", release_date || "", cover_image || "", genre || "", description || "", duration || "", youtubeVideoId || "", JSON.stringify(external_links || {}), initialStatus]
    );

    // Insert tracks if provided
    if (tracks && Array.isArray(tracks)) {
      for (const track of tracks) {
        if (track.title) {
          const trackId = crypto.randomUUID();
          await dbRun(
            `INSERT INTO tracks (id, title, artist_name, release_type, release_date, cover_image, duration, isrc, youtube_video_id, release_id, start_time, end_time, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'))`,
            [
              trackId,
              track.title,
              artist_name || "",
              type || "single",
              release_date || "",
              cover_image || "",
              track.duration || "",
              track.isrc || "",
              youtubeVideoId || null,
              id,  // release_id = parent release id
              track.start_time || 0,
              track.end_time || 0,
            ]
          );
        }
      }

      // For single-track releases, copy duration from child to parent
      if (tracks.length === 1 && tracks[0].duration) {
        await dbRun("UPDATE tracks SET duration = ? WHERE id = ?", [tracks[0].duration, id]);
      }
    }

    return NextResponse.json({ id, message: "Release creado exitosamente" }, { status: 201 });
  } catch (error) {
    console.error("POST releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { id, status, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const existing = await dbQuery("SELECT id, title, artist_name, status FROM tracks WHERE id = ?", [id]) as { id: string; title: string; artist_name: string; status?: string | null }[];
    if (!existing.length) {
      return NextResponse.json({ error: "Release no encontrado" }, { status: 404 });
    }
    const artistRow = await dbQuery("SELECT id, user_id FROM artists WHERE name = ?", [existing[0].artist_name]) as { id: string; user_id: string | null }[];
    const ownsTrack = artistRow.length > 0 && artistRow[0].user_id === session.userId;
    if (!ownsTrack && session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const previousStatus = existing[0].status ?? "draft";

    // Handle youtube_video_id from external_links
    if (updates.external_links && updates.external_links.youtube_video_id) {
      updates.youtube_video_id = updates.external_links.youtube_video_id;
    }

    // Handle external_links JSON stringify
    if (updates.external_links) {
      updates.external_links = JSON.stringify(updates.external_links);
    }

    if (status !== undefined) {
      if (["approved", "rejected", "revision"].includes(status)) {
        if (session.role !== "admin") {
          return NextResponse.json({ error: "No autorizado: solo un admin puede aprobar, rechazar o pedir revisión" }, { status: 403 });
        }
      } else if (!["draft", "pending"].includes(status)) {
        return NextResponse.json({ error: "Estado inválido. Debe ser: draft, pending, approved, rejected, revision" }, { status: 400 });
      }
    }

    const ALLOWED_COLUMNS = new Set([
      "title", "artist_name", "release_date", "cover_image", "release_type",
      "genre", "description", "duration", "youtube_video_id", "external_links",
      "status", "spotify_url", "audio_preview_url", "itunes_track_id",
      "stems_urls", "video_embed_url", "gallery_images", "disc_number",
      "is_double_single", "sides_b", "isrc", "composers", "is_instrumental",
      "streams", "metrics", "production_details", "lyrics",
      "start_time", "end_time", "track_number",
    ]);

    // M0: this PUT is a passthrough allowlist, so track_number needs a bound
    // before it reaches SQL. Anything not an integer >= 0 (or null) is a 400.
    if ("track_number" in updates) {
      const trackNumber = validateTrackNumber(updates.track_number);
      if (trackNumber === undefined) {
        return NextResponse.json(
          { error: "track_number debe ser un entero >= 0 o null" },
          { status: 400 }
        );
      }
      updates.track_number = trackNumber;
    }

    const safeKeys = Object.keys(updates).filter((k) => ALLOWED_COLUMNS.has(k));
    if (safeKeys.length === 0 && status === undefined) {
      return NextResponse.json({ error: "Sin campos válidos para actualizar" }, { status: 400 });
    }

    const fields = safeKeys.map((key) => `${key} = ?`).join(", ");
    const values = safeKeys.map((key) => updates[key]);

    if (status !== undefined) {
      if (fields) {
        await dbRun(`UPDATE tracks SET ${fields}, status = ? WHERE id = ?`, [...values, status, id]);
      } else {
        await dbRun(`UPDATE tracks SET status = ? WHERE id = ?`, [status, id]);
      }
    } else if (fields) {
      await dbRun(`UPDATE tracks SET ${fields} WHERE id = ?`, [...values, id]);
    }

    const DECISION_STATUSES = ["approved", "rejected", "revision"];
    if (
      session.role === "admin" &&
      status !== undefined &&
      status !== previousStatus &&
      DECISION_STATUSES.includes(status)
    ) {
      try {
        const ownerUserId = artistRow[0]?.user_id ?? null;
        const artistId = artistRow[0]?.id ?? null;
        const artistName = existing[0].artist_name;
        const trackTitle = existing[0].title;

        if (ownerUserId) {
          const type =
            status === "approved"
              ? "submission_approved"
              : status === "rejected"
                ? "submission_rejected"
                : "revision_requested";
          const title =
            status === "approved"
              ? "¡Tu release ha sido aprobado!"
              : status === "rejected"
                ? "Tu release no fue aprobado"
                : "Tu release necesita cambios";
          const message =
            status === "approved"
              ? `"${trackTitle}" ya está disponible en el catálogo.`
              : status === "rejected"
                ? "Razón: no se especificó motivo."
                : "Por favor revisa y actualiza la información.";

          await notifyApprovalDecision({
            userId: ownerUserId,
            type,
            title,
            message,
            data: { releaseId: id, trackTitle, artistName },
            context: "release",
          });
        }

        if (status === "approved" && artistId) {
          await notifyArtistSubscribers({
            artistId,
            kind: "release",
            title: "Nuevo release publicado",
            message: `"${trackTitle}" de ${artistName} ya está disponible en PressPlay.`,
            data: {
              releaseId: id,
              track_id: id,
              trackTitle,
              artistName,
              dashboardUrl: "/releases",
            },
            emailType: "new_release",
            emailData: {
              trackTitle,
              artistName,
              dashboardUrl: `/releases/${id}`,
            },
          });
        }
      } catch (notificationError) {
        console.error("PUT releases notificación (no fatal):", notificationError);
      }
    }

    return NextResponse.json({ message: "Release actualizado" });
  } catch (error) {
    console.error("PUT releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const existing = await dbQuery("SELECT artist_name FROM tracks WHERE id = ?", [id]) as { artist_name: string }[];
    if (!existing.length) {
      return NextResponse.json({ error: "Release no encontrado" }, { status: 404 });
    }
    const artistRow = await dbQuery("SELECT user_id FROM artists WHERE name = ?", [existing[0].artist_name]) as { user_id: string }[];
    const ownsTrack = artistRow.length > 0 && artistRow[0].user_id === session.userId;
    if (!ownsTrack && session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await dbRun("DELETE FROM tracks WHERE id = ?", [id]);
    return NextResponse.json({ message: "Release eliminado" });
  } catch (error) {
    console.error("DELETE releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
