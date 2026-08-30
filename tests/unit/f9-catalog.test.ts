import { describe, it, expect } from "vitest";
import { TrackSchema } from "@/lib/validations";

describe("F9 Theme Toggle & Catalog Parser Tests", () => {
  // Tests de parsing del catálogo expandido
  it("parses a track with full F9 multimedia metadata", () => {
    const fullTrack = {
      id: "trk-f9-001",
      title: "Bohemian Rhapsody",
      release_type: "Single",
      release_date: "1975-10-31",
      duration: "05:55",
      cover_image: "https://example.com/cover.jpg",
      audio_preview_url: "https://example.com/audio.m4a",
      spotify_url: "https://open.spotify.com/track/example",
      youtube_video_id: "fJ9rUzIMcZQ",
      metrics: {
        streams: 2100000,
        saves: 195000,
        playlist_additions: 64000,
        top_countries: [{ country: "UK", pct: 28 }, { country: "US", pct: 35 }],
      },
      production_details: {
        daw: "EMI Studios",
        guitars: "Red Special",
        effects_chain: "AC30",
        tuning: "Standard E",
        key: "B♭ Major",
      },
      lyrics: "Is this the real life...",
      itunes_track_id: "158672215",
      stems_urls: {
        vocals: "/audio/stems/vocals.mp3",
        guitars: "/audio/stems/guitar.mp3",
        bass: "/audio/stems/bass.mp3",
        drums: "/audio/stems/drums.mp3",
      },
      video_embed_url: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
      gallery_images: ["https://example.com/gallery1.jpg"],
    };

    const result = TrackSchema.safeParse(fullTrack);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Bohemian Rhapsody");
      expect(result.data.itunes_track_id).toBe("158672215");
      expect(result.data.gallery_images).toHaveLength(1);
      expect(result.data.stems_urls?.vocals).toBeTruthy();
    }
  });

  it("parses an independent / underground track with null multimedia fields", () => {
    const indiTrack = {
      id: "trk-f9-007",
      title: "Periferia Digital",
      release_type: "EP",
      release_date: "2025-11-30",
      duration: "03:42",
      cover_image: "/images/covers/periferia-digital.jpg",
      audio_preview_url: "/audio/periferia-digital.mp3",
      spotify_url: null,
      youtube_video_id: null,
      metrics: {
        streams: 1850,
        saves: 140,
        playlist_additions: 18,
        top_countries: [{ country: "Venezuela", pct: 55 }],
      },
      production_details: { daw: "Reaper", guitars: null, effects_chain: null, tuning: "Standard E", key: "C minor" },
      lyrics: null,
      itunes_track_id: null,
      stems_urls: null,
      video_embed_url: null,
      gallery_images: null,
    };

    const result = TrackSchema.safeParse(indiTrack);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stems_urls).toBeNull();
      expect(result.data.gallery_images).toBeNull();
      expect(result.data.video_embed_url).toBeNull();
    }
  });

  it("rejects a track with missing required fields (title, id)", () => {
    const invalid = {
      release_type: "Single",
      duration: "03:00",
    };
    const result = TrackSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
