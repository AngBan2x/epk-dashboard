/**
 * Dual-mode database layer:
 * - When TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are set → @libsql/client (Turso remote)
 * - When not set → better-sqlite3 (local SQLite for development)
 *
 * All exported functions are async to support both backends uniformly.
 */
import path from "path";
import type {
  Track,
  RawTrackRow,
  Metrics,
  ProductionDetails,
  StemsUrls,
  User,
  RawUserRow,
  TrackSubmission,
  RawTrackSubmissionRow,
  SubmissionStatus,
  Like,
  RawLikeRow,
  Notification,
  RawNotificationRow,
  NotificationType,
  MetricsHistory,
  RawMetricsHistoryRow,
  TopCountry,
  ArtistProfile,
  CreateArtistInput,
  Show,
  RawShowRow,
  CreateShowInput,
  ShowStatus,
  SyncResult,
  // P2.1-P2.6: New types
  SocialLink,
  PaymentMethod,
  GuestArtist,
  ExternalLinks,
  Subscription,
  RawSubscriptionRow,
  SubmissionType,
  UserPreferences,
} from "@/types/music";
import { safeString, safeNumber, safeArray, safeParseJSON } from "@/lib/null-safe";

// ─── Environment detection ──────────────────────────────────────────────────

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const USE_TURSO = Boolean(TURSO_URL && TURSO_TOKEN);

// ─── Better-sqlite3 (local) ─────────────────────────────────────────────────

let _db: import("better-sqlite3").Database | null = null;
let _dbWrite: import("better-sqlite3").Database | null = null;

function getLocalDb(): import("better-sqlite3").Database {
  if (!_db) {
    // Dynamic import to avoid crash when better-sqlite3 is not available (e.g., edge runtime)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");
    _db = new Database(DB_PATH, { readonly: true });
  }
  return _db;
}

function getLocalDbWrite(): import("better-sqlite3").Database {
  if (!_dbWrite) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");
    _dbWrite = new Database(DB_PATH);
  }
  return _dbWrite;
}

// ─── Turso client (remote) ──────────────────────────────────────────────────
// NOTE: Singleton pattern causes UPDATE writes to not persist on Vercel HTTP
// transport. The singleton's execute() reports rowsAffected>0 but the write
// is never committed to Turso. Creating a fresh client per request fixes this.

// eslint-disable-next-line @typescript-eslint/no-require-imports
let _tursoLib: typeof import("@libsql/client") | null = null;

function getTursoLib(): typeof import("@libsql/client") {
  if (!_tursoLib) {
    _tursoLib = require("@libsql/client") as typeof import("@libsql/client");
  }
  return _tursoLib;
}

function getTursoClient(): import("@libsql/client").Client | null {
  if (!USE_TURSO) return null;
  const lib = getTursoLib();
  return lib.createClient({ url: TURSO_URL!, authToken: TURSO_TOKEN! });
}

// ─── Turso: Execute helper ──────────────────────────────────────────────────
// NOTE: The @libsql/client HTTP transport caches query results by exact SQL
// string. Stale cached reads cause UPDATE writes to appear not to persist.
// Fix: append a unique counter to SELECT queries to bust the cache.

let _tursoQueryCounter = 0;

function bustSelectCache(sql: string): string {
  if (sql.trimStart().toUpperCase().startsWith("SELECT")) {
    return `${sql} /*q${_tursoQueryCounter++}*/`;
  }
  return sql;
}

async function tursoExec(sql: string, args?: unknown[]): Promise<unknown[]> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not available");
  const result = await client.execute({ sql: bustSelectCache(sql), args: (args ?? []) as import("@libsql/client").InValue[] });
  return result.rows as unknown[];
}

async function tursoExecSingle(sql: string, args?: unknown[]): Promise<Record<string, unknown> | undefined> {
  const rows = await tursoExec(sql, args);
  return rows[0] as Record<string, unknown> | undefined;
}

async function tursoExecUpdate(sql: string, args?: unknown[]): Promise<number> {
  const client = getTursoClient();
  if (!client) throw new Error("Turso client not available");
  const result = await client.execute({ sql, args: (args ?? []) as import("@libsql/client").InValue[] });
  return result.rowsAffected;
}

// ─── Initialize tables (local only; Turso schema via ensureTursoSchema) ─────

