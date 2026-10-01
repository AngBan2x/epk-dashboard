import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateTrackSubmissionStatus, getTrackSubmissionById } from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { notifyApprovalDecision } from "@/lib/approval-notifications";
import { promoteUserToArtist } from "@/lib/artist-promotion";

export const dynamic = "force-dynamic";

async function validateAdminSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session || session.role !== "admin") return null;
  return { userId: session.userId, role: session.role };
}

/**
 * RC.32 Tarea 5 — dos acciones, y solo una cambia el estado.
 *
 * `approve` / `reject` / `revision` son las tres decisiones del admin y exigen
 * motivo (mínimo 10 caracteres, validado en el backend: el motivo es lo que
 * el artista va a leer). `retry_promotion` no decide nada: reintenta una
 * promoción que ya falló, sobre un envío que YA está aprobado, y por eso no
 * pide motivo — no hay nada que justificar.
 */
const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    reason: z.string().min(10, "La razón debe tener al menos 10 caracteres"),
  }),
  z.object({
    action: z.literal("reject"),
    reason: z.string().min(10, "La razón debe tener al menos 10 caracteres"),
  }),
  z.object({
    action: z.literal("revision"),
    reason: z.string().min(10, "La razón debe tener al menos 10 caracteres"),
  }),
  z.object({ action: z.literal("retry_promotion") }),
]);

function parseTrackDataSafely(trackData: string): Record<string, string> {
  try {
    const parsed = JSON.parse(trackData) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
    return {};
  } catch {
    return {};
  }
}

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  revision: "Revisión",
};

