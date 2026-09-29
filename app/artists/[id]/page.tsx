import { getArtistById, getTracksByArtist } from "@/lib/db";
import { BioSection } from "@/components/BioSection";
import { ArtistTracksSection } from "@/components/ArtistTracksSection";
import { ArtistHero } from "@/components/ArtistHero";
import { ArtistSocialLinks } from "@/components/ArtistSocialLinks";
import { DownloadCenter } from "@/components/DownloadCenter";
import { SubscriptionButton } from "@/components/subscriber/SubscriptionButton";
import { SubscriberCount } from "@/components/subscriber/SubscriberCount";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Track } from "@/types/music";
import { safeString } from "@/lib/null-safe";
import { collectVideoIds, getVideoStatsBatch, toStatsRecord } from "@/lib/youtube";

export const dynamic = "force-dynamic";

const BASE_URL = "https://epk-dashboard.vercel.app";

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

  let tracks: Track[] = [];
  try {
    // `getTracksByArtist` filtra por `status = 'approved'`: sin eso, un release
    // `pending` de un suscriptor quedaba visible públicamente en esta página.
    tracks = await getTracksByArtist(params.id);
  } catch (e) {
    console.error("Failed to fetch tracks for artist:", params.id, e);
  }

  // Fase E: UN lote de YouTube para todos los tracks (antes, uno por tarjeta).
  // Se resuelve aquí, en el servidor, y baja como objeto plano: el `Map` no
  // sobrevive al límite Server → Client.
  let youtubeStats: ReturnType<typeof toStatsRecord> = {};
  const videoIds = collectVideoIds(tracks);
  if (videoIds.length > 0) {
    try {
      const batch = await getVideoStatsBatch(videoIds);
      if (batch.ok) {
        youtubeStats = toStatsRecord(batch.data);
      } else {
        console.error(`[artists/${params.id}] métricas de YouTube no disponibles: ${batch.reason}`);
      }
    } catch (e) {
      console.error(`[artists/${params.id}] fallo al pedir el lote de YouTube:`, e);
    }
  }

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
      <main className="max-w-4xl mx-auto px-4 pb-12">
        {artist.social_links && artist.social_links.length > 0 && (
          <div className="pt-6">
            <ArtistSocialLinks
              socialLinks={artist.social_links}
              artistName={artist.name}
              showLabels
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
            (artistId, artistName, trackCount) y ya es un client component. */}
        <div className="mt-8">
          <DownloadCenter
            artistId={artist.id}
            artistName={artist.name}
            trackCount={tracks.length}
          />
        </div>

        <ArtistTracksSection tracks={tracks} youtubeStats={youtubeStats} />
      </main>
    </div>
  );
}
