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

// ─── Environment detection ───────────────────────────────────────────────────
// ESTAS DOS CONSTANTES ESTABAN EN ÁMBITO DE MÓDULO Y ESO ERA UN BUG (RC.32, S1):
//
//   const TURSO_URL  = process.env.TURSO_DATABASE_URL;   // antes :31
//   const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;   // antes :32
//
// En ámbito de módulo se evalúan UNA vez, al importar. Con el env llegando
// después —que es lo normal en un bundle de Vercel, donde `process.env` se
// inyecta al construir— `TURSO_URL` quedaba en `undefined` para siempre y
// `getTursoClient()` devolvía `null` aunque las variables estuvieran puestas.
//
// El daño no era "Turso no funciona": era que los predicados derivados de este
// snapshot discrepaban de los de `lib/db.ts` (que sí lee en tiempo de llamada).
// Dos funciones chamadas igual, `isTursoConfigured`, con semántica distinta: una
// preguntaba por el snapshot, la otra por el env real. Una ruta que usara la
// primera para elegir rama y la segunda para ejecutar caía en 500.
//
// Los getters de abajo replican `lib/db.ts:59-64`. A partir de aquí TODO este
// módulo lee el env en TIEMPO DE LLAMADA y las dos copias coinciden.
export function getTursoUrl(): string | undefined {
  return process.env.TURSO_DATABASE_URL;
}
export function getTursoToken(): string | undefined {
  return process.env.TURSO_AUTH_TOKEN;
}

