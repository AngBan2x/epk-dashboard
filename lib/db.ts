import Database from "better-sqlite3";
import path from "path";
import type { Track, RawTrackRow, Metrics, ProductionDetails, StemsUrls, User, RawUserRow, TrackSubmission, RawTrackSubmissionRow, SubmissionStatus } from "@/types/music";
import { safeString, safeNumber, safeArray, safeParseJSON } from "@/lib/null-safe";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

let _db: Database.Database | null = null;
let _dbWrite: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
  }
  return _db;
}

function getDbWrite(): Database.Database {
  if (!_dbWrite) {
    _dbWrite = new Database(DB_PATH);
  }
  return _dbWrite;
}

// Initialize users table
function initUsersTable(): void {
  const db = getDbWrite();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'artist',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
}
initUsersTable();

// Initialize track_submissions table
function initTrackSubmissionsTable(): void {
  const db = getDbWrite();
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
}
initTrackSubmissionsTable();

function parseUser(row: RawUserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password_hash: row.password_hash,
    role: row.role as "admin" | "artist",
    created_at: row.created_at,
  };
}

export function getUserByEmail(email: string): User | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as RawUserRow | undefined;
  return row !== undefined ? parseUser(row) : null;
}

export function getUserById(id: string): User | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as RawUserRow | undefined;
  return row !== undefined ? parseUser(row) : null;
}

export function createUser(user: Omit<User, "id" | "created_at"> & { id: string }): User {
  const db = getDbWrite();
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(user.id, user.name, user.email, user.password_hash, user.role);
  const created = getUserById(user.id);
  if (!created) throw new Error("Failed to create user");
  return created;
}

export function verifyUserPassword(email: string, password: string): User | null {
  const user = getUserByEmail(email);
  if (!user) return null;
  // Password verification will be done with bcrypt in auth API
  return user;
}

function parseTrackSubmission(row: RawTrackSubmissionRow): TrackSubmission {
  return {
    id: row.id,
    user_id: row.user_id,
    track_data: row.track_data,
    status: row.status as SubmissionStatus,
    admin_notes: row.admin_notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createTrackSubmission(submission: Omit<TrackSubmission, "id" | "created_at" | "updated_at"> & { id: string }): TrackSubmission {
  const db = getDbWrite();
  db.prepare(`
    INSERT INTO track_submissions (id, user_id, track_data, status, admin_notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(submission.id, submission.user_id, submission.track_data, submission.status, submission.admin_notes);
  const created = getTrackSubmissionById(submission.id);
  if (!created) throw new Error("Failed to create track submission");
  return created;
}

export function getTrackSubmissionById(id: string): TrackSubmission | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM track_submissions WHERE id = ?").get(id) as RawTrackSubmissionRow | undefined;
  return row !== undefined ? parseTrackSubmission(row) : null;
}

export function getTrackSubmissionsByUser(userId: string): TrackSubmission[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM track_submissions WHERE user_id = ? ORDER BY created_at DESC").all(userId) as RawTrackSubmissionRow[];
  return rows.map(parseTrackSubmission);
}

export function getAllTrackSubmissions(): TrackSubmission[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM track_submissions ORDER BY created_at DESC").all() as RawTrackSubmissionRow[];
  return rows.map(parseTrackSubmission);
}

export function getTrackSubmissionsByStatus(status: SubmissionStatus): TrackSubmission[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM track_submissions WHERE status = ? ORDER BY created_at DESC").all(status) as RawTrackSubmissionRow[];
  return rows.map(parseTrackSubmission);
}

export function updateTrackSubmissionStatus(id: string, status: SubmissionStatus, adminNotes?: string): TrackSubmission | null {
  const db = getDbWrite();
  const now = new Date().toISOString();
  if (adminNotes !== undefined) {
    db.prepare("UPDATE track_submissions SET status = ?, admin_notes = ?, updated_at = ? WHERE id = ?").run(status, adminNotes, now, id);
  } else {
    db.prepare("UPDATE track_submissions SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
  }
  return getTrackSubmissionById(id);
}

// Export getDbWrite for direct queries if needed
export { getDbWrite };

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

function parseTrack(row: RawTrackRow): Track {
  return {
    id: row.id,
    title: row.title,
    artist_name: safeString(row.artist_name, "Artista EPK"),
    release_type: safeString(row.release_type),
    release_date: safeString(row.release_date),
    duration: safeString(row.duration),
    cover_image: safeString(row.cover_image),
    audio_preview_url: safeString(row.audio_preview_url),
    spotify_url: row.spotify_url ?? null,
    youtube_video_id: row.youtube_video_id ?? null,
    metrics: parseMetrics(row.metrics),
    production_details: parseProductionDetails(row.production_details),
    lyrics: row.lyrics ?? null,
    // Multimedia F8
    itunes_track_id: row.itunes_track_id ?? null,
    stems_urls: parseStemsUrls(row.stems_urls ?? null),
    video_embed_url: row.video_embed_url ?? null,
    gallery_images: parseGalleryImages(row.gallery_images ?? null),
  };
}

export function getAllTracks(): Track[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM tracks").all() as RawTrackRow[];
  return rows.map(parseTrack);
}

export function getTrackById(id: string): Track | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tracks WHERE id = ?").get(id) as RawTrackRow | undefined;
  return row !== undefined ? parseTrack(row) : null;
}

export function getTrackCount(): number {
  const db = getDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM tracks").get() as { count: number };
  return result.count;
}

export function getTracksByReleaseType(releaseType: string): Track[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM tracks WHERE release_type = ?").all(releaseType) as RawTrackRow[];
  return rows.map(parseTrack);
}

export function searchTracks(query: string): Track[] {
  const db = getDb();
  const pattern = `%${query}%`;
  const rows = db
    .prepare("SELECT * FROM tracks WHERE title LIKE ? OR artist_name LIKE ? OR release_type LIKE ? OR lyrics LIKE ?")
    .all(pattern, pattern, pattern, pattern) as RawTrackRow[];
  return rows.map(parseTrack);
}
