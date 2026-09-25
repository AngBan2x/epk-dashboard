import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.FROM_EMAIL?.trim();

if (!resendApiKey) {
  console.warn("[pressplay:email] RESEND_API_KEY no configurado - los emails no se enviarán");
}

if (!fromEmail) {
  console.warn("[pressplay:email] FROM_EMAIL no configurado - se usará el remitente onboarding de Resend como último recurso");
}

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const FROM_EMAIL = fromEmail || "PressPlay <onboarding@resend.dev>";