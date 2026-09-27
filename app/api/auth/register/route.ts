import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createUser, getUserByEmail } from "@/lib/db";
import { randomUUID } from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";

const RegisterSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const rateLimit = checkRateLimit(`register:${ip}`, 3, 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rateLimit.resetAt) } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Cuerpo de solicitud inválido" },
        { status: 400 }
      );
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Cuerpo de solicitud inválido" },
        { status: 400 }
      );
    }
    const validated = RegisterSchema.parse(body);

    const existingUser = await getUserByEmail(validated.email);
    if (existingUser) {
      return NextResponse.json(
        { error: "Este email ya está registrado" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(validated.password, 10);

    const userId = randomUUID();
    const user = await createUser({
      id: userId,
      name: validated.name,
      email: validated.email,
      password_hash: passwordHash,
      role: "subscriber",
      preferences: {
        email_notifications: true,
        push_notifications: true,
        new_release_alerts: true,
        show_alerts: true,
        marketing_emails: false,
      },
      avatar: null,
      email_verified: false,
      deleted_at: null,
      last_login: null,
    });

    const { password_hash, ...userWithoutPassword } = user;
    return NextResponse.json(userWithoutPassword, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("UNIQUE constraint failed") || msg.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Este email ya está registrado" },
        { status: 409 }
      );
    }
    console.error("[API/auth/register] Error: registration failed");
    return NextResponse.json(
      { error: "Error al registrar usuario" },
      { status: 500 }
    );
  }
}