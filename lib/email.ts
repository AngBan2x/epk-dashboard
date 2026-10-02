import {
  getEmailTransport,
  resolveSender,
  type EmailResult,
  type EmailTransport,
} from "@/lib/email-transport";
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

/**
 * Traduce el estado del transporte al resultado público de siempre.
 *
 * La diferencia que importa: `failed` y `not_attempted` comparten `sent: false`,
 * pero no comparten contadores. `failed` significa que se intentó y no salió;
 * `not_attempted` que no se va a intentar. Sin distinguirlos, un `FROM_EMAIL`
 * ausente se contaría como fallo de envío y el log mentiría.
 */
function mapEmailResult(result: EmailResult, to: string): SendEmailResult {
  if (result.status === "sent") {
    const messageId = result.messageId ?? null;
    stats.sent += 1;
    stats.lastSentAt = new Date().toISOString();
    stats.lastError = null;
    stats.lastMessageId = messageId;
    console.info(
      `${LOG_PREFIX} enviado ✓ id=${messageId ?? "s/n"} to=${to} from=${getFromAddress()}`
    );
    return { sent: true, messageId: messageId ?? undefined };
  }

  if (result.status === "failed") {
    return recordFailure(result.reason ?? "error_desconocido", `to=${to}`);
  }

  return recordSkip(result.reason ?? "no_enviado", `to=${to}`);
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
  // Se resuelve en tiempo de llamada, no desde el `const` de módulo que tenía
  // `@/lib/resend`: ese snapshot quedaba en `undefined` para siempre cuando el
  // env llegaba tarde (el mismo bug que RC.32 corrigió en `lib/turso.ts`).
  return resolveSender().from;
}

export function getEmailStats(): EmailStats {
  return { ...stats };
}

/**
 * Envía un correo. La API pública no ha cambiado: mismos parámetros, mismo
 * retorno, y la llamada por defecto sigue yendo a Resend.
 *
 * El segundo parámetro es el punto de inyección (P3): un doble en memoria entra
 * por ahí y el resto de la función —validación, contadores, logs— no cambia.
 * Los ~8 call sites de producción no lo pasan y siguen compilando sin cambios.
 */
export async function sendEmail(
  input: SendEmailInput,
  transport: EmailTransport = getEmailTransport()
): Promise<SendEmailResult> {
  const to = String(input.to ?? "").trim();
  if (!EMAIL_PATTERN.test(to)) {
    return recordSkip("destinatario_invalido", `to=${to || "(vacío)"}`);
  }

  const subject = sanitizeSubject(input.subject);
  if (!subject) {
    return recordSkip("asunto_vacio", `to=${to}`);
  }

  let result: EmailResult;
  try {
    result = await transport({ to, subject, html: input.html, text: input.text });
  } catch (error) {
    // Red de seguridad: un transporte inyectado que lance no debe tumbar la ruta
    // que llama a `sendEmail`. El camino de aprobaciones y el buzón de P4
    // dependen de esto para que un problema de correo no sea un 500.
    const message = error instanceof Error ? error.message : String(error);
    return recordFailure(message, `to=${to}`);
  }

  return mapEmailResult(result, to);
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