function addSpanishStatusLabel(submission: any) {
  return {
    ...submission,
    status_label: statusLabels[submission.status] || submission.status,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await validateAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const submission = await getTrackSubmissionById(params.id);
    if (!submission) {
      return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 });
    }

    return NextResponse.json(addSpanishStatusLabel(submission));
  } catch (error) {
    console.error("GET approval detail error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * RC.32 Tarea 5 — correr la promoción y DEVOLVER lo que pasó.
 *
 * Antes esto vivía en un `try { ... } catch { console.error }` dentro del
 * `POST` de aprobación, y el resultado se colapsaba a un `promoted: false`
 * indistinguible de "el usuario ya era artista". El admin aprobaba, el usuario
 * no se promovía, la respuesta era 200 y el único rastro era una línea en el
 * log del servidor. Un fallo que se ve en un log y no en la pantalla es un
 * fallo que no se arregla nunca.
 *
 * Aquí el error sale como dato (`error` + `retryable`), la respuesta lo lleva, y
 * `POST` con `action: "retry_promotion"` lo reintenta. La aprobación NO se
 * bloquea: ya ocurrió y es válida, así que un fallo de promoción no puede
 * convertirla en un 500.
 */
interface PromotionOutcome {
  promoted: boolean;
  attempted: boolean;
  error: string | null;
  retryable: boolean;
}

async function runPromotion(userId: string | null | undefined): Promise<PromotionOutcome> {
  if (!userId) {
    return {
      promoted: false,
      attempted: false,
      error: "El envío no tiene usuario asociado (user_id vacío): no hay a quién promover.",
      retryable: false,
    };
  }
  try {
    const result = await promoteUserToArtist(userId, { source: "release" });
    return { promoted: result.promoted, attempted: true, error: null, retryable: !result.promoted };
  } catch (promotionError) {
    // Log pero sin romper la aprobación: la decisión del admin ya está escrita.
    console.error("[PROMOTION] Failed to promote user:", promotionError);
    return {
      promoted: false,
      attempted: true,
      error: promotionError instanceof Error ? promotionError.message : String(promotionError),
      retryable: true,
    };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await validateAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const body = await req.json();
    const validated = ActionSchema.parse(body);

    const submission = await getTrackSubmissionById(params.id);
    if (!submission) {
      return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 });
    }

    // ── Reintento de promoción: no toca el estado ────────────────────────────
    // El envío tiene que seguir `approved`; promover a alguien cuyo envío se
    // rechazó a posteriori sería peor que no promover. 409, no 400: el
    // conflicto es con el estado actual, no con el formato del cuerpo.
    if (validated.action === "retry_promotion") {
      if (submission.status !== "approved") {
        return NextResponse.json(
          {
            error:
              `Solo se puede reintentar la promoción de un envío aprobado, y este está en "${submission.status}".`,
          },
          { status: 409 }
        );
      }
      const promotion = await runPromotion(submission.user_id);
      return NextResponse.json({
        id: submission.id,
        status: submission.status,
        status_label: statusLabels[submission.status] || submission.status,
        action_performed: "retry_promotion",
        admin_id: admin.userId,
        promoted: promotion.promoted,
        promotion,
      });
    }

    const oldStatus = submission.status;
    let newStatus: "approved" | "rejected" | "revision";
    let adminNotes: string | null = validated.reason;

    switch (validated.action) {
      case "approve":
        newStatus = "approved";
        break;
      case "reject":
        newStatus = "rejected";
        break;
      case "revision":
        newStatus = "revision";
        break;
    }

    const updated = await updateTrackSubmissionStatus(params.id, newStatus, adminNotes, admin.userId);
    if (!updated) {
      return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
    }

    // `promoted` se mantiene en la respuesta (el contrato no cambia) pero deja de
    // ser el único dato: `promotion` dice si se intentó, por qué falló y si se
    // puede reintentar.
    let promoted = false;
    let promotion: PromotionOutcome = {
      promoted: false,
      attempted: false,
      error: null,
      retryable: false,
    };

    if (newStatus !== oldStatus) {
      const trackData = parseTrackDataSafely(submission.track_data);
      const trackTitle = trackData.title ?? "tu envío";
      const type = newStatus === "approved"
        ? "submission_approved"
        : newStatus === "rejected"
          ? "submission_rejected"
          : "revision_requested";
      const title = newStatus === "approved"
        ? "¡Tu envío ha sido aprobado!"
        : newStatus === "rejected"
          ? "Tu envío no fue aprobado"
          : "Tu envío necesita cambios";
      const message = newStatus === "approved"
        ? `"${trackTitle}" ya está disponible en el catálogo.`
        : newStatus === "rejected"
          ? `Razón: ${adminNotes || "No se especificó motivo."}`
          : adminNotes || "Por favor revisa y actualiza la información.";

      await notifyApprovalDecision({
        userId: submission.user_id,
        type,
        title,
        message,
        data: { submissionId: params.id, trackTitle, artistName: trackData.artist_name },
        context: "track",
        adminNotes: adminNotes ?? undefined,
      });

      // PROMOTION HOOK: cuando se aprueba y el autor es suscriptor con su primer
      // contenido aprobado. Solo cuando `newStatus === "approved"`: un rechazo
      // o una revisión no promoted a nadie, y antes `promoted` se quedaba en
      // `false` sin explicación, igual que un fallo real.
      if (newStatus === "approved") {
        promotion = await runPromotion(submission.user_id);
        promoted = promotion.promoted;
      }
    }

    // Si la promoción falló, el mensaje lo dice en la respuesta. Es la diferencia
    // entre "el admin ve un 200 y no sabe nada" y "el admin ve que se aprobó y
    // que falta la promoción, con un motivo y un botón para reintentarla".
    const message =
      newStatus === "approved" && promotion.attempted && !promotion.promoted
        ? "Envío aprobado, pero la promoción del autor falló. La aprobación es válida; reintenta la promoción."
        : undefined;

    return NextResponse.json({
      ...addSpanishStatusLabel(updated),
      action_performed: validated.action,
      admin_id: admin.userId,
      promoted,
      promotion,
      ...(message ? { warning: message } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("POST approval action error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