// Fresh client per request — singleton causes stale HTTP transport cache on Vercel
export function getTursoClient(): Client | null {
  const url = getTursoUrl();
  const token = getTursoToken();
  if (!url || !token) return null;
  return createClient({ url, authToken: token });
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

  // 1. tracks (con columnas multimedia F8 + P2.5 + streams + release approval)
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
      composers TEXT,
      genre TEXT,
      description TEXT,
      streams INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      updated_at TEXT,
      release_id TEXT,
      start_time REAL DEFAULT 0,
      end_time REAL DEFAULT 0,
      video_kind TEXT
    )
  `);
  // Migrate: add columns if missing (safe for existing tables)
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN streams INTEGER DEFAULT 0`); } catch {}
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN is_instrumental INTEGER DEFAULT 0`); } catch {}
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN status TEXT DEFAULT 'draft'`); } catch {}
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN updated_at TEXT`); } catch {}
  // P3 Batch 2: Multi-track releases + YouTube timestamps
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN release_id TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN start_time REAL DEFAULT 0`); } catch {}
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN end_time REAL DEFAULT 0`); } catch {}
  // M0: numeracion explicita de pista por disco (nullable, sin DEFAULT)
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN track_number INTEGER`); } catch {}
  // P3 Batch 2: Release form fields
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN genre TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN description TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN admin_notes TEXT`); } catch {}
  //
  // RC.33 · Ola 4 — `video_kind`. Sin `DEFAULT` y sin `NOT NULL`, a propósito:
  //
  //   - Nullable porque `NULL` significa "no clasificado", que no es lo mismo que
  //     `'videoclip'`. Un vídeo cuyo `video_kind` no se pudo determinar se queda
  //     sin dato en vez de afirmar que es el videoclip oficial.
  //   - Sin `DEFAULT` porque un `DEFAULT` es lo que hace un `REPLACE` destructivo
  //     silencioso (ver `readTrackVideoKinds` más abajo y, para el mismo
  //     problema, `artists.youtube_channel_id` en RC.32).
  //   - Sin `CHECK` porque SQLite no permite añadir una restricción a una tabla
  //     existente con `ALTER TABLE`, y una restricción que solo existe en el
  //     `CREATE TABLE` protegería únicamente a las bases nuevas. Quien escribe
  //     valida con `parseVideoKind` (`lib/youtube.ts`).
  try { await client.execute(`ALTER TABLE tracks ADD COLUMN video_kind TEXT`); } catch {}

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
      youtube_channel_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  // Migrate: add columns if missing (safe for existing tables)
  //
  // RC.32 · agente H — `youtube_channel_id`.
  //
  // Solo se rellena después de que `scripts/fetch-official-videos.ts` verifique
  // ESTRUCTURALMENTE que un canal es el oficial del artista (nombre exacto +
  // enlace en su descripción al dominio oficial declarado). Por eso es
  // nullable: un canal sin verificar es "desconocido", no "no existe".
  try { await client.execute(`ALTER TABLE artists ADD COLUMN youtube_channel_id TEXT`); } catch {}

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

  try { await client.execute(`ALTER TABLE track_submissions ADD COLUMN submission_type TEXT DEFAULT 'track'`); } catch {}
  try { await client.execute(`ALTER TABLE track_submissions ADD COLUMN metadata TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE track_submissions ADD COLUMN admin_id TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE track_submissions ADD COLUMN reviewed_at TEXT`); } catch {}

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
      approved INTEGER DEFAULT 0,
      deleted_at TEXT,
      updated_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (artist_id) REFERENCES artists(id)
    )
  `);
  // Migrate: add missing columns to existing shows table (P2.4 + P3)
  try { await client.execute(`ALTER TABLE shows ADD COLUMN payment_methods TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE shows ADD COLUMN postponement_reason TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE shows ADD COLUMN flyer_url TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE shows ADD COLUMN ticket_link TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE shows ADD COLUMN description TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE shows ADD COLUMN guest_artists TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE shows ADD COLUMN notes TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE shows ADD COLUMN deleted_at TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE shows ADD COLUMN updated_at TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE shows ADD COLUMN created_at TEXT DEFAULT (datetime('now'))`); } catch {}
  // D1: Add approved column for show approval workflow
  try { await client.execute(`ALTER TABLE shows ADD COLUMN approved INTEGER DEFAULT 0`); } catch {}

  // users schema drift fixes
  try { await client.execute(`ALTER TABLE users ADD COLUMN preferences TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE users ADD COLUMN avatar TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`); } catch {}
  try { await client.execute(`ALTER TABLE users ADD COLUMN deleted_at TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE users ADD COLUMN last_login TEXT`); } catch {}
  try { await client.execute(`ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now'))`); } catch {}

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

  // 10. dossiers (P3 Batch 2 Hotfix)
  await client.execute(`
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
      rider_pa_system TEXT DEFAULT 'Line Array - Minimo 15,000W RMS',
      rider_monitors TEXT DEFAULT 'Minimo 4 mezclas in-ear o wedge',
      rider_console TEXT DEFAULT 'Digital - minimo 32 canales',
      rider_subwoofers TEXT DEFAULT 'Minimo 4 sub-graves (18 o 21)',
      rider_guitar TEXT DEFAULT 'Amplificador Combo 100W o Head + Cabinet',
      rider_bass TEXT DEFAULT 'Amplificador Combo 300W minimo',
      rider_drums TEXT DEFAULT 'Kit completo + hardware + baquetas',
      rider_keyboards TEXT DEFAULT 'Piano digital 88 teclas con sustain',
      rider_lighting TEXT DEFAULT 'Iluminacion basica con focus en escenario',
      rider_stage_size TEXT DEFAULT 'Minimo 6m x 4m',
      rider_stage_conditions TEXT DEFAULT 'Escenario cubierto y seco',
      rider_hospitality TEXT DEFAULT 'Agua natural, cafe, frutas frescas, snacks antes del show',
      rider_transport TEXT DEFAULT 'Transporte desde hotel al venue incluido',
      rider_special_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (artist_id) REFERENCES artists(id)
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

  // RC.33 · Ola 4. Este INSERT OR REPLACE omite a propósito 8 columnas
  // (`release_id`, `start_time`, `end_time`, `track_number`, `genre`,
  // `description`, `admin_notes`, `updated_at`) y `REPLACE` es DELETE + INSERT:
  // lo omitido vuelve a DEFAULT. `video_kind` es una novena, y sin esto **cada
  // sync borraría la clasificación de todos los vídeos** — que es el trabajo de
  // 1483 candidatos y una verificación HTTP, y no se debe perder por un sync.
  // Es el mismo problema que RC.32 resolvió para `artists.youtube_channel_id`:
  // se lee antes y se devuelve el valor. Ver `readVerifiedYouTubeChannelIds`.
  const preservedVideoKinds = await readTrackVideoKinds(
    client,
    localTracks.map((t) => t.id),
  );

  for (const track of localTracks) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO tracks
              (id, title, artist_name, release_type, release_date, duration, cover_image,
               audio_preview_url, spotify_url, youtube_video_id, metrics,
               production_details, lyrics, itunes_track_id, stems_urls,
               video_embed_url, gallery_images, external_links, disc_number, is_double_single,
               sides_b, isrc, composers, status, video_kind)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          (track as RawTrackRow & { status?: string | null }).status ?? 'draft',
          (track as RawTrackRow & { video_kind?: string | null }).video_kind ??
            preservedVideoKinds.get(track.id) ??
            null,
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

/**
 * Lee los `tracks.video_kind` ya clasificados para poder **preservarlos**.
 *
 * Misma razón y mismo patrón que `readVerifiedYouTubeChannelIds` (RC.32), y por
 * el mismo motivo: añadir la columna al `INSERT` no basta, porque un
 * `RawTrackRow` construido a mano (que es lo que hace un script de seed) llega
 * sin `video_kind`, el `?? null` lo borraría, y la clasificación se perdería en
 * cada sincronización.
 *
 * Un valor que no es uno de los tres admitidos se descarta en vez de propagarse:
 * `video_kind` alimenta la UI, y un valor inventado ahí se pinta.
 */
async function readTrackVideoKinds(
  client: Client,
  trackIds: readonly string[],
): Promise<Map<string, string>> {
  const preserved = new Map<string, string>();
  const ids = trackIds.filter((id) => typeof id === 'string' && id.trim() !== '');
  if (ids.length === 0) return preserved;

  try {
    // En lotes de 500: por encima, SQLite (y Turso) choca con el límite de
    // variables por sentencia, y el fallo sería un error de SQL sin pista.
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const result = await client.execute({
        sql: `SELECT id, video_kind FROM tracks WHERE id IN (${chunk
          .map(() => '?')
          .join(', ')})`,
        args: [...chunk] as InValue[],
      });
      for (const row of result.rows) {
        const id = String(row.id ?? '');
        const kind = typeof row.video_kind === 'string' ? row.video_kind.trim() : '';
        if (id && kind) preserved.set(id, kind);
      }
    }
  } catch {
    // Si `video_kind` aún no existe en la tabla, el INSERT de abajo falla igual.
    // No se enmascara: el error sale con su mensaje, como en el caso de los
    // canales de artista.
  }
  return preserved;
}

// ─── Sync: Artists ──────────────────────────────────────────────────────────

/**
 * Lee los `youtube_channel_id` ya verificados para poder **preservarlos**.
 *
 * RC.32 · agente H. `syncArtistsToTurso` es un `INSERT OR REPLACE`, y eso
 * significa *borrar la fila e insertar otra*: cualquier columna que no esté en
 * la lista del `INSERT` vuelve a su `DEFAULT`, es decir a `NULL`. Añadir la
 * columna nueva al `INSERT` y dejar que valga `artist.youtube_channel_id ?? null`
 * haría que **cada sync borrase el id de canal de todos los artistas**, porque
 * `parseArtist` (`lib/db.ts`, fichero de otro agente) todavía no lo expone —y
 * aunque lo expusiera, el `?? null` de un `ArtistProfile` construido a mano
 * seguiría borrándolo.
 *
 * Así que se lee antes y se devuelve el valor: el sync sigue siendo idéntico en
 * todo lo demás, y perder un canal que costó 5 unidades de cuota y una
 * verificación estructural no depende de que otro fichero esté al día.
 */
async function readVerifiedYouTubeChannelIds(
  client: Client,
  artistIds: readonly string[],
): Promise<Map<string, string>> {
  const preserved = new Map<string, string>();
  const ids = artistIds.filter((id) => typeof id === 'string' && id.trim() !== '');
  if (ids.length === 0) return preserved;

  try {
    const result = await client.execute({
      sql: `SELECT id, youtube_channel_id FROM artists WHERE id IN (${ids
        .map(() => '?')
        .join(', ')})`,
      args: [...ids] as InValue[],
    });
    for (const row of result.rows) {
      const id = String(row.id ?? '');
      const channelId = typeof row.youtube_channel_id === 'string' ? row.youtube_channel_id.trim() : '';
      if (id && channelId) preserved.set(id, channelId);
    }
  } catch {
    // Si `youtube_channel_id` aún no existe en la tabla, `syncArtistsToTurso`
    // fallaría igualmente en el INSERT. No se enmascara: se deja pasar y el
    // error sale con su mensaje.
  }
  return preserved;
}

export async function syncArtistsToTurso(artists: ArtistProfile[]): Promise<SyncResult> {
  const client = getTurso();
  if (!client) {
    return { synced: 0, failed: artists.length, errors: ["Turso no configurado"] };
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  const preservedChannelIds = await readVerifiedYouTubeChannelIds(
    client,
    artists.map((a) => a.id),
  );

  for (const artist of artists) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO artists
              (id, name, user_id, biography, press_text, press_highlights,
               genre, location, monthly_listeners, social_links, profile_image,
               banner_image, slug, is_active, deleted_at, created_at,
               youtube_channel_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          // Prioridad: lo verificado que trae el propio artista; si no, lo que
          // ya estaba. Ver la nota de `readVerifiedYouTubeChannelIds`.
          (typeof artist.youtube_channel_id === 'string' && artist.youtube_channel_id.trim()) ||
            preservedChannelIds.get(artist.id) ||
            null,
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

/**
 * Escribe el `youtube_channel_id` de UN artista, en una sola columna.
 *
 * Existe separada de `syncArtistsToTurso` a propósito: la verificación del canal
 * es un dato que se gana una vez (5 unidades de cuota, una comprobación
 * estructural) y no se debe volver a perder en cada sincronización del catálogo.
 */
export async function setArtistYouTubeChannelId(
  artistId: string,
  channelId: string | null,
): Promise<boolean> {
  const client = getTurso();
  if (!client) return false;
  const value = typeof channelId === 'string' && channelId.trim() !== '' ? channelId.trim() : null;
  await client.execute({
    sql: "UPDATE artists SET youtube_channel_id = ? WHERE id = ?",
    args: [value, artistId] as InValue[],
  });
  return true;
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
               guest_artists, notes, approved, deleted_at, updated_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          show.approved ? 1 : 0,
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

// ─── Eliminado en RC.32: `isTursoConfigured()` ────────────────────────────────
//
// Este módulo exportaba una función con ESE MISMO NOMBRE y semántica distinta
// de la de `lib/db.ts`:
//
//   aquí    → getTurso() !== null, sobre un snapshot del env capturado al
//             importar el módulo (y por tanto congelado para siempre)
//   db.ts   → isTursoEnabled(), que lee process.env en tiempo de llamada
//
// Se han eliminado en vez de renombrarse a propósito: un nombre menos que
// colisiona. Cuando alguien importaba la equivocada, TypeScript no decía nada
// —el import era válido en los dos sitios— y el fallo era un 500 en producción,
// no un error de compilación.
//
// No la re-añadas aquí. Si la ruta necesita saber si hay cliente Turso, usa
// `getTursoClient() !== null` de este mismo módulo, que ya es de tiempo de
// llamada. Si necesita el predicado para una ruta que ramifica, usa
// `getTursoClientSync() !== null` de `@/lib/db`, que es el criterio de las ocho
// rutas ya migradas.
//
// NOTA sobre los 83 guards `if (isTursoConfigured()) return;` que hay en los
// tests: importan la de `@/lib/db`, no esta, y bajo vitest NUNCA saltan, porque
// `vitest.config.ts:7-8` hace `delete process.env.TURSO_DATABASE_URL` y
// `delete process.env.TURSO_AUTH_TOKEN` antes de que se cargue ningún módulo.
// Con el env ausente, `isTursoEnabled()` es falso y el guard no salta: el test
// corre contra SQLite local. Lo que protege Turso en los tests son esas dos
// líneas, no los guards. NO las borres de `vitest.config.ts` creyendo que los
// guards cubren: si el env se restaura, cualquier import mal resuelto pasa de
// latente a destructivo y `createUser()` escribe filas de QA en producción.
