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
import type { ArtistProfile, Show, Track } from "@/types/music";

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

/**
 * ¿Esta fila es la cabecera de un lanzamiento, o una pista hija de otra?
 *
 * `tracks` es una tabla plana: el álbum es una fila (la "padre", con
 * `release_id` NULL) y cada pista del disco es otra fila con
 * `release_id = <id del padre>`. No hay tabla de releases.
 */
function isReleaseHead(track: Track): boolean {
  return !track.release_id;
}

/**
 * Criterio de visibilidad, y es **el mismo de `getApprovedTrackById`**
 * (`lib/db.ts:2019`), no el `status = 'approved'` a secas de
 * `getArtistCatalog`:
 *
 *   visible = status approved  OR  (tiene padre y el padre está approved)
 *
 * El segundo brazo no es decoración. `POST /api/releases` inserta las hijas
 * SIEMPRE con `status = 'draft'` y la aprobación **no** cascadea (ni
 * `app/api/admin/releases` ni `app/api/releases` tocan por `release_id`, son
 * `WHERE id = ?`). Con el criterio de `getArtistCatalog` un release creado
 * desde la app y luego aprobado se publica como un álbum con cero pistas:
 * mismo síntoma que "sin fuente", causa distinta.
 *
 * Como aquí las hijas además se filtraban (ver `groupTracksByRelease`), el
 * fallo era invisible: no había ni una tarjeta de álbum que lo delatara.
 */
function isVisibleTrack(
  track: Track,
  approvedParentIds: ReadonlySet<string>,
  isAdmin: boolean,
  artistName: string | null
): boolean {
  if (isAdmin) return true;
  if (track.status === "approved") return true;
  if (track.release_id && approvedParentIds.has(track.release_id)) return true;
  return !!artistName && track.artist_name === artistName;
}

/**
 * Orden de las pistas dentro de un lanzamiento: el MISMO que impone
 * `getArtistCatalog` en SQL (`lib/db.ts:2348-2351`), replicado en JS porque
 * aquí el agrupado es en memoria.
 *
 * Los `COALESCE` son lo importante: en SQLite los NULL suben solos en un
 * `ORDER BY ASC`, así que sin ellos una pista sin numerar saltaría a la
 * cabecera de su disco. El 999 es un centinela que manda las no numeradas al
 * final, donde el reproductor las suena después de las numeradas en vez de
 * antes.
 */
function compareReleaseTracks(a: Track, b: Track): number {
  const disc = (a.disc_number ?? 1) - (b.disc_number ?? 1);
  if (disc !== 0) return disc;
  const num = (a.track_number ?? 999) - (b.track_number ?? 999);
  if (num !== 0) return num;
  return (a.start_time ?? 0) - (b.start_time ?? 0);
}

/**
 * Agrupa el catálogo por lanzamiento: la respuesta lleva **solo las cabeceras**
 * en `tracks` y las hijas en `childrenByRelease`.
 *
 * ## Por qué aquí y no en el cliente
 *
 * 1. La fila hija no puede pintar su propia tarjeta. Comparte la portada con
 *    el padre (las hijas heredan `cover_image`), así que un álbum de 10 pistas
 *    salía como 11 EPKCards con la misma imagen. Es el mismo motivo por el que
 *    `getArtistCatalog` calcula `has_children` con `EXISTS`.
 * 2. El filtro de estado tiene que ser el MISMO para la cabecera y sus hijas.
 *    Agrupar en el cliente obligaría a enviar las hijas de un `draft` y a
 *    filtrarlas después, o a no enviarlas nunca — y el segundo caso es
 *    exactamente el bug que se está arreglando.
 *
 * ## Lo que reemplaza
 *
 * `const standaloneTracks = allTracks.filter((t) => !t.release_id)` descartaba
 * las hijas **antes** de que nadie las pudiera usar. No era una omisión de
 * datos: `getAllTracks()` es `SELECT * FROM tracks` sin filtro, así que las
 * hijas ya estaban en el array, y `parseTrack` ya mapea `release_id`,
 * `duration`, `start_time`, `end_time`, `disc_number` y `track_number`
 * (`lib/db.ts:675-687`) — que es lo que `buildReleaseQueue` necesita.
 */
