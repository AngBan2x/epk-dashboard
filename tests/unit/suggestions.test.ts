/**
 * P4 · Buzón de sugerencias — contrato del anti-spam y de la autorización.
 *
 * ── Por qué estas pruebas existen ─────────────────────────────────────────────
 * El buzón es la única superficie del proyecto que es PÚBLICA y SIN CUENTA. Las
 * otras cuatro capas del anti-spam son Defense-in-depth: si una falla, otra
 * aguanta. La que NO tiene red detrás es la última — que el `GET` devuelva el
 * buzón solo a un admin — porque un fallo ahí no es spam: es la lista completa de
 * correos y mensajes de todos los que han escrito alguna vez.
 *
 * Y hay una asimetría que no se puede dejar sin comprobar: cuatro de las cinco
 * capas devuelven EXACTAMENTE la misma respuesta que el camino feliz. Es
 * deliberado (si no, un bot aprende la tabla de capas probándolas en orden), y
 * por lo mismo es fácil de romper sin querer: cualquier `return` distinto en una
 * de ellas es una fuga, y la fuga no se ve en los tests de "funciona". Estos
 * tests la vigilan comparando el cuerpo de la respuesta, no solo el status.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";

// ── Estado compartido entre las factorías de `vi.mock` ───────────────────────
// Las factorías se izan por encima de los imports, así que no pueden tocar
// variables de módulo declaradas abajo: por eso `vi.hoisted`.
const h = vi.hoisted(() => ({
  /** Fila falsa del "almacén": sustituye a SQLite y hace observable lo que se escribió. */
  rows: [] as {
    id: string;
    email: string;
    message: string;
    status: string;
    user_id: string | null;
    ip_hash: string | null;
    admin_notes: string | null;
    created_at: string;
    read_at: string | null;
    resolved_at: string | null;
  }[],
  createNotification: vi.fn(async (_input?: unknown) => ({}) as unknown),
  getAllUsers: vi.fn(),
  sendNotificationEmail: vi.fn(
    async (_input?: unknown) => ({ sent: true }) as { sent: boolean; reason?: string }
  ),
}));

/**
 * Solo se sustituyen las funciones que TOCAN la base de datos o el correo.
 * `hashSuggestionFingerprint`, `normalizeSuggestionEmail` e `isSuggestionStatus`
 * siguen siendo las REALES: el test del `ip_hash` verifica que el digest es un
 * HMAC de verdad, y eso no se puede comprobar contra un doble.
 */
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();

  return {
    ...actual,
    createSuggestion: vi.fn(async (input: {
      id: string;
      email: string;
      message: string;
      user_id?: string | null;
      ip_hash?: string | null;
    }) => {
      const row = {
        id: input.id,
        email: actual.normalizeSuggestionEmail(input.email),
        message: input.message,
        status: "new",
        user_id: input.user_id ?? null,
        ip_hash: input.ip_hash ?? null,
        admin_notes: null,
        created_at: new Date().toISOString(),
        read_at: null,
        resolved_at: null,
      };
      h.rows.push(row);
      return row;
    }),
    findRecentSuggestionByEmail: vi.fn(async (email: string, sinceIso: string) => {
      const normalized = actual.normalizeSuggestionEmail(email);
      const matches = h.rows.filter(
        (row) => row.email === normalized && row.created_at >= sinceIso
      );
      return matches.length > 0 ? matches[matches.length - 1] : null;
    }),
    getSuggestions: vi.fn(async () => ({
      suggestions: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    })),
    countSuggestionsByStatus: vi.fn(async () => ({
      new: 0,
      read: 0,
      resolved: 0,
      spam: 0,
      total: 0,
    })),
    getSuggestionById: vi.fn(async () => null),
    updateSuggestionStatus: vi.fn(async () => null),
    deleteSuggestion: vi.fn(async () => true),
    createNotification: h.createNotification,
    getAllUsers: h.getAllUsers,
  };
});

vi.mock("@/lib/auth", () => ({ validateRequest: vi.fn() }));

vi.mock("@/lib/email", () => ({ sendNotificationEmail: h.sendNotificationEmail }));

import { POST, GET } from "@/app/api/suggestions/route";
import { PATCH } from "@/app/api/suggestions/[id]/route";
import { validateRequest } from "@/lib/auth";
import { createSuggestion, findRecentSuggestionByEmail } from "@/lib/db";

