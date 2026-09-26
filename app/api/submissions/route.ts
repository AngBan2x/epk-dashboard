import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTrackSubmissionsByUser, createTrackSubmission, getAllTrackSubmissions, updateTrackSubmissionStatus, getTrackSubmissionById, getTrackSubmissionsByStatus } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { notifyApprovalDecision } from "@/lib/approval-notifications";

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "artist" };
}

// Schema for creating a submission
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

// Schema for updating submission status (admin only)
const UpdateStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "revision"]),
  admin_notes: z.string().optional(),
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

export async function GET(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
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
        return NextResponse.json({ error: "Submission not found" }, { status: 404 });
      }
      if (!isAdmin && submission.user_id !== session.userId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      return NextResponse.json(submission);
    }

    const validStatus = status && ["pending", "approved", "rejected", "revision"].includes(status)
      ? (status as "pending" | "approved" | "rejected" | "revision")
      : null;

    if (isAdmin) {
      if (userId) {
        return NextResponse.json(await getTrackSubmissionsByUser(userId), { headers: noCacheHeaders });
      }
      if (validStatus) {
        return NextResponse.json(await getTrackSubmissionsByStatus(validStatus), { headers: noCacheHeaders });
      }
      return NextResponse.json(await getAllTrackSubmissions(), { headers: noCacheHeaders });
    }

    const own = await getTrackSubmissionsByUser(session.userId);
    const filtered = validStatus ? own.filter((s) => s.status === validStatus) : own;
    return NextResponse.json(filtered, { headers: noCacheHeaders });
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

    return NextResponse.json(submission, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST submissions error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const body = await req.json();
    const validated = UpdateStatusSchema.parse(body);

    const submission = await getTrackSubmissionById(id);
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const oldStatus = submission.status;
    const updated = await updateTrackSubmissionStatus(id, validated.status, validated.admin_notes, session.userId);
    if (!updated) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (validated.status !== oldStatus && (validated.status === "approved" || validated.status === "rejected" || validated.status === "revision")) {
      const trackData = parseTrackDataSafely(submission.track_data);
      const trackTitle = trackData.title ?? "tu envío";
      const type = validated.status === "approved"
        ? "submission_approved"
        : validated.status === "rejected"
          ? "submission_rejected"
          : "revision_requested";
      const title = validated.status === "approved"
        ? "¡Tu envío ha sido aprobado!"
        : validated.status === "rejected"
          ? "Tu envío no fue aprobado"
          : "Tu envío necesita cambios";
      const message = validated.status === "approved"
        ? `"${trackTitle}" ya está disponible en el catálogo.`
        : validated.status === "rejected"
          ? `Razón: ${validated.admin_notes || "No se especificó motivo."}`
          : validated.admin_notes || "Por favor revisa y actualiza la información.";

      await notifyApprovalDecision({
        userId: submission.user_id,
        type,
        title,
        message,
        data: { submissionId: id, trackTitle, artistName: trackData.artist_name },
        context: "track",
        adminNotes: validated.admin_notes ?? undefined,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("PATCH submissions error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}