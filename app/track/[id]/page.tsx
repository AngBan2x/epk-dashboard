import { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ProductionDetails } from "@/components/ProductionDetails";
import { LyricsModal } from "@/components/LyricsModal";
import { MetricsCharts } from "@/components/MetricsCharts";
import { ImageGallery } from "@/components/ImageGallery";
import { DownloadCenter } from "@/components/DownloadCenter";
import { VideoShowcase } from "@/components/VideoShowcase";
import { StemsPlayer } from "@/components/StemsPlayer";
import { BioSection } from "@/components/BioSection";
import { SocialBar } from "@/components/SocialBar";
import { getTrackById, getAllTracks, getArtistByName } from "@/lib/db";
import { safeString, formatNumber } from "@/lib/null-safe";

interface TrackDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TrackDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const track = await getTrackById(id);
  if (!track) {
    return { title: "Track no encontrado" };
  }
  return {
    title: `${track.title} | PressPlay`,
    description: `${track.release_type} - ${track.duration} - ${formatNumber(track.metrics.streams)} streams`,
  };
}

export default async function TrackDetailPage({ params }: TrackDetailPageProps) {
  const { id } = await params;
  const track = await getTrackById(id);

  if (!track) {
    notFound();
  }

  const artist = track.artist_name ? await getArtistByName(track.artist_name) : null;
  const allTracks = await getAllTracks();
  const currentIndex = allTracks.findIndex((t) => t.id === track.id);
  const prevTrack = currentIndex > 0 ? allTracks[currentIndex - 1] : null;
  const nextTrack = currentIndex < allTracks.length - 1 ? allTracks[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <nav className="mb-6 flex items-center gap-4">
          <a
            href="/dashboard"
            className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Volver al Dashboard
          </a>
        </nav>

        {/* Hero Horizontal: Cover + Info */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          {/* Cover Image */}
          <div className="w-48 h-48 md:w-64 md:h-64 flex-shrink-0 rounded-xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-800">
            {track.cover_image && track.cover_image !== "—" ? (
              <img
                src={track.cover_image}
                alt={safeString(track.title)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl bg-slate-100 dark:bg-slate-800">
                🎵
              </div>
            )}
          </div>

          {/* Track Info */}
          <div className="flex-1 min-w-0">
            <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-800 mb-3">
              {track.release_type}
            </span>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              {safeString(track.title)}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
              {track.release_date} · {track.duration} · {formatNumber(track.metrics.streams)} streams
            </p>

            {/* Audio Player */}
            <AudioPlayer
              src={track.audio_preview_url}
              title={track.title}
              id={track.id}
              coverImage={track.cover_image}
            />

            {/* Quick Stats */}
            <div className="flex flex-wrap gap-4 mt-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg px-4 py-2 border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">Streams</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatNumber(track.metrics.streams)}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg px-4 py-2 border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">Saves</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatNumber(track.metrics.saves)}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg px-4 py-2 border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">Playlists</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatNumber(track.metrics.playlist_additions)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <section>
            <ProductionDetails details={track.production_details} className="mt-0" />
            <LyricsModal lyrics={track.lyrics} title={track.title} className="mt-6" />

            {/* External Links */}
            <div className="mt-6 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold mb-4 text-slate-900 dark:text-slate-100">Enlaces Externos</h3>
              <div className="space-y-3">
                {track.spotify_url && (
                  <a
                    href={track.spotify_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-green-600 dark:text-green-400 hover:underline"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                    Escuchar en Spotify
                  </a>
                )}
                {track.youtube_video_id && (
                  <a
                    href={`https://www.youtube.com/watch?v=${track.youtube_video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:underline"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 7.754 0 12 0 12s0 4.246.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 16.246 24 12 24 12s0-4.246-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                    Ver en YouTube
                  </a>
                )}
                {track.itunes_track_id && (
                  <a
                    href={`https://music.apple.com/us/album/${track.itunes_track_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-pink-600 dark:text-pink-400 hover:underline"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0 0 19.2.277a10.58 10.58 0 0 0-1.657-.173C16.663.05 15.573.05 14.484.05H9.517c-1.09 0-2.18 0-3.059.054a10.58 10.58 0 0 0-1.657.173 5.022 5.022 0 0 0-2.374.614C1.252 1.574.508 2.574.19 3.884a9.23 9.23 0 0 0-.24 2.19C-.05 7.007-.05 7.897-.05 8.987v6.027c0 1.09 0 1.98.054 2.913.014.36.068.713.24 1.046.317 1.31 1.062 2.31 2.18 3.043a5.022 5.022 0 0 0 2.374.614c.533.077 1.086.13 1.657.173.878.044 1.768.054 3.059.054h4.966c1.09 0 2.18 0 3.059-.054a10.58 10.58 0 0 0 1.657-.173 5.022 5.022 0 0 0 2.374-.614c1.118-.734 1.863-1.733 2.18-3.043.172-.333.226-.686.24-1.046.054-.933.054-1.823.054-2.913V8.987c0-1.09 0-1.98-.056-2.86z" />
                    </svg>
                    Escuchar en Apple Music
                  </a>
                )}
              </div>
            </div>
          </section>

          <section>
            <MetricsCharts
              top_countries={track.metrics.top_countries}
              streams={track.metrics.streams}
              saves={track.metrics.saves}
              playlist_additions={track.metrics.playlist_additions}
            />
          </section>
        </div>

        {/* Multimedia Sections */}
        <div className="space-y-8">
          <VideoShowcase
            title={`Videoclip Oficial - ${safeString(track.title)}`}
            youtubeVideoId={track.youtube_video_id}
            videoEmbedUrl={track.video_embed_url}
            coverImage={track.cover_image}
          />

          {track.stems_urls ? (
            <StemsPlayer
              title={`Stems & Mezcla Multitrack - ${safeString(track.title)}`}
              stems={track.stems_urls}
              mainAudioUrl={track.audio_preview_url}
            />
          ) : (
            <section className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                🎚️ Stems & Multitrack
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Separación de pistas por inteligencia artificial
              </p>
              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg">
                  🔒
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Próximamente</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Los stems estarán disponibles pronto</p>
                </div>
              </div>
            </section>
          )}

          <ImageGallery
            title={`Galería & Assets - ${safeString(track.title)}`}
            images={track.gallery_images?.length ? track.gallery_images : track.cover_image && track.cover_image !== "—" ? [track.cover_image] : []}
          />

          <DownloadCenter
            artistName={track.artist_name || "Artista"}
            trackTitle={track.title}
          />
        </div>

        {/* Bio & Social */}
        <div className="mt-8 space-y-8">
          <BioSection
            artistName={track.artist_name || "Artista EPK"}
            genre={artist?.genre || "Multi-género"}
            location={artist?.location || "Latinoamérica"}
            monthlyListeners={artist?.monthly_listeners || 0}
            biography={artist?.biography}
            pressText={artist?.press_text}
            pressHighlights={artist?.press_highlights}
          />
          <SocialBar
            spotifyUrl={track.spotify_url}
            youtubeUrl={track.youtube_video_id ? `https://www.youtube.com/watch?v=${track.youtube_video_id}` : null}
          />
        </div>

        {/* Navigation */}
        <div className="mt-12 flex items-center justify-between">
          {prevTrack && (
            <a
              href={`/track/${prevTrack.id}`}
              className="inline-flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              ← {safeString(prevTrack.title)}
            </a>
          )}
          {nextTrack && (
            <a
              href={`/track/${nextTrack.id}`}
              className="inline-flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              {safeString(nextTrack.title)} →
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
