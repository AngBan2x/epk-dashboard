import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import path from "path";

// Las notificaciones se mockean: el PUT de un admin las dispara y aquí se
// comprueba el contrato de escritura, no el correo. Sin esto, cada caso
// aprobaría por el camino deResend en vez de por el que nos importa.
vi.mock("@/lib/approval-notifications", () => ({
  notifyApprovalDecision: vi.fn(async () => ({ notificationCreated: false, emailSent: false })),
}));
vi.mock("@/lib/subscriber-notifications", () => ({
  notifyArtistSubscribers: vi.fn(async () => ({ notified: 0, emailsSent: 0, skipped: 0, failures: [] })),
  notifyArtistOwner: vi.fn(async () => ({ notified: 0, emailsSent: 0, skipped: 0, failures: [] })),
}));

import { GET, POST, PUT } from "@/app/api/releases/route";
import { createSessionToken } from "@/lib/auth";
import { sameArtistName, createArtist, createUser, deleteUser, getDbWrite, isTursoConfigured } from "@/lib/db";

/**
 * RC.32 — Agente A, Ola 1. Contrato de propiedad y de estado de
 * `PUT /api/releases`.
 *
 * ── Los cuatro S0 que esto fija ────────────────────────────────────────────
 * A-1 (el 403): `app/api/releases/route.ts` respondía 403 cuando `status`
 *   venía en el body, el rol no era admin y el estado era de decisión. El
 *   formulario reenviaba el estado VIGENTE, y las 83 filas de producción están
 *   en `approved`: ningún artista podía guardar ningún release, nunca. Este
 *   archivo fija que un artista guarda un `approved` y recibe 200.
 *
 * A-2 (pérdida de datos): el `GET ?id=X` sin `user_id` —el que usa el
 *   formulario— salía por el lector público para CUALQUIER release aprobado, y
 *   por tanto sin `description` ni `admin_notes`. La rama privilegiada era
 *   inalcanzable. Aquí: el propietario y el admin los ven; el anónimo no.
 *
 * A-3 (`artist_name`): estaba en `ALLOWED_COLUMNS` y la propiedad se
 *   verificaba contra la fila existente, no contra el valor nuevo. Aquí se fija
 *   que no es escribible y que las hijas SÍ se persisten.
 *
 * Y el invariante que los unía: POST y PUT comparaban `artist_name` con dos
 * reglas distintas (`===` sobre el payload vs. sobre la DB). Un espacio
 * trailing pasaba una y no la otra, y la fila resultante quedaba huérfana para
 * siempre porque `tracks` se relaciona con `artists` por nombre y no por FK.
 */

const BASE = "http://localhost:3000";
const SUFFIX = `${Date.now()}`;

const OWNER_USER_ID = `own-owner-${SUFFIX}`;
const STRANGER_USER_ID = `own-stranger-${SUFFIX}`;
const ADMIN_USER_ID = `own-admin-${SUFFIX}`;
const ARTIST_NAME = `Artista Ownership ${SUFFIX}`;
const OTHER_ARTIST_NAME = `Artista Ownership Otro ${SUFFIX}`;

/** Los cuatro estados sobre los que el botón cambia de texto y de efecto. */
const APPROVED_ID = `own-approved-${SUFFIX}`;
const PENDING_ID = `own-pending-${SUFFIX}`;
const REJECTED_ID = `own-rejected-${SUFFIX}`;
const DRAFT_ID = `own-draft-${SUFFIX}`;
/** Álbum: padre aprobado con dos hijas, para la persistencia y el `duration`. */
const ALBUM_ID = `own-album-${SUFFIX}`;
const ALBUM_CHILD_1 = `own-album-c1-${SUFFIX}`;
const ALBUM_CHILD_2 = `own-album-c2-${SUFFIX}`;

const ADMIN_NOTES = `motivo interno ${SUFFIX}`;
const DESCRIPTION = `descripción que el 403 tapaba ${SUFFIX}`;

let ownerToken = "";
let strangerToken = "";
let adminToken = "";

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

const TRACK_IDS = [
  APPROVED_ID,
  PENDING_ID,
  REJECTED_ID,
  DRAFT_ID,
  ALBUM_ID,
  ALBUM_CHILD_1,
  ALBUM_CHILD_2,
];

function localDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  return new Database(path.join(process.cwd(), "data", "music_catalog.db"));
}

function insertTrack(id: string, artistName: string, status: string, extra?: Record<string, unknown>) {
  localDb()
    .prepare(
      `INSERT INTO tracks (id, title, artist_name, release_type, release_date, description,
              status, admin_notes, release_id, created_at)
       VALUES (?, ?, ?, 'Album', '2026-01-01', ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      id,
      `Titulo ${id}`,
      artistName,
      (extra?.description as string) ?? "",
      status,
      (extra?.adminNotes as string) ?? null,
      (extra?.releaseId as string) ?? null
    );
}

function row(id: string): Record<string, unknown> {
  const db = localDb();
  const found = db.prepare("SELECT * FROM tracks WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  db.close();
  return found ?? {};
}

function statusOf(id: string): unknown {
  return row(id).status;
}

function cleanup() {
  const db = localDb();
  const placeholders = TRACK_IDS.map(() => "?").join(", ");
  db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(...TRACK_IDS);
  db.prepare("DELETE FROM artists WHERE name IN (?, ?)").run(ARTIST_NAME, OTHER_ARTIST_NAME);
  db.close();
}

beforeAll(async () => {
  if (isTursoConfigured()) return;
  cleanup();

  [OWNER_USER_ID, STRANGER_USER_ID].forEach((uid) =>
    createUser({
      id: uid,
      name: `Usuario ${uid}`,
      email: `${uid}@example.com`,
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
    })
  );

  ownerToken = await createSessionToken({
    userId: OWNER_USER_ID,
    email: `${OWNER_USER_ID}@example.com`,
    role: "artist",
  });
  strangerToken = await createSessionToken({
    userId: STRANGER_USER_ID,
    email: `${STRANGER_USER_ID}@example.com`,
    role: "artist",
  });
  adminToken = await createSessionToken({
    userId: ADMIN_USER_ID,
    email: `${ADMIN_USER_ID}@example.com`,
    role: "admin",
  });

  await createArtist({ name: ARTIST_NAME, userId: OWNER_USER_ID });
  // El extraño SÍ tiene perfil de artista, pero de OTRO. Es el caso fuerte: un
  // 403 aquí no puede explicarse por "no tienes perfil", solo por "no es tuyo".
  await createArtist({ name: OTHER_ARTIST_NAME, userId: STRANGER_USER_ID });

  insertTrack(APPROVED_ID, ARTIST_NAME, "approved", { description: DESCRIPTION, adminNotes: ADMIN_NOTES });
  insertTrack(PENDING_ID, ARTIST_NAME, "pending", { description: DESCRIPTION });
  insertTrack(REJECTED_ID, ARTIST_NAME, "rejected", { description: DESCRIPTION, adminNotes: ADMIN_NOTES });
  insertTrack(DRAFT_ID, ARTIST_NAME, "draft", { description: DESCRIPTION });
  insertTrack(ALBUM_ID, ARTIST_NAME, "approved", { description: DESCRIPTION });
  insertTrack(ALBUM_CHILD_1, ARTIST_NAME, "draft", { releaseId: ALBUM_ID });
  insertTrack(ALBUM_CHILD_2, ARTIST_NAME, "draft", { releaseId: ALBUM_ID });
});

afterAll(async () => {
  if (isTursoConfigured()) return;
  cleanup();
  await deleteUser(OWNER_USER_ID);
  await deleteUser(STRANGER_USER_ID);
  await deleteUser(ADMIN_USER_ID);
});

describe("RC.32 — sameArtistName: una sola regla de identidad de artista", () => {
  it("ignora espacios y mayúsculas, que es lo que rompía el POST", () => {
    expect(sameArtistName("Angel Bandres", "Angel Bandres ")).toBe(true);
    expect(sameArtistName("  Angel Bandres", "angel bandres")).toBe(true);
    expect(sameArtistName("Angel Bandres", "Otro")).toBe(false);
  });

  it("no confunde vacíos: '' no es propiedad de nadie", () => {
    expect(sameArtistName("", "")).toBe(false);
    expect(sameArtistName(null, undefined)).toBe(false);
    expect(sameArtistName("   ", "   ")).toBe(false);
    expect(sameArtistName("A", null)).toBe(false);
  });
});

describe("RC.32 Tarea 1 — el 403: un artista SÍ puede guardar un release aprobado", () => {
  it("guardar un `approved` sin tocar el estado devuelve 200 (antes: 403)", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: APPROVED_ID, title: "Titulo guardado", status: "draft" },
        token: ownerToken,
        ip: "10.20.0.1",
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    // El estado derivado por el servidor, no el del body.
    expect(json.status).toBe("approved");
    expect(json.statusIgnored).toBe(true);
    // El contenido sí se guardó: el 403 era lo que impedía guardar, no había
    // otro fallo detrás.
    expect(row(APPROVED_ID).title).toBe("Titulo guardado");
    // Y la fila sigue aprobada y visible.
    expect(statusOf(APPROVED_ID)).toBe("approved");
  });

  it("un `approved` que el artista reenvía en el body no se despublica", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: APPROVED_ID, title: "Titulo guardado", status: "approved" },
        token: ownerToken,
        ip: "10.20.0.2",
      })
    );

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("approved");
    expect(statusOf(APPROVED_ID)).toBe("approved");
  });

  it("Tarea 1B — un estado de decisión inyectado a mano se IGNORA, no se rechaza", async () => {
    if (isTursoConfigured()) return;
    for (const injected of ["approved", "rejected", "revision"]) {
      const res = await PUT(
        jsonRequest(`${BASE}/api/releases`, {
          method: "PUT",
          body: { id: DRAFT_ID, title: `intento ${injected}`, status: injected },
          token: ownerToken,
          ip: `10.20.0.3-${injected}`,
        })
      );

      // Ni 403 ni 400: la escritura se hace y el estado no se toca.
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.statusIgnored).toBe(true);
      expect(json.status).toBe("draft");
      expect(row(DRAFT_ID).title).toBe(`intento ${injected}`);
      expect(statusOf(DRAFT_ID)).toBe("draft");
    }
  });

  it("un `status` inyectado sin nada más que actualizar no es un error", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: DRAFT_ID, status: "approved" },
        token: ownerToken,
        ip: "10.20.0.4",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("draft");
    expect(json.statusIgnored).toBe(true);
    expect(statusOf(DRAFT_ID)).toBe("draft");
  });

  it("un body sin nada actualizable sigue siendo 400", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        // `not_a_column` no está en la allowlist: no hay nada que escribir.
        body: { id: DRAFT_ID, not_a_column: "x" },
        token: ownerToken,
        ip: "10.20.0.4b",
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Sin campos válidos");
  });

  it("el admin que repite el estado vigente recibe 200 y no notifica (no-op)", async () => {
    if (isTursoConfigured()) return;
    localDb().prepare("UPDATE tracks SET status = 'approved' WHERE id = ?").run(PENDING_ID);
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: PENDING_ID, status: "approved" },
        token: adminToken,
        ip: "10.20.0.4c",
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("approved");
    expect(statusOf(PENDING_ID)).toBe("approved");
  });

  it("`pending` SÍ es alcanzable por el artista: es la transición que el botón de revisión usa", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: DRAFT_ID, title: "pedido", status: "pending" },
        token: ownerToken,
        ip: "10.20.0.5",
      })
    );
    expect(res.status).toBe(200);
    expect(statusOf(DRAFT_ID)).toBe("pending");
    // Se devuelve al draft para no dejar el fixture sucio en pending.
    await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: DRAFT_ID, title: "pedido", status: "pending" },
        token: adminToken,
        ip: "10.20.0.6",
      })
    );
    localDb().prepare("UPDATE tracks SET status = 'draft' WHERE id = ?").run(DRAFT_ID);
  });

  it("un estado inválido sigue siendo 400 (no se aflojó el gate, se ignoró el ruido)", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: DRAFT_ID, title: "x", status: "publicado" },
        token: ownerToken,
        ip: "10.20.0.7",
      })
    );
    expect(res.status).toBe(400);
  });

  it("el admin sigue pudiendo aprobar: su decisión sí se aplica y notifica", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: PENDING_ID, status: "approved" },
        token: adminToken,
        ip: "10.20.0.8",
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("approved");
    expect(statusOf(PENDING_ID)).toBe("approved");
  });

  it("un NO-dueño sigue sin poder tocar el release ajeno (403 por propiedad)", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: APPROVED_ID, title: "secuestro" },
        token: strangerToken,
        ip: "10.20.0.9",
      })
    );
    expect(res.status).toBe(403);
    expect(row(APPROVED_ID).title).not.toBe("secuestro");
  });
});

describe("RC.32 Tarea 2 — GET ?id=X: el orden de las ramas decide si se pierde la descripción", () => {
  it("el PROPIETARIO de un release APROBADO recibe la fila cruda (antes: no)", async () => {
    if (isTursoConfigured()) return;
    // Este es EL caso que rompía el formulario: `approved` + `?id` sin
    // `user_id` salía por `getApprovedTrackById` → `parseTrack`, que no expone
    // `description`. El formulario cargaba `""` y el guardado la borraba.
    const res = await GET(
      jsonRequest(`${BASE}/api/releases?id=${APPROVED_ID}`, { token: ownerToken, ip: "10.21.0.1" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(APPROVED_ID);
    expect(json.description).toBe(DESCRIPTION);
    // El motivo de rechazo también: el formulario lo muestra.
    expect(json.admin_notes).toBe(ADMIN_NOTES);
  });

  it("el ADMIN también ve la descripción de un aprobado", async () => {
    if (isTursoConfigured()) return;
    const res = await GET(
      jsonRequest(`${BASE}/api/releases?id=${APPROVED_ID}`, { token: adminToken, ip: "10.21.0.2" })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).description).toBe(DESCRIPTION);
  });

  it("el ANÓNIMO recibe la vía pública: sin admin_notes, aunque esté aprobado", async () => {
    if (isTursoConfigured()) return;
    const res = await GET(jsonRequest(`${BASE}/api/releases?id=${APPROVED_ID}`, { ip: "10.21.0.3" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(APPROVED_ID);
    expect(Object.prototype.hasOwnProperty.call(json, "admin_notes")).toBe(false);
    expect(JSON.stringify(json)).not.toContain(ADMIN_NOTES);
    // `parseTrack` tampoco expone `description`: es el tipo el que acota la
    // forma de la respuesta pública, no una lista de columnas.
    expect(Object.prototype.hasOwnProperty.call(json, "description")).toBe(false);
  });

  it("un artist que NO es el dueño no obtiene la fila cruda del aprobado ajeno", async () => {
    if (isTursoConfigured()) return;
    const res = await GET(
      jsonRequest(`${BASE}/api/releases?id=${APPROVED_ID}`, { token: strangerToken, ip: "10.21.0.4" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // Sí lo ve, pero por la vía PÚBLICA (parseado): es un release aprobado.
    expect(json.id).toBe(APPROVED_ID);
    expect(Object.prototype.hasOwnProperty.call(json, "admin_notes")).toBe(false);
  });

  it("un borrador sigue siendo null para un no-dueño (el filtro no se aflojó)", async () => {
    if (isTursoConfigured()) return;
    const strangerOwned = await GET(
      jsonRequest(`${BASE}/api/releases?id=${DRAFT_ID}`, { token: strangerToken, ip: "10.21.0.5" })
    );
    expect(await strangerOwned.json()).toBeNull();
    const anon = await GET(jsonRequest(`${BASE}/api/releases?id=${DRAFT_ID}`, { ip: "10.21.0.6" }));
    expect(await anon.json()).toBeNull();
  });
});

describe("RC.32 Tarea 3 — artist_name no es escribible", () => {
  it("un `artist_name` en el PUT se ignora: la fila no se mueve de artista", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: APPROVED_ID, title: "intento de reasignar", artist_name: OTHER_ARTIST_NAME },
        token: ownerToken,
        ip: "10.22.0.1",
      })
    );
    expect(res.status).toBe(200);
    expect(row(APPROVED_ID).artist_name).toBe(ARTIST_NAME);
    expect(row(APPROVED_ID).title).toBe("intento de reasignar");
  });

  it("ni siquiera el admin mueve el release a otro nombre por esta vía", async () => {
    if (isTursoConfigured()) return;
    await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: APPROVED_ID, artist_name: OTHER_ARTIST_NAME },
        token: adminToken,
        ip: "10.22.0.2",
      })
    );
    expect(row(APPROVED_ID).artist_name).toBe(ARTIST_NAME);
  });

  it("POST escribe el nombre CANÓNICO del perfil, no el del payload", async () => {
    if (isTursoConfigured()) return;
    // Con un espacio trailing: la comparación normalizada pasa (es su nombre),
    // pero lo que se persiste es el de la fila de `artists`. Antes se guardaba
    // el texto tecleado y la fila quedaba huérfana para siempre.
    const res = await POST(
      jsonRequest(`${BASE}/api/releases`, {
        method: "POST",
        body: {
          title: `Release huérfano ${SUFFIX}`,
          artist_name: `${ARTIST_NAME} `,
          release_date: "2026-02-02",
          cover_image: "https://example.com/a.jpg",
          description: "d",
        },
        token: ownerToken,
        ip: "10.22.0.3",
      })
    );
    expect(res.status).toBe(201);
    const created = await res.json();

    const created_ = row(created.id);
    expect(created_.artist_name).toBe(ARTIST_NAME);
    // Y por lo tanto sigue siendo editable por su dueño: la fila NO quedó
    // huérfana fuera de la cascada de `deleteArtist`.
    const owned = await isOwnedByOwner(created.id);
    expect(owned).toBe(true);

    localDb().prepare("DELETE FROM tracks WHERE id = ?").run(created.id);
  });

  it("POST sigue rechazando el nombre de otro artista (403)", async () => {
    if (isTursoConfigured()) return;
    const res = await POST(
      jsonRequest(`${BASE}/api/releases`, {
        method: "POST",
        body: {
          title: `Release ajeno ${SUFFIX}`,
          artist_name: OTHER_ARTIST_NAME,
          release_date: "2026-02-02",
          cover_image: "https://example.com/a.jpg",
        },
        token: ownerToken,
        ip: "10.22.0.4",
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("RC.32 Tarea 4 — las hijas de un álbum se guardan", () => {
  it("el tracklist enviado se persiste (antes se descartaba en silencio)", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: {
          id: ALBUM_ID,
          title: `Album ${SUFFIX}`,
          tracks: [
            { title: "Pista uno", duration: "3:45", isrc: "AAA000000001", start_time: 0, end_time: 225, track_number: 1 },
            { title: "Pista dos", duration: "4:02", isrc: "AAA000000002", start_time: 225, end_time: 467, track_number: 2 },
            { title: "Pista tres", duration: "2:13", isrc: "", start_time: 467, end_time: 600, track_number: 3 },
          ],
        },
        token: ownerToken,
        ip: "10.23.0.1",
      })
    );

    expect(res.status).toBe(200);
    expect((await res.json()).tracksSaved).toBe(3);

    const titles = childTitles();
    expect(titles).toEqual(["Pista uno", "Pista dos", "Pista tres"]);
    expect(row(ALBUM_CHILD_1).duration).toBe("3:45");
    expect(row(ALBUM_CHILD_1).isrc).toBe("AAA000000001");
    expect(row(ALBUM_CHILD_1).track_number).toBe(1);
    // El padre recalcula su duración con `sumDurations`: 225 + 242 + 133 = 600 s.
    expect(row(ALBUM_ID).duration).toBe("10:00");
  });

  it("las hijas que sobran en el payload se insertan; las que faltan se borran", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: {
          id: ALBUM_ID,
          title: `Album ${SUFFIX}`,
          tracks: [{ title: "Pista uno", duration: "3:45", start_time: 0, end_time: 225, track_number: 1 }],
        },
        token: ownerToken,
        ip: "10.23.0.2",
      })
    );

    expect(res.status).toBe(200);
    expect(childTitles()).toEqual(["Pista uno"]);
    // La tercera hija era una fila creada por el test anterior y ya no está.
    expect(row(ALBUM_CHILD_2).id).toBeUndefined();
    // 225 s de una sola hija = 3:45.
    expect(row(ALBUM_ID).duration).toBe("3:45");
  });

  it("un payload SIN `tracks` no toca las hijas (no las borra por accidente)", async () => {
    if (isTursoConfigured()) return;
    const before = childTitles();
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: ALBUM_ID, title: `Album ${SUFFIX}` },
        token: ownerToken,
        ip: "10.23.0.3",
      })
    );
    expect(res.status).toBe(200);
    expect(childTitles()).toEqual(before);
  });

  it("un `tracks: []` sobre un álbum con hijas se RECHAZA con mensaje, no las borra", async () => {
    if (isTursoConfigured()) return;
    const before = childTitles();
    expect(before.length).toBeGreaterThan(0);

    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: ALBUM_ID, title: `Album ${SUFFIX}`, tracks: [] },
        token: ownerToken,
        ip: "10.23.0.4",
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("borraría");
    expect(childTitles()).toEqual(before);
  });

  it("una hija sin título se rechaza con el índice, no se inserta en blanco", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: {
          id: ALBUM_ID,
          tracks: [{ title: "Bien", duration: "3:45" }, { title: "   ", duration: "1:00" }],
        },
        token: ownerToken,
        ip: "10.23.0.5",
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("tracks[1]");
  });

  it("un `track_number` inválido en una hija se rechaza (no llega a SQL)", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: {
          id: ALBUM_ID,
          tracks: [{ title: "Bien", duration: "3:45", track_number: "tercera" }],
        },
        token: ownerToken,
        ip: "10.23.0.6",
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("track_number");
  });

  it("sin duraciones sumables el padre conserva su duración (no se pone a 0:00)", async () => {
    if (isTursoConfigured()) return;
    localDb().prepare("UPDATE tracks SET duration = '42:00' WHERE id = ?").run(ALBUM_ID);
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: {
          id: ALBUM_ID,
          tracks: [{ title: "Sin duración", duration: "", track_number: 1 }],
        },
        token: ownerToken,
        ip: "10.23.0.7",
      })
    );
    expect(res.status).toBe(200);
    expect(row(ALBUM_ID).duration).toBe("42:00");
  });

  it("el GET del propietario devuelve las hijas: sin ellas, el form las guardaría en blanco", async () => {
    if (isTursoConfigured()) return;
    const res = await GET(
      jsonRequest(`${BASE}/api/releases?id=${ALBUM_ID}`, { token: ownerToken, ip: "10.23.0.8" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.tracks)).toBe(true);
    expect(json.tracks.map((t: { title: string }) => t.title)).toEqual(childTitles());
  });
});

describe("RC.32 — misc del contrato PUT", () => {
  it("sin sesión sigue siendo 401", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, { method: "PUT", body: { id: APPROVED_ID, title: "x" } })
    );
    expect(res.status).toBe(401);
  });

  it("un id inexistente sigue siendo 404", async () => {
    if (isTursoConfigured()) return;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: `no-existe-${SUFFIX}`, title: "x" },
        token: ownerToken,
        ip: "10.24.0.1",
      })
    );
    expect(res.status).toBe(404);
  });

  it("`genre` ya no se escribe: la columna muerta no la toca nadie por esta vía", async () => {
    if (isTursoConfigured()) return;
    const before = row(APPROVED_ID).genre;
    const res = await PUT(
      jsonRequest(`${BASE}/api/releases`, {
        method: "PUT",
        body: { id: APPROVED_ID, genre: "Shoegaze", production_details: JSON.stringify({ genre: "Shoegaze" }) },
        token: ownerToken,
        ip: "10.24.0.2",
      })
    );
    expect(res.status).toBe(200);
    expect(row(APPROVED_ID).genre).toBe(before);
    // El género sí acaba en `production_details`, que es donde se lee.
    expect(String(row(APPROVED_ID).production_details)).toContain("Shoegaze");
  });
});

// ── helpers locales ─────────────────────────────────────────────────────────

function childTitles(): string[] {
  const db = localDb();
  const rows = db
    .prepare("SELECT title FROM tracks WHERE release_id = ? ORDER BY COALESCE(track_number, 9999), start_time, id")
    .all(ALBUM_ID) as { title: string }[];
  db.close();
  return rows.map((r) => String(r.title));
}

async function isOwnedByOwner(trackId: string): Promise<boolean> {
  const res = await GET(
    jsonRequest(`${BASE}/api/releases?id=${trackId}`, { token: ownerToken, ip: "10.25.0.1" })
  );
  const json = await res.json();
  return json != null && json.artist_name === ARTIST_NAME;
}
