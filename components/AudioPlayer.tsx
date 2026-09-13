"use client";

import { useRef, useState, useContext, useEffect } from "react";
import { safeString } from "@/lib/null-safe";
import { AudioPlayerContext } from "@/context/AudioPlayerContext";
import { getAudioSources, AudioSource } from "@/lib/audio-priority";

interface AudioPlayerProps {
  src: string | undefined;
  title: string | null;
  id?: string;
  artist?: string;
  coverImage?: string;
  track?: {
    audio_preview_url?: string | null;
    spotify_url?: string | null;
    apple_music_url?: string | null;
    youtube_video_id?: string | null;
    external_links?: Record<string, unknown> | null;
  };
}

// Debounce map: track IDs that have already been counted in this session
const countedStreams = new Set<string>();

export function AudioPlayer({ src, title, id, artist, coverImage, track }: AudioPlayerProps) {
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [currentSource, setCurrentSource] = useState<AudioSource | null>(null);
  const globalPlayer = useContext(AudioPlayerContext);
  const { isPlaying: globalIsPlaying, isLoading: globalIsLoading } = globalPlayer || {};

  // Determine available audio sources from track data
  const sources = track ? getAudioSources(track) : [];

  // Determine if this track is the current global track — prefer id comparison to avoid
  // YouTube-only tracks colliding on shared audioUrl "—"
  const isCurrentGlobal = globalPlayer
    ? (Boolean(id)
        ? globalPlayer.activeTrack?.id === id
        : globalPlayer.activeTrack?.audioUrl === src)
    : false;

  const isPlaying = globalPlayer ? isCurrentGlobal && globalIsPlaying : localPlaying;

  let playButton: React.ReactNode;
  if (globalIsLoading && !isPlaying) {
    playButton = (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <circle cx="12" cy="12" r="10" strokeWidth="4" />
        <line x1="4" y1="4" x2="20" y2="20" strokeWidth="2" />
        <line x1="4" y1="20" x2="20" y2="4" strokeWidth="2" />
      </svg>
    );
  } else if (isPlaying) {
    playButton = "⏸";
  } else {
    playButton = "▶";
  }

  // Increment stream count on first play (debounced per track per session)
  const countedRef = useRef(false);
  useEffect(() => {
    if (!id || countedRef.current) return;
    if (!isPlaying) return;

    // Already counted this track in this browser session
    if (countedStreams.has(id)) {
      countedRef.current = true;
      return;
    }

    countedRef.current = true;
    countedStreams.add(id);

    fetch(`/api/tracks/${id}/streams`, { method: "POST" }).catch(() => {
      // Silently fail — stream counting is best-effort
    });
  }, [id, isPlaying]);

  // Auto-select best source on mount
  useEffect(() => {
    if (sources.length > 0 && !currentSource) {
      setCurrentSource(sources[0]);
    }
  }, [sources, currentSource]);

  // Handle YouTube iframe API messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.youtube.com') return;
      const data = event.data;
      if (data.event === 'onStateChange') {
        if (data.data === 0) {
          if (globalPlayer) {
            globalPlayer.togglePlay();
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [globalPlayer]);

  const togglePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!src && !track) return;

    const activeSource = currentSource || sources[0] || null;
    if (!activeSource) return;

    if (globalPlayer) {
      if (isCurrentGlobal) {
        globalPlayer.togglePlay();
      } else {
        // Check if this is a YouTube-only track
        const isYouTubeOnly = sources.length === 1 && sources[0].type === 'youtube';
        const previewSource = sources.find(s => s.type === 'preview');
        const audioUrl = previewSource?.url || src || '';

        globalPlayer.playTrack({
          id: id || src || track?.youtube_video_id || 'unknown',
          title: safeString(title),
          artist: safeString(artist, "Artista EPK"),
          audioUrl,
          coverImage,
          isYouTube: isYouTubeOnly,
          youtubeVideoId: track?.youtube_video_id || undefined,
        });
      }
      return;
    }

    // Local playback logic
    if (activeSource.type === 'preview' && activeSource.url) {
      const audio = localAudioRef.current;
      if (!audio) return;
      if (localPlaying) {
        audio.pause();
      } else {
        audio.src = activeSource.url;
        audio.play();
      }
      setLocalPlaying(!localPlaying);
    }
  };

  const switchSource = (source: AudioSource) => {
    setCurrentSource(source);
    if (globalPlayer && isCurrentGlobal) {
      // setActiveSource not available on global context
    } else {
      setLocalPlaying(false);
      setTimeout(() => {
        if (source.type === 'preview') {
          setLocalPlaying(true);
        }
      }, 100);
    }
  };

  const handleSourceEnd = () => {
    if (globalPlayer && isCurrentGlobal) {
      globalPlayer.togglePlay();
    } else {
      setLocalPlaying(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition flex-shrink-0"
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
        >
          {playButton}
        </button>

        <div className="flex-1 min-w-0">
          {src || track?.audio_preview_url || track?.youtube_video_id ? (
            <>
              {/* Local Audio Element (for preview) */}
              {(!globalPlayer || currentSource?.type === 'preview') && (
                <audio
                  ref={localAudioRef}
                  src={src || track?.audio_preview_url || ''}
                  onEnded={handleSourceEnd}
                  onError={() => setLocalPlaying(false)}
                  style={{ display: 'none' }}
                />
              )}

              {/* Audio Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                  {isPlaying ? "Reproduciendo..." : "Reproducir"}
                  {currentSource && ` • ${currentSource.label}`}
                </p>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">No hay audio disponible</p>
          )}
        </div>

      </div>
    </div>
  );
}
