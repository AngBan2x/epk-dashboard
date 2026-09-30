import { NextRequest, NextResponse } from "next/server";
import {
  getAllTracks,
  getAllArtists,
  getArtistByUserId,
  getApprovedShowsByArtists,
  getShowsByArtist,
  getShowsByArtists,
  getTotalLikesForTracks,
  getSubscriberCount,
} from "@/lib/db";
import { validateRequest } from "@/lib/auth";
import type { ArtistProfile, Show } from "@/types/music";

export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate",
  "Surrogate-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
};

function stripUserId(artists: ArtistProfile[]): Omit<ArtistProfile, "user_id">[] {
  return artists.map(({ user_id: _user_id, ...rest }) => rest);
}

export async function GET(req: NextRequest) {
  try {
    const session = await validateRequest(req);
    const isAdmin = session?.role === "admin";

    const [artistProfile, allTracks, allArtists] = await Promise.all([
      session?.userId ? getArtistByUserId(session.userId) : Promise.resolve(null),
      getAllTracks(),
      getAllArtists(),
    ]);

    const standaloneTracks = allTracks.filter((t) => !t.release_id);
    const tracks = isAdmin
      ? standaloneTracks
      : standaloneTracks.filter(
          (t) => t.status === "approved" || (!!artistProfile && t.artist_name === artistProfile.name)
        );

    const artists = isAdmin ? allArtists : stripUserId(allArtists);

    const showsByArtist: Record<string, Show[]> = {};
    if (artists.length > 0) {
      /**
       * S0/P12b residual — la MISMA fuga que se cerró en `app/api/shows`, por
       * otra puerta. `getShowsByArtists()` es `SELECT * FROM shows WHERE
       * artist_id IN (…)` **sin** `approved = 1` ni `deleted_at IS NULL`, y
       * `showsByArtist` se devolvía tal cual también en la rama de anónimo de
       * más abajo: un show recién enviado por un artista (que
       * `POST /api/shows` crea con `approved = 0`) era legible sin sesión.
       *
       * Aquí se consume el lector filtrado que ya publica `lib/db.ts` en vez de
       * escribir SQL a mano, para que el criterio de "qué es catálogo" esté en
       * un solo sitio.
       *
       * Y **no** se filtra `getAllShows()` en el sitio: `scripts/qa-cleanup.ts`
       * la necesita cruda para enumerar los shows QA de producción, incluidos
       * los no aprobados. El filtro va en el punto de exposición, que es esta
       * ruta.
       */
      const visibleShows = isAdmin
        ? await getShowsByArtists(artists.map((a) => a.id))
        : await getApprovedShowsByArtists(artists.map((a) => a.id));
      for (const art of artists) {
        showsByArtist[art.id] = visibleShows.filter((s) => s.artist_id === art.id);
      }
    }

    /**
     * El artista sí ve los suyos sin aprobar, igual que sus tracks en las
     * líneas de arriba: `POST /api/shows` los deja en `approved = 0`, así que
     * con solo los aprobados nunca vería el show que acaba de enviar. Para el
     * resto de artistas, `showsByArtist` no cambia: sigue siendo solo lo
     * aprobado, que es lo que pinta `CatalogArtistsCarousel`.
     */
    let artistShows: Show[] = [];
    if (artistProfile) {
      artistShows = isAdmin
        ? showsByArtist[artistProfile.id] ?? []
        : await getShowsByArtist(artistProfile.id);
      // Lo que YA está en el carrusel son solo los aprobados, así que de ahí
      // sale la deduplicación. Comparar contra `artistShows` en vez de contra
      // `showsByArtist` no añadiría nada: las dos listas contienen lo aprobado.
      const alreadyInCarousel = new Set((showsByArtist[artistProfile.id] ?? []).map((s) => s.id));
      showsByArtist[artistProfile.id] = [
        ...(showsByArtist[artistProfile.id] ?? []),
        ...artistShows.filter((s) => !alreadyInCarousel.has(s.id)),
      ];
    }

    if (!session) {
      return NextResponse.json(
        {
          tracks,
          artists,
          artistProfile: null,
          artistShows: [],
          showsByArtist,
          likes: 0,
          subscribers: 0,
        },
        { headers: noStore }
      );
    }

    const targetTracks = artistProfile
      ? tracks.filter((t) => t.artist_name === artistProfile.name)
      : tracks;

    const [totalLikes, subscribers] = await Promise.all([
      getTotalLikesForTracks(targetTracks.map((t) => t.id)),
      artistProfile ? getSubscriberCount(artistProfile.id) : Promise.resolve(0),
    ]);

    return NextResponse.json(
      { tracks, artists, artistProfile, artistShows, showsByArtist, likes: totalLikes, subscribers },
      { headers: noStore }
    );
  } catch (error) {
    console.error("GET dashboard error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
