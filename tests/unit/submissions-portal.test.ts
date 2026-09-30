import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { GET, POST } from "@/app/api/submissions/route";
import { middleware } from "@/middleware";
import { createSessionToken } from "@/lib/auth";
import { createUser, deleteUser, getDbWrite, isTursoConfigured } from "@/lib/db";

/**
 * P16 — el portal `/submissions` no es un adorno de UI: es lo único que hace
 * que el flujo suscriptor → artista sea alcanzable.
 *
 * Lo que ya estaba escrito y funcionaba antes de esta fase (y por eso el bug
 * era invisible): `POST /api/submissions` solo exige sesión, toma el `userId`
 * de la sesión en vez de un header falsificable y fuerza `status: "pending"`.
 *
 * Lo que faltaba era la página. Y lo que faltaba en la página, y que estos
 * tests fijan por contrato, son los dos campos que hacen imposible enviar a
 * mano: `cover_image` y `audio_preview_url` son `z.string().url()`
 * OBLIGATORIAS en `CreateSubmissionSchema`.
 */
const BASE = "http://localhost:3000";
const SUFFIX = `${Date.now()}`;
const SUBSCRIBER_USER_ID = `portal-sub-${SUFFIX}`;
const OTHER_USER_ID = `portal-other-${SUFFIX}`;

const ARTWORK = "https://is1-ssl.mzstatic.com/image/thumb/600x600/aaa.jpg";
const PREVIEW = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview.m4a";

let subscriberToken = "";
let otherToken = "";

function jsonRequest(url: string, options: { method?: string; body?: unknown; token?: string } = {}): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.cookie = `auth_session=${options.token}`;
  return new NextRequest(url, {
    method: options.method ?? "GET",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
  });
}

/** Payload mínimo que pasa `CreateSubmissionSchema`. */
function validTrackData(overrides: Record<string, unknown> = {}) {
  return {
    title: `Tema Portal ${SUFFIX}`,
    artist_name: `Artista Portal ${SUFFIX}`,
    release_type: "single",
    release_date: "2026-05-01",
    duration: "3:45",
    cover_image: ARTWORK,
    audio_preview_url: PREVIEW,
    ...overrides,
  };
}

function submissionIds(): string[] {
  const db = getDbWrite();
  return (
    db
      .prepare("SELECT id FROM track_submissions WHERE user_id = ?")
      .all(SUBSCRIBER_USER_ID) as { id: string }[]
  ).map((r) => r.id);
}

function clearSubmissions() {
  const db = getDbWrite();
  for (const id of submissionIds()) {
    db.prepare("DELETE FROM track_submissions WHERE id = ?").run(id);
  }
}

beforeAll(async () => {
  if (isTursoConfigured()) return;
  subscriberToken = await createSessionToken({
    userId: SUBSCRIBER_USER_ID,
    email: `portal-sub-${SUFFIX}@example.com`,
    role: "subscriber",
  });
  otherToken = await createSessionToken({
    userId: OTHER_USER_ID,
    email: `portal-other-${SUFFIX}@example.com`,
    role: "subscriber",
  });

  const prefs = {
    email_notifications: true,
    push_notifications: true,
    new_release_alerts: true,
    show_alerts: true,
    marketing_emails: false,
  };
  await createUser({
    id: SUBSCRIBER_USER_ID,
    name: `Artista Portal ${SUFFIX}`,
    email: `portal-sub-${SUFFIX}@example.com`,
    password_hash: "x",
    role: "subscriber",
    preferences: prefs,
    avatar: null,
    email_verified: false,
    deleted_at: null,
    last_login: null,
  });
  await createUser({
    id: OTHER_USER_ID,
    name: `Otro Portal ${SUFFIX}`,
    email: `portal-other-${SUFFIX}@example.com`,
    password_hash: "x",
    role: "subscriber",
    preferences: prefs,
    avatar: null,
    email_verified: false,
    deleted_at: null,
    last_login: null,
  });
  clearSubmissions();
});

afterAll(async () => {
  if (isTursoConfigured()) return;
  clearSubmissions();
  await deleteUser(SUBSCRIBER_USER_ID);
  await deleteUser(OTHER_USER_ID);
});

