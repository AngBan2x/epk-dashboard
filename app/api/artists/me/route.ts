import { NextRequest, NextResponse } from "next/server";
import { getAllArtists, getArtistByUserId, updateArtist } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function validateSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "artist" };
}

export async function GET(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const artist = await getArtistByUserId(session.userId);
    if (!artist) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    return NextResponse.json(artist);
  } catch (error) {
    console.error("GET artist profile error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const artist = await getArtistByUserId(session.userId);
    if (!artist) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    const body = await req.json();
    const { name, bio, biography, genre, country, city, location, profile_image, banner_image, slug, social_links } = body;

    // Check UNIQUE constraint on name if changing
    const newName = name || artist.name;
    if (newName !== artist.name) {
      // Tercer patrón del repo, y el peor de los tres: la ruta no miraba ningún
      // flag, solo la veracidad de `getTursoClient()` de `@/lib/turso`, que lee
      // `process.env` al IMPORTAR el módulo (`lib/turso.ts:31-32`). Con el env
      // llegando después de esa primera evaluación tomaba la rama local y
      // escribía en la réplica SQLite de producción sin avisar — un 200 con un
      // `PATCH` que no persistió, que es peor que un 500. Ahora la comprobación
      // pasa por `getAllArtists()`, que ramifica con `isTursoEnabled()` en tiempo
      // de llamada y por los dos lados, y desaparece `getDbWrite()`.
      //
      // El `===` reproduce el `WHERE name = ?` de antes: la columna no declara
      // `COLLATE NOCASE`, así que SQLite comparaba por bytes y eso es case-sensitive.
      const clash = (await getAllArtists()).find(
        (candidate) => candidate.name === newName && candidate.id !== artist.id
      );
      if (clash) {
        return NextResponse.json({ error: "Este nombre artístico ya está en uso" }, { status: 409 });
      }
    }

    // Build location from country/city if provided
    const newLocation = location || (city && country ? `${city}, ${country}` : country || city || artist.location);

    const updated = await updateArtist(artist.id, {
      name: newName,
      biography: bio || biography || artist.biography,
      genre: genre || artist.genre,
      location: newLocation,
      profileImage: profile_image || artist.profile_image,
      bannerImage: banner_image || artist.banner_image,
      slug: slug || artist.slug,
      socialLinks: social_links || artist.social_links,
    });

    if (!updated) {
      return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH artist profile error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
