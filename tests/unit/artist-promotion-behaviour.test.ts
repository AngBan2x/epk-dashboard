/**
 * RC.32 Tarea 4 — comportamiento real de `lib/artist-promotion.ts`.
 *
 * ── Por qué este archivo existe ──────────────────────────────────────────────
 * `tests/unit/approvals-split.test.ts:33-34` hace `vi.mock("@/lib/artist-promotion")`:
 * mockea el módulo entero. Eso prueba el CABLEADO de la ruta de aprobaciones
 * (que se llama a la promoción y que un fallo no rompe la respuesta), pero no
 * una sola línea de la lógica de promoción. Y `tests/unit/submissions-portal.test.ts`
 * solo hace un test de caracterización sobre el TEXTO de `userHasApprovedContent`.
 *
 * Es decir: la función que decide el rol de un usuario no tenía ni un test de
 * comportamiento. Este lo cubre.
 *
 * ── La gravedad real, para no exagerarla ─────────────────────────────────────
 * La promoción NO rompía el flujo de aprobación.
 * `app/api/admin/approvals/[id]/route.ts:138-145` la envuelve en try/catch y
 * devuelve 200 igual, con `promoted: false` y un `console.error`. El grado era
 * «promoción fallida en silencio»: el admin aprobaba y el usuario no se
 * promovía, y la respuesta no decía nada. Por eso aquí no se prueba el try/catch
 * de la ruta, sino lo que este módulo hace cuando se lo deja ejecutar.
 *
 * ── Qué NO se prueba aquí y por qué ──────────────────────────────────────────
 * No hay transacción entre el cambio de rol y la creación del perfil, y no hace
 * falta: si la segunda falla, el estado parcial es autorreparable. Se re-ejecuta,
 * entra por la rama `isArtist`, `getArtistByUserId` devuelve null y crea el
 * perfil. Ese camino sí está cubierto, más abajo («estado parcial»).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Solo se sustituye la CAPA DE BACKEND. Todo lo demás de `@/lib/db` (createUser,
// getUserById, createArtist, getAllTrackSubmissions, deleteUser, deleteArtist,
// isTursoConfigured…) sigue siendo el módulo real, que es lo que permite hacer
// las aserciones contra la base de datos local de verdad en vez de contra mocks.
const h = vi.hoisted(() => ({
  getTursoClientSync: vi.fn(),
  getLocalDbWrite: vi.fn(),
  realGetLocalDbWrite: null as null | (() => unknown),
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  h.realGetLocalDbWrite = actual.getLocalDbWrite;
  return {
    ...actual,
    getTursoClientSync: h.getTursoClientSync,
    getLocalDbWrite: h.getLocalDbWrite,
  };
});

import {
  createTrackSubmission,
  createUser,
  deleteArtist,
  deleteUser,
  getArtistByUserId,
  getUserById,
  isTursoConfigured,
} from "@/lib/db";
import { promoteUserToArtist } from "@/lib/artist-promotion";
import type { User } from "@/types/music";

const SUFFIX = `promo-${Date.now()}`;
const PENDING_USER = `promo-pending-${SUFFIX}`;
const APPROVED_USER = `promo-approved-${SUFFIX}`;
const OTHER_USER = `promo-other-${SUFFIX}`;
const NO_CONTENT_USER = `promo-empty-${SUFFIX}`;
const PARTIAL_USER = `promo-partial-${SUFFIX}`;
// Usuarios dedicated a la rama del backend. Necesitan ser usuarios NUEVOS y sin
// perfil en cada test: si ya son `artist` con perfil, `promoteUserToArtist`
// devuelve por la rama idempotente y nunca llega a `updateUserRole`, que es
// justo lo que estos dos tests quieren observar.
const TURSO_BRANCH_USER = `promo-turso-${SUFFIX}`;
const LOCAL_BRANCH_USER = `promo-local-${SUFFIX}`;

async function makeUser(id: string, role: User["role"]): Promise<void> {
  await createUser({
    id,
    name: `Artista ${id}`,
    email: `${id}@example.com`,
    password_hash: "x",
    role,
    preferences: null,
    avatar: null,
    email_verified: false,
    deleted_at: null,
    last_login: null,
  });
}

function submissionFor(userId: string, status: "pending" | "approved"): void {
  void createTrackSubmission({
    id: `sub-${userId}-${status}`,
    user_id: userId,
    track_data: JSON.stringify({ title: `Tema de ${userId}` }),
    status,
    admin_notes: status === "approved" ? "aprobado en test" : null,
    submission_type: "track",
    metadata: null,
    admin_id: status === "approved" ? "admin-test" : null,
    reviewed_at: status === "approved" ? new Date().toISOString() : null,
  });
}

beforeAll(async () => {
  // Misma convención que los otros 83 guards: bajo vitest el env de Turso está
  // borrado (vitest.config.ts:7-8), así que esto no salta. Se deja por
  // coherencia con el resto de la suite.
  if (isTursoConfigured()) return;
  await makeUser(PENDING_USER, "subscriber");
  await makeUser(APPROVED_USER, "subscriber");
  await makeUser(OTHER_USER, "subscriber");
  await makeUser(NO_CONTENT_USER, "subscriber");
  await makeUser(PARTIAL_USER, "artist");
  await makeUser(TURSO_BRANCH_USER, "subscriber");
  await makeUser(LOCAL_BRANCH_USER, "subscriber");
  submissionFor(TURSO_BRANCH_USER, "approved");
  submissionFor(LOCAL_BRANCH_USER, "approved");
});

afterAll(async () => {
  for (const id of [
    PENDING_USER,
    APPROVED_USER,
    OTHER_USER,
    NO_CONTENT_USER,
    PARTIAL_USER,
    TURSO_BRANCH_USER,
    LOCAL_BRANCH_USER,
  ]) {
    const artist = await getArtistByUserId(id);
    if (artist) await deleteArtist(artist.id);
    await deleteUser(id);
  }
});

beforeEach(() => {
  // Sin esto, el historial de llamadas se acumula entre tests y el test de la
  // rama de Turso ve la llamada al handle local del test anterior.
  h.getTursoClientSync.mockClear();
  h.getLocalDbWrite.mockClear();
  // Por defecto: sin cliente Turso, y el handle local es el real. Los tests que
  // necesitan otra cosa lo cambian aquí mismo.
  h.getTursoClientSync.mockReturnValue(null);
  h.getLocalDbWrite.mockImplementation(h.realGetLocalDbWrite as () => unknown);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Comportamiento contra SQLite local
// ─────────────────────────────────────────────────────────────────────────────

describe("RC.32 T4 — promoteUserToArtist contra la base local", () => {
  it("un suscriptor sin nada aprobado NO se promueve (source: release)", async () => {
    await expect(promoteUserToArtist(NO_CONTENT_USER, { source: "release" })).rejects.toThrow(
      /no tiene contenido aprobado/i
    );
    const user = await getUserById(NO_CONTENT_USER);
    expect(user?.role).toBe("subscriber");
  });

  it("una submission PENDING tampoco cuenta como contenido aprobado", async () => {
    submissionFor(PENDING_USER, "pending");
    await expect(promoteUserToArtist(PENDING_USER, { source: "release" })).rejects.toThrow(/no tiene contenido aprobado/i);
    expect((await getUserById(PENDING_USER))?.role).toBe("subscriber");
  });

  it("con una submission APROBADA cambia el rol de verdad y crea el perfil", async () => {
    submissionFor(APPROVED_USER, "approved");
    const result = await promoteUserToArtist(APPROVED_USER, { source: "release" });

    expect(result.promoted).toBe(true);
    expect(result.created).toBe(true);
    expect(result.artistId).not.toBe("");

    // El cambio real está en users.role, no solo en la tabla artists. Es lo que
    // dice el nombre de la función y lo que se olvidaba mirar en las pruebas.
    const user = await getUserById(APPROVED_USER);
    expect(user?.role).toBe("artist");

    const artist = await getArtistByUserId(APPROVED_USER);
    expect(artist).not.toBeNull();
    expect(artist?.id).toBe(result.artistId);
    expect(artist?.user_id).toBe(APPROVED_USER);
  });

  it("es idempotente: la segunda llamada no toca nada", async () => {
    const existing = await getArtistByUserId(APPROVED_USER);
    const second = await promoteUserToArtist(APPROVED_USER, { source: "release" });
    expect(second.promoted).toBe(false);
    expect(second.created).toBe(false);
    expect(second.artistId).toBe(existing?.id);
  });

  it("ownership: la submission aprobada de OTRO usuario no promueve a este", async () => {
    submissionFor(OTHER_USER, "approved");
    await expect(promoteUserToArtist(NO_CONTENT_USER, { source: "release" })).rejects.toThrow(
      /no tiene contenido aprobado/i
    );
    expect((await getUserById(NO_CONTENT_USER))?.role).toBe("subscriber");
  });

  it("estado parcial: rol 'artist' ya cambiado pero sin perfil → se autorepara", async () => {
    // Es el escenario que justificaba no meter transacción: si el cambio de rol
    // tuvo éxito y la creación del perfil falló, re-ejecutar completa el trabajo.
    expect(await getArtistByUserId(PARTIAL_USER)).toBeNull();
    const result = await promoteUserToArtist(PARTIAL_USER, { source: "manual" });
    expect(result.created).toBe(true);
    expect(await getArtistByUserId(PARTIAL_USER)).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. La rama del backend — esto es lo que rompe al revertir el arreglo
// ─────────────────────────────────────────────────────────────────────────────

describe("RC.32 T4 — updateUserRole usa el mismo cliente que decide la rama", () => {
  it("con cliente Turso, escribe con ESE cliente y no toca el handle local", async () => {
    const execute = vi.fn(async (_stmt: { sql: string; args?: unknown[] }) => ({
      rows: [],
      rowsAffected: 1,
    }));
    h.getTursoClientSync.mockReturnValue({ execute });

    // Handle local envenenado: si el código lo pidiera, este test falla con
    // "getLocalDbWrite() no debe tocarse" en vez de pasar en verde.
    h.getLocalDbWrite.mockImplementation(() => {
      throw new Error("getLocalDbWrite() no debe tocarse cuando hay cliente Turso");
    });

    await promoteUserToArtist(TURSO_BRANCH_USER, { source: "release" });

    expect(execute).toHaveBeenCalled();
    const call = execute.mock.calls.find((c) => String(c[0]?.sql).includes("UPDATE users SET role"));
    expect(call, "no se ejecutó el UPDATE de users.role contra Turso").toBeDefined();
    expect(call?.[0]?.args).toEqual(["artist", TURSO_BRANCH_USER]);
    expect(h.getLocalDbWrite).not.toHaveBeenCalled();

    // Y el rol NO se escribió en SQLite: la decisión y la ejecución salieron del
    // mismo objeto, así que no hay forma de escribir en un sitio creyendo que se
    // escribió en el otro.
    expect((await getUserById(TURSO_BRANCH_USER))?.role).toBe("subscriber");
  });

  it("sin cliente Turso, escribe con el handle local y el rol persiste", async () => {
    h.getTursoClientSync.mockReturnValue(null);
    await promoteUserToArtist(LOCAL_BRANCH_USER, { source: "release" });
    expect(h.getLocalDbWrite).toHaveBeenCalled();
    expect((await getUserById(LOCAL_BRANCH_USER))?.role).toBe("artist");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Guardas de fuente — el criterio único, escrito
// ─────────────────────────────────────────────────────────────────────────────

describe("RC.32 T4 — artist-promotion.ts usa el criterio de las 8 rutas migradas", () => {
  /** Sin comentarios, para que las aserciones miren CÓDIGO y no prosa. */
  const code = readFileSync(resolve(process.cwd(), "lib/artist-promotion.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  it("decide con getTursoClientSync(), no con isTursoEnabled()", () => {
    // El patrón prohibido ramificaba con `isTursoEnabled()` y pedía el handle
    // por otro camino: predicado y handle son decisiones independientes, así que
    // pueden discrepar y el resultado es un 500 o una escritura en el sitio
    // equivocado creyendo que se escribió en el correcto.
    expect(code).toMatch(/getTursoClientSync\(\)/);
    expect(code).not.toMatch(/if\s*\(\s*isTursoEnabled\(\)\s*\)/);
  });

  it("nunca pide el handle con getDbWrite()", () => {
    expect(code).not.toMatch(/\bgetDbWrite\b/);
  });

  it("el handle local solo aparece en el brazo sin cliente", () => {
    expect(code).toMatch(/getLocalDbWrite\(\)\.prepare\(/);
  });
});