import { getArtistById, getTracksByArtist } from "@/lib/db";
import { BioSection } from "@/components/BioSection";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function TracksSection({ artistId }: { artistId: string }) {
  let tracks: any[] = [];
  try {
    tracks = await getTracksByArtist(artistId);
  } catch (e) {
    console.error("Failed to fetch tracks for artist:", artistId, e);
    return null;
  }

  if (tracks.length === 0) return null;

  const { EPKCard } = await import("@/components/EPKCard");

  return (
    <section className="mt-8">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Lanzamientos</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {tracks.map((track) => (
          <EPKCard
            key={track.id}
            track={track}
          />
        ))}
      </div>
    </section>
  );
}

export default async function ArtistDetailPage({ params }: { params: { id: string } }) {
  const artist = await getArtistById(params.id);

  if (!artist) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {artist.name}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
            {artist.genre && <span>🎵 {artist.genre}</span>}
            {artist.location && <span>📍 {artist.location}</span>}
            {artist.monthly_listeners > 0 && (
              <span>🎧 {artist.monthly_listeners.toLocaleString()} oyentes mensuales</span>
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

        <TracksSection artistId={params.id} />
      </main>
    </div>
  );
}
