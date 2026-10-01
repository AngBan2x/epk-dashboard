import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getArtistCatalog, isTursoConfigured } from "@/lib/db";
import path from "path";

/**
 * C2 — `getArtistCatalog` agrupa el catálogo público del artista por release.
 *
 * Modelo de datos: un álbum y un single suelto son INDISTINGUIBLES en el
 * esquema (ambos son filas de `tracks` con `release_id IS NULL`). La única
 * señal es el `EXISTS` sobre los hijos, y estos tests son los que lo blindan:
 * si alguien lo quita, (a), (c) y (f) revientan.
 */

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

const ARTISTS: { id: string; name: string }[] = [
  { id: "c2a", name: "C2 A Albumista" }, // álbum con N hijas
  { id: "c2b", name: "C2 B Solista" }, // single suelto
  { id: "c2c", name: "C2 C Sin Duplicados" }, // padre con hijas no se duplica
  { id: "c2d", name: "C2 D Pendientes" }, // status pending fuera
  { id: "c2e", name: "C2 E Orden" }, // orden por fecha DESC
  { id: "c2f", name: "C2 F Pistas" }, // orden de hijas por disco/nº
];

const TRACK_PREFIX = "c2-";

interface SeedTrack {
  id: string;
  title: string;
  artist: string;
  date?: string;
  releaseId?: string | null;
  status?: string;
  disc?: number;
  number?: number | null;
  start?: number;
}

function localDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  return new Database(DB_PATH);
}

