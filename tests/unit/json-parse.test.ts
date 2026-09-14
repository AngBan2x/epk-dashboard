import { describe, it, expect } from "vitest";

describe("JSON parsing utilities", () => {
  describe("parseExternalLinks", () => {
    function parseExternalLinks(input: unknown): Record<string, string> {
      if (!input) return {};
      if (typeof input === "object" && !Array.isArray(input)) return input as Record<string, string>;
      if (typeof input === "string") {
        try {
          const parsed = JSON.parse(input);
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
          return {};
        } catch {
          return {};
        }
      }
      return {};
    }

    it("parses valid JSON string", () => {
      const input = '{"youtube":"https://youtube.com/watch?v=abc","spotify":"https://open.spotify.com/track/xyz"}';
      const result = parseExternalLinks(input);
      expect(result.youtube).toBe("https://youtube.com/watch?v=abc");
      expect(result.spotify).toBe("https://open.spotify.com/track/xyz");
    });

    it("handles pre-parsed object (local SQLite behavior)", () => {
      const input = { youtube: "https://youtube.com/watch?v=abc", spotify: "" };
      const result = parseExternalLinks(input);
      expect(result.youtube).toBe("https://youtube.com/watch?v=abc");
    });

    it("handles null input", () => {
      const result = parseExternalLinks(null);
      expect(result).toEqual({});
    });

    it("handles undefined input", () => {
      const result = parseExternalLinks(undefined);
      expect(result).toEqual({});
    });

    it("handles empty string", () => {
      const result = parseExternalLinks("");
      expect(result).toEqual({});
    });

    it("handles invalid JSON string", () => {
      const result = parseExternalLinks("not json {{{");
      expect(result).toEqual({});
    });

    it("handles nested JSON string", () => {
      const input = '{"youtube":"url","nested":{"key":"value"}}';
      const result = parseExternalLinks(input);
      expect(result.youtube).toBe("url");
    });

    it("handles empty JSON object string", () => {
      const result = parseExternalLinks("{}");
      expect(result).toEqual({});
    });

    it("handles JSON array (returns empty)", () => {
      const result = parseExternalLinks("[1,2,3]");
      expect(result).toEqual({});
    });
  });

  describe("parseProductionDetails", () => {
    interface ProductionDetails {
      daw: string | null;
      guitars: string | null;
      effects_chain: string | null;
      tuning: string | null;
      key: string | null;
    }

    function parseProductionDetails(input: unknown): ProductionDetails {
      const empty = { daw: null, guitars: null, effects_chain: null, tuning: null, key: null };
      if (!input) return empty;
      if (typeof input === "object" && !Array.isArray(input)) {
        const obj = input as Record<string, unknown>;
        return {
          daw: (obj.daw as string) || null,
          guitars: (obj.guitars as string) || null,
          effects_chain: (obj.effects_chain as string) || null,
          tuning: (obj.tuning as string) || null,
          key: (obj.key as string) || null,
        };
      }
      if (typeof input === "string") {
        try {
          const parsed = JSON.parse(input);
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            return {
              daw: (parsed.daw as string) || null,
              guitars: (parsed.guitars as string) || null,
              effects_chain: (parsed.effects_chain as string) || null,
              tuning: (parsed.tuning as string) || null,
              key: (parsed.key as string) || null,
            };
          }
        } catch {}
      }
      return empty;
    }

    it("parses JSON string", () => {
      const input = '{"daw":"Pro Tools","guitars":"Fender","effects_chain":"Reverb","tuning":"Standard E","key":"C major"}';
      const result = parseProductionDetails(input);
      expect(result.daw).toBe("Pro Tools");
      expect(result.guitars).toBe("Fender");
      expect(result.key).toBe("C major");
    });

    it("handles pre-parsed object", () => {
      const input = { daw: "Ableton", guitars: "Gibson" };
      const result = parseProductionDetails(input);
      expect(result.daw).toBe("Ableton");
      expect(result.guitars).toBe("Gibson");
    });

    it("returns defaults for null", () => {
      const result = parseProductionDetails(null);
      expect(result.daw).toBeNull();
      expect(result.guitars).toBeNull();
    });

    it("returns defaults for invalid JSON", () => {
      const result = parseProductionDetails("invalid json");
      expect(result.daw).toBeNull();
    });

    it("handles partial data", () => {
      const result = parseProductionDetails('{"daw":"Logic Pro"}');
      expect(result.daw).toBe("Logic Pro");
      expect(result.guitars).toBeNull();
      expect(result.tuning).toBeNull();
    });
  });
});
