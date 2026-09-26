import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateTrackSubmissionStatus, getTrackSubmissionById } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { notifyApprovalDecision } from "@/lib/approval-notifications";

export const dynamic = "force-dynamic";

async function validateAdminSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session || session.role !== "admin") return null;
  return { userId: session.userId, role: session.role };
}

const ActionSchema = z.object({
  action: z.enum(["approve", "reject", "revision"]),
  reason: z.string().min(10, "Razón requerida (mín. 10 caracteres)").optional(),
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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await validateAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const submission = await getTrackSubmissionById(params.id);
    if (!submission) {
      return NextResponse.json({ error: "Submission no encontrada" }, { status: 404 });
    }

    return NextResponse.json(submission);
  } catch (error) {
    console.error("GET approval detail error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await validateAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const body = await req.json();
    const validated = ActionSchema.parse(body);

    const submission = await getTrackSubmissionById(params.id);
    if (!submission) {
      return NextResponse.json({ error: "Submission no encontrada" }, { status: 404 });
    }

    const oldStatus = submission.status;
    let newStatus: "approved" | "rejected" | "revision";
    let adminNotes: string | null = null;

    switch (validated.action) {
      case "approve":
        newStatus = "approved";
        adminNotes = validated.reason || null;
        break;
      case "reject":
        newStatus = "rejected";
        adminNotes = validated.reason || null;
        break;
      case "revision":
        newStatus = "revision";
        adminNotes = validated.reason || null;
        break;
    }

    const updated = await updateTrackSubmissionStatus(params.id, newStatus, adminNotes ?? undefined, admin.userId);
    if (!updated) {
      return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
    }

    if (newStatus !== oldStatus) {
      const trackData = parseTrackDataSafely(submission.track_data);
      const trackTitle = trackData.title ?? "tu envío";
      const type = newStatus === "approved"
        ? "submission_approved"
        : newStatus === "rejected"
          ? "submission_rejected"
          : "revision_requested";
      const title = newStatus === "approved"
        ? "¡Tu envío ha sido aprobado!"
        : newStatus === "rejected"
          ? "Tu envío no fue aprobado"
          : "Tu envío necesita cambios";
      const message = newStatus === "approved"
        ? `"${trackTitle}" ya está disponible en el catálogo.`
        : newStatus === "rejected"
          ? `Razón: ${adminNotes || "No se especificó motivo."}`
          : adminNotes || "Por favor revisa y actualiza la información.";

      await notifyApprovalDecision({
        userId: submission.user_id,
        type,
        title,
        message,
        data: { submissionId: params.id, trackTitle, artistName: trackData.artist_name },
        context: "track",
        adminNotes: adminNotes ?? undefined,
      });
    }

    return NextResponse.json({
      ...updated,
      action_performed: validated.action,
      admin_id: admin.userId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST approval action error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
