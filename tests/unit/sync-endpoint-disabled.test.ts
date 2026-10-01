/**
 * RC.32 Tarea 1 — `POST /api/sync` está deshabilitado y este archivo falla si
 * alguien lo vuelve a abrir.
 *
 * ── Por qué este endpoint era la mina más grave del repo ─────────────────────
 * No sincronizaba nada útil. Turso ES la base de datos de producción y
 * `lib/db.ts` escribe contra ella en cada petición; el endpoint machacaba el
 * catálogo aprobado con el estado de una copia local, sin dry-run, sin backup y
 * sin confirmación. Dos efectos, ambos irreversibles:
 *
 *   1. `syncLocalToTurso` (`lib/turso.ts`) escribe `INSERT OR REPLACE INTO
 *      tracks` sobre 24 columnas y omite 8: `release_id`, `start_time`,
 *      `end_time`, `track_number`, `genre`, `description`, `admin_notes` y
 *      `updated_at`. `INSERT OR REPLACE` es DELETE + INSERT, así que lo omitido
 *      vuelve a DEFAULT/NULL. `release_id` → NULL deja huérfanas las 65 pistas
 *      hijas de los releases multipista; `admin_notes` → NULL borra el audit
 *      trail de aprobación de P4.5.
 *   2. El mapeo de la ruta no copiaba `status`, de modo que el `?? 'draft'` de
 *      `lib/turso.ts` aplicaba a las 83 filas, todas en `approved`: el catálogo
 *      entero volvía a `draft`, o sea se despublicaba.
 *
 * ── Qué hace este test además de mirar el 410 ───────────────────────────────
 * Un 410 «a pelo» no protege de nada: basta con que alguien mueva el `return`,
 * saque el `requireAdmin` de en medio, o llame al cliente Turso antes. Por eso
 * aquí hay tres capas independientes, y las tres tienen que fallar si el
 * endpoint vuelve a hacer algo:
 *
 *   - COMPORTAMIENTO: con `@/lib/turso`, `@/lib/db` y `@/lib/webhook-auth`
 *     mockeados, un POST no puede tocar ninguno de ellos.
 *   - FUENTE: el cuerpo del handler `POST` no puede contener la llamada
 *     destructiva ni devolver otro status.
 *   - ENTORNO (RC.32 Tareas 2 y 3): `lib/turso.ts` lee `process.env` en tiempo
 *     de llamada y ya no exporta el `isTursoConfigured()` que colisionaba con el
 *     de `@/lib/db`.
 *
 * Nota sobre ese tercer punto: el `isTursoConfigured()` de `@/lib/turso` era un
 * snapshot del env capturado al importar el módulo, mientras el de `@/lib/db` es
 * un predicado de tiempo de llamada. Dos funciones con el mismo nombre y
 * semántica distinta; importar la equivocada no daba error de compilación, sino
 * un 500 en producción. Se eliminó en vez de renombrarse.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";

// Solo se sustituyen las tres piezas que el endpoint usaría para hacer daño.
// El resto de `@/lib/turso` (incluido `getTursoClient`, que sí se prueba abajo
// de verdad) viene del módulo original.
vi.mock("@/lib/turso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/turso")>();
  return {
    ...actual,
    ensureTursoSchema: vi.fn(async () => true),
    syncLocalToTurso: vi.fn(async () => ({ synced: 0, failed: 0, errors: [] })),
    syncArtistsToTurso: vi.fn(async () => ({ synced: 0, failed: 0, errors: [] })),
    syncUsersToTurso: vi.fn(async () => ({ synced: 0, failed: 0, errors: [] })),
    syncShowsToTurso: vi.fn(async () => ({ synced: 0, failed: 0, errors: [] })),
    syncSubscriptionsToTurso: vi.fn(async () => ({ synced: 0, failed: 0, errors: [] })),
  };
});

// Se mockea entero para no abrir better-sqlite3: si el endpoint volviera a
// llamar a `getAllTracks()`, el mock lo registra y el test falla. No importa que
// falten el resto de exports porque la ruta solo importa este.
vi.mock("@/lib/db", () => ({
  getAllTracks: vi.fn(async () => []),
}));

vi.mock("@/lib/webhook-auth", () => ({
  requireAdmin: vi.fn(async () => null),
}));

import { POST, GET } from "@/app/api/sync/route";
import {
  ensureTursoSchema,
  syncArtistsToTurso,
  syncLocalToTurso,
  getTursoClient,
} from "@/lib/turso";
import { getAllTracks } from "@/lib/db";
import { requireAdmin } from "@/lib/webhook-auth";

const ROUTE = "app/api/sync/route.ts";
const TURSO = "lib/turso.ts";

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/** Texto del handler `POST`, desde su declaración hasta la de `GET`. */
function postHandlerSource(): string {
  const src = readSource(ROUTE);
  const from = src.indexOf("export async function POST");
  const to = src.indexOf("export async function GET");
  expect(from, `no se encuentra "export async function POST" en ${ROUTE}`).toBeGreaterThan(-1);
  expect(to, `no se encuentra "export async function GET" en ${ROUTE}`).toBeGreaterThan(from);
  return src.slice(from, to);
}

function postRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/sync", { method: "POST" });
}

afterEach(() => {
  vi.clearAllMocks();
  // Este archivo pone el env de Turso a mano en un test; se devuelve al estado
  // en el que lo dejó `vitest.config.ts` (ausente) para no filtrarlo a otro.
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
});

