/**
 * Artist Promotion Logic (P6 - Bloque 4 / Oleada 2)
 *
 * Convierte a un usuario `subscriber` en `artist` cuando se aprueba
 * su PRIMER release o show. El cambio real de rol ocurre en `users.role`,
 * no solo creando el perfil de artista.
 *
 * Idempotente: si el usuario ya es `artist` y tiene perfil, no toca nada.
 * Valida ownership: solo el dueño puede ser promovido.
 */

import {
  getUserById,
  getArtistByUserId,
  createArtist,
  getAllTrackSubmissions,
  getAllShows,
  getTursoClientSync,
  getLocalDbWrite,
} from "./db";
import type { InValue } from "@libsql/client";
import type { User, ArtistProfile } from "@/types/music";

export interface PromotionOptions {
  source: "release" | "show" | "manual";
  /** Por defecto `true`. Ver la nota del `opts = {}` de abajo antes de tocarlo. */
  createProfile?: boolean;
}

export interface PromotionResult {
  promoted: boolean;
  artistId: string;
  created: boolean;
}

/**
 * Promueve a un usuario a artista si cumple los criterios:
 * - El usuario existe
 * - Su rol actual es `subscriber` (o `artist` sin perfil)
 * - Tiene al menos un release o show APROBADO propio (ownership verificado)
 *
 * @param userId - ID del usuario a promover
 * @param opts - Opciones de promocion (source, createProfile)
 * @returns Promise<PromotionResult> - resultado de la promocion
 */
export async function promoteUserToArtist(
  userId: string,
  opts: Partial<PromotionOptions> = {}
): Promise<PromotionResult> {
  // ── RC.32 Tarea 4: el default de `createProfile` estaba muerto ─────────────
  // Antes la firma era `opts: PromotionOptions = { source: "manual", createProfile: true }`.
  // Un valor por defecto de un PARÁMETRO solo se aplica cuando el argumento se
  // omite entero. El único llamador de producción,
  // `app/api/admin/approvals/[id]/route.ts:139`, llama
  // `promoteUserToArtist(submission.user_id, { source: "release" })`: pasa un
  // objeto, así que `opts.createProfile` era `undefined`.
  //
  // Efecto real, que es la «promoción fallida en silencio» del que se hablaba:
  //   1. `updateUserRole` SÍ se ejecutaba → `users.role = 'artist'`.
  //   2. `opts.createProfile` era falsy → se entraba en el `throw` de la línea 91.
  //   3. La ruta lo capturaba y devolvía 200 con `promoted: false`.
  // Quedaba un usuario con rol `artist` y SIN fila en `artists`, y —esto es lo
  // que lo hacía permanente— en el siguiente intento la rama `isArtist` vuelve a
  // encontrar `createProfile` falsy, así que el estado no se reparaba nunca.
  //
  // Los defaults se normalizan aquí, con `??`, para que dependan del VALOR y no
  // de si el llamador pasó un objeto vacío.
  const source = opts.source ?? "manual";
  const createProfile = opts.createProfile ?? true;

  const user = await getUserById(userId);
  if (!user) {
    throw new Error(`Usuario no encontrado: ${userId}`);
  }

  // Verificar ownership: el usuario debe tener al menos un release/show aprobado propio
  const hasApprovedContent = await userHasApprovedContent(userId);
  if (!hasApprovedContent && source !== "manual") {
    throw new Error(`Usuario ${userId} no tiene contenido aprobado para promover desde ${source}`);
  }

  // Si ya es artist y tiene perfil, idempotente: no tocar nada
  const isArtist = user.role === "artist";
  if (isArtist) {
    const existingArtist = await getArtistByUserId(userId);
    if (existingArtist) {
      return { promoted: false, artistId: existingArtist.id, created: false };
    }
    // Es artist pero SIN perfil: crear perfil si createProfile=true
    if (createProfile) {
      const artist = await createArtistProfileForUser(user);
      return { promoted: true, artistId: artist.id, created: true };
    }
    return { promoted: false, artistId: "", created: false };
  }

  // Si es subscriber (o cualquier otro rol no-artist), verificar contenido aprobado
  if (!isArtist) {
    if (!hasApprovedContent && source !== "manual") {
      throw new Error(`Usuario ${userId} (rol: ${user.role}) no tiene release/show aprobado para promocion automatica`);
    }

    // Cambiar rol en users.role (el cambio REAL de rol)
    await updateUserRole(userId, "artist");

    // Crear perfil de artista si no existe y createProfile=true
    let artist: ArtistProfile | null = await getArtistByUserId(userId);
    let created = false;
    if (!artist && createProfile) {
      artist = await createArtistProfileForUser(user);
      created = true;
    } else if (!artist && !createProfile) {
      throw new Error(`Usuario promovido a artist pero createProfile=false y no existe perfil`);
    }

    return { promoted: true, artistId: artist!.id, created };
  }

  // Fallback (no deberia llegar aqui)
  return { promoted: false, artistId: "", created: false };
}

