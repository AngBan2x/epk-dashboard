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

function textEncode(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): ArrayBuffer {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

async function signPayload(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncode(getSecretKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, textEncode(payload));
  return base64UrlEncode(sig);
}

async function verifySignature(payload: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncode(getSecretKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBuf = base64UrlDecode(signature);
  return crypto.subtle.verify("HMAC", key, sigBuf, textEncode(payload));
}

export async function createSessionToken(sessionData: Omit<SessionData, "iat"> & { iat?: number }): Promise<string> {
  const data = { ...sessionData, iat: sessionData.iat ?? Date.now() };
  const payload = JSON.stringify(data);
  const encoded = btoa(payload);
  const signature = await signPayload(encoded);
  return `${encoded}.${signature}`;
}

export async function decodeSessionToken(token: string): Promise<SessionData | null> {
  try {
    const decoded = decodeURIComponent(token);
    const dotIndex = decoded.lastIndexOf(".");
    if (dotIndex === -1) return null;

    const encoded = decoded.slice(0, dotIndex);
    const providedSig = decoded.slice(dotIndex + 1);

    const valid = await verifySignature(encoded, providedSig);
    if (!valid) return null;

    const decodedPayload = atob(encoded);
    const data = JSON.parse(decodedPayload);
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

export async function validateRequest(req: NextRequest): Promise<SessionData | null> {
  const sessionCookie = req.cookies.get("auth_session");
  if (!sessionCookie) return null;
  const session = await decodeSessionToken(sessionCookie.value);
  if (!session) return null;
  if (!isSessionValid(session)) return null;
  return session;
}
