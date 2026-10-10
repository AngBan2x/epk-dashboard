/**
 * `DELETE /api/shows/cleanup` — la ventana de 48 h exactas, el entorno leído
 * en tiempo de llamada y el aviso best-effort (PARTE 2).
 *
 * ## Por qué el reloj es falso
 *
 * El borde que importa son los minutos alrededor de las 48 h, y con un reloj
 * real ese borde se mueve mientras corre el test. `vi.setSystemTime` fija el
 * instante, así que "47 h 59 min" es literalmente 47 h 59 min y no una carrera.
 *
 * ## Por qué se mockea `@/lib/db` y no `@libsql/client`
 *
 * Para que el test sea hermético: contra el motor real acabaría escribiendo en
 * `data/music_catalog.db`. `getTursoClientSync` se sustituye por una versión
 * que hace **lo mismo que la de verdad** —leer `process.env` en tiempo de
 * llamada—, de modo que el test sigue comprobando la invariante que importa
 * (la ruta consulta el entorno en cada petición) y no una implementación.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { sinComentarios } from "../helpers/strip-comments";

// ── Doubles ───────────────────────────────────────────────────────────────────

type FakeClient = {
  execute: (arg: string | { sql: string; args?: unknown[] }) => Promise<unknown>;
};

const tursoRows: Record<string, unknown>[] = [];
const deletedIds: string[] = [];

function fakeTursoClient(): FakeClient {
  return {
    execute: async (arg) => {
      const sql = typeof arg === "string" ? arg : arg.sql;
      if (/^\s*SELECT/i.test(sql)) {
        return { rows: tursoRows, rowsAffected: 0 };
      }
      const args = typeof arg === "string" ? [] : (arg.args ?? []);
      deletedIds.push(...(args as string[]));
      return { rows: [], rowsAffected: args.length };
    },
  };
}

const localRows: Record<string, unknown>[] = [];

const mockGetTursoClientSync = vi.fn((): FakeClient | null =>
  process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN
    ? fakeTursoClient()
    : null
);

const mockRequireAdmin = vi.fn(async (): Promise<unknown> => null);
const mockNotifyArtistOwner = vi.fn(
  async (_input: {
    artistId: string;
    title: string;
    message: string;
    emailData: { showDate?: string };
  }): Promise<{ notified: number; emailsSent: number; skipped: number; failures: string[] }> => ({
    notified: 1,
    emailsSent: 1,
    skipped: 0,
    failures: [],
  })
);

vi.mock("@/lib/db", () => ({
  getTursoClientSync: mockGetTursoClientSync,
  getLocalDbWrite: () => ({
    prepare: (sql: string) => ({
      all: () => localRows,
      run: (...args: unknown[]) => {
        const ids = sql.includes("DELETE") ? (args as string[]) : [];
        deletedIds.push(...ids);
        return { changes: ids.length };
      },
    }),
  }),
}));

vi.mock("@/lib/webhook-auth", () => ({ requireAdmin: mockRequireAdmin }));

vi.mock("@/lib/subscriber-notifications", () => ({
  notifyArtistOwner: mockNotifyArtistOwner,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** 2026-03-10T12:00:00Z */
const AHORA = new Date("2026-03-10T12:00:00.000Z");

function show(id: string, date: string | null, time: string | null = null): Record<string, unknown> {
  return { id, venue_name: `Sala ${id}`, date, time, artist_id: `art-${id}` };
}

/** Fecha/hora UTC del show, en la forma que se guarda en la tabla. */
function at(offsetHours: number): { date: string; time: string } {
  const t = new Date(AHORA.getTime() - offsetHours * 3_600_000);
  return {
    date: t.toISOString().slice(0, 10),
    time: t.toISOString().slice(11, 16),
  };
}

