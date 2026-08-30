import { describe, it, expect } from "vitest";
import { TrackSchema } from "@/lib/validations";

describe("Video Pipeline & Validation", () => {
  const baseTrack = {
    id: "trk-test-01",
    title: "Test Track Video",
    release_type: "Single",
    release_date: "2026-08-30",
    duration: "03:45",
    cover_image: "https://example.com/cover.jpg",
    audio_preview_url: "https://example.com/preview.mp3",
    spotify_url: null,
    youtube_video_id: "dQw4w9WgXcQ",
    metrics: {
      streams: 15000,
      saves: 850,
      playlist_additions: 120,
      top_countries: [{ country: "VE", pct: 45 }],
    },
    production_details: {
      daw: "Ableton Live",
      guitars: "Fender Stratocaster",
      effects_chain: "Chorus + Reverb",
      tuning: "E Standard",
      key: "A Minor",
    },
    lyrics: "Letra de prueba",
  };

  it("validates track with video_embed_url and gallery_images", () => {
    const fullTrack = {
      ...baseTrack,
      video_embed_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      gallery_images: ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
    };
    const parsed = TrackSchema.safeParse(fullTrack);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.video_embed_url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(parsed.data.gallery_images).toHaveLength(2);
    }
  });

  it("handles null video_embed_url and null gallery_images without crashing", () => {
    const trackWithNulls = {
      ...baseTrack,
      video_embed_url: null,
      gallery_images: null,
    };
    const parsed = TrackSchema.safeParse(trackWithNulls);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.video_embed_url).toBeNull();
      expect(parsed.data.gallery_images).toBeNull();
    }
  });
});
