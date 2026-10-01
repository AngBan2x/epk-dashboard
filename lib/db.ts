/**
 * Dual-mode database layer:
 * - When TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are set → @libsql/client (Turso remote)
 * - When not set → better-sqlite3 (local SQLite for development)
 *
 * All exported functions are async to support both backends uniformly.
 */
import path from "path";
import fs from "fs";
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
  ReleaseStatus,
} from "@/types/music";
import { safeString, safeNumber, safeArray, safeParseJSON } from "@/lib/null-safe";
import {
  SEARCH_GROUP_LIMIT,
  hitMatches,
  sortList,
  type SortState,
} from "@/lib/search";

// ─── Environment detection ──────────────────────────────────────────────────
// NOTE: process.env is evaluated at build time by Webpack. Use a getter function
// so it's evaluated at runtime instead. This ensures isTursoEnabled() is true on Vercel.

export function getTursoUrl(): string | undefined {
  return process.env.TURSO_DATABASE_URL;
}
export function getTursoToken(): string | undefined {
  return process.env.TURSO_AUTH_TOKEN;
}
export function isTursoEnabled(): boolean {
  return Boolean(getTursoUrl() && getTursoToken());
}

// ─── Better-sqlite3 (local) ─────────────────────────────────────────────────

let _db: import("better-sqlite3").Database | null = null;
let _dbWrite: import("better-sqlite3").Database | null = null;

export function getLocalDb(): import("better-sqlite3").Database {
  if (!_db) {
    // Dynamic import to avoid crash when better-sqlite3 is not available (e.g., edge runtime)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");
    _db = new Database(DB_PATH, { readonly: true });
  }
  return _db;
}

export function getLocalDbWrite(): import("better-sqlite3").Database {
  if (!_dbWrite) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _dbWrite = new Database(DB_PATH);
  }
  return _dbWrite;
}

// ─── Turso client (remote) ──────────────────────────────────────────────────
// Fresh client per request. No singleton caching. Each call creates a new
// @libsql/client instance with independent HTTP connection pool.

// ─── Turso: Lazy schema initialization ─────────────────────────────────────
// Ensures all tables exist in Turso before first write. Called once, then cached.

let _tursoSchemaEnsured = false;
let _tursoSchemaPromise: Promise<void> | null = null;

async function ensureTursoSchemaIfNeeded(): Promise<void> {
  if (_tursoSchemaEnsured) return;
  if (!isTursoEnabled()) return;
  // Deduplicate concurrent calls
  if (_tursoSchemaPromise) return _tursoSchemaPromise;
  _tursoSchemaPromise = (async () => {
    try {
      const { ensureTursoSchema } = await import("./turso");
      await ensureTursoSchema();
      _tursoSchemaEnsured = true;
    } catch (err) {
      console.error("[lib/db] Failed to ensure Turso schema:", err);
      _tursoSchemaPromise = null; // retry next time
    }
  })();
  return _tursoSchemaPromise;
}

// ─── Turso: Execute helper ──────────────────────────────────────────────────
// NOTE: The @libsql/client HTTP transport caches query results by exact SQL
// string. Stale cached reads cause UPDATE writes to appear not to persist.
// Fix: append a unique counter to SELECT queries to bust the cache.

let _tursoQueryCounter = 0;

export function bustSelectCache(sql: string): string {
  if (sql.trimStart().toUpperCase().startsWith("SELECT")) {
    return `${sql} /*q${_tursoQueryCounter++}*/`;
  }
  return sql;
}

export async function tursoExec(sql: string, args?: unknown[]): Promise<unknown[]> {
  const client = getTursoClientSync();
  if (!client) throw new Error("Turso client not available");
  try {
    const result = await client.execute({ sql: bustSelectCache(sql), args: (args ?? []) as import("@libsql/client").InValue[] });
    return result.rows as unknown[];
  } catch (err) {
    throw err;
  }
}

export async function tursoExecSingle(sql: string, args?: unknown[]): Promise<Record<string, unknown> | undefined> {
  const rows = await tursoExec(sql, args);
  return rows[0] as Record<string, unknown> | undefined;
}

export async function tursoExecUpdate(sql: string, args?: unknown[]): Promise<number> {
  const client = getTursoClientSync();
  if (!client) throw new Error("Turso client not available");
  try {
    const result = await client.execute({ sql, args: (args ?? []) as import("@libsql/client").InValue[] });
    return result.rowsAffected;
  } catch (err) {
    throw err;
  }
}

