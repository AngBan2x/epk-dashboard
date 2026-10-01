import { NextRequest, NextResponse } from "next/server";
import type { InValue } from "@libsql/client";
import { z } from "zod";
import {
  bustSelectCache,
  getApprovedTrackById,
  getLocalDbWrite,
  getTursoClientSync,
  isArtistOwnerOfTrackName,
  sameArtistName,
  resolveSubmitStatus,
  RELEASE_STATUSES,
  DECISION_STATUSES,
} from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import { validateTrackNumber } from "@/lib/validations";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyApprovalDecision } from "@/lib/approval-notifications";
import { notifyArtistSubscribers } from "@/lib/subscriber-notifications";
import { sumDurations } from "@/lib/null-safe";

const CreateReleaseSchema = z.object({
  title: z.string().min(1, "title requerido"),
  artist_name: z.string().min(1, "artist_name requerido"),
  release_date: z.string().optional(),
  cover_image: z.string().optional(),
  type: z.string().optional(),
  external_links: z.record(z.unknown()).optional(),
  tracks: z.array(z.object({ title: z.string(), duration: z.string().optional(), isrc: z.string().optional(), start_time: z.number().optional(), end_time: z.number().optional() })).optional(),
  // RC.32: `tracks.genre` es columna muerta (ver `lib/production-fields.ts`).
  // El género viaja en `production_details`, que es la fuente que se renderiza
  // y la que se exporta a PDF/CSV. Aceptarlo aquí sin escribirlo habría sido
  // otra promesa rota del formulario.
  production_details: z.union([z.record(z.unknown()), z.string()]).optional(),
  description: z.string().optional(),
  duration: z.string().optional(),
  status: z.enum(["draft", "pending"]).optional(),
});

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role };
}

// ── UNA sola fuente de verdad para la decisión Turso/local (GAP-B residual) ──
//
// Antes los helpers de esta ruta ramificaban con `isTursoConfigured()` de
// `@/lib/db` —que es alias de `isTursoEnabled()`, lee `process.env` en TIEMPO DE
// LLAMADA— y ejecutaban con `getTursoClient()` de `@/lib/turso` —que lee el env
// al IMPORTAR el módulo, `lib/turso.ts:31-32`. Con el env llegando después de esa
// primera evaluación, el caso normal en un bundle de Vercel, la primera decía
// "turso" y la segunda devolvía `null`: se lanzaba `"Turso client not
// available"` y la ruta respondía 500 en vez de degradar. Dos fuentes de verdad
// que no pueden coincidir, y una línea de `throw` en el hueco entre ellas.
//
// `getTursoClientSync() !== null` cierra el hueco: devuelve `null` si y solo si
// `isTursoEnabled()` es falso, y los dos leen `process.env` en tiempo de llamada.
// Es el mismo criterio que aplicaron E3 en `app/api/tracks/route.ts` y en las
// otras cinco rutas que aplanó.
//
// El handle local es `getLocalDbWrite()` y solo se abre cuando NO hay cliente:
// `getLocalDb()` es de solo lectura y esta ruta escribe (POST/PUT/DELETE), así
// que detrás de un cliente nunca se abre un `better-sqlite3` en un bundle de
// Vercel. Antes no existía este brazo —`getDbWrite()` era el que se llamaba, y
// la rama local no tenía forma de degradar—.
async function dbQuery(sql: string, params?: unknown[]): Promise<unknown[]> {
  const client = getTursoClientSync();
  if (client) {
    const result = await client.execute({
      sql: bustSelectCache(sql),
      args: (params ?? []) as InValue[],
    });
    return result.rows as unknown[];
  }
  const stmt = getLocalDbWrite().prepare(sql);
  return params ? stmt.all(...params) : stmt.all();
}

async function dbRun(sql: string, params?: unknown[]): Promise<void> {
  const client = getTursoClientSync();
  if (client) {
    await client.execute({ sql, args: (params ?? []) as InValue[] });
    return;
  }
  const stmt = getLocalDbWrite().prepare(sql);
  stmt.run(...(params ?? []));
}

