import { Metadata } from "next";
import { Header } from "@/components/Header";
import { EPKCard } from "@/components/EPKCard";
import { EPKExporter } from "@/components/EPKExporter";
import { BioSection } from "@/components/BioSection";
import { BookingModule } from "@/components/BookingModule";
import { SocialBar } from "@/components/SocialBar";
import { getAllTracks, getArtistByName } from "@/lib/db";
import { PageTransition, SlideIn, PitchHeading } from "@/components/MotionWrappers";

export const metadata: Metadata = {
  title: "Dashboard | PressPlay",
  description: "Dashboard de métricas y catálogo de tracks",
};

export default function DashboardPage() {
  const tracks = getAllTracks();
  
  // Get the most common artist or first track's artist for bio section
  const primaryArtistName = tracks.length > 0 ? tracks[0].artist_name : null;
  const artist = primaryArtistName ? getArtistByName(primaryArtistName) : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <PageTransition>
          <section className="mb-10">
            <PitchHeading>
              <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                PressPlay
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-base">
                Catálogo completo · <strong className="text-primary-600 dark:text-primary-400">{tracks.length} tracks</strong>
              </p>
            </PitchHeading>

            {/* Social Links */}
            <div className="mt-4">
              <SocialBar
                spotifyUrl="https://open.spotify.com"
                youtubeUrl="https://www.youtube.com"
                instagramUrl="https://www.instagram.com"
              />
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
            {tracks.map((track, i) => (
              <SlideIn key={track.id} index={i}>
                <a href={`/track/${track.id}`} className="block h-full">
                  <EPKCard track={track} />
                </a>
              </SlideIn>
            ))}
            {tracks.length === 0 && (
              <div className="col-span-4 text-center py-12 text-slate-400">
                <p>No se encontraron tracks.</p>
              </div>
            )}
          </section>

          {/* Bio & Booking Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            <SlideIn index={tracks.length}>
              <BioSection
                artistName={artist?.name || primaryArtistName || "Artista EPK"}
                genre={artist?.genre || "Multi-género"}
                location={artist?.location || "Latinoamérica"}
                monthlyListeners={artist?.monthly_listeners || 0}
                biography={artist?.biography}
                pressText={artist?.press_text}
                pressHighlights={artist?.press_highlights}
              />
            </SlideIn>
            <SlideIn index={tracks.length + 1}>
              <BookingModule artistName={artist?.name || primaryArtistName || "Artista EPK"} />
            </SlideIn>
          </div>

          <SlideIn index={tracks.length + 2}>
            <EPKExporter tracks={tracks} />
          </SlideIn>
        </PageTransition>
      </main>
    </div>
  );
}
