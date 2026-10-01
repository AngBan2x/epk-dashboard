import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/tracks/[id]/route";
import { createSessionToken } from "@/lib/auth";
import { createUser, deleteUser, getDbWrite, isTursoConfigured } from "@/lib/db";

/**
 * RC.33 Ola 0 — `PATCH /api/tracks/:id` aceptaba a cualquier `artist`
 * autenticado, sin comprobar de quién era la pista. El `GET` de ese mismo
 * fichero ya comprobaba ownership (línea 47); el `PATCH` no.
 *
 * Con 12 artistas en el catálogo, el agujero permitía reescribir `lyrics`,
 * `production_details`, `gallery_images`, `start_time`/`end_time` y
 * `track_number` de cualquier pista por id. Es decir, escribir la letra de
 * Pink Floyd desde una cuenta de artista propia.
 *
 * El test **falla al revertir el arreglo**: sin la comprobación de ownership, el
 * PATCH ajeno devuelve 200 y la fila ajena queda escrita.
 */

const SUFFIX = Date.now().toString(36);
const BASE = "http://localhost:3000";

const ARTIST_A = `rc33-own-a-${SUFFIX}`;
const ARTIST_B = `rc33-own-b-${SUFFIX}`;
const USER_A = `rc33-user-a-${SUFFIX}`;
const USER_B = `rc33-user-b-${SUFFIX}`;

const TRACK_OWN = `rc33-track-own-${SUFFIX}`;
const TRACK_FOREIGN = `rc33-track-foreign-${SUFFIX}`;
const TRACK_ORPHAN = `rc33-track-orphan-${SUFFIX}`;

const FOREIGN_LYRICS = `rc33-intruso-${SUFFIX}`;

function jsonRequest(url: string, body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.cookie = `auth_session=${token}`;
  return new NextRequest(url, { method: "PATCH", body: JSON.stringify(body), headers });
}

function lyricsOf(id: string): string | null {
  const db = getDbWrite();
  const row = db.prepare("SELECT lyrics FROM tracks WHERE id = ?").get(id) as
    | { lyrics: string | null }
    | undefined;
  return row?.lyrics ?? null;
}

let tokenA = "";
let tokenB = "";
let adminToken = "";

beforeAll(async () => {
  if (isTursoConfigured()) return;
  delete process.env.RESEND_API_KEY;

  const db = getDbWrite();

  db.prepare("DELETE FROM tracks WHERE id IN (?, ?, ?)").run(TRACK_OWN, TRACK_FOREIGN, TRACK_ORPHAN);
  db.prepare("DELETE FROM artists WHERE name IN (?, ?)").run(ARTIST_A, ARTIST_B);

  // `artists.user_id` es FK a `users(id)`: los usuarios van primero. El hash de
  // contraseña es "x" a propósito — esta prueba no autentica por contraseña, usa
  // cookie de sesión firmada.
  for (const [userId, email] of [[USER_A, `rc33-a-${SUFFIX}@example.com`], [USER_B, `rc33-b-${SUFFIX}@example.com`]] as const) {
    await createUser({
      id: userId,
      name: `Artista RC33 ${SUFFIX}`,
      email,
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
      email_verified: true,
      deleted_at: null,
      last_login: null,
    });
  }

  // Dos artistas reales con dos dueños distintos: la prueba real del aislamiento.
  db.prepare(
    `INSERT INTO artists (id, name, user_id, biography, press_highlights, social_links, is_active, created_at)
     VALUES (?, ?, ?, '', '[]', '[]', 1, datetime('now'))`
  ).run(`rc33-artist-a-${SUFFIX}`, ARTIST_A, USER_A);
  db.prepare(
    `INSERT INTO artists (id, name, user_id, biography, press_highlights, social_links, is_active, created_at)
     VALUES (?, ?, ?, '', '[]', '[]', 1, datetime('now'))`
  ).run(`rc33-artist-b-${SUFFIX}`, ARTIST_B, USER_B);

  const insert = db.prepare(
    `INSERT INTO tracks (id, title, artist_name, release_type, release_date, status, lyrics, created_at)
     VALUES (?, ?, ?, 'Single', '2026-01-01', 'approved', ?, datetime('now'))`
  );
  insert.run(TRACK_OWN, "Pista propia", ARTIST_A, "letra propia");
  insert.run(TRACK_FOREIGN, "Pista ajena", ARTIST_B, "letra ajena original");
  // Sin fila en `artists`: `isArtistOwnerOfTrackName` no puede resolver dueño y
  // debe negarse. Cubre el `artist_name` huérfano.
  insert.run(TRACK_ORPHAN, "Pista sin artista", "artista-inexistente-rc33", "letra huerfana");

  tokenA = await createSessionToken({ userId: USER_A, email: `rc33-a-${SUFFIX}@example.com`, role: "artist" });
  tokenB = await createSessionToken({ userId: USER_B, email: `rc33-b-${SUFFIX}@example.com`, role: "artist" });
  adminToken = await createSessionToken({ userId: `rc33-admin-${SUFFIX}`, email: `rc33-ad-${SUFFIX}@example.com`, role: "admin" });
});

