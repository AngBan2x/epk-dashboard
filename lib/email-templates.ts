export type NotificationType = "submission_approved" | "submission_rejected" | "new_release" | "track_liked";

export interface EmailTemplateData {
  userName: string;
  trackTitle: string;
  artistName: string;
  adminNotes?: string;
  dashboardUrl: string;
}

export function getEmailTemplate(type: NotificationType, data: EmailTemplateData): { subject: string; html: string; text: string } {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const dashboardLink = `${baseUrl}${data.dashboardUrl}`;

  switch (type) {
    case "submission_approved": {
      return {
        subject: `✅ Tu track "${data.trackTitle}" ha sido aprobado`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">✅ Track Aprobado</h1>
              </div>
              <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="font-size: 16px; margin-bottom: 16px;">Hola <strong>${data.userName}</strong>,</p>
                <p style="font-size: 16px; margin-bottom: 16px;">
                  ¡Excelentes noticias! Tu track <strong>"${data.trackTitle}"</strong> de <strong>${data.artistName}</strong>
                  ha sido <span style="color: #10b981; font-weight: bold;">aprobado</span> por nuestro equipo editorial.
                </p>
                <p style="font-size: 16px; margin-bottom: 24px;">
                  Ahora está disponible públicamente en el catálogo de PressPlay.
                </p>
                <a href="${dashboardLink}" style="display: inline-block; background: #10b981; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  Ver mi Track en PressPlay
                </a>
                <p style="font-size: 14px; color: #64748b; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                  Si tienes alguna pregunta, no dudes en contactarnos.
                </p>
              </div>
            </body>
          </html>
        `,
        text: `Hola ${data.userName},\n\n¡Excelentes noticias! Tu track "${data.trackTitle}" de ${data.artistName} ha sido APROBADO por nuestro equipo editorial.\n\nAhora está disponible públicamente en el catálogo de PressPlay.\n\nVer en: ${dashboardLink}\n\nSaludos,\nEl equipo de PressPlay`,
      };
    }

    case "submission_rejected": {
      return {
        subject: `❌ Actualización sobre tu track "${data.trackTitle}"`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">❌ Track No Aprobado</h1>
              </div>
              <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="font-size: 16px; margin-bottom: 16px;">Hola <strong>${data.userName}</strong>,</p>
                <p style="font-size: 16px; margin-bottom: 16px;">
                  Gracias por enviar tu track <strong>"${data.trackTitle}"</strong> de <strong>${data.artistName}</strong>.
                  Después de una revisión cuidadosa, lamentamos informarte que no ha sido aprobado en esta ocasión.
                </p>
                ${data.adminNotes ? `
                  <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                    <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>Notas del equipo:</strong></p>
                    <p style="margin: 8px 0 0 0; font-size: 14px; color: #7f1d1d;">${data.adminNotes}</p>
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
        text: `Hola ${data.userName},\n\nGracias por enviar tu track "${data.trackTitle}" de ${data.artistName}. Después de una revisión cuidadosa, lamentamos informarte que no ha sido aprobado en esta ocasión.\n\n${data.adminNotes ? `Notas del equipo: ${data.adminNotes}\n\n` : ""}Te animamos a seguir creando y a enviarnos nuevas propuestas en el futuro.\n\nVer en: ${dashboardLink}\n\nSaludos,\nEl equipo de PressPlay`,
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
                <p style="font-size: 16px; margin-bottom: 16px;">Hola <strong>${data.userName}</strong>,</p>
                <p style="font-size: 16px; margin-bottom: 16px;">
                  Se ha publicado un nuevo track en PressPlay:
                </p>
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #1e293b;">${data.trackTitle}</h2>
                  <p style="margin: 0; font-size: 16px; color: #64748b;">${data.artistName}</p>
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
                <p style="font-size: 16px; margin-bottom: 16px;">Hola <strong>${data.userName}</strong>,</p>
                <p style="font-size: 16px; margin-bottom: 16px;">
                  ¡Tu track <strong>"${data.trackTitle}"</strong> de <strong>${data.artistName}</strong>
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

    default:
      throw new Error(`Tipo de notificación desconocido: ${type}`);
  }
}