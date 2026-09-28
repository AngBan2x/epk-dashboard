import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockValidateRequest = vi.fn();
const mockGetUserById = vi.fn();
const mockGetPasswordHash = vi.fn();
const mockIsEmailTaken = vi.fn();
const mockUpdateUserEmail = vi.fn();
const mockUpdateUserPassword = vi.fn();
const mockSoftDeleteUser = vi.fn();
const mockGetSoftDeletedUserByEmail = vi.fn();
const mockRestoreUser = vi.fn();
const mockCompare = vi.fn();

vi.mock("@/lib/auth", () => ({ validateRequest: mockValidateRequest }));
vi.mock("bcryptjs", () => ({
  default: { compare: mockCompare, hash: vi.fn(async (v: string) => `hashed:${v}`) },
}));
vi.mock("@/lib/db", () => ({
  getUserById: mockGetUserById,
  getPasswordHash: mockGetPasswordHash,
  isEmailTaken: mockIsEmailTaken,
  updateUserEmail: mockUpdateUserEmail,
  updateUserPassword: mockUpdateUserPassword,
  softDeleteUser: mockSoftDeleteUser,
  getSoftDeletedUserByEmail: mockGetSoftDeletedUserByEmail,
  restoreUser: mockRestoreUser,
}));

const HASH = "hashed:secreto";

function makeRequest(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/user/settings", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("T0 /api/user/settings sobre lib/db (Turso-aware)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateRequest.mockResolvedValue({ userId: "u1", role: "artist", iat: Date.now() });
    mockGetPasswordHash.mockResolvedValue(HASH);
    mockCompare.mockResolvedValue(true);
  });

  it("GET devuelve el usuario sin password_hash", async () => {
    mockGetUserById.mockResolvedValue({
      id: "u1",
      name: "Ana",
      email: "a@b.com",
      password_hash: HASH,
    });
    const { GET } = await import("@/app/api/user/settings/route");
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.email).toBe("a@b.com");
    expect(body).not.toHaveProperty("password_hash");
  });

  it("GET sin sesion devuelve 401", async () => {
    mockValidateRequest.mockResolvedValue(null);
    const { GET } = await import("@/app/api/user/settings/route");
    expect((await GET(makeRequest("GET"))).status).toBe(401);
  });

  it("PATCH email valida formato y unicidad antes de escribir", async () => {
    const { PATCH } = await import("@/app/api/user/settings/route");

    expect((await PATCH(makeRequest("PATCH", { email: "no-es-email" }))).status).toBe(400);

    mockIsEmailTaken.mockResolvedValue(true);
    expect((await PATCH(makeRequest("PATCH", { email: "nuevo@ejemplo.com" }))).status).toBe(400);
    expect(mockUpdateUserEmail).not.toHaveBeenCalled();

    mockIsEmailTaken.mockResolvedValue(false);
    const ok = await PATCH(makeRequest("PATCH", { email: "  NUEVO@Ejemplo.com " }));
    expect(ok.status).toBe(200);
    expect(mockUpdateUserEmail).toHaveBeenCalledWith("u1", "nuevo@ejemplo.com");
  });

  it("T0.3 PATCH password exige minimo 8 caracteres en backend", async () => {
    const { PATCH } = await import("@/app/api/user/settings/route");

    const corto = await PATCH(makeRequest("PATCH", { currentPassword: "vieja123", newPassword: "corta" }));
    expect(corto.status).toBe(400);
    expect(mockUpdateUserPassword).not.toHaveBeenCalled();

    const noTexto = await PATCH(makeRequest("PATCH", { currentPassword: "vieja123", newPassword: 12345678 }));
    expect(noTexto.status).toBe(400);

    const ok = await PATCH(makeRequest("PATCH", { currentPassword: "vieja123", newPassword: "nuevalarga1" }));
    expect(ok.status).toBe(200);
    expect(mockUpdateUserPassword).toHaveBeenCalledWith("u1", "hashed:nuevalarga1");
  });

  it("T0.3 PATCH password rechaza credencial actual incorrecta", async () => {
    mockCompare.mockResolvedValue(false);
    const { PATCH } = await import("@/app/api/user/settings/route");
    const res = await PATCH(makeRequest("PATCH", { currentPassword: "mala", newPassword: "nuevalarga1" }));
    expect(res.status).toBe(400);
    expect(mockUpdateUserPassword).not.toHaveBeenCalled();
  });

  it("T0.2 DELETE suspende la cuenta y expone los dias de gracia", async () => {
    const { DELETE } = await import("@/app/api/user/settings/route");

    expect((await DELETE(makeRequest("DELETE", {}))).status).toBe(400);

    const ok = await DELETE(makeRequest("DELETE", { password: "cualquiera" }));
    expect(ok.status).toBe(200);
    expect(mockSoftDeleteUser).toHaveBeenCalledWith("u1");
    const body = (await ok.json()) as Record<string, unknown>;
    expect(body.graceDays).toBe(30);
    expect(body.restore).toBe(true);
  });

  it("T0.2 DELETE no suspende si la contrasena no coincide", async () => {
    mockCompare.mockResolvedValue(false);
    const { DELETE } = await import("@/app/api/user/settings/route");
    const res = await DELETE(makeRequest("DELETE", { password: "mala" }));
    expect(res.status).toBe(400);
    expect(mockSoftDeleteUser).not.toHaveBeenCalled();
  });

  it("T0.2 PUT restaura una cuenta suspendida dentro de la gracia", async () => {
    const { PUT } = await import("@/app/api/user/settings/route");
    mockGetSoftDeletedUserByEmail.mockResolvedValue({
      id: "u9",
      email: "suspendido@ejemplo.com",
      password_hash: HASH,
      deleted_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });

    mockCompare.mockResolvedValue(false);
    const mala = await PUT(makeRequest("PUT", { email: "suspendido@ejemplo.com", password: "malo" }));
    expect(mala.status).toBe(401);
    expect(mockRestoreUser).not.toHaveBeenCalled();

    mockCompare.mockResolvedValue(true);
    const ok = await PUT(makeRequest("PUT", { email: "suspendido@ejemplo.com", password: "buena" }));
    expect(ok.status).toBe(200);
    expect(mockRestoreUser).toHaveBeenCalledWith("u9");
  });

  it("T0.2 PUT rechaza cuentas cuya gracia ya termino", async () => {
    const { PUT } = await import("@/app/api/user/settings/route");
    mockGetSoftDeletedUserByEmail.mockResolvedValue({
      id: "u10",
      email: "viejo@ejemplo.com",
      password_hash: HASH,
      deleted_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const res = await PUT(makeRequest("PUT", { email: "viejo@ejemplo.com", password: "buena" }));
    expect(res.status).toBe(410);
    expect(mockRestoreUser).not.toHaveBeenCalled();
  });

  it("T0.2 PUT responde 404 si no hay cuenta suspendida con ese email", async () => {
    const { PUT } = await import("@/app/api/user/settings/route");
    mockGetSoftDeletedUserByEmail.mockResolvedValue(null);
    const res = await PUT(makeRequest("PUT", { email: "nadie@ejemplo.com", password: "x" }));
    expect(res.status).toBe(404);
  });
});
