import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDbWrite } from "@/lib/db";
import { randomUUID } from "crypto";
import { getTrackSubmissionsByUser, createTrackSubmission, getAllTrackSubmissions, updateTrackSubmissionStatus, getTrackSubmissionById, getTrackSubmissionsByStatus } from "@/lib/db";

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
  status: z.enum(["pending", "approved", "rejected"]),
  admin_notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    const status = searchParams.get("status");
    const id = searchParams.get("id");

    if (id) {
      const submission = getTrackSubmissionById(id);
      if (!submission) {
        return NextResponse.json({ error: "Submission not found" }, { status: 404 });
      }
      return NextResponse.json(submission);
    }

    if (userId) {
      const submissions = getTrackSubmissionsByUser(userId);
      return NextResponse.json(submissions);
    }

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      const submissions = getTrackSubmissionsByStatus(status as "pending" | "approved" | "rejected");
      return NextResponse.json(submissions);
    }

    const submissions = getAllTrackSubmissions();
    return NextResponse.json(submissions);
  } catch (error) {
    console.error("GET submissions error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = CreateSubmissionSchema.parse(body);

    // Get user from session cookie (simplified - in real app use auth context)
    // For now, we'll require user_id in the request or use a header
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }

    const id = randomUUID();
    const submission = createTrackSubmission({
      id,
      user_id: userId,
      track_data: JSON.stringify(validated.track_data),
      status: "pending",
      admin_notes: null,
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
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const body = await req.json();
    const validated = UpdateStatusSchema.parse(body);

    const updated = updateTrackSubmissionStatus(id, validated.status, validated.admin_notes);
    if (!updated) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
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