import { describe, it, expect } from "vitest";
import { StemsUrlsSchema } from "@/lib/validations";

describe("Stems & Multi-Track Audio Models", () => {
  it("validates valid stems structure with 4 channels", () => {
    const validStems = {
      vocals: "https://example.com/vocals.mp3",
      guitars: "https://example.com/guitars.mp3",
      bass: "https://example.com/bass.mp3",
      drums: "https://example.com/drums.mp3",
    };
    const parsed = StemsUrlsSchema.safeParse(validStems);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data?.vocals).toBe("https://example.com/vocals.mp3");
      expect(parsed.data?.drums).toBe("https://example.com/drums.mp3");
    }
  });

  it("handles null and undefined stems gracefully (null-safe)", () => {
    expect(StemsUrlsSchema.safeParse(null).success).toBe(true);
    expect(StemsUrlsSchema.safeParse(undefined).success).toBe(true);
  });

  it("allows partial channels (e.g. only vocals and guitars)", () => {
    const partialStems = {
      vocals: "https://example.com/vocals.mp3",
      guitars: "https://example.com/guitars.mp3",
    };
    const parsed = StemsUrlsSchema.safeParse(partialStems);
    expect(parsed.success).toBe(true);
  });
});
