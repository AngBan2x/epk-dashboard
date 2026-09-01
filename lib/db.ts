import Database from "better-sqlite3";
import path from "path";
import type { Track, RawTrackRow, Metrics, ProductionDetails, StemsUrls, User, RawUserRow, TrackSubmission, RawTrackSubmissionRow, SubmissionStatus, Like, RawLikeRow, Notification, RawNotificationRow, NotificationType, MetricsHistory, RawMetricsHistoryRow, TopCountry, ArtistProfile, CreateArtistInput } from "@/types/music";
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

// Initialize likes table
function initLikesTable(): void {
  const db = getDbWrite();
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
}
initLikesTable();

// Initialize notifications table
function initNotificationsTable(): void {
  const db = getDbWrite();
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
}
initNotificationsTable();

// Initialize metrics_history table
function initMetricsHistoryTable(): void {
  const db = getDbWrite();
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics_history (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      date TEXT NOT NULL,
      streams INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      playlist_additions INTEGER DEFAULT 0,
      top_countries TEXT, -- JSON
      source TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (track_id) REFERENCES tracks(id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_metrics_history_track ON metrics_history(track_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_metrics_history_date ON metrics_history(date)`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_history_track_date ON metrics_history(track_id, date)`);
}
initMetricsHistoryTable();

// Initialize artists table
function initArtistsTable(): void {
  const db = getDbWrite();
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
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name)`);
  // Add user_id column if missing (migration for existing tables)
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_artists_user_id ON artists(user_id)`);
  } catch {
    // Column doesn't exist yet, try to add it
    try {
      db.exec(`ALTER TABLE artists ADD COLUMN user_id TEXT`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_artists_user_id ON artists(user_id)`);
    } catch {
      // Column already exists or table is empty, ignore
    }
  }
}
initArtistsTable();

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
  // Usar misma conexión para leer de vuelta (evita dual connection bug)
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as RawUserRow | undefined;
  if (!row) throw new Error("Failed to create user");
  return parseUser(row);
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

function parseLike(row: RawLikeRow): Like {
  return {
    id: row.id,
    user_id: row.user_id,
    track_id: row.track_id,
    created_at: row.created_at,
  };
}

export function toggleLike(userId: string, trackId: string): { liked: boolean; count: number } {
  const db = getDbWrite();
  const existing = db.prepare("SELECT * FROM likes WHERE user_id = ? AND track_id = ?").get(userId, trackId) as RawLikeRow | undefined;
  
  if (existing) {
    // Unlike
    db.prepare("DELETE FROM likes WHERE user_id = ? AND track_id = ?").run(userId, trackId);
  } else {
    // Like
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO likes (id, user_id, track_id) VALUES (?, ?, ?)").run(id, userId, trackId);
  }
  
  const count = db.prepare("SELECT COUNT(*) as count FROM likes WHERE track_id = ?").get(trackId) as { count: number };
  return { liked: !existing, count: count.count };
}

export function getLikeCount(trackId: string): number {
  const db = getDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM likes WHERE track_id = ?").get(trackId) as { count: number };
  return result.count;
}

export function getUserLikes(userId: string): Like[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM likes WHERE user_id = ? ORDER BY created_at DESC").all(userId) as RawLikeRow[];
  return rows.map(parseLike);
}

export function hasUserLikedTrack(userId: string, trackId: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT 1 FROM likes WHERE user_id = ? AND track_id = ?").get(userId, trackId);
  return row !== undefined;
}

function parseNotification(row: RawNotificationRow): Notification {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    data: row.data,
    read: row.read === 1,
    created_at: row.created_at,
  };
}

export function createNotification(notification: Omit<Notification, "id" | "created_at"> & { id: string }): Notification {
  const db = getDbWrite();
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, data, read)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    notification.id,
    notification.user_id,
    notification.type,
    notification.title,
    notification.message,
    notification.data,
    notification.read ? 1 : 0
  );
  const created = getNotificationById(notification.id);
  if (!created) throw new Error("Failed to create notification");
  return created;
}

export function getNotificationById(id: string): Notification | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as RawNotificationRow | undefined;
  return row !== undefined ? parseNotification(row) : null;
}

export function getUserNotifications(userId: string, unreadOnly = false): Notification[] {
  const db = getDb();
  let query = "SELECT * FROM notifications WHERE user_id = ?";
  if (unreadOnly) {
    query += " AND read = 0";
  }
  query += " ORDER BY created_at DESC";
  const rows = db.prepare(query).all(userId) as RawNotificationRow[];
  return rows.map(parseNotification);
}

export function markNotificationAsRead(id: string): Notification | null {
  const db = getDbWrite();
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(id);
  return getNotificationById(id);
}

export function markAllNotificationsAsRead(userId: string): void {
  const db = getDbWrite();
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(userId);
}

export function getUnreadNotificationCount(userId: string): number {
  const db = getDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0").get(userId) as { count: number };
  return result.count;
}

function parseMetricsHistory(row: RawMetricsHistoryRow): MetricsHistory {
  return {
    id: row.id,
    track_id: row.track_id,
    date: row.date,
    streams: row.streams,
    saves: row.saves,
    playlist_additions: row.playlist_additions,
    top_countries: safeParseJSON<TopCountry[]>(row.top_countries, []),
    source: row.source,
    created_at: row.created_at,
  };
}

export function createMetricsHistory(metrics: Omit<MetricsHistory, "id" | "created_at"> & { id: string }): MetricsHistory {
  const db = getDbWrite();
  db.prepare(`
    INSERT INTO metrics_history (id, track_id, date, streams, saves, playlist_additions, top_countries, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(metrics.id, metrics.track_id, metrics.date, metrics.streams, metrics.saves, metrics.playlist_additions, JSON.stringify(metrics.top_countries), metrics.source);
  const created = getMetricsHistoryById(metrics.id);
  if (!created) throw new Error("Failed to create metrics history");
  return created;
}

export function getMetricsHistoryById(id: string): MetricsHistory | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM metrics_history WHERE id = ?").get(id) as RawMetricsHistoryRow | undefined;
  return row !== undefined ? parseMetricsHistory(row) : null;
}

export function getMetricsHistoryByTrack(trackId: string): MetricsHistory[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM metrics_history WHERE track_id = ? ORDER BY date DESC").all(trackId) as RawMetricsHistoryRow[];
  return rows.map(parseMetricsHistory);
}

export function getMetricsHistoryByTrackAndDate(trackId: string, date: string): MetricsHistory | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM metrics_history WHERE track_id = ? AND date = ?").get(trackId, date) as RawMetricsHistoryRow | undefined;
  return row !== undefined ? parseMetricsHistory(row) : null;
}

export function upsertMetricsHistory(metrics: Omit<MetricsHistory, "id" | "created_at"> & { id: string }): MetricsHistory {
  const db = getDbWrite();
  const existing = getMetricsHistoryByTrackAndDate(metrics.track_id, metrics.date);
  if (existing) {
    db.prepare(`
      UPDATE metrics_history 
      SET streams = ?, saves = ?, playlist_additions = ?, top_countries = ?, source = ?, created_at = ?
      WHERE id = ?
    `).run(metrics.streams, metrics.saves, metrics.playlist_additions, JSON.stringify(metrics.top_countries), metrics.source, new Date().toISOString(), existing.id);
    return getMetricsHistoryById(existing.id)!;
  } else {
    return createMetricsHistory(metrics);
  }
}

// Artist CRUD functions
function parseArtist(row: any): ArtistProfile {
  return {
    id: row.id,
    name: row.name,
    user_id: row.user_id ?? null,
    biography: row.biography,
    press_text: row.press_text,
    press_highlights: safeParseJSON<string[]>(row.press_highlights, []),
    genre: row.genre,
    location: row.location,
    monthly_listeners: row.monthly_listeners || 0,
    created_at: row.created_at,
  };
}

export function getArtistByName(name: string): ArtistProfile | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM artists WHERE name = ?").get(name);
  return row ? parseArtist(row) : null;
}

export function getArtistByUserId(userId: string): ArtistProfile | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM artists WHERE user_id = ?").get(userId);
  return row ? parseArtist(row) : null;
}

export function getArtistById(id: string): ArtistProfile | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM artists WHERE id = ?").get(id);
  return row ? parseArtist(row) : null;
}

export function createArtist(data: CreateArtistInput): ArtistProfile {
  const db = getDbWrite();
  const id = `art-${Date.now()}`;
  const pressHighlights = data.pressHighlights ? JSON.stringify(data.pressHighlights) : "[]";
  db.prepare(`
    INSERT INTO artists (id, name, user_id, biography, press_text, press_highlights, genre, location, monthly_listeners)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.userId || null, data.biography || null, data.pressText || null, pressHighlights, data.genre || null, data.location || null, data.monthly_listeners || 0);
  const created = getArtistById(id);
  if (!created) throw new Error("Failed to create artist");
  return created;
}

export function updateArtist(id: string, data: Partial<CreateArtistInput>): ArtistProfile | null {
  const db = getDbWrite();
  const updates: string[] = [];
  const values: any[] = [];
  
  if (data.biography !== undefined) { updates.push("biography = ?"); values.push(data.biography); }
  if (data.pressText !== undefined) { updates.push("press_text = ?"); values.push(data.pressText); }
  if (data.pressHighlights !== undefined) { updates.push("press_highlights = ?"); values.push(JSON.stringify(data.pressHighlights)); }
  if (data.genre !== undefined) { updates.push("genre = ?"); values.push(data.genre); }
  if (data.location !== undefined) { updates.push("location = ?"); values.push(data.location); }
  if (data.userId !== undefined) { updates.push("user_id = ?"); values.push(data.userId); }
  
  if (updates.length === 0) return getArtistById(id);
  
  values.push(id);
  db.prepare(`UPDATE artists SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getArtistById(id);
}

export function getAllArtists(): ArtistProfile[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM artists ORDER BY name").all();
  return rows.map(parseArtist);
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
