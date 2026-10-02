import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAllTracks, getTrackById, DOSSIER_DEFAULTS } from "@/lib/db";
import { parseMetrics } from "@/lib/db";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

function seedTestData() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, artist_name TEXT,
      release_type TEXT, release_date TEXT, duration TEXT, cover_image TEXT,
      audio_preview_url TEXT, spotify_url TEXT, youtube_video_id TEXT,
      metrics TEXT, production_details TEXT, lyrics TEXT, itunes_track_id TEXT,
      stems_urls TEXT, video_embed_url TEXT, gallery_images TEXT, external_links TEXT,
      disc_number INTEGER DEFAULT 1, is_double_single INTEGER DEFAULT 0, sides_b TEXT,
      isrc TEXT, composers TEXT, genre TEXT, description TEXT,
      streams INTEGER DEFAULT 0, status TEXT DEFAULT 'draft', updated_at TEXT,
      release_id TEXT, start_time REAL DEFAULT 0, end_time REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO tracks (id, title, artist_name, release_type, release_date, status, metrics, production_details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  insert.run("trk-001", "Bohemian Rhapsody", "Queen", "single", "1975-10-31", "approved",
    JSON.stringify({ streams: 2000000, saves: 150000, playlist_additions: 45, top_countries: [{ country: "US", pct: 35 }, { country: "GB", pct: 25 }] }),
    JSON.stringify({ daw: "Pro Tools", guitars: "Red Special replica", bass: "Fender Precision", drums: "Ludwig", producers: ["Roy Thomas Baker"] })
  );
  insert.run("trk-002", "Smells Like Teen Spirit", "Nirvana", "single", "1991-09-10", "approved",
    JSON.stringify({ streams: 1800000, saves: 120000, playlist_additions: 40, top_countries: [{ country: "US", pct: 30 }, { country: "GB", pct: 20 }] }),
    JSON.stringify({ daw: "Pro Tools", guitars: "Fender Mustang", bass: "Fender Precision", drums: "Pearl", producers: ["Butch Vig"] })
  );
  insert.run("trk-003", "Blinding Lights", "The Weeknd", "single", "2019-11-29", "approved",
    JSON.stringify({ streams: 3500000, saves: 200000, playlist_additions: 55, top_countries: [{ country: "US", pct: 40 }, { country: "CA", pct: 15 }] }),
    JSON.stringify({ daw: "Ableton Live", guitars: "None", bass: "None", drums: "Electronic", producers: ["Max Martin", "Oscar Holter"] })
  );

  db.close();
}

describe("Database", () => {
  beforeAll(() => { seedTestData(); });
  afterAll(() => {
    // Clean test data but don't delete the DB (other tests may need it)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH);
    db.exec("DELETE FROM tracks WHERE id LIKE 'trk-%'");
    db.close();
  });

  it("getAllTracks returns tracks", async () => {
    const tracks = await getAllTracks();
    expect(tracks.length).toBeGreaterThan(0);
  });

  it("getTrackById returns specific track", async () => {
    const track = await getTrackById("trk-001");
    expect(track).not.toBeNull();
    expect(track?.title).toBe("Bohemian Rhapsody");
    expect(track?.artist_name).toBe("Queen");
  });

  it("getTrackById returns null for unknown id", async () => {
    const track = await getTrackById("unknown-id");
    expect(track).toBeNull();
  });

  it("tracks have parsed metrics", async () => {
    const tracks = await getAllTracks();
    const first = tracks[0];
    // RC.33 · Ola 3: `metrics` es `Metrics | null`, así que la forma correcta de
    // comprobarlo es que sea `null` o un objeto completo — NO que tenga las
    // propiedades, que era justamente lo que el fallback de ceros garantizaba
    // siempre y por eso no probaba nada. La diferencia importa: la columna puede
    // traer `NULL` y eso ya no se convierte en `{streams: 0, ...}`.
    expect(
      first.metrics === null ||
        (typeof first.metrics.streams === "number" &&
          typeof first.metrics.saves === "number" &&
          typeof first.metrics.playlist_additions === "number" &&
          Array.isArray(first.metrics.top_countries))
    ).toBe(true);
  });

  it("tracks have parsed production_details", async () => {
    const tracks = await getAllTracks();
    const first = tracks[0];
    expect(first.production_details).toHaveProperty("daw");
    expect(first.production_details).toHaveProperty("guitars");
  });
});

