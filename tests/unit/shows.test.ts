import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createShow,
  getShowById,
  getShowsByArtist,
  updateShow,
  deleteShow,
  getAllShows,
  createArtist,
} from "@/lib/db";
import { ShowStatus, CreateShowInput } from "@/types/music";

let testArtistId: string;
const createdShowIds: string[] = [];
const createdArtistIds: string[] = [];

beforeAll(async () => {
  // Create a test artist for show tests
  const artist = await createArtist({
    name: `Test Artist ${Date.now()}`,
    genre: "Test",
    location: "Test Location",
  });
  testArtistId = artist.id;
  createdArtistIds.push(artist.id);
});

afterAll(async () => {
  // Clean up created shows
  for (const showId of createdShowIds) {
    try {
      await deleteShow(showId);
    } catch {
      // Ignore cleanup errors
    }
  }
  // Clean up created artists
  for (const artistId of createdArtistIds) {
    try {
      const { deleteArtist } = await import("@/lib/db");
      await deleteArtist(artistId);
    } catch {
      // Ignore cleanup errors
    }
  }
});

beforeEach(() => {
  // Clear the created show IDs tracker for each test
  createdShowIds.length = 0;
});

function trackShowId(id: string) {
  createdShowIds.push(id);
}

function createTestShowInput(artistId: string, overrides: Partial<CreateShowInput> = {}): CreateShowInput {
  return {
    artist_id: artistId,
    venue_name: "Test Venue",
    city: "Test City",
    country: "Test Country",
    date: "2025-12-31",
    time: "20:00",
    price_range: "$20-$50",
    status: "proximamente" as ShowStatus,
    ticket_url: "https://example.com/tickets",
    payment_methods: [{ type: "ticket_platform", platform_url: "https://example.com" }],
    postponement_reason: undefined,
    flyer_url: "https://example.com/flyer.jpg",
    ticket_link: "https://example.com/ticket-link",
    description: "Test show description",
    guest_artists: [{ name: "Guest Artist", role: "Opening" }],
    notes: "Test notes",
    ...overrides,
  };
}

