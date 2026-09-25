import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { sendNotificationEmail, getEmailConfig } from "@/lib/email";
import { createNotification } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateRequest } from "@/lib/auth";

const SendNotificationSchema = z.object({
  user_id: z.string().min(1, "user_id requerido"),
  type: z.enum(["submission_approved", "submission_rejected", "new_release", "track_liked", "system"]),
  title: z.string().min(1, "Título requerido"),
  message: z.string().min(1, "Mensaje requerido"),
  data: z.record(z.unknown()).optional(),
  send_email: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const session = await validateRequest(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Solo administradores pueden enviar notificaciones" }, { status: 403 });
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const rateLimit = checkRateLimit(`notifications:${ip}`, 10, 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rateLimit.resetAt) } }
      );
    }

    const body = await req.json();
    const validated = SendNotificationSchema.parse(body);

    // Create in-app notification
    const notificationId = randomUUID();
    const notification = await createNotification({
      id: notificationId,
      user_id: validated.user_id,
      type: validated.type,
      title: validated.title,
      message: validated.message,
      data: validated.data ? JSON.stringify(validated.data) : null,
      read: false,
    });

    // Send email if requested and resend is configured
    let emailSent = false;
    let emailReason: string | undefined;
    if (validated.send_email) {
      const result = await sendNotificationEmail({
        userId: validated.user_id,
        type: validated.type,
        data: {
          userName: "",
          trackTitle: (validated.data?.trackTitle as string) || "",
          artistName: (validated.data?.artistName as string) || "",
          adminNotes: validated.data?.adminNotes as string | undefined,
          dashboardUrl: `/dashboard`,
          notificationTitle: validated.title,
          notificationMessage: validated.message,
        },
      });
      emailSent = result.sent;
      emailReason = result.reason;
    }

    const emailConfig = getEmailConfig();

    return NextResponse.json({
      notification,
      email_sent: emailSent,
      email_reason: emailReason ?? null,
      email_configured: emailConfig.configured,
      email_missing_env: emailConfig.missing,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST notifications error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}