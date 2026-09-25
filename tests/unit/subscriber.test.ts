import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createUser, getUserByEmail, getUserById, deleteUser } from "@/lib/db";
import {
  createSubscription,
  getSubscriptionById,
  getSubscriptionByUserAndArtist,
  getSubscriptionsBySubscriber,
  getSubscriptionsByArtist,
  updateSubscription,
  deleteSubscription,
  getSubscriberCount,
  createArtist,
  getArtistById,
} from "@/lib/db";
import { randomUUID } from "crypto";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

function cleanTestData() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const db = new Database(DB_PATH);

  // Clean in order of dependencies (children first, then parents)
  // Disable foreign keys temporarily to avoid constraint issues during cleanup
  db.pragma("foreign_keys = OFF");

  db.exec("DELETE FROM subscriptions WHERE id LIKE 'test-%'");
  db.exec("DELETE FROM shows WHERE artist_id IN (SELECT id FROM artists WHERE id LIKE 'test-%')");
  db.exec("DELETE FROM artists WHERE id LIKE 'test-%'");
  db.exec("DELETE FROM track_submissions WHERE user_id LIKE 'test-%'");
  db.exec("DELETE FROM likes WHERE user_id LIKE 'test-%'");
  db.exec("DELETE FROM notifications WHERE user_id LIKE 'test-%'");
  db.exec("DELETE FROM users WHERE id LIKE 'test-%'");

  db.pragma("foreign_keys = ON");
  db.close();
}

