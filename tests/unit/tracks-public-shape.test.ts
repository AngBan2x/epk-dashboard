import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

/**
 * P4 (RC.31, S1) — `GET /api/tracks` devolvía la fila CRUDA a un anónimo.
 *
 * ── Por qué este test y no otro más del mismo Specify ──────────────────────
 * El `WHERE status = 'approved'` que traía la ruta era correcto y aun así
 * filtraba. La columna `tracks.admin_notes` —el motivo interno por el que el
 * admin rechaza un release— está en el esquema y sale dentro de un `SELECT *`
 * de una fila APROBADA, así que cualquier visitante se la llevaba sin sesión y
 * sin saber ningún id. Es la misma clase de fuga que P4 tapó en
 * `app/api/releases/route.ts`, por la otra puerta: dos rutas distintas, un
 * mismo `SELECT *` sobre `tracks`. Los tests de `/api/tracks/:id` y de
 * `/api/releases` pasan igual con esta fuga viva, porque ninguno ejercita el
 * LISTADO público.
 *
 * ── Lo que fija ────────────────────────────────────────────────────────────
 *  1. el anónimo no recibe `admin_notes` —ni en su fila ni en el JSON entero;
 *  2. el admin conserva el alcance completo (necesario para aprobar y para ver
 *     lo que no está publicado);
 *  3. el cuerpo crudo de la ruta NO puede volver a hacer SQL por su cuenta, y
 *     el filtro de estado no puede desaparecer. Estas dos son de FUENTE: el
 *     arreglo correcto puede legitimamente cambiar de forma, y lo que no puede
 *     cambiar es volver a serializar `SELECT *` al público.
 */

vi.mock("@/lib/approval-notifications", () => ({
  notifyApprovalDecision: vi.fn(async () => ({ notificationCreated: true, emailSent: false })),
}));
vi.mock("@/lib/subscriber-notifications", () => ({
  notifyArtistSubscribers: vi.fn(async () => ({ notified: 0, emailsSent: 0, skipped: 0, failures: [] })),
  notifyArtistOwner: vi.fn(async () => ({ notified: 0, emailsSent: 0, skipped: 0, failures: [] })),
}));

import { GET as tracksListGET } from "@/app/api/tracks/route";
import { createSessionToken } from "@/lib/auth";
import { createArtist, createUser, deleteArtist, deleteUser, getDbWrite, isTursoConfigured } from "@/lib/db";

const BASE = "http://localhost:3000";
const SWEEP = `${Date.now()}`;
const OWNER_USER_ID = `tracks-shape-owner-${SWEEP}`;
const ARTIST_NAME = `Artista Track Shape ${SWEEP}`;
const ADMIN_NOTES = `motivo interno que no debe salir ${SWEEP}`;
const APPROVED_ID = `tracks-shape-approved-${SWEEP}`;
const DRAFT_ID = `tracks-shape-draft-${SWEEP}`;

let ownerToken = "";
let sweepArtistId = "";

function jsonRequest(url: string, options: { token?: string; ip?: string } = {}): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.cookie = `auth_session=${options.token}`;
  if (options.ip) headers["x-forwarded-for"] = options.ip;
  return new NextRequest(url, { method: "GET", headers });
}

function insertTrack(id: string, status: string, adminNotes: string | null) {
  getDbWrite()
    .prepare(
      `INSERT INTO tracks (id, title, artist_name, release_type, release_date, duration,
                           cover_image, audio_preview_url, status, admin_notes, created_at)
       VALUES (?, ?, ?, 'Single', '2026-01-01', '03:00', '', '', ?, ?, datetime('now'))`
    )
    .run(id, `Track ${id}`, ARTIST_NAME, status, adminNotes);
}