const mockValidateRequest = validateRequest as unknown as ReturnType<typeof vi.fn>;
const mockCreateSuggestion = createSuggestion as unknown as ReturnType<typeof vi.fn>;
const mockFindRecent = findRecentSuggestionByEmail as unknown as ReturnType<typeof vi.fn>;

const ORIGINAL_SECRET = process.env.SESSION_SECRET;
const TEST_SECRET = "buzon-test-secret-no-usar-en-produccion-32b";

const BASE = "http://localhost:3000/api/suggestions";

/** Un mensaje que pasa las cinco capas sin tocar nada. */
const VALID_MESSAGE =
  "El reproductor de la ficha de Neon Harbor no arranca en Safari y se queda en blanco.";

/** IP distinta por petición: el rate limit es real y vive en memoria. */
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function postRequest(
  body: Record<string, unknown>,
  options: { ip?: string; cookie?: string } = {}
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-forwarded-for": options.ip ?? nextIp(),
  };
  if (options.cookie) headers.cookie = `auth_session=${options.cookie}`;
  return new NextRequest(BASE, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

/** Cuerpo válido + el timestamp en el pasado, para que la capa 2 no salte. */
function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: "persona@example.com",
    message: VALID_MESSAGE,
    empresa: "",
    form_started_at: Date.now() - 60_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.rows.length = 0;
  h.sendNotificationEmail.mockResolvedValue({ sent: true });
  h.createNotification.mockResolvedValue({});
  h.getAllUsers.mockResolvedValue([]);
  mockValidateRequest.mockResolvedValue(null);
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = ORIGINAL_SECRET;
});

