import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTrack, getTrackById } from "@/lib/db";
import path from "path";

/**
 * `createTrack` declaraba `status` en su firma y NO lo escribia en ningun
 * INSERT. La columna se quedaba con el default del esquema ('draft') y, como
 * todo lo publico filtra `status = 'approved'`, la pista era invisible: no
 * aparecia en la pagina del artista, ni en el catalogo, ni en el PDF. Se
 *发现了 al sembrar el catalogo multi-track: 74 filas en Turso que la web no
 * mostraba, sin ningun error en ningun sitio.
 *
 * El default sigue siendo 'draft' a proposito: las rutas que crean releases de
 * un suscriptor deben seguir creando pendientes.
 */
const PREFIX = "trk-status-";

function localDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  return new Database(path.join(process.cwd(), "data", "music_catalog.db"));
}

function rowStatus(id: string): unknown {
  const db = localDb();
  const row = db.prepare("SELECT status FROM tracks WHERE id = ?").get(id) as
    | { status: unknown }
    | undefined;
  db.close();
  return row?.status;
}

function deleteIds(ids: string[]) {
  const db = localDb();
  for (const id of ids) db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
  db.close();
}

const IDS = [`${PREFIX}default`, `${PREFIX}approved`, `${PREFIX}pending`];

beforeAll(() => {
  localDb()
    .prepare("CREATE TABLE IF NOT EXISTS tracks (id TEXT PRIMARY KEY, status TEXT DEFAULT 'draft')")
    .run();
});

afterAll(() => deleteIds(IDS));

describe("createTrack y status", () => {
  it("sin status explicito deja la pista en draft, no publicada", async () => {
    await createTrack({ id: `${PREFIX}default`, title: "Sin status", artist_name: "QA Status" });
    const saved = await getTrackById(`${PREFIX}default`);
    expect(saved?.status).toBe("draft");
    expect(rowStatus(`${PREFIX}default`)).toBe("draft");
  });

  it("con status approved la pista queda publicada", async () => {
    await createTrack({
      id: `${PREFIX}approved`,
      title: "Aprobada",
      artist_name: "QA Status",
      status: "approved",
    });
    const saved = await getTrackById(`${PREFIX}approved`);
    expect(saved?.status).toBe("approved");
    expect(rowStatus(`${PREFIX}approved`)).toBe("approved");
  });

  it("respeta un status distinto de approved", async () => {
    await createTrack({
      id: `${PREFIX}pending`,
      title: "Pendiente",
      artist_name: "QA Status",
      status: "pending",
    });
    expect((await getTrackById(`${PREFIX}pending`))?.status).toBe("pending");
  });
});
