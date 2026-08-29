import { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { EPKCard } from "@/components/EPKCard";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ProductionDetails } from "@/components/ProductionDetails";
import { LyricsModal } from "@/components/LyricsModal";
import { MetricsCharts } from "@/components/MetricsCharts";
import { getTrackById, getAllTracks } from "@/lib/db";
import { safeString, formatNumber, formatDuration } from "@/lib/null-safe";

interface TrackDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TrackDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const track = getTrackById(id);
  if (!track) {
    return { title: "Track no encontrado" };
  }
  return {
    title: `${track.title} | EPK Dashboard Musical`,
    description: `${track.release_type} - ${track.duration} - ${formatNumber(track.metrics.streams)} streams`,
  };
}

export default async function TrackDetailPage({ params }: TrackDetailPageProps) {
  const { id } = await params;
  const track = getTrackById(id);

  if (!track) {
    notFound();
  }

  const allTracks = getAllTracks();
  const currentIndex = allTracks.findIndex((t) => t.id === track.id);
  const prevTrack = currentIndex > 0 ? allTracks[currentIndex - 1] : null;
  const nextTrack = currentIndex < allTracks.length - 1 ? allTracks[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-dark-50 dark:bg-dark-950">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <nav className="mb-6 flex items-center gap-4">
          <a
            href="/dashboard"
            className="text-sm text-dark-600 hover:text-dark-900 dark:text-dark-400 dark:hover:text-dark-100"
          >
            ← Volver al Dashboard
          </a>
        </nav>

        <EPKCard track={track} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <section>
            <AudioPlayer src={track.audio_preview_url} title={track.title} />

            <ProductionDetails details={track.production_details} className="mt-6" />

            <LyricsModal lyrics={track.lyrics} title={track.title} className="mt-6" />
          </section>

          <section>
            <MetricsCharts
              top_countries={track.metrics.top_countries}
              streams={track.metrics.streams}
              saves={track.metrics.saves}
              playlist_additions={track.metrics.playlist_additions}
            />

            <div className="mt-6 p-4 bg-white dark:bg-dark-800 rounded-xl border border-dark-200 dark:border-dark-700">
              <h3 className="font-semibold mb-4">Enlaces Externos</h3>
              <div className="space-y-3">
                {track.spotify_url && (
                  <a
                    href={track.spotify_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary-600 hover:underline"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                    </svg>
                    Spotify
                  </a>
                )}
                {track.youtube_video_id && (
                  <a
                    href={`https://www.youtube.com/watch?v=${track.youtube_video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-red-600 hover:underline"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 7.754 0 12 0 12s0 4.246.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 16.246 24 12 24 12s0-4.246-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                    YouTube
                  </a>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-8 flex items-center justify-between">
          {prevTrack && (
            <a
              href={`/track/${prevTrack.id}`}
              className="inline-flex items-center gap-2 text-sm text-primary-600 hover:underline"
            >
              ← {safeString(prevTrack.title)}
            </a>
          )}
          {nextTrack && (
            <a
              href={`/track/${nextTrack.id}`}
              className="inline-flex items-center gap-2 text-sm text-primary-600 hover:underline"
            >
              {safeString(nextTrack.title)} →
            </a>
          )}
        </div>
      </main>
    </div>
  );
}