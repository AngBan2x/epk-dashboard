import { getArtistById, getTracksByArtist } from "@/lib/db";
import { formatNumber } from "@/lib/null-safe";
import { BioSection } from "@/components/BioSection";
import { ArtistTracksSection } from "@/components/ArtistTracksSection";
import { notFound } from "next/navigation";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function ArtistDetailPage({ params }: { params: { id: string } }) {
  const artist = await getArtistById(params.id);

  if (!artist) {
    notFound();
  }

  let tracks: any[] = [];
  try {
    tracks = await getTracksByArtist(params.id);
  } catch (e) {
    console.error("Failed to fetch tracks for artist:", params.id, e);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Hero: banner + avatar (fallbacks keep layout identical when empty) */}
      <div className="relative h-48 md:h-64 bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-500 overflow-hidden">
        {artist.banner_image && (
          <Image
            src={artist.banner_image}
            alt=""
            fill
            unoptimized
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      </div>
      <main className="max-w-4xl mx-auto px-4 pb-12">
        <div className="mb-8">
          <div className="flex items-end gap-4 -mt-10 mb-4">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 border-4 border-slate-50 dark:border-slate-950 shrink-0 relative z-10">
              {artist.profile_image ? (
                <Image
                  src={artist.profile_image}
                  alt={artist.name}
                  width={80}
                  height={80}
                  unoptimized
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-slate-400">
                  {artist.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
            </div>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {artist.name}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
            {artist.genre && <span>🎵 {artist.genre}</span>}
            {artist.location && <span>📍 {artist.location}</span>}
            {artist.monthly_listeners > 0 && (
              <span>🎧 {formatNumber(artist.monthly_listeners)} oyentes mensuales</span>
            )}
          </div>
        </div>

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
