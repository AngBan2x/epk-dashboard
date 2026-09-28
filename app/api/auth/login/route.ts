import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";
import { createSessionToken, SESSION_MAX_AGE, SESSION_MAX_AGE_REMEMBER } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña requerida"),
  rememberMe: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const rateLimit = checkRateLimit(`login:${ip}`, 5, 60_000);
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
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    if (user.deleted_at) {
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
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    console.error("[API/auth/login] Error: login failed");
    return NextResponse.json(
      { error: "Error al iniciar sesión" },
      { status: 500 }
    );
  }
}