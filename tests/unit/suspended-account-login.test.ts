import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUserByEmail = vi.fn();
const mockCreateSessionToken = vi.fn(async (_arg: Record<string, unknown>) => "token.fake");
const mockCheckRateLimit = vi.fn();
const mockCompare = vi.fn();

vi.mock("@/lib/db", () => ({ getUserByEmail: mockGetUserByEmail }));
vi.mock("bcryptjs", () => ({ default: { compare: mockCompare } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, createSessionToken: mockCreateSessionToken };
});

function loginRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const alive = {
  id: "u1",
  name: "Ana",
  email: "ana@ejemplo.com",
  password_hash: "hash",
  role: "artist",
  deleted_at: null,
};

describe("T0.2 cuentas suspendidas no pueden iniciar sesion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockCompare.mockResolvedValue(true);
    mockCreateSessionToken.mockResolvedValue("token.fake");
  });

  it("login con deleted_at devuelve 403 ACCOUNT_SUSPENDED y no emite cookie", async () => {
    mockGetUserByEmail.mockResolvedValue({ ...alive, deleted_at: new Date().toISOString() });
    const { POST } = await import("@/app/api/auth/login/route");

    const res = await POST(loginRequest({ email: "ana@ejemplo.com", password: "12345678" }));

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("ACCOUNT_SUSPENDED");
    expect(mockCreateSessionToken).not.toHaveBeenCalled();
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).not.toContain("auth_session=");
  });

  it("login normal sigue funcionando y el token invalida sesiones previas", async () => {
    mockGetUserByEmail.mockResolvedValue(alive);
    const { POST } = await import("@/app/api/auth/login/route");

    const res = await POST(loginRequest({ email: "ana@ejemplo.com", password: "12345678" }));
    expect(res.status).toBe(200);

    const payload = mockCreateSessionToken.mock.calls[0][0] as {
      invalidateSessionBefore?: number;
      role?: string;
    };
    expect(typeof payload.invalidateSessionBefore).toBe("number");
    expect(payload.role).toBe("artist");
  });

  it("T0.3 login no impone minimo de longitud (solo valida que exista)", async () => {
    mockGetUserByEmail.mockResolvedValue(alive);
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(loginRequest({ email: "ana@ejemplo.com", password: "a" }));
    expect(res.status).toBe(200);
  });
});