type Stmt = { sql: string; params?: unknown[] };

/**
 * RC.32 — escritura de varias filas como UNA unidad.
 *
 * Hace falta por las hijas de un álbum (`tracks.release_id`): antes el PUT no
 * las escribía en absoluto, y ahora las escribe junto al padre y recalcula su
 * `duration`. Si el padre se actualizara y la lista de hijas se escribiera en
 * llamadas sueltas, un fallo a mitad dejaría el `duration` del padre
 * desincronizado del tracklist: la misma clase de pérdida silenciosa que
 * estamos cerrando, pero cambiada por otra.
 *
 * `client.batch()` de @libsql/client es una transacción: o entran todas las
 * sentencias o ninguna. En el brazo local se usa `db.transaction()`, que es lo
 * mismo para `better-sqlite3`. La decisión de backend sale de
 * `getTursoClientSync()`, la única fuente (ver cabecera del archivo).
 */
async function dbBatch(statements: Stmt[]): Promise<void> {
  if (statements.length === 0) return;
  const client = getTursoClientSync();
  if (client) {
    await client.batch(
      statements.map((s) => ({ sql: s.sql, args: (s.params ?? []) as InValue[] })),
      "write"
    );
    return;
  }
  const db = getLocalDbWrite();
  const runAll = db.transaction((list: Stmt[]) => {
    for (const s of list) {
      const stmt = db.prepare(s.sql);
      if (s.params && s.params.length > 0) stmt.run(...s.params);
      else stmt.run();
    }
  });
  runAll(statements);
}

interface ArtistRow {
  id: string;
  name: string;
  user_id: string | null;
}

/**
 * RC.32 — los perfiles de artista del usuario de la SESIÓN.
 *
 * Es la base del único invariante de propiedad de esta ruta: "el
 * `artist_name` de la fila tiene que ser uno de los míos". POST y PUT usaban
 * reglas distintas (payload vs. DB) y por eso un espacio trailing tecleado
 * pasaba una y no la otra.
 */
async function getSessionArtistRows(userId: string): Promise<ArtistRow[]> {
  const rows = await dbQuery("SELECT id, name, user_id FROM artists WHERE user_id = ?", [userId]);
  return (rows as ArtistRow[])
    .filter((r) => typeof r.name === "string" && r.name.trim().length > 0)
    .map((r) => ({ id: String(r.id), name: String(r.name), user_id: r.user_id ?? null }));
}

/**
 * RC.32 — dado un `artist_name` (del payload en POST, de la fila en PUT),
 * devuelve el perfil de artista del usuario que lo reclama, o `null`.
 *
 * La comparación es `sameArtistName` (trim + case) — la regla compartida de
 * `lib/db.ts`. Lo que se ESCRIBE, en cambio, es `row.name`: el valor canónico
 * de la fila de `artists`. Comparar normalizado y luego persistir el texto
 * tecleado seguiría creando la fila huérfana que esto arregla, porque `tracks`
 * se relaciona con `artists` por nombre y no por FK.
 */
function resolveOwnedArtistName(myArtists: ArtistRow[], candidate: string): ArtistRow | null {
  return myArtists.find((a) => sameArtistName(a.name, candidate)) ?? null;
}

// ── Hijas de un release (`tracks.release_id`) ─────────────────────────────────

const CHILD_TITLE_MAX = 200;
const CHILD_DURATION_MAX = 32;
const CHILD_ISRC_MAX = 32;

interface ChildInput {
  title: string;
  duration: string;
  isrc: string;
  start_time: number;
  end_time: number;
  track_number: number | null;
}

interface ReleaseRowForChildren {
  artist_name: string;
  release_type?: string | null;
  release_date?: string | null;
  cover_image?: string | null;
  youtube_video_id?: string | null;
}

interface ChildPlan {
  /** Mensaje de 400 si el payload de hijas no es utilizable. */
  error?: string;
  /** Hijas ya validadas (para el `sumDurations` del padre). */
  children?: ChildInput[];
  /** Sentencias de escritura, en orden, para la transacción del PUT. */
  statements?: Stmt[];
}

