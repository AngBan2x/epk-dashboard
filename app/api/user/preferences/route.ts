import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { getUserById, updateUserPreferences } from "@/lib/db";
import type { UserPreferences } from "@/types/music";

export const dynamic = "force-dynamic";

const DEFAULT_PREFERENCES: UserPreferences = {
  email_notifications: true,
  push_notifications: true,
  new_release_alerts: true,
  show_alerts: true,
  marketing_emails: false,
};

const PreferencesSchema = z
  .object({
    email_notifications: z.boolean().optional(),
    push_notifications: z.boolean().optional(),
    new_release_alerts: z.boolean().optional(),
    show_alerts: z.boolean().optional(),
    marketing_emails: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Indica al menos una preferencia",
  });

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId };
}

export async function GET(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ preferences: { ...DEFAULT_PREFERENCES, ...(user.preferences ?? {}) } });
  } catch (error) {
    console.error("GET user preferences error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
    }

    const parsed = PreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors }, { status: 400 });
    }

    const merged: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      ...(user.preferences ?? {}),
      ...parsed.data,
    };

    const updated = await updateUserPreferences(session.userId, merged);
    if (!updated) {
      return NextResponse.json({ error: "No se pudieron guardar las preferencias" }, { status: 500 });
    }

    return NextResponse.json({ preferences: updated });
  } catch (error) {
    console.error("PATCH user preferences error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