async function callCleanup(opts: { freshImport?: boolean } = {}) {
  if (opts.freshImport) {
    // Sin esto, el módulo ya estaría cacheado de un test anterior —importado
    // con el env puesto— y una lectura en ámbito de módulo parecería correcta.
    vi.resetModules();
  }
  const { DELETE } = await import("@/app/api/shows/cleanup/route");
  const req = new NextRequest("http://localhost/api/shows/cleanup", { method: "DELETE" });
  const res = await DELETE(req);
  return { res, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  tursoRows.length = 0;
  localRows.length = 0;
  deletedIds.length = 0;
  // Por defecto la ruta va a Turso (doble falso). Los tests que mitral el env
  // lo quitan o lo ponen explícitamente.
  process.env.TURSO_DATABASE_URL = "libsql://falso.example";
  process.env.TURSO_AUTH_TOKEN = "token-falso";
  mockRequireAdmin.mockResolvedValue(null);
  mockNotifyArtistOwner.mockResolvedValue({
    notified: 1,
    emailsSent: 1,
    skipped: 0,
    failures: [],
  });
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
});

// ── 1. El borde de 48 h exactas ──────────────────────────────────────────────

describe("el corte son 48 h exactas, no un día UTC", () => {
  it("a 47 h 59 min NO borra", async () => {
    const casi = at(47 + 59 / 60);
    tursoRows.push(show("show-casi", casi.date, casi.time));

    const { body } = await callCleanup();

    expect(body.deleted).toBe(0);
    expect(deletedIds).toEqual([]);
  });

  it("a 48 h 01 min SÍ borra", async () => {
    const pasado = at(48 + 1 / 60);
    tursoRows.push(show("show-pasado", pasado.date, pasado.time));

    const { body } = await callCleanup();

    expect(body.deleted).toBe(1);
    expect(deletedIds).toEqual(["show-pasado"]);
  });

  it("justo a las 48 h 00 min ya cuenta como pasado", async () => {
    const exacto = at(48);
    tursoRows.push(show("show-exacto", exacto.date, exacto.time));

    const { body } = await callCleanup();

    expect(body.deleted).toBe(1);
  });

  it("el corte del día UTC anterior daba un resultado DISTINTO, y por eso el caso es real", () => {
    // Este es el fallo que se arregla, escrito como contraste: el código viejo
    // hacía `now - 48h` y se quedaba con la FECHA (`.split("T")[0]`), así que un
    // show de 48 h y 30 min antes caía el mismo día y no se borraba hasta el
    // siguiente. Con el instante completo sí se borra.
    const pasado = at(48 + 30 / 60);
    const cutoffViejo = new Date(AHORA.getTime() - 48 * 3_600_000).toISOString().slice(0, 10);
    const instante = new Date(`${pasado.date}T${pasado.time}:00.000Z`).getTime();
    const nuevo = new Date(AHORA.getTime() - 48 * 3_600_000).getTime();

    // Viejo: compara `pasado.date < cutoffViejo` → falso, sobrevive.
    expect(pasado.date < cutoffViejo).toBe(false);
    // Nuevo: compara instantes → verdadero, se borra.
    expect(instante <= nuevo).toBe(true);
  });

  it("sin hora rellena el corte cae a las 00:00 del día, igual que antes", async () => {
    // Comportamiento heredado a propósito: quien no rellena la hora no ve
    // cambiar nada respecto al corte por día.
    const dosDias = at(49);
    tursoRows.push(show("show-sin-hora", dosDias.date, null));

    const { body } = await callCleanup();

    expect(body.deleted).toBe(1);
  });

  it("un show sin fecha NO se borra nunca, porque no se puede saber que pasó", async () => {
    tursoRows.push(show("show-sin-fecha", null, "20:00"));
    tursoRows.push(show("show-fecha-basura", "no-es-una-fecha", "20:00"));

    const { body } = await callCleanup();

    expect(body.deleted).toBe(0);
    expect(body.skippedSinFecha).toBe(2);
    expect(deletedIds).toEqual([]);
  });

  it("no borra lo que aún no ha pasado aunque la fecha sea antigua", async () => {
    // defense-in-depth: una fila con `release_id` de una resiembra podría llegar
    // con fecha futura.
    const futuro = new Date(AHORA.getTime() + 3 * 86_400_000);
    tursoRows.push(
      show("show-futuro", futuro.toISOString().slice(0, 10), futuro.toISOString().slice(11, 16))
    );

    const { body } = await callCleanup();

    expect(body.deleted).toBe(0);
  });

  it("el corte se decide una vez y se devuelve en la respuesta", async () => {
    tursoRows.push(show("show-a", at(50).date, at(50).time));

    const { body } = await callCleanup();

    expect(body.cutoff).toBe(new Date(AHORA.getTime() - 48 * 3_600_000).toISOString());
    expect(body.graceHours).toBe(48);
  });
});