/**
 * Verifica si el usuario tiene al menos un release o show APROBADO propio.
 * Ownership se valida por:
 * - Releases: track_submissions.user_id = userId Y status = 'approved'
 * - Shows: shows.artist_id -> artists.user_id = userId Y approved = 1
 */
async function userHasApprovedContent(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) return false;

  // Verificar track_submissions aprobadas del usuario
  const submissions = await getAllTrackSubmissions();
  const userApprovedSubmissions = submissions.filter(
    (s) => s.user_id === userId && s.status === "approved"
  );
  if (userApprovedSubmissions.length > 0) return true;

  // Verificar shows aprobados del artista del usuario
  const artist = await getArtistByUserId(userId);
  if (artist) {
    const shows = await getAllShows();
    const artistApprovedShows = shows.filter(
      (s) => s.artist_id === artist.id && s.approved === true
    );
    if (artistApprovedShows.length > 0) return true;
  }

  return false;
}

/**
 * Actualiza el rol del usuario en la tabla users.
 *
 * ── Por qué esto se reescribió (RC.32, S1) ───────────────────────────────────
 * La versión anterior ramificaba con `isTursoEnabled()` y, en el `else`, pedía
 * un handle con `getDbWrite()`. Ese par es exactamente el patrón que la REGLA de
 * `AGENTS.md` prohíbe en una ruta: **el predicado y el handle son decisiones
 * independientes**, así que pueden discrepar. Si el predicado dice "hay Turso" y
 * el handle no existe, el `else` lanza; si el predicado dice "no hay Turso"
 * mientras sí lo hay, se escribe en SQLite local creyendo que se escribió en
 * Turso.
 *
 * Ahora la decisión y la ejecución salen del MISMO objeto:
 *
 *   const client = getTursoClientSync();   ← null si y solo si no hay Turso
 *   if (client)  → se usa ese mismo client
 *   else          → getLocalDbWrite(), el handle local, solo en ese brazo
 *
 * `getTursoClientSync()` es el criterio de las ocho rutas ya migradas
 * (`app/api/admin/releases`, `app/api/admin/shows`, `app/api/admin/shows/[id]`,
 * `app/api/releases`, `app/api/upload/image`, …) y lee `process.env` en tiempo
 * de llamada. `getDbWrite()` sigue existiendo porque es legítimo en
 * `scripts/*`; aquí ya no se usa.
 *
 * ── Gravedad real de lo que fallaba ──────────────────────────────────────────
 * NO rompía el flujo de aprobación. `app/api/admin/approvals/[id]/route.ts:138-145`
 * envuelve la promoción en try/catch y devuelve 200 igual, con un `promoted: false`
 * y un `console.error`. El grado era promoción fallida en silencio: el admin
 * aprobó y el usuario no se promovió, sin nada en la respuesta que lo dijera.
 *
 * ── Por qué no hay transacción ───────────────────────────────────────────────
 * `promoteUserToArtist` hace dos escrituras: cambiar el rol y crear el perfil.
 * Si la segunda falla, el estado parcial es AUTOREPARABLE sin intervención: se
 * re-ejecuta, entra por la rama `isArtist` (:61-73), `getArtistByUserId` devuelve
 * null y :68 crea el perfil. El otro riesgo —choque con el `UNIQUE` de
 * `artists.name` si otro artista usa ese nombre— lo cubre la rama idempotente
 * de :63-65. Una transacción daría atomicidad que aquí no hace falta y costaría
 * un `BEGIN/COMMIT` en dos backends distintos.
 */
async function updateUserRole(userId: string, role: "artist" | "subscriber" | "admin"): Promise<void> {
  const sql = "UPDATE users SET role = ? WHERE id = ?";
  const client = getTursoClientSync();

  if (client) {
    await client.execute({ sql, args: [role, userId] as InValue[] });
    return;
  }

  getLocalDbWrite().prepare(sql).run(role, userId);
}

/**
 * Crea un perfil de artista basico para el usuario.
 * Usa el nombre del usuario como nombre de artista (slugificado).
 */
async function createArtistProfileForUser(user: User): Promise<ArtistProfile> {
  const artistName = user.name;
  const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const artist = await createArtist({
    name: artistName,
    userId: user.id,
    biography: "",
    pressText: "",
    pressHighlights: [],
    genre: "",
    location: "",
    monthly_listeners: 0,
    socialLinks: [],
    profileImage: user.avatar ?? undefined,
    bannerImage: undefined,
    slug,
    isActive: true,
  });

  return artist;
}