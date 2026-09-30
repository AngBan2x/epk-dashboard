import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (_pathname: string, _file: unknown, options: { contentType?: string }) => ({
    url: `https://blob.example/${String(options?.contentType ?? "unknown")}`,
    pathname: "test",
    contentType: options?.contentType,
  })),
  del: vi.fn(async () => undefined),
}));

vi.mock("@/lib/approval-notifications", () => ({
  notifyApprovalDecision: vi.fn(async () => ({ notificationCreated: true, emailSent: false })),
}));

vi.mock("@/lib/subscriber-notifications", () => ({
  notifyArtistSubscribers: vi.fn(async () => ({ notified: 0, emailsSent: 0, skipped: 0, failures: [] })),
  notifyArtistOwner: vi.fn(async () => ({ notified: 0, emailsSent: 0, skipped: 0, failures: [] })),
}));

import { GET as dashboardGET } from "@/app/api/dashboard/route";
import { GET as artistsGET } from "@/app/api/artists/route";
import { GET as releasesGET, POST as releasesPOST, PUT as releasesPUT } from "@/app/api/releases/route";
import { GET as tracksGET } from "@/app/api/tracks/[id]/route";
import { POST as showsPOST, PUT as showsPUT, GET as showsGET } from "@/app/api/shows/route";
import { POST as subscriptionsPOST } from "@/app/api/subscriptions/route";
import { POST as likesPOST } from "@/app/api/likes/route";
import { POST as uploadPOST } from "@/app/api/upload/image/route";
import { createSessionToken } from "@/lib/auth";
import { createArtist, createShow, createUser, deleteUser, getDbWrite, isTursoConfigured } from "@/lib/db";
import { notifyApprovalDecision } from "@/lib/approval-notifications";
import { notifyArtistSubscribers } from "@/lib/subscriber-notifications";
import { put } from "@vercel/blob";

const mockNotifyApprovalDecision = notifyApprovalDecision as ReturnType<typeof vi.fn>;
const mockNotifyArtistSubscribers = notifyArtistSubscribers as ReturnType<typeof vi.fn>;
const mockPut = put as ReturnType<typeof vi.fn>;

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);
const SVG_BYTES = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const BASE = "http://localhost:3000";
const SUFFIX = `${Date.now()}`;
const OWNER_USER_ID = `sweep-owner-${SUFFIX}`;
const OTHER_TRACK_ID = `sweep-track-other-${SUFFIX}`;
const DRAFT_TRACK_ID = `sweep-track-draft-${SUFFIX}`;
const APPROVED_TRACK_ID = `sweep-track-approved-${SUFFIX}`;
const OWNED_TRACK_ID = `sweep-track-owned-${SUFFIX}`;
const RELEASE_TRACK_ID = `sweep-track-release-${SUFFIX}`;
const OWNED_ARTIST_NAME = `Artista Sweep ${SUFFIX}`;
const OTHER_ARTIST_NAME = `Artista Sweep Otro ${SUFFIX}`;

// P4 (S0): filas propias del caso "GET público por id". El hueco que había es
// invisible a la suite porque `?id=X&user_id=Y` (que sí está filtrado) era lo
// único que se ejercitaba. Estas cuatro filas cubren el camino sin `user_id`.
const PUBLIC_DRAFT_ID = `sweep-track-public-draft-${SUFFIX}`;
const PUBLIC_REJECTED_ID = `sweep-track-public-rejected-${SUFFIX}`;
const APPROVED_PARENT_ID = `sweep-track-parent-${SUFFIX}`;
const APPROVED_CHILD_ID = `sweep-track-child-${SUFFIX}`;
const ADMIN_NOTES = `motivo interno de admin ${SUFFIX}`;

// P12b (S0): un show sin aprobar y otro aprobado, para /api/shows.
let SHOW_APPROVED_ID = `sweep-show-approved-${SUFFIX}`;

