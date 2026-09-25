import { resend, FROM_EMAIL } from "@/lib/resend";
import { getEmailTemplate, type EmailTemplateData, type NotificationType } from "@/lib/email-templates";
import { getUserById } from "@/lib/db";

const LOG_PREFIX = "[pressplay:email]";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  sent: boolean;
  reason?: string;
  messageId?: string;
}

export interface EmailStats {
  sent: number;
  failed: number;
  skipped: number;
  lastSentAt: string | null;
  lastError: string | null;
  lastMessageId: string | null;
}

const stats: EmailStats = {
  sent: 0,
  failed: 0,
  skipped: 0,
  lastSentAt: null,
  lastError: null,
  lastMessageId: null,
};

function maskSecrets(value: string): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) return value;
  return value.split(key).join("***");
}

function recordSkip(reason: string, context: string): SendEmailResult {
  stats.skipped += 1;
  console.warn(`${LOG_PREFIX} omitido → ${reason} | ${context}`);
  return { sent: false, reason };
}

function recordFailure(reason: string, context: string): SendEmailResult {
  const safeReason = maskSecrets(reason);
  stats.failed += 1;
  stats.lastError = safeReason;
  console.error(`${LOG_PREFIX} fallo → ${safeReason} | ${context}`);
  return { sent: false, reason: safeReason };
}

function sanitizeSubject(subject: string): string {
  return String(subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
}

export function getEmailConfig(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.RESEND_API_KEY?.trim()) missing.push("RESEND_API_KEY");
  if (!process.env.FROM_EMAIL?.trim()) missing.push("FROM_EMAIL");
  return { configured: missing.length === 0, missing };
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function getFromAddress(): string {
  return FROM_EMAIL;
}

export function getEmailStats(): EmailStats {
  return { ...stats };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const to = String(input.to ?? "").trim();
  if (!EMAIL_PATTERN.test(to)) {
    return recordSkip("destinatario_invalido", `to=${to || "(vacío)"}`);
  }

  if (!resend || !isEmailConfigured()) {
    return recordSkip("RESEND_API_KEY no configurado", `to=${to}`);
  }

  const subject = sanitizeSubject(input.subject);
  if (!subject) {
    return recordSkip("asunto_vacio", `to=${to}`);
  }

  try {
    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: input.html,
      text: input.text,
    });

    if (response.error) {
      return recordFailure(
        `${response.error.name}: ${response.error.message}`,
        `to=${to} from=${FROM_EMAIL}`
      );
    }

    const messageId = response.data?.id ?? null;
    stats.sent += 1;
    stats.lastSentAt = new Date().toISOString();
    stats.lastError = null;
    stats.lastMessageId = messageId;
    console.info(`${LOG_PREFIX} enviado ✓ id=${messageId ?? "s/n"} to=${to} from=${FROM_EMAIL}`);
    return { sent: true, messageId: messageId ?? undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return recordFailure(message, `to=${to} from=${FROM_EMAIL}`);
  }
}

export async function sendNotificationEmail(input: {
  userId: string;
  type: NotificationType;
  data: EmailTemplateData;
}): Promise<SendEmailResult> {
  try {
    const user = await getUserById(input.userId);
    if (!user) {
      return recordSkip("usuario_no_encontrado", `user=${input.userId}`);
    }
    if (user.preferences && user.preferences.email_notifications === false) {
      return recordSkip("email_notifications_desactivado", `user=${input.userId}`);
    }
    if (!user.email) {
      return recordSkip("usuario_sin_email", `user=${input.userId}`);
    }

    const template = getEmailTemplate(input.type, {
      ...input.data,
      userName: input.data.userName || user.name,
      artistName: input.data.artistName || user.name,
    });

    return await sendEmail({
      to: user.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return recordFailure(message, `type=${input.type} user=${input.userId}`);
  }
}
