import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteSubscription, getSubscriptionById, updateSubscription } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

const UpdateSubscriptionSchema = z
  .object({
    notify_releases: z.boolean().optional(),
    notify_shows: z.boolean().optional(),
  })
  .refine((data) => data.notify_releases !== undefined || data.notify_shows !== undefined, {
    message: "Indica notify_releases o notify_shows",
  });

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "artist" };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }

    const existing = await getSubscriptionById(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });
    }

    if (existing.subscriber_id !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const validated = UpdateSubscriptionSchema.parse(body);

    const updated = await updateSubscription(existing.id, validated);
    if (!updated) {
      return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("PATCH subscription error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }

    const existing = await getSubscriptionById(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });
    }

    if (existing.subscriber_id !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const deleted = await deleteSubscription(existing.id);
    if (!deleted) {
      return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ deleted: existing.id }, { status: 200 });
  } catch (error) {
    console.error("DELETE subscription error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
