import { describe, it, expect } from "vitest";
import { getAllTracks, getTrackById } from "@/lib/db";

describe("Database", () => {
  it("getAllTracks returns tracks", () => {
    const tracks = getAllTracks();
    expect(tracks.length).toBeGreaterThan(0);
  });

  it("getTrackById returns specific track", () => {
    const track = getTrackById("trk-001");
    expect(track).not.toBeNull();
    expect(track?.title).toBe("Ecos en el Garaje");
  });

  it("getTrackById returns null for unknown id", () => {
    const track = getTrackById("unknown-id");
    expect(track).toBeNull();
  });

  it("tracks have parsed metrics", () => {
    const tracks = getAllTracks();
    const first = tracks[0];
    expect(first.metrics).toHaveProperty("streams");
    expect(first.metrics).toHaveProperty("saves");
    expect(first.metrics).toHaveProperty("top_countries");
    expect(Array.isArray(first.metrics.top_countries)).toBe(true);
  });

  it("tracks have parsed production_details", () => {
    const tracks = getAllTracks();
    const first = tracks[0];
    expect(first.production_details).toHaveProperty("daw");
    expect(first.production_details).toHaveProperty("guitars");
  });
});