describe("Subscriber Role & Subscriptions", () => {
  beforeAll(() => {
    cleanTestData();
  });

  afterAll(() => {
    cleanTestData();
  });

  let testSubscriberId: string;
  let testArtistId: string;
  let testArtistUserId: string;

  beforeEach(() => {
    cleanTestData();
  });

  describe("createUser with role 'subscriber'", () => {
    it("persists a user with role 'subscriber' and getUserByEmail returns it with that role", async () => {
      const email = `test-subscriber-${Date.now()}@example.com`;
      const userId = `test-${randomUUID()}`;

      const user = await createUser({
        id: userId,
        name: "Test Subscriber",
        email,
        password_hash: "hashed_password_123",
        role: "subscriber",
        preferences: {
          email_notifications: true,
          push_notifications: true,
          new_release_alerts: true,
          show_alerts: true,
          marketing_emails: false,
        },
        avatar: null,
        email_verified: false,
        deleted_at: null,
        last_login: null,
      });

      expect(user.id).toBe(userId);
      expect(user.name).toBe("Test Subscriber");
      expect(user.email).toBe(email);
      expect(user.role).toBe("subscriber");
      expect(user.preferences).toEqual({
        email_notifications: true,
        push_notifications: true,
        new_release_alerts: true,
        show_alerts: true,
        marketing_emails: false,
      });

      // Verify getUserByEmail returns the same user with correct role
      const retrieved = await getUserByEmail(email);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(userId);
      expect(retrieved!.email).toBe(email);
      expect(retrieved!.role).toBe("subscriber");
      expect(retrieved!.name).toBe("Test Subscriber");
    });

    it("getUserById returns subscriber with correct role", async () => {
      const email = `test-subscriber-id-${Date.now()}@example.com`;
      const userId = `test-${randomUUID()}`;

      await createUser({
        id: userId,
        name: "Test Subscriber 2",
        email,
        password_hash: "hashed_password_123",
        role: "subscriber",
        preferences: {
          email_notifications: true,
          push_notifications: true,
          new_release_alerts: true,
          show_alerts: true,
          marketing_emails: false,
        },
        avatar: null,
        email_verified: false,
        deleted_at: null,
        last_login: null,
      });

      const retrieved = await getUserById(userId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(userId);
      expect(retrieved!.role).toBe("subscriber");
    });

    it("subscriber role is distinct from artist and admin roles", async () => {
      const email = `test-subscriber-distinct-${Date.now()}@example.com`;
      const userId = `test-${randomUUID()}`;

      const user = await createUser({
        id: userId,
        name: "Test Subscriber 3",
        email,
        password_hash: "hashed_password_123",
        role: "subscriber",
        preferences: {
          email_notifications: true,
          push_notifications: true,
          new_release_alerts: true,
          show_alerts: true,
          marketing_emails: false,
        },
        avatar: null,
        email_verified: false,
        deleted_at: null,
        last_login: null,
      });

      expect(user.role).toBe("subscriber");
      expect(user.role).not.toBe("artist");
      expect(user.role).not.toBe("admin");
    });
  });

  describe("Subscriptions CRUD for subscriber_id", () => {
    beforeEach(async () => {
      const uniqueSuffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
      
      // Create a test subscriber
      testSubscriberId = `test-${randomUUID()}`;
      await createUser({
        id: testSubscriberId,
        name: "Test Subscriber For Subs",
        email: `subscriber-for-subs-${uniqueSuffix}@example.com`,
        password_hash: "hashed_password_123",
        role: "subscriber",
        preferences: {
          email_notifications: true,
          push_notifications: true,
          new_release_alerts: true,
          show_alerts: true,
          marketing_emails: false,
        },
        avatar: null,
        email_verified: false,
        deleted_at: null,
        last_login: null,
      });

      // Create a test artist with a user
      testArtistUserId = `test-${randomUUID()}`;
      await createUser({
        id: testArtistUserId,
        name: "Test Artist User",
        email: `artist-for-subs-${uniqueSuffix}@example.com`,
        password_hash: "hashed_password_123",
        role: "artist",
        preferences: {
          email_notifications: true,
          push_notifications: true,
          new_release_alerts: true,
          show_alerts: true,
          marketing_emails: false,
        },
        avatar: null,
        email_verified: false,
        deleted_at: null,
        last_login: null,
      });

      const artist = await createArtist({
        name: `Test Artist For Subs ${uniqueSuffix}`,
        userId: testArtistUserId,
        biography: "Test biography",
        pressText: undefined,
        pressHighlights: [],
        genre: "Rock",
        location: "Madrid",
      });
      testArtistId = artist.id;
    });

    it("createSubscription persists subscription for subscriber_id", async () => {
      const subId = `test-${randomUUID()}`;

      const subscription = await createSubscription({
        id: subId,
        subscriber_id: testSubscriberId,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: true,
      });

      expect(subscription.id).toBe(subId);
      expect(subscription.subscriber_id).toBe(testSubscriberId);
      expect(subscription.artist_id).toBe(testArtistId);
      expect(subscription.notify_releases).toBe(true);
      expect(subscription.notify_shows).toBe(true);
      expect(subscription.created_at).toBeDefined();
    });

    it("getSubscriptionById returns subscription with correct subscriber_id", async () => {
      const subId = `test-${randomUUID()}`;

      await createSubscription({
        id: subId,
        subscriber_id: testSubscriberId,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: false,
      });

      const retrieved = await getSubscriptionById(subId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(subId);
      expect(retrieved!.subscriber_id).toBe(testSubscriberId);
      expect(retrieved!.artist_id).toBe(testArtistId);
      expect(retrieved!.notify_releases).toBe(true);
      expect(retrieved!.notify_shows).toBe(false);
    });

    it("getSubscriptionByUserAndArtist finds subscription by subscriber and artist", async () => {
      const subId = `test-${randomUUID()}`;

      await createSubscription({
        id: subId,
        subscriber_id: testSubscriberId,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: true,
      });

      const retrieved = await getSubscriptionByUserAndArtist(testSubscriberId, testArtistId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(subId);
      expect(retrieved!.subscriber_id).toBe(testSubscriberId);
      expect(retrieved!.artist_id).toBe(testArtistId);
    });

    it("getSubscriptionsBySubscriber returns all subscriptions for a subscriber", async () => {
      // Create multiple subscriptions for the same subscriber
      const subId1 = `test-${randomUUID()}`;
      const subId2 = `test-${randomUUID()}`;
      const uniqueSuffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

      await createSubscription({
        id: subId1,
        subscriber_id: testSubscriberId,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: true,
      });

      // Create another artist
      const artist2 = await createArtist({
        name: `Test Artist 2 For Subs ${uniqueSuffix}`,
        userId: testArtistUserId,
        biography: "Test biography 2",
        pressText: undefined,
        pressHighlights: [],
        genre: "Pop",
        location: "Barcelona",
      });

      await createSubscription({
        id: subId2,
        subscriber_id: testSubscriberId,
        artist_id: artist2.id,
        notify_releases: false,
        notify_shows: true,
      });

      const subscriptions = await getSubscriptionsBySubscriber(testSubscriberId);
      expect(subscriptions.length).toBe(2);
      expect(subscriptions.map(s => s.id).sort()).toEqual([subId1, subId2].sort());
      expect(subscriptions.every(s => s.subscriber_id === testSubscriberId)).toBe(true);
    });

    it("getSubscriptionsByArtist returns all subscriptions for an artist", async () => {
      const subId1 = `test-${randomUUID()}`;
      const subId2 = `test-${randomUUID()}`;
      const uniqueSuffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

      // Create another subscriber
      const subscriber2Id = `test-${randomUUID()}`;
      await createUser({
        id: subscriber2Id,
        name: "Test Subscriber 2",
        email: `subscriber2-${uniqueSuffix}@example.com`,
        password_hash: "hashed_password_123",
        role: "subscriber",
        preferences: {
          email_notifications: true,
          push_notifications: true,
          new_release_alerts: true,
          show_alerts: true,
          marketing_emails: false,
        },
        avatar: null,
        email_verified: false,
        deleted_at: null,
        last_login: null,
      });

      await createSubscription({
        id: subId1,
        subscriber_id: testSubscriberId,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: true,
      });

      await createSubscription({
        id: subId2,
        subscriber_id: subscriber2Id,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: false,
      });

      const subscriptions = await getSubscriptionsByArtist(testArtistId);
      expect(subscriptions.length).toBe(2);
      expect(subscriptions.map(s => s.id).sort()).toEqual([subId1, subId2].sort());
      expect(subscriptions.every(s => s.artist_id === testArtistId)).toBe(true);
    });

    it("updateSubscription modifies notify_releases and notify_shows", async () => {
      const subId = `test-${randomUUID()}`;

      await createSubscription({
        id: subId,
        subscriber_id: testSubscriberId,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: true,
      });

      const updated = await updateSubscription(subId, {
        notify_releases: false,
        notify_shows: false,
      });

      expect(updated).not.toBeNull();
      expect(updated!.notify_releases).toBe(false);
      expect(updated!.notify_shows).toBe(false);

      // Verify persistence
      const retrieved = await getSubscriptionById(subId);
      expect(retrieved!.notify_releases).toBe(false);
      expect(retrieved!.notify_shows).toBe(false);
    });

    it("updateSubscription with partial data only updates provided fields", async () => {
      const subId = `test-${randomUUID()}`;

      await createSubscription({
        id: subId,
        subscriber_id: testSubscriberId,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: true,
      });

      const updated = await updateSubscription(subId, {
        notify_releases: false,
      });

      expect(updated).not.toBeNull();
      expect(updated!.notify_releases).toBe(false);
      expect(updated!.notify_shows).toBe(true); // unchanged
    });

    it("deleteSubscription removes subscription", async () => {
      const subId = `test-${randomUUID()}`;

      await createSubscription({
        id: subId,
        subscriber_id: testSubscriberId,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: true,
      });

      const deleted = await deleteSubscription(subId);
      expect(deleted).toBe(true);

      // Verify it's gone
      const retrieved = await getSubscriptionById(subId);
      expect(retrieved).toBeNull();
    });

    it("getSubscriberCount returns correct count for artist", async () => {
      // Initially 0
      let count = await getSubscriberCount(testArtistId);
      expect(count).toBe(0);

      // Add first subscriber
      const subId1 = `test-${randomUUID()}`;
      await createSubscription({
        id: subId1,
        subscriber_id: testSubscriberId,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: true,
      });

      count = await getSubscriberCount(testArtistId);
      expect(count).toBe(1);

      // Add second subscriber
      const subscriber2Id = `test-${randomUUID()}`;
      const uniqueSuffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
      await createUser({
        id: subscriber2Id,
        name: "Test Subscriber 2",
        email: `subscriber2-count-${uniqueSuffix}@example.com`,
        password_hash: "hashed_password_123",
        role: "subscriber",
        preferences: {
          email_notifications: true,
          push_notifications: true,
          new_release_alerts: true,
          show_alerts: true,
          marketing_emails: false,
        },
        avatar: null,
        email_verified: false,
        deleted_at: null,
        last_login: null,
      });

      const subId2 = `test-${randomUUID()}`;
      await createSubscription({
        id: subId2,
        subscriber_id: subscriber2Id,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: true,
      });

      count = await getSubscriberCount(testArtistId);
      expect(count).toBe(2);
    });

    it("enforces unique constraint on (subscriber_id, artist_id)", async () => {
      const subId1 = `test-${randomUUID()}`;
      const subId2 = `test-${randomUUID()}`;

      await createSubscription({
        id: subId1,
        subscriber_id: testSubscriberId,
        artist_id: testArtistId,
        notify_releases: true,
        notify_shows: true,
      });

      // Attempting to create duplicate should fail
      await expect(
        createSubscription({
          id: subId2,
          subscriber_id: testSubscriberId,
          artist_id: testArtistId,
          notify_releases: false,
          notify_shows: false,
        })
      ).rejects.toThrow();
    });
  });
});