function ensureSchema(db: import("better-sqlite3").Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      user_id TEXT,
      biography TEXT,
      press_text TEXT,
      press_highlights TEXT,
      genre TEXT,
      location TEXT,
      monthly_listeners INTEGER DEFAULT 0,
      social_links TEXT,
      profile_image TEXT,
      banner_image TEXT,
      slug TEXT,
      is_active INTEGER DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist_name TEXT,
      release_type TEXT,
      release_date TEXT,
      duration TEXT,
      cover_image TEXT,
      audio_preview_url TEXT,
      spotify_url TEXT,
      youtube_video_id TEXT,
      itunes_track_id TEXT,
      metrics TEXT,
      production_details TEXT,
      lyrics TEXT,
      stems_urls TEXT,
      video_embed_url TEXT,
      gallery_images TEXT,
      external_links TEXT,
      disc_number INTEGER DEFAULT 1,
      track_number INTEGER,
      is_double_single INTEGER DEFAULT 0,
      sides_b TEXT,
      isrc TEXT,
      composers TEXT,
      genre TEXT,
      description TEXT,
      streams INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      updated_at TEXT,
      release_id TEXT,
      start_time REAL DEFAULT 0,
      end_time REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

const TRACKS: SeedTrack[] = [
  // (a) álbum con 4 hijas
  { id: "c2-album-parent", title: "Álbum de prueba", artist: "C2 A Albumista", date: "2024-02-02" },
  { id: "c2-album-1", title: "Pista 1", artist: "C2 A Albumista", date: "2024-02-02", releaseId: "c2-album-parent", number: 1 },
  { id: "c2-album-2", title: "Pista 2", artist: "C2 A Albumista", date: "2024-02-02", releaseId: "c2-album-parent", number: 2 },
  { id: "c2-album-3", title: "Pista 3", artist: "C2 A Albumista", date: "2024-02-02", releaseId: "c2-album-parent", number: 3 },
  { id: "c2-album-4", title: "Pista 4", artist: "C2 A Albumista", date: "2024-02-02", releaseId: "c2-album-parent", number: 4 },

  // (b) single suelto, sin hijos
  { id: "c2-single", title: "Single suelto", artist: "C2 B Solista", date: "2023-03-03" },

  // (c) padre con hijas: no debe salir duplicado como single
  { id: "c2-dup-parent", title: "Padre con hijas", artist: "C2 C Sin Duplicados", date: "2023-04-04" },
  { id: "c2-dup-1", title: "Hija 1", artist: "C2 C Sin Duplicados", date: "2023-04-04", releaseId: "c2-dup-parent", number: 1 },
  { id: "c2-dup-2", title: "Hija 2", artist: "C2 C Sin Duplicados", date: "2023-04-04", releaseId: "c2-dup-parent", number: 2 },

  // (d) aprobado + pendiente, tanto padres como hijas
  { id: "c2-ok-parent", title: "Padre aprobado", artist: "C2 D Pendientes", date: "2023-05-05" },
  { id: "c2-ok-child", title: "Hija aprobada", artist: "C2 D Pendientes", date: "2023-05-05", releaseId: "c2-ok-parent", number: 1 },
  { id: "c2-pending-child", title: "Hija pendiente", artist: "C2 D Pendientes", date: "2023-05-05", releaseId: "c2-ok-parent", number: 2, status: "pending" },
  { id: "c2-pending-parent", title: "Padre pendiente", artist: "C2 D Pendientes", date: "2023-06-06", status: "pending" },
  // hija aprobada de un padre pendiente: se oculta junto con su release
  { id: "c2-orphan-child", title: "Hija de padre pendiente", artist: "C2 D Pendientes", date: "2023-06-06", releaseId: "c2-pending-parent", number: 1 },

  // (e) orden por release_date DESC
  { id: "c2-old", title: "Más viejo", artist: "C2 E Orden", date: "2020-01-01" },
  { id: "c2-mid", title: "Del medio", artist: "C2 E Orden", date: "2022-03-10" },
  { id: "c2-new", title: "Más nuevo", artist: "C2 E Orden", date: "2024-06-15" },
  { id: "c2-new-1", title: "Pista del nuevo", artist: "C2 E Orden", date: "2024-06-15", releaseId: "c2-new", number: 1 },
  { id: "c2-new-2", title: "Pista 2 del nuevo", artist: "C2 E Orden", date: "2024-06-15", releaseId: "c2-new", number: 2 },

  // (f) orden de las hijas: por disco y número, no por orden de inserción
  { id: "c2-disc-parent", title: "Padre multidisco", artist: "C2 F Pistas", date: "2024-07-07" },
  // insertadas a propósito del revés
  { id: "c2-disc-1-2", title: "Disco 1 · 2", artist: "C2 F Pistas", date: "2024-07-07", releaseId: "c2-disc-parent", disc: 1, number: 2, start: 90 },
  { id: "c2-disc-1-1", title: "Disco 1 · 1", artist: "C2 F Pistas", date: "2024-07-07", releaseId: "c2-disc-parent", disc: 1, number: 1, start: 99 },
  { id: "c2-disc-2-1", title: "Disco 2 · 1", artist: "C2 F Pistas", date: "2024-07-07", releaseId: "c2-disc-parent", disc: 2, number: 1, start: 0 },
];

function seed() {
  const db = localDb();
  ensureSchema(db);
  // Idempotente: los tests se pueden re-ejecutar sobre la misma DB local.
  db.exec(`DELETE FROM tracks WHERE id LIKE '${TRACK_PREFIX}%'`);
  db.exec(`DELETE FROM artists WHERE id LIKE 'c2%'`);

  const insertArtist = db.prepare(`INSERT OR REPLACE INTO artists (id, name) VALUES (?, ?)`);
  for (const artist of ARTISTS) insertArtist.run(artist.id, artist.name);

  const insertTrack = db.prepare(`
    INSERT OR REPLACE INTO tracks (
      id, title, artist_name, release_type, release_date, cover_image, metrics,
      disc_number, track_number, status, release_id, start_time, end_time
    ) VALUES (?, ?, ?, 'album', ?, 'https://example.com/cover.jpg', ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of TRACKS) {
    insertTrack.run(
      t.id,
      t.title,
      t.artist,
      t.date ?? "2024-01-01",
      JSON.stringify({ streams: 0, saves: 0, playlist_additions: 0, top_countries: [] }),
      t.disc ?? 1,
      t.number ?? null,
      t.status ?? "approved",
      t.releaseId ?? null,
      t.start ?? 0,
      (t.start ?? 0) + 60
    );
  }
  db.close();
}

function cleanup() {
  const db = localDb();
  db.exec(`DELETE FROM tracks WHERE id LIKE '${TRACK_PREFIX}%'`);
  db.exec(`DELETE FROM artists WHERE id LIKE 'c2%'`);
  db.close();
}

describe("C2 — getArtistCatalog", () => {
  beforeAll(() => {
    if (isTursoConfigured()) return;
    seed();
  });

  afterAll(() => {
    if (isTursoConfigured()) return;
    cleanup();
  });

  it("(a) un álbum con N hijas devuelve UN grupo con N pistas", async () => {
    if (isTursoConfigured()) return;
    const groups = await getArtistCatalog("c2a");

    expect(groups).toHaveLength(1);
    expect(groups[0].release.id).toBe("c2-album-parent");
    expect(groups[0].tracks.map((t) => t.id).sort()).toEqual([
      "c2-album-1",
      "c2-album-2",
      "c2-album-3",
      "c2-album-4",
    ]);
  });

  it("(b) un single suelto devuelve UN grupo sin pistas", async () => {
    if (isTursoConfigured()) return;
    const groups = await getArtistCatalog("c2b");

    expect(groups).toHaveLength(1);
    expect(groups[0].release.id).toBe("c2-single");
    expect(groups[0].tracks).toEqual([]);
  });

  it("(c) el padre con hijas NO aparece duplicado como single suelto", async () => {
    if (isTursoConfigured()) return;
    const groups = await getArtistCatalog("c2c");

    expect(groups).toHaveLength(1);
    expect(groups.filter((g) => g.release.id === "c2-dup-parent")).toHaveLength(1);
    // Las hijas no se cuelan como grupos propios (ni como singles).
    expect(groups.some((g) => g.release.id === "c2-dup-1" || g.release.id === "c2-dup-2")).toBe(
      false
    );
    expect(groups[0].tracks).toHaveLength(2);
  });

  it("(d) un track pending no aparece ni como padre ni como hija", async () => {
    if (isTursoConfigured()) return;
    const groups = await getArtistCatalog("c2d");
    const flatIds = groups.flatMap((g) => [g.release.id, ...g.tracks.map((t) => t.id)]);

    // El padre pendiente no aparece: `release_id IS NULL` solo entra por
    // `status = 'approved'`, y no hay segundo brazo que lo salve.
    expect(flatIds).not.toContain("c2-pending-parent");
    // Y el release entero queda fuera: su hija está aprobada, pero su padre no,
    // así que el EXISTS mirando hacia arriba la deja fuera con él.
    expect(flatIds).not.toContain("c2-orphan-child");

    // ── RC.32 Tarea 2: lo que cambió ────────────────────────────────────────
    // `c2-pending-child` SÍ aparece, y antes no. Su padre (`c2-ok-parent`) está
    // aprobado, y el criterio de visibilidad es "aprobada O hija de un padre
    // aprobado" — el mismo de `getApprovedTrackById`. Con el filtro anterior
    // (`t.status = 'approved'` a secas) un álbum creado por la app se publicaba
    // con el padre visible y cero pistas dentro, porque las hijas nacen en
    // `draft`. Esta aserción codificaba ese bug.
    //
    // Lo que SIGUE sin aparecer es una hija de un padre que no está aprobado, y
    // una fila suelta sin aprobar: eso es lo que evita que se publicó un draft.
    const approved = groups.find((g) => g.release.id === "c2-ok-parent");
    expect(approved).toBeDefined();
    expect(approved!.tracks.map((t) => t.id)).toEqual([
      "c2-ok-child",
      "c2-pending-child",
    ]);
  });

  it("(d-bis) una hija no aprobada de un padre que NO está aprobado tampoco sale", async () => {
    // El segundo brazo mira hacia ARRIBA (`p.status = 'approved'`), nunca hacia
    // abajo: un `pending` no puede arrastrar a su hija al catálogo.
    if (isTursoConfigured()) return;
    const groups = await getArtistCatalog("c2d");
    const flatIds = groups.flatMap((g) => [g.release.id, ...g.tracks.map((t) => t.id)]);
    // `c2-orphan-child` está aprobada y su padre no: fuera.
    expect(flatIds).not.toContain("c2-orphan-child");
    // Ninguna hija de `c2-pending-parent` aparece, aprobado o no.
    expect(
      groups.some((g) => g.tracks.some((t) => t.id === "c2-orphan-child"))
    ).toBe(false);
  });

  it("(e) los grupos salen ordenados por release_date descendente", async () => {
    if (isTursoConfigured()) return;
    const groups = await getArtistCatalog("c2e");

    expect(groups.map((g) => g.release.id)).toEqual(["c2-new", "c2-mid", "c2-old"]);
    // Las hijas agrupadas no alteran el orden de los grupos.
    expect(groups[0].tracks.map((t) => t.id)).toEqual(["c2-new-1", "c2-new-2"]);
  });

  it("(f) las hijas se ordenan por disco y número, no por orden de inserción", async () => {
    if (isTursoConfigured()) return;
    const groups = await getArtistCatalog("c2f");

    expect(groups).toHaveLength(1);
    expect(groups[0].tracks.map((t) => t.id)).toEqual([
      "c2-disc-1-1",
      "c2-disc-1-2",
      "c2-disc-2-1",
    ]);
  });
});