// ── 2. Entorno en tiempo de llamada ──────────────────────────────────────────

describe("el backend se decide en tiempo de llamada, no al importar", () => {
  it("sin env usa el motor local", async () => {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    localRows.push({ ...show("local-1", at(50).date, at(50).time) });

    const { res, body } = await callCleanup({ freshImport: true });

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(1);
    expect(mockGetTursoClientSync).toHaveBeenCalled();
  });

  it("con env PONE DESPUÉS del import cambia a Turso en la siguiente petición", async () => {
    // Este es el test que falla al volver a una lectura en ámbito de módulo
    // (`const USE_TURSO = Boolean(process.env.TURSO_DATABASE_URL)`): el módulo se
    // importa con el env ausente, así que esa `const` queda en `false` para
    // siempre y la petición posterior, con el env ya puesto, sigue yendo al
    // motor local.
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    tursoRows.push(show("turso-1", at(50).date, at(50).time));
    localRows.push({ ...show("local-1", at(50).date, at(50).time) });

    const { DELETE } = await import("@/app/api/shows/cleanup/route");
    const req = () => new NextRequest("http://localhost/api/shows/cleanup", { method: "DELETE" });

    // 1) Sin env: motor local.
    expect((await (await DELETE(req())).json()).deleted).toBe(1);

    // 2) El env llega después del import. Ahora debe ir a Turso.
    process.env.TURSO_DATABASE_URL = "libsql://aprovechado.example";
    process.env.TURSO_AUTH_TOKEN = "token";
    deletedIds.length = 0;

    const res = await DELETE(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(1);
    expect(deletedIds).toEqual(["turso-1"]);
  });

  it("y quitando el env vuelve al motor local", async () => {
    tursoRows.push(show("turso-2", at(50).date, at(50).time));
    await callCleanup();

    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    localRows.push({ ...show("local-2", at(50).date, at(50).time) });

    const { body } = await callCleanup();

    expect(body.deleted).toBe(1);
    expect(deletedIds).toContain("local-2");
  });

  it("el archivo no lee process.env ni abre su propio cliente de Turso", () => {
    const src = sinComentarios(
      fs.readFileSync(
        path.join(process.cwd(), "app", "api", "shows", "cleanup", "route.ts"),
        "utf8"
      )
    );
    // La regla de dual-mode: una sola fuente de verdad (`getTursoClientSync`),
    // leída en tiempo de llamada. Un `process.env` propio, un `createClient`
    // propio o un `isTursoConfigured` propio serían el patrón GAP-B de RC.32.
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/createClient/);
    expect(src).not.toMatch(/isTursoConfigured|isTursoEnabled/);
    expect(src).toMatch(/getTursoClientSync/);
    expect(src).toMatch(/getLocalDbWrite/);
  });

  it("el handle local no se pide al importar el módulo", () => {
    const src = sinComentarios(
      fs.readFileSync(
        path.join(process.cwd(), "app", "api", "shows", "cleanup", "route.ts"),
        "utf8"
      )
    );
    // `getLocalDbWrite()` solo puede aparecer en el import y en las dos
    // funciones que reciben el cliente ya decidido. Una llamada en `DELETE` o en
    // ámbito de módulo sería el "el handle local se abre antes de saber si hay
    // Turso" que la regla prohíbe.
    const llamadas = src.match(/getLocalDbWrite\(\)/g) ?? [];
    expect(llamadas).toHaveLength(2);
    const cuerpoDelete = src.slice(src.indexOf("export async function DELETE"));
    expect(cuerpoDelete).not.toMatch(/getLocalDbWrite\(\)/);
  });
});

