import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * P21.15 — el rate limit del login se aplicaba ANTES de validar la contraseña.
 *
 * Cinco intentos — acertados o no — apagaban la IP 60 s. Medido en la CI: todos
 * los specs comparte IP, así que la sexta llamada legítima devolvía 429 y el
 * fallo se reportaba como "login falló" en vez de como lo que era.
 *
 * La regla nueva, y la que estos tests atan:
 *
 *   - un login **válido** no gasta cuota (puedes hacer 50 seguidos);
 *   - un login **fallido** gasta una;
 *   - a la quinta falta, el sexto intento — aunque traiga la contraseña buena —
 *     responde 429.
 *
 * Se usa la librería **real**, no el mock: el punto justamente es cómo se
 * acumula el estado en el `Map` del módulo. Por eso cada test trae su propia IP
 * (`x-forwarded-for`), o el bucket de uno se comería al otro.
 */

const mockGetUserByEmail = vi.fn();
const mockCreateSessionToken = vi.fn(async (_arg: Record<string, unknown>) => "token.fake");
const mockCompare = vi.fn();

vi.mock("@/lib/db", () => ({ getUserByEmail: mockGetUserByEmail }));
vi.mock("bcryptjs", () => ({ default: { compare: mockCompare } }));
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, createSessionToken: mockCreateSessionToken };
});

const vivo = {
  id: "u1",
  name: "Ana",
  email: "ana@ejemplo.com",
  password_hash: "hash",
  role: "artist",
  deleted_at: null,
};

function loginRequest(ip: string, body: unknown = { email: "ana@ejemplo.com", password: "correcta" }) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function POST(ip: string, body?: unknown) {
  const { POST: handler } = await import("@/app/api/auth/login/route");
  return handler(loginRequest(ip, body));
}

describe("P21.15 el rate limit del login solo cuenta los intentos fallidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserByEmail.mockResolvedValue(vivo);
    mockCompare.mockResolvedValue(true);
    mockCreateSessionToken.mockResolvedValue("token.fake");
  });

  it("50 logins válidos seguidos desde la misma IP devuelven todos 200", async () => {
    // Antes de P21.15 el sexto devolvía 429: se gastaba cuota solo con
    // hacer la llamada, sin mirar si la contraseña era buena.
    for (let i = 0; i < 50; i++) {
      const res = await POST("10.0.1.50");
      expect(res.status, `intento ${i + 1}`).toBe(200);
    }
  });

  it("cinco intentos fallidos bloquean, y el sexto responde 429 aunque la contraseña sea buena", async () => {
    mockCompare.mockResolvedValue(false);

    for (let i = 0; i < 5; i++) {
      const res = await POST("10.0.1.51", { email: "ana@ejemplo.com", password: `mala-${i}` });
      expect(res.status, `fallo ${i + 1}`).toBe(401);
    }

    mockCompare.mockResolvedValue(true);
    const res = await POST("10.0.1.51", { email: "ana@ejemplo.com", password: "correcta" });

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("Too many requests");
  });

  it("los intentos fallidos de una IP no bloquean a otra IP distinta", async () => {
    mockCompare.mockResolvedValue(false);
    for (let i = 0; i < 5; i++) {
      await POST("10.0.1.52", { email: "ana@ejemplo.com", password: `mala-${i}` });
    }

    mockCompare.mockResolvedValue(true);
    const res = await POST("10.0.1.53");
    expect(res.status).toBe(200);
  });

  it("un 400 por body mal formado también gasta cuota", async () => {
    // Sin esto, el endpoint quedaba sin límite para payloads rotos: el `catch`
    // no contaba y se podía mandar basura sin parar.
    for (let i = 0; i < 5; i++) {
      const res = await POST("10.0.1.54", { email: "no-es-un-email" });
      expect(res.status, `400 ${i + 1}`).toBe(400);
    }

    mockGetUserByEmail.mockResolvedValue(vivo);
    const res = await POST("10.0.1.54");
    expect(res.status).toBe(429);
  });

  it("checkRateLimit sigue contando por defecto: el cambio no toca a los demás llamantes", async () => {
    // `register` y las demás rutas llaman a `checkRateLimit(key, n, ms)` sin
    // opciones. Si el default pasara a no contar, esas rutas quedarían sin
    // límite — el arreglo de P21.15 no puede pagar ese precio.
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const key = "registro-prueba-p21-15";

    const primero = checkRateLimit(key, 3, 60_000);
    const segundo = checkRateLimit(key, 3, 60_000);
    const tercero = checkRateLimit(key, 3, 60_000);
    const cuarto = checkRateLimit(key, 3, 60_000);

    expect(primero.allowed).toBe(true);
    expect(segundo.allowed).toBe(true);
    expect(tercero.allowed).toBe(true);
    expect(cuarto.allowed).toBe(false);
  });

  it("count:false lee la cuota sin gastarla", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const key = "lectura-p21-15";

    for (let i = 0; i < 10; i++) {
      const r = checkRateLimit(key, 5, 60_000, { count: false });
      expect(r.allowed, `lectura ${i + 1}`).toBe(true);
    }

    // Diez lecturas no han gastado nada: el bucket sigue en 0 y cabe un intento.
    const gasto = checkRateLimit(key, 5, 60_000);
    expect(gasto.allowed).toBe(true);
    expect(gasto.remaining).toBe(4);
  });

  it("un fallo del servidor (500) NO gasta cuota: un bug nuestro no bloquea al usuario", async () => {
    mockGetUserByEmail.mockRejectedValue(new Error("base de datos caída"));

    for (let i = 0; i < 5; i++) {
      const res = await POST("10.0.1.55");
      expect(res.status, `500 ${i + 1}`).toBe(500);
    }

    mockGetUserByEmail.mockResolvedValue(vivo);
    const res = await POST("10.0.1.55");
    expect(res.status).toBe(200);
  });
});
