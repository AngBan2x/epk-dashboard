import Image from "next/image";
import { getTrackById, getTracksByReleaseId } from "@/lib/db";
import { notFound } from "next/navigation";
import { ReleaseTrackList } from "@/components/ReleaseTrackList";
import { ReleaseActions } from "@/components/ReleaseActions";
import { Metadata } from "next";

interface ReleaseDetailPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: ReleaseDetailPageProps): Promise<Metadata> {
  const release = await getTrackById(params.id);
  if (!release) return { title: "Release no encontrado" };

  return {
    title: `${release.title} — PressPlay`,
    description: `Release de ${release.artist_name} en PressPlay`,
    openGraph: {
      title: release.title,
      description: `Release de ${release.artist_name}`,
      images: release.cover_image ? [release.cover_image] : [],
    },
  };
}

export default async function ReleaseDetailPage({ params }: ReleaseDetailPageProps) {
  const release = await getTrackById(params.id);

  if (!release) {
    notFound();
  }

  // Get child tracks if this is a multi-track release
  const childTracks = await getTracksByReleaseId(params.id);
  const isMultiTrack = childTracks.length > 0;

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row gap-8 mb-8">
          {/* Cover Image */}
          {release.cover_image && (
            <div className="w-full md:w-64 flex-shrink-0">
              <Image
                src={release.cover_image}
                alt={release.title}
                width={256}
                height={256}
                unoptimized
                className="w-full aspect-square object-cover rounded-xl shadow-lg"
              />
            </div>
          )}

          {/* Release Info */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-1 text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                {release.release_type?.charAt(0).toUpperCase() + (release.release_type?.slice(1) || "")}
              </span>
              {release.status && (
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  release.status === "approved"
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                    : release.status === "pending"
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                }`}>
                  {release.status === "approved" ? "Aprobado" : release.status === "pending" ? "Pendiente" : "Borrador"}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
              {release.title}
            </h1>

            <p className="text-lg text-slate-600 dark:text-slate-400 mb-4">
              {release.artist_name}
            </p>

            <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400 mb-4">
              {release.release_date && (
                <span>📅 {new Date(release.release_date).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}</span>
              )}
              {release.duration && (
                <span>⏱️ {release.duration}</span>
              )}
              {isMultiTrack && (
                <span>🎵 {childTracks.length} pistas</span>
              )}
            </div>

            {/* Actions */}
            <ReleaseActions releaseId={params.id} />
          </div>
        </div>

        {/* Description */}
        {(release as any).description && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Descripción</h2>
            <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
              {(release as any).description}
            </p>
          </section>
        )}

        {/* Track List (for multi-track releases) */}
        {isMultiTrack && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Pistas ({childTracks.length})
            </h2>
            <ReleaseTrackList
              tracks={childTracks}
              releaseTitle={release.title}
              releaseCoverImage={release.cover_image}
              releaseYoutubeVideoId={release.youtube_video_id || undefined}
            />
          </section>
        )}

        {/* External Links */}
        {release.external_links && Object.keys(release.external_links).length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Enlaces</h2>
            <div className="flex flex-wrap gap-3">
              {release.external_links.spotify && (
                <a
                  href={release.external_links.spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-[#1DB954] text-white rounded-lg hover:bg-[#1ed760] transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                  Spotify
                </a>
              )}
              {release.external_links.apple_music && (
                <a
                  href={release.external_links.apple_music}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-[#FC3C44] text-white rounded-lg hover:bg-[#e0353c] transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0019.2.25a9.472 9.472 0 00-1.317-.24c-.58-.06-1.16-.08-1.74-.06H7.857c-.58-.02-1.16 0-1.74.06-.46.04-.92.1-1.36.2A5.022 5.022 0 002.426.89C1.308 1.624.564 2.624.246 3.934a9.23 9.23 0 00-.24 2.19c-.06.58-.08 1.16-.06 1.74v10.68c-.02.58 0 1.16.06 1.74.04.46.1.92.24 1.36.318 1.31 1.062 2.31 2.18 3.043a5.022 5.022 0 001.868.64c.44.1.9.16 1.36.2.58.06 1.16.08 1.74.06h8.286c.58.02 1.16 0 1.74-.06.46-.04.92-.1 1.36-.2a5.022 5.022 0 001.868-.64c1.118-.734 1.862-1.734 2.18-3.043.14-.44.2-.9.24-1.36.06-.58.08-1.16.06-1.74V7.864c.02-.58 0-1.16-.06-1.74zM17.994 15.854l-.002-6.48-5.496 3.22v6.08l5.498-2.82z" />
                  </svg>
                  Apple Music
                </a>
              )}
              {release.external_links.youtube && (
                <a
                  href={release.external_links.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-[#FF0000] text-white rounded-lg hover:bg-[#cc0000] transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                  YouTube
                </a>
              )}
            </div>
          </section>
        )}

        {/* Lyrics */}
        {release.lyrics && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Letra</h2>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
              <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono text-sm">
                {release.lyrics}
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
