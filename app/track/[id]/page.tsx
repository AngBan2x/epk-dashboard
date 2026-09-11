import { Metadata } from "next";
import { notFound } from "next/navigation";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ProductionDetailsWrapper } from "@/components/ProductionDetailsWrapper";
import { LyricsSectionWrapper } from "@/components/LyricsSectionWrapper";
import { MetricsCharts } from "@/components/MetricsCharts";
import { ImageGallery } from "@/components/ImageGallery";
import { DownloadCenter } from "@/components/DownloadCenter";
import { VideoShowcase } from "@/components/VideoShowcase";
import { BioSection } from "@/components/BioSection";
import { PageTransition, SlideIn } from "@/components/MotionWrappers";
import { getTrackById, getAllTracks, getArtistByName } from "@/lib/db";
import { safeString, formatNumber, capitalizeReleaseType, getCoverImage } from "@/lib/null-safe";

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
    description: `${capitalizeReleaseType(track.release_type)} - ${track.duration} - ${formatNumber(track.streams ?? track.metrics?.streams ?? 0)} streams`,
  };
}

export default async function TrackDetailPage({ params }: TrackDetailPageProps) {
  const { id } = await params;
  const track = await getTrackById(id);
  if (!track) notFound();

  const artist = await getArtistByName(track.artist_name);
  const allTracks = await getAllTracks();
  const currentIndex = allTracks.findIndex(t => t.id === id);
  const prevTrack = currentIndex > 0 ? allTracks[currentIndex - 1] : null;
  const nextTrack = currentIndex < allTracks.length - 1 ? allTracks[currentIndex + 1] : null;

  const streamCount = track.streams ?? track.metrics?.streams ?? 0;

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32">
        {/* Header / Breadcrumb */}
        <SlideIn index={0}>
          <nav className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-4" aria-label="Breadcrumb">
            <div className="flex items-center gap-3">
              <a
                href="/dashboard"
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Dashboard
              </a>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {safeString(track.title)}
              </span>
            </div>
          </nav>
        </SlideIn>

        {/* Hero Section — Cover + Title + Player */}
        <SlideIn index={1}>
          <section className="max-w-6xl mx-auto px-4 sm:px-6 mb-8">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/50 overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                {/* Cover Art */}
                <div className="sm:w-56 md:w-64 lg:w-72 flex-shrink-0">
                  <div className="aspect-square sm:aspect-auto sm:h-full">
                    {getCoverImage(track) ? (
                      <img
                        src={getCoverImage(track)!}
                        alt={safeString(track.title)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full min-h-[200px] sm:min-h-0 flex items-center justify-center text-5xl bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-950 dark:to-slate-800">
                        🎵
                      </div>
                    )}
                  </div>
                </div>

                {/* Track Info */}
                <div className="flex-1 p-5 sm:p-6 lg:p-8 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-800">
                        {capitalizeReleaseType(track.release_type)}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {track.duration}
                      </span>
                    </div>

                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2 leading-tight">
                      {safeString(track.title)}
                    </h1>

                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">
                      {track.artist_name}
                    </p>
                    <p className="text-slate-400 dark:text-slate-500 text-xs">
                      {track.release_date} &middot; {formatNumber(streamCount)} streams
                    </p>
                  </div>

                  <div className="mt-5">
                    <AudioPlayer
                      src={track.audio_preview_url || undefined}
                      title={track.title}
                      id={track.id}
                      artist={track.artist_name}
                      coverImage={getCoverImage(track) || undefined}
                      track={{
                        audio_preview_url: track.audio_preview_url,
                        spotify_url: track.spotify_url,
                        apple_music_url: track.external_links?.apple_music ?? null,
                        youtube_video_id: track.youtube_video_id,
                        external_links: track.external_links ?? undefined,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Metrics Bar */}
              <div className="border-t border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50 px-5 sm:px-6 lg:px-8 py-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                      {formatNumber(streamCount)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Streams</p>
                  </div>
                  <div className="text-center border-x border-slate-200 dark:border-slate-700">
                    <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                      {formatNumber(track.metrics?.saves ?? 0)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Saves</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                      {formatNumber(track.metrics?.playlist_additions ?? 0)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Playlists</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </SlideIn>

        {/* Two-Column Content Area */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Main Column (left, 2/3 width) */}
            <div className="lg:col-span-2 space-y-6 lg:space-y-8">
              {/* Bio Section */}
              <SlideIn index={2}>
                {artist && (
                  <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                    <BioSection
                      artistName={artist.name}
                      genre={artist.genre ?? undefined}
                      location={artist.location ?? undefined}
                      biography={artist.biography ?? undefined}
                      monthlyListeners={artist.monthly_listeners}
                    />
                  </section>
                )}
              </SlideIn>

              {/* Lyrics Section */}
              <SlideIn index={3}>
                <LyricsSectionWrapper
                  lyrics={track.lyrics}
                  isInstrumental={track.is_instrumental}
                  trackId={track.id}
                />
              </SlideIn>

              {/* Video Showcase */}
              <SlideIn index={4}>
                <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                  <VideoShowcase
                    youtubeVideoId={track.youtube_video_id}
                    videoEmbedUrl={track.video_embed_url}
                    title="Videoclip Oficial"
                  />
                </section>
              </SlideIn>

              {/* Image Gallery */}
              <SlideIn index={5}>
                <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                  <ImageGallery
                    images={track.gallery_images ?? undefined}
                    title="Galería de Prensa"
                  />
                </section>
              </SlideIn>
            </div>

            {/* Sidebar Column (right, 1/3 width) */}
            <div className="space-y-6 lg:space-y-8">
              {/* External Links */}
              <SlideIn index={4}>
                <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                  <h3 className="font-semibold text-lg mb-4 text-slate-900 dark:text-slate-100">
                    Enlaces Externos
                  </h3>
                  <div className="flex flex-col gap-2">
                    {track.spotify_url && (
                      <a
                        href={track.spotify_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 rounded-lg px-3 py-2 transition-colors"
                      >
                        <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
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
                        className="inline-flex items-center gap-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg px-3 py-2 transition-colors"
                      >
                        <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
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
                        className="inline-flex items-center gap-3 text-sm text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/30 rounded-lg px-3 py-2 transition-colors"
                      >
                        <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0 0 19.2.293 10.143 10.143 0 0 0 17.06.04C16.432.01 15.803 0 15.174 0H8.826c-.63 0-1.258.01-1.887.04a10.143 10.143 0 0 0-2.14.253A5.022 5.022 0 0 0 2.426.872C1.308 1.605.563 2.605.246 3.915a9.23 9.23 0 0 0-.24 2.19C.004 6.764 0 7.423 0 8.082v7.836c0 .66.004 1.318.006 1.977.017 1.12.16 2.18.486 3.09.317 1.31 1.062 2.31 2.18 3.043a5.022 5.022 0 0 0 2.574.579 10.143 10.143 0 0 0 2.14.253c.629.03 1.258.04 1.887.04h6.348c.63 0 1.258-.01 1.887-.04a10.143 10.143 0 0 0 2.14-.253 5.022 5.022 0 0 0 2.574-.579c1.118-.733 1.863-1.733 2.18-3.043.325-.91.47-1.97.486-3.09.002-.659.006-1.317.006-1.977V8.082c0-.66-.004-1.318-.006-1.977zM15.19 10.15v5.148c0 .417-.058.827-.17 1.222-.316 1.117-1.18 1.776-2.316 1.836-.256.014-.513.02-.77.02H9.065c-.257 0-.514-.006-.77-.02-1.136-.06-2-.719-2.316-1.836a2.76 2.76 0 0 1-.17-1.222V10.15c0-.417.058-.827.17-1.222.316-1.117 1.18-1.776 2.316-1.836.256-.014.513-.02.77-.02h2.869c.257 0 .514.006.77.02 1.136.06 2 .719 2.316 1.836.112.395.17.805.17 1.222z" />
                        </svg>
                        Escuchar en Apple Music
                      </a>
                    )}
                    {track.external_links?.deezer && (
                      <a
                        href={track.external_links.deezer as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg px-3 py-2 transition-colors"
                      >
                        <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.81 4.16v3.19h-4.78V4.16zM18.81 8.73v3.19h-4.78V8.73zM18.81 13.3v3.19h-4.78V13.3zM6.39 4.16v3.19H1.61V4.16zM6.39 8.73v3.19H1.61V8.73zM6.39 13.3v3.19H1.61V13.3zM12.6 9.56v7.93h-4.78V9.56z" />
                        </svg>
                        Escuchar en Deezer
                      </a>
                    )}
                    {!track.spotify_url && !track.youtube_video_id && !track.itunes_track_id && !track.external_links?.deezer && (
                      <p className="text-sm text-slate-400 dark:text-slate-500 italic py-2">
                        No hay enlaces externos disponibles
                      </p>
                    )}
                  </div>
                </section>
              </SlideIn>

              {/* Production Details */}
              <SlideIn index={5}>
                <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                  <ProductionDetailsWrapper
                    details={track.production_details}
                    trackId={track.id}
                  />
                </section>
              </SlideIn>

              {/* Download Center */}
              <SlideIn index={6}>
                <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                  <DownloadCenter artistName={track.artist_name} trackTitle={track.title} />
                </section>
              </SlideIn>
            </div>
          </div>
        </div>

        {/* Track Navigation */}
        <SlideIn index={7}>
          <nav className="max-w-6xl mx-auto px-4 sm:px-6 mt-8" aria-label="Navegacion de tracks">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
              {prevTrack ? (
                <a
                  href={`/track/${prevTrack.id}`}
                  className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors group min-w-0"
                >
                  <svg className="w-4 h-4 flex-shrink-0 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="truncate">{safeString(prevTrack.title)}</span>
                </a>
              ) : (
                <span />
              )}

              <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block select-none">
                Ficha de Producción
              </span>

              {nextTrack ? (
                <a
                  href={`/track/${nextTrack.id}`}
                  className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors group text-right min-w-0"
                >
                  <span className="truncate">{safeString(nextTrack.title)}</span>
                  <svg className="w-4 h-4 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              ) : (
                <span />
              )}
            </div>
          </nav>
        </SlideIn>
      </div>
    </PageTransition>
  );
}