afterAll(async () => {
  if (isTursoConfigured()) return;
  const db = getDbWrite();
  db.prepare("DELETE FROM tracks WHERE id IN (?, ?, ?)").run(TRACK_OWN, TRACK_FOREIGN, TRACK_ORPHAN);
  db.prepare("DELETE FROM artists WHERE name IN (?, ?)").run(ARTIST_A, ARTIST_B);
  // Los artistas primero: si no, el DELETE de `artists` choca con la FK.
  for (const userId of [USER_A, USER_B]) await deleteUser(userId);
});

describe("PATCH /api/tracks/:id — ownership (RC.33 Ola 0)", () => {
  it("el dueño escribe su propia pista", async () => {
    if (isTursoConfigured()) return;
    const res = await PATCH(
      jsonRequest(`${BASE}/api/tracks/${TRACK_OWN}`, { lyrics: "letra reescrita por su dueño" }, tokenA),
      { params: Promise.resolve({ id: TRACK_OWN }) }
    );
    expect(res.status).toBe(200);
    expect(lyricsOf(TRACK_OWN)).toBe("letra reescrita por su dueño");
  });

  it("un artista NO puede escribir la pista de otro (403)", async () => {
    if (isTursoConfigured()) return;
    const res = await PATCH(
      jsonRequest(`${BASE}/api/tracks/${TRACK_FOREIGN}`, { lyrics: FOREIGN_LYRICS }, tokenA),
      { params: Promise.resolve({ id: TRACK_FOREIGN }) }
    );
    expect(res.status).toBe(403);
  });

  it("y la fila ajena queda intacta: 403 sin escritura", async () => {
    if (isTursoConfigured()) return;
    // El 403 solo vale si además no se escribió. Un 403 con escritura sería peor
    // que no comprobar nada, porque parecería protegido.
    expect(lyricsOf(TRACK_FOREIGN)).toBe("letra ajena original");
    expect(lyricsOf(TRACK_FOREIGN)).not.toBe(FOREIGN_LYRICS);
  });

  it("la comprobación es simétrica: B tampoco puede tocar A", async () => {
    if (isTursoConfigured()) return;
    const before = lyricsOf(TRACK_OWN);
    const res = await PATCH(
      jsonRequest(`${BASE}/api/tracks/${TRACK_OWN}`, { lyrics: FOREIGN_LYRICS }, tokenB),
      { params: Promise.resolve({ id: TRACK_OWN }) }
    );
    expect(res.status).toBe(403);
    expect(lyricsOf(TRACK_OWN)).toBe(before);
  });

  it("el admin conserva el bypass sobre cualquier pista", async () => {
    if (isTursoConfigured()) return;
    const res = await PATCH(
      jsonRequest(`${BASE}/api/tracks/${TRACK_FOREIGN}`, { lyrics: "letra revisada por admin" }, adminToken),
      { params: Promise.resolve({ id: TRACK_FOREIGN }) }
    );
    expect(res.status).toBe(200);
    expect(lyricsOf(TRACK_FOREIGN)).toBe("letra revisada por admin");
  });

  it("una pista sin artista resoluble no es de nadie: 403", async () => {
    if (isTursoConfigured()) return;
    const before = lyricsOf(TRACK_ORPHAN);
    const res = await PATCH(
      jsonRequest(`${BASE}/api/tracks/${TRACK_ORPHAN}`, { lyrics: FOREIGN_LYRICS }, tokenA),
      { params: Promise.resolve({ id: TRACK_ORPHAN }) }
    );
    expect(res.status).toBe(403);
    expect(lyricsOf(TRACK_ORPHAN)).toBe(before);
  });

  it("sin sesión sigue siendo 401, antes de tocar nada", async () => {
    if (isTursoConfigured()) return;
    const res = await PATCH(
      jsonRequest(`${BASE}/api/tracks/${TRACK_FOREIGN}`, { lyrics: FOREIGN_LYRICS }),
      { params: Promise.resolve({ id: TRACK_FOREIGN }) }
    );
    expect(res.status).toBe(401);
  });

  it("el campo protegido sigue allowedFields: no se abre la puerta a cover ni a status", async () => {
    if (isTursoConfigured()) return;
    const res = await PATCH(
      jsonRequest(
        `${BASE}/api/tracks/${TRACK_OWN}`,
        { lyrics: "x", cover_image: "https://example.com/falsa.png", status: "approved" },
        tokenA
      ),
      { params: Promise.resolve({ id: TRACK_OWN }) }
    );
    expect(res.status).toBe(200);
    const db = getDbWrite();
    const row = db.prepare("SELECT cover_image FROM tracks WHERE id = ?").get(TRACK_OWN) as {
      cover_image: string | null;
    };
    expect(row.cover_image).toBeNull();
  });
});