describe("RC.32 T1 — POST /api/sync responde 410 y no toca nada", () => {
  it("devuelve 410 Gone", async () => {
    const res = await POST(postRequest());
    expect(res.status).toBe(410);
  });

  it("no llama a syncLocalToTurso, ni al resto del pipeline de sincronización", async () => {
    await POST(postRequest());
    expect(syncLocalToTurso).not.toHaveBeenCalled();
    expect(ensureTursoSchema).not.toHaveBeenCalled();
    expect(syncArtistsToTurso).not.toHaveBeenCalled();
  });

  it("ni siquiera lee el catálogo local", async () => {
    await POST(postRequest());
    expect(getAllTracks).not.toHaveBeenCalled();
  });

  it("el 410 va ANTES de requireAdmin, y no después", async () => {
    // Esto no es una preferencia de orden. Si el auth se comprobara primero, un
    // POST sin sesión devolvería 401 y ESTE archivo pasaría igual con el
    // endpoint abierto: 401 y 410 bloquean los dos. Con el 410 primero, la
    // única respuesta posible del handler es «no existe».
    (requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "No autenticado" }), { status: 401 })
    );
    const res = await POST(postRequest());
    expect(res.status).toBe(410);
  });

  it("el cuerpo explica el motivo y dice qué usar en su lugar", async () => {
    const body = (await (await POST(postRequest())).json()) as {
      error: string;
      why: string[];
      useInstead: string[];
    };
    expect(body.error).toBe("ENDPOINT_DESHABILITADO");
    expect(body.why.join(" ")).toMatch(/INSERT OR REPLACE/);
    expect(body.why.join(" ")).toMatch(/admin_notes/);
    expect(body.useInstead.join(" ")).toMatch(/turso-check/);
  });

  it("GET también es 410: un GET que anunciara un POST funcional sería la misma trampa", async () => {
    const res = await GET();
    expect(res.status).toBe(410);
  });
});

describe("RC.32 T1 — la fuente no se puede reabrir en silencio", () => {
  it("el handler POST no contiene la llamada destructiva", () => {
    const handler = postHandlerSource();
    expect(handler).not.toMatch(/syncLocalToTurso\(/);
    expect(handler).not.toMatch(/ensureTursoSchema\(/);
    expect(handler).not.toMatch(/getAllTracks\(/);
  });

  it("el handler POST sí devuelve 410", () => {
    expect(postHandlerSource()).toMatch(/410/);
  });

  it("el cuerpo muerto sigue escrito, para que la decisión sea reversible", () => {
    const src = readSource(ROUTE);
    const marker = src.indexOf("CUERPO MUERTO");
    expect(marker, "el cuerpo muerto se ha borrado; revisa el porqué antes de reimplementarlo").toBeGreaterThan(-1);
    expect(src.slice(marker)).toMatch(/async function legacySyncImplementation/);
    // Y guarda el diagnóstico de las 8 columnas omitidas.
    expect(src.slice(0, marker)).toMatch(/admin_notes/);
    expect(src.slice(0, marker)).toMatch(/release_id/);
  });
});

describe("RC.32 T2 — lib/turso.ts lee el env en tiempo de llamada", () => {
  it("no hay const de módulo con el env de Turso", () => {
    // El bug original: `const TURSO_URL = process.env.TURSO_DATABASE_URL` a
    // nivel de módulo se evalúa UNA vez, al importar. Con el env llegando
    // después —lo normal en un bundle de Vercel— quedaba en `undefined` para
    // siempre.
    const src = readSource(TURSO);
    expect(src).not.toMatch(/^\s*(?:export\s+)?const\s+TURSO_(?:URL|TOKEN)\b/m);
  });

  it("el env se lee con getters, igual que en lib/db.ts", () => {
    const src = readSource(TURSO);
    expect(src).toMatch(/export function getTursoUrl\(\): string \| undefined/);
    expect(src).toMatch(/export function getTursoToken\(\): string \| undefined/);
  });

  it("getTursoClient() ve un env que se puso DESPUÉS de importar el módulo", () => {
    // Este es el test que revierte a rojo si alguien vuelve a la constante.
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    expect(getTursoClient()).toBeNull();

    process.env.TURSO_DATABASE_URL = "libsql://turso-inexistente.invalid";
    process.env.TURSO_AUTH_TOKEN = "token-de-prueba";

    // Con el snapshot de las const, aquí seguía devolviendo `null`.
    expect(getTursoClient()).not.toBeNull();
  });
});

describe("RC.32 T3 — el isTursoConfigured() de lib/turso.ts ya no existe", () => {
  it("lib/turso.ts no lo exporta", () => {
    const src = readSource(TURSO);
    expect(src).not.toMatch(/export function isTursoConfigured/);
    expect(src).not.toMatch(/function isTursoConfigured/);
  });

  it("no queda ninguna ruta de producción importándolo de @/lib/turso", () => {
    // `app/api/sync/route.ts` era el único. El que usan los tests viene de
    // `@/lib/db` y es un alias de `isTursoEnabled()`: ese se queda.
    const src = readSource(ROUTE);
    expect(src).not.toMatch(/import[^;]*\bisTursoConfigured\b[^;]*from\s*["']@\/lib\/turso["']/);
  });
});