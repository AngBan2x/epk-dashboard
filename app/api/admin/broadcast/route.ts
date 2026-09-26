import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { validateRequest } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createNotification, getAllUsers } from "@/lib/db";
import { sendNotificationEmail } from "@/lib/email";
import type { EmailTemplateData } from "@/lib/email-templates";
import type { User, UserPreferences } from "@/types/music";

export const dynamic = "force-dynamic";

const LOG_PREFIX = "[pressplay:broadcast]";

const MAX_BROADCAST_RECIPIENTS = 500;
const EMAIL_SETTLE_TIMEOUT_MS = 8000;
const EMAIL_IN_TEXT = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

const BroadcastSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "El título debe tener al menos 3 caracteres")
    .max(120, "El título no puede superar 120 caracteres"),
  message: z
    .string()
    .trim()
    .min(3, "El mensaje debe tener al menos 3 caracteres")
    .max(1000, "El mensaje no puede superar 1000 caracteres"),
  sendEmail: z.boolean(),
});

export interface BroadcastSummary {
  notified: number;
  emailsQueued: number;
  emailsSent: number;
  skipped: number;
  failures: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redactEmailAddresses(value: string): string {
  return value.replace(EMAIL_IN_TEXT, "***");
}

function isOfficialServiceEmailAllowed(user: User): boolean {
  if (!user.email) return false;
  const preferences: UserPreferences | null = user.preferences;
  if (preferences?.email_notifications === false) return false;
  const marketingPreferenceApplies = false;
  if (marketingPreferenceApplies && preferences?.marketing_emails === false) return false;
  return true;
}

function wantsInAppNotice(user: User): boolean {
  return user.preferences?.push_notifications !== false;
}

function buildEmailData(title: string, message: string, userName: string): EmailTemplateData {
  return {
    userName,
    trackTitle: title,
    artistName: "PressPlay",
    dashboardUrl: "/dashboard",
    notificationTitle: title,
    notificationMessage: message,
  };
}

function collectUniqueRecipients(users: User[]): User[] {
  const uniqueById = new Map<string, User>();
  for (const user of users) {
    if (user.deleted_at) continue;
    if (!uniqueById.has(user.id)) uniqueById.set(user.id, user);
  }
  return Array.from(uniqueById.values());
}

export async function POST(req: NextRequest) {
  try {
    const session = await validateRequest(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (session.role !== "admin") {
      return NextResponse.json(
        { error: "Solo administradores pueden enviar avisos de plataforma" },
        { status: 403 }
      );
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const rateLimit = checkRateLimit(`broadcast:${ip}`, 5, 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Inténtalo de nuevo en un minuto." },
        {
          status: 429,
          headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rateLimit.resetAt) },
        }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
    }

    const parsed = BroadcastSchema.safeParse(rawBody);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: first?.message ?? "Datos inválidos",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { title, message, sendEmail } = parsed.data;

    const users = await getAllUsers();
    const targets = collectUniqueRecipients(users);
    const emailTargets = targets.filter(isOfficialServiceEmailAllowed);

    if (sendEmail && targets.length === 0) {
      return NextResponse.json(
        { error: "No hay usuarios registrados a los que enviar el aviso." },
        { status: 400 }
      );
    }

    if (sendEmail && emailTargets.length === 0) {
      return NextResponse.json(
        { error: "Ningún usuario registrado tiene el email habilitado para recibir el aviso." },
        { status: 400 }
      );
    }

    const summary: BroadcastSummary = {
      notified: 0,
      emailsQueued: 0,
      emailsSent: 0,
      skipped: 0,
      failures: [],
    };

    const truncated = Math.max(0, targets.length - MAX_BROADCAST_RECIPIENTS);
    const recipients = targets.slice(0, MAX_BROADCAST_RECIPIENTS);
    if (truncated > 0) {
      summary.skipped += truncated;
      console.warn(
        `${LOG_PREFIX} truncado: ${truncated} de ${targets.length} destinatarios omitidos (límite ${MAX_BROADCAST_RECIPIENTS})`
      );
    }

    const payload = JSON.stringify({
      source: "platform",
      broadcast: true,
      title,
      message,
      sent_at: new Date().toISOString(),
    });

    const jobs: Promise<void>[] = [];

    for (const user of recipients) {
      const inApp = wantsInAppNotice(user);
      const email = sendEmail && isOfficialServiceEmailAllowed(user);

      try {
        if (inApp) {
          await createNotification({
            id: randomUUID(),
            user_id: user.id,
            type: "platform_release",
            title,
            message,
            data: payload,
            read: false,
          });
          summary.notified += 1;
        }

        if (email) {
          summary.emailsQueued += 1;
          jobs.push(
            sendNotificationEmail({
              userId: user.id,
              type: "platform_release",
              data: buildEmailData(title, message, user.name),
            })
              .then((result) => {
                if (result.sent) summary.emailsSent += 1;
              })
              .catch((error) => {
                summary.failures.push(
                  `${user.id}: email: ${redactEmailAddresses(errorMessage(error))}`
                );
              })
          );
        }

        if (!inApp && !email) summary.skipped += 1;
      } catch (error) {
        summary.failures.push(
          `${user.id}: notificación: ${redactEmailAddresses(errorMessage(error))}`
        );
      }
    }

    if (jobs.length > 0) {
      const settled = Promise.allSettled(jobs);
      void settled.then((results) => {
        const rejected = results.filter((result) => result.status === "rejected").length;
        console.info(
          `${LOG_PREFIX} emails resueltos sent=${summary.emailsSent} rejected=${rejected} failures=${summary.failures.length}`
        );
      });
      let settleTimer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        settleTimer = setTimeout(resolve, EMAIL_SETTLE_TIMEOUT_MS);
      });
      await Promise.race([settled, timeout]);
      clearTimeout(settleTimer);
    }

    console.info(
      `${LOG_PREFIX} aviso enviado notified=${summary.notified} emailsQueued=${summary.emailsQueued} emailsSent=${summary.emailsSent} skipped=${summary.skipped} failures=${summary.failures.length} truncados=${truncated}`
    );

    return NextResponse.json({ ...summary, truncated }, { status: 201 });
  } catch (error) {
    console.error(`${LOG_PREFIX} error: ${redactEmailAddresses(errorMessage(error))}`);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
