"use client";

import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { safeString } from "@/lib/null-safe";
import type { Track } from "@/types/music";

interface ReleaseTrackListProps {
  tracks: Track[];
  releaseTitle: string;
  releaseCoverImage?: string;
  releaseYoutubeVideoId?: string;
}

export function ReleaseTrackList({ tracks, releaseTitle, releaseCoverImage, releaseYoutubeVideoId }: ReleaseTrackListProps) {
  const globalPlayer = useAudioPlayer();

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePlayTrack = (track: Track) => {
    if (!globalPlayer) return;

    const isYouTubeOnly = !!releaseYoutubeVideoId;
    const audioUrl = track.audio_preview_url || "";

    globalPlayer.playTrack({
      id: track.id,
      title: safeString(track.title, "Track"),
      artist: safeString(track.artist_name, "Artista EPK"),
      audioUrl,
      coverImage: releaseCoverImage || track.cover_image,
      isYouTube: isYouTubeOnly,
      youtubeVideoId: releaseYoutubeVideoId || undefined,
      startTimestamp: track.start_time || 0,
      endTimestamp: track.end_time || 0,
    });
  };

  if (tracks.length === 0) {
    return null;
  }

  // M0: number per disc, not a flat index. Groups consecutive rows by
  // disc_number, restarts the counter on every new disc, and only shows a
  // "Disco N" header when the release actually spans more than one disc.
  // An explicit track_number wins; unnumbered tracks fall back to their
  // position within the disc so nothing renders blank.
  const discGroups: { disc: number; rows: { track: Track; number: number }[] }[] = [];
  for (const track of tracks) {
    const disc = Number.isFinite(track.disc_number) && track.disc_number ? Number(track.disc_number) : 1;
    const lastGroup = discGroups[discGroups.length - 1];
    if (!lastGroup || lastGroup.disc !== disc) {
      discGroups.push({ disc, rows: [{ track, number: 0 }] });
    } else {
      lastGroup.rows.push({ track, number: lastGroup.rows.length });
    }
  }
  const showDiscHeaders = discGroups.length > 1;

  return (
    <div className="space-y-2">
      {discGroups.map((group) => (
        <div key={`disc-${group.disc}`} className="space-y-2">
          {showDiscHeaders && (
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 pt-2">
              Disco {group.disc}
            </h4>
          )}
          {group.rows.map(({ track, number }) => {
        const isCurrentTrack = globalPlayer?.activeTrack?.id === track.id;
        const isPlaying = isCurrentTrack && globalPlayer?.isPlaying;
        const isLoading = isCurrentTrack && globalPlayer?.isLoading;
        const isError = isCurrentTrack && globalPlayer?.error;
        const trackNumber =
          track.track_number != null && Number.isFinite(track.track_number)
            ? track.track_number
            : number + 1;

        return (
          <div
            key={track.id}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              isCurrentTrack
                ? "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {/* Track number (M0: per disc) */}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-6 text-center">
              {trackNumber}
            </span>

            {/* Play button */}
            <button
              onClick={() => handlePlayTrack(track)}
              disabled={isLoading}
              className={`p-2 rounded-full transition-colors ${
                isPlaying
                  ? "bg-primary-500 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-600"
              } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
              aria-label={isPlaying ? "Pausar" : "Reproducir"}
            >
              {isLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : isPlaying ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
              )}
            </button>

            {/* Track info */}
            <div className="flex-1 min-w-0">
              {/* `truncate` corta en una sola linea, asi que sin `title` el
                  nombre largo ("Todo vue…") era irrecuperable. Mismo fallo de
                  a11y que se corrigio en el h3 de EPKCard. */}
              <p
                className={`text-sm font-medium truncate ${
                  isCurrentTrack
                    ? "text-primary-700 dark:text-primary-300"
                    : "text-slate-900 dark:text-slate-100"
                }`}
                title={track.title}
              >
                {track.title}
              </p>
              <p
                className="text-xs text-slate-500 dark:text-slate-400 truncate"
                title={safeString(track.artist_name, "")}
              >
                {track.artist_name}
              </p>
            </div>

            {/* Duration / Timestamp */}
            <div className="text-right">
              {track.start_time || track.end_time ? (
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {formatTime(track.start_time || 0)} — {formatTime(track.end_time || 0)}
                </span>
              ) : track.duration ? (
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {track.duration}
                </span>
              ) : null}
            </div>

            {/* Error indicator */}
            {isError && (
              <span className="text-xs text-red-500" title={globalPlayer?.error || ""}>
                ⚠️
              </span>
            )}
          </div>
        );
          })}
        </div>
      ))}
    </div>
  );
}
