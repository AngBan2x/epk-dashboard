export type NotificationType =
  | "submission_approved"
  | "submission_rejected"
  | "new_release"
  | "track_liked"
  | "system"
  | "show_pending_review"
  | "platform_release";

export interface EmailTemplateData {
  userName: string;
  trackTitle: string;
  artistName: string;
  adminNotes?: string;
  dashboardUrl: string;
  context?: "track" | "show";
  showVenue?: string;
  showDate?: string;
  notificationTitle?: string;
  notificationMessage?: string;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildLink(baseUrl: string, path: string): string {
  const raw = String(path ?? "").trim() || "/dashboard";
  if (/^https?:\/\//i.test(raw)) return escapeHtml(raw);
  return escapeHtml(`${baseUrl}${raw.startsWith("/") ? raw : `/${raw}`}`);
}

function nounFor(context: EmailTemplateData["context"]): string {
  return context === "show" ? "show" : "track";
}

export function getEmailTemplate(type: NotificationType, data: EmailTemplateData): { subject: string; html: string; text: string } {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const dashboardLink = buildLink(baseUrl, data.dashboardUrl);
  const userName = escapeHtml(data.userName);
  const trackTitle = escapeHtml(data.trackTitle);
  const artistName = escapeHtml(data.artistName);
  const adminNotes = data.adminNotes ? escapeHtml(data.adminNotes) : "";
  const showVenue = escapeHtml(data.showVenue ?? data.trackTitle);
  const showDate = escapeHtml(data.showDate ?? "");

  switch (type) {
    case "submission_approved": {
      const noun = nounFor(data.context);
      const title = data.context === "show" ? showVenue : trackTitle;
      return {
        subject: `✅ Tu ${noun} "${data.trackTitle}" ha sido aprobado`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">✅ ${noun === "show" ? "Show" : "Track"} Aprobado</h1>
              </div>
              <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="font-size: 16px; margin-bottom: 16px;">Hola <strong>${userName}</strong>,</p>
                <p style="font-size: 16px; margin-bottom: 16px;">
                  ¡Excelentes noticias! Tu ${noun} <strong>"${title}"</strong> de <strong>${artistName}</strong>
                  ha sido <span style="color: #10b981; font-weight: bold;">aprobado</span> por nuestro equipo editorial.
                </p>
                ${data.context === "show" && showDate ? `
                  <p style="font-size: 16px; margin-bottom: 16px;">Fecha: <strong>${showDate}</strong></p>
                ` : ""}
                <p style="font-size: 16px; margin-bottom: 24px;">
                  Ahora está disponible públicamente en el catálogo de PressPlay.
                </p>
                <a href="${dashboardLink}" style="display: inline-block; background: #10b981; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  Ver mi ${noun === "show" ? "Show" : "Track"} en PressPlay
                </a>
                <p style="font-size: 14px; color: #64748b; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                  Si tienes alguna pregunta, no dudes en contactarnos.
                </p>
              </div>
            </body>
          </html>
        `,
        text: `Hola ${data.userName},\n\n¡Excelentes noticias! Tu ${noun} "${data.trackTitle}" de ${data.artistName} ha sido APROBADO por nuestro equipo editorial.\n\nAhora está disponible públicamente en el catálogo de PressPlay.\n\nVer en: ${dashboardLink}\n\nSaludos,\nEl equipo de PressPlay`,
      };
    }

    case "submission_rejected": {
      const noun = nounFor(data.context);
      const title = data.context === "show" ? showVenue : trackTitle;
      return {
        subject: `❌ Actualización sobre tu ${noun} "${data.trackTitle}"`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">❌ ${noun === "show" ? "Show" : "Track"} No Aprobado</h1>
              </div>
              <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="font-size: 16px; margin-bottom: 16px;">Hola <strong>${userName}</strong>,</p>
                <p style="font-size: 16px; margin-bottom: 16px;">
                  Gracias por enviar tu ${noun} <strong>"${title}"</strong> de <strong>${artistName}</strong>.
                  Después de una revisión cuidadosa, lamentamos informarte que no ha sido aprobado en esta ocasión.
                </p>
                ${adminNotes ? `
                  <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                    <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>Notas del equipo:</strong></p>
                    <p style="margin: 8px 0 0 0; font-size: 14px; color: #7f1d1d;">${adminNotes}</p>
                  </div>
                ` : ""}
                <p style="font-size: 16px; margin-bottom: 24px;">
                  Te animamos a seguir creando y a enviarnos nuevas propuestas en el futuro.
                </p>
                <a href="${dashboardLink}" style="display: inline-block; background: #64748b; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  Ver mi Dashboard
                </a>
              </div>
            </body>
          </html>
        `,
        text: `Hola ${data.userName},\n\nGracias por enviar tu ${noun} "${data.trackTitle}" de ${data.artistName}. Después de una revisión cuidadosa, lamentamos informarte que no ha sido aprobado en esta ocasión.\n\n${data.adminNotes ? `Notas del equipo: ${data.adminNotes}\n\n` : ""}Te animamos a seguir creando y a enviarnos nuevas propuestas en el futuro.\n\nVer en: ${dashboardLink}\n\nSaludos,\nEl equipo de PressPlay`,
      };
    }

    case "new_release": {
      return {
        subject: `🎉 Nuevo lanzamiento: "${data.trackTitle}" de ${data.artistName}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Nuevo Lanzamiento</h1>
              </div>
              <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="font-size: 16px; margin-bottom: 16px;">Hola <strong>${userName}</strong>,</p>
                <p style="font-size: 16px; margin-bottom: 16px;">
                  Se ha publicado un nuevo track en PressPlay:
                </p>
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #1e293b;">${trackTitle}</h2>
                  <p style="margin: 0; font-size: 16px; color: #64748b;">${artistName}</p>
                </div>
                <a href="${dashboardLink}" style="display: inline-block; background: #8b5cf6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  Escuchar en PressPlay
                </a>
              </div>
            </body>
          </html>
        `,
        text: `Hola ${data.userName},\n\nSe ha publicado un nuevo track en PressPlay:\n\n"${data.trackTitle}" - ${data.artistName}\n\nEscuchar en: ${dashboardLink}\n\nSaludos,\nEl equipo de PressPlay`,
      };
    }

    case "track_liked": {
      return {
        subject: `❤️ A alguien le gustó tu track "${data.trackTitle}"`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">❤️ Nuevo Like</h1>
              </div>
              <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="font-size: 16px; margin-bottom: 16px;">Hola <strong>${userName}</strong>,</p>
                <p style="font-size: 16px; margin-bottom: 16px;">
                  ¡Tu track <strong>"${trackTitle}"</strong> de <strong>${artistName}</strong>
                  ha recibido un nuevo like!
                </p>
                <a href="${dashboardLink}" style="display: inline-block; background: #ec4899; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  Ver mi Track
                </a>
              </div>
            </body>
          </html>
        `,
        text: `Hola ${data.userName},\n\n¡Tu track "${data.trackTitle}" de ${data.artistName} ha recibido un nuevo like!\n\nVer en: ${dashboardLink}\n\nSaludos,\nEl equipo de PressPlay`,
      };
    }

    case "system": {
      const systemTitle = data.notificationTitle || "Notificación de PressPlay";
      const systemMessage = data.notificationMessage || data.trackTitle || "";
      return {
        subject: systemTitle,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">ℹ️ Notificación del sistema</h1>
              </div>
              <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="font-size: 16px; margin-bottom: 16px;">Hola <strong>${userName}</strong>,</p>
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #1e293b;">${escapeHtml(systemTitle)}</h2>
                  <p style="margin: 0; font-size: 16px; color: #475569;">${escapeHtml(systemMessage)}</p>
                </div>
                <a href="${dashboardLink}" style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  Ir a mi cuenta
                </a>
              </div>
            </body>
          </html>
        `,
        text: `Hola ${data.userName},\n\n${systemTitle}\n\n${systemMessage}\n\nVer en: ${dashboardLink}\n\nSaludos,\nEl equipo de PressPlay`,
      };
    }

    case "show_pending_review": {
      const venue = data.showVenue ?? data.trackTitle;
      return {
        subject: `📋 Tu show "${venue}" está en revisión`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">📋 Show enviado a revisión</h1>
              </div>
              <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="font-size: 16px; margin-bottom: 16px;">Hola <strong>${userName}</strong>,</p>
                <p style="font-size: 16px; margin-bottom: 16px;">
                  Tu show en <strong>${showVenue}</strong> ha sido enviado para revisión.
                  Será publicado tras la aprobación del equipo.
                </p>
                ${showDate ? `
                  <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 16px; color: #475569;">Fecha: <strong>${showDate}</strong></p>
                  </div>
                ` : ""}
                <a href="${dashboardLink}" style="display: inline-block; background: #f59e0b; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  Ver mi Show en PressPlay
                </a>
                <p style="font-size: 14px; color: #64748b; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                  Si tienes alguna pregunta, no dudes en contactarnos.
                </p>
              </div>
            </body>
          </html>
        `,
        text: `Hola ${data.userName},\n\nTu show en ${venue} ha sido enviado para revisión. Será publicado tras la aprobación del equipo.\n\n${data.showDate ? `Fecha: ${data.showDate}\n\n` : ""}Ver en: ${dashboardLink}\n\nSaludos,\nEl equipo de PressPlay`,
      };
    }

    case "platform_release":
      throw new Error("Template platform_release pendiente de implementación (P4.8)");

    default:
      throw new Error(`Tipo de notificación desconocido: ${type as string}`);
  }
}
