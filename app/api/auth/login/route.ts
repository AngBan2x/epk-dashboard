import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getUserByEmail, getDbWrite } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";
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

    // Buscar usuario
    const user = await getUserByEmail(validated.email);
    if (!user) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    // Verificar contraseña
    const validPassword = await bcrypt.compare(validated.password, user.password_hash);
    if (!validPassword) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    // Crear sesión con timestamp de emisión y expiración condicional
    const now = Date.now();
    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      iat: now,
      ...(validated.rememberMe ? {} : { exp: now + 24 * 60 * 60 * 1000 }),
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    // Set httpOnly cookie — session-only by default, 30 days if rememberMe
    const maxAge = validated.rememberMe ? 30 * 24 * 60 * 60 : undefined; // 30 days in seconds
    response.cookies.set("auth_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(maxAge ? { maxAge } : {}),
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    console.error("[API/auth/login] Error:", error);
    return NextResponse.json(
      { error: "Error al iniciar sesión" },
      { status: 500 }
    );
  }
}