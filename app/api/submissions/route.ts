import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTrackSubmissionsByUser, createTrackSubmission, getTrackSubmissionById } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SessionRole = "admin" | "artist" | "subscriber";

const KNOWN_ROLES: ReadonlyArray<SessionRole> = ["admin", "artist", "subscriber"];

/**
 * NO usar `session.role || "artist"`.
 *
 * Un token al que le falte el rol (o con un valor corrupto) llegaba a esta ruta
 * como si fuera artista, y en el `GET` eso abre la rama de admin: `isAdmin`
 * compara contra `"admin"`, así que ahí el daño era nulo. Pero es una bomba de
 * relojería: en cuanto esta ruta comprobara el rol en algún punto —y P16 la
 * acaba de convertir en el portal de entrada de todo suscriptor— el valor
 * inventado pasa a ser el que decide. Un default permisivo no es un default,
 * es una falta.
 *
 * Un token sin rol válido se trata como lo que es: sin rol. El resto de la ruta
 * decide con ese dato (admin se compara explícitamente, y los envíos son de
 * cualquiera con sesión).
 */
function resolveRole(rawRole: unknown): SessionRole | null {
  return typeof rawRole === "string" && (KNOWN_ROLES as string[]).includes(rawRole)
    ? (rawRole as SessionRole)
    : null;
}

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: resolveRole(session.role) };
}

// Schema for creating a submission (artist portal)
const CreateSubmissionSchema = z.object({
  track_data: z.object({
    title: z.string().min(1, "Título requerido"),
    artist_name: z.string().min(1, "Artista requerido"),
    release_type: z.string().min(1, "Tipo de lanzamiento requerido"),
    release_date: z.string().min(1, "Fecha de lanzamiento requerida"),
    duration: z.string().min(1, "Duración requerida"),
    cover_image: z.string().url("URL de portada inválida"),
    audio_preview_url: z.string().url("URL de preview inválida"),
    spotify_url: z.string().url().optional().nullable(),
    youtube_video_id: z.string().optional().nullable(),
    metrics: z.object({
      streams: z.number().default(0),
      saves: z.number().default(0),
      playlist_additions: z.number().default(0),
      top_countries: z.array(z.object({ country: z.string(), pct: z.number() })).default([]),
    }).optional(),
    production_details: z.object({
      daw: z.string().nullable().optional(),
      guitars: z.string().nullable().optional(),
      effects_chain: z.string().nullable().optional(),
      tuning: z.string().nullable().optional(),
      key: z.string().nullable().optional(),
    }).optional(),
    lyrics: z.string().nullable().optional(),
    itunes_track_id: z.string().nullable().optional(),
    stems_urls: z.object({
      drums: z.string().optional(),
      bass: z.string().optional(),
      guitars: z.string().optional(),
      vocals: z.string().optional(),
      other: z.string().optional(),
    }).optional(),
    video_embed_url: z.string().url().optional().nullable(),
    gallery_images: z.array(z.string().url()).optional(),
  }),
});

function parseTrackDataSafely(trackData: string): Record<string, string> {
  try {
    const parsed = JSON.parse(trackData) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
    return {};
  } catch {
    return {};
  }
}

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  revision: "Revisión",
};

function addSpanishStatusLabel(submission: any) {
  return {
    ...submission,
    status_label: statusLabels[submission.status] || submission.status,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const id = searchParams.get("id");

    const isAdmin = session.role === "admin";
    const noCacheHeaders = {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "Surrogate-Control": "no-store",
      "Pragma": "no-cache",
      "Expires": "0",
    };

    if (id) {
      const submission = await getTrackSubmissionById(id);
      if (!submission) {
        return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 });
      }
      if (!isAdmin && submission.user_id !== session.userId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      return NextResponse.json(addSpanishStatusLabel(submission));
    }

    const validStatus = status && ["pending", "approved", "rejected", "revision"].includes(status)
      ? (status as "pending" | "approved" | "rejected" | "revision")
      : null;

    if (isAdmin) {
      // Admin can still use this for reading all, but decisions go through /api/admin/approvals/[id]
      const { getAllTrackSubmissions, getTrackSubmissionsByStatus } = await import("@/lib/db");
      if (validStatus) {
        const subs = await getTrackSubmissionsByStatus(validStatus);
        return NextResponse.json(subs.map(addSpanishStatusLabel), { headers: noCacheHeaders });
      }
      const subs = await getAllTrackSubmissions();
      return NextResponse.json(subs.map(addSpanishStatusLabel), { headers: noCacheHeaders });
    }

    // Artist portal: ONLY own submissions
    const own = await getTrackSubmissionsByUser(session.userId);
    const filtered = validStatus ? own.filter((s) => s.status === validStatus) : own;
    return NextResponse.json(filtered.map(addSpanishStatusLabel), { headers: noCacheHeaders });
  } catch (error) {
    console.error("GET submissions error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const validated = CreateSubmissionSchema.parse(body);

    // Usar userId de la sesión en vez de header spoofable
    const userId = session.userId;

    const id = crypto.randomUUID();
    const submission = await createTrackSubmission({
      id,
      user_id: userId,
      track_data: JSON.stringify(validated.track_data),
      status: "pending",
      admin_notes: null,
      submission_type: "track",
      metadata: null,
      admin_id: null,
      reviewed_at: null,
    });

    return NextResponse.json(addSpanishStatusLabel(submission), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST submissions error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}