import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

export interface SessionData {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp?: number;
}

function getSecretKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set in production");
    }
    return "epk-dashboard-dev-secret-change-in-production-32b";
  }
  return secret;
}

function getKey(): Buffer {
  return Buffer.from(getSecretKey(), "utf-8");
}

function signPayload(payload: string): string {
  return createHmac("sha256", getKey()).update(payload).digest("base64url");
}

export function createSessionToken(sessionData: Omit<SessionData, "iat"> & { iat?: number }): string {
  const data = { ...sessionData, iat: sessionData.iat ?? Date.now() };
  const payload = JSON.stringify(data);
  const encoded = btoa(payload);
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

export function decodeSessionToken(token: string): SessionData | null {
  try {
    const dotIndex = token.lastIndexOf(".");
    if (dotIndex === -1) {
      return null;
    }

    const encoded = token.slice(0, dotIndex);
    const providedSig = token.slice(dotIndex + 1);
    const expectedSig = signPayload(encoded);

    const expectedBuf = Buffer.from(expectedSig, "base64url");
    const providedBuf = Buffer.from(providedSig, "base64url");

    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      return null;
    }

    const decoded = atob(encoded);
    const data = JSON.parse(decoded);
    if (!data.userId) return null;
    return data as SessionData;
  } catch {
    return null;
  }
}

export function isSessionValid(session: SessionData): boolean {
  if (session.exp && Date.now() > session.exp) return false;
  return true;
}

export function validateRequest(req: NextRequest): SessionData | null {
  const sessionCookie = req.cookies.get("auth_session");
  if (!sessionCookie) return null;
  const session = decodeSessionToken(sessionCookie.value);
  if (!session) return null;
  if (!isSessionValid(session)) return null;
  return session;
}
