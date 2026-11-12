import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

/**
 * P17 — "El catálogo público es un catálogo público".
 *
 * ── Por qué este test existe ────────────────────────────────────────────────
 *
 * Un EPK es un documento público: todo lo que la web enseña a un desconocido
 * tiene que ser público, y nada más. Antes de P17, tres rutas públicas
 * enseñaban de más — y una de ellas era **el buscador**, que es público, sin
 * sesión y sin rate limit.
 *
 * Lo que este fichero fija, una cosa por test:
 *
 *   1. El JSON-LD no puede cerrar la etiqueta `<script>` (XSS almacenado).
 *   2. `/api/search` no devuelve releases sin aprobar, shows no aprobados ni
 *      artistas inactivos.
 *   3. `/api/artists/[id]` no devuelve `user_id` ni `deleted_at` a un anónimo.
 *   4. `/api/likes?user_id=` no devuelve los likes de otro usuario.
 *   5. Un release sin aprobar no lo ve el público.
 *   6. El dossier JSON no lleva el email de contacto; el HTML sí.
 *
 * ── Por qué NO basta con "el código se ve bien" ──────────────────────────────
 *
 * Cada una de estas fugas era **invisible** en el código: la ruta存在的 y
 * devolvía 200, el test existente pasaba, y el resultado era unafiltration
 * silenciosa en producción. La única forma de que un guard sirva es que
 * **pueda fallar**: por eso aquí se comprueba el comportamiento (la respuesta
 * real de la ruta), no el texto del fichero.
 */

import { GET as searchGET } from "@/app/api/search/route";
import { GET as artistDetailGET } from "@/app/api/artists/[id]/route";
import { GET as likesGET } from "@/app/api/likes/route";
import { safeJsonLd } from "@/lib/safe-json-ld";
import { getVisibleReleaseWithTracks } from "@/lib/releases";
import { buildBundleJson, buildDossierHtml, type ExportPayload } from "@/lib/downloadable-assets";
import { createSessionToken } from "@/lib/auth";
import {
  createArtist,
  createUser,
  deleteArtist,
  deleteUser,
  getDbWrite,
  isTursoConfigured,
} from "@/lib/db";

const BASE = "http://localhost:3000";
const SWEEP = `${Date.now()}`;

const OWNER_USER_ID = `p17-owner-${SWEEP}`;
const OTHER_USER_ID = `p17-other-${SWEEP}`;
const ARTIST_NAME = `Artista P17 ${SWEEP}`;
const INACTIVE_ARTIST_NAME = `Artista P17 Inactivo ${SWEEP}`;
const INACTIVE_ARTIST_ID = `p17-inactive-${SWEEP}`;

const APPROVED_RELEASE_ID = `p17-approved-${SWEEP}`;
const DRAFT_RELEASE_ID = `p17-draft-${SWEEP}`;
const PENDING_RELEASE_ID = `p17-pending-${SWEEP}`;
const REJECTED_RELEASE_ID = `p17-rejected-${SWEEP}`;

const SHOW_APPROVED_ID = `p17-show-approved-${SWEEP}`;
const SHOW_UNAPPROVED_ID = `p17-show-unapproved-${SWEEP}`;

const OWNER_EMAIL = `p17-owner-${SWEEP}@example.com`;
const OTHER_EMAIL = `p17-other-${SWEEP}@example.com`;

let ownerToken = "";
let otherToken = "";
let sweepArtistId = "";

function jsonRequest(url: string, options: { token?: string; ip?: string } = {}): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.cookie = `auth_session=${options.token}`;
  if (options.ip) headers["x-forwarded-for"] = options.ip;
  return new NextRequest(url, { method: "GET", headers });
}

function insertRelease(id: string, status: string, artistName: string) {
  getDbWrite()
    .prepare(
      `INSERT INTO tracks (id, title, artist_name, release_type, release_date, duration,
                           cover_image, audio_preview_url, status, created_at)
       VALUES (?, ?, ?, 'Single', '2026-01-01', '03:00', '', '', ?, datetime('now'))`
    )
    .run(id, `Release ${id}`, artistName, status);
}

