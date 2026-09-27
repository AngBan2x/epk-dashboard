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
  isTursoEnabled,
  tursoExecUpdate,
  getDbWrite,
} from "./db";
import type { User, ArtistProfile } from "@/types/music";

export interface PromotionOptions {
  source: "release" | "show" | "manual";
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
  opts: PromotionOptions = { source: "manual", createProfile: true }
): Promise<PromotionResult> {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error(`Usuario no encontrado: ${userId}`);
  }

  // Verificar ownership: el usuario debe tener al menos un release/show aprobado propio
  const hasApprovedContent = await userHasApprovedContent(userId);
  if (!hasApprovedContent && opts.source !== "manual") {
    throw new Error(`Usuario ${userId} no tiene contenido aprobado para promover desde ${opts.source}`);
  }

  // Si ya es artist y tiene perfil, idempotente: no tocar nada
  const isArtist = user.role === "artist";
  if (isArtist) {
    const existingArtist = await getArtistByUserId(userId);
    if (existingArtist) {
      return { promoted: false, artistId: existingArtist.id, created: false };
    }
    // Es artist pero SIN perfil: crear perfil si createProfile=true
    if (opts.createProfile) {
      const artist = await createArtistProfileForUser(user);
      return { promoted: true, artistId: artist.id, created: true };
    }
    return { promoted: false, artistId: "", created: false };
  }

  // Si es subscriber (o cualquier otro rol no-artist), verificar contenido aprobado
  if (!isArtist) {
    if (!hasApprovedContent && opts.source !== "manual") {
      throw new Error(`Usuario ${userId} (rol: ${user.role}) no tiene release/show aprobado para promocion automatica`);
    }

    // Cambiar rol en users.role (el cambio REAL de rol)
    await updateUserRole(userId, "artist");

    // Crear perfil de artista si no existe y createProfile=true
    let artist: ArtistProfile | null = await getArtistByUserId(userId);
    let created = false;
    if (!artist && opts.createProfile) {
      artist = await createArtistProfileForUser(user);
      created = true;
    } else if (!artist && !opts.createProfile) {
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
 * NOTA: Esto requiere acceso directo a la DB. Usamos getDbWrite() para consistencia.
 */
async function updateUserRole(userId: string, role: "artist" | "subscriber" | "admin"): Promise<void> {
  if (isTursoEnabled()) {
    await tursoExecUpdate("UPDATE users SET role = ? WHERE id = ?", [role, userId]);
  } else {
    const db = getDbWrite();
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
  }
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