function initLocalTables(): void {
  if (USE_TURSO) return; // Turso schema is managed via turso.ts

  const db = getLocalDbWrite();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'artist',
      preferences TEXT,
      avatar TEXT,
      email_verified INTEGER DEFAULT 0,
      deleted_at TEXT,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  // P2.2: Add new columns to users (safe ALTER TABLE)
  try { db.exec(`ALTER TABLE users ADD COLUMN preferences TEXT`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN avatar TEXT`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN deleted_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE users ADD COLUMN last_login TEXT`); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS track_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      track_data TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      admin_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_submissions_user ON track_submissions(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_submissions_status ON track_submissions(status)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (track_id) REFERENCES tracks(id),
      UNIQUE(user_id, track_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_likes_track ON likes(track_id)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics_history (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      date TEXT NOT NULL,
      streams INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      playlist_additions INTEGER DEFAULT 0,
      top_countries TEXT,
      source TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (track_id) REFERENCES tracks(id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_metrics_history_track ON metrics_history(track_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_metrics_history_date ON metrics_history(date)`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_history_track_date ON metrics_history(track_id, date)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      user_id TEXT,
      biography TEXT,
      press_text TEXT,
      press_highlights TEXT,
      genre TEXT,
      location TEXT,
      monthly_listeners INTEGER DEFAULT 0,
      social_links TEXT,
      profile_image TEXT,
      banner_image TEXT,
      slug TEXT,
      is_active INTEGER DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name)`);
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_artists_user_id ON artists(user_id)`);
  } catch {
    try {
      db.exec(`ALTER TABLE artists ADD COLUMN user_id TEXT`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_artists_user_id ON artists(user_id)`);
    } catch {
      // Column already exists
    }
  }
  // P2.1: Add new columns to artists (safe ALTER TABLE)
  try { db.exec(`ALTER TABLE artists ADD COLUMN social_links TEXT`); } catch {}
  try { db.exec(`ALTER TABLE artists ADD COLUMN profile_image TEXT`); } catch {}
  try { db.exec(`ALTER TABLE artists ADD COLUMN banner_image TEXT`); } catch {}
  try { db.exec(`ALTER TABLE artists ADD COLUMN slug TEXT`); } catch {}
  try { db.exec(`ALTER TABLE artists ADD COLUMN is_active INTEGER DEFAULT 1`); } catch {}
  try { db.exec(`ALTER TABLE artists ADD COLUMN deleted_at TEXT`); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS shows (
      id TEXT PRIMARY KEY,
      artist_id TEXT NOT NULL,
      venue_name TEXT NOT NULL,
      city TEXT,
      country TEXT,
      date TEXT,
      time TEXT,
      price_range TEXT,
      status TEXT DEFAULT 'disponible',
      ticket_url TEXT,
      payment_methods TEXT,
      postponement_reason TEXT,
      flyer_url TEXT,
      ticket_link TEXT,
      description TEXT,
      guest_artists TEXT,
      notes TEXT,
      deleted_at TEXT,
      updated_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (artist_id) REFERENCES artists(id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shows_artist ON shows(artist_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shows_date ON shows(date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shows_status ON shows(status)`);
  // P2.4: Add new columns to shows (safe ALTER TABLE)
  try { db.exec(`ALTER TABLE shows ADD COLUMN payment_methods TEXT`); } catch {}
  try { db.exec(`ALTER TABLE shows ADD COLUMN postponement_reason TEXT`); } catch {}
  try { db.exec(`ALTER TABLE shows ADD COLUMN flyer_url TEXT`); } catch {}
  try { db.exec(`ALTER TABLE shows ADD COLUMN ticket_link TEXT`); } catch {}
  try { db.exec(`ALTER TABLE shows ADD COLUMN description TEXT`); } catch {}
  try { db.exec(`ALTER TABLE shows ADD COLUMN guest_artists TEXT`); } catch {}
  try { db.exec(`ALTER TABLE shows ADD COLUMN notes TEXT`); } catch {}
  try { db.exec(`ALTER TABLE shows ADD COLUMN deleted_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE shows ADD COLUMN updated_at TEXT`); } catch {}

  // P2.3: Create subscriptions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      subscriber_id TEXT NOT NULL,
      artist_id TEXT NOT NULL,
      notify_releases INTEGER DEFAULT 1,
      notify_shows INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (subscriber_id) REFERENCES users(id),
      FOREIGN KEY (artist_id) REFERENCES artists(id),
      UNIQUE(subscriber_id, artist_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber ON subscriptions(subscriber_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_artist ON subscriptions(artist_id)`);

  // P2.5: Add new columns to tracks (safe ALTER TABLE)
  try { db.exec(`ALTER TABLE tracks ADD COLUMN external_links TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tracks ADD COLUMN disc_number INTEGER DEFAULT 1`); } catch {}
  try { db.exec(`ALTER TABLE tracks ADD COLUMN is_double_single INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tracks ADD COLUMN sides_b TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tracks ADD COLUMN cover_image TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tracks ADD COLUMN isrc TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tracks ADD COLUMN composers TEXT`); } catch {}

  // P2.6: Add new columns to track_submissions (safe ALTER TABLE)
  try { db.exec(`ALTER TABLE track_submissions ADD COLUMN submission_type TEXT DEFAULT 'track'`); } catch {}
  try { db.exec(`ALTER TABLE track_submissions ADD COLUMN metadata TEXT`); } catch {}
  try { db.exec(`ALTER TABLE track_submissions ADD COLUMN admin_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE track_submissions ADD COLUMN reviewed_at TEXT`); } catch {}
}

// Initialize local tables on module load (only when not using Turso)
if (!USE_TURSO) {
  initLocalTables();
}

// ─── Parsers ────────────────────────────────────────────────────────────────

function parseUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    password_hash: String(row.password_hash),
    role: String(row.role) as "admin" | "artist",
    preferences: safeParseJSON<UserPreferences>((row.preferences as string) ?? null, {
      email_notifications: true,
      push_notifications: true,
      new_release_alerts: true,
      show_alerts: true,
      marketing_emails: false,
    }),
    avatar: (row.avatar as string) ?? null,
    email_verified: Number(row.email_verified) === 1,
    deleted_at: (row.deleted_at as string) ?? null,
    last_login: (row.last_login as string) ?? null,
    created_at: String(row.created_at),
  };
}

function parseTrackSubmission(row: Record<string, unknown>): TrackSubmission {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    track_data: String(row.track_data),
    status: String(row.status) as SubmissionStatus,
    admin_notes: (row.admin_notes as string) ?? null,
    submission_type: (row.submission_type as SubmissionType) ?? "track",
    metadata: (row.metadata as string) ?? null,
    admin_id: (row.admin_id as string) ?? null,
    reviewed_at: (row.reviewed_at as string) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function parseLike(row: Record<string, unknown>): Like {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    track_id: String(row.track_id),
    created_at: String(row.created_at),
  };
}

function parseNotification(row: Record<string, unknown>): Notification {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    type: String(row.type) as NotificationType,
    title: String(row.title),
    message: String(row.message),
    data: (row.data as string) ?? null,
    read: Number(row.read) === 1,
    created_at: String(row.created_at),
  };
}

function parseMetricsHistory(row: Record<string, unknown>): MetricsHistory {
  return {
    id: String(row.id),
    track_id: String(row.track_id),
    date: String(row.date),
    streams: Number(row.streams) || 0,
    saves: Number(row.saves) || 0,
    playlist_additions: Number(row.playlist_additions) || 0,
    top_countries: safeParseJSON<TopCountry[]>((row.top_countries as string) ?? null, []),
    source: String(row.source),
    created_at: String(row.created_at),
  };
}

function parseArtist(row: Record<string, unknown>): ArtistProfile {
  return {
    id: String(row.id),
    name: String(row.name),
    user_id: (row.user_id as string) ?? null,
    biography: (row.biography as string) ?? null,
    press_text: (row.press_text as string) ?? null,
    press_highlights: safeParseJSON<string[]>((row.press_highlights as string) ?? null, []),
    genre: (row.genre as string) ?? null,
    location: (row.location as string) ?? null,
    monthly_listeners: Number(row.monthly_listeners) || 0,
    social_links: safeParseJSON<SocialLink[]>((row.social_links as string) ?? null, []),
    profile_image: (row.profile_image as string) ?? null,
    banner_image: (row.banner_image as string) ?? null,
    slug: (row.slug as string) ?? null,
    is_active: Number(row.is_active) !== 0,
    deleted_at: (row.deleted_at as string) ?? null,
    created_at: String(row.created_at),
  };
}

function parseMetrics(raw: string | null): Metrics {
  const fallback: Metrics = { streams: 0, saves: 0, playlist_additions: 0, top_countries: [] };
  if (!raw) return fallback;

  const parsed = safeParseJSON<Record<string, unknown> | null>(raw, null);
  if (!parsed) return fallback;

  return {
    streams: safeNumber(parsed.streams),
    saves: safeNumber(parsed.saves),
    playlist_additions: safeNumber(parsed.playlist_additions),
    top_countries: safeArray<{ country: string; pct: number }>(parsed.top_countries),
  };
}

function parseProductionDetails(raw: string | null): ProductionDetails {
  const fallback: ProductionDetails = { daw: null, guitars: null, effects_chain: null, tuning: null, key: null };
  if (!raw) return fallback;

  const parsed = safeParseJSON<Record<string, unknown> | null>(raw, null);
  if (!parsed) return fallback;

  return {
    daw: typeof parsed.daw === "string" ? parsed.daw : null,
    guitars: typeof parsed.guitars === "string" ? parsed.guitars : null,
    effects_chain: typeof parsed.effects_chain === "string" ? parsed.effects_chain : null,
    tuning: typeof parsed.tuning === "string" ? parsed.tuning : null,
    key: typeof parsed.key === "string" ? parsed.key : null,
  };
}

function parseStemsUrls(raw: string | null): StemsUrls | null {
  if (!raw) return null;

  const parsed = safeParseJSON<Record<string, unknown> | null>(raw, null);
  if (!parsed) return null;

  return {
    drums: typeof parsed.drums === "string" ? parsed.drums : undefined,
    bass: typeof parsed.bass === "string" ? parsed.bass : undefined,
    guitars: typeof parsed.guitars === "string" ? parsed.guitars : undefined,
    vocals: typeof parsed.vocals === "string" ? parsed.vocals : undefined,
    other: typeof parsed.other === "string" ? parsed.other : undefined,
  };
}

function parseGalleryImages(raw: string | null): string[] | null {
  if (!raw) return null;

  const parsed = safeParseJSON<unknown>(raw, null);
  if (!Array.isArray(parsed)) return null;

  const filtered = parsed.filter((item): item is string => typeof item === "string");
  return filtered.length > 0 ? filtered : null;
}

function parseTrack(row: Record<string, unknown>): Track {
  return {
    id: String(row.id),
    title: String(row.title),
    artist_name: safeString(row.artist_name, "Artista EPK"),
    release_type: safeString(row.release_type),
    release_date: safeString(row.release_date),
    duration: safeString(row.duration),
    cover_image: safeString(row.cover_image),
    audio_preview_url: safeString(row.audio_preview_url),
    spotify_url: (row.spotify_url as string) ?? null,
    youtube_video_id: (row.youtube_video_id as string) ?? null,
    metrics: parseMetrics((row.metrics as string) ?? null),
    production_details: parseProductionDetails((row.production_details as string) ?? null),
    lyrics: (row.lyrics as string) ?? null,
    itunes_track_id: (row.itunes_track_id as string) ?? null,
    stems_urls: parseStemsUrls((row.stems_urls as string) ?? null),
    video_embed_url: (row.video_embed_url as string) ?? null,
    gallery_images: parseGalleryImages((row.gallery_images as string) ?? null),
    // P2.5: New fields
    external_links: safeParseJSON<ExternalLinks | null>((row.external_links as string) ?? null, null),
    disc_number: row.disc_number ? Number(row.disc_number) : undefined,
    is_double_single: row.is_double_single ? Number(row.is_double_single) === 1 : undefined,
    sides_b: safeParseJSON<string[] | null>((row.sides_b as string) ?? null, null),
    isrc: (row.isrc as string) ?? null,
    composers: safeParseJSON<string[] | null>((row.composers as string) ?? null, null),
  };
}

function parseShow(row: Record<string, unknown>): Show {
  return {
    id: String(row.id),
    artist_id: String(row.artist_id),
    venue_name: String(row.venue_name),
    city: (row.city as string) ?? null,
    country: (row.country as string) ?? null,
    date: (row.date as string) ?? null,
    time: (row.time as string) ?? null,
    price_range: (row.price_range as string) ?? null,
    status: String(row.status) as ShowStatus,
    ticket_url: (row.ticket_url as string) ?? null,
    payment_methods: safeParseJSON<PaymentMethod[]>((row.payment_methods as string) ?? null, []),
    postponement_reason: (row.postponement_reason as string) ?? null,
    flyer_url: (row.flyer_url as string) ?? null,
    ticket_link: (row.ticket_link as string) ?? null,
    description: (row.description as string) ?? null,
    guest_artists: safeParseJSON<GuestArtist[]>((row.guest_artists as string) ?? null, []),
    notes: (row.notes as string) ?? null,
    deleted_at: (row.deleted_at as string) ?? null,
    updated_at: (row.updated_at as string) ?? null,
    created_at: String(row.created_at),
  };
}

// ─── Users CRUD ─────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string): Promise<User | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM users WHERE email = ?", [email]);
    return row ? parseUser(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as Record<string, unknown> | undefined;
  return row !== undefined ? parseUser(row) : null;
}

export async function getUserById(id: string): Promise<User | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM users WHERE id = ?", [id]);
    return row ? parseUser(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseUser(row) : null;
}

export async function createUser(user: Omit<User, "id" | "created_at"> & { id: string }): Promise<User> {
  if (USE_TURSO) {
    await tursoExec(
      `INSERT INTO users (id, name, email, password_hash, role, preferences, avatar, email_verified, deleted_at, last_login)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.email,
        user.password_hash,
        user.role,
        user.preferences ? JSON.stringify(user.preferences) : null,
        user.avatar ?? null,
        user.email_verified ? 1 : 0,
        user.deleted_at ?? null,
        user.last_login ?? null,
      ]
    );
    const row = await tursoExecSingle("SELECT * FROM users WHERE id = ?", [user.id]);
    if (!row) throw new Error("Failed to create user");
    return parseUser(row);
  }
  const db = getLocalDbWrite();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, preferences, avatar, email_verified, deleted_at, last_login)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user.id,
    user.name,
    user.email,
    user.password_hash,
    user.role,
    user.preferences ? JSON.stringify(user.preferences) : null,
    user.avatar ?? null,
    user.email_verified ? 1 : 0,
    user.deleted_at ?? null,
    user.last_login ?? null
  );
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Failed to create user");
  return parseUser(row);
}

export async function verifyUserPassword(email: string, _password: string): Promise<User | null> {
  // Password verification is done with bcrypt in auth API
  return getUserByEmail(email);
}

export async function deleteUser(userId: string): Promise<boolean> {
  if (USE_TURSO) {
    // Delete related data first
    await tursoExec("DELETE FROM likes WHERE user_id = ?", [userId]);
    await tursoExec("DELETE FROM notifications WHERE user_id = ?", [userId]);
    await tursoExec("DELETE FROM track_submissions WHERE user_id = ?", [userId]);
    // Delete artist profile if exists
    const artist = await getArtistByUserId(userId);
    if (artist) {
      await tursoExec("DELETE FROM shows WHERE artist_id = ?", [artist.id]);
      await tursoExec("DELETE FROM artists WHERE id = ?", [artist.id]);
    }
    // Delete user
    await tursoExec("DELETE FROM users WHERE id = ?", [userId]);
    return true;
  }
  const db = getLocalDbWrite();
  // Delete related data first
  db.prepare("DELETE FROM likes WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM notifications WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM track_submissions WHERE user_id = ?").run(userId);
  // Delete artist profile if exists
  const artist = await getArtistByUserId(userId);
  if (artist) {
    db.prepare("DELETE FROM shows WHERE artist_id = ?").run(artist.id);
    db.prepare("DELETE FROM artists WHERE id = ?").run(artist.id);
  }
  // Delete user
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return true;
}

// ─── Track Submissions CRUD ─────────────────────────────────────────────────

export async function createTrackSubmission(
  submission: Omit<TrackSubmission, "id" | "created_at" | "updated_at"> & { id: string }
): Promise<TrackSubmission> {
  if (USE_TURSO) {
    await tursoExec(
      `INSERT INTO track_submissions (id, user_id, track_data, status, admin_notes, submission_type, metadata, admin_id, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        submission.id,
        submission.user_id,
        submission.track_data,
        submission.status,
        submission.admin_notes ?? null,
        submission.submission_type ?? "track",
        submission.metadata ?? null,
        submission.admin_id ?? null,
        submission.reviewed_at ?? null,
      ]
    );
    const created = await getTrackSubmissionById(submission.id);
    if (!created) throw new Error("Failed to create track submission");
    return created;
  }
  const db = getLocalDbWrite();
  db.prepare(
    `INSERT INTO track_submissions (id, user_id, track_data, status, admin_notes, submission_type, metadata, admin_id, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    submission.id,
    submission.user_id,
    submission.track_data,
    submission.status,
    submission.admin_notes,
    submission.submission_type ?? "track",
    submission.metadata ?? null,
    submission.admin_id ?? null,
    submission.reviewed_at ?? null
  );
  const created = await getTrackSubmissionById(submission.id);
  if (!created) throw new Error("Failed to create track submission");
  return created;
}

export async function getTrackSubmissionById(id: string): Promise<TrackSubmission | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM track_submissions WHERE id = ?", [id]);
    return row ? parseTrackSubmission(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM track_submissions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseTrackSubmission(row) : null;
}

export async function getTrackSubmissionsByUser(userId: string): Promise<TrackSubmission[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM track_submissions WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    return rows.map((r) => parseTrackSubmission(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM track_submissions WHERE user_id = ? ORDER BY created_at DESC").all(userId) as Record<string, unknown>[];
  return rows.map(parseTrackSubmission);
}

export async function getAllTrackSubmissions(): Promise<TrackSubmission[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM track_submissions ORDER BY created_at DESC");
    return rows.map((r) => parseTrackSubmission(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM track_submissions ORDER BY created_at DESC").all() as Record<string, unknown>[];
  return rows.map(parseTrackSubmission);
}

export async function getTrackSubmissionsByStatus(status: SubmissionStatus): Promise<TrackSubmission[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM track_submissions WHERE status = ? ORDER BY created_at DESC", [status]);
    return rows.map((r) => parseTrackSubmission(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM track_submissions WHERE status = ? ORDER BY created_at DESC").all(status) as Record<string, unknown>[];
  return rows.map(parseTrackSubmission);
}

export async function updateTrackSubmissionStatus(
  id: string,
  status: SubmissionStatus,
  adminNotes?: string,
  adminId?: string
): Promise<TrackSubmission | null> {
  if (USE_TURSO) {
    const now = new Date().toISOString();
    if (adminNotes !== undefined) {
      await tursoExec(
        "UPDATE track_submissions SET status = ?, admin_notes = ?, admin_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
        [status, adminNotes, adminId ?? null, now, now, id]
      );
    } else {
      await tursoExec(
        "UPDATE track_submissions SET status = ?, admin_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
        [status, adminId ?? null, now, now, id]
      );
    }
    return getTrackSubmissionById(id);
  }
  const db = getLocalDbWrite();
  const now = new Date().toISOString();
  if (adminNotes !== undefined) {
    db.prepare("UPDATE track_submissions SET status = ?, admin_notes = ?, admin_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").run(status, adminNotes, adminId ?? null, now, now, id);
  } else {
    db.prepare("UPDATE track_submissions SET status = ?, admin_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").run(status, adminId ?? null, now, now, id);
  }
  return getTrackSubmissionById(id);
}

// ─── Subscriptions CRUD ───────────────────────────────────────────────────────

function parseSubscription(row: Record<string, unknown>): Subscription {
  return {
    id: String(row.id),
    subscriber_id: String(row.subscriber_id),
    artist_id: String(row.artist_id),
    notify_releases: Number(row.notify_releases) === 1,
    notify_shows: Number(row.notify_shows) === 1,
    created_at: String(row.created_at),
  };
}

export async function createSubscription(
  subscription: Omit<Subscription, "id" | "created_at"> & { id: string }
): Promise<Subscription> {
  if (USE_TURSO) {
    await tursoExec(
      "INSERT INTO subscriptions (id, subscriber_id, artist_id, notify_releases, notify_shows) VALUES (?, ?, ?, ?, ?)",
      [subscription.id, subscription.subscriber_id, subscription.artist_id, subscription.notify_releases ? 1 : 0, subscription.notify_shows ? 1 : 0]
    );
    const created = await getSubscriptionById(subscription.id);
    if (!created) throw new Error("Failed to create subscription");
    return created;
  }
  const db = getLocalDbWrite();
  db.prepare(
    "INSERT INTO subscriptions (id, subscriber_id, artist_id, notify_releases, notify_shows) VALUES (?, ?, ?, ?, ?)"
  ).run(subscription.id, subscription.subscriber_id, subscription.artist_id, subscription.notify_releases ? 1 : 0, subscription.notify_shows ? 1 : 0);
  const created = await getSubscriptionById(subscription.id);
  if (!created) throw new Error("Failed to create subscription");
  return created;
}

export async function getSubscriptionById(id: string): Promise<Subscription | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM subscriptions WHERE id = ?", [id]);
    return row ? parseSubscription(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseSubscription(row) : null;
}

export async function getSubscriptionByUserAndArtist(subscriberId: string, artistId: string): Promise<Subscription | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM subscriptions WHERE subscriber_id = ? AND artist_id = ?", [subscriberId, artistId]);
    return row ? parseSubscription(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM subscriptions WHERE subscriber_id = ? AND artist_id = ?").get(subscriberId, artistId) as Record<string, unknown> | undefined;
  return row !== undefined ? parseSubscription(row) : null;
}

export async function getSubscriptionsBySubscriber(subscriberId: string): Promise<Subscription[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM subscriptions WHERE subscriber_id = ? ORDER BY created_at DESC", [subscriberId]);
    return rows.map((r) => parseSubscription(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM subscriptions WHERE subscriber_id = ? ORDER BY created_at DESC").all(subscriberId) as Record<string, unknown>[];
  return rows.map(parseSubscription);
}

export async function getSubscriptionsByArtist(artistId: string): Promise<Subscription[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM subscriptions WHERE artist_id = ? ORDER BY created_at DESC", [artistId]);
    return rows.map((r) => parseSubscription(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM subscriptions WHERE artist_id = ? ORDER BY created_at DESC").all(artistId) as Record<string, unknown>[];
  return rows.map(parseSubscription);
}

export async function updateSubscription(id: string, data: Partial<Omit<Subscription, "id" | "created_at">>): Promise<Subscription | null> {
  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.notify_releases !== undefined) { updates.push("notify_releases = ?"); values.push(data.notify_releases ? 1 : 0); }
  if (data.notify_shows !== undefined) { updates.push("notify_shows = ?"); values.push(data.notify_shows ? 1 : 0); }

  if (updates.length === 0) return getSubscriptionById(id);

  values.push(id);

  if (USE_TURSO) {
    const rowsAffected = await tursoExecUpdate(`UPDATE subscriptions SET ${updates.join(", ")} WHERE id = ?`, values);
    if (rowsAffected === 0) return null;
    return getSubscriptionById(id);
  }

  const db = getLocalDbWrite();
  const localResult = db.prepare(`UPDATE subscriptions SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  if (localResult.changes === 0) return null;
  return getSubscriptionById(id);
}

export async function deleteSubscription(id: string): Promise<boolean> {
  if (USE_TURSO) {
    await tursoExec("DELETE FROM subscriptions WHERE id = ?", [id]);
    return true;
  }
  const db = getLocalDbWrite();
  const result = db.prepare("DELETE FROM subscriptions WHERE id = ?").run(id);
  return result.changes > 0;
}

// ─── Likes CRUD ─────────────────────────────────────────────────────────────

export async function toggleLike(userId: string, trackId: string): Promise<{ liked: boolean; count: number }> {
  if (USE_TURSO) {
    const existing = await tursoExecSingle(
      "SELECT * FROM likes WHERE user_id = ? AND track_id = ?",
      [userId, trackId]
    );

    if (existing) {
      await tursoExec("DELETE FROM likes WHERE user_id = ? AND track_id = ?", [userId, trackId]);
    } else {
      const id = crypto.randomUUID();
      await tursoExec("INSERT INTO likes (id, user_id, track_id) VALUES (?, ?, ?)", [id, userId, trackId]);
    }

    const countRow = await tursoExecSingle("SELECT COUNT(*) as count FROM likes WHERE track_id = ?", [trackId]);
    const count = countRow ? Number(countRow.count) : 0;
    return { liked: !existing, count };
  }

  const db = getLocalDbWrite();
  const existing = db.prepare("SELECT * FROM likes WHERE user_id = ? AND track_id = ?").get(userId, trackId) as Record<string, unknown> | undefined;

  if (existing) {
    db.prepare("DELETE FROM likes WHERE user_id = ? AND track_id = ?").run(userId, trackId);
  } else {
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO likes (id, user_id, track_id) VALUES (?, ?, ?)").run(id, userId, trackId);
  }

  const count = db.prepare("SELECT COUNT(*) as count FROM likes WHERE track_id = ?").get(trackId) as { count: number };
  return { liked: !existing, count: count.count };
}

export async function getLikeCount(trackId: string): Promise<number> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT COUNT(*) as count FROM likes WHERE track_id = ?", [trackId]);
    return row ? Number(row.count) : 0;
  }
  const db = getLocalDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM likes WHERE track_id = ?").get(trackId) as { count: number };
  return result.count;
}

export async function getUserLikes(userId: string): Promise<Like[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM likes WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    return rows.map((r) => parseLike(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM likes WHERE user_id = ? ORDER BY created_at DESC").all(userId) as Record<string, unknown>[];
  return rows.map(parseLike);
}

export async function hasUserLikedTrack(userId: string, trackId: string): Promise<boolean> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT 1 FROM likes WHERE user_id = ? AND track_id = ?", [userId, trackId]);
    return row !== undefined;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT 1 FROM likes WHERE user_id = ? AND track_id = ?").get(userId, trackId);
  return row !== undefined;
}

// ─── Notifications CRUD ─────────────────────────────────────────────────────

export async function createNotification(
  notification: Omit<Notification, "id" | "created_at"> & { id: string }
): Promise<Notification> {
  if (USE_TURSO) {
    await tursoExec(
      "INSERT INTO notifications (id, user_id, type, title, message, data, read) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        notification.id,
        notification.user_id,
        notification.type,
        notification.title,
        notification.message,
        notification.data,
        notification.read ? 1 : 0,
      ]
    );
    const created = await getNotificationById(notification.id);
    if (!created) throw new Error("Failed to create notification");
    return created;
  }
  const db = getLocalDbWrite();
  db.prepare(
    "INSERT INTO notifications (id, user_id, type, title, message, data, read) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    notification.id,
    notification.user_id,
    notification.type,
    notification.title,
    notification.message,
    notification.data,
    notification.read ? 1 : 0
  );
  const created = await getNotificationById(notification.id);
  if (!created) throw new Error("Failed to create notification");
  return created;
}

export async function getNotificationById(id: string): Promise<Notification | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM notifications WHERE id = ?", [id]);
    return row ? parseNotification(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseNotification(row) : null;
}

export async function getUserNotifications(userId: string, unreadOnly = false): Promise<Notification[]> {
  if (USE_TURSO) {
    let query = "SELECT * FROM notifications WHERE user_id = ?";
    const args: unknown[] = [userId];
    if (unreadOnly) {
      query += " AND read = 0";
    }
    query += " ORDER BY created_at DESC";
    const rows = await tursoExec(query, args);
    return rows.map((r) => parseNotification(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  let query = "SELECT * FROM notifications WHERE user_id = ?";
  if (unreadOnly) {
    query += " AND read = 0";
  }
  query += " ORDER BY created_at DESC";
  const rows = db.prepare(query).all(userId) as Record<string, unknown>[];
  return rows.map(parseNotification);
}

export async function markNotificationAsRead(id: string): Promise<Notification | null> {
  if (USE_TURSO) {
    await tursoExec("UPDATE notifications SET read = 1 WHERE id = ?", [id]);
    return getNotificationById(id);
  }
  const db = getLocalDbWrite();
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(id);
  return getNotificationById(id);
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  if (USE_TURSO) {
    await tursoExec("UPDATE notifications SET read = 1 WHERE user_id = ?", [userId]);
    return;
  }
  const db = getLocalDbWrite();
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(userId);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  if (USE_TURSO) {
    const row = await tursoExecSingle(
      "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0",
      [userId]
    );
    return row ? Number(row.count) : 0;
  }
  const db = getLocalDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0").get(userId) as { count: number };
  return result.count;
}

// ─── Metrics History CRUD ───────────────────────────────────────────────────

export async function createMetricsHistory(
  metrics: Omit<MetricsHistory, "id" | "created_at"> & { id: string }
): Promise<MetricsHistory> {
  if (USE_TURSO) {
    await tursoExec(
      "INSERT INTO metrics_history (id, track_id, date, streams, saves, playlist_additions, top_countries, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [metrics.id, metrics.track_id, metrics.date, metrics.streams, metrics.saves, metrics.playlist_additions, JSON.stringify(metrics.top_countries), metrics.source]
    );
    const created = await getMetricsHistoryById(metrics.id);
    if (!created) throw new Error("Failed to create metrics history");
    return created;
  }
  const db = getLocalDbWrite();
  db.prepare(
    "INSERT INTO metrics_history (id, track_id, date, streams, saves, playlist_additions, top_countries, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(metrics.id, metrics.track_id, metrics.date, metrics.streams, metrics.saves, metrics.playlist_additions, JSON.stringify(metrics.top_countries), metrics.source);
  const created = await getMetricsHistoryById(metrics.id);
  if (!created) throw new Error("Failed to create metrics history");
  return created;
}

export async function getMetricsHistoryById(id: string): Promise<MetricsHistory | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM metrics_history WHERE id = ?", [id]);
    return row ? parseMetricsHistory(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM metrics_history WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseMetricsHistory(row) : null;
}

export async function getMetricsHistoryByTrack(trackId: string): Promise<MetricsHistory[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM metrics_history WHERE track_id = ? ORDER BY date DESC", [trackId]);
    return rows.map((r) => parseMetricsHistory(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM metrics_history WHERE track_id = ? ORDER BY date DESC").all(trackId) as Record<string, unknown>[];
  return rows.map(parseMetricsHistory);
}

export async function getMetricsHistoryByTrackAndDate(trackId: string, date: string): Promise<MetricsHistory | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle(
      "SELECT * FROM metrics_history WHERE track_id = ? AND date = ?",
      [trackId, date]
    );
    return row ? parseMetricsHistory(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM metrics_history WHERE track_id = ? AND date = ?").get(trackId, date) as Record<string, unknown> | undefined;
  return row !== undefined ? parseMetricsHistory(row) : null;
}

export async function upsertMetricsHistory(
  metrics: Omit<MetricsHistory, "id" | "created_at"> & { id: string }
): Promise<MetricsHistory> {
  if (USE_TURSO) {
    const existing = await getMetricsHistoryByTrackAndDate(metrics.track_id, metrics.date);
    if (existing) {
      await tursoExec(
        "UPDATE metrics_history SET streams = ?, saves = ?, playlist_additions = ?, top_countries = ?, source = ?, created_at = ? WHERE id = ?",
        [metrics.streams, metrics.saves, metrics.playlist_additions, JSON.stringify(metrics.top_countries), metrics.source, new Date().toISOString(), existing.id]
      );
      return (await getMetricsHistoryById(existing.id))!;
    } else {
      return createMetricsHistory(metrics);
    }
  }
  const db = getLocalDbWrite();
  const existing = await getMetricsHistoryByTrackAndDate(metrics.track_id, metrics.date);
  if (existing) {
    db.prepare(
      "UPDATE metrics_history SET streams = ?, saves = ?, playlist_additions = ?, top_countries = ?, source = ?, created_at = ? WHERE id = ?"
    ).run(metrics.streams, metrics.saves, metrics.playlist_additions, JSON.stringify(metrics.top_countries), metrics.source, new Date().toISOString(), existing.id);
    return (await getMetricsHistoryById(existing.id))!;
  } else {
    return createMetricsHistory(metrics);
  }
}

// ─── Artists CRUD ───────────────────────────────────────────────────────────

export async function getArtistByName(name: string): Promise<ArtistProfile | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM artists WHERE name = ?", [name]);
    return row ? parseArtist(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM artists WHERE name = ?").get(name) as Record<string, unknown> | undefined;
  return row ? parseArtist(row) : null;
}

export async function getArtistByUserId(userId: string): Promise<ArtistProfile | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM artists WHERE user_id = ?", [userId]);
    return row ? parseArtist(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM artists WHERE user_id = ?").get(userId) as Record<string, unknown> | undefined;
  return row ? parseArtist(row) : null;
}

export async function getArtistById(id: string): Promise<ArtistProfile | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM artists WHERE id = ?", [id]);
    return row ? parseArtist(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM artists WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? parseArtist(row) : null;
}

export async function createArtist(data: CreateArtistInput): Promise<ArtistProfile> {
  const id = `art-${Date.now()}`;
  const pressHighlights = data.pressHighlights ? JSON.stringify(data.pressHighlights) : "[]";
  // Generate slug from name
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const socialLinks = data.socialLinks ? JSON.stringify(data.socialLinks) : "[]";

  if (USE_TURSO) {
    await tursoExec(
      `INSERT INTO artists (id, name, user_id, biography, press_text, press_highlights, genre, location, monthly_listeners, social_links, profile_image, banner_image, slug, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.userId || null,
        data.biography || null,
        data.pressText || null,
        pressHighlights,
        data.genre || null,
        data.location || null,
        data.monthly_listeners || 0,
        socialLinks,
        data.profileImage || null,
        data.bannerImage || null,
        slug,
        1,
      ]
    );
    const row = await tursoExecSingle("SELECT * FROM artists WHERE id = ?", [id]);
    if (!row) throw new Error("Failed to create artist");
    return parseArtist(row);
  }

  const db = getLocalDbWrite();
  db.prepare(
    `INSERT INTO artists (id, name, user_id, biography, press_text, press_highlights, genre, location, monthly_listeners, social_links, profile_image, banner_image, slug, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.name, data.userId || null, data.biography || null, data.pressText || null, pressHighlights, data.genre || null, data.location || null, data.monthly_listeners || 0, socialLinks, data.profileImage || null, data.bannerImage || null, slug, 1);
  const row = db.prepare("SELECT * FROM artists WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Failed to create artist");
  return parseArtist(row);
}

export async function updateArtist(id: string, data: Partial<CreateArtistInput> & Record<string, unknown>): Promise<ArtistProfile | null> {
  // Accept both camelCase and snake_case from forms
  const name = data.name as string | undefined;
  const biography = data.biography as string | undefined;
  const pressText = (data.pressText ?? data.press_text) as string | undefined;
  const pressHighlights = (data.pressHighlights ?? data.press_highlights) as string[] | undefined;
  const genre = data.genre as string | undefined;
  const location = data.location as string | undefined;
  const monthlyListeners = ((data.monthly_listeners ?? data.monthlyListeners) as number | undefined) ?? 0;
  const userId = (data.userId ?? data.user_id) as string | undefined;
  const socialLinks = (data.socialLinks ?? data.social_links) as SocialLink[] | undefined;
  const profileImage = (data.profileImage ?? data.profile_image) as string | undefined;
  const bannerImage = (data.bannerImage ?? data.banner_image) as string | undefined;
  const slug = (data.slug ?? data.slug) as string | undefined;
  const isActive = (data.isActive ?? data.is_active) as boolean | undefined;

  console.log("[updateArtist] id:", id, "name:", name, "biography:", biography?.substring(0, 30), "genre:", genre, "location:", location, "monthly_listeners:", monthlyListeners);

  if (USE_TURSO) {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    if (biography !== undefined) { updates.push("biography = ?"); values.push(biography); }
    if (pressText !== undefined) { updates.push("press_text = ?"); values.push(pressText); }
    if (pressHighlights !== undefined) { updates.push("press_highlights = ?"); values.push(JSON.stringify(pressHighlights)); }
    if (genre !== undefined) { updates.push("genre = ?"); values.push(genre); }
    if (location !== undefined) { updates.push("location = ?"); values.push(location); }
    if (monthlyListeners !== undefined) { updates.push("monthly_listeners = ?"); values.push(monthlyListeners); }
    if (userId !== undefined) { updates.push("user_id = ?"); values.push(userId); }
    if (socialLinks !== undefined) { updates.push("social_links = ?"); values.push(JSON.stringify(socialLinks)); }
    if (profileImage !== undefined) { updates.push("profile_image = ?"); values.push(profileImage); }
    if (bannerImage !== undefined) { updates.push("banner_image = ?"); values.push(bannerImage); }
    if (slug !== undefined) { updates.push("slug = ?"); values.push(slug); }
    if (isActive !== undefined) { updates.push("is_active = ?"); values.push(isActive ? 1 : 0); }

    if (updates.length === 0) return getArtistById(id);

    values.push(id);
    // NOTE: Do NOT use client.batch() — it silently fails to commit on Vercel HTTP transport.
    // Individual execute() calls persist correctly (verified via direct Turso test).
    const rowsAffected = await tursoExecUpdate(`UPDATE artists SET ${updates.join(", ")} WHERE id = ?`, values);
    console.log("[updateArtist Turso] rowsAffected:", rowsAffected, "updates:", updates.length);
    if (rowsAffected === 0) {
      console.log("[updateArtist Turso] no rows affected, artist may not exist");
      return null;
    }
    return getArtistById(id);
  }

  const db = getLocalDbWrite();
  const updates: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values: any[] = [];

  if (name !== undefined) { updates.push("name = ?"); values.push(name); }
  if (biography !== undefined) { updates.push("biography = ?"); values.push(biography); }
  if (pressText !== undefined) { updates.push("press_text = ?"); values.push(pressText); }
  if (pressHighlights !== undefined) { updates.push("press_highlights = ?"); values.push(JSON.stringify(pressHighlights)); }
  if (genre !== undefined) { updates.push("genre = ?"); values.push(genre); }
  if (location !== undefined) { updates.push("location = ?"); values.push(location); }
  if (monthlyListeners !== undefined) { updates.push("monthly_listeners = ?"); values.push(monthlyListeners); }
  if (userId !== undefined) { updates.push("user_id = ?"); values.push(userId); }
  if (socialLinks !== undefined) { updates.push("social_links = ?"); values.push(JSON.stringify(socialLinks)); }
  if (profileImage !== undefined) { updates.push("profile_image = ?"); values.push(profileImage); }
  if (bannerImage !== undefined) { updates.push("banner_image = ?"); values.push(bannerImage); }
  if (slug !== undefined) { updates.push("slug = ?"); values.push(slug); }
  if (isActive !== undefined) { updates.push("is_active = ?"); values.push(isActive ? 1 : 0); }

  if (updates.length === 0) return getArtistById(id);

  values.push(id);
  const localResult = db.prepare(`UPDATE artists SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  console.log("[updateArtist Local] changes:", localResult.changes);
  if (localResult.changes === 0) return null;
  return getArtistById(id);
}

export async function deleteArtist(id: string): Promise<{ success: boolean }> {
  if (USE_TURSO) {
    await tursoExec("DELETE FROM shows WHERE artist_id = ?", [id]);
    const rowsAffected = await tursoExecUpdate("DELETE FROM artists WHERE id = ?", [id]);
    return { success: rowsAffected > 0 };
  }
  const db = getLocalDbWrite();
  db.prepare("DELETE FROM shows WHERE artist_id = ?").run(id);
  const result = db.prepare("DELETE FROM artists WHERE id = ?").run(id);
  return { success: result.changes > 0 };
}

export async function getAllArtists(): Promise<ArtistProfile[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM artists ORDER BY name");
    return rows.map((r) => parseArtist(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM artists ORDER BY name").all() as Record<string, unknown>[];
  return rows.map(parseArtist);
}

// ─── Shows CRUD ─────────────────────────────────────────────────────────────

export async function getAllShows(): Promise<Show[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM shows ORDER BY date ASC");
    return rows.map((r) => parseShow(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM shows ORDER BY date ASC").all() as Record<string, unknown>[];
  return rows.map(parseShow);
}

export async function getShowsByArtist(artistId: string): Promise<Show[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM shows WHERE artist_id = ? ORDER BY date ASC", [artistId]);
    return rows.map((r) => parseShow(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM shows WHERE artist_id = ? ORDER BY date ASC").all(artistId) as Record<string, unknown>[];
  return rows.map(parseShow);
}

export async function getShowById(id: string): Promise<Show | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM shows WHERE id = ?", [id]);
    return row ? parseShow(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM shows WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseShow(row) : null;
}

export async function createShow(data: CreateShowInput): Promise<Show> {
  const id = `show-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const paymentMethods = data.payment_methods ? JSON.stringify(data.payment_methods) : "[]";
  const guestArtists = data.guest_artists ? JSON.stringify(data.guest_artists) : "[]";

  if (USE_TURSO) {
    await tursoExec(
      `INSERT INTO shows (id, artist_id, venue_name, city, country, date, time, price_range, status, ticket_url, payment_methods, postponement_reason, flyer_url, ticket_link, description, guest_artists, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.artist_id,
        data.venue_name,
        data.city || null,
        data.country || null,
        data.date || null,
        data.time || null,
        data.price_range || null,
        data.status || "disponible",
        data.ticket_url || null,
        paymentMethods,
        data.postponement_reason || null,
        data.flyer_url || null,
        data.ticket_link || null,
        data.description || null,
        guestArtists,
        data.notes || null,
        now,
      ]
    );
    const created = await getShowById(id);
    if (!created) throw new Error("Failed to create show");
    return created;
  }

  const db = getLocalDbWrite();
  db.prepare(
    `INSERT INTO shows (id, artist_id, venue_name, city, country, date, time, price_range, status, ticket_url, payment_methods, postponement_reason, flyer_url, ticket_link, description, guest_artists, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.artist_id, data.venue_name, data.city || null, data.country || null, data.date || null, data.time || null, data.price_range || null, data.status || "disponible", data.ticket_url || null, paymentMethods, data.postponement_reason || null, data.flyer_url || null, data.ticket_link || null, data.description || null, guestArtists, data.notes || null, now);
  const created = await getShowById(id);
  if (!created) throw new Error("Failed to create show");
  return created;
}

export async function updateShow(id: string, data: Partial<CreateShowInput>): Promise<Show | null> {
  if (USE_TURSO) {
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (data.venue_name !== undefined) { updates.push("venue_name = ?"); values.push(data.venue_name); }
    if (data.city !== undefined) { updates.push("city = ?"); values.push(data.city || null); }
    if (data.country !== undefined) { updates.push("country = ?"); values.push(data.country || null); }
    if (data.date !== undefined) { updates.push("date = ?"); values.push(data.date || null); }
    if (data.time !== undefined) { updates.push("time = ?"); values.push(data.time || null); }
    if (data.price_range !== undefined) { updates.push("price_range = ?"); values.push(data.price_range || null); }
    if (data.status !== undefined) { updates.push("status = ?"); values.push(data.status); }
    if (data.ticket_url !== undefined) { updates.push("ticket_url = ?"); values.push(data.ticket_url || null); }
    if (data.payment_methods !== undefined) { updates.push("payment_methods = ?"); values.push(JSON.stringify(data.payment_methods)); }
    if (data.postponement_reason !== undefined) { updates.push("postponement_reason = ?"); values.push(data.postponement_reason || null); }
    if (data.flyer_url !== undefined) { updates.push("flyer_url = ?"); values.push(data.flyer_url || null); }
    if (data.ticket_link !== undefined) { updates.push("ticket_link = ?"); values.push(data.ticket_link || null); }
    if (data.description !== undefined) { updates.push("description = ?"); values.push(data.description || null); }
    if (data.guest_artists !== undefined) { updates.push("guest_artists = ?"); values.push(JSON.stringify(data.guest_artists)); }
    if (data.notes !== undefined) { updates.push("notes = ?"); values.push(data.notes || null); }

    // Always update updated_at
    updates.push("updated_at = ?");
    values.push(new Date().toISOString());

    if (updates.length === 1) return getShowById(id); // Only updated_at was added

    values.push(id);
    const rowsAffected = await tursoExecUpdate(`UPDATE shows SET ${updates.join(", ")} WHERE id = ?`, values);
    if (rowsAffected === 0) return null;
    return getShowById(id);
  }

  const db = getLocalDbWrite();
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (data.venue_name !== undefined) { updates.push("venue_name = ?"); values.push(data.venue_name); }
  if (data.city !== undefined) { updates.push("city = ?"); values.push(data.city || null); }
  if (data.country !== undefined) { updates.push("country = ?"); values.push(data.country || null); }
  if (data.date !== undefined) { updates.push("date = ?"); values.push(data.date || null); }
  if (data.time !== undefined) { updates.push("time = ?"); values.push(data.time || null); }
  if (data.price_range !== undefined) { updates.push("price_range = ?"); values.push(data.price_range || null); }
  if (data.status !== undefined) { updates.push("status = ?"); values.push(data.status); }
  if (data.ticket_url !== undefined) { updates.push("ticket_url = ?"); values.push(data.ticket_url || null); }
  if (data.payment_methods !== undefined) { updates.push("payment_methods = ?"); values.push(JSON.stringify(data.payment_methods)); }
  if (data.postponement_reason !== undefined) { updates.push("postponement_reason = ?"); values.push(data.postponement_reason || null); }
  if (data.flyer_url !== undefined) { updates.push("flyer_url = ?"); values.push(data.flyer_url || null); }
  if (data.ticket_link !== undefined) { updates.push("ticket_link = ?"); values.push(data.ticket_link || null); }
  if (data.description !== undefined) { updates.push("description = ?"); values.push(data.description || null); }
  if (data.guest_artists !== undefined) { updates.push("guest_artists = ?"); values.push(JSON.stringify(data.guest_artists)); }
  if (data.notes !== undefined) { updates.push("notes = ?"); values.push(data.notes || null); }

  // Always update updated_at
  updates.push("updated_at = ?");
  values.push(new Date().toISOString());

  if (updates.length === 1) return getShowById(id); // Only updated_at was added

  values.push(id);
  const localResult = db.prepare(`UPDATE shows SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  if (localResult.changes === 0) return null;
  return getShowById(id);
}

export async function deleteShow(id: string): Promise<boolean> {
  if (USE_TURSO) {
    await tursoExec("DELETE FROM shows WHERE id = ?", [id]);
    return true;
  }
  const db = getLocalDbWrite();
  const result = db.prepare("DELETE FROM shows WHERE id = ?").run(id);
  return result.changes > 0;
}

// ─── Tracks CRUD ────────────────────────────────────────────────────────────

export async function getAllTracks(): Promise<Track[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM tracks");
    return rows.map((r) => parseTrack(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM tracks").all() as Record<string, unknown>[];
  return rows.map(parseTrack);
}

export async function getTrackById(id: string): Promise<Track | null> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT * FROM tracks WHERE id = ?", [id]);
    return row ? parseTrack(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM tracks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseTrack(row) : null;
}

export async function getTrackCount(): Promise<number> {
  if (USE_TURSO) {
    const row = await tursoExecSingle("SELECT COUNT(*) as count FROM tracks");
    return row ? Number(row.count) : 0;
  }
  const db = getLocalDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM tracks").get() as { count: number };
  return result.count;
}

export async function getTracksByReleaseType(releaseType: string): Promise<Track[]> {
  if (USE_TURSO) {
    const rows = await tursoExec("SELECT * FROM tracks WHERE release_type = ?", [releaseType]);
    return rows.map((r) => parseTrack(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM tracks WHERE release_type = ?").all(releaseType) as Record<string, unknown>[];
  return rows.map(parseTrack);
}

export async function searchTracks(query: string): Promise<Track[]> {
  const pattern = `%${query}%`;
  if (USE_TURSO) {
    const rows = await tursoExec(
      "SELECT * FROM tracks WHERE title LIKE ? OR artist_name LIKE ? OR release_type LIKE ? OR lyrics LIKE ?",
      [pattern, pattern, pattern, pattern]
    );
    return rows.map((r) => parseTrack(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db
    .prepare("SELECT * FROM tracks WHERE title LIKE ? OR artist_name LIKE ? OR release_type LIKE ? OR lyrics LIKE ?")
    .all(pattern, pattern, pattern, pattern) as Record<string, unknown>[];
  return rows.map(parseTrack);
}

export async function createTrack(data: {
  id: string;
  title: string;
  artist_name?: string;
  release_type?: string;
  release_date?: string;
  duration?: string;
  cover_image?: string;
  audio_preview_url?: string;
  spotify_url?: string | null;
  youtube_video_id?: string | null;
  itunes_track_id?: string | null;
  metrics?: Partial<import("@/types/music").Metrics>;
  production_details?: Partial<import("@/types/music").ProductionDetails>;
  lyrics?: string | null;
  stems_urls?: Partial<import("@/types/music").StemsUrls> | null;
  video_embed_url?: string | null;
  gallery_images?: string[] | null;
  // P2.5: New fields
  external_links?: import("@/types/music").ExternalLinks | null;
  disc_number?: number;
  is_double_single?: boolean;
  sides_b?: string[] | null;
  isrc?: string | null;
  composers?: string[] | null;
}): Promise<Track> {
  const track = {
    id: data.id,
    title: data.title,
    artist_name: data.artist_name || "Artista EPK",
    release_type: data.release_type || "Single",
    release_date: data.release_date || "",
    duration: data.duration || "00:00",
    cover_image: data.cover_image || "",
    audio_preview_url: data.audio_preview_url || "",
    spotify_url: data.spotify_url || null,
    youtube_video_id: data.youtube_video_id || null,
    itunes_track_id: data.itunes_track_id || null,
    metrics: { streams: 0, saves: 0, playlist_additions: 0, top_countries: [], ...data.metrics },
    production_details: { daw: null, guitars: null, effects_chain: null, tuning: null, key: null, ...data.production_details },
    lyrics: data.lyrics || null,
    stems_urls: data.stems_urls || null,
    video_embed_url: data.video_embed_url || null,
    gallery_images: data.gallery_images || null,
    // P2.5: New fields
    external_links: data.external_links || null,
    disc_number: data.disc_number ?? 1,
    is_double_single: data.is_double_single ?? false,
    sides_b: data.sides_b || null,
    isrc: data.isrc || null,
    composers: data.composers || null,
  };

  if (USE_TURSO) {
    await tursoExec(
      `INSERT OR REPLACE INTO tracks (
        id, title, artist_name, release_type, release_date, duration, cover_image,
        audio_preview_url, spotify_url, youtube_video_id, itunes_track_id,
        metrics, production_details, lyrics, stems_urls, video_embed_url, gallery_images,
        external_links, disc_number, is_double_single, sides_b, isrc, composers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        track.id, track.title, track.artist_name, track.release_type, track.release_date,
        track.duration, track.cover_image, track.audio_preview_url, track.spotify_url,
        track.youtube_video_id, track.itunes_track_id, JSON.stringify(track.metrics),
        JSON.stringify(track.production_details), track.lyrics,
        track.stems_urls ? JSON.stringify(track.stems_urls) : null,
        track.video_embed_url,
        track.gallery_images ? JSON.stringify(track.gallery_images) : null,
        track.external_links ? JSON.stringify(track.external_links) : null,
        track.disc_number,
        track.is_double_single ? 1 : 0,
        track.sides_b ? JSON.stringify(track.sides_b) : null,
        track.isrc,
        track.composers ? JSON.stringify(track.composers) : null,
      ]
    );
  } else {
    const db = getLocalDbWrite();
    db.prepare(`
      INSERT OR REPLACE INTO tracks (
        id, title, artist_name, release_type, release_date, duration, cover_image,
        audio_preview_url, spotify_url, youtube_video_id, itunes_track_id,
        metrics, production_details, lyrics, stems_urls, video_embed_url, gallery_images,
        external_links, disc_number, is_double_single, sides_b, isrc, composers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      track.id, track.title, track.artist_name, track.release_type, track.release_date,
      track.duration, track.cover_image, track.audio_preview_url, track.spotify_url,
      track.youtube_video_id, track.itunes_track_id, JSON.stringify(track.metrics),
      JSON.stringify(track.production_details), track.lyrics,
      track.stems_urls ? JSON.stringify(track.stems_urls) : null,
      track.video_embed_url,
      track.gallery_images ? JSON.stringify(track.gallery_images) : null,
      track.external_links ? JSON.stringify(track.external_links) : null,
      track.disc_number,
      track.is_double_single ? 1 : 0,
      track.sides_b ? JSON.stringify(track.sides_b) : null,
      track.isrc,
      track.composers ? JSON.stringify(track.composers) : null
    );
  }

  return track as Track;
}

export async function updateTrack(id: string, updates: Partial<{
  title: string;
  artist_name: string;
  release_type: string;
  release_date: string;
  duration: string;
  cover_image: string;
  audio_preview_url: string;
  spotify_url: string | null;
  youtube_video_id: string | null;
  itunes_track_id: string | null;
  metrics: Partial<import("@/types/music").Metrics>;
  production_details: Partial<import("@/types/music").ProductionDetails>;
  lyrics: string | null;
  stems_urls: Partial<import("@/types/music").StemsUrls> | null;
  video_embed_url: string | null;
  gallery_images: string[] | null;
}>): Promise<Track | null> {
  const existing = await getTrackById(id);
  if (!existing) return null;

  const fields = Object.keys(updates).filter((k) => k !== "id");
  if (fields.length === 0) return existing;

  const setClause = fields.map((k) => `${k} = ?`).join(", ");
  const values = fields.map((k) => {
    const v = (updates as Record<string, unknown>)[k];
    if (typeof v === "object" && v !== null) return JSON.stringify(v);
    return v;
  });

  if (USE_TURSO) {
    await tursoExec(`UPDATE tracks SET ${setClause} WHERE id = ?`, [...values, id]);
  } else {
    const db = getLocalDbWrite();
    db.prepare(`UPDATE tracks SET ${setClause} WHERE id = ?`).run(...values, id);
  }

  return getTrackById(id);
}

export async function deleteTrack(id: string): Promise<boolean> {
  if (USE_TURSO) {
    const result = await tursoExec("DELETE FROM tracks WHERE id = ?", [id]);
    return result.length > 0 || true;
  }
  const db = getLocalDbWrite();
  const result = db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
  return result.changes > 0;
}

// ─── Sync all tables to Turso ───────────────────────────────────────────────

export async function syncAllToTurso(): Promise<Record<string, SyncResult>> {
  const results: Record<string, SyncResult> = {};

  const db = getLocalDb();

  // Tracks
  const tracks = db.prepare("SELECT * FROM tracks").all() as RawTrackRow[];
  const { syncLocalToTurso } = await import("@/lib/turso");
  results.tracks = await syncLocalToTurso(tracks);

  // Artists
  const { syncArtistsToTurso } = await import("@/lib/turso");
  const artistsRows = db.prepare("SELECT * FROM artists").all() as Record<string, unknown>[];
  const artists = artistsRows.map(parseArtist);
  results.artists = await syncArtistsToTurso(artists);

  // Users
  const { syncUsersToTurso } = await import("@/lib/turso");
  const userRows = db.prepare("SELECT * FROM users").all() as Record<string, unknown>[];
  const users = userRows.map(parseUser);
  results.users = await syncUsersToTurso(users);

  // Submissions
  const { syncSubmissionsToTurso } = await import("@/lib/turso");
  const subRows = db.prepare("SELECT * FROM track_submissions").all() as Record<string, unknown>[];
  const submissions = subRows.map(parseTrackSubmission);
  results.submissions = await syncSubmissionsToTurso(submissions);

  // Likes
  const { syncLikesToTurso } = await import("@/lib/turso");
  const likeRows = db.prepare("SELECT * FROM likes").all() as Record<string, unknown>[];
  const likes = likeRows.map(parseLike);
  results.likes = await syncLikesToTurso(likes);

  // Notifications
  const { syncNotificationsToTurso } = await import("@/lib/turso");
  const notifRows = db.prepare("SELECT * FROM notifications").all() as Record<string, unknown>[];
  const notifications = notifRows.map(parseNotification);
  results.notifications = await syncNotificationsToTurso(notifications);

  // Metrics History
  const { syncMetricsHistoryToTurso } = await import("@/lib/turso");
  const metricsRows = db.prepare("SELECT * FROM metrics_history").all() as Record<string, unknown>[];
  const metricsHistory = metricsRows.map(parseMetricsHistory);
  results.metrics_history = await syncMetricsHistoryToTurso(metricsHistory);

  // Shows
  const { syncShowsToTurso } = await import("@/lib/turso");
  const showRows = db.prepare("SELECT * FROM shows").all() as Record<string, unknown>[];
  const shows = showRows.map(parseShow);
  results.shows = await syncShowsToTurso(shows);

  // Subscriptions
  const { syncSubscriptionsToTurso } = await import("@/lib/turso");
  const subscriptionRows = db.prepare("SELECT * FROM subscriptions").all() as Record<string, unknown>[];
  const subscriptions = subscriptionRows.map(parseSubscription);
  results.subscriptions = await syncSubscriptionsToTurso(subscriptions);

  return results;
}

export function isTursoConfigured(): boolean {
  return USE_TURSO;
}

// ─── Exports for direct access (scripts, etc.) ──────────────────────────────

export function getDbWrite() {
  return getLocalDbWrite();
}

export { getTursoClient as getTurso };