function insertShow(id: string, artistId: string, approved: number) {
  getDbWrite()
    .prepare(
      `INSERT INTO shows (id, artist_id, venue_name, city, country, date, status, approved, created_at)
       VALUES (?, ?, ?, 'Madrid', 'España', '2030-01-01', 'disponible', ?, datetime('now'))`
    )
    .run(id, artistId, `Venue ${id}`, approved);
}

beforeAll(async () => {
  if (isTursoConfigured()) return;

  ownerToken = await createSessionToken({
    userId: OWNER_USER_ID,
    email: OWNER_EMAIL,
    role: "artist",
  });
  otherToken = await createSessionToken({
    userId: OTHER_USER_ID,
    email: OTHER_EMAIL,
    role: "subscriber",
  });

  const db = getDbWrite();
  db.prepare("DELETE FROM tracks WHERE id LIKE 'p17-%'").run();
  db.prepare("DELETE FROM shows WHERE id LIKE 'p17-%'").run();
  db.prepare("DELETE FROM artists WHERE name LIKE 'Artista P17%'").run();
  await deleteUser(OWNER_USER_ID);
  await deleteUser(OTHER_USER_ID);

  await createUser({
    id: OWNER_USER_ID,
    name: `Owner P17 ${SWEEP}`,
    email: OWNER_EMAIL,
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
  await createUser({
    id: OTHER_USER_ID,
    name: `Otro P17 ${SWEEP}`,
    email: OTHER_EMAIL,
    password_hash: "x",
    role: "subscriber",
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

  // Un artista **inactivo**: está en la BD y la API lo ocultaba, pero la web
  // lo publicaba y lo metía en el sitemap.
  db.prepare(
    `INSERT INTO artists (id, name, user_id, biography, press_text, press_highlights, genre,
                          location, monthly_listeners, social_links, profile_image, banner_image,
                          slug, is_active, created_at)
     VALUES (?, ?, NULL, '', NULL, '[]', 'Rock', 'Caracas', 0, '[]', '', '', '', 0, datetime('now'))`
  ).run(INACTIVE_ARTIST_ID, INACTIVE_ARTIST_NAME);

  insertRelease(APPROVED_RELEASE_ID, "approved", ARTIST_NAME);
  insertRelease(DRAFT_RELEASE_ID, "draft", ARTIST_NAME);
  insertRelease(PENDING_RELEASE_ID, "pending", ARTIST_NAME);
  insertRelease(REJECTED_RELEASE_ID, "rejected", ARTIST_NAME);

  insertShow(SHOW_APPROVED_ID, sweepArtistId, 1);
  insertShow(SHOW_UNAPPROVED_ID, sweepArtistId, 0);
});

afterAll(async () => {
  if (isTursoConfigured()) return;
  const db = getDbWrite();
  db.prepare("DELETE FROM tracks WHERE id LIKE 'p17-%'").run();
  db.prepare("DELETE FROM shows WHERE id LIKE 'p17-%'").run();
  db.prepare("DELETE FROM artists WHERE name LIKE 'Artista P17%'").run();
  await deleteArtist(sweepArtistId);
  await deleteUser(OWNER_USER_ID);
  await deleteUser(OTHER_USER_ID);
});

// ── 1 · El XSS del JSON-LD ───────────────────────────────────────────────────

describe("P17 · el JSON-LD no puede cerrar la etiqueta <script>", () => {
  it("una biografía con </script> no rompe el JSON-LD", () => {
    const payload = {
      "@type": "MusicGroup",
      name: "Artista",
      description: 'x</script><img src=y onerror=alert(1)>',
    };
    const serializado = safeJsonLd(payload);

    // Lo que importa: no queda un `</script>` literal que cierre la etiqueta.
    expect(serializado).not.toContain("</script>");
    expect(serializado).not.toContain("<img");
    expect(serializado).toContain("\\u003c");
  });

  it("el JSON sigue siendo JSON, y con el mismo contenido", () => {
    const payload = {
      "@type": "MusicGroup",
      name: "Artista",
      description: 'x</script><img src=y onerror=alert(1)>',
    };
    const serializado = safeJsonLd(payload);

    // `\u003c` es un escape Unicode válido: `JSON.parse` devuelve el original.
    expect(JSON.parse(serializado)).toEqual(payload);
  });

  it("la ficha de artista usa el escapado, no JSON.stringify a pelo", () => {
    // Guarda de FUENTE: el arreglo correcto puede cambiar de forma (por
    // ejemplo, usando un `<script>` de tipo `application/ld+json` con otra
    // estrategia), pero lo que no puede volver es `JSON.stringify(jsonLd)`
    // sin escapar.
    const fuente = readFileSync(
      path.resolve(process.cwd(), "app/artists/[id]/page.tsx"),
      "utf8"
    );
    expect(fuente).toContain("safeJsonLd(jsonLd)");
    expect(fuente).not.toMatch(/dangerouslySetInnerHTML=\{\{ __html: JSON\.stringify/);
  });
});

// ── 2 · El buscador ──────────────────────────────────────────────────────────

describe("P17 · /api/search no enseña lo que no está aprobado", () => {
  it("no devuelve releases en draft, pending ni rejected", async () => {
    if (isTursoConfigured()) return;
    const res = await searchGET(
      jsonRequest(`${BASE}/api/search?q=${encodeURIComponent("Release p17")}&scope=release`, {
        ip: "10.17.0.1",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.results.releases.map((r: { id: string }) => r.id);

    expect(ids).toContain(APPROVED_RELEASE_ID);
    expect(ids).not.toContain(DRAFT_RELEASE_ID);
    expect(ids).not.toContain(PENDING_RELEASE_ID);
    expect(ids).not.toContain(REJECTED_RELEASE_ID);
  });

  it("no devuelve shows sin aprobar", async () => {
    if (isTursoConfigured()) return;
    const res = await searchGET(
      jsonRequest(`${BASE}/api/search?q=${encodeURIComponent("Venue p17")}&scope=show`, {
        ip: "10.17.0.2",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.results.shows.map((s: { id: string }) => s.id);

    expect(ids).toContain(SHOW_APPROVED_ID);
    expect(ids).not.toContain(SHOW_UNAPPROVED_ID);
  });

  it("no devuelve artistas inactivos", async () => {
    if (isTursoConfigured()) return;
    const res = await searchGET(
      jsonRequest(`${BASE}/api/search?q=${encodeURIComponent("P17 Inactivo")}&scope=artist`, {
        ip: "10.17.0.3",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.results.artists.map((a: { id: string }) => a.id);

    expect(ids).not.toContain(INACTIVE_ARTIST_ID);
  });

  it("es público y sin sesión: por eso el filtro tiene que estar en el SQL", async () => {
    if (isTursoConfigured()) return;
    const res = await searchGET(
      jsonRequest(`${BASE}/api/search?q=release&scope=release`, { ip: "10.17.0.4" })
    );
    expect(res.status).toBe(200);
  });
});

// ── 3 · El detalle de artista ───────────────────────────────────────────────

describe("P17 · /api/artists/[id] no expone user_id ni deleted_at", () => {
  it("el anónimo no recibe user_id", async () => {
    if (isTursoConfigured()) return;
    const res = await artistDetailGET(
      jsonRequest(`${BASE}/api/artists/${sweepArtistId}`, { ip: "10.17.1.1" }),
      { params: { id: sweepArtistId } }
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(Object.prototype.hasOwnProperty.call(json, "user_id")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(json, "deleted_at")).toBe(false);
    expect(JSON.stringify(json)).not.toContain(OWNER_USER_ID);
  });

  it("un artista inactivo no existe para el público", async () => {
    if (isTursoConfigured()) return;
    const res = await artistDetailGET(
      jsonRequest(`${BASE}/api/artists/${INACTIVE_ARTIST_ID}`, { ip: "10.17.1.2" }),
      { params: { id: INACTIVE_ARTIST_ID } }
    );
    expect(res.status).toBe(404);
  });
});

// ── 4 · El IDOR de los likes ────────────────────────────────────────────────

describe("P17 · /api/likes no devuelve los likes de otro usuario", () => {
  it("sin sesión, pedir los likes de un usuario es 401", async () => {
    if (isTursoConfigured()) return;
    const res = await likesGET(
      jsonRequest(`${BASE}/api/likes?user_id=${OWNER_USER_ID}`, { ip: "10.17.2.1" })
    );
    expect(res.status).toBe(401);
  });

  it("con sesión de otro usuario, pedir los likes ajenos es 403", async () => {
    if (isTursoConfigured()) return;
    const res = await likesGET(
      jsonRequest(`${BASE}/api/likes?user_id=${OWNER_USER_ID}`, {
        token: otherToken,
        ip: "10.17.2.2",
      })
    );
    expect(res.status).toBe(403);
  });

  it("con sesión propia, pedir los likes de uno mismo sigue funcionando", async () => {
    if (isTursoConfigured()) return;
    const res = await likesGET(
      jsonRequest(`${BASE}/api/likes?user_id=${OWNER_USER_ID}`, {
        token: ownerToken,
        ip: "10.17.2.3",
      })
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("el recuento público de una pista sigue abierto", async () => {
    if (isTursoConfigured()) return;
    const res = await likesGET(
      jsonRequest(`${BASE}/api/likes?track_id=${APPROVED_RELEASE_ID}`, { ip: "10.17.2.4" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.track_id).toBe(APPROVED_RELEASE_ID);
    expect(typeof json.count).toBe("number");
  });
});

// ── 5 · El release sin aprobar ───────────────────────────────────────────────

describe("P17 · un release sin aprobar no lo ve el público", () => {
  it("el aprobado es visible sin sesión", async () => {
    if (isTursoConfigured()) return;
    const data = await getVisibleReleaseWithTracks(APPROVED_RELEASE_ID, null);
    expect(data).not.toBeNull();
    expect(data?.release.id).toBe(APPROVED_RELEASE_ID);
  });

  it("el draft no lo ve ni el público ni un suscriptor", async () => {
    if (isTursoConfigured()) return;
    expect(await getVisibleReleaseWithTracks(DRAFT_RELEASE_ID, null)).toBeNull();
    expect(
      await getVisibleReleaseWithTracks(DRAFT_RELEASE_ID, {
        userId: OTHER_USER_ID,
        role: "subscriber",
      })
    ).toBeNull();
  });

  it("el draft sí lo ve su autor y el admin", async () => {
    if (isTursoConfigured()) return;
    const delDueno = await getVisibleReleaseWithTracks(DRAFT_RELEASE_ID, {
      userId: OWNER_USER_ID,
      role: "artist",
    });
    expect(delDueno?.release.id).toBe(DRAFT_RELEASE_ID);

    const delAdmin = await getVisibleReleaseWithTracks(DRAFT_RELEASE_ID, {
      userId: "admin-whatever",
      role: "admin",
    });
    expect(delAdmin?.release.id).toBe(DRAFT_RELEASE_ID);
  });
});

// ── 6 · El dossier ───────────────────────────────────────────────────────────

describe("P17 · el dossier JSON no lleva el email de contacto", () => {
  const payload: ExportPayload = {
    artistId: "art-x",
    artistName: "Artista",
    genre: "Rock",
    location: "Madrid",
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    dossier: {
      biography: "Bio",
      press_text: "Prensa",
      influences: "Influencias",
      contact_email: "contacto@privado.test",
      booking_email: "booking@privado.test",
      management: "Management privado",
      website: "https://example.com",
    },
  };

  it("el JSON no lleva contact_email, booking_email ni management", () => {
    const json = buildBundleJson(payload, ["dossier"]);
    expect(json).not.toContain("contacto@privado.test");
    expect(json).not.toContain("booking@privado.test");
    expect(json).not.toContain("Management privado");
    expect(json).not.toContain("contact_email");
    expect(json).not.toContain("booking_email");
    expect(json).not.toContain("management");
  });

  it("el JSON sigue llevando lo que sí es de prensa", () => {
    const json = buildBundleJson(payload, ["dossier"]);
    expect(json).toContain("Bio");
    expect(json).toContain("Prensa");
    expect(json).toContain("https://example.com");
  });

  it("el HTML **sí** lleva el email: es el producto, lo lee una persona", () => {
    const html = buildDossierHtml(payload);
    expect(html).toContain("contacto@privado.test");
  });
});
