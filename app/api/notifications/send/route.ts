import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { getEmailTemplate, type NotificationType } from "@/lib/email-templates";
import { createNotification, getUserById } from "@/lib/db";

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
    if (validated.send_email && resend) {
      const user = await getUserById(validated.user_id);
      if (user?.email) {
        try {
          const template = getEmailTemplate(validated.type as NotificationType, {
            userName: user.name,
            trackTitle: (validated.data?.trackTitle as string) || "",
            artistName: (validated.data?.artistName as string) || "",
            adminNotes: validated.data?.adminNotes as string | undefined,
            dashboardUrl: `/dashboard`,
          });

          await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: template.subject,
            html: template.html,
            text: template.text,
          });
          emailSent = true;
        } catch (emailError) {
          console.error("Error sending email:", emailError);
          // Don't fail the request if email fails
        }
      }
    }

    return NextResponse.json({
      notification,
      email_sent: emailSent,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST notifications error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}