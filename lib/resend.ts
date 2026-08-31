import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
  console.warn("RESEND_API_KEY no configurado - emails no se enviarán");
}

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const FROM_EMAIL = process.env.FROM_EMAIL || "PressPlay <noreply@pressplay.local>";