describe("P16 — un suscriptor puede enviar música por POST /api/submissions", () => {
  it("acepta el envío de un suscriptor y lo deja pending con su userId de sesión", async () => {
    if (isTursoConfigured()) return;
    const res = await POST(
      jsonRequest(`${BASE}/api/submissions`, {
        method: "POST",
        body: { track_data: validTrackData() },
        token: subscriberToken,
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe("pending");
    // El userId sale de la SESIÓN, nunca de un body ni de un header: es lo que
    // impide que un suscriptor envíe contenido en nombre de otro y se lo
    // atribuya.
    expect(json.user_id).toBe(SUBSCRIBER_USER_ID);
    expect(json.status_label).toBe("Pendiente");
    // La promoción se dispara desde aquí: `userHasApprovedContent`
    // (`lib/artist-promotion.ts:112-116`) solo lee `track_submissions`.
    expect(json.id).toBeTruthy();
  });

  it("rechaza sin sesión con 401", async () => {
    if (isTursoConfigured()) return;
    const res = await POST(
      jsonRequest(`${BASE}/api/submissions`, { method: "POST", body: { track_data: validTrackData() } })
    );
    expect(res.status).toBe(401);
  });

  it("rechaza con 400 si falta cover_image (es url() obligatoria, no opcional)", async () => {
    if (isTursoConfigured()) return;
    const { cover_image: _omit, ...withoutCover } = validTrackData();
    const res = await POST(
      jsonRequest(`${BASE}/api/submissions`, {
        method: "POST",
        body: { track_data: withoutCover },
        token: subscriberToken,
      })
    );
    expect(res.status).toBe(400);
  });

  it("rechaza con 400 si falta audio_preview_url (el campo que /releases/new descarta)", async () => {
    if (isTursoConfigured()) return;
    const { audio_preview_url: _omit, ...withoutPreview } = validTrackData();
    const res = await POST(
      jsonRequest(`${BASE}/api/submissions`, {
        method: "POST",
        body: { track_data: withoutPreview },
        token: subscriberToken,
      })
    );
    expect(res.status).toBe(400);
  });

  it("rechaza con 400 si cover_image no es una URL absoluta", async () => {
    if (isTursoConfigured()) return;
    const res = await POST(
      jsonRequest(`${BASE}/api/submissions`, {
        method: "POST",
        body: { track_data: validTrackData({ cover_image: "portada.jpg" }) },
        token: subscriberToken,
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("P16 — el listado del portal devuelve solo los envíos propios", () => {
  it("el suscriptor ve lo que ha enviado, con etiqueta en español", async () => {
    if (isTursoConfigured()) return;
    const res = await GET(jsonRequest(`${BASE}/api/submissions`, { token: subscriberToken }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThanOrEqual(1);
    expect(
      json.every((s: { user_id: string }) => s.user_id === SUBSCRIBER_USER_ID)
    ).toBe(true);
    expect(json[0].status_label).toBeTruthy();
  });

  it("otro suscriptor no ve los envíos ajenos", async () => {
    if (isTursoConfigured()) return;
    const res = await GET(jsonRequest(`${BASE}/api/submissions`, { token: otherToken }));
    expect(res.status).toBe(200);
    const json = await res.json();
    const own = json.filter((s: { user_id: string }) => s.user_id === SUBSCRIBER_USER_ID);
    expect(own).toHaveLength(0);
  });

  it("pedir el envío de otro usuario por id responde 403", async () => {
    if (isTursoConfigured()) return;
    const mine = await GET(jsonRequest(`${BASE}/api/submissions`, { token: subscriberToken }));
    const first = (await mine.json())[0];

    const res = await GET(
      jsonRequest(`${BASE}/api/submissions?id=${first.id}`, { token: otherToken })
    );
    expect(res.status).toBe(403);
  });

  it("sin sesión responde 401", async () => {
    if (isTursoConfigured()) return;
    const res = await GET(jsonRequest(`${BASE}/api/submissions`));
    expect(res.status).toBe(401);
  });

  it("filtra por estado", async () => {
    if (isTursoConfigured()) return;
    const res = await GET(
      jsonRequest(`${BASE}/api/submissions?status=approved`, { token: subscriberToken })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.every((s: { status: string }) => s.status === "approved")).toBe(true);
  });
});

/**
 * Un token sin rol no puede convertirse en "admin" ni en "artist" por defecto.
 *
 * `validateSession` usaba `session.role || "artist"`, así que un token al que
 * le faltase el rol pasaba por artista. Hoy el daño es nulo porque `isAdmin`
 * compara contra `"admin"` y no hay ninguna rama que confíe en "artist"... y por
 * eso es una bomba de relojería: en cuanto el portal crezca un paso, ese valor
 * inventado pasa a ser el que decide quién puede publicar.
 *
 * Se comprueba sobre el archivo, no sobre el comportamiento, porque el
 * comportamiento solo diferiría en un branching que hoy no existe. El archivo
 * es la única cosa que se puede fijar sin escribir código de relleno.
 */
/** Quita comentarios para que las aserciones de fuente miren CÓDIGO, no prosa. */
function codeOnly(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("P16 — un token sin rol no se eleva a artista por defecto", () => {
  it('no contiene el fallback `session.role || "artist"`', () => {
    // Sin esto, este mismo archivo de tests contiene la cadena en prosa y la
    // comprobación no distinguiría nada.
    const code = codeOnly("app/api/submissions/route.ts");
    expect(code).not.toMatch(/session\.role\s*\|\|\s*["']artist["']/);
    expect(code).not.toMatch(/role:\s*session\.role\s*\|\|/);
  });

  it("resuelve el rol contra una lista blanca en vez de inventar uno", () => {
    const code = codeOnly("app/api/submissions/route.ts");
    expect(code).toMatch(/KNOWN_ROLES/);
    expect(code).toMatch(/resolveRole/);
  });
});

/**
 * El portal tiene que ser alcanzable. `middleware.ts` es la única barrera de
 * ruta, y aquí se ejecuta de verdad en vez de leer su fuente: un test que
 * comprueba un regex sobre un archivo no falla cuando alguien reintroduce el
 * fallo, falla cuando alguien reescribe el archivo.
 *
 * Proteger de más sería tan grave como no proteger: exigir rol de artista en
 * `/submissions` reproduciría el deadlock que P16 viene a cerrar, en silencio.
 */
describe("P16 — /submissions es alcanzable por cualquier usuario autenticado", () => {
  const url = (path: string, token?: string) => {
    const headers: Record<string, string> = {};
    if (token) headers.cookie = `auth_session=${token}`;
    return new NextRequest(`http://localhost:3000${path}`, { headers });
  };

  it("sin sesión redirige a /login", async () => {
    const res = await middleware(url("/submissions"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it.each([
    ["subscriber", "subscriber"],
    ["artist", "artist"],
    ["admin", "admin"],
  ])("un usuario con rol %s pasa", async (_label, role) => {
    const token = await createSessionToken({
      userId: `portal-mw-${SUFFIX}`,
      email: `portal-mw-${SUFFIX}@example.com`,
      role,
    });
    const res = await middleware(url("/submissions", token));
    // NextResponse.next() no fija status: un 200 con el header `x-middleware-next`
    // es la señal de "sigue adelante".
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

/**
 * P4 — defensa en servidor para `/releases/:id/edit`.
 *
 * `requireAuth` solo valida la firma HMAC y la expiración: un `subscriber`
 * autenticado lo superaba igual que un admin. El formulario de edición se
 * cerraba solo en cliente (`app/releases/[id]/edit/page.tsx:143-154`, que
 * compara el nombre del artista en el navegador), así que un suscriptor
 * autenticado podía abrir el formulario de edición de cualquier release. La
 * escritura siempre estuvo protegida en `PUT /api/releases`; esto es cerrar la
 * puerta antes de que el usuario escriba el formulario entero para recibir un
 * 403.
 *
 * Lo que NO se puede comprobar aquí es la propiedad: el middleware corre en
 * Edge y no tiene base de datos. La propiedad se resuelve en
 * `GET /api/releases?id=X` (admin o dueño verificado contra `artists.user_id`),
 * y de nuevo en el `PUT`.
 */
describe("P4 — /releases/:id/edit exige rol de artista o admin, no solo sesión", () => {
  const url = (path: string, token?: string) => {
    const headers: Record<string, string> = {};
    if (token) headers.cookie = `auth_session=${token}`;
    return new NextRequest(`http://localhost:3000${path}`, { headers });
  };

  it("sin sesión redirige a /login", async () => {
    const res = await middleware(url("/releases/rel-1/edit"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("un subscriber autenticado es expulsado al dashboard (el agujero que se cerraba)", async () => {
    const token = await createSessionToken({
      userId: `portal-mw-${SUFFIX}`,
      email: `portal-mw-${SUFFIX}@example.com`,
      role: "subscriber",
    });
    const res = await middleware(url("/releases/rel-1/edit", token));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it.each([
    ["artist", "artist"],
    ["admin", "admin"],
  ])("un %s sí pasa el role gate", async (_label, role) => {
    const token = await createSessionToken({
      userId: `portal-mw-${SUFFIX}`,
      email: `portal-mw-${SUFFIX}@example.com`,
      role,
    });
    const res = await middleware(url("/releases/rel-1/edit", token));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("el role gate no se extiende a otras rutas de /releases", async () => {
    const token = await createSessionToken({
      userId: `portal-mw-${SUFFIX}`,
      email: `portal-mw-${SUFFIX}@example.com`,
      role: "subscriber",
    });
    // `/releases/new` sigue siendo solo `requireAuth` (lo ser antes): el
    // formulario nuevo acepta a cualquier autenticado y quien no pueda enviar
    // recibe 403 de la API, no un redirect que no explica nada.
    const res = await middleware(url("/releases/new", token));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

/**
 * La promoción vía SHOW es estructuralmente imposible y NO es un bug de este
 * portal. Se deja escrito porque descubrirlo por el camino difícil —un admin
 * que pregunta por qué un show aprobado no promovió a nadie— es más caro que
 * leerlo aquí.
 */
describe("P16 — la promoción vía show es estructuralmente imposible", () => {
  it("userHasApprovedContent exige perfil de artista para la rama de shows", () => {
    const source = codeOnly("lib/artist-promotion.ts");
    const fn = source.slice(
      source.indexOf("async function userHasApprovedContent"),
      source.indexOf("async function updateUserRole")
    );
    // Un suscriptor no tiene fila en `artists` (se crea como efecto de la
    // promoción), así que `getArtistByUserId` devuelve null y la rama de shows
    // nunca puede dispararse antes. Solo `getAllTrackSubmissions` es alcanzable.
    expect(fn).toMatch(/getArtistByUserId\(userId\)/);
    expect(fn).toMatch(/getAllTrackSubmissions\(\)/);
  });
});
