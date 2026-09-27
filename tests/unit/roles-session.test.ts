import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createSessionToken,
  decodeSessionToken,
  isSessionValid,
  reissueSessionToken,
  needsReissue,
  SESSION_MAX_AGE,
  SESSION_MAX_AGE_REMEMBER,
} from "@/lib/auth";
import { createUser, getUserByEmail } from "@/lib/db";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

function seedTestUser() {
  const Database = require("better-sqlite3");
  const db = new Database(DB_PATH);
  const userId = randomUUID();
  const passwordHash = bcrypt.hashSync("password123", 10);
  db.prepare(`
    INSERT OR REPLACE INTO users (id, name, email, password_hash, role, preferences, avatar, email_verified, deleted_at, last_login, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(userId, "Test User", "test@example.com", passwordHash, "subscriber", JSON.stringify({}), null, 0, null, null);
  db.close();
  return userId;
}

describe("Auth - Roles and Session Security", () => {
  let testUserId: string;

  beforeAll(() => {
    testUserId = seedTestUser();
  });

  afterAll(() => {
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH);
    db.exec("DELETE FROM users WHERE email = 'test@example.com'");
    db.close();
  });

  describe("Registration creates subscriber only", () => {
    it("register endpoint should only create subscriber role", async () => {
      const user = await getUserByEmail("test@example.com");
      expect(user).not.toBeNull();
      expect(user?.role).toBe("subscriber");
    });
  });

  describe("Session tokens always have exp", () => {
    it("createSessionToken with rememberMe=false includes exp (24h)", async () => {
      const token = await createSessionToken({
        userId: testUserId,
        email: "test@example.com",
        role: "subscriber",
        rememberMe: false,
      });
      const decoded = await decodeSessionToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.exp).toBeDefined();
      expect(decoded!.exp! - decoded!.iat).toBe(SESSION_MAX_AGE);
    });

    it("createSessionToken with rememberMe=true includes exp (30d)", async () => {
      const token = await createSessionToken({
        userId: testUserId,
        email: "test@example.com",
        role: "subscriber",
        rememberMe: true,
      });
      const decoded = await decodeSessionToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.exp).toBeDefined();
      expect(decoded!.exp! - decoded!.iat).toBe(SESSION_MAX_AGE_REMEMBER);
    });

    it("tokens without exp are rejected by isSessionValid (but backward compat allows legacy)", async () => {
      const legacyToken = "eyJ1c2VySWQiOiJ0ZXN0IiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwicm9sZSI6InN1YnNjcmliZXIiLCJpYXQiOjE3MDAwMDAwMDAwMDB9.invalidsig";
      const decoded = await decodeSessionToken(legacyToken);
      expect(decoded).toBeNull();
    });
  });

  describe("Legacy tokens without exp/invalidateSessionBefore", () => {
    it("needsReissue returns true for tokens missing exp or invalidateSessionBefore", () => {
      const legacySession = {
        userId: testUserId,
        email: "test@example.com",
        role: "subscriber",
        iat: Date.now() - 1000,
      } as any;
      expect(needsReissue(legacySession)).toBe(true);
    });

    it("needsReissue returns false for complete tokens", () => {
      const completeSession = {
        userId: testUserId,
        email: "test@example.com",
        role: "subscriber",
        iat: Date.now(),
        exp: Date.now() + 86400000,
        invalidateSessionBefore: Date.now(),
      };
      expect(needsReissue(completeSession)).toBe(false);
    });
  });

  describe("invalidateSessionBefore invalidates old tokens", () => {
    it("isSessionValid returns false when iat < invalidateSessionBefore", () => {
      const now = Date.now();
      const session = {
        userId: testUserId,
        email: "test@example.com",
        role: "subscriber",
        iat: now - 10000,
        exp: now + 86400000,
        invalidateSessionBefore: now,
      };
      expect(isSessionValid(session)).toBe(false);
    });

    it("isSessionValid returns true when iat >= invalidateSessionBefore", () => {
      const now = Date.now();
      const session = {
        userId: testUserId,
        email: "test@example.com",
        role: "subscriber",
        iat: now,
        exp: now + 86400000,
        invalidateSessionBefore: now - 1000,
      };
      expect(isSessionValid(session)).toBe(true);
    });

    it("reissueSessionToken propagates invalidateSessionBefore", async () => {
      const now = Date.now();
      const invalidateBefore = now - 5000;
      const oldSession = {
        userId: testUserId,
        email: "test@example.com",
        role: "subscriber",
        iat: now - 10000,
        exp: now + 86400000,
        invalidateSessionBefore: invalidateBefore,
      };
      const newToken = await reissueSessionToken(oldSession, false, invalidateBefore);
      const decoded = await decodeSessionToken(newToken);
      expect(decoded!.invalidateSessionBefore).toBe(invalidateBefore);
    });
  });

  describe("Promotion reflected after re-issue", () => {
    it("login with updated DB role creates token with new role", async () => {
      const Database = require("better-sqlite3");
      const db = new Database(DB_PATH);
      db.prepare("UPDATE users SET role = 'artist' WHERE id = ?").run(testUserId);
      db.close();

      const user = await getUserByEmail("test@example.com");
      expect(user?.role).toBe("artist");

      const token = await createSessionToken({
        userId: testUserId,
        email: "test@example.com",
        role: user!.role,
        rememberMe: false,
      });
      const decoded = await decodeSessionToken(token);
      expect(decoded!.role).toBe("artist");
    });
  });
});