export function getTursoClientSync(): import("@libsql/client").Client | null {
  if (!isTursoEnabled()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("@libsql/client");
  return createClient({ url: getTursoUrl()!, authToken: getTursoToken()! });
}

// ─── Initialize tables (local only; Turso schema via ensureTursoSchema) ─────
// NOTE: Always runs (IF NOT EXISTS is idempotent). The isTursoEnabled() check
// happens at call-time in read/write functions, not at module-load time.

function initLocalTables(): void {

  const db = getLocalDbWrite();

  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist_name TEXT,
      release_type TEXT,
      release_date TEXT,
      duration TEXT,
      cover_image TEXT,
      audio_preview_url TEXT,
      spotify_url TEXT,
      youtube_video_id TEXT,
      metrics TEXT,
      production_details TEXT,
      lyrics TEXT,
      itunes_track_id TEXT,
      stems_urls TEXT,
      video_embed_url TEXT,
      gallery_images TEXT,
      external_links TEXT,
      disc_number INTEGER DEFAULT 1,
      track_number INTEGER,
      is_double_single INTEGER DEFAULT 0,
      sides_b TEXT,
      isrc TEXT,
      composers TEXT,
      genre TEXT,
      description TEXT,
      streams INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      updated_at TEXT,
      release_id TEXT,
      start_time REAL DEFAULT 0,
      end_time REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  // M0: safe ALTER TABLE for pre-existing local DBs (idempotent via try/catch)
  try { db.exec(`ALTER TABLE tracks ADD COLUMN track_number INTEGER`); } catch {}

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
      approved INTEGER DEFAULT 0,
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
  // D1: Add approved column for show approval workflow
  try { db.exec(`ALTER TABLE shows ADD COLUMN approved INTEGER DEFAULT 0`); } catch {}

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
  try { db.exec(`ALTER TABLE tracks ADD COLUMN is_instrumental INTEGER DEFAULT 0`); } catch {}
  // Streams counter column (for play tracking)
  try { db.exec(`ALTER TABLE tracks ADD COLUMN streams INTEGER DEFAULT 0`); } catch {}
  // Release approval workflow
  try { db.exec(`ALTER TABLE tracks ADD COLUMN status TEXT DEFAULT 'draft'`); } catch {}
  try { db.exec(`ALTER TABLE tracks ADD COLUMN updated_at TEXT`); } catch {}
  // Release form fields
  try { db.exec(`ALTER TABLE tracks ADD COLUMN genre TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tracks ADD COLUMN description TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tracks ADD COLUMN admin_notes TEXT`); } catch {}

  // P2.6: Add new columns to track_submissions (safe ALTER TABLE)
  try { db.exec(`ALTER TABLE track_submissions ADD COLUMN submission_type TEXT DEFAULT 'track'`); } catch {}
  try { db.exec(`ALTER TABLE track_submissions ADD COLUMN metadata TEXT`); } catch {}
  try { db.exec(`ALTER TABLE track_submissions ADD COLUMN admin_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE track_submissions ADD COLUMN reviewed_at TEXT`); } catch {}

  // Dossiers table (artist profiles + rider)
  db.exec(`
    CREATE TABLE IF NOT EXISTS dossiers (
      id TEXT PRIMARY KEY,
      artist_id TEXT NOT NULL UNIQUE,
      biography TEXT,
      press_text TEXT,
      genre TEXT,
      location TEXT,
      influences TEXT,
      contact_email TEXT,
      booking_email TEXT,
      management TEXT,
      website TEXT,
      rider_pa_system TEXT DEFAULT 'Line Array — 2x JBL VTX A12 por lado',
      rider_monitors TEXT DEFAULT '2x wedge por músico (Shure PSM300)',
      rider_console TEXT DEFAULT 'Yamaha CL5 o Allen & Heath dLive',
      rider_subwoofers TEXT DEFAULT '4x JBL VTX S28',
      rider_guitar TEXT DEFAULT 'Fender Twin Reverb o Marshall JCM800',
      rider_bass TEXT DEFAULT 'Ampeg SVT-CL + 8x10 cab',
      rider_drums TEXT DEFAULT 'Pearl Reference — platillos Zildjian A Custom',
      rider_keyboards TEXT DEFAULT 'Nord Stage 4 88',
      rider_lighting TEXT DEFAULT 'Mínimo 8 cabezales moving head + LED bars',
      rider_stage_size TEXT DEFAULT 'Mínimo 8x6 metros',
      rider_stage_conditions TEXT DEFAULT 'Piso seco, sin pendiente, protección del viento',
      rider_hospitality TEXT DEFAULT '2 habitaciones privadas, catering vegano disponible',
      rider_transport TEXT DEFAULT 'Furgoneta para equipo + transporte artista',
      rider_special_notes TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (artist_id) REFERENCES artists(id)
    )
  `);
  try { db.exec(`ALTER TABLE dossiers ADD COLUMN genre TEXT`); } catch {}
  try { db.exec(`ALTER TABLE dossiers ADD COLUMN description TEXT`); } catch {}
}

// Initialize local tables on module load.
// Always runs — uses CREATE TABLE IF NOT EXISTS (idempotent).
// In production with Turso active, the local file is harmless (never read).
try {
  initLocalTables();
} catch {
  // Ignore errors on serverless environments where local SQLite isn't needed
}

// ─── Parsers ────────────────────────────────────────────────────────────────

function parseUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    password_hash: String(row.password_hash),
    role: String(row.role) as "admin" | "artist" | "subscriber",
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

const NOTIFICATIONS_CREATED_AT_SORT =
  "julianday(replace(created_at, 'T', ' ')) DESC, created_at DESC";

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

export function parseMetrics(raw: string | Record<string, unknown> | null): Metrics {
  const fallback: Metrics = { streams: 0, saves: 0, playlist_additions: 0, top_countries: [] };
  if (!raw) return fallback;

  const parsed = typeof raw === 'string' ? safeParseJSON<Record<string, unknown> | null>(raw, null) : raw;
  if (!parsed || typeof parsed !== 'object') return fallback;

  return {
    streams: safeNumber(parsed.streams),
    saves: safeNumber(parsed.saves),
    playlist_additions: safeNumber(parsed.playlist_additions),
    top_countries: safeArray<{ country: string; pct: number }>(parsed.top_countries),
  };
}

function parseProductionDetails(raw: string | null): ProductionDetails {
  const fallback: ProductionDetails = {
    daw: null,
    guitars: null,
    effects_chain: null,
    tuning: null,
    key: null,
    genre: null,
    sub_genre: null,
    bpm: null,
    mood: null,
    recording_date: null,
    production_credits: null,
  };
  if (!raw) return fallback;

  const parsed = safeParseJSON<Record<string, unknown> | null>(raw, null);
  if (!parsed) return fallback;

  return {
    daw: typeof parsed.daw === "string" ? parsed.daw : null,
    guitars: typeof parsed.guitars === "string" ? parsed.guitars : null,
    effects_chain: typeof parsed.effects_chain === "string" ? parsed.effects_chain : null,
    tuning: typeof parsed.tuning === "string" ? parsed.tuning : null,
    key: typeof parsed.key === "string" ? parsed.key : null,
    genre: typeof parsed.genre === "string" ? parsed.genre : null,
    sub_genre: typeof parsed.sub_genre === "string" ? parsed.sub_genre : null,
    bpm: typeof parsed.bpm === "number" ? parsed.bpm : null,
    mood: typeof parsed.mood === "string" ? parsed.mood : null,
    recording_date: typeof parsed.recording_date === "string" ? parsed.recording_date : null,
    production_credits: typeof parsed.production_credits === "string" ? parsed.production_credits : null,
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
    // Release approval workflow
    status: (row.status as ReleaseStatus) ?? "draft",
    itunes_track_id: (row.itunes_track_id as string) ?? null,
    stems_urls: parseStemsUrls((row.stems_urls as string) ?? null),
    video_embed_url: (row.video_embed_url as string) ?? null,
    gallery_images: parseGalleryImages((row.gallery_images as string) ?? null),
    // P2.5: New fields
    external_links: safeParseJSON<ExternalLinks | null>((row.external_links as string) ?? null, null),
    disc_number: row.disc_number ? Number(row.disc_number) : undefined,
    // M0: explicit track number within its disc (null = unnumbered)
    track_number: row.track_number != null ? Number(row.track_number) : undefined,
    is_double_single: row.is_double_single ? Number(row.is_double_single) === 1 : undefined,
    sides_b: safeParseJSON<string[] | null>((row.sides_b as string) ?? null, null),
    isrc: (row.isrc as string) ?? null,
    composers: safeParseJSON<string[] | null>((row.composers as string) ?? null, null),
    // Streams counter
    streams: row.streams != null ? Number(row.streams) : 0,
    // P3 Batch 2: Multi-track releases + YouTube timestamps
    release_id: (row.release_id as string) ?? null,
    start_time: row.start_time != null ? Number(row.start_time) : 0,
    end_time: row.end_time != null ? Number(row.end_time) : 0,
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
    approved: Number(row.approved) === 1,
    deleted_at: (row.deleted_at as string) ?? null,
    updated_at: (row.updated_at as string) ?? null,
    created_at: String(row.created_at),
  };
}

// ─── Users CRUD ─────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string): Promise<User | null> {
  if (isTursoEnabled()) {
    await ensureTursoSchemaIfNeeded();
    const row = await tursoExecSingle("SELECT * FROM users WHERE email = ?", [email]);
    return row ? parseUser(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as Record<string, unknown> | undefined;
  return row !== undefined ? parseUser(row) : null;
}

export async function getUserById(id: string): Promise<User | null> {
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT * FROM users WHERE id = ?", [id]);
    return row ? parseUser(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseUser(row) : null;
}

export async function getAllUsers(): Promise<User[]> {
  if (isTursoEnabled()) {
    await ensureTursoSchemaIfNeeded();
    const rows = await tursoExec("SELECT * FROM users ORDER BY created_at ASC");
    return rows.map((r) => parseUser(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at ASC").all() as Record<string, unknown>[];
  return rows.map(parseUser);
}

export async function isEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
  if (isTursoEnabled()) {
    await ensureTursoSchemaIfNeeded();
    const row = await tursoExecSingle(
      "SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1",
      [email, excludeUserId ?? ""]
    );
    return row !== null;
  }
  const db = getLocalDb();
  const row = db
    .prepare("SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1")
    .get(email, excludeUserId ?? "") as Record<string, unknown> | undefined;
  return row !== undefined;
}

export async function getPasswordHash(userId: string): Promise<string | null> {
  if (isTursoEnabled()) {
    await ensureTursoSchemaIfNeeded();
    const row = await tursoExecSingle("SELECT password_hash FROM users WHERE id = ?", [userId]);
    return row ? String((row as Record<string, unknown>).password_hash) : null;
  }
  const db = getLocalDb();
  const row = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(userId) as Record<string, unknown> | undefined;
  return row !== undefined ? String(row.password_hash) : null;
}

export async function updateUserEmail(userId: string, email: string): Promise<boolean> {
  if (isTursoEnabled()) {
    await ensureTursoSchemaIfNeeded();
    await tursoExecUpdate("UPDATE users SET email = ? WHERE id = ?", [email, userId]);
    return true;
  }
  const db = getLocalDbWrite();
  db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, userId);
  return true;
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<boolean> {
  if (isTursoEnabled()) {
    await ensureTursoSchemaIfNeeded();
    await tursoExecUpdate("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
    return true;
  }
  const db = getLocalDbWrite();
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
  return true;
}

export async function softDeleteUser(userId: string): Promise<boolean> {
  const deletedAt = new Date().toISOString();
  if (isTursoEnabled()) {
    await ensureTursoSchemaIfNeeded();
    await tursoExecUpdate("UPDATE users SET deleted_at = ? WHERE id = ?", [deletedAt, userId]);
    return true;
  }
  const db = getLocalDbWrite();
  db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").run(deletedAt, userId);
  return true;
}

export async function restoreUser(userId: string): Promise<boolean> {
  if (isTursoEnabled()) {
    await ensureTursoSchemaIfNeeded();
    await tursoExecUpdate("UPDATE users SET deleted_at = NULL WHERE id = ?", [userId]);
    return true;
  }
  const db = getLocalDbWrite();
  db.prepare("UPDATE users SET deleted_at = NULL WHERE id = ?").run(userId);
  return true;
}

export async function getSoftDeletedUserByEmail(email: string): Promise<User | null> {
  if (isTursoEnabled()) {
    await ensureTursoSchemaIfNeeded();
    const row = await tursoExecSingle("SELECT * FROM users WHERE email = ? AND deleted_at IS NOT NULL", [email]);
    return row ? parseUser(row) : null;
  }
  const db = getLocalDb();
  const row = db
    .prepare("SELECT * FROM users WHERE email = ? AND deleted_at IS NOT NULL")
    .get(email) as Record<string, unknown> | undefined;
  return row !== undefined ? parseUser(row) : null;
}

export async function purgeExpiredDeletedUsers(graceDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000).toISOString();
  const stale = await getAllUsers();
  const expired = stale.filter(
    (u) => u.deleted_at !== null && new Date(u.deleted_at as unknown as string).getTime() < new Date(cutoff).getTime()
  );
  let purged = 0;
  for (const user of expired) {
    const ok = await deleteUser(user.id);
    if (ok) purged++;
  }
  return purged;
}

export async function createUser(user: Omit<User, "id" | "created_at"> & { id: string }): Promise<User> {
  if (isTursoEnabled()) {
    await ensureTursoSchemaIfNeeded();
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
  if (isTursoEnabled()) {
    // Delete related data first
    await tursoExec("DELETE FROM likes WHERE user_id = ?", [userId]);
    await tursoExec("DELETE FROM notifications WHERE user_id = ?", [userId]);
    await tursoExec("DELETE FROM track_submissions WHERE user_id = ?", [userId]);
    await tursoExec("DELETE FROM subscriptions WHERE subscriber_id = ?", [userId]);
    // Delete artist profile if exists
    const artist = await getArtistByUserId(userId);
    if (artist) {
      await tursoExec("DELETE FROM subscriptions WHERE artist_id = ?", [artist.id]);
      await tursoExec("DELETE FROM dossiers WHERE artist_id = ?", [artist.id]);
      await tursoExec("DELETE FROM shows WHERE artist_id = ?", [artist.id]);
      await deleteTracksByArtistName(artist.name, true);
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
  db.prepare("DELETE FROM subscriptions WHERE subscriber_id = ?").run(userId);
  // Delete artist profile if exists
  const artist = await getArtistByUserId(userId);
  if (artist) {
    db.prepare("DELETE FROM subscriptions WHERE artist_id = ?").run(artist.id);
    db.prepare("DELETE FROM dossiers WHERE artist_id = ?").run(artist.id);
    db.prepare("DELETE FROM shows WHERE artist_id = ?").run(artist.id);
    await deleteTracksByArtistName(artist.name, false);
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
  if (isTursoEnabled()) {
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
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT * FROM track_submissions WHERE id = ?", [id]);
    return row ? parseTrackSubmission(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM track_submissions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseTrackSubmission(row) : null;
}

export async function getTrackSubmissionsByUser(userId: string): Promise<TrackSubmission[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM track_submissions WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    return rows.map((r) => parseTrackSubmission(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM track_submissions WHERE user_id = ? ORDER BY created_at DESC").all(userId) as Record<string, unknown>[];
  return rows.map(parseTrackSubmission);
}

export async function getAllTrackSubmissions(): Promise<TrackSubmission[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM track_submissions ORDER BY created_at DESC");
    return rows.map((r) => parseTrackSubmission(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM track_submissions ORDER BY created_at DESC").all() as Record<string, unknown>[];
  return rows.map(parseTrackSubmission);
}

export async function getTrackSubmissionsByStatus(status: SubmissionStatus): Promise<TrackSubmission[]> {
  if (isTursoEnabled()) {
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
  if (isTursoEnabled()) {
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
  if (isTursoEnabled()) {
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
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT * FROM subscriptions WHERE id = ?", [id]);
    return row ? parseSubscription(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseSubscription(row) : null;
}

export async function getSubscriptionByUserAndArtist(subscriberId: string, artistId: string): Promise<Subscription | null> {
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT * FROM subscriptions WHERE subscriber_id = ? AND artist_id = ?", [subscriberId, artistId]);
    return row ? parseSubscription(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM subscriptions WHERE subscriber_id = ? AND artist_id = ?").get(subscriberId, artistId) as Record<string, unknown> | undefined;
  return row !== undefined ? parseSubscription(row) : null;
}

export async function getSubscriptionsBySubscriber(subscriberId: string): Promise<Subscription[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM subscriptions WHERE subscriber_id = ? ORDER BY created_at DESC", [subscriberId]);
    return rows.map((r) => parseSubscription(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM subscriptions WHERE subscriber_id = ? ORDER BY created_at DESC").all(subscriberId) as Record<string, unknown>[];
  return rows.map(parseSubscription);
}

export async function getSubscriptionsByArtist(artistId: string): Promise<Subscription[]> {
  if (isTursoEnabled()) {
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

  if (isTursoEnabled()) {
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
  if (isTursoEnabled()) {
    await tursoExec("DELETE FROM subscriptions WHERE id = ?", [id]);
    return true;
  }
  const db = getLocalDbWrite();
  const result = db.prepare("DELETE FROM subscriptions WHERE id = ?").run(id);
  return result.changes > 0;
}

export async function getSubscriberCount(artistId: string): Promise<number> {
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT COUNT(*) as c FROM subscriptions WHERE artist_id = ?", [artistId]);
    return row ? Number(row.c) : 0;
  }
  const db = getLocalDb();
  const result = db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE artist_id = ?").get(artistId) as { c: number } | undefined;
  return result?.c ?? 0;
}

// ─── Likes CRUD ─────────────────────────────────────────────────────────────

export async function toggleLike(userId: string, trackId: string): Promise<{ liked: boolean; count: number }> {
  if (isTursoEnabled()) {
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
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT COUNT(*) as count FROM likes WHERE track_id = ?", [trackId]);
    return row ? Number(row.count) : 0;
  }
  const db = getLocalDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM likes WHERE track_id = ?").get(trackId) as { count: number };
  return result.count;
}

export async function getTotalLikesForTracks(trackIds: string[]): Promise<number> {
  const ids = Array.from(new Set(trackIds.filter(Boolean)));
  if (ids.length === 0) return 0;

  if (isTursoEnabled()) {
    await ensureTursoSchemaIfNeeded();
    const placeholders = ids.map(() => "?").join(", ");
    const row = await tursoExecSingle(
      `SELECT COUNT(*) as count FROM likes WHERE track_id IN (${placeholders})`,
      ids
    );
    return row ? Number(row.count) : 0;
  }

  const db = getLocalDb();
  const placeholders = ids.map(() => "?").join(", ");
  const result = db
    .prepare(`SELECT COUNT(*) as count FROM likes WHERE track_id IN (${placeholders})`)
    .get(...ids) as { count: number };
  return result.count;
}

export async function getUserLikes(userId: string): Promise<Like[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM likes WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    return rows.map((r) => parseLike(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM likes WHERE user_id = ? ORDER BY created_at DESC").all(userId) as Record<string, unknown>[];
  return rows.map(parseLike);
}

export async function hasUserLikedTrack(userId: string, trackId: string): Promise<boolean> {
  if (isTursoEnabled()) {
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
  const now = new Date().toISOString();
  if (isTursoEnabled()) {
    await tursoExec(
      "INSERT INTO notifications (id, user_id, type, title, message, data, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        notification.id,
        notification.user_id,
        notification.type,
        notification.title,
        notification.message,
        notification.data,
        notification.read ? 1 : 0,
        now,
      ]
    );
    const created = await getNotificationById(notification.id);
    if (!created) throw new Error("Failed to create notification");
    return created;
  }
  const db = getLocalDbWrite();
  db.prepare(
    "INSERT INTO notifications (id, user_id, type, title, message, data, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    notification.id,
    notification.user_id,
    notification.type,
    notification.title,
    notification.message,
    notification.data,
    notification.read ? 1 : 0,
    now
  );
  const created = await getNotificationById(notification.id);
  if (!created) throw new Error("Failed to create notification");
  return created;
}

export async function getNotificationById(id: string): Promise<Notification | null> {
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT * FROM notifications WHERE id = ?", [id]);
    return row ? parseNotification(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseNotification(row) : null;
}

export async function getUserNotifications(userId: string, unreadOnly = false): Promise<Notification[]> {
  if (isTursoEnabled()) {
    let query = "SELECT * FROM notifications WHERE user_id = ?";
    const args: unknown[] = [userId];
    if (unreadOnly) {
      query += " AND read = 0";
    }
    query += " ORDER BY " + NOTIFICATIONS_CREATED_AT_SORT;
    const rows = await tursoExec(query, args);
    return rows.map((r) => parseNotification(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  let query = "SELECT * FROM notifications WHERE user_id = ?";
  if (unreadOnly) {
    query += " AND read = 0";
  }
  query += " ORDER BY " + NOTIFICATIONS_CREATED_AT_SORT;
  const rows = db.prepare(query).all(userId) as Record<string, unknown>[];
  return rows.map(parseNotification);
}

export async function getAllNotifications(): Promise<Notification[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM notifications ORDER BY created_at DESC");
    return rows.map((r) => parseNotification(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM notifications ORDER BY created_at DESC").all() as Record<string, unknown>[];
  return rows.map(parseNotification);
}

export async function markNotificationAsRead(id: string): Promise<Notification | null> {
  if (isTursoEnabled()) {
    await tursoExec("UPDATE notifications SET read = 1 WHERE id = ?", [id]);
    return getNotificationById(id);
  }
  const db = getLocalDbWrite();
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(id);
  return getNotificationById(id);
}

export async function setNotificationRead(id: string, read: boolean): Promise<Notification | null> {
  const flag = read ? 1 : 0;
  if (isTursoEnabled()) {
    await tursoExec("UPDATE notifications SET read = ? WHERE id = ?", [flag, id]);
    return getNotificationById(id);
  }
  const db = getLocalDbWrite();
  db.prepare("UPDATE notifications SET read = ? WHERE id = ?").run(flag, id);
  return getNotificationById(id);
}

export async function updateUserPreferences(
  userId: string,
  preferences: UserPreferences
): Promise<UserPreferences | null> {
  const payload = JSON.stringify(preferences);
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("UPDATE users SET preferences = ? WHERE id = ? RETURNING preferences", [
      payload,
      userId,
    ]);
    if (!row) return null;
    return safeParseJSON<UserPreferences>(String(row.preferences ?? ""), preferences);
  }
  const db = getLocalDbWrite();
  const result = db.prepare("UPDATE users SET preferences = ? WHERE id = ?").run(payload, userId);
  if (result.changes === 0) return null;
  const row = db.prepare("SELECT preferences FROM users WHERE id = ?").get(userId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return safeParseJSON<UserPreferences>((row.preferences as string) ?? null, preferences);
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  if (isTursoEnabled()) {
    await tursoExec("UPDATE notifications SET read = 1 WHERE user_id = ?", [userId]);
    return;
  }
  const db = getLocalDbWrite();
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(userId);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  if (isTursoEnabled()) {
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
  if (isTursoEnabled()) {
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
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT * FROM metrics_history WHERE id = ?", [id]);
    return row ? parseMetricsHistory(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM metrics_history WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseMetricsHistory(row) : null;
}

export async function getMetricsHistoryByTrack(trackId: string): Promise<MetricsHistory[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM metrics_history WHERE track_id = ? ORDER BY date DESC", [trackId]);
    return rows.map((r) => parseMetricsHistory(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM metrics_history WHERE track_id = ? ORDER BY date DESC").all(trackId) as Record<string, unknown>[];
  return rows.map(parseMetricsHistory);
}

export async function getMetricsHistoryByTrackAndDate(trackId: string, date: string): Promise<MetricsHistory | null> {
  if (isTursoEnabled()) {
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
  if (isTursoEnabled()) {
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
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT * FROM artists WHERE name = ?", [name]);
    return row ? parseArtist(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM artists WHERE name = ?").get(name) as Record<string, unknown> | undefined;
  return row ? parseArtist(row) : null;
}

export async function getArtistByUserId(userId: string): Promise<ArtistProfile | null> {
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT * FROM artists WHERE user_id = ?", [userId]);
    return row ? parseArtist(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM artists WHERE user_id = ?").get(userId) as Record<string, unknown> | undefined;
  return row ? parseArtist(row) : null;
}

export async function getArtistById(id: string): Promise<ArtistProfile | null> {
  if (isTursoEnabled()) {
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

  if (isTursoEnabled()) {
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
  const monthlyListeners = data.monthly_listeners as number | undefined;
  const userId = (data.userId ?? data.user_id) as string | undefined;
  const socialLinks = (data.socialLinks ?? data.social_links) as SocialLink[] | undefined;
  const profileImage = (data.profileImage ?? data.profile_image) as string | undefined;
  const bannerImage = (data.bannerImage ?? data.banner_image) as string | undefined;
  const slug = data.slug as string | undefined;
  const isActive = (data.isActive ?? data.is_active) as boolean | undefined;

  if (isTursoEnabled()) {
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
    if (rowsAffected === 0) {
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
  if (localResult.changes === 0) return null;
  return getArtistById(id);
}

async function deleteTracksByArtistName(artistName: string, isTurso: boolean): Promise<void> {
  if (isTurso) {
    await tursoExec("DELETE FROM metrics_history WHERE track_id IN (SELECT id FROM tracks WHERE artist_name = ?)", [artistName]);
    await tursoExec("DELETE FROM likes WHERE track_id IN (SELECT id FROM tracks WHERE artist_name = ?)", [artistName]);
    await tursoExec("DELETE FROM tracks WHERE artist_name = ?", [artistName]);
  } else {
    const db = getLocalDbWrite();
    db.prepare("DELETE FROM metrics_history WHERE track_id IN (SELECT id FROM tracks WHERE artist_name = ?)").run(artistName);
    db.prepare("DELETE FROM likes WHERE track_id IN (SELECT id FROM tracks WHERE artist_name = ?)").run(artistName);
    db.prepare("DELETE FROM tracks WHERE artist_name = ?").run(artistName);
  }
}

export async function deleteArtist(id: string): Promise<{ success: boolean }> {
  if (isTursoEnabled()) {
    const artist = await getArtistById(id);
    if (!artist) return { success: false };

    await tursoExec("DELETE FROM subscriptions WHERE artist_id = ?", [id]);
    await tursoExec("DELETE FROM dossiers WHERE artist_id = ?", [id]);
    await tursoExec("DELETE FROM notifications WHERE user_id = (SELECT user_id FROM artists WHERE id = ?)", [id]);
    await tursoExec("DELETE FROM shows WHERE artist_id = ?", [id]);
    await deleteTracksByArtistName(artist.name, true);
    const rowsAffected = await tursoExecUpdate("DELETE FROM artists WHERE id = ?", [id]);
    return { success: rowsAffected > 0 };
  }
  const db = getLocalDbWrite();
  const artist = await getArtistById(id);
  if (!artist) return { success: false };

  db.prepare("DELETE FROM subscriptions WHERE artist_id = ?").run(id);
  db.prepare("DELETE FROM dossiers WHERE artist_id = ?").run(id);
  db.prepare("DELETE FROM notifications WHERE user_id = (SELECT user_id FROM artists WHERE id = ?)").run(id);
  db.prepare("DELETE FROM shows WHERE artist_id = ?").run(id);
  await deleteTracksByArtistName(artist.name, false);
  const result = db.prepare("DELETE FROM artists WHERE id = ?").run(id);
  return { success: result.changes > 0 };
}

export async function getAllArtists(): Promise<ArtistProfile[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM artists ORDER BY name");
    return rows.map((r) => parseArtist(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM artists ORDER BY name").all() as Record<string, unknown>[];
  return rows.map(parseArtist);
}

// ─── Shows CRUD ─────────────────────────────────────────────────────────────

/**
 * Lector de shows APROBADOS y no borrados lógicamente: el que puede leer un
 * visitante anónimo.
 *
 * Es el mismo agujero que S0/P4 tenía en `tracks`. `POST /api/shows:144` crea
 * SIEMPRE con `approved = 0` para un artista (`session.role === "admin" &&
 * validated.approved === true`), así que un show recién enviado es un borrador
 * — y `/shows` no está en el `matcher` de `middleware.ts`, luego la página es
 * pública. Con este lector, un show sin aprobar nunca llega al catálogo.
 *
 * OJO — `getAllShows()` (abajo) NO se puede reutilizar aquí: `scripts/qa-cleanup.ts`
 * la usa para enumerar los shows QA de producción **incluidos los no
 * aprobados**, y `tests/unit/shows.test.ts:254` crea shows con `approved = 0` y
 * espera recuperarlos. Por eso son dos funciones y no una con un flag.
 */
export async function getApprovedShows(): Promise<Show[]> {
  const sql =
    "SELECT * FROM shows WHERE approved = 1 AND deleted_at IS NULL ORDER BY date ASC";
  if (isTursoEnabled()) {
    const rows = await tursoExec(sql);
    return rows.map((r) => parseShow(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare(sql).all() as Record<string, unknown>[];
  return rows.map(parseShow);
}

/**
 * @deprecated Lector de MODERACIÓN, no de catálogo. Devuelve también los shows
 * `approved = 0` y los `deleted_at` con fecha, que es justo lo que un
 * visitante no debe ver. Consumidores actuales: `lib/artist-promotion.ts`
 * (busca shows aprobados) y `scripts/qa-cleanup.ts` (limpia los QA sin
 * aprobar). Las rutas públicas y las páginas deben usar `getApprovedShows()`.
 *
 * No se le cambió la semántica a propósito: hacerlo rompe los dos consumidores
 * de arriba, que la necesitan así.
 */
export async function getAllShows(): Promise<Show[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM shows ORDER BY date ASC");
    return rows.map((r) => parseShow(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM shows ORDER BY date ASC").all() as Record<string, unknown>[];
  return rows.map(parseShow);
}

export async function getShowsByArtist(artistId: string): Promise<Show[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM shows WHERE artist_id = ? ORDER BY date ASC", [artistId]);
    return rows.map((r) => parseShow(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM shows WHERE artist_id = ? ORDER BY date ASC").all(artistId) as Record<string, unknown>[];
  return rows.map(parseShow);
}

export async function getShowsByArtists(artistIds: string[]): Promise<Show[]> {
  if (artistIds.length === 0) return [];
  if (isTursoEnabled()) {
    const placeholders = artistIds.map(() => "?").join(", ");
    const rows = await tursoExec(`SELECT * FROM shows WHERE artist_id IN (${placeholders}) ORDER BY date ASC`, artistIds);
    return rows.map((r) => parseShow(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const placeholders = artistIds.map(() => "?").join(", ");
  const rows = db.prepare(`SELECT * FROM shows WHERE artist_id IN (${placeholders}) ORDER BY date ASC`).all(...artistIds) as Record<string, unknown>[];
  return rows.map(parseShow);
}

export async function getShowById(id: string): Promise<Show | null> {
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT * FROM shows WHERE id = ?", [id]);
    return row ? parseShow(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM shows WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseShow(row) : null;
}

/** Show por id, restringido a `approved = 1` y sin borrado lógico. Ver `getApprovedShows()`. */
export async function getApprovedShowById(id: string): Promise<Show | null> {
  const sql = "SELECT * FROM shows WHERE id = ? AND approved = 1 AND deleted_at IS NULL";
  if (isTursoEnabled()) {
    const row = await tursoExecSingle(sql, [id]);
    return row ? parseShow(row) : null;
  }
  const db = getLocalDb();
  const row = db.prepare(sql).get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseShow(row) : null;
}

/** Shows aprobados de un artista. Espejo público de `getShowsByArtist()`. */
export async function getApprovedShowsByArtist(artistId: string): Promise<Show[]> {
  const sql =
    "SELECT * FROM shows WHERE artist_id = ? AND approved = 1 AND deleted_at IS NULL ORDER BY date ASC";
  if (isTursoEnabled()) {
    const rows = await tursoExec(sql, [artistId]);
    return rows.map((r) => parseShow(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare(sql).all(artistId) as Record<string, unknown>[];
  return rows.map(parseShow);
}

/**
 * LectorMultiple para las vistas que agrupan por artista.
 *
 * PENDIENTE (fuera de mi ownership, reportado al orquestador):
 * `app/api/dashboard/route.ts:46-52` construye `showsByArtist` con
 * `getShowsByArtists()`, que NO filtra, y lo devuelve tal cual **incluso a
 * visitantes anónimos** (la rama `if (!session)` de `:54-67`). Es la MISMA
 * fuga que P12b por otra puerta: un show recién enviado por un artista es
 * legible sin sesión desde `/api/dashboard`.
 *
 * El arreglo es una línea en esa ruta — cambiar `getShowsByArtists` por
 * `getApprovedShowsByArtists` y dejar el show propio del artista como está
 * (`:78`), igual que se hace con los tracks en `:40-42`:
 *
 *   const allShows = await (isAdmin
 *     ? getShowsByArtists(ids)
 *     : getApprovedShowsByArtists(ids));
 *
 * No lo he aplicado porque ese archivo no me pertenece. Queda el lector listo
 * para que el arreglo sea mecánico.
 */
export async function getApprovedShowsByArtists(artistIds: string[]): Promise<Show[]> {
  if (artistIds.length === 0) return [];
  const sql = `SELECT * FROM shows WHERE artist_id IN (${artistIds
    .map(() => "?")
    .join(", ")}) AND approved = 1 AND deleted_at IS NULL ORDER BY date ASC`;
  if (isTursoEnabled()) {
    const rows = await tursoExec(sql, artistIds);
    return rows.map((r) => parseShow(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare(sql).all(...artistIds) as Record<string, unknown>[];
  return rows.map(parseShow);
}

export async function createShow(data: CreateShowInput): Promise<Show> {
  const id = `show-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const paymentMethods = data.payment_methods ? JSON.stringify(data.payment_methods) : "[]";
  const guestArtists = data.guest_artists ? JSON.stringify(data.guest_artists) : "[]";
  const approved = data.approved ? 1 : 0;

  if (isTursoEnabled()) {
    await tursoExec(
      `INSERT INTO shows (id, artist_id, venue_name, city, country, date, time, price_range, status, ticket_url, payment_methods, postponement_reason, flyer_url, ticket_link, description, guest_artists, notes, approved, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        approved,
        now,
      ]
    );
    const created = await getShowById(id);
    if (!created) throw new Error("Failed to create show");
    return created;
  }

  const db = getLocalDbWrite();
  db.prepare(
    `INSERT INTO shows (id, artist_id, venue_name, city, country, date, time, price_range, status, ticket_url, payment_methods, postponement_reason, flyer_url, ticket_link, description, guest_artists, notes, approved, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.artist_id, data.venue_name, data.city || null, data.country || null, data.date || null, data.time || null, data.price_range || null, data.status || "disponible", data.ticket_url || null, paymentMethods, data.postponement_reason || null, data.flyer_url || null, data.ticket_link || null, data.description || null, guestArtists, data.notes || null, approved, now);
  const created = await getShowById(id);
  if (!created) throw new Error("Failed to create show");
  return created;
}

export async function updateShow(id: string, data: Partial<CreateShowInput>): Promise<Show | null> {
  if (isTursoEnabled()) {
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
    if (data.approved !== undefined) { updates.push("approved = ?"); values.push(data.approved ? "1" : "0"); }

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
  if (data.approved !== undefined) { updates.push("approved = ?"); values.push(data.approved ? "1" : "0"); }

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
  if (isTursoEnabled()) {
    await tursoExec("DELETE FROM shows WHERE id = ?", [id]);
    return true;
  }
  const db = getLocalDbWrite();
  const result = db.prepare("DELETE FROM shows WHERE id = ?").run(id);
  return result.changes > 0;
}

// ─── Tracks CRUD ────────────────────────────────────────────────────────────

export async function getAllTracks(): Promise<Track[]> {
  if (isTursoEnabled()) {
    try {
      const rows = await tursoExec("SELECT * FROM tracks");
      return rows.map((r) => parseTrack(r as Record<string, unknown>));
    } catch (error) {
      console.error("Turso getAllTracks failed — production MUST use Turso:", error);
      throw new Error("Database error: Turso connection failed. No local fallback in production.");
    }
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM tracks").all() as Record<string, unknown>[];
  return rows.map(parseTrack);
}

export async function getTrackById(id: string): Promise<Track | null> {
  if (isTursoEnabled()) {
    try {
      const row = await tursoExecSingle("SELECT * FROM tracks WHERE id = ?", [id]);
      return row ? parseTrack(row) : null;
    } catch (error) {
      console.error("Turso getTrackById failed:", error);
      throw new Error("Database error: Turso connection failed.");
    }
  }
  const db = getLocalDb();
  const row = db.prepare("SELECT * FROM tracks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseTrack(row) : null;
}

// ─── S0/P4 — lector de alcance PÚBLICO ───────────────────────────────────────
//
// `getTrackById` es el lector "administrativo": no filtra por estado, porque el
// dashboard del artista y el panel de admin necesitan ver borradores,
// pendientes y rechazados. El problema es que `GET /api/releases?id=X` sin
// `user_id` lo usaba como si fuera público, y `GET /api/tracks/:id` tampoco.
//
// Consecuencia medida en este repo, no teórica: la columna `tracks.admin_notes`
// (el motivo interno por el que el admin rechaza un release) existe en el
// esquema local pero NO en `Track`/`parseTrack`. Un `SELECT *` la devolvía
// cruda a cualquiera con el id. Y sin filtro de estado, un borrador o un
// rechazo quedaban legibles —y por tanto indexables— en cuanto el artista
// enviaba su primer release.
//
// Este lector cierra las dos cosas a la vez:
//   1. `status = 'approved'` — nada sin publicar sale por la vía pública.
//   2. `parseTrack` en vez de `SELECT *` — la forma de la respuesta queda
//      acotada por el tipo `Track`, así que una columna nueva sensible no se
//      filtra por forgotten: hay que añadirla al tipo para exponerla.
//
// Uso: rutas GET públicas. Para el dueño o el admin, la fila completa con todos
// los estados se sigue resolving por `getTrackById` tras verificar ownership
// contra `artists.user_id`.
//
// El segundo brazo de la condición (`release_id` de un padre aprobado) no es
// decoración. `POST /api/releases:168` inserta las hijas SIEMPRE con
// `status = 'draft'`, incluso cuando el padre se aprueba después. Sin ese
// brazo, el álbum se publicaría vacío de contenido: el padre Approved pero
// cada pista hija respondiendo 404, y con ella los enlaces de
// `ArtistTracksSection.tsx:86`, que apuntan a `/releases/<id de la hija>`.
export async function getApprovedTrackById(id: string): Promise<Track | null> {
  const sql = `
    SELECT t.* FROM tracks t
     WHERE t.id = ?
       AND (
         t.status = 'approved'
         OR (
           t.release_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM tracks p
              WHERE p.id = t.release_id AND p.status = 'approved'
           )
         )
       )
  `;
  if (isTursoEnabled()) {
    try {
      const row = await tursoExecSingle(sql, [id]);
      return row ? parseTrack(row) : null;
    } catch (error) {
      console.error("Turso getApprovedTrackById failed:", error);
      throw new Error("Database error: Turso connection failed.");
    }
  }
  const db = getLocalDb();
  const row = db.prepare(sql).get(id) as Record<string, unknown> | undefined;
  return row !== undefined ? parseTrack(row) : null;
}

/**
 * Listado PÚBLICO de `tracks`: solo aprobados, y con la forma acotada por
 * `parseTrack`.
 *
 * ── Por qué no basta con filtrar en SQL ─────────────────────────────────────
 * `GET /api/tracks` hacía `SELECT * FROM tracks WHERE status = 'approved'` y
 * devolvía la fila CRUDA. El `WHERE` correcto no impedía la fuga: la columna
 * `tracks.admin_notes` —el motivo interno por el que el admin rechaza— viaja
 * en el `*` de una fila aprobada, así que un visitante anónimo se lo llevaba
 * con un `curl` sin sesión. Es la misma clase de fuga que P4 tapó en
 * `app/api/releases`, por la otra puerta: dos rutas distintas, un mismo `SELECT
 * *` sobre `tracks`.
 *
 * Y el argumento de "el admin necesita la fila cruda" NO se sostiene en esta
 * ruta: el brazo de admin ya pasaba por `getAllTracks()`, que hace
 * `rows.map(parseTrack)`. El admin nunca recibió `description`, `genre`,
 * `created_at` ni `admin_notes` por aquí. Por eso el lector público devuelve
 * exactamente la misma forma que el admin ya tenía, y lo que cambia no es el
 * contrato sino que los dos brazos coinciden.
 *
 * `getApprovedTrackById` resuelve el mismo problema para una fila suelta, con
 * el brazo extra de las hijas de un release aprobado. Este no lo lleva porque
 * el listado histórico solo ha publicado padres: `ORDER BY created_at DESC` con
 * `status = 'approved'` es el alcance que la ruta llevaba antes, y ampliarlo o
 * no es una decisión de producto, no una issue lateral de seguridad.
 *
 * Uso: `GET /api/tracks` para todo el que no sea admin. Para el admin, seguir
 * con `getAllTracks()`.
 */
export async function getApprovedTracks(): Promise<Track[]> {
  const sql = "SELECT * FROM tracks WHERE status = 'approved' ORDER BY created_at DESC";
  if (isTursoEnabled()) {
    try {
      const rows = await tursoExec(sql);
      return rows.map((r) => parseTrack(r as Record<string, unknown>));
    } catch (error) {
      console.error("Turso getApprovedTracks failed:", error);
      throw new Error("Database error: Turso connection failed.");
    }
  }
  const db = getLocalDb();
  const rows = db.prepare(sql).all() as Record<string, unknown>[];
  return rows.map(parseTrack);
}

/**
 * RC.32 — LA regla de igualdad de nombres de artista. Una sola para todo el
 * codebase, y por eso vive aquí y no duplicada en cada ruta.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * `tracks` NO tiene FK a `artists`: se relaciona **por nombre** (ver el
 * comentario de `deleteArtist`). Eso convierte cada comparación de nombres en
 * una comparación de IDENTIDAD de fila, y por eso no puede ser "casi igual".
 *
 * Antes de RC.32 había dos reglas distintas para el mismo invariante en la
 * misma ruta:
 *   - `POST /api/releases` comparaba el `artist_name` del **payload** con
 *     `===` contra el nombre de la fila de `artists`.
 *   - `PUT /api/releases` comparaba el `artist_name` de la **DB**.
 * Un espacio trailing tecleado ("Angel Bandres ") pasaba el POST y escribía la
 * fila con ESE nombre: una fila que ya no casa con ninguna fila de `artists`, y
 * por lo tanto fuera de la cascada de `deleteArtist` y de toda verificación de
 * propiedad posterior. El PUT, en cambio, no fallaba. Un tecleo y una pérdida
 * silenciosa de Track.
 *
 * Normalizar (trim + case-insensitive) cierra las dos puertas. OJO: esto solo
 * cambia la COMPARACIÓN. Lo que se ESCRIBE sigue siendo el valor canónico de
 * la fila de `artists` — nunca el del payload — porque comparar normalizado y
 * luego persistir el texto tecleado seguiría creando la fila huérfana. Ver
 * `resolveOwnedArtistName` en `app/api/releases/route.ts`, que es quien
 * guarantee esa segunda mitad.
 *
 * Devuelve `false` para vacíos: "" == "" no es propiedad de nadie.
 */
/**
 * Estados de un release. Los tres "de decisión" (`approved`, `rejected`,
 * `revision`) solo los puede escribir un admin —ver `resolveSubmitStatus`.
 */
export const DECISION_STATUSES: readonly string[] = ["approved", "rejected", "revision"];
export const RELEASE_STATUSES: readonly string[] = ["draft", "pending", ...DECISION_STATUSES];

export function sameArtistName(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const norm = (v: string | null | undefined): string =>
    typeof v === "string" ? v.trim().toLowerCase() : "";
  const na = norm(a);
  const nb = norm(b);
  return na !== "" && na === nb;
}

/**
 * Resuelve si un usuario es el dueño verificado de las filas de `tracks` con
 * ese `artist_name`.
 *
 * `tracks` NO tiene FK a `artists`: se relaciona por nombre (ver el comentario
 * de `deleteArtist`). Por eso el ownership se valida contra
 * `artists.user_id`, igual que hacen `PUT`/`DELETE /api/releases`.
 *
 * RC.32: el nombre se recorta antes de buscar. Una fila con un espacio
 * trailing ya escrita en producción sigue huérfana (el `name = ?` de
 * `getArtistByName` es exacto a propósito: es la misma clave que usa la
 * cascada de `deleteArtist`), pero el input del cliente ya no puede crear una
 * nueva.
 *
 * Devuelve `false` si no hay artista con ese nombre (un track orphaned nunca
 * es editable por nadie salvo por un admin).
 */
export async function isArtistOwnerOfTrackName(
  artistName: string,
  userId: string
): Promise<boolean> {
  const name = typeof artistName === "string" ? artistName.trim() : "";
  if (!name || !userId) return false;
  const artist = await getArtistByName(name);
  return artist?.user_id != null && artist.user_id === userId;
}

/**
 * RC.32 — LA regla de transición de estado de `app/api/releases`.
 *
 * ## Por qué vive aquí y no en la ruta
 * Un `route.ts` del App Router solo puede exportar verbos HTTP: cualquier otro
 * export rompe el constraint `{ [x: string]: never }` de los tipos generados de
 * Next (`tsc` lo falla con TS2344). Así que la regla vive con el resto de los
 * invariantes de esta capa —junto a `sameArtistName`, que es el otro— y la ruta
 * la importa.
 *
 * ## Qué rompía
 * `PUT /api/releases` respondía 403 cuando `status` venía en el body, el rol no
 * era admin y el estado era de decisión. El formulario de edición reenviaba el
 * estado **vigente** (lo cargaba al state y lo mandaba de vuelta), así que con
 * las 83 filas de producción en `approved` —las puso
 * `scripts/fix-release-status.ts:53`— ningún artista podía guardar ningún
 * release. Nunca. El mensaje largo de la captura era este gate; el corto
 * ("No autorizado"), el de propiedad.
 *
 * ## Qué hace ahora
 *   - Admin: decide cualquier estado, como siempre.
 *   - Autor: la ÚNICA transición que puede pedir es `pending` ("entrar en la cola
 *     de revisión"). Todo lo demás conserva el estado vigente.
 *   - Un `status` inyectado a mano por un no-admin se IGNORA, no se rechaza: si
 *     se rechazara, cualquier otro cliente que reprodujera el patrón del
 *     formulario reintroduciría la misma trampa con otro código de error.
 *   - Un estado que no existe en la lista sigue siendo un 400 (`null`).
 *
 * ## Por qué no se afloja el gate
 * Ignorar no es permitir. Lo que sale de aquí (`nextStatus`) es lo único que
 * llega a la sentencia SQL; el `status` del body no se escribe nunca. La puerta
 * se cierra por omisión, no por excepción.
 *
 * ## La decisión de producto detrás
 * `approved → pending` ES alcanzable para el autor (es el botón "Enviar para
 * revisión" de un release ya publicado, con confirmación). Lo que NO es
 * alcanzable es decidir sobre uno mismo: nadie se aprueba ni se rechaza a sí
 * mismo.
 */
export function resolveSubmitStatus(input: {
  role: string;
  requested?: unknown;
  previous: string;
}): { nextStatus: string; ignored: boolean } | null {
  const { role, requested, previous } = input;
  const asked = typeof requested === "string" ? requested : undefined;

  if (asked !== undefined && !RELEASE_STATUSES.includes(asked)) return null;

  if (role === "admin") {
    return { nextStatus: asked ?? previous, ignored: false };
  }
  if (asked === "pending") {
    return { nextStatus: "pending", ignored: false };
  }
  return { nextStatus: previous, ignored: asked !== undefined };
}

export async function getTrackCount(): Promise<number> {
  if (isTursoEnabled()) {
    const row = await tursoExecSingle("SELECT COUNT(*) as count FROM tracks");
    return row ? Number(row.count) : 0;
  }
  const db = getLocalDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM tracks").get() as { count: number };
  return result.count;
}

export async function getTracksByReleaseType(releaseType: string): Promise<Track[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM tracks WHERE release_type = ?", [releaseType]);
    return rows.map((r) => parseTrack(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db.prepare("SELECT * FROM tracks WHERE release_type = ?").all(releaseType) as Record<string, unknown>[];
  return rows.map(parseTrack);
}

export interface ArtistSearchHit {
  id: string;
  name: string;
  genre: string;
  location: string;
  image: string;
  date: string;
}

export interface ReleaseSearchHit {
  id: string;
  title: string;
  artist_name: string;
  release_type: string;
  image: string;
  date: string;
}

export interface ShowSearchHit {
  id: string;
  venue_name: string;
  city: string;
  country: string;
  image: string;
  date: string;
}

function searchText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

export async function searchArtists(
  normalizedQuery: string,
  state: SortState,
  limit = SEARCH_GROUP_LIMIT
): Promise<ArtistSearchHit[]> {
  const sql = "SELECT id, name, genre, location, profile_image, created_at FROM artists";
  let rows: Record<string, unknown>[];
  if (isTursoEnabled()) {
    rows = (await tursoExec(sql)) as Record<string, unknown>[];
  } else {
    rows = getLocalDb().prepare(sql).all() as Record<string, unknown>[];
  }
  const hits = rows
    .map((row) => ({
      id: searchText(row.id),
      name: searchText(row.name),
      genre: searchText(row.genre),
      location: searchText(row.location),
      image: searchText(row.profile_image),
      date: searchText(row.created_at),
    }))
    .filter((hit) => hitMatches(normalizedQuery, [hit.name, hit.genre, hit.location]));
  return sortList(hits, state, { text: (hit) => hit.name, date: (hit) => hit.date }, normalizedQuery).slice(0, limit);
}

export async function searchReleases(
  normalizedQuery: string,
  state: SortState,
  limit = SEARCH_GROUP_LIMIT
): Promise<ReleaseSearchHit[]> {
  const sql = "SELECT id, title, artist_name, release_type, release_date, cover_image FROM tracks WHERE release_id IS NULL";
  let rows: Record<string, unknown>[];
  if (isTursoEnabled()) {
    rows = (await tursoExec(sql)) as Record<string, unknown>[];
  } else {
    rows = getLocalDb().prepare(sql).all() as Record<string, unknown>[];
  }
  const hits = rows
    .map((row) => ({
      id: searchText(row.id),
      title: searchText(row.title),
      artist_name: searchText(row.artist_name),
      release_type: searchText(row.release_type),
      image: searchText(row.cover_image),
      date: searchText(row.release_date),
    }))
    .filter((hit) => hitMatches(normalizedQuery, [hit.title, hit.artist_name, hit.release_type]));
  return sortList(hits, state, { text: (hit) => hit.title, date: (hit) => hit.date }, normalizedQuery).slice(0, limit);
}

export async function searchShows(
  normalizedQuery: string,
  state: SortState,
  limit = SEARCH_GROUP_LIMIT
): Promise<ShowSearchHit[]> {
  const sql = "SELECT id, venue_name, city, country, date, flyer_url FROM shows";
  let rows: Record<string, unknown>[];
  if (isTursoEnabled()) {
    rows = (await tursoExec(sql)) as Record<string, unknown>[];
  } else {
    rows = getLocalDb().prepare(sql).all() as Record<string, unknown>[];
  }
  const hits = rows
    .map((row) => ({
      id: searchText(row.id),
      venue_name: searchText(row.venue_name),
      city: searchText(row.city),
      country: searchText(row.country),
      image: searchText(row.flyer_url),
      date: searchText(row.date),
    }))
    .filter((hit) => hitMatches(normalizedQuery, [hit.venue_name, hit.city, hit.country]));
  return sortList(hits, state, { text: (hit) => hit.venue_name, date: (hit) => hit.date }, normalizedQuery).slice(0, limit);
}

// ─── Tracks by Artist ──────────────────────────────────────────────────────────
// Fase E: `status = 'approved'` cierra la fuga de borradores/pendientes.
// Antes esta función no filtraba por estado, así que un release `pending` de
// un suscriptor aparecía en la página pública del artista y en el export de
// prensa. Verificado contra Turso: los tracks existentes están `approved`, así
// que el filtro no oculta nada real.
export async function getTracksByArtist(artistId: string): Promise<Track[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec(
      "SELECT * FROM tracks WHERE artist_name = (SELECT name FROM artists WHERE id = ?) AND status = 'approved' ORDER BY title",
      [artistId]
    );
    return rows.map((r) => parseTrack(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db
    .prepare("SELECT * FROM tracks WHERE artist_name = (SELECT name FROM artists WHERE id = ?) AND status = 'approved' ORDER BY title")
    .all(artistId) as Record<string, unknown>[];
  return rows.map(parseTrack);
}

// P3 Batch 2: Multi-track releases — tracks by release_id
// M0: ordering is disc-aware. The COALESCE is NOT optional: in SQLite (and
// Turso/SQLite) NULLs sort FIRST on an ascending ORDER BY, so without it an
// unnumbered track would jump to the head of its disc instead of trailing it.
// 999 pushes unnumbered tracks to the end of their disc, where start_time
// then acts as the tiebreaker.
const RELEASE_TRACKS_ORDER =
  "ORDER BY COALESCE(disc_number, 1) ASC, COALESCE(track_number, 999) ASC, start_time ASC";

export async function getTracksByReleaseId(releaseId: string): Promise<Track[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec(
      `SELECT * FROM tracks WHERE release_id = ? ${RELEASE_TRACKS_ORDER}`,
      [releaseId]
    );
    return rows.map((r) => parseTrack(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db
    .prepare(`SELECT * FROM tracks WHERE release_id = ? ${RELEASE_TRACKS_ORDER}`)
    .all(releaseId) as Record<string, unknown>[];
  return rows.map(parseTrack);
}

// P3 Batch 2: Dashboard — only parent releases (release_id IS NULL)
export async function getParentReleases(): Promise<Track[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec(
      "SELECT * FROM tracks WHERE release_id IS NULL"
    );
    return rows.map((r) => parseTrack(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db
    .prepare("SELECT * FROM tracks WHERE release_id IS NULL")
    .all() as Record<string, unknown>[];
  return rows.map(parseTrack);
}

// P3 Batch 2: Catalog — only approved parent releases
export async function getApprovedReleases(): Promise<Track[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec(
      "SELECT * FROM tracks WHERE release_id IS NULL AND status = 'approved'"
    );
    return rows.map((r) => parseTrack(r as Record<string, unknown>));
  }
  const db = getLocalDb();
  const rows = db
    .prepare("SELECT * FROM tracks WHERE release_id IS NULL AND status = 'approved'")
    .all() as Record<string, unknown>[];
  return rows.map(parseTrack);
}

// ─── Catálogo del artista agrupado por release (C2) ─────────────────────────
// Modelo de datos: un release (álbum/EP con pistas) y un single suelto son
// INDISTINGUIBLES en el esquema — ambos son filas de `tracks` con
// `release_id IS NULL` y no hay columna que los separe. La única señal que los
// distingue es que el álbum tiene hijos (`tracks.release_id = t.id`), y por
// eso la consulta lleva el `EXISTS`: sin él, un álbum de 10 pistas se
// publicaría como 11 EPKCards con la MISMA portada (los hijos heredan
// `cover_image` del padre).
//
// Una sola consulta, sin N+1: se traen TODAS las filas aprobadas del artista,
// los padres vienen con `has_children` calculado en SQL y los hijos se
// agrupan en JS por `release_id`. Si la consulta devolviera únicamente los
// padres —el `WHERE (release_id IS NULL OR EXISTS …)` del plan— haría falta
// una segunda ronda por grupo para rellenar las pistas.
export interface ArtistCatalogGroup {
  /** Fila padre: el álbum, o el single suelto (entonces `tracks` va vacío). */
  release: Track;
  /** Hijos aprobados en orden de pista. Vacío cuando `release` es single. */
  tracks: Track[];
}

// `COALESCE(disc_number, 1)` y `COALESCE(track_number, 999)` replican el orden
// de `getTracksByReleaseId`: en SQLite los NULL suben solos en un ORDER BY
// ASC, así que sin COALESCE una pista sin numerar saltaría a la cabecera de
// su disco. `release_date DESC` va primero porque es el orden de los grupos.
const ARTIST_CATALOG_SQL = `
  SELECT t.*,
         EXISTS (SELECT 1 FROM tracks c
                  WHERE c.release_id = t.id AND c.status = 'approved') AS has_children
    FROM tracks t
   WHERE t.artist_name = (SELECT name FROM artists WHERE id = ?)
     AND t.status = 'approved'
   ORDER BY t.release_date DESC,
            COALESCE(t.disc_number, 1) ASC,
            COALESCE(t.track_number, 999) ASC,
            t.start_time ASC
`;

// SQLite/better-sqlite3 devuelven 1/0; Turso (libsql) puede devolver
// boolean o string. Cualquier cosa que no sea un "0" explícito cuenta como
// true, así que normalizamos en ambos sentidos.
function asSqlFlag(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "" && value !== "0" && value !== "false";
  return Boolean(value);
}

export async function getArtistCatalog(artistId: string): Promise<ArtistCatalogGroup[]> {
  let rows: Record<string, unknown>[];
  if (isTursoEnabled()) {
    rows = (await tursoExec(ARTIST_CATALOG_SQL, [artistId])) as Record<string, unknown>[];
  } else {
    rows = getLocalDb().prepare(ARTIST_CATALOG_SQL).all(artistId) as Record<string, unknown>[];
  }

  const heads: { track: Track; hasChildren: boolean }[] = [];
  const childrenByRelease = new Map<string, Track[]>();

  for (const row of rows) {
    const track = parseTrack(row);
    if (track.release_id) {
      const bucket = childrenByRelease.get(track.release_id);
      if (bucket) bucket.push(track);
      else childrenByRelease.set(track.release_id, [track]);
    } else {
      heads.push({ track, hasChildren: asSqlFlag(row.has_children) });
    }
  }

  // Los hijos cuyo padre no está en `heads` (padre `pending`/`draft` o de otro
  // artista) se descartan solos: nunca existen grupos sin fila padre.
  return heads.map(({ track, hasChildren }) => {
    const children = childrenByRelease.get(track.id) ?? [];
    return { release: track, tracks: hasChildren || children.length > 0 ? children : [] };
  });
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
  // M0: track number within its disc. null/undefined = unnumbered (falls back to start_time ordering)
  track_number?: number | null;
  is_double_single?: boolean;
  sides_b?: string[] | null;
  isrc?: string | null;
  composers?: string[] | null;
  is_instrumental?: boolean;
  // P3 Batch 2: Multi-track releases + YouTube timestamps
  release_id?: string | null;
  start_time?: number;
  end_time?: number;
  // Release approval workflow
  status?: import("@/types/music").ReleaseStatus;
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
    track_number: data.track_number ?? null,
    is_double_single: data.is_double_single ?? false,
    sides_b: data.sides_b || null,
    isrc: data.isrc || null,
    composers: data.composers || null,
    is_instrumental: data.is_instrumental ?? false,
    // P3 Batch 2: Multi-track releases + YouTube timestamps
    release_id: data.release_id ?? null,
    start_time: data.start_time ?? 0,
    end_time: data.end_time ?? 0,
    // `status` estaba declarado en la firma y NO se escribia en ningun INSERT:
    // la columna se quedaba con el default del esquema ('draft') y toda pista
    // creada por aqui era invisible en lo publico, que filtra
    // `status = 'approved'`. Se escribe ahora; el default sigue siendo 'draft'
    // para no cambiar el comportamiento de las rutas que crean pendientes.
    status: data.status ?? "draft",
  };

if (isTursoEnabled()) {
    await tursoExec(
      `INSERT OR REPLACE INTO tracks (
        id, title, artist_name, release_type, release_date, duration, cover_image,
        audio_preview_url, spotify_url, youtube_video_id, itunes_track_id,
        metrics, production_details, lyrics, stems_urls, video_embed_url, gallery_images,
        external_links, disc_number, track_number, is_double_single, sides_b, isrc, composers, is_instrumental,
        release_id, start_time, end_time, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        track.track_number,
        track.is_double_single ? 1 : 0,
        track.sides_b ? JSON.stringify(track.sides_b) : null,
        track.isrc,
        track.composers ? JSON.stringify(track.composers) : null,
        track.is_instrumental ? 1 : 0,
        track.release_id,
        track.start_time,
        track.end_time,
        track.status,
      ]
    );
  } else {
    const db = getLocalDbWrite();
    db.prepare(`
      INSERT OR REPLACE INTO tracks (
        id, title, artist_name, release_type, release_date, duration, cover_image,
        audio_preview_url, spotify_url, youtube_video_id, itunes_track_id,
        metrics, production_details, lyrics, stems_urls, video_embed_url, gallery_images,
        external_links, disc_number, track_number, is_double_single, sides_b, isrc, composers, is_instrumental,
        release_id, start_time, end_time, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      track.track_number,
      track.is_double_single ? 1 : 0,
      track.sides_b ? JSON.stringify(track.sides_b) : null,
      track.isrc,
      track.composers ? JSON.stringify(track.composers) : null,
      track.is_instrumental ? 1 : 0,
      track.release_id,
      track.start_time,
      track.end_time,
      track.status,
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
  is_instrumental: boolean;
  // M0: track number within its disc (null clears it)
  track_number?: number | null;
  status: import("@/types/music").ReleaseStatus;
}>): Promise<Track | null> {
  const existing = await getTrackById(id);
  if (!existing) return null;

  const fields = Object.keys(updates).filter((k) => k !== "id");
  if (fields.length === 0) return existing;

  const setClause = fields.map((k) => `${k} = ?`).join(", ");
  const values = fields.map((k) => {
    const v = (updates as Record<string, unknown>)[k];
    if (typeof v === "object" && v !== null) return JSON.stringify(v);
    if (typeof v === "boolean") return v ? 1 : 0;
    return v;
  });

  if (isTursoEnabled()) {
    await tursoExec(`UPDATE tracks SET ${setClause} WHERE id = ?`, [...values, id]);
  } else {
    const db = getLocalDbWrite();
    db.prepare(`UPDATE tracks SET ${setClause} WHERE id = ?`).run(...values, id);
  }

  return getTrackById(id);
}

export async function deleteTrack(id: string): Promise<boolean> {
  if (isTursoEnabled()) {
    const result = await tursoExec("DELETE FROM tracks WHERE id = ?", [id]);
    return result.length > 0 || true;
  }
  const db = getLocalDbWrite();
  const result = db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
  return result.changes > 0;
}

export async function incrementTrackStreams(id: string): Promise<number> {
  if (isTursoEnabled()) {
    // Increment streams column (atomic)
    await tursoExec("UPDATE tracks SET streams = COALESCE(streams, 0) + 1 WHERE id = ?", [id]);
    // Read back the updated value
    const row = await tursoExecSingle("SELECT streams FROM tracks WHERE id = ?", [id]);
    return row ? Number(row.streams) || 0 : 0;
  }
  const db = getLocalDbWrite();
  db.prepare("UPDATE tracks SET streams = COALESCE(streams, 0) + 1 WHERE id = ?").run(id);
  const row = db.prepare("SELECT streams FROM tracks WHERE id = ?").get(id) as { streams: number } | undefined;
  return row ? Number(row.streams) || 0 : 0;
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
  return isTursoEnabled();
}

// ─── Exports for direct access (scripts, etc.) ──────────────────────────────

export function getDbWrite() {
  return getLocalDbWrite();
}

export { getTursoClientSync as getTurso };

// ─── Dossiers (P3 Batch 2 Hotfix) ──────────────────────────────────────────

export interface DossierData {
  id: string;
  artist_id: string;
  biography: string | null;
  press_text: string | null;
  genre: string | null;
  location: string | null;
  influences: string | null;
  contact_email: string | null;
  booking_email: string | null;
  management: string | null;
  website: string | null;
  rider_pa_system: string | null;
  rider_monitors: string | null;
  rider_console: string | null;
  rider_subwoofers: string | null;
  rider_guitar: string | null;
  rider_bass: string | null;
  rider_drums: string | null;
  rider_keyboards: string | null;
  rider_lighting: string | null;
  rider_stage_size: string | null;
  rider_stage_conditions: string | null;
  rider_hospitality: string | null;
  rider_transport: string | null;
  rider_special_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const DOSSIER_DEFAULTS = {
  rider_pa_system: "Line Array - Minimo 15,000W RMS",
  rider_monitors: "Minimo 4 mezclas in-ear o wedge",
  rider_console: "Digital - minimo 32 canales",
  rider_subwoofers: "Minimo 4 sub-graves (18 o 21)",
  rider_guitar: "Amplificador Combo 100W o Head + Cabinet",
  rider_bass: "Amplificador Combo 300W minimo",
  rider_drums: "Kit completo + hardware + baquetas",
  rider_keyboards: "Piano digital 88 teclas con sustain",
  rider_lighting: "Iluminacion basica con focus en escenario",
  rider_stage_size: "Minimo 6m x 4m",
  rider_stage_conditions: "Escenario cubierto y seco",
  rider_hospitality: "Agua natural, cafe, frutas frescas, snacks antes del show",
  rider_transport: "Transporte desde hotel al venue incluido",
};

function parseDossier(row: Record<string, unknown>): DossierData {
  return {
    id: safeString(row.id),
    artist_id: safeString(row.artist_id),
    biography: row.biography as string | null,
    press_text: row.press_text as string | null,
    genre: row.genre as string | null,
    location: row.location as string | null,
    influences: row.influences as string | null,
    contact_email: row.contact_email as string | null,
    booking_email: row.booking_email as string | null,
    management: row.management as string | null,
    website: row.website as string | null,
    rider_pa_system: (row.rider_pa_system as string) || DOSSIER_DEFAULTS.rider_pa_system,
    rider_monitors: (row.rider_monitors as string) || DOSSIER_DEFAULTS.rider_monitors,
    rider_console: (row.rider_console as string) || DOSSIER_DEFAULTS.rider_console,
    rider_subwoofers: (row.rider_subwoofers as string) || DOSSIER_DEFAULTS.rider_subwoofers,
    rider_guitar: (row.rider_guitar as string) || DOSSIER_DEFAULTS.rider_guitar,
    rider_bass: (row.rider_bass as string) || DOSSIER_DEFAULTS.rider_bass,
    rider_drums: (row.rider_drums as string) || DOSSIER_DEFAULTS.rider_drums,
    rider_keyboards: (row.rider_keyboards as string) || DOSSIER_DEFAULTS.rider_keyboards,
    rider_lighting: (row.rider_lighting as string) || DOSSIER_DEFAULTS.rider_lighting,
    rider_stage_size: (row.rider_stage_size as string) || DOSSIER_DEFAULTS.rider_stage_size,
    rider_stage_conditions: (row.rider_stage_conditions as string) || DOSSIER_DEFAULTS.rider_stage_conditions,
    rider_hospitality: (row.rider_hospitality as string) || DOSSIER_DEFAULTS.rider_hospitality,
    rider_transport: (row.rider_transport as string) || DOSSIER_DEFAULTS.rider_transport,
    rider_special_notes: row.rider_special_notes as string | null,
    created_at: row.created_at as string | null,
    updated_at: row.updated_at as string | null,
  };
}

export async function getDossierByArtistId(artistId: string): Promise<DossierData | null> {
  if (isTursoEnabled()) {
    const rows = await tursoExec("SELECT * FROM dossiers WHERE artist_id = ?", [artistId]);
    if (rows.length === 0) return null;
    return parseDossier(rows[0] as Record<string, unknown>);
  }
  const db = getLocalDbWrite();
  const row = db.prepare("SELECT * FROM dossiers WHERE artist_id = ?").get(artistId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseDossier(row);
}

export async function upsertDossier(artistId: string, data: Partial<DossierData>): Promise<DossierData> {
  const existing = await getDossierByArtistId(artistId);
  const now = new Date().toISOString();

  if (existing) {
    const fields = Object.keys(data).filter(k => k !== "id" && k !== "artist_id" && k !== "created_at" && k !== "updated_at");
    const setClauses = fields.map(k => `${k} = ?`).join(", ");
    const values = fields.map(k => (data as any)[k] ?? null);

    if (isTursoEnabled()) {
      await tursoExecUpdate(`UPDATE dossiers SET ${setClauses}, updated_at = ? WHERE artist_id = ?`, [...values, now, artistId]);
    } else {
      const db = getLocalDbWrite();
      db.prepare(`UPDATE dossiers SET ${setClauses}, updated_at = ? WHERE artist_id = ?`).run(...values, now, artistId);
    }
    const updated = (await getDossierByArtistId(artistId))!;
    await syncDossierToArtist(artistId, data);
    return updated;
  }

  const id = `dos-${Date.now()}`;
  const allFields = ["id", "artist_id", ...Object.keys(data).filter(k => k !== "id" && k !== "artist_id")];
  const placeholders = allFields.map(() => "?").join(", ");
  const values = allFields.map(k => {
    if (k === "id") return id;
    if (k === "artist_id") return artistId;
    return (data as any)[k] ?? null;
  });

  if (isTursoEnabled()) {
    await tursoExecUpdate(`INSERT INTO dossiers (${allFields.join(", ")}, created_at, updated_at) VALUES (${placeholders}, ?, ?)`, [...values, now, now]);
  } else {
    const db = getLocalDbWrite();
    db.prepare(`INSERT INTO dossiers (${allFields.join(", ")}, created_at, updated_at) VALUES (${placeholders}, ?, ?)`).run(...values, now, now);
  }
  const created = (await getDossierByArtistId(artistId))!;
  await syncDossierToArtist(artistId, data);
  return created;
}

// Single source of truth: artists table is canonical for bio/press/genre/location
// shown in BioSection + public artist page. DossierEditor writes dossiers, so sync
// those fields back to artists on every dossier save (both Turso + SQLite via updateArtist).
// Presence-based (not truthiness): clearing a field in the dossier clears it in artists too.
export async function syncDossierToArtist(
  artistId: string,
  data: Partial<{ biography: string | null; press_text: string | null; genre: string | null; location: string | null }>
): Promise<void> {
  const sync: Record<string, unknown> = {};
  if (data.biography !== undefined) sync.biography = data.biography ?? "";
  if (data.press_text !== undefined) sync.press_text = data.press_text ?? "";
  if (data.genre !== undefined) sync.genre = data.genre ?? "";
  if (data.location !== undefined) sync.location = data.location ?? "";
  if (Object.keys(sync).length === 0) return;
  try {
    await updateArtist(artistId, sync);
  } catch (error) {
    console.error("syncDossierToArtist failed:", error);
  }
}