beforeAll(async () => {
  if (isTursoConfigured()) return;
  ownerToken = await createSessionToken({
    userId: OWNER_USER_ID,
    email: `tracks-shape-${SWEEP}@example.com`,
    role: "artist",
  });
  const db = getDbWrite();
  db.prepare("DELETE FROM tracks WHERE id IN (?, ?)").run(APPROVED_ID, DRAFT_ID);
  db.prepare("DELETE FROM artists WHERE name = ?").run(ARTIST_NAME);
  await deleteUser(OWNER_USER_ID);

  await createUser({
    id: OWNER_USER_ID,
    name: `Artista Track Shape ${SWEEP}`,
    email: `tracks-shape-${SWEEP}@example.com`,
    password_hash: "x",
    role: "artist",
    preferences: {
      email_notifications: true,
      push_notifications: true,
      new_release_alerts: true,
      show_alerts: true,
      marketing_emails: false,
    },
    avatar: null,
    email_verified: false,
    deleted_at: null,
    last_login: null,
  });
  sweepArtistId = (await createArtist({ name: ARTIST_NAME, userId: OWNER_USER_ID })).id;

  // La fila APROBADA es la que importa: el `admin_notes` se escribe ahí para
  // reproducir exactamente la fuga, que no dependía del estado de la fila.
  insertTrack(APPROVED_ID, "approved", ADMIN_NOTES);
  insertTrack(DRAFT_ID, "draft", ADMIN_NOTES);
});

afterAll(async () => {
  if (isTursoConfigured()) return;
  const db = getDbWrite();
  db.prepare("DELETE FROM tracks WHERE id IN (?, ?)").run(APPROVED_ID, DRAFT_ID);
  await deleteArtist(sweepArtistId);
  await deleteUser(OWNER_USER_ID);
});