/** `null` = valor inválido. Ausente/`null` = cadena vacía. */
function readChildString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > max ? null : trimmed;
}

/** `null` = valor inválido. Ausente = 0. */
function readChildSeconds(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * RC.32 Tarea 4 — plan de escritura de las hijas de un álbum.
 *
 * ── El fallo que cierra ────────────────────────────────────────────────────
 * El formulario de edición siempre mandó `tracks`, y `tracks` NO estaba en
 * `ALLOWED_COLUMNS`. La clave se filtraba en `safeKeys` y se perdía sin error:
 * el artista escribía el título, la duración y el ISRC de cada pista del álbum
 * y el guardado respondía 200 sin haber escrito nada. Una promesa rota, no un
 * error visible.
 *
 * ── Reconciliación ──────────────────────────────────────────────────────────
 * POSICIONAL, contra las hijas existentes ordenadas igual que las devuelve el
 * GET privilegiado (`COALESCE(track_number, 9999), start_time, id`): la i-ésima
 * entrada actualiza la i-ésima fila, las que sobran se insertan como `draft`
 * (igual que el POST) y las hijas que quedan fuera del payload se borran.
 * Cada `UPDATE`/`DELETE` lleva `AND release_id = ?` en el `WHERE`: un PUT
 * nunca alcanza a una fila que no sea hija de ESTE release.
 *
 * ── Por qué un array vacío se rechaza en vez de interpretarse ───────────────
 * Vacío significa dos cosas incompatibles: "no tengo hijas" y "el formulario
 * no las cargó". Con el GET arreglado (Task 2) el formulario sí las carga, pero
 * un bundle antiguo en caché —o cualquier cliente nuevo mal escrito— enviaría
 * vacío y borraría el tracklist de un álbum aprobado de un golpe. Ante la duda
 * se devuelve 400 con el motivo, y el contrato es explícito: **omitir `tracks`
 * significa "no las toques"**.
 */
async function planChildren(
  releaseId: string,
  releaseRow: ReleaseRowForChildren,
  raw: unknown
): Promise<ChildPlan> {
  if (raw === undefined) return {};

  if (!Array.isArray(raw)) {
    return { error: "tracks debe ser un array de pistas hijas" };
  }

  const existingRows = await dbQuery(
    `SELECT id FROM tracks WHERE release_id = ?
      ORDER BY COALESCE(track_number, 9999), start_time, id`,
    [releaseId]
  ) as { id: string }[];

  if (raw.length === 0) {
    if (existingRows.length > 0) {
      return {
        error:
          `Este release ya tiene ${existingRows.length} pista(s) hija(s) y el payload ` +
          "llega con la lista vacía, lo que las borraría. Envía la lista completa " +
          "o omite el campo `tracks` para no tocarlas.",
      };
    }
    return {};
  }

  const children: ChildInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return { error: `tracks[${i}] debe ser un objeto` };
    }
    const fields = entry as Record<string, unknown>;

    const title = readChildString(fields.title, CHILD_TITLE_MAX);
    if (title === null) {
      return { error: `tracks[${i}].title debe ser un texto de hasta ${CHILD_TITLE_MAX} caracteres` };
    }
    if (title === "") {
      return { error: `tracks[${i}].title no puede estar vacío` };
    }

    const duration = readChildString(fields.duration, CHILD_DURATION_MAX);
    if (duration === null) {
      return { error: `tracks[${i}].duration debe ser un texto de hasta ${CHILD_DURATION_MAX} caracteres` };
    }

    const isrc = readChildString(fields.isrc, CHILD_ISRC_MAX);
    if (isrc === null) {
      return { error: `tracks[${i}].isrc debe ser un texto de hasta ${CHILD_ISRC_MAX} caracteres` };
    }

    const startTime = readChildSeconds(fields.start_time);
    if (startTime === null) {
      return { error: `tracks[${i}].start_time debe ser un número >= 0` };
    }

    const endTime = readChildSeconds(fields.end_time);
    if (endTime === null) {
      return { error: `tracks[${i}].end_time debe ser un número >= 0` };
    }

    // `TrackNumberSchema` rechaza `undefined` (exige número), pero aquí
    // "no enviado" es lo mismo que "sin numerar": `null`.
    const rawNumber = fields.track_number === "" ? null : fields.track_number;
    const trackNumber =
      rawNumber === undefined || rawNumber === null ? null : validateTrackNumber(rawNumber);
    if (trackNumber === undefined) {
      return { error: `tracks[${i}].track_number debe ser un entero >= 0 o null` };
    }

    children.push({
      title,
      duration,
      isrc,
      start_time: startTime,
      end_time: endTime,
      track_number: trackNumber,
    });
  }

  const statements: Stmt[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (i < existingRows.length) {
      statements.push({
        sql:
          `UPDATE tracks SET title = ?, duration = ?, isrc = ?, start_time = ?, end_time = ?, track_number = ?
            WHERE id = ? AND release_id = ?`,
        params: [
          child.title,
          child.duration,
          child.isrc,
          child.start_time,
          child.end_time,
          child.track_number,
          existingRows[i].id,
          releaseId,
        ],
      });
    } else {
      statements.push({
        sql:
          `INSERT INTO tracks (id, title, artist_name, release_type, release_date, cover_image, duration,
                  isrc, youtube_video_id, release_id, start_time, end_time, track_number, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'))`,
        params: [
          crypto.randomUUID(),
          child.title,
          releaseRow.artist_name,
          releaseRow.release_type || "single",
          releaseRow.release_date || "",
          releaseRow.cover_image || "",
          child.duration,
          child.isrc,
          releaseRow.youtube_video_id || null,
          releaseId,
          child.start_time,
          child.end_time,
          child.track_number,
        ],
      });
    }
  }
  for (const removed of existingRows.slice(children.length)) {
    statements.push({
      sql: "DELETE FROM tracks WHERE id = ? AND release_id = ?",
      params: [removed.id, releaseId],
    });
  }

  return { children, statements };
}