// ── 3. El aviso no puede llevarse por delante el DELETE ──────────────────────

describe("el aviso al artista es best-effort", () => {
  it("un Resend caído NO convierte el DELETE en un 500", async () => {
    tursoRows.push(show("show-ok", at(50).date, at(50).time));
    mockNotifyArtistOwner.mockRejectedValue(new Error("502 Bad Gateway (Resend)"));

    const { res, body } = await callCleanup();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(1);
    expect(deletedIds).toEqual(["show-ok"]);
  });

  it("sigue con los demás shows aunque uno falle al avisar", async () => {
    tursoRows.push(
      show("show-1", at(50).date, at(50).time),
      show("show-2", at(51).date, at(51).time),
      show("show-3", at(52).date, at(52).time)
    );
    let llamadas = 0;
    mockNotifyArtistOwner.mockImplementation(async () => {
      llamadas += 1;
      if (llamadas === 2) throw new Error("502 Bad Gateway (Resend)");
      return { notified: 1, emailsSent: 1, skipped: 0, failures: [] };
    });

    const { res, body } = await callCleanup();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(3);
    expect(llamadas).toBe(3);
  });

  it("notifica a los que se han borrado, con la fecha y la hora del show", async () => {
    const pasado = at(50);
    tursoRows.push(show("show-x", pasado.date, pasado.time));

    await callCleanup();

    expect(mockNotifyArtistOwner).toHaveBeenCalledTimes(1);
    const arg = mockNotifyArtistOwner.mock.calls[0][0];
    expect(arg.artistId).toBe("art-show-x");
    expect(arg.message).toContain(pasado.date);
    expect(arg.emailData.showDate).toBe(`${pasado.date} ${pasado.time}`);
  });

  it("no notifica a nadie cuando no se borra nada", async () => {
    tursoRows.push(show("show-futuro", at(-50).date, at(-50).time));

    await callCleanup();

    expect(mockNotifyArtistOwner).not.toHaveBeenCalled();
  });
});

// ── 4. La autorización no se ha tocado ────────────────────────────────────────

describe("sigue exigiendo sesión de admin", () => {
  it("propaga el 401 de requireAdmin sin tocar la base de datos", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: "No autenticado" }, { status: 401 })
    );

    const { res } = await callCleanup();

    expect(res.status).toBe(401);
    expect(mockGetTursoClientSync).not.toHaveBeenCalled();
    expect(mockNotifyArtistOwner).not.toHaveBeenCalled();
  });
});

// ── 5. Lo que invoca el workflow ──────────────────────────────────────────────

describe("el workflow de GitHub Actions llama a esta ruta", () => {
  const yaml = fs.readFileSync(
    path.join(process.cwd(), ".github", "workflows", "cleanup-shows.yml"),
    "utf8"
  );

  it("tiene cron diario", () => {
    expect(yaml).toMatch(/on:\s*\n\s*schedule:/);
    expect(yaml).toMatch(/cron:\s*"\d+ \d+ \* \* \*"/);
  });

  it("invoca DELETE /api/shows/cleanup con la sesión de admin", () => {
    // El workflow no inventa un secreto de cron: hace el login que ya existe y
    // reutiliza su cookie. Por eso se busca el login, no un token suelto.
    expect(yaml).toMatch(/POST "\$base\/api\/auth\/login"/);
    expect(yaml).toMatch(/DELETE "\$base\/api\/shows\/cleanup"/);
    expect(yaml).toMatch(/-c "\$jar"/);
    expect(yaml).toMatch(/-b "\$jar"/);
  });

  it("falla si la ruta no devuelve 200", () => {
    expect(yaml).toMatch(/if \[ "\$cleanup_code" != "200" \]/);
  });

  it("y documenta en CONFIG_TODO qué secretos hay que crear", () => {
    const todo = fs.readFileSync(path.join(process.cwd(), "docs", "CONFIG_TODO.md"), "utf8");
    expect(todo).toMatch(/cleanup-shows/);
    expect(todo).toMatch(/TEST_ADMIN_PASSWORD/);
  });
});