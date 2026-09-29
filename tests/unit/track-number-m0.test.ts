import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createTrack,
  updateTrack,
  getTrackById,
  getTracksByReleaseId,
  isTursoConfigured,
} from "@/lib/db";
import { TrackNumberSchema, validateTrackNumber } from "@/lib/validations";
import path from "path";

const RELEASE_ID = "rel-m0-001";
const PREFIX = "trk-m0-";

function localDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  return new Database(path.join(process.cwd(), "data", "music_catalog.db"));
}

function seedRelease() {
  const db = localDb();
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
      metrics TEXT,
      production_details TEXT,
      lyrics TEXT,
      itunes_track_id TEXT,
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
  try { db.exec(`ALTER TABLE tracks ADD COLUMN track_number INTEGER`); } catch {}
  db.exec(`DELETE FROM tracks WHERE id LIKE '${PREFIX}%'`);
  db.close();
}

function cleanup() {
  const db = localDb();
  db.exec(`DELETE FROM tracks WHERE id LIKE '${PREFIX}%'`);
  db.close();
}

describe("M0 — tracks.track_number", () => {
  beforeAll(() => {
    if (isTursoConfigured()) return;
    seedRelease();
  });

  afterAll(() => {
    if (isTursoConfigured()) return;
    cleanup();
  });

  it("createTrack round-trips track_number through the local INSERT", async () => {
    if (isTursoConfigured()) return;
    const id = `${PREFIX}numbered`;
    await createTrack({
      id,
      title: "Numbered",
      release_id: RELEASE_ID,
      disc_number: 1,
      track_number: 4,
      start_time: 0,
      end_time: 100,
    });

    const db = localDb();
    const raw = db.prepare(`SELECT track_number FROM tracks WHERE id = ?`).get(id) as
      | { track_number: number | null }
      | undefined;
    db.close();

    expect(raw).toBeDefined();
    expect(raw!.track_number).toBe(4);

    const parsed = await getTrackById(id);
    expect(parsed?.track_number).toBe(4);
  });

  it("createTrack accepts a null track_number without breaking", async () => {
    if (isTursoConfigured()) return;
    const id = `${PREFIX}null`;
    await createTrack({
      id,
      title: "Unnumbered",
      release_id: RELEASE_ID,
      disc_number: 1,
      start_time: 0,
      end_time: 100,
    });

    const db = localDb();
    const raw = db.prepare(`SELECT track_number FROM tracks WHERE id = ?`).get(id) as
      | { track_number: number | null }
      | undefined;
    db.close();

    expect(raw).toBeDefined();
    expect(raw!.track_number).toBeNull();

    const parsed = await getTrackById(id);
    expect(parsed?.track_number).toBeUndefined();
  });

  it("createTrack honours an explicit track_number of 0 (falsy but valid)", async () => {
    if (isTursoConfigured()) return;
    const id = `${PREFIX}zero`;
    await createTrack({ id, title: "Zero", release_id: RELEASE_ID, track_number: 0 });
    const parsed = await getTrackById(id);
    expect(parsed?.track_number).toBe(0);
  });

  it("updateTrack round-trips and clears track_number", async () => {
    if (isTursoConfigured()) return;
    const id = `${PREFIX}updatable`;
    await createTrack({ id, title: "Updatable", release_id: RELEASE_ID, track_number: 1 });

    const updated = await updateTrack(id, { track_number: 7 });
    expect(updated?.track_number).toBe(7);

    const cleared = await updateTrack(id, { track_number: null });
    expect(cleared?.track_number).toBeUndefined();

    const db = localDb();
    const raw = db.prepare(`SELECT track_number FROM tracks WHERE id = ?`).get(id) as
      | { track_number: number | null }
      | undefined;
    db.close();
    expect(raw!.track_number).toBeNull();
  });

  it("getTracksByReleaseId orders per disc and sends unnumbered tracks last", async () => {
    if (isTursoConfigured()) return;
    // Disc 1: numbered 1..3 plus one unnumbered.
    // Disc 2: numbered 1..2. start_time is deliberately INVERTED for the
    // unnumbered disc-1 track so a plain `ORDER BY start_time` would fail.
    const rel = `${RELEASE_ID}-order`;
    const rows: { id: string; disc: number; num: number | null; start: number }[] = [
      { id: `${PREFIX}d1n1`, disc: 1, num: 1, start: 200 },
      { id: `${PREFIX}d1u`, disc: 1, num: null, start: 999 },
      { id: `${PREFIX}d1n2`, disc: 1, num: 2, start: 10 },
      { id: `${PREFIX}d1n3`, disc: 1, num: 3, start: 20 },
      { id: `${PREFIX}d2n1`, disc: 2, num: 1, start: 0 },
      { id: `${PREFIX}d2n2`, disc: 2, num: 2, start: 5 },
    ];
    for (const r of rows) {
      await createTrack({
        id: r.id,
        title: r.id,
        release_id: rel,
        disc_number: r.disc,
        track_number: r.num,
        start_time: r.start,
        end_time: r.start + 5,
      });
    }

    const tracks = await getTracksByReleaseId(rel);
    const order = tracks.map((t) => t.id);

    expect(order).toEqual([
      `${PREFIX}d1n1`,
      `${PREFIX}d1n2`,
      `${PREFIX}d1n3`,
      `${PREFIX}d1u`, // unnumbered trails its own disc, not the head
      `${PREFIX}d2n1`,
      `${PREFIX}d2n2`,
    ]);
  });

  it("getTracksByReleaseId falls back to start_time within a disc when nothing is numbered", async () => {
    if (isTursoConfigured()) return;
    const rel = `${RELEASE_ID}-legacy`;
    await createTrack({ id: `${PREFIX}lg1`, title: "lg1", release_id: rel, start_time: 30 });
    await createTrack({ id: `${PREFIX}lg2`, title: "lg2", release_id: rel, start_time: 10 });

    const tracks = await getTracksByReleaseId(rel);
    expect(tracks.map((t) => t.id)).toEqual([`${PREFIX}lg2`, `${PREFIX}lg1`]);

    const db = localDb();
    db.exec(`DELETE FROM tracks WHERE release_id = '${rel}'`);
    db.close();
  });

  it("TrackNumberSchema bounds the value: integer, >= 0, finite", () => {
    expect(TrackNumberSchema.safeParse(3).success).toBe(true);
    expect(TrackNumberSchema.safeParse(0).success).toBe(true);
    expect(TrackNumberSchema.safeParse(null).success).toBe(true);

    expect(TrackNumberSchema.safeParse(-1).success).toBe(false);
    expect(TrackNumberSchema.safeParse(1.5).success).toBe(false);
    expect(TrackNumberSchema.safeParse(Number.NaN).success).toBe(false);
    expect(TrackNumberSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(TrackNumberSchema.safeParse("3").success).toBe(false);
    expect(TrackNumberSchema.safeParse({ evil: true }).success).toBe(false);
  });

  it("validateTrackNumber returns undefined for rejected input", () => {
    expect(validateTrackNumber(12)).toBe(12);
    expect(validateTrackNumber(null)).toBeNull();
    expect(validateTrackNumber(-3)).toBeUndefined();
    expect(validateTrackNumber(Number.NaN)).toBeUndefined();
    expect(validateTrackNumber("nope")).toBeUndefined();
  });
});
