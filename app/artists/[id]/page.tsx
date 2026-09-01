import { getArtistById } from "@/lib/db";
import { Header } from "@/components/Header";
import { BioSection } from "@/components/BioSection";
import { notFound } from "next/navigation";

export default async function ArtistDetailPage({ params }: { params: { id: string } }) {
  const artist = getArtistById(params.id);

  if (!artist) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header />
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
      </main>
    </div>
  );
}