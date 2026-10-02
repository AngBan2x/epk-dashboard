import { getArtistById, getArtistCatalog, type ArtistCatalogGroup } from "@/lib/db";
import { BioSection } from "@/components/BioSection";
import { ArtistTracksSection } from "@/components/ArtistTracksSection";
import { ArtistHero } from "@/components/ArtistHero";
import { ArtistSocialLinks } from "@/components/ArtistSocialLinks";
import { DownloadCenter } from "@/components/DownloadCenter";
import { SubscriptionButton } from "@/components/subscriber/SubscriptionButton";
import { SubscriberCount } from "@/components/subscriber/SubscriberCount";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import type { Track } from "@/types/music";
import { safeString } from "@/lib/null-safe";
import { decodeSessionToken, isSessionValid } from "@/lib/auth";
import { collectVideoIds, getVideoStatsBatch, toStatsRecord } from "@/lib/youtube";
import { fetchTopTracks } from "@/lib/lastfm";
import {
  LASTFM_TOP_TRACKS_LIMIT,
  buildLastfmPlaycountIndex,
  lastfmPlaycountFor,
} from "@/lib/lastfm-playcounts";

export const dynamic = "force-dynamic";

const BASE_URL = "https://epk-dashboard.vercel.app";

/**
 * ¿Puede quien está viendo esta página descargar el dossier y el rider?
 *
 * ## Por qué hace falta
 *
 * Esta página es **pública** y montaba `DownloadCenter` con `artistId` siempre
 * puesto. Como `DownloadGrid` solo mira si le pasaron `artistId`, las 9 celdas
 * salían habilitadas para cualquiera que abriera `/artists/<id>` sin sesión —
 * mientras que en el catálogo global el mismo componente pintaba 6 de esas
 * celdas deshabilitadas. "Invitado" significaba una cosa en un sitio y otra en el
 * otro, y la diferencia la decidía un prop de una página pública.
 *
 * ## Cómo se decide
 *
 * Se resuelve **en servidor**, con la misma cookie y las mismas dos funciones
 * que usa el middleware (`decodeSessionToken` + `isSessionValid`), y no leyendo
 * el rol en cliente. Leerlo en cliente sería el error de siempre: la UI se
 * ajustaría después de pintar, y `DownloadGrid` no tiene por qué saber de
 * sesiones.
 *
 * El predicado es una **lista blanca de roles** (`artist`, `admin`) y no un
 * `role !== "subscriber"`. Es el mismo motivo por el que `middleware.ts:50`
 * declara `KNOWN_ROLES`: `SessionData.role` es `string`, no una unión, así que
 * un token con un rol desconocido tiene que caer por defecto, no dentro.
 *
 * ## Lo que esto NO es
 *
 * No es una frontera de seguridad. `POST /api/export` es público
 * (`app/api/export/route.ts` solo aplica rate limit), así que un visitante que
 * sepa construir la petición puede pedir el dossier igual. Lo que se arregla
 * aquí es la **promesa de la interfaz**: que los 9 botones no se le ofrezcan a
 * quien la página ha decidido tratar como invitado. Cerrar el endpoint es
 * `app/api/**` y `lib/**`, fuera de la ownership de esta ola.
 */
