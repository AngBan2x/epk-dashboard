import { describe, it, expect } from "vitest";
import { getAllTracks, getTrackById } from "@/lib/db";
import { parseMetrics } from "@/lib/db";

describe("Database", () => {
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
    expect(first.metrics).toHaveProperty("streams");
    expect(first.metrics).toHaveProperty("saves");
    expect(first.metrics).toHaveProperty("top_countries");
    expect(Array.isArray(first.metrics.top_countries)).toBe(true);
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
    expect(result.streams).toBe(1000);
    expect(result.saves).toBe(50);
    expect(result.playlist_additions).toBe(10);
    expect(result.top_countries).toEqual([{ country: "US", pct: 40 }]);
  });

  it("parses pre-parsed object (simulating Turso behavior)", () => {
    const obj = { streams: 2500, saves: 120, playlist_additions: 25, top_countries: [{ country: "MX", pct: 30 }, { country: "AR", pct: 25 }] };
    const result = parseMetrics(obj);
    expect(result.streams).toBe(2500);
    expect(result.saves).toBe(120);
    expect(result.playlist_additions).toBe(25);
    expect(result.top_countries).toEqual([{ country: "MX", pct: 30 }, { country: "AR", pct: 25 }]);
  });

  it("returns fallback for null input", () => {
    const result = parseMetrics(null);
    expect(result).toEqual({ streams: 0, saves: 0, playlist_additions: 0, top_countries: [] });
  });

  it("returns fallback for empty string", () => {
    const result = parseMetrics("");
    expect(result).toEqual({ streams: 0, saves: 0, playlist_additions: 0, top_countries: [] });
  });

  it("returns fallback for invalid JSON string", () => {
    const result = parseMetrics("invalid json {{{");
    expect(result).toEqual({ streams: 0, saves: 0, playlist_additions: 0, top_countries: [] });
  });

  it("handles partial metrics object with missing fields", () => {
    const obj = { streams: 500 }; // missing saves, playlist_additions, top_countries
    const result = parseMetrics(obj);
    expect(result.streams).toBe(500);
    expect(result.saves).toBe(0);
    expect(result.playlist_additions).toBe(0);
    expect(result.top_countries).toEqual([]);
  });

  it("handles non-object parsed result", () => {
    const result = parseMetrics("not an object");
    expect(result).toEqual({ streams: 0, saves: 0, playlist_additions: 0, top_countries: [] });
  });
});
