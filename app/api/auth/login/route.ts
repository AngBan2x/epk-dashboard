import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";
import { createSessionToken, SESSION_MAX_AGE, SESSION_MAX_AGE_REMEMBER } from "@/lib/auth";
import { checkRateLimit, registerFailedAttempt } from "@/lib/rate-limit";

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña requerida"),
  rememberMe: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  // P21.15 — la clave se calcula **fuera** del `try`: el `catch` también
  // castiga (un 400 de body mal formado es fallo del cliente, y sin contarlo
  // el endpoint quedaba sin límite para payloads rotos).
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const key = `login:${ip}`;

  try {
    // P21.15 — se **lee** la cuota sin gastarla. Un login válido no debe
    // apagar a nadie; el castigo se aplica abajo, solo cuando el intento
    // falla de verdad (400 / 401 / 403).
    const rateLimit = checkRateLimit(key, 5, 60_000, { count: false });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rateLimit.resetAt) } }
      );
    }

    const body = await req.json();
    const validated = LoginSchema.parse(body);

    const user = await getUserByEmail(validated.email);
    if (!user) {
      registerFailedAttempt(key, 5, 60_000);
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    if (user.deleted_at) {
      registerFailedAttempt(key, 5, 60_000);
      return NextResponse.json(
        {
          error:
            "Esta cuenta está suspendida. Puedes recuperarla con tu contraseña durante los 30 días de gracia.",
          code: "ACCOUNT_SUSPENDED",
        },
        { status: 403 }
      );
    }

    const validPassword = await bcrypt.compare(validated.password, user.password_hash);
    if (!validPassword) {
      registerFailedAttempt(key, 5, 60_000);
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const now = Date.now();
    const rememberMe = validated.rememberMe ?? false;
    const maxAge = rememberMe ? SESSION_MAX_AGE_REMEMBER : SESSION_MAX_AGE;

    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      iat: now,
      invalidateSessionBefore: now,
      rememberMe,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set("auth_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAge / 1000,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // P21.15 — 400 = fallo del cliente: cuenta.
      registerFailedAttempt(key, 5, 60_000);
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    // P21.15 — 500 = fallo nuestro: **no** cuenta. Contarlo convertiría un
    // bug del servidor en un bloqueo de 60 s para el usuario que lo pilla.
    console.error("[API/auth/login] Error: login failed");
    return NextResponse.json(
      { error: "Error al iniciar sesión" },
      { status: 500 }
    );
  }
}