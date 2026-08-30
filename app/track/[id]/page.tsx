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
import { getTrackById, getAllTracks } from "@/lib/db";
import { safeString, formatNumber } from "@/lib/null-safe";

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
                    href={`https://itunes.apple.com/us/album/id${track.itunes_track_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0 0 19.2.277a10.58 10.58 0 0 0-1.657-.173C16.663.05 15.573.05 14.484.05H9.517c-1.09 0-2.18 0-3.059.054a10.58 10.58 0 0 0-1.657.173 5.022 5.022 0 0 0-2.374.614C1.252 1.574.508 2.574.19 3.884a9.23 9.23 0 0 0-.24 2.19C-.05 7.007-.05 7.897-.05 8.987v6.027c0 1.09 0 1.98.054 2.913.014.36.068.713.24 1.046.317 1.31 1.062 2.31 2.18 3.043a5.022 5.022 0 0 0 2.374.614c.533.077 1.086.13 1.657.173.878.044 1.768.054 3.059.054h4.966c1.09 0 2.18 0 3.059-.054a10.58 10.58 0 0 0 1.657-.173 5.022 5.022 0 0 0 2.374-.614c1.118-.734 1.863-1.733 2.18-3.043.172-.333.226-.686.24-1.046.054-.933.054-1.823.054-2.913V8.987c0-1.09 0-1.98-.056-2.86zM16.8 14.827l-.004 4.432c0 .312-.025.618-.1.914-.256.98-1.054 1.52-2.032 1.584a7.93 7.93 0 0 1-1.052.048c-.756.008-1.512.013-2.267.013h-.05c-.756 0-1.512-.005-2.268-.013a7.93 7.93 0 0 1-1.052-.048c-.978-.064-1.776-.604-2.032-1.584a4.65 4.65 0 0 1-.1-.914l-.004-4.432c0-.57.187-1.04.642-1.37.562-.41 1.232-.546 1.916-.604.552-.048 1.104-.063 1.656-.07h.488c.396 0 .792.005 1.188.02.396.013.792.04 1.188.087.594.07 1.026.28 1.294.624.16.204.253.434.31.678.048.21.063.42.068.63v.028c0 .563-.175 1.012-.588 1.317-.356.263-.78.393-1.226.474-.316.058-.636.088-.956.117-.426.038-.852.07-1.278.104l-.144.012c-.372.028-.624.07-.624.47v.082c.004.064.012.128.024.19.072.35.336.504.672.564.156.028.312.048.468.064.372.036.744.064 1.116.096.444.036.888.072 1.332.132.672.09 1.176.42 1.368 1.044.108.348.144.708.144 1.068v.204c0 .432-.036.864-.144 1.284-.264 1.008-1.02 1.536-2.016 1.62a8.32 8.32 0 0 1-1.068.048c-.768.012-1.536.012-2.304.012h-.108c-.78 0-1.56 0-2.34-.012a8.32 8.32 0 0 1-1.068-.048c-.996-.084-1.752-.612-2.016-1.62a5.04 5.04 0 0 1-.144-1.284v-.204c0-.36.036-.72.144-1.068.192-.624.696-.954 1.368-1.044.444-.06.888-.096 1.332-.132.372-.032.744-.06 1.116-.096.156-.016.312-.036.468-.064.336-.06.6-.214.672-.564a1.86 1.86 0 0 0 .024-.19v-.082c0-.4.252-.442.624-.47l.144-.012c.426-.034.852-.066 1.278-.104.32-.029.64-.059.956-.117.446-.081.87-.211 1.226-.474.413-.305.588-.754.588-1.317v-.028c-.005-.21-.02-.42-.068-.63a1.95 1.95 0 0 0-.31-.678c-.268-.344-.7-.554-1.294-.624a5.68 5.68 0 0 0-1.188-.087 8.14 8.14 0 0 0-1.188-.02h-.488c-.552.007-1.104.022-1.656.07-.684.058-1.354.194-1.916.604-.455.33-.642.8-.642 1.37v.156c0 .336.012.672.048 1.002.06.528.252.996.6 1.374.312.336.696.528 1.14.636.204.048.408.078.612.102.468.054.936.084 1.404.114.36.024.72.054 1.08.096.288.036.48.156.576.42.036.096.054.204.06.312v.096c0 .156-.012.312-.036.468-.108.72-.528 1.068-1.224 1.164a8.12 8.12 0 0 1-.936.06c-.768.012-1.536.012-2.304.012h-.108c-.768 0-1.536 0-2.304-.012a8.12 8.12 0 0 1-.936-.06c-.696-.096-1.116-.444-1.224-1.164a3.49 3.49 0 0 1-.036-.468v-.096c.006-.108.024-.216.06-.312.096-.264.288-.384.576-.42.36-.042.72-.072 1.08-.096.468-.03.936-.06 1.404-.114.204-.024.408-.054.612-.102.444-.108.828-.3 1.14-.636.348-.378.54-.846.6-1.374.036-.33.048-.666.048-1.002v-.156z" />
                    </svg>
                    Comprar en iTunes
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

          <StemsPlayer
            title={`Stems & Mezcla Multitrack - ${safeString(track.title)}`}
            stems={track.stems_urls}
            mainAudioUrl={track.audio_preview_url}
          />

          <ImageGallery
            title={`Galería & Assets - ${safeString(track.title)}`}
            images={track.gallery_images?.length ? track.gallery_images : track.cover_image && track.cover_image !== "—" ? [track.cover_image] : []}
          />

          <DownloadCenter
            artistName="Artista EPK"
            trackTitle={track.title}
          />
        </div>

        {/* Bio & Social */}
        <div className="mt-8 space-y-8">
          <BioSection
            artistName="Artista EPK"
            genre="Multi-género"
            location="Latinoamérica"
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