describe("Shows CRUD", () => {
  describe("createShow", () => {
    it("creates a show with required fields, returns Show object with id", async () => {
      const input = createTestShowInput(testArtistId, {
        city: undefined,
        country: undefined,
        date: undefined,
        time: undefined,
        price_range: undefined,
        ticket_url: undefined,
        payment_methods: undefined,
        postponement_reason: undefined,
        flyer_url: undefined,
        ticket_link: undefined,
        description: undefined,
        guest_artists: undefined,
        notes: undefined,
      });

      const show = await createShow(input);

      expect(show).toBeDefined();
      expect(show.id).toBeDefined();
      expect(show.id).toMatch(/^show-\d+-/);
      expect(show.artist_id).toBe(testArtistId);
      expect(show.venue_name).toBe("Test Venue");
      expect(show.status).toBe("proximamente");
      expect(show.city).toBeNull();
      expect(show.country).toBeNull();
      expect(show.date).toBeNull();
      expect(show.created_at).toBeDefined();
      expect(show.updated_at).toBeDefined();

      trackShowId(show.id);
    });

    it("creates show with all optional fields", async () => {
      const input = createTestShowInput(testArtistId);

      const show = await createShow(input);

      expect(show).toBeDefined();
      expect(show.id).toBeDefined();
      expect(show.artist_id).toBe(testArtistId);
      expect(show.venue_name).toBe("Test Venue");
      expect(show.city).toBe("Test City");
      expect(show.country).toBe("Test Country");
      expect(show.date).toBe("2025-12-31");
      expect(show.time).toBe("20:00");
      expect(show.price_range).toBe("$20-$50");
      expect(show.status).toBe("proximamente");
      expect(show.ticket_url).toBe("https://example.com/tickets");
      expect(show.payment_methods).toEqual([{ type: "ticket_platform", platform_url: "https://example.com" }]);
      expect(show.postponement_reason).toBeNull();
      expect(show.flyer_url).toBe("https://example.com/flyer.jpg");
      expect(show.ticket_link).toBe("https://example.com/ticket-link");
      expect(show.description).toBe("Test show description");
      expect(show.guest_artists).toEqual([{ name: "Guest Artist", role: "Opening" }]);
      expect(show.notes).toBe("Test notes");
      expect(show.created_at).toBeDefined();
      expect(show.updated_at).toBeDefined();

      trackShowId(show.id);
    });
  });

  describe("getShowById", () => {
    it("returns show by id", async () => {
      const input = createTestShowInput(testArtistId);
      const created = await createShow(input);
      trackShowId(created.id);

      const show = await getShowById(created.id);

      expect(show).not.toBeNull();
      expect(show?.id).toBe(created.id);
      expect(show?.venue_name).toBe("Test Venue");
      expect(show?.artist_id).toBe(testArtistId);
    });

    it("returns null for non-existent id", async () => {
      const show = await getShowById("non-existent-show-id");

      expect(show).toBeNull();
    });
  });

  describe("getShowsByArtist", () => {
    it("returns shows for specific artist", async () => {
      const input1 = createTestShowInput(testArtistId, { venue_name: "Venue 1" });
      const input2 = createTestShowInput(testArtistId, { venue_name: "Venue 2" });
      const show1 = await createShow(input1);
      const show2 = await createShow(input2);
      trackShowId(show1.id);
      trackShowId(show2.id);

      const shows = await getShowsByArtist(testArtistId);

      // Filter for our test shows (database may have existing data)
      const testShows = shows.filter((s) => s.venue_name === "Venue 1" || s.venue_name === "Venue 2");
      expect(testShows).toHaveLength(2);
      expect(testShows.map((s) => s.venue_name).sort()).toEqual(["Venue 1", "Venue 2"]);
      expect(testShows.every((s) => s.artist_id === testArtistId)).toBe(true);
    });

    it("returns empty array for artist with no shows", async () => {
      // Create another artist with no shows
      const artist = await createArtist({
        name: `Empty Artist ${Date.now()}`,
        genre: "Test",
        location: "Test Location",
      });
      createdArtistIds.push(artist.id);

      const shows = await getShowsByArtist(artist.id);

      expect(shows).toEqual([]);
    });
  });

  describe("updateShow", () => {
    it("updates venue_name", async () => {
      const input = createTestShowInput(testArtistId);
      const created = await createShow(input);
      trackShowId(created.id);

      const updated = await updateShow(created.id, { venue_name: "Updated Venue" });

      expect(updated).not.toBeNull();
      expect(updated?.venue_name).toBe("Updated Venue");
      expect(updated?.id).toBe(created.id);
      expect(updated?.updated_at).not.toBe(created.updated_at);
    });

    it("updates status", async () => {
      const input = createTestShowInput(testArtistId);
      const created = await createShow(input);
      trackShowId(created.id);

      const updated = await updateShow(created.id, { status: "confirmado" as ShowStatus });

      expect(updated).not.toBeNull();
      expect(updated?.status).toBe("confirmado");
      expect(updated?.updated_at).not.toBe(created.updated_at);
    });

    it("returns null for non-existent id", async () => {
      const updated = await updateShow("non-existent-id", { venue_name: "Won't Work" });

      expect(updated).toBeNull();
    });
  });

  describe("deleteShow", () => {
    it("deletes show", async () => {
      const input = createTestShowInput(testArtistId);
      const created = await createShow(input);
      // Don't track this one since we're deleting it

      const result = await deleteShow(created.id);

      expect(result).toBe(true);

      // Verify it's gone
      const show = await getShowById(created.id);
      expect(show).toBeNull();
    });

    it("returns false for non-existent id", async () => {
      const result = await deleteShow("non-existent-id");

      expect(result).toBe(false);
    });
  });

  describe("getAllShows", () => {
    it("returns all shows", async () => {
      const input1 = createTestShowInput(testArtistId, { venue_name: "All Shows Venue 1" });
      const input2 = createTestShowInput(testArtistId, { venue_name: "All Shows Venue 2" });
      const show1 = await createShow(input1);
      const show2 = await createShow(input2);
      trackShowId(show1.id);
      trackShowId(show2.id);

      const shows = await getAllShows();

      // Filter for our test shows (database may have existing data)
      const testShows = shows.filter(
        (s) => s.artist_id === testArtistId && (s.venue_name === "All Shows Venue 1" || s.venue_name === "All Shows Venue 2")
      );
      expect(testShows.length).toBeGreaterThanOrEqual(2);
      expect(testShows.map((s) => s.venue_name).sort()).toEqual(["All Shows Venue 1", "All Shows Venue 2"]);
    });
  });
});