async function getArtistNamesByUserId(userId: string): Promise<string[]> {
  const rows = await getSessionArtistRows(userId);
  return rows.map((row) => row.name);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    const id = searchParams.get("id");

    let artistNames: string[] | null = null;
    let publicOnly = false;
    if (userId) {
      artistNames = await getArtistNamesByUserId(userId);
      if (artistNames.length === 0) {
        return NextResponse.json(id ? null : []);
      }
      const session = await validateSession(req);
      publicOnly = !session || (session.role !== "admin" && session.userId !== userId);
    }
    const visibilityClause = publicOnly ? " AND status = 'approved'" : "";

    if (id) {
      if (artistNames) {
        // Camino `?id=X&user_id=Y`: el alcance ya está acotado por los nombres
        // de artista del usuario. Para el dueño o el admin sigue viendo todos
        // los estados; para el resto, solo `approved`. Se mantiene el `SELECT *`
        // porque aquí el llamante ya está autenticado y por rol o por
        // propiedad, y el formulario de edición necesita `description` y
        // `production_details`, que no forman parte del tipo `Track`.
        let query = "SELECT * FROM tracks WHERE id = ?";
        const params: string[] = [id];
        query += ` AND artist_name IN (${artistNames.map(() => "?").join(", ")})${visibilityClause}`;
        params.push(...artistNames);
        const releases = await dbQuery(query, params);
        return NextResponse.json(releases[0] || null);
      }

      // Camino `?id=X` SIN `user_id`. Es la vía que usa el formulario de edición
      // (`app/releases/[id]/edit/page.tsx:75`): sin `user_id`, sin cabeceras de
      // sesión en el request inicial y con el id en la URL.
      //
      // ── RC.32: el ORDEN estaba al revés y por eso el formulario perdía datos ──
      // Antes se servía primero el lector PÚBLICO (`getApprovedTrackById`, que
      // pasa por `parseTrack`) y solo si no estaba aprobado se exigía sesión:
      //
      //   const approved = await getApprovedTrackById(id);
      //   if (approved) return NextResponse.json(approved);   // ← return aquí
      //
      // Las 83 filas de producción están en `approved` (las puso
      // `scripts/fix-release-status.ts:53`), así que ese `return` se llevaba
      // SIEMPRE. La rama privilegiada de abajo —la que sí devuelve la fila
      // cruda con `description`, `production_details` y `admin_notes`, y que el
      // comentario llama "para el dueño y el admin"— era INALCANZABLE para
      // cualquier release aprobado. El comentario describe un caso que la
      // función no ejecutaba nunca.
      //
      // El efecto era peor que una respuesta pobre: el formulario cargaba
      // `description: ""`, y en cuanto se arregló el 403 (que hasta entonces
      // tapaba esto) el siguiente guardado vació la descripción de las 83
      // filas. Arreglar el 403 sin esto habría convertido un 403 en pérdida
      // de datos.
      //
      // Ahora: primero sesión + rol/propiedad sobre la fila CRUDA; solo si eso
      // no se cumple, el lector público. Lo que NO cambia es QUIÉN ve qué:
      // el público sigue recibiendo `parseTrack` (y por tanto nunca
      // `admin_notes`), y un no-propietario autenticado también.
      const session = await validateSession(req);

      if (session) {
        // `getTrackById` pasa por `parseTrack`, que NO expone `admin_notes`,
        // `description` ni `genre`. Para el dueño y el admin eso es una pérdida
        // real: el formulario de edición muestra el motivo del rechazo y edita
        // la descripción. Por eso este camino devuelve la fila cruda, igual
        // que el `?id&user_id` de arriba.
        const privileged = await dbQuery("SELECT * FROM tracks WHERE id = ?", [id]) as Record<string, unknown>[];
        const row = privileged[0];
        if (row) {
          const isAdmin = session.role === "admin";
          const owns = await isArtistOwnerOfTrackName(String(row.artist_name ?? ""), session.userId);
          if (isAdmin || owns) {
            // El formulario de edición necesita además las HIJAS
            // (`tracks.release_id = id`) para no guardarlas en blanco: no hay
            // columna `tracks` y `parseTrack` no la inventa, así que
            // `data.tracks` era SIEMPRE `undefined` y el tracklist de un
            // álbum aparecía como una única fila vacía. Adjuntarlas solo en
            // este brazo —dueño o admin— para que el público no reciba filas
            // crudas de hijos que no ha pedido.
            const children = await dbQuery(
              `SELECT * FROM tracks WHERE release_id = ?
                ORDER BY COALESCE(track_number, 9999), start_time, id`,
              [id]
            );
            return NextResponse.json({ ...row, tracks: children });
          }
        }
      }

      // No privilegiado (o sin fila): solo la vía pública, que devuelve
      // `parseTrack` — sin `admin_notes`, sin `description`, sin `genre`.
      const approved = await getApprovedTrackById(id);
      if (approved) return NextResponse.json(approved);

      return NextResponse.json(null);
    }

    let query = "SELECT * FROM tracks WHERE 1=1";
    const params: string[] = [];

    if (artistNames) {
      query += ` AND artist_name IN (${artistNames.map(() => "?").join(", ")})${visibilityClause}`;
      params.push(...artistNames);
    }

    query += " ORDER BY created_at DESC";

    const releases = await dbQuery(query, params);
    return NextResponse.json(releases);
  } catch (error) {
    console.error("GET releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (session.role !== "admin" && session.role !== "artist") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const blocked = enforceRateLimit(req, "releases", session.userId, 10);
    if (blocked) return blocked;

    const body = await req.json();

    const parsed = CreateReleaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // RC.32 — una sola regla de propiedad, la misma que usa el PUT.
    //
    // Antes: `POST` comparaba el `artist_name` del PAYLOAD con `===` contra la
    // fila de `artists`, y el PUT comparaba el de la DB. Dos reglas para el
    // mismo invariante, y por lo tanto un tecleo con consecuencias distintas en
    // cada una: un espacio trailing pasaba el POST y escribía la fila con ese
    // nombre. Como `tracks` se relaciona con `artists` POR NOMBRE y no por FK,
    // esa fila quedaba fuera de la cascada de `deleteArtist` y de toda
    // verificación de propiedad posterior — huérfana, en silencio.
    //
    // `resolveOwnedArtistName` compara normalizado (trim + case) y devuelve la
    // fila canónica. Lo que se INSERTa es `owned.name`, nunca el texto del
    // payload: comparar normalizado y luego persistir el tecleo seguiría
    // creando la huérfana.
    const myArtists = await getSessionArtistRows(session.userId);
    const owned = resolveOwnedArtistName(myArtists, parsed.data.artist_name);
    if (session.role === "artist" && !owned) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const artistName = owned ? owned.name : parsed.data.artist_name;

    const id = crypto.randomUUID();
    const {
      title,
      release_date,
      cover_image,
      type,
      external_links,
      tracks,
      production_details,
      description,
      duration,
      status,
    } = parsed.data;

    const youtubeVideoId = external_links?.youtube_video_id;

    const initialStatus = status || "draft";

    // RC.32: `genre` fuera del INSERT (columna muerta, ver
    // `lib/production-fields.ts`) y `production_details` dentro, que es donde
    // el género vive de verdad y lo que se renderiza y se exporta.
    const productionDetailsJson =
      production_details === undefined
        ? null
        : typeof production_details === "string"
          ? production_details
          : JSON.stringify(production_details);

    await dbRun(
      `INSERT INTO tracks (id, title, artist_name, release_type, release_date, cover_image, description, duration, youtube_video_id, external_links, production_details, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, title, artistName || "", type || "single", release_date || "", cover_image || "", description || "", duration || "", youtubeVideoId || "", JSON.stringify(external_links || {}), productionDetailsJson, initialStatus]
    );

    // Insert tracks if provided
    if (tracks && Array.isArray(tracks)) {
      for (const track of tracks) {
        if (track.title) {
          const trackId = crypto.randomUUID();
          await dbRun(
            `INSERT INTO tracks (id, title, artist_name, release_type, release_date, cover_image, duration, isrc, youtube_video_id, release_id, start_time, end_time, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'))`,
            [
              trackId,
              track.title,
              artistName || "",
              type || "single",
              release_date || "",
              cover_image || "",
              track.duration || "",
              track.isrc || "",
              youtubeVideoId || null,
              id,  // release_id = parent release id
              track.start_time || 0,
              track.end_time || 0,
            ]
          );
        }
      }

      // For single-track releases, copy duration from child to parent
      if (tracks.length === 1 && tracks[0].duration) {
        await dbRun("UPDATE tracks SET duration = ? WHERE id = ?", [tracks[0].duration, id]);
      }
    }

    return NextResponse.json({ id, message: "Release creado exitosamente" }, { status: 201 });
  } catch (error) {
    console.error("POST releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    // `tracks` sale del resto a propósito: las hijas NO son una columna y no
    // pueden viajar por la allowlist de columnas sueltas (ver más abajo).
    const { id, status, tracks: rawChildTracks, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const existing = await dbQuery(
      `SELECT id, title, artist_name, status, release_type, release_date,
              cover_image, youtube_video_id
         FROM tracks WHERE id = ?`,
      [id]
    ) as {
      id: string;
      title: string;
      artist_name: string;
      status?: string | null;
      release_type?: string | null;
      release_date?: string | null;
      cover_image?: string | null;
      youtube_video_id?: string | null;
    }[];
    if (!existing.length) {
      return NextResponse.json({ error: "Release no encontrado" }, { status: 404 });
    }
    const releaseRow = existing[0];

    // ── RC.32 Tarea 3: la MISMA regla de propiedad que el POST ────────────────
    // `resolveOwnedArtistName` sobre los perfiles del usuario de la sesión. Con
    // esto PUT y POST comparten invariante: no hay dos reglas que un tecleo
    // pueda distinguir.
    const myArtists = await getSessionArtistRows(session.userId);
    const ownsTrack = resolveOwnedArtistName(myArtists, releaseRow.artist_name) !== null;
    if (!ownsTrack && session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // El artista dueño del release se resuelve por el NOMBRE de la fila, no por
    // el `user_id` de la sesión: las notificaciones de una decisión del ADMIN
    // tienen que llegar a quien sea que lo posea.
    const releaseArtistRows = await dbQuery(
      "SELECT id, name, user_id FROM artists WHERE name = ?",
      [releaseRow.artist_name]
    ) as ArtistRow[];
    const releaseArtist = releaseArtistRows[0] ?? null;

    const previousStatus = releaseRow.status ?? "draft";

    // Handle youtube_video_id from external_links
    if (updates.external_links && updates.external_links.youtube_video_id) {
      updates.youtube_video_id = updates.external_links.youtube_video_id;
    }

    // Handle external_links JSON stringify
    if (updates.external_links) {
      updates.external_links = JSON.stringify(updates.external_links);
    }

    // ── RC.32 Tarea 1: el estado lo decide el SERVIDOR ────────────────────────
    // Toda la regla vive en `resolveSubmitStatus` (`lib/db.ts`), que es pura y
    // está testeada como matriz. El comentario largo está allí; aquí solo se
    // aplica.
    const resolved = resolveSubmitStatus({
      role: session.role,
      requested: status,
      previous: previousStatus,
    });
    if (!resolved) {
      return NextResponse.json(
        { error: `Estado inválido. Debe ser: ${RELEASE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const { nextStatus, ignored: statusIgnored } = resolved;
    const isAdmin = session.role === "admin";

    const ALLOWED_COLUMNS = new Set([
      // RC.32: `artist_name` FUERA. `tracks` se relaciona con `artists` por
      // nombre y no por FK, así que permitir reescribirlo deja que el dueño
      // mueva su release bajo otro artista —o lo deje huérfano— y con ello lo
      // saque de la cascada de `deleteArtist`. El ownership se verificaba
      // contra la fila existente, nunca contra el valor nuevo.
      "title", "release_date", "cover_image", "release_type",
      // RC.32: `genre` FUERA también — columna muerta (ver
      // `lib/production-fields.ts`). El género va en `production_details`.
      "description", "duration", "youtube_video_id", "external_links",
      "status", "spotify_url", "audio_preview_url", "itunes_track_id",
      "stems_urls", "video_embed_url", "gallery_images", "disc_number",
      "is_double_single", "sides_b", "isrc", "composers", "is_instrumental",
      "streams", "metrics", "production_details", "lyrics",
      "start_time", "end_time", "track_number",
    ]);

    // M0: this PUT is a passthrough allowlist, so track_number needs a bound
    // before it reaches SQL. Anything not an integer >= 0 (or null) is a 400.
    if ("track_number" in updates) {
      const trackNumber = validateTrackNumber(updates.track_number);
      if (trackNumber === undefined) {
        return NextResponse.json(
          { error: "track_number debe ser un entero >= 0 o null" },
          { status: 400 }
        );
      }
      updates.track_number = trackNumber;
    }

    // ── RC.32 Tarea 4: las hijas de un álbum ────────────────────────────────
    // El formulario mandaba `tracks: tracks.filter(t => t.title)` y `tracks` NO
    // estaba en la allowlist: título, duración e ISRC de cada hija se perdían
    // sin error ni aviso.
    const childPlan = await planChildren(id, releaseRow, rawChildTracks);
    if (childPlan.error) {
      return NextResponse.json({ error: childPlan.error }, { status: 400 });
    }

    const safeKeys = Object.keys(updates).filter((k) => ALLOWED_COLUMNS.has(k));

    // El `duration` del padre es la suma de las hijas (`sumDurations`,
    // contrato RC.31 de `lib/null-safe.ts`), igual que ya hacía el POST con la
    // hija única. Si NO hay nada sumable —todas las duraciones vacías— se deja
    // el valor del payload: un álbum sin duraciones no debe renderizar "0:00"
    // como si fuera real ni borrar un total escrito a mano.
    if (childPlan.children && childPlan.children.length > 0) {
      const total = sumDurations(childPlan.children.map((c) => c.duration));
      if (total) {
        updates.duration = total.label;
        if (!safeKeys.includes("duration")) safeKeys.push("duration");
      }
    }

    const setClauses = safeKeys.map((key) => `${key} = ?`);
    const setValues = safeKeys.map((key) => updates[key]);
    if (nextStatus !== previousStatus) {
      setClauses.push("status = ?");
      setValues.push(nextStatus);
    }

    if (setClauses.length === 0 && (childPlan.children?.length ?? 0) === 0) {
      // No hay nada que escribir. Si el body traía un `status` —ignorado o
      // repetido— la operación es válida y no hace nada: 200 con el estado
      // vigente. El 400 es solo para un body sin NADA actualizable, que antes
      // también lo era y se conserva.
      if (statusIgnored || typeof status === "string") {
        return NextResponse.json({
          message: "Release actualizado",
          status: nextStatus,
          ...(statusIgnored ? { statusIgnored: true } : {}),
        });
      }
      return NextResponse.json({ error: "Sin campos válidos para actualizar" }, { status: 400 });
    }

    const statements: Stmt[] = [];
    if (setClauses.length > 0) {
      statements.push({
        sql: `UPDATE tracks SET ${setClauses.join(", ")} WHERE id = ?`,
        params: [...setValues, id],
      });
    }
    if (childPlan.statements) statements.push(...childPlan.statements);

    await dbBatch(statements);

    if (isAdmin && nextStatus !== previousStatus && DECISION_STATUSES.includes(nextStatus)) {
      try {
        const ownerUserId = releaseArtist?.user_id ?? null;
        const artistId = releaseArtist?.id ?? null;
        const artistName = releaseRow.artist_name;
        const trackTitle = releaseRow.title;

        if (ownerUserId) {
          const type =
            nextStatus === "approved"
              ? "submission_approved"
              : nextStatus === "rejected"
                ? "submission_rejected"
                : "revision_requested";
          const title =
            nextStatus === "approved"
              ? "¡Tu release ha sido aprobado!"
              : nextStatus === "rejected"
                ? "Tu release no fue aprobado"
                : "Tu release necesita cambios";
          const message =
            nextStatus === "approved"
              ? `"${trackTitle}" ya está disponible en el catálogo.`
              : nextStatus === "rejected"
                ? "Razón: no se especificó motivo."
                : "Por favor revisa y actualiza la información.";

          await notifyApprovalDecision({
            userId: ownerUserId,
            type,
            title,
            message,
            data: { releaseId: id, trackTitle, artistName },
            context: "release",
          });
        }

        if (nextStatus === "approved" && artistId) {
          await notifyArtistSubscribers({
            artistId,
            kind: "release",
            title: "Nuevo release publicado",
            message: `"${trackTitle}" de ${artistName} ya está disponible en PressPlay.`,
            data: {
              releaseId: id,
              track_id: id,
              trackTitle,
              artistName,
              dashboardUrl: "/releases",
            },
            emailType: "new_release",
            emailData: {
              trackTitle,
              artistName,
              dashboardUrl: `/releases/${id}`,
            },
          });
        }
      } catch (notificationError) {
        console.error("PUT releases notificación (no fatal):", notificationError);
      }
    }

    return NextResponse.json({
      message: "Release actualizado",
      status: nextStatus,
      ...(statusIgnored ? { statusIgnored: true } : {}),
      ...(childPlan.children ? { tracksSaved: childPlan.children.length } : {}),
    });
  } catch (error) {
    console.error("PUT releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const existing = await dbQuery("SELECT artist_name FROM tracks WHERE id = ?", [id]) as { artist_name: string }[];
    if (!existing.length) {
      return NextResponse.json({ error: "Release no encontrado" }, { status: 404 });
    }
    const artistRow = await dbQuery("SELECT user_id FROM artists WHERE name = ?", [existing[0].artist_name]) as { user_id: string }[];
    const ownsTrack = artistRow.length > 0 && artistRow[0].user_id === session.userId;
    if (!ownsTrack && session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await dbRun("DELETE FROM tracks WHERE id = ?", [id]);
    return NextResponse.json({ message: "Release eliminado" });
  } catch (error) {
    console.error("DELETE releases error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