async function viewerCanDownloadArtistSections(): Promise<boolean> {
  const token = cookies().get("auth_session")?.value;
  if (!token) return false;

  const session = await decodeSessionToken(token);
  if (!session || !isSessionValid(session)) return false;

  return session.role === "artist" || session.role === "admin";
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const artist = await getArtistById(params.id);
  if (!artist) {
    return { title: "Artista no encontrado", robots: { index: false, follow: false } };
  }

  const name = safeString(artist.name);
  const description = `Electronic Press Kit de ${name}${
    artist.genre ? `, género ${safeString(artist.genre)}` : ""
  }${artist.location ? `, desde ${safeString(artist.location)}` : ""}. Bio, releases, shows y rider técnico.`;
  const image = artist.profile_image ?? artist.banner_image ?? null;

  return {
    title: `${name} — EPK`,
    description,
    alternates: { canonical: `/artists/${params.id}` },
    openGraph: {
      type: "profile",
      title: `${name} | PressPlay`,
      description,
      url: `${BASE_URL}/artists/${params.id}`,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} | PressPlay`,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ArtistDetailPage({ params }: { params: { id: string } }) {
  const artist = await getArtistById(params.id);

  if (!artist) {
    notFound();
  }

  // C2: catálogo agrupado por release (álbum → EPKCard + lista de pistas).
  // `getArtistCatalog` filtra por `status = 'approved'`: sin eso, un release
  // `pending` de un suscriptor quedaba visible públicamente en esta página.
  let catalog: ArtistCatalogGroup[] = [];
  try {
    catalog = await getArtistCatalog(params.id);
  } catch (e) {
    console.error("Failed to fetch artist catalog:", params.id, e);
  }

  // Aplanado para el lote de YouTube y el recuento de DownloadCenter: los
  // mismos renglones que antes devolvía getTracksByArtist, sin 2ª consulta.
  const tracks: Track[] = catalog.flatMap((group) => [group.release, ...group.tracks]);

  // Fase E: UN lote de YouTube para todos los tracks (antes, uno por tarjeta).
  // Se resuelve aquí, en el servidor, y baja como objeto plano: el `Map` no
  // sobrevive al límite Server → Client.
  //
  // RC.34: Last.fm entra por la misma puerta y con la misma decisión —
  // **una llamada por artista, nunca por pista**. `track.getInfo` por fila
  // serían 65 llamadas para un álbum de 65 hijas; `artist.gettoptracks` son
  // 12 llamadas para las 83 filas del catálogo y ya trae las pistas más
  // escuchadas. Aquí se resuelve el índice y se entrega `track.id -> number |
  // null` para que el componente cliente no tenga que normalizar títulos.
  const loadYoutubeStats = async (): Promise<ReturnType<typeof toStatsRecord>> => {
    const videoIds = collectVideoIds(tracks);
    if (videoIds.length === 0) return {};
    try {
      const batch = await getVideoStatsBatch(videoIds);
      if (batch.ok) return toStatsRecord(batch.data);
      console.error(`[artists/${params.id}] métricas de YouTube no disponibles: ${batch.reason}`);
      return {};
    } catch (e) {
      console.error(`[artists/${params.id}] fallo al pedir el lote de YouTube:`, e);
      return {};
    }
  };

  const loadLastfmByTrack = async (): Promise<Record<string, number | null>> => {
    try {
      const res = await fetchTopTracks(artist.name, LASTFM_TOP_TRACKS_LIMIT);
      if (!res.ok) {
        console.error(`[artists/${params.id}] scrobbles de Last.fm no disponibles: ${res.reason}`);
        return {};
      }
      const index = buildLastfmPlaycountIndex(res.data);
      const byTrack: Record<string, number | null> = {};
      for (const track of tracks) byTrack[track.id] = lastfmPlaycountFor(index, track.title);
      return byTrack;
    } catch (e) {
      console.error(`[artists/${params.id}] fallo al pedir el lote de Last.fm:`, e);
      return {};
    }
  };

  /**
   * Los dos lotes en paralelo, no en serie: cada uno tiene un timeout de 5 s
   * hacia arriba, y sumarlos dejaría la página esperando hasta 10 s cuando
   * cualquiera de los dos proveedores cuelgue. En paralelo, el peor caso es el
   * timeout del más lento, y sin clave ninguno de los dos sale a la red (ambos
   * devuelven `no_key` al instante) así que la página no se retrasa.
   *
   * El render no queda bloqueado "de más": la página ya esperaba a YouTube
   * (`force-dynamic` + este mismo `await`), así que no se introduce un salto
   * nuevo de blocking más allá del que ya existía.
   */
  const [youtubeStats, lastfmByTrack] = await Promise.all([
    loadYoutubeStats(),
    loadLastfmByTrack(),
  ]);

  const canDownloadArtistSections = await viewerCanDownloadArtistSections();

  // `safeString` devuelve "—" (truthy) como fallback por defecto, asi que con
  // `|| undefined` el JSON-LD emitia "—" en vez de omitir el campo.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: safeString(artist.name),
    genre: safeString(artist.genre, "") || undefined,
    description: safeString(artist.biography, "") || undefined,
    url: `${BASE_URL}/artists/${params.id}`,
    ...(artist.profile_image ? { image: artist.profile_image } : {}),
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArtistHero
        name={artist.name}
        genre={artist.genre}
        location={artist.location}
        monthlyListeners={artist.monthly_listeners}
        profileImage={artist.profile_image}
        bannerImage={artist.banner_image}
        actions={
          <>
            <SubscriptionButton
              artistId={artist.id}
              artistName={artist.name}
              artistUserId={artist.user_id}
            />
            <SubscriberCount
              artistId={artist.id}
              artistUserId={artist.user_id}
            />
          </>
        }
      />
      {/* C1: `max-w-7xl` (1280px) en vez de `max-w-4xl` (896px). Con
          `xl:grid-cols-4` y 896px cada EPKCard medía 198px y el título se
          cortaba siempre; a 1280px con px-4 las tarjetas quedan en ~294px,
          el mismo ancho del catálogo. */}
      <main className="max-w-7xl mx-auto px-4 pb-12">
        {/* C7: `mb-6` separa los botones de redes de BioSection; antes solo
            había `pt-6` y los botones quedaban pegados al borde superior. */}
        {artist.social_links && artist.social_links.length > 0 && (
          <div className="pt-6 mb-6">
            {/*
              El título va como prop de `ArtistSocialLinks` y no como un `<p>`
              suelto aquí: es el encabezado de esta sección, y el bloque entero
              (título + lista) es una unidad. `h2` lo pone el componente; ver
              `components/ArtistSocialLinks.tsx` para por qué ese nivel no
              rompe la jerarquía de la página.
            */}
            <ArtistSocialLinks
              socialLinks={artist.social_links}
              artistName={artist.name}
              showLabels
              title={`Sigue a ${safeString(artist.name, "este artista")} en sus redes`}
              ariaLabel={`Redes sociales de ${artist.name}`}
            />
          </div>
        )}

        <BioSection
          artistName={artist.name}
          genre={artist.genre || undefined}
          location={artist.location || undefined}
          monthlyListeners={artist.monthly_listeners}
          biography={artist.biography}
          pressText={artist.press_text}
          pressHighlights={artist.press_highlights}
        />

        {/* B1: descargas de prensa también en la página pública del artista.
            Es el mismo DownloadCenter del dashboard: solo recibe props planas
            (artistId, artistName, trackCount) y ya es un client component.

            `artistId` se pasa SOLO si hay sesión con perfil de artista o admin
            (`viewerCanDownloadArtistSections`). Antes se pasaba siempre, y como
            `DownloadGrid` solo mira si le llegaron las 9 celdas salían
            habilitadas para un visitante anónimo. Ahora, sin sesión, esta
            rejilla muestra lo mismo que el catálogo global: una sola fila. */}
        <div className="mt-8">
          <DownloadCenter
            artistId={canDownloadArtistSections ? artist.id : undefined}
            artistName={artist.name}
            trackCount={tracks.length}
          />
        </div>

        <ArtistTracksSection
          groups={catalog}
          youtubeStats={youtubeStats}
          lastfmByTrack={lastfmByTrack}
        />
      </main>
    </div>
  );
}