describe("parseMetrics", () => {
  it("parses valid JSON string", () => {
    const jsonString = '{"streams": 1000, "saves": 50, "playlist_additions": 10, "top_countries": [{"country": "US", "pct": 40}]}';
    const result = parseMetrics(jsonString);
    expect(result?.streams).toBe(1000);
    expect(result?.saves).toBe(50);
    expect(result?.playlist_additions).toBe(10);
    expect(result?.top_countries).toEqual([{ country: "US", pct: 40 }]);
  });

  it("parses pre-parsed object (simulating Turso behavior)", () => {
    const obj = { streams: 2500, saves: 120, playlist_additions: 25, top_countries: [{ country: "MX", pct: 30 }, { country: "AR", pct: 25 }] };
    const result = parseMetrics(obj);
    expect(result?.streams).toBe(2500);
    expect(result?.saves).toBe(120);
    expect(result?.playlist_additions).toBe(25);
    expect(result?.top_countries).toEqual([{ country: "MX", pct: 30 }, { country: "AR", pct: 25 }]);
  });

  // RC.33 · Ola 3 — estas cuatro aserciones cambiaron de `{streams: 0, ...}` a
  // `null`. Antes describían el bug: "no hay dato" se colapsaba a cero, y el
  // pie de la tarjeta pintaba ese cero como si fuera una medición. `null` es la
  // ausencia; un objeto con ceros dentro sigue siendo un dato y se respeta.
  it("returns null for null input", () => {
    expect(parseMetrics(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseMetrics("")).toBeNull();
  });

  it("returns null for invalid JSON string", () => {
    expect(parseMetrics("invalid json {{{")).toBeNull();
  });

  it("handles partial metrics object with missing fields", () => {
    // Un objeto válido con un campo: es dato, y los campos ausentes valen 0.
    // No se reescribe a `null`, porque la columna sí traía métricas.
    const obj = { streams: 500 };
    const result = parseMetrics(obj);
    expect(result?.streams).toBe(500);
    expect(result?.saves).toBe(0);
    expect(result?.playlist_additions).toBe(0);
    expect(result?.top_countries).toEqual([]);
  });

  it("keeps an explicit curated zero as a real datum", () => {
    // La otra mitad del contrato: si alguien escribió `streams: 0`, ese 0 es un
    // dato. Reescribirlo a `null` sería borrar una métrica a propósito, y el
    // usuario pidió explícitamente que las inventadas no se borren.
    const result = parseMetrics({ streams: 0, saves: 0, playlist_additions: 0, top_countries: [] });
    expect(result).toEqual({ streams: 0, saves: 0, playlist_additions: 0, top_countries: [] });
  });

  it("returns null for a JSON array (not a metrics object)", () => {
    expect(parseMetrics("[1,2,3]")).toBeNull();
  });

  it("handles non-object parsed result", () => {
    expect(parseMetrics("not an object")).toBeNull();
  });
});

describe("Dossier defaults", () => {
  it("has all required rider defaults", () => {
    expect(DOSSIER_DEFAULTS.rider_pa_system).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_monitors).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_console).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_subwoofers).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_guitar).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_bass).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_drums).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_keyboards).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_lighting).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_stage_size).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_stage_conditions).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_hospitality).toBeTruthy();
    expect(DOSSIER_DEFAULTS.rider_transport).toBeTruthy();
  });

  it("defaults contain expected values", () => {
    expect(DOSSIER_DEFAULTS.rider_pa_system).toContain("15,000W");
    expect(DOSSIER_DEFAULTS.rider_console).toContain("32 canales");
    expect(DOSSIER_DEFAULTS.rider_stage_size).toContain("6m");
  });
});
