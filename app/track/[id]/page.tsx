import { Metadata } from "next";
import { notFound } from "next/navigation";
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
    description: `${capitalizeReleaseType(track.release_type)} - ${track.duration} - ${formatNumber(track.metrics?.streams ?? 0)} streams`,
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <nav className="mb-6" aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <li><a href="/dashboard" className="hover:text-primary-600 dark:hover:text-primary-400">Dashboard</a></li>
          <li aria-hidden="true">/</li>
          <li className="text-slate-900 dark:text-white font-medium">{safeString(track.title)}</li>
        </ol>
      </nav>

      <div className="flex flex-col md:flex-row gap-6 mb-8">
        <div className="w-48 h-48 md:w-64 md:h-64 flex-shrink-0 rounded-xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-800">
          {getCoverImage(track) ? (
            <img src={getCoverImage(track)!} alt={safeString(track.title)} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl bg-slate-100 dark:bg-slate-800">🎵</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-800 mb-3">
            {capitalizeReleaseType(track.release_type)}
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">{safeString(track.title)}</h1>
          <p className="text-slate-600 dark:text-slate-300 text-sm mb-4">{track.release_date} · {track.duration} · {formatNumber(track.metrics?.streams ?? 0)} streams</p>
          <AudioPlayer src={track.audio_preview_url || undefined} title={track.title} id={track.id} coverImage={getCoverImage(track) || undefined} track={{
            audio_preview_url: track.audio_preview_url,
            spotify_url: track.spotify_url,
            apple_music_url: track.external_links?.apple_music ?? null,
            youtube_video_id: track.youtube_video_id,
            external_links: track.external_links ?? undefined,
          }} />
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg px-4 py-2 border border-slate-200 dark:border-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">Streams</p><p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatNumber(track.metrics?.streams ?? 0)}</p></div>
            <div className="bg-white dark:bg-slate-800 rounded-lg px-4 py-2 border border-slate-200 dark:border-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">Saves</p><p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatNumber(track.metrics?.saves ?? 0)}</p></div>
            <div className="bg-white dark:bg-slate-800 rounded-lg px-4 py-2 border border-slate-200 dark:border-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">Playlists</p><p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatNumber(track.metrics?.playlist_additions ?? 0)}</p></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <section>
          <ProductionDetails details={track.production_details} className="mt-0" />
          <div className="mt-6 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold mb-4 text-slate-900 dark:text-slate-100">Enlaces Externos</h3>
            <div className="flex flex-col gap-3">
              {track.spotify_url && <a href={track.spotify_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-green-600 dark:text-green-400 hover:underline"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" /></svg>Escuchar en Spotify</a>}
              {track.youtube_video_id && <a href={`https://www.youtube.com/watch?v=${track.youtube_video_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:underline"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 7.754 0 12 0 12s0 4.246.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 16.246 24 12 24 12s0-4.246-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>Ver en YouTube</a>}
              {track.itunes_track_id && <a href={`https://music.apple.com/us/album/${track.itunes_track_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-pink-600 dark:text-pink-400 hover:underline"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.721 20.177c-.24.179-.539.3-.779.359-.66.24-1.559.24-2.459.179-.9-.061-1.859-.301-2.579-.72-.72-.36-1.32-.78-1.799-1.32-.479-.54-.779-1.139-.839-1.799-.061-.66.12-1.32.301-1.979.18-.659.54-1.259.96-1.679.42-.42.9-.72 1.5-.839.6-.12 1.2-.12 1.859 0 .6.12 1.2.3 1.74.6.48.239.959.6 1.44.72.599.12 1.14.179 1.619.179.6 0 1.2-.12 1.799-.36.54-.239.96-.599 1.26-1.14.24-.479.36-1.079.24-1.619 0-.66-.12-1.32-.24-1.86.36-.3.6-1.02 1.26-1.559 1.56-.6.3-1.199.42-1.859.42-.54 0-1.14-.06-1.62-.179-.54-.12-1.02-.36-1.439-.659-.42-.3-.779-.719-1.02-1.14-.24-.36-.36-.78-.36-1.2 0-.48.12-.96.36-1.38.24-.42.54-.779.9-.1.08.3-.12.659-.18.96-.06.36.06.659.3.899.24.239.6.359 1.02.359.42 0 .899-.12 1.26-.24.36-.12.66-.36.899-.6.24-.24.36-.599.36-.96 0-.48-.12-.9-.3-.1.38-.12.959.061 1.259.06.18.24.3 1.079.42.6.3 1.079.599 1.439.599.72 0 1.26-.12 1.74-.42.24-.12.48-.24.72-.36.479-.18.899-.36 1.26-.54.479-.18.899-.42 1.2-.72.3-.3.54-.6.659-1.02.12-.42.179-.9.06-1.26-.12-.42-.3-.78-.6-.1.08-.18.42-.42.72-.6.42-.18.779-.36 1.079-.6.3-.239.54-.599.659-1.02.12-.42.179-.9.06-1.26-.12-.42-.3-.78-.6-.1.08-.18.42-.42.72-.6.42-.18.779-.36 1.079-.6.3-.239.54-.599.659-1.02.12-.42.179-.959.059-1.38zM12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm.002 22.2c-5.631 0-10.2-4.568-10.2-10.2 0-5.63 4.569-10.2 10.2-10.2 5.63 0 10.2 4.57 10.2 10.2 0 5.633-4.57 10.2-10.2 10.2zm0-19.8c-4.245 0-7.699 3.453-7.699 7.699 0 4.245 3.454 7.699 7.699 7.699 4.246 0 7.7-3.454 7.7-7.699 0-4.246-3.454-7.699-7.7-7.699z"/></svg>Escuchar en Apple Music</a>}
            </div>
          </div>
        </section>
      </div>

      <aside className="lg:col-span-1 space-y-8">
        <VideoShowcase youtubeVideoId={track.youtube_video_id} videoEmbedUrl={track.video_embed_url} title={track.title} />
        <StemsPlayer stems={track.stems_urls} title={track.title} />
        <ImageGallery images={track.gallery_images ?? undefined} title={track.title} />
        <DownloadCenter artistName={track.artist_name} trackTitle={track.title} />
      </aside>

      <div className="space-y-8">
        {artist && <BioSection artistName={artist.name} genre={artist.genre ?? undefined} location={artist.location ?? undefined} biography={artist.biography ?? undefined} monthlyListeners={artist.monthly_listeners} />}
        <SocialBar spotifyUrl={track.spotify_url ?? undefined} youtubeUrl={track.youtube_video_id ? `https://www.youtube.com/watch?v=${track.youtube_video_id}` : undefined} />
        <div className="flex justify-between">
          {prevTrack && <a href={`/track/${prevTrack.id}`} className="text-primary-600 dark:text-primary-400 hover:underline">← {safeString(prevTrack.title)}</a>}
          {nextTrack && <a href={`/track/${nextTrack.id}`} className="text-primary-600 dark:text-primary-400 hover:underline text-right">{safeString(nextTrack.title)} →</a>}
        </div>
      </div>
    </div>
  );
}
