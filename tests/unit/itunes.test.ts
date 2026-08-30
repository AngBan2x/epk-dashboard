import { describe, it, expect } from "vitest";
import { getHighResArtwork, searchITunes } from "@/lib/itunes";

describe("iTunes API Service & Utilities", () => {
  describe("getHighResArtwork", () => {
    it("transforms 100x100 artwork to 600x600 HD artwork", () => {
      const input = "https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg";
      const expected = "https://is1-ssl.mzstatic.com/image/thumb/Music/600x600bb.jpg";
      expect(getHighResArtwork(input, 600)).toBe(expected);
    });

    it("supports custom dimensions (e.g. 1200x1200)", () => {
      const input = "https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.png";
      const expected = "https://is1-ssl.mzstatic.com/image/thumb/Music/1200x1200bb.png";
      expect(getHighResArtwork(input, 1200)).toBe(expected);
    });

    it("returns null for null, undefined or empty values safely", () => {
      expect(getHighResArtwork(null)).toBeNull();
      expect(getHighResArtwork(undefined)).toBeNull();
      expect(getHighResArtwork("")).toBeNull();
    });
  });

  describe("searchITunes input resilience", () => {
    it("returns empty array when term is empty or whitespace", async () => {
      const res1 = await searchITunes("");
      const res2 = await searchITunes("   ");
      expect(res1).toEqual([]);
      expect(res2).toEqual([]);
    });
  });
});
