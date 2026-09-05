import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateTrackSubmissionStatus, getTrackSubmissionById } from "@/lib/db";

export const dynamic = "force-dynamic";

function validateAdminSession(req: NextRequest): { userId: string; role: string } | null {
  const sessionCookie = req.cookies.get("auth_session");
  if (!sessionCookie) return null;
  try {
    const decoded = atob(sessionCookie.value);
    const session = JSON.parse(decoded) as { userId: string; role?: string };
    if (session.role !== "admin") return null;
    return { userId: session.userId, role: session.role };
  } catch {
    return null;
  }
}

const ActionSchema = z.object({
  action: z.enum(["approve", "reject", "revision"]),
  reason: z.string().min(10, "Razón requerida (mín. 10 caracteres)").optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = validateAdminSession(req);
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
    const admin = validateAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const validated = ActionSchema.parse(body);

    const submission = await getTrackSubmissionById(params.id);
    if (!submission) {
      return NextResponse.json({ error: "Submission no encontrada" }, { status: 404 });
    }

    let newStatus: "approved" | "rejected" | "revision";
    let adminNotes: string | null = null;

    switch (validated.action) {
      case "approve":
        newStatus = "approved";
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

    const updated = await updateTrackSubmissionStatus(params.id, newStatus, adminNotes ?? undefined);
    if (!updated) {
      return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
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