let ownerToken = "";
let adminToken = "";
let artistId = "";
let showId = "";
let ownedArtistId = "";

function jsonRequest(
  url: string,
  options: { method?: string; body?: unknown; token?: string; ip?: string } = {}
): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.cookie = `auth_session=${options.token}`;
  if (options.ip) headers["x-forwarded-for"] = options.ip;
  return new NextRequest(url, {
    method: options.method ?? "GET",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
  });
}

function uploadRequest(token: string, ip: string, file: File): NextRequest {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", "profile");
  form.append("artistId", artistId);
  return new NextRequest(`${BASE}/api/upload/image`, {
    method: "POST",
    headers: { cookie: `auth_session=${token}`, "x-forwarded-for": ip },
    body: form,
  });
}

function insertTrack(id: string, artistName: string, status: string, extra?: { adminNotes?: string | null; releaseId?: string | null }) {
  const db = getDbWrite();
  db.prepare(
    `INSERT INTO tracks (id, title, artist_name, release_type, release_date, status, admin_notes, release_id, created_at)
     VALUES (?, ?, ?, 'Single', '2026-01-01', ?, ?, ?, datetime('now'))`
  ).run(id, `Track ${id}`, artistName, status, extra?.adminNotes ?? null, extra?.releaseId ?? null);
}

