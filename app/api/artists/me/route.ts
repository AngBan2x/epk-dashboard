import { NextRequest, NextResponse } from "next/server";
import { getArtistByUserId, updateArtist } from "@/lib/db";

export const dynamic = "force-dynamic";

function validateSession(req: NextRequest): { userId: string; role: string } | null {
  const sessionCookie = req.cookies.get("auth_session");
  if (!sessionCookie) return null;
  try {
    const decoded = atob(sessionCookie.value);
    const session = JSON.parse(decoded) as { userId: string; role?: string };
    return { userId: session.userId, role: session.role || "artist" };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = validateSession(req);
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
    const session = validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const artist = await getArtistByUserId(session.userId);
    if (!artist) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    const body = await req.json();
    const { name, bio, biography, genre, country, city, location, profile_image, banner_image, slug, social_links } = body;

    const updated = await updateArtist(artist.id, {
      name: name || artist.name,
      biography: bio || biography || artist.biography,
      genre: genre || artist.genre,
      location: location || (city && country ? `${city}, ${country}` : country || city || artist.location),
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
