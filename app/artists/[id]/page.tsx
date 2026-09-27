import { getArtistById, getTracksByArtist } from "@/lib/db";
import { BioSection } from "@/components/BioSection";
import { ArtistTracksSection } from "@/components/ArtistTracksSection";
import { ArtistHero } from "@/components/ArtistHero";
import { ArtistSocialLinks } from "@/components/ArtistSocialLinks";
import { SubscriptionButton } from "@/components/subscriber/SubscriptionButton";
import { SubscriberCount } from "@/components/subscriber/SubscriberCount";
import { notFound } from "next/navigation";
import type { Track } from "@/types/music";

export const dynamic = "force-dynamic";

export default async function ArtistDetailPage({ params }: { params: { id: string } }) {
  const artist = await getArtistById(params.id);

  if (!artist) {
    notFound();
  }

  let tracks: Track[] = [];
  try {
    tracks = await getTracksByArtist(params.id);
  } catch (e) {
    console.error("Failed to fetch tracks for artist:", params.id, e);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
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

        <ArtistTracksSection tracks={tracks} />
      </main>
    </div>
  );
}