describe("P4/S1 — GET /api/tracks no filtra admin_notes al anónimo", () => {
  it("la fila aprobada del listado anónimo no trae admin_notes", async () => {
    if (isTursoConfigured()) return;
    const res = await tracksListGET(jsonRequest(`${BASE}/api/tracks`, { ip: "10.30.0.1" }));
    expect(res.status).toBe(200);

    const json = await res.json();
    const tracks = json.tracks as Record<string, unknown>[];
    const row = tracks.find((t) => t.id === APPROVED_ID);
    expect(row).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(row!, "admin_notes")).toBe(false);

    // La aserción que hace trabajo: no basta con que falte en la fila que el
    // test ha sembrado, tiene que faltar en NINGÚN sitio de la respuesta. Sin
    // esto, mover la columna a otro brazo de un `if` dejaría el test verde.
    expect(JSON.stringify(json)).not.toContain(ADMIN_NOTES);

  });

  it("el listado anónimo sigue sin incluir lo que no está aprobado", async () => {
    if (isTursoConfigured()) return;
    const res = await tracksListGET(jsonRequest(`${BASE}/api/tracks`, { ip: "10.30.0.2" }));
    const json = await res.json();
    const ids = (json.tracks as { id: string }[]).map((t) => t.id);
    expect(ids).toContain(APPROVED_ID);
    expect(ids).not.toContain(DRAFT_ID);
    expect(JSON.stringify(json)).not.toContain(DRAFT_ID);
  });

  it("el listado anónimo conserva los campos que el reproductor y las tarjetas usan", async () => {
    if (isTursoConfigured()) return;
    const res = await tracksListGET(jsonRequest(`${BASE}/api/tracks`, { ip: "10.30.0.3" }));
    const json = await res.json();
    const row = (json.tracks as Record<string, unknown>[]).find((t) => t.id === APPROVED_ID);
    // El acotado no puede comerse el catálogo: `AudioPlayer`, `EPKCard`,
    // `AdminTrack` y `scripts/gallery-functional.ts` leen de aquí.
    for (const key of [
      "id",
      "title",
      "artist_name",
      "release_type",
      "release_date",
      "duration",
      "cover_image",
      "audio_preview_url",
      "spotify_url",
      "youtube_video_id",
      "lyrics",
      "status",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(row!, key)).toBe(true);
    }
  });

  it("el admin conserva el alcance completo para poder aprobar y ver lo no publicado", async () => {
    if (isTursoConfigured()) return;
    const adminToken = await createSessionToken({
      userId: `tracks-shape-admin-${SWEEP}`,
      email: `tracks-shape-admin-${SWEEP}@example.com`,
      role: "admin",
    });
    const res = await tracksListGET(jsonRequest(`${BASE}/api/tracks`, { token: adminToken, ip: "10.30.0.4" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = (json.tracks as { id: string }[]).map((t) => t.id);
    expect(ids).toContain(APPROVED_ID);
    expect(ids).toContain(DRAFT_ID);
  });

  it("un artist autenticado que no es admin no gana la fila cruda por tener sesión", async () => {
    if (isTursoConfigured()) return;
    // El leaks-by-session sería el otro error posible: tratar "tiene sesión" como
    // "es de confianza". El corte es por ROL, no por presencia de cookie.
    const res = await tracksListGET(jsonRequest(`${BASE}/api/tracks`, { token: ownerToken, ip: "10.30.0.5" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain(ADMIN_NOTES);
    const ids = (json.tracks as { id: string }[]).map((t) => t.id);
    expect(ids).not.toContain(DRAFT_ID);
  });
});

// ── De fuente: el arreglo puede cambiar de forma, no de criterio ────────────
const tracksRouteSource = readFileSync(
  path.join(process.cwd(), "app", "api", "tracks", "route.ts"),
  "utf8"
);
const dbSource = readFileSync(path.join(process.cwd(), "lib", "db.ts"), "utf8");

describe("P4/S1 — la ruta no vuelve a serializar SQL por su cuenta", () => {
  it("la ruta NO contiene un SELECT crudo sobre tracks", () => {
    // Este es el que falla al revertir el arreglo: sin él, los tests de arriba
    // seguirían verdes con un `dbQuery("SELECT * FROM tracks …")` porque el
    // `status='approved'` está implícito en otra parte. Lo que no puede volver
    // es que la ruta monte el `*` ella misma.
    expect(tracksRouteSource).not.toMatch(/SELECT\s+\*\s+FROM\s+tracks/i);
  });

  it("el listado público pasa por un lector de alcance, no por SQL local", () => {
    // Anclado a la RAMA, no al fichero: un `toContain("getApprovedTracks()")`
    // suelto lo satisfaría el comentario que explica el arreglo, que es
    // justamente lo que no tiene que poder hacer pasar el test.
    expect(tracksRouteSource).toMatch(
      /if\s*\(isAdmin\)\s*\{[\s\S]{0,200}getAllTracks\(\)[\s\S]{0,200}\}\s*else\s*\{[\s\S]{0,200}getApprovedTracks\(\)/
    );
    expect(tracksRouteSource).toMatch(/import\s*\{[^}]*\bgetApprovedTracks\b[^}]*\}\s*from\s*"@\/lib\/db"/);
  });

  it("el lector de alcance filtra por estado y devuelve la forma parseada", () => {
    const start = dbSource.indexOf("export async function getApprovedTracks(");
    expect(start).toBeGreaterThan(-1);
    const body = dbSource.slice(start, start + 1600);
    expect(body).toMatch(/status\s*=\s*'approved'/);
    // `parseTrack` y no la fila cruda: la whitelist es la que hace que una
    // columna sensible nueva no se filtre por forgotten. Y tiene que estar en
    // LOS DOS brazos —Turso y SQLite local—, no solo en el que se ejecuta en
    // desarrollo: si el brazo de Turso devolviera la fila cruda, la fuga
    // volvería en producción y ningún test local lo vería.
    expect(body.match(/parseTrack/g) ?? []).toHaveLength(2);
    expect(body).not.toContain("return rows;");
  });
});
