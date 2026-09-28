import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { validateRequest } from "@/lib/auth";

const encoder = new TextEncoder();

function getWebhookSecret(): string | null {
  return process.env.WEBHOOK_SECRET || null;
}

export async function signWebhookPayload(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const base64 = Buffer.from(signature).toString("base64");
  return base64;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const session = await validateRequest(req);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Se requiere rol de administrador" }, { status: 403 });
  }
  return null;
}

export async function requireSession(req: NextRequest): Promise<
  { userId: string; role: string } | NextResponse | null
> {
  const session = await validateRequest(req);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  return { userId: session.userId, role: session.role };
}

export function webhookSecretConfigured(): boolean {
  return getWebhookSecret() !== null;
}

export async function verifyWebhookSignature(
  rawBody: string,
  provided: string | null
): Promise<boolean> {
  const secret = getWebhookSecret();
  if (!secret) return false;
  if (!provided) return false;
  const expected = await signWebhookPayload(rawBody, secret);
  return timingSafeEqual(expected, provided);
}