// ─────────────────────────────────────────────────────────────────────────────
// Capa 1 · honeypot
// ─────────────────────────────────────────────────────────────────────────────
describe("P4 · honeypot (capa 1)", () => {
  it("con el campo trampa relleno NO escribe nada y devuelve el MISMO ok", async () => {
    const res = await POST(postRequest(validBody({ empresa: "Acme Industrial S.L." })));

    expect(res.status).toBe(201);
    // Idéntico byte a byte al camino feliz. Cualquier diferencia aquí (un 400, un
    // campo más, un `stored: false`) le dice al bot que esta capa existe.
    expect(await res.json()).toEqual({ ok: true });
    expect(mockCreateSuggestion).not.toHaveBeenCalled();
  });

  it("un campo trampa con solo espacios NO cuenta como relleno", async () => {
    // El `trim` importa: sin él, el autocompletado que mete un espacio suelto
    // dispararía el honeypot contra un usuario honesto.
    const res = await POST(postRequest(validBody({ empresa: "   " })));
    expect(res.status).toBe(201);
    expect(mockCreateSuggestion).toHaveBeenCalledTimes(1);
  });

  it("el honeypot se comprueba ANTES que la validación: un bot con email basura no recibe 400", async () => {
    const res = await POST(
      postRequest({ email: "esto-no-es-un-correo", message: "corto", empresa: "bot", form_started_at: Date.now() - 60_000 })
    );

    expect(res.status).toBe(201);
    expect(mockCreateSuggestion).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Capa 2 · tiempo de formulario
// ─────────────────────────────────────────────────────────────────────────────
describe("P4 · tiempo de formulario (capa 2)", () => {
  it("un envío en menos de 2 s NO se escribe", async () => {
    const res = await POST(postRequest(validBody({ form_started_at: Date.now() - 500 })));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockCreateSuggestion).not.toHaveBeenCalled();
  });

  it("un envío con más de 2 s sí se escribe", async () => {
    const res = await POST(postRequest(validBody({ form_started_at: Date.now() - 5_000 })));

    expect(res.status).toBe(201);
    expect(mockCreateSuggestion).toHaveBeenCalledTimes(1);
  });

  it("sin timestamp (petición fabricada a mano) NO se escribe", async () => {
    const body = validBody();
    delete body.form_started_at;

    const res = await POST(postRequest(body));

    expect(res.status).toBe(201);
    expect(mockCreateSuggestion).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Capa 5 · validación (la única que devuelve 400)
// ─────────────────────────────────────────────────────────────────────────────
describe("P4 · validación (capa 5)", () => {
  it("correo inválido → 400 con un mensaje que el usuario puede usar", async () => {
    const res = await POST(postRequest(validBody({ email: "no-es-un-correo" })));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(typeof json.error).toBe("string");
    expect(json.error.length).toBeGreaterThan(10);
    expect(json.fields.email).toBeTruthy();
    expect(mockCreateSuggestion).not.toHaveBeenCalled();
  });

  it("mensaje de 10 caracteres → 400", async () => {
    const res = await POST(postRequest(validBody({ message: "a".repeat(10) })));

    expect(res.status).toBe(400);
    expect(mockCreateSuggestion).not.toHaveBeenCalled();
  });

  it("mensaje de 5001 caracteres → 400", async () => {
    const res = await POST(postRequest(validBody({ message: "a".repeat(5001) })));

    expect(res.status).toBe(400);
    expect(mockCreateSuggestion).not.toHaveBeenCalled();
  });

  it("mensaje de exactamente 20 caracteres → aceptado", async () => {
    const res = await POST(postRequest(validBody({ message: "a".repeat(20) })));

    expect(res.status).toBe(201);
    expect(mockCreateSuggestion).toHaveBeenCalledTimes(1);
  });

  it("el email se normaliza a minúsculas antes de guardar", async () => {
    await POST(postRequest(validBody({ email: "  Persona@Example.COM " })));

    expect(h.rows[0]?.email).toBe("persona@example.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Capa 4 · una por correo cada 24 h
// ─────────────────────────────────────────────────────────────────────────────
describe("P4 · deduplicación por correo (capa 4)", () => {
  it("el mismo correo dos veces en 24 h: la segunda se descarta", async () => {
    const first = await POST(postRequest(validBody()));
    expect(first.status).toBe(201);
    expect(mockCreateSuggestion).toHaveBeenCalledTimes(1);

    const second = await POST(postRequest(validBody()));

    // Mismo ok: el usuario honesto que se equivoca de botón no ve un error, y el
    // bot no aprende que hay un límite por correo.
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual({ ok: true });
    expect(mockCreateSuggestion).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(1);
  });

  it("pasadas 24 h, el mismo correo vuelve a aceptarse", async () => {
    // Una fila de hace 25 h, con el correo YA normalizado.
    h.rows.push({
      id: "vieja",
      email: "persona@example.com",
      message: "mensaje anterior",
      status: "resolved",
      user_id: null,
      ip_hash: null,
      admin_notes: null,
      created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      read_at: null,
      resolved_at: null,
    });

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(201);
    expect(mockCreateSuggestion).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(2);
  });

  it("el límite es por correo, NO por IP: otra IP con el mismo correo también se descarta", async () => {
    const ipA = nextIp();
    await POST(postRequest(validBody(), { ip: ipA }));
    const before = mockCreateSuggestion.mock.calls.length;

    await POST(postRequest(validBody(), { ip: nextIp() }));

    // Es lo que hace esta regla MAS fuerte que un `email+IP`: un bot con granja de
    // IPs reutilizando el correo no cuela. Y no castiga al NAT porque dos personas
    // detrás de la misma IP tienen correos distintos.
    expect(mockCreateSuggestion).toHaveBeenCalledTimes(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `ip_hash`: HMAC, no la IP
// ─────────────────────────────────────────────────────────────────────────────
describe("P4 · ip_hash es un HMAC, no la IP en claro", () => {
  it("no contiene la IP y es un hex de 64 caracteres (SHA-256)", async () => {
    process.env.SESSION_SECRET = TEST_SECRET;
    const ip = "198.51.100.42";

    await POST(postRequest(validBody(), { ip }));

    const hash = h.rows[0]?.ip_hash;
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Ni la IP, ni su versión con puntos sueltos, ni ningún trozo thereof.
    expect(hash).not.toContain("198.51.100.42");
    expect(hash).not.toContain("198");
  });

  it("es reproducible para la misma IP y cambia con otra, con la misma clave", async () => {
    process.env.SESSION_SECRET = TEST_SECRET;

    await POST(postRequest(validBody(), { ip: "198.51.100.7" }));
    await POST(postRequest(validBody({ email: "otra@example.com" }), { ip: "198.51.100.7" }));
    await POST(postRequest(validBody({ email: "tercera@example.com" }), { ip: "198.51.100.8" }));

    const [first, second, third] = h.rows;
    expect(first?.ip_hash).toBe(second?.ip_hash);
    expect(first?.ip_hash).not.toBe(third?.ip_hash);
  });

  it("es un HMAC con SESSION_SECRET, no un hash simple", async () => {
    process.env.SESSION_SECRET = TEST_SECRET;
    const ip = "198.51.100.99";

    await POST(postRequest(validBody(), { ip }));

    // Calculado con `node:crypto` y no con la implementación del proyecto: si el
    // digest fuese un SHA plano, esto no coincidiría —y un SHA plano de una IP se
    // revierte por fuerza bruta en segundos.
    const expected = createHmac("sha256", TEST_SECRET)
      .update(`suggestions:ip:${ip}`)
      .digest("hex");
    expect(h.rows[0]?.ip_hash).toBe(expected);
  });

  it("cambia al cambiar de clave: el mismo valor no es comparable entre entornos", async () => {
    const ip = "198.51.100.123";

    process.env.SESSION_SECRET = TEST_SECRET;
    await POST(postRequest(validBody(), { ip }));
    const withTestSecret = h.rows[0]?.ip_hash;

    h.rows.length = 0;
    process.env.SESSION_SECRET = "otra-clave-distinta-32-caraacteres-minimo";
    await POST(postRequest(validBody(), { ip }));

    expect(h.rows[0]?.ip_hash).not.toBe(withTestSecret);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Autorización del GET y del PATCH
// ─────────────────────────────────────────────────────────────────────────────
describe("P4 · el buzón es solo de admin", () => {
  function adminGet(cookie?: string): NextRequest {
    const headers: Record<string, string> = cookie ? { cookie: `auth_session=${cookie}` } : {};
    return new NextRequest(BASE, { method: "GET", headers });
  }

  it("GET sin sesión → 401", async () => {
    mockValidateRequest.mockResolvedValue(null);

    const res = await GET(adminGet());

    expect(res.status).toBe(401);
  });

  it("GET con sesión de ARTIST → 403 (tener cuenta no basta)", async () => {
    mockValidateRequest.mockResolvedValue({ userId: "u1", role: "artist" });

    const res = await GET(adminGet());

    expect(res.status).toBe(403);
  });

  it("GET con sesión de SUBSCRIBER → 403", async () => {
    mockValidateRequest.mockResolvedValue({ userId: "u1", role: "subscriber" });

    const res = await GET(adminGet());

    expect(res.status).toBe(403);
  });

  it("GET con un rol desconocido → 403, no 200", async () => {
    // Un token manipulado con `role: "Admin"` (mayúscula) o cualquier basura no
    // puede colarse por comparación laxa.
    mockValidateRequest.mockResolvedValue({ userId: "u1", role: "Admin" });

    const res = await GET(adminGet());

    expect(res.status).toBe(403);
  });

  it("GET con sesión de admin → 200", async () => {
    mockValidateRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });

    const res = await GET(adminGet());

    expect(res.status).toBe(200);
  });

  it("PATCH sin sesión → 401, y con sesión de artist → 403", async () => {
    const patchRequest = () =>
      new NextRequest(`${BASE}/x`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved" }),
        headers: { "Content-Type": "application/json" },
      });
    const params = { params: { id: "sug-1" } };

    mockValidateRequest.mockResolvedValue(null);
    const anon = await PATCH(patchRequest(), params);
    expect(anon.status).toBe(401);

    mockValidateRequest.mockResolvedValue({ userId: "u1", role: "artist" });
    const artist = await PATCH(patchRequest(), params);
    expect(artist.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El aviso al admin es best-effort
// ─────────────────────────────────────────────────────────────────────────────
describe("P4 · un fallo de Resend NO borra la sugerencia", () => {
  it("si el email lanza una excepción, la fila sigue ahí y la respuesta es 201", async () => {
    process.env.SESSION_SECRET = TEST_SECRET;
    h.getAllUsers.mockResolvedValue([
      { id: "admin-1", name: "Admin", email: "admin@epk.local", role: "admin", deleted_at: null },
    ]);
    // Lo PEOR que puede pasar: el cliente de correo revienta con una excepción,
    // no que devuelva un error controlado.
    h.sendNotificationEmail.mockRejectedValue(new Error("Resend: 502 upstream"));

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockCreateSuggestion).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]?.message).toBe(VALID_MESSAGE);
  });

  it("si Resend devuelve sent:false, también se conserva", async () => {
    h.getAllUsers.mockResolvedValue([
      { id: "admin-1", name: "Admin", email: "admin@epk.local", role: "admin", deleted_at: null },
    ]);
    h.sendNotificationEmail.mockResolvedValue({ sent: false, reason: "FROM_EMAIL no configurado" });

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(201);
    expect(h.rows).toHaveLength(1);
  });

  it("si la notificación in-app falla, el mensaje se guarda igual", async () => {
    h.getAllUsers.mockResolvedValue([
      { id: "admin-1", name: "Admin", email: "admin@epk.local", role: "admin", deleted_at: null },
    ]);
    h.createNotification.mockRejectedValue(new Error("notifications table missing"));

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(201);
    expect(h.rows).toHaveLength(1);
  });

  it("si no hay ningún admin activo, se guarda igual y no rompe", async () => {
    h.getAllUsers.mockResolvedValue([]);

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(201);
    expect(h.rows).toHaveLength(1);
  });

  it("con admin activo llega una notificación in-app, con el id de la sugerencia", async () => {
    h.getAllUsers.mockResolvedValue([
      { id: "admin-1", name: "Admin", email: "admin@epk.local", role: "admin", deleted_at: null },
    ]);

    await POST(postRequest(validBody()));

    expect(h.createNotification).toHaveBeenCalledTimes(1);
    const payload = h.createNotification.mock.calls[0]?.[0] as unknown as {
      type: string;
      data: string;
      message: string;
    };
    expect(payload.type).toBe("system");
    const data = JSON.parse(payload.data) as { suggestionId: string };
    expect(data.suggestionId).toBe(h.rows[0]?.id);
    // El preview lleva el correo del remitente: es con lo que el admin contesta.
    expect(payload.message).toContain("persona@example.com");
  });

  it("un admin suspended no recibe aviso (deleted_at), y el mensaje sigue guardado", async () => {
    h.getAllUsers.mockResolvedValue([
      { id: "admin-1", name: "Admin", email: "admin@epk.local", role: "admin", deleted_at: "2026-01-01" },
    ]);

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(201);
    expect(h.createNotification).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El 429: el único rechazo que el usuario honesto puede ver
// ─────────────────────────────────────────────────────────────────────────────
describe("P4 · el rate limit por IP es el único 429", () => {
  it("a la undécima petición desde la misma IP responde 429 con Retry-After", async () => {
    const ip = "192.0.2.200";

    for (let attempt = 1; attempt <= 10; attempt++) {
      const res = await POST(postRequest(validBody({ email: `user${attempt}@example.com` }), { ip }));
      expect(res.status, `petición ${attempt}`).toBe(201);
    }

    const limited = await POST(postRequest(validBody({ email: "once-more@example.com" }), { ip }));

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    // Y una IP distinta no se ve afectada: es justo el caso de la NAT compartida
    // que hace alto este límite en lugar de bajarlo a uno.
    const other = await POST(postRequest(validBody(), { ip: "192.0.2.201" }));
    expect(other.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El POST es anónimo: la sesión es contexto, no un requisito
// ─────────────────────────────────────────────────────────────────────────────
describe("P4 · el buzón es anónimo", () => {
  it("sin sesión se acepta y `user_id` queda NULL", async () => {
    mockValidateRequest.mockResolvedValue(null);

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(201);
    expect(h.rows[0]?.user_id).toBeNull();
  });

  it("con sesión se guarda el user_id como contexto", async () => {
    mockValidateRequest.mockResolvedValue({ userId: "user-42", role: "subscriber" });

    await POST(postRequest(validBody()));

    expect(h.rows[0]?.user_id).toBe("user-42");
  });

  it("la respuesta NO lleva id, status ni nada enumerable", async () => {
    const res = await POST(postRequest(validBody()));
    const json = await res.json();

    expect(Object.keys(json).sort()).toEqual(["ok"]);
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain(h.rows[0]?.id ?? "imposible");
    expect(serialized).not.toContain("persona@example.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Consulta de deduplicación: la ventana que se le pasa al almacén
// ─────────────────────────────────────────────────────────────────────────────
describe("P4 · la ventana de deduplicación son 24 h", () => {
  it("pasa un umbral ISO de hace 24 h, no un `datetime('now')` de SQLite", async () => {
    const before = Date.now();
    await POST(postRequest(validBody()));
    const after = Date.now();

    const threshold = mockFindRecent.mock.calls[0]?.[1] as string;
    // ISO con `Z`: es lo que espera la comparación lexicográfica de
    // `created_at >= ?` sobre filas que también se escriben en ISO.
    expect(threshold).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const parsed = Date.parse(threshold);
    expect(parsed).toBeGreaterThanOrEqual(before - 24 * 60 * 60 * 1000 - 1000);
    expect(parsed).toBeLessThanOrEqual(after - 24 * 60 * 60 * 1000 + 1000);
  });
});