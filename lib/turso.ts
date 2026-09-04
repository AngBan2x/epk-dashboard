import { createClient, type Client, type InValue } from "@libsql/client";
import type {
  RawTrackRow,
  SyncResult,
  ArtistProfile,
  User,
  RawUserRow,
  TrackSubmission,
  RawTrackSubmissionRow,
  Like,
  RawLikeRow,
  Notification,
  RawNotificationRow,
  MetricsHistory,
  RawMetricsHistoryRow,
  Show,
  RawShowRow,
  TopCountry,
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

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

let _turso: Client | null = null;

export function getTursoClient(): Client | null {
  if (!TURSO_URL || !TURSO_TOKEN) return null;
  if (!_turso) {
    _turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  }
  return _turso;
}

// Keep legacy alias
function getTurso(): Client | null {
  return getTursoClient();
}

// ─── Schema: 7+ tablas completas ─────────────────────────────────────────────

export async function ensureTursoSchema(): Promise<boolean> {
  const client = getTurso();
  if (!client) {
    console.warn("⚠️ Turso no configurado (faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN)");
    return false;
  }

  // 1. tracks (con columnas multimedia F8 + P2.5)
  await client.execute(`
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
      is_double_single INTEGER DEFAULT 0,
      sides_b TEXT,
      isrc TEXT,
      composers TEXT
    )
  `);

  // 2. artists (con user_id FK + P2.1)
  await client.execute(`
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

  // 3. users (P2.2)
  await client.execute(`
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

  // 4. track_submissions (P2.6)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS track_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      track_data TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      admin_notes TEXT,
      submission_type TEXT DEFAULT 'track',
      metadata TEXT,
      admin_id TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 5. likes
  await client.execute(`
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

  // 6. notifications
  await client.execute(`
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

  // 7. metrics_history
  await client.execute(`
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

  // 8. shows (P2.4)
  await client.execute(`
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

  // 9. subscriptions (P2.3)
  await client.execute(`
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

  return true;
}

// ─── Sync: Tracks ───────────────────────────────────────────────────────────

export async function syncLocalToTurso(localTracks: RawTrackRow[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: localTracks.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const track of localTracks) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO tracks
              (id, title, artist_name, release_type, release_date, duration, cover_image,
               audio_preview_url, spotify_url, youtube_video_id, metrics,
               production_details, lyrics, itunes_track_id, stems_urls,
               video_embed_url, gallery_images, external_links, disc_number, is_double_single,
               sides_b, isrc, composers)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          track.id,
          track.title,
          track.artist_name ?? null,
          track.release_type,
          track.release_date,
          track.duration,
          track.cover_image,
          track.audio_preview_url,
          track.spotify_url,
          track.youtube_video_id,
          track.metrics,
          track.production_details,
          track.lyrics,
          track.itunes_track_id ?? null,
          track.stems_urls ?? null,
          track.video_embed_url ?? null,
          track.gallery_images ?? null,
          (track as RawTrackRow & { external_links?: string | null }).external_links ?? null,
          (track as RawTrackRow & { disc_number?: number | null }).disc_number ?? 1,
          (track as RawTrackRow & { is_double_single?: number | null }).is_double_single ?? 0,
          (track as RawTrackRow & { sides_b?: string | null }).sides_b ?? null,
          (track as RawTrackRow & { isrc?: string | null }).isrc ?? null,
          (track as RawTrackRow & { composers?: string | null }).composers ?? null,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync ${track.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Artists ──────────────────────────────────────────────────────────

export async function syncArtistsToTurso(artists: ArtistProfile[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: artists.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const artist of artists) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO artists
              (id, name, user_id, biography, press_text, press_highlights,
               genre, location, monthly_listeners, social_links, profile_image,
               banner_image, slug, is_active, deleted_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          artist.id,
          artist.name,
          artist.user_id ?? null,
          artist.biography ?? null,
          artist.press_text ?? null,
          JSON.stringify(artist.press_highlights ?? []),
          artist.genre ?? null,
          artist.location ?? null,
          artist.monthly_listeners ?? 0,
          JSON.stringify(artist.social_links ?? []),
          artist.profile_image ?? null,
          artist.banner_image ?? null,
          artist.slug ?? null,
          artist.is_active ? 1 : 0,
          artist.deleted_at ?? null,
          artist.created_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync artist ${artist.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Users ────────────────────────────────────────────────────────────

export async function syncUsersToTurso(users: User[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: users.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO users
              (id, name, email, password_hash, role, preferences, avatar, email_verified, deleted_at, last_login, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          user.id,
          user.name,
          user.email,
          user.password_hash,
          user.role,
          JSON.stringify(user.preferences ?? {
            email_notifications: true,
            push_notifications: true,
            new_release_alerts: true,
            show_alerts: true,
            marketing_emails: false,
          }),
          user.avatar ?? null,
          user.email_verified ? 1 : 0,
          user.deleted_at ?? null,
          user.last_login ?? null,
          user.created_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync user ${user.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Track Submissions ────────────────────────────────────────────────

export async function syncSubmissionsToTurso(submissions: TrackSubmission[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: submissions.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const sub of submissions) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO track_submissions
              (id, user_id, track_data, status, admin_notes, submission_type, metadata, admin_id, reviewed_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          sub.id,
          sub.user_id,
          sub.track_data,
          sub.status,
          sub.admin_notes ?? null,
          sub.submission_type ?? "track",
          sub.metadata ?? null,
          sub.admin_id ?? null,
          sub.reviewed_at ?? null,
          sub.created_at,
          sub.updated_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync submission ${sub.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Likes ────────────────────────────────────────────────────────────

export async function syncLikesToTurso(likes: Like[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: likes.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const like of likes) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO likes
              (id, user_id, track_id, created_at)
              VALUES (?, ?, ?, ?)`,
        args: [like.id, like.user_id, like.track_id, like.created_at],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync like ${like.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Notifications ────────────────────────────────────────────────────

export async function syncNotificationsToTurso(notifications: Notification[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: notifications.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const notif of notifications) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO notifications
              (id, user_id, type, title, message, data, read, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          notif.id,
          notif.user_id,
          notif.type,
          notif.title,
          notif.message,
          notif.data ?? null,
          notif.read ? 1 : 0,
          notif.created_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync notification ${notif.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Metrics History ──────────────────────────────────────────────────

export async function syncMetricsHistoryToTurso(metrics: MetricsHistory[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: metrics.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const m of metrics) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO metrics_history
              (id, track_id, date, streams, saves, playlist_additions, top_countries, source, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          m.id,
          m.track_id,
          m.date,
          m.streams,
          m.saves,
          m.playlist_additions,
          JSON.stringify(m.top_countries),
          m.source,
          m.created_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync metrics ${m.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Shows ────────────────────────────────────────────────────────────

export async function syncShowsToTurso(shows: Show[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: shows.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const show of shows) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO shows
              (id, artist_id, venue_name, city, country, date, time, price_range, status, ticket_url,
               payment_methods, postponement_reason, flyer_url, ticket_link, description,
               guest_artists, notes, deleted_at, updated_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          show.id,
          show.artist_id,
          show.venue_name,
          show.city ?? null,
          show.country ?? null,
          show.date ?? null,
          show.time ?? null,
          show.price_range ?? null,
          show.status,
          show.ticket_url ?? null,
          JSON.stringify(show.payment_methods ?? []),
          show.postponement_reason ?? null,
          show.flyer_url ?? null,
          show.ticket_link ?? null,
          show.description ?? null,
          JSON.stringify(show.guest_artists ?? []),
          show.notes ?? null,
          show.deleted_at ?? null,
          show.updated_at ?? null,
          show.created_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync show ${show.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Sync: Subscriptions (P2.3) ───────────────────────────────────────────────

export async function syncSubscriptionsToTurso(subscriptions: Subscription[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: subscriptions.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO subscriptions
              (id, subscriber_id, artist_id, notify_releases, notify_shows, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          sub.id,
          sub.subscriber_id,
          sub.artist_id,
          sub.notify_releases ? 1 : 0,
          sub.notify_shows ? 1 : 0,
          sub.created_at,
        ],
      });
      synced++;
    } catch (e) {
      failed++;
      errors.push(`Error sync subscription ${sub.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { synced, failed, errors };
}

// ─── Fetch helpers ──────────────────────────────────────────────────────────
// NOTE: Cache busting for SELECT queries (same issue as db.ts)

let _tursoQueryCounter = 0;

function bustSelectCache(sql: string): string {
  if (sql.trimStart().toUpperCase().startsWith("SELECT")) {
    return `${sql} /*q${_tursoQueryCounter++}*/`;
  }
  return sql;
}

export async function fetchTursoTracks(): Promise<RawTrackRow[]> {
  const client = getTurso();
  if (!client) return [];

  const result = await client.execute(bustSelectCache("SELECT * FROM tracks"));
  return result.rows as unknown as RawTrackRow[];
}

export async function deleteTursoTrack(id: string): Promise<boolean> {
  const client = getTurso();
  if (!client) return false;

  await client.execute({ sql: "DELETE FROM tracks WHERE id = ?", args: [id] });
  return true;
}

export async function getTursoTrackCount(): Promise<number> {
  const client = getTurso();
  if (!client) return 0;

  const result = await client.execute(bustSelectCache("SELECT COUNT(*) as count FROM tracks"));
  const row = result.rows[0] as unknown as { count: number } | undefined;
  return row?.count ?? 0;
}

export function isTursoConfigured(): boolean {
  return getTurso() !== null;
}