function groupTracksByRelease(allTracks: Track[]): {
  heads: Track[];
  childrenByRelease: Record<string, Track[]>;
} {
  const heads: Track[] = [];
  const childrenByRelease: Record<string, Track[]> = {};

  for (const track of allTracks) {
    if (isReleaseHead(track)) {
      heads.push(track);
      continue;
    }
    const parentId = track.release_id as string;
    const bucket = childrenByRelease[parentId];
    if (bucket) bucket.push(track);
    else childrenByRelease[parentId] = [track];
  }

  for (const children of Object.values(childrenByRelease)) {
    children.sort(compareReleaseTracks);
  }

  return { heads, childrenByRelease };
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

    const { heads, childrenByRelease } = groupTracksByRelease(allTracks);

    /**
     * Cabeceras **aprobadas**, para el segundo brazo de `isVisibleTrack`.
     *
     * Se calculan sobre `allTracks` y no sobre el subconjunto ya filtrado: la
     * cabecera que decide si una hija es visible puede no ser una cabecera
     * visible para *este* lector. El caso real es el del artista dueño de un
     * `draft` — la ve por ser suya, y sus hijas `draft` se ven por lo mismo.
     */
    const approvedParentIds = new Set(
      allTracks.filter((t) => isReleaseHead(t) && t.status === "approved").map((t) => t.id)
    );
    const artistName = artistProfile?.name ?? null;
    const isVisible = (t: Track) => isVisibleTrack(t, approvedParentIds, isAdmin, artistName);

    /**
     * `tracks` = las cabeceras VISIBLES, y solo ellas.
     *
     * Esta línea reemplaza a `standaloneTracks`, que era **el mismo conjunto**
     * (una cabecera es, por definición, una fila sin `release_id`), así que la
     * rejilla no cambia: los mismos lanzamientos, en el mismo orden y con el
     * mismo número. Lo que cambia es que las hijas ya no se tiran, y con ellas
     * la tarjeta puede pintar "Escuchar N pistas" en vez de un "Preview (30s)"
     * de un álbum de 10 pistas.
     */
    const tracks = heads.filter(isVisible);

    /**
     * Hijas visibles agrupadas por cabecera. Las que no tienen cabecera visible
     * se descartan: un grupo sin fila padre no se puede pintar (mismo descarte
     * que `getArtistCatalog`).
     */
    const visibleHeadIds = new Set(tracks.map((t) => t.id));
    const visibleChildrenByRelease: Record<string, Track[]> = {};
    for (const [parentId, children] of Object.entries(childrenByRelease)) {
      if (!visibleHeadIds.has(parentId)) continue;
      const visibleChildren = children.filter(isVisible);
      if (visibleChildren.length > 0) visibleChildrenByRelease[parentId] = visibleChildren;
    }

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
          childrenByRelease: visibleChildrenByRelease,
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

    /**
     * Los likes se siguen contando sobre las CABECERAS, como antes. Cambiarlo
     * inflaría la cifra del artist dashboard con los likes de pistas que nunca
     * se pintaron como tarjeta, y eso es otro cambio de métrica, no una
     * reparación de la cola.
     */
    const [totalLikes, subscribers] = await Promise.all([
      getTotalLikesForTracks(targetTracks.map((t) => t.id)),
      artistProfile ? getSubscriberCount(artistProfile.id) : Promise.resolve(0),
    ]);

    return NextResponse.json(
      {
        tracks,
        childrenByRelease: visibleChildrenByRelease,
        artists,
        artistProfile,
        artistShows,
        showsByArtist,
        likes: totalLikes,
        subscribers,
      },
      { headers: noStore }
    );
  } catch (error) {
    console.error("GET dashboard error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
