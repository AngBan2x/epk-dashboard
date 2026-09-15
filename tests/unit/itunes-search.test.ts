import { describe, it, expect, vi, beforeEach } from "vitest";
import { getHighResArtwork, searchITunes } from "@/lib/itunes";

describe("iTunes Search Utilities", () => {
  describe("getHighResArtwork", () => {
    it("transforms 100x100 to 600x600", () => {
      const input = "https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg";
      const expected = "https://is1-ssl.mzstatic.com/image/thumb/Music/600x600bb.jpg";
      expect(getHighResArtwork(input, 600)).toBe(expected);
    });

    it("handles null/undefined input", () => {
      expect(getHighResArtwork(null)).toBeNull();
      expect(getHighResArtwork(undefined)).toBeNull();
      expect(getHighResArtwork("")).toBeNull();
    });

    it("handles non-matching URL format", () => {
      // URL without the /100x100bb. pattern should remain unchanged
      const input = "https://example.com/image.png";
      expect(getHighResArtwork(input, 600)).toBe(input);

      // URL with different pattern
      const input2 = "https://is1-ssl.mzstatic.com/image/thumb/Music/200x200bb.jpg";
      expect(getHighResArtwork(input2, 600)).toBe("https://is1-ssl.mzstatic.com/image/thumb/Music/600x600bb.jpg");

      // URL with no dimensions at all
      const input3 = "https://is1-ssl.mzstatic.com/image/thumb/Music/cover.jpg";
      expect(getHighResArtwork(input3, 600)).toBe(input3);
    });
  });

  describe("searchITunes", () => {
    it("returns empty array for empty term", async () => {
      const res1 = await searchITunes("");
      const res2 = await searchITunes("   ");
      expect(res1).toEqual([]);
      expect(res2).toEqual([]);
    });

    it("returns results for valid term (mock fetch)", async () => {
      const mockResults = [
        {
          trackId: 12345,
          artistName: "Test Artist",
          trackName: "Test Track",
          collectionName: "Test Album",
          previewUrl: "https://example.com/preview.mp3",
          artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg",
          artworkUrl600: "https://is1-ssl.mzstatic.com/image/thumb/Music/600x600bb.jpg",
          releaseDate: "2025-01-15",
          primaryGenreName: "Pop",
          trackTimeMillis: 180000,
        },
      ];

      const mockResponse = {
        resultCount: 1,
        results: mockResults,
      };

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      try {
        const results = await searchITunes("test query", 5, "song");

        expect(results).toHaveLength(1);
        expect(results[0].trackId).toBe(12345);
        expect(results[0].artistName).toBe("Test Artist");
        expect(results[0].trackName).toBe("Test Track");
        expect(results[0].collectionName).toBe("Test Album");
        expect(results[0].previewUrl).toBe("https://example.com/preview.mp3");
        expect(results[0].artworkUrl100).toBe("https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg");
        expect(results[0].artworkUrl600).toBe("https://is1-ssl.mzstatic.com/image/thumb/Music/600x600bb.jpg");
        expect(results[0].releaseDate).toBe("2025-01-15");
        expect(results[0].primaryGenreName).toBe("Pop");
        expect(results[0].trackTimeMillis).toBe(180000);

        // Verify fetch was called with correct URL
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const callArgs = (global.fetch as vi.Mock).mock.calls[0];
        const url = callArgs[0] as string;
        expect(url).toContain("itunes.apple.com/search");
        expect(url).toContain("term=test+query"); // URLSearchParams uses + for spaces
        expect(url).toContain("entity=song");
        expect(url).toContain("limit=5");
        expect(url).toContain("media=music");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});