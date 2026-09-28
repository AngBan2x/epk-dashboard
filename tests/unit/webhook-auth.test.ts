import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const mockValidateRequest = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, validateRequest: mockValidateRequest };
});

const SECRET = "secreto-de-prueba-webhook";

describe("T1.1 lib/webhook-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
  });

  it("firma y verifica el payload correctamente", async () => {
    const { signWebhookPayload, verifyWebhookSignature } = await import("@/lib/webhook-auth");
    const body = JSON.stringify({ track_id: "trk-1", streams: 10 });
    const sig = await signWebhookPayload(body, SECRET);
    expect(await verifyWebhookSignature(body, sig)).toBe(true);
  });

  it("rechaza un payload alterado", async () => {
    const { signWebhookPayload, verifyWebhookSignature } = await import("@/lib/webhook-auth");
    const body = JSON.stringify({ track_id: "trk-1", streams: 10 });
    const sig = await signWebhookPayload(body, SECRET);
    const tampered = JSON.stringify({ track_id: "trk-1", streams: 999999 });
    expect(await verifyWebhookSignature(tampered, sig)).toBe(false);
  });

  it("rechaza si falta la firma o el secreto no esta configurado", async () => {
    const { verifyWebhookSignature } = await import("@/lib/webhook-auth");
    expect(await verifyWebhookSignature("{}", null)).toBe(false);

    delete process.env.WEBHOOK_SECRET;
    const sig = crypto.createHmac("sha256", SECRET).update("{}").digest("base64");
    expect(await verifyWebhookSignature("{}", sig)).toBe(false);
  });

  it("requireAdmin diferencia 401 de 403", async () => {
    const { requireAdmin } = await import("@/lib/webhook-auth");
    const req = new NextRequest("http://localhost/api/x");

    mockValidateRequest.mockResolvedValue(null);
    const anon = await requireAdmin(req);
    expect(anon?.status).toBe(401);

    mockValidateRequest.mockResolvedValue({ userId: "u1", role: "artist", iat: 1 });
    const artist = await requireAdmin(req);
    expect(artist?.status).toBe(403);

    mockValidateRequest.mockResolvedValue({ userId: "a1", role: "admin", iat: 1 });
    expect(await requireAdmin(req)).toBeNull();
  });
});

describe("T1.1 endpoints administrativos protegidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
  });

  it("POST /api/sync rechaza anonimos y artistas", async () => {
    const { POST } = await import("@/app/api/sync/route");
    const req = new NextRequest("http://localhost/api/sync", { method: "POST" });

    mockValidateRequest.mockResolvedValue(null);
    expect((await POST(req)).status).toBe(401);

    mockValidateRequest.mockResolvedValue({ userId: "u1", role: "artist", iat: 1 });
    expect((await POST(req)).status).toBe(403);
  });

  it("DELETE /api/shows/cleanup rechaza anonimos", async () => {
    const { DELETE } = await import("@/app/api/shows/cleanup/route");
    const req = new NextRequest("http://localhost/api/shows/cleanup", { method: "DELETE" });
    mockValidateRequest.mockResolvedValue(null);
    expect((await DELETE(req)).status).toBe(401);
  });

  it("POST /api/webhooks/metrics rechaza sin firma ni sesion de admin", async () => {
    const { POST } = await import("@/app/api/webhooks/metrics/route");
    const body = JSON.stringify({
      track_id: "trk-1",
      date: "2026-01-01",
      streams: 5,
      source: "test",
    });
    const req = new NextRequest("http://localhost/api/webhooks/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    mockValidateRequest.mockResolvedValue(null);
    expect((await POST(req)).status).toBe(401);
  });

  it("POST /api/webhooks/metrics acepta con firma HMAC valida (no necesita sesion)", async () => {
    const { POST } = await import("@/app/api/webhooks/metrics/route");
    const payload = {
      track_id: "trk-1",
      date: "2026-01-01",
      streams: 5,
      source: "test",
    };
    const body = JSON.stringify(payload);
    const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64");
    const req = new NextRequest("http://localhost/api/webhooks/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-signature": sig },
      body,
    });

    mockValidateRequest.mockResolvedValue(null);
    const res = await POST(req);
    expect(res.status).not.toBe(401);
  });

  it("POST /api/tracks/:id/streams rechaza anonimos sin firma", async () => {
    const { POST } = await import("@/app/api/tracks/[id]/streams/route");
    const req = new NextRequest("http://localhost/api/tracks/trk-1/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    mockValidateRequest.mockResolvedValue(null);
    expect((await POST(req, { params: { id: "trk-1" } })).status).toBe(401);
  });
});