beforeAll(async () => {
  if (isTursoConfigured()) return;
  delete process.env.RESEND_API_KEY;

  ownerToken = await createSessionToken({
    userId: OWNER_USER_ID,
    email: `sweep-${SUFFIX}@example.com`,
    role: "artist",
  });
  adminToken = await createSessionToken({
    userId: `sweep-admin-${SUFFIX}`,
    email: `sweep-admin-${SUFFIX}@example.com`,
    role: "admin",
  });

  const db = getDbWrite();
  db.prepare("DELETE FROM tracks WHERE id IN (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    DRAFT_TRACK_ID, APPROVED_TRACK_ID, OWNED_TRACK_ID, OTHER_TRACK_ID, RELEASE_TRACK_ID,
    PUBLIC_DRAFT_ID, PUBLIC_REJECTED_ID, APPROVED_PARENT_ID, APPROVED_CHILD_ID
  );
  db.prepare("DELETE FROM shows WHERE id IN (?, ?)").run(showId, SHOW_APPROVED_ID);
  db.prepare("DELETE FROM artists WHERE name IN (?, ?)").run(OWNED_ARTIST_NAME, OTHER_ARTIST_NAME);
  await deleteUser(OWNER_USER_ID);

  await createUser({
    id: OWNER_USER_ID,
    name: `Artista Sweep ${SUFFIX}`,
    email: `sweep-${SUFFIX}@example.com`,
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

  insertTrack(DRAFT_TRACK_ID, OWNED_ARTIST_NAME, "draft");
  insertTrack(APPROVED_TRACK_ID, OWNED_ARTIST_NAME, "approved");
  insertTrack(OTHER_TRACK_ID, OTHER_ARTIST_NAME, "approved");
  insertTrack(OWNED_TRACK_ID, OWNED_ARTIST_NAME, "approved");
  insertTrack(RELEASE_TRACK_ID, OWNED_ARTIST_NAME, "pending");

  // P4: borrador y rechazado con `admin_notes` escrito, que es exactamente lo
  // que el `SELECT *` desnudo del camino público filtraba.
  insertTrack(PUBLIC_DRAFT_ID, OWNED_ARTIST_NAME, "draft", { adminNotes: ADMIN_NOTES });
  insertTrack(PUBLIC_REJECTED_ID, OWNED_ARTIST_NAME, "rejected", { adminNotes: ADMIN_NOTES });
  // Álbum aprobado cuya hija quedó en `draft`: `POST /api/releases:168` inserta
  // las hijas siempre como `draft`. Si el lector público no contempla al padre
  // aprobado, el álbum se publica vacío y sus pistas dan 404.
  insertTrack(APPROVED_PARENT_ID, OWNED_ARTIST_NAME, "approved");
  insertTrack(APPROVED_CHILD_ID, OWNED_ARTIST_NAME, "draft", { releaseId: APPROVED_PARENT_ID });

  const ownedArtist = await createArtist({ name: OWNED_ARTIST_NAME, userId: OWNER_USER_ID });
  artistId = ownedArtist.id;
  ownedArtistId = ownedArtist.id;
  const show = await createShow({
    artist_id: artistId,
    venue_name: `Sala Sweep ${SUFFIX}`,
    date: "2026-11-30",
    status: "proximamente",
  });
  showId = show.id;
  const approvedShow = await createShow({
    artist_id: artistId,
    venue_name: `Sala Sweep Aprobada ${SUFFIX}`,
    date: "2026-12-15",
    status: "proximamente",
    approved: true,
  });
  SHOW_APPROVED_ID = approvedShow.id;
});

afterAll(async () => {
  if (isTursoConfigured()) return;
  const db = getDbWrite();
  db.prepare("DELETE FROM tracks WHERE id IN (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    DRAFT_TRACK_ID, APPROVED_TRACK_ID, OWNED_TRACK_ID, OTHER_TRACK_ID, RELEASE_TRACK_ID,
    PUBLIC_DRAFT_ID, PUBLIC_REJECTED_ID, APPROVED_PARENT_ID, APPROVED_CHILD_ID
  );
  db.prepare("DELETE FROM shows WHERE id IN (?, ?)").run(showId, SHOW_APPROVED_ID);
  db.prepare("DELETE FROM artists WHERE name IN (?, ?)").run(OWNED_ARTIST_NAME, OTHER_ARTIST_NAME);
  await deleteUser(OWNER_USER_ID);
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("S1 — dashboard y artistas no filtran borradores ni exponen user_id", () => {
  it("anonimo no recibe borradores ni user_id en /api/dashboard", async () => {
    if (isTursoConfigured()) return;
    const res = await dashboardGET(jsonRequest(`${BASE}/api/dashboard`, { ip: "10.1.0.1" }));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.tracks.every((t: { status: string }) => t.status === "approved")).toBe(true);
    expect(json.tracks.some((t: { id: string }) => t.id === DRAFT_TRACK_ID)).toBe(false);
    expect(json.tracks.some((t: { id: string }) => t.id === APPROVED_TRACK_ID)).toBe(true);
    expect(json.artists.length).toBeGreaterThan(0);
    expect(json.artists.every((a: Record<string, unknown>) => !("user_id" in a))).toBe(true);
    expect(json.artistProfile).toBeNull();
  });

  it("anonimo no recibe user_id en /api/artists", async () => {
    if (isTursoConfigured()) return;
    const res = await artistsGET(jsonRequest(`${BASE}/api/artists`, { ip: "10.1.0.2" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.artists.length).toBeGreaterThan(0);
    expect(json.artists.every((a: Record<string, unknown>) => !("user_id" in a))).toBe(true);
  });

  it("admin si ve borradores y user_id en /api/dashboard", async () => {
    if (isTursoConfigured()) return;
    const res = await dashboardGET(
      jsonRequest(`${BASE}/api/dashboard`, { token: adminToken, ip: "10.1.0.3" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.tracks.some((t: { id: string }) => t.id === DRAFT_TRACK_ID)).toBe(true);
    expect(json.artists.some((a: Record<string, unknown>) => "user_id" in a)).toBe(true);
  });

  it("admin si recibe user_id en /api/artists", async () => {
    if (isTursoConfigured()) return;
    const res = await artistsGET(
      jsonRequest(`${BASE}/api/artists`, { token: adminToken, ip: "10.1.0.4" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.artists.some((a: Record<string, unknown>) => "user_id" in a)).toBe(true);
  });
});

describe("S3 — rate limit en escrituras publicas", () => {
  it("POST /api/shows devuelve 429 al exceder 10/min con Retry-After", async () => {
    if (isTursoConfigured()) return;
    const ip = "10.2.0.10";
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await showsPOST(
        jsonRequest(`${BASE}/api/shows`, { method: "POST", body: {}, token: adminToken, ip })
      );
      statuses.push(res.status);
      if (i === 10) {
        expect(res.headers.get("Retry-After")).toBeTruthy();
        const json = await res.json();
        expect(json.error).toContain("Demasiadas solicitudes");
      }
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("POST /api/shows sin sesion no consume cuota (401 y luego sigue permitiendo)", async () => {
    if (isTursoConfigured()) return;
    const ip = "10.2.0.11";
    for (let i = 0; i < 11; i++) {
      const res = await showsPOST(jsonRequest(`${BASE}/api/shows`, { method: "POST", body: {}, ip }));
      expect(res.status).toBe(401);
    }
    const after = await showsPOST(
      jsonRequest(`${BASE}/api/shows`, { method: "POST", body: {}, token: adminToken, ip })
    );
    expect(after.status).toBe(400);
  });

  it("POST /api/releases devuelve 429 al exceder 10/min", async () => {
    if (isTursoConfigured()) return;
    const ip = "10.2.0.12";
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await releasesPOST(
        jsonRequest(`${BASE}/api/releases`, { method: "POST", body: {}, token: adminToken, ip })
      );
      statuses.push(res.status);
      if (i === 10) expect(res.headers.get("Retry-After")).toBeTruthy();
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("POST /api/subscriptions devuelve 429 al exceder 20/min", async () => {
    if (isTursoConfigured()) return;
    const ip = "10.2.0.13";
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await subscriptionsPOST(
        jsonRequest(`${BASE}/api/subscriptions`, { method: "POST", body: {}, token: ownerToken, ip })
      );
      statuses.push(res.status);
      if (i === 20) expect(res.headers.get("Retry-After")).toBeTruthy();
    }
    expect(statuses.slice(0, 20).every((s) => s === 400)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("POST /api/likes devuelve 429 al exceder 60/min", async () => {
    if (isTursoConfigured()) return;
    const ip = "10.2.0.14";
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      const res = await likesPOST(
        jsonRequest(`${BASE}/api/likes`, { method: "POST", body: {}, token: ownerToken, ip })
      );
      statuses.push(res.status);
      if (i === 60) expect(res.headers.get("Retry-After")).toBeTruthy();
    }
    expect(statuses.slice(0, 60).every((s) => s === 400)).toBe(true);
    expect(statuses[60]).toBe(429);
  });

  it("POST /api/upload/image devuelve 429 al exceder 20/min", async () => {
    if (isTursoConfigured()) return;
    const ip = "10.2.0.15";
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const file = new File([PNG_BYTES], `rl-${i}.png`, { type: "image/png" });
      const res = await uploadPOST(uploadRequest(ownerToken, ip, file));
      statuses.push(res.status);
      if (i === 20) expect(res.headers.get("Retry-After")).toBeTruthy();
    }
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe("S4 — GET /api/releases?user_id= filtra por el artista del usuario", () => {
  it("responde 200 y solo los releases del artista del usuario", async () => {
    if (isTursoConfigured()) return;
    const res = await releasesGET(
      jsonRequest(`${BASE}/api/releases?user_id=${OWNER_USER_ID}`, { ip: "10.3.0.1" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    const ids = json.map((r: { id: string }) => r.id);
    expect(ids).toContain(OWNED_TRACK_ID);
    expect(ids).not.toContain(OTHER_TRACK_ID);
    expect(ids).not.toContain(DRAFT_TRACK_ID);
    expect(ids).not.toContain(RELEASE_TRACK_ID);
    expect(json.every((r: Record<string, unknown>) => !("user_id" in r))).toBe(true);
  });

  it("el dueño autenticado sí ve sus borradores con el mismo filtro", async () => {
    if (isTursoConfigured()) return;
    const res = await releasesGET(
      jsonRequest(`${BASE}/api/releases?user_id=${OWNER_USER_ID}`, {
        token: ownerToken,
        ip: "10.3.0.5",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.map((r: { id: string }) => r.id);
    expect(ids).toContain(DRAFT_TRACK_ID);
    expect(ids).toContain(RELEASE_TRACK_ID);
    expect(ids).not.toContain(OTHER_TRACK_ID);
  });

  it("responde 200 (no 500) cuando el usuario no tiene artista", async () => {
    if (isTursoConfigured()) return;
    const res = await releasesGET(
      jsonRequest(`${BASE}/api/releases?user_id=usuario-sin-artista-${SUFFIX}`, { ip: "10.3.0.2" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it("responde 200 con el propio release al combinar id y user_id", async () => {
    if (isTursoConfigured()) return;
    const res = await releasesGET(
      jsonRequest(`${BASE}/api/releases?id=${OWNED_TRACK_ID}&user_id=${OWNER_USER_ID}`, {
        ip: "10.3.0.3",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(OWNED_TRACK_ID);

    const cross = await releasesGET(
      jsonRequest(`${BASE}/api/releases?id=${OTHER_TRACK_ID}&user_id=${OWNER_USER_ID}`, {
        ip: "10.3.0.4",
      })
    );
    expect(cross.status).toBe(200);
    expect(await cross.json()).toBeNull();
  });
});

/**
 * P4 (S0) — `GET /api/releases?id=X` SIN `user_id` es público y antes hacía
 * `SELECT * FROM tracks WHERE id = ?` a secas: devolvía la fila CRUDA, sin
 * pasar por `parseTrack`, y sin filtro de estado.
 *
 * Estos casos son los que faltaban. Los que ya existían (`S4`) usaban
 * `?id=X&user_id=Y`, que SÍ está filtrado, así que el hueco era invisible a la
 * suite: una comprobación que solo mira el camino protegido no puede detectar
 * que el otro está abierto.
 */
describe("S0/P4 — GET /api/releases?id= sin user_id no filtra estado ni admin_notes", () => {
  it("un borrador NO es legible por id público (devuelve null)", async () => {
    if (isTursoConfigured()) return;
    const res = await releasesGET(
      jsonRequest(`${BASE}/api/releases?id=${PUBLIC_DRAFT_ID}`, { ip: "10.6.0.1" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("un rechazo NO es legible por id público (devuelve null)", async () => {
    if (isTursoConfigured()) return;
    const res = await releasesGET(
      jsonRequest(`${BASE}/api/releases?id=${PUBLIC_REJECTED_ID}`, { ip: "10.6.0.2" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("admin_notes no aparece en la respuesta pública de un release aprobado", async () => {
    if (isTursoConfigured()) return;
    const db = getDbWrite();
    db.prepare("UPDATE tracks SET admin_notes = ? WHERE id = ?").run(ADMIN_NOTES, APPROVED_TRACK_ID);

    const res = await releasesGET(
      jsonRequest(`${BASE}/api/releases?id=${APPROVED_TRACK_ID}`, { ip: "10.6.0.3" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(APPROVED_TRACK_ID);
    // El fallo original: la columna existe en `tracks` (verificado con PRAGMA
    // table_info) y `SELECT *` la arrastraba porque `parseTrack` no la expone.
    expect(Object.prototype.hasOwnProperty.call(json, "admin_notes")).toBe(false);
    expect(JSON.stringify(json)).not.toContain(ADMIN_NOTES);

    db.prepare("UPDATE tracks SET admin_notes = NULL WHERE id = ?").run(APPROVED_TRACK_ID);
  });

  it("el dueño autenticado sí recupera su borrador por id, con admin_notes (le corresponde)", async () => {
    if (isTursoConfigured()) return;
    const res = await releasesGET(
      jsonRequest(`${BASE}/api/releases?id=${PUBLIC_DRAFT_ID}`, { token: ownerToken, ip: "10.6.0.4" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(PUBLIC_DRAFT_ID);
    expect(json.status).toBe("draft");
    // El formulario de edición lee `admin_notes` para mostrar el motivo del
    // rechazo: el dueño lo necesita, un anónimo no.
    expect(json.admin_notes).toBe(ADMIN_NOTES);
  });

  it("el admin sí recupera cualquier estado por id, incluido el borrador", async () => {
    if (isTursoConfigured()) return;
    const res = await releasesGET(
      jsonRequest(`${BASE}/api/releases?id=${PUBLIC_DRAFT_ID}`, { token: adminToken, ip: "10.6.0.5" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(PUBLIC_DRAFT_ID);
    expect(json.status).toBe("draft");
  });

  it("un artist que NO es el dueño no lee el borrador ajeno por id", async () => {
    if (isTursoConfigured()) return;
    const strangerToken = await createSessionToken({
      userId: `sweep-stranger-artist-${SUFFIX}`,
      email: `sweep-stranger-artist-${SUFFIX}@example.com`,
      role: "artist",
    });
    const res = await releasesGET(
      jsonRequest(`${BASE}/api/releases?id=${PUBLIC_DRAFT_ID}`, {
        token: strangerToken,
        ip: "10.6.0.6",
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("una hija en draft de un release padre SÍ aprobado es pública (si no, el álbum sale vacío)", async () => {
    if (isTursoConfigured()) return;
    // `POST /api/releases:168` inserta las hijas siempre con `status = 'draft'`.
    const res = await releasesGET(
      jsonRequest(`${BASE}/api/releases?id=${APPROVED_CHILD_ID}`, { ip: "10.6.0.7" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(APPROVED_CHILD_ID);
    expect(json.release_id).toBe(APPROVED_PARENT_ID);
  });
});

/**
 * P4 (S0) — mismo agujero en `GET /api/tracks/:id`, que tampoco está en el
 * `matcher` de `middleware.ts`.
 */
describe("S0/P4 — GET /api/tracks/:id no filtra estado ni admin_notes", () => {
  it("un borrador devuelve 404 para un anónimo", async () => {
    if (isTursoConfigured()) return;
    const res = await tracksGET(
      jsonRequest(`${BASE}/api/tracks/${PUBLIC_DRAFT_ID}`, { ip: "10.7.0.1" }),
      { params: Promise.resolve({ id: PUBLIC_DRAFT_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("un aprobado sale parseado y sin admin_notes", async () => {
    if (isTursoConfigured()) return;
    const db = getDbWrite();
    db.prepare("UPDATE tracks SET admin_notes = ? WHERE id = ?").run(ADMIN_NOTES, APPROVED_TRACK_ID);

    const res = await tracksGET(
      jsonRequest(`${BASE}/api/tracks/${APPROVED_TRACK_ID}`, { ip: "10.7.0.2" }),
      { params: Promise.resolve({ id: APPROVED_TRACK_ID }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(APPROVED_TRACK_ID);
    expect(Object.prototype.hasOwnProperty.call(json, "admin_notes")).toBe(false);

    db.prepare("UPDATE tracks SET admin_notes = NULL WHERE id = ?").run(APPROVED_TRACK_ID);
  });

  it("el dueño autenticado sí lee su borrador (el PATCH de lyrics lo necesita)", async () => {
    if (isTursoConfigured()) return;
    const res = await tracksGET(
      jsonRequest(`${BASE}/api/tracks/${PUBLIC_DRAFT_ID}`, { token: ownerToken, ip: "10.7.0.3" }),
      { params: Promise.resolve({ id: PUBLIC_DRAFT_ID }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(PUBLIC_DRAFT_ID);
  });

  it("un artist ajeno recibe 404, no el borrador de otro", async () => {
    if (isTursoConfigured()) return;
    const strangerToken = await createSessionToken({
      userId: `sweep-stranger-tracks-${SUFFIX}`,
      email: `sweep-stranger-tracks-${SUFFIX}@example.com`,
      role: "artist",
    });
    const res = await tracksGET(
      jsonRequest(`${BASE}/api/tracks/${PUBLIC_DRAFT_ID}`, { token: strangerToken, ip: "10.7.0.4" }),
      { params: Promise.resolve({ id: PUBLIC_DRAFT_ID }) }
    );
    expect(res.status).toBe(404);
  });
});

/**
 * P12b (S0) — `getAllShows()` era `SELECT * FROM shows ORDER BY date ASC`, sin
 * `approved = 1` ni `deleted_at IS NULL`, y `/shows` no está en el `matcher` de
 * `middleware.ts`, luego la página es pública. Como `POST /api/shows` crea con
 * `approved = 0` para cualquier artista, un show recién enviado se publicaba
 * solo.
 */
describe("S0/P12b — /api/shows no expone shows sin aprobar a un anónimo", () => {
  it("el listado público excluye el show sin aprobar e incluye el aprobado", async () => {
    if (isTursoConfigured()) return;
    const res = await showsGET(jsonRequest(`${BASE}/api/shows`, { ip: "10.8.0.1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = (json.shows as { id: string }[]).map((s) => s.id);
    expect(ids).not.toContain(showId);
    expect(ids).toContain(SHOW_APPROVED_ID);
    expect(
      (json.shows as { approved: boolean }[]).every((s) => s.approved === true)
    ).toBe(true);
  });

  it("el listado por artist_id tampoco incluye los no aprobados", async () => {
    if (isTursoConfigured()) return;
    const res = await showsGET(
      jsonRequest(`${BASE}/api/shows?artist_id=${artistId}`, { ip: "10.8.0.2" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = (json.shows as { id: string }[]).map((s) => s.id);
    expect(ids).not.toContain(showId);
    expect(ids).toContain(SHOW_APPROVED_ID);
  });

  it("por id, un show sin aprobar da 404 a un anónimo", async () => {
    if (isTursoConfigured()) return;
    const res = await showsGET(
      jsonRequest(`${BASE}/api/shows?id=${showId}`, { ip: "10.8.0.3" })
    );
    expect(res.status).toBe(404);
  });

  it("el dueño autenticado sí ve su propio show sin aprobar", async () => {
    if (isTursoConfigured()) return;
    const res = await showsGET(
      jsonRequest(`${BASE}/api/shows?id=${showId}`, { token: ownerToken, ip: "10.8.0.4" })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(showId);
  });

  it("el admin conserva el alcance completo para poder aprobar", async () => {
    if (isTursoConfigured()) return;
    const res = await showsGET(jsonRequest(`${BASE}/api/shows`, { token: adminToken, ip: "10.8.0.5" }));
    expect(res.status).toBe(200);
    const ids = ((await res.json()).shows as { id: string }[]).map((s) => s.id);
    expect(ids).toContain(showId);
    expect(ids).toContain(SHOW_APPROVED_ID);
  });
});

describe("S7 — escrituras que publican notifican y hacen fan-out", () => {
  it("PUT /api/shows emite show_update cuando cambian datos relevantes", async () => {
    if (isTursoConfigured()) return;
    const res = await showsPUT(
      jsonRequest(`${BASE}/api/shows`, {
        method: "PUT",
        body: { id: showId, date: "2027-01-15", venue_name: `Sala Sweep Actualizada ${SUFFIX}` },
        token: adminToken,
        ip: "10.4.0.1",
      })
    );
    expect(res.status).toBe(200);
    expect(mockNotifyArtistSubscribers).toHaveBeenCalledTimes(1);
    expect(mockNotifyArtistSubscribers).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "show_update", artistId: ownedArtistId })
    );
  });

  it("PUT /api/shows no emite show_update si no cambia nada relevante", async () => {
    if (isTursoConfigured()) return;
    const res = await showsPUT(
      jsonRequest(`${BASE}/api/shows`, {
        method: "PUT",
        body: { id: showId, notes: "nota interna sin relevancia" },
        token: adminToken,
        ip: "10.4.0.2",
      })
    );
    expect(res.status).toBe(200);
    expect(mockNotifyArtistSubscribers).not.toHaveBeenCalled();
  });

  it("PUT /api/releases notifica la decision de aprobacion al artista", async () => {
    if (isTursoConfigured()) return;
    const res = await releasesPUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: RELEASE_TRACK_ID, status: "approved" },
        token: adminToken,
        ip: "10.4.0.3",
      })
    );
    expect(res.status).toBe(200);

    expect(mockNotifyApprovalDecision).toHaveBeenCalledTimes(1);
    expect(mockNotifyApprovalDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OWNER_USER_ID,
        type: "submission_approved",
        context: "release",
      })
    );
    expect(mockNotifyArtistSubscribers).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "release", artistId: ownedArtistId })
    );
  });

  it("PUT /api/releases no notifica si el estado no cambia", async () => {
    if (isTursoConfigured()) return;
    const res = await releasesPUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: RELEASE_TRACK_ID, status: "approved" },
        token: adminToken,
        ip: "10.4.0.4",
      })
    );
    expect(res.status).toBe(200);
    expect(mockNotifyApprovalDecision).not.toHaveBeenCalled();
    expect(mockNotifyArtistSubscribers).not.toHaveBeenCalled();
  });
});

describe("S8 — upload valida extension, magic bytes y MIME declarado", () => {
  it("rechaza un SVG declarado como image/png con 415", async () => {
    if (isTursoConfigured()) return;
    const file = new File([SVG_BYTES], "evil.svg", { type: "image/png" });
    const res = await uploadPOST(uploadRequest(ownerToken, "10.5.0.1", file));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toContain("Extensión");
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("rechaza contenido SVG con extension y MIME de PNG con 415", async () => {
    if (isTursoConfigured()) return;
    const file = new File([SVG_BYTES], "disfraz.png", { type: "image/png" });
    const res = await uploadPOST(uploadRequest(ownerToken, "10.5.0.2", file));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toContain("no corresponde");
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("rechaza un PNG real cuyo MIME declarado no coincide con 415", async () => {
    if (isTursoConfigured()) return;
    const file = new File([PNG_BYTES], "real.png", { type: "image/jpeg" });
    const res = await uploadPOST(uploadRequest(ownerToken, "10.5.0.3", file));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toContain("declarado");
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("acepta un PNG real y fuerza el contentType en el put de Vercel Blob", async () => {
    if (isTursoConfigured()) return;
    const file = new File([PNG_BYTES], "real.png", { type: "image/png" });
    const res = await uploadPOST(uploadRequest(ownerToken, "10.5.0.4", file));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.url).toBeTruthy();

    expect(mockPut).toHaveBeenCalledTimes(1);
    const options = mockPut.mock.calls[0][2] as { contentType?: string; access?: string };
    expect(options.contentType).toBe("image/png");
    expect(options.access).toBe("public");
  });

  it("mantiene el control de ownership (no sube a galerias ajenas)", async () => {
    if (isTursoConfigured()) return;
    const strangerToken = await createSessionToken({
      userId: `sweep-stranger-${SUFFIX}`,
      email: `sweep-stranger-${SUFFIX}@example.com`,
      role: "subscriber",
    });
    const file = new File([PNG_BYTES], "real.png", { type: "image/png" });
    const res = await uploadPOST(uploadRequest(strangerToken, "10.5.0.5", file));
    expect(res.status).toBe(403);
    expect(mockPut).not.toHaveBeenCalled();
  });
});
