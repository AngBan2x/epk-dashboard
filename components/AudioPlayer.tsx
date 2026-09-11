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
  const youtubeIframeRef = useRef<HTMLIFrameElement>(null);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [currentSource, setCurrentSource] = useState<AudioSource | null>(null);
  const globalPlayer = useContext(AudioPlayerContext);

  // Determine available audio sources from track data
  const sources = track ? getAudioSources(track) : [];

  // Determine if this track is the current global track
  const isCurrentGlobal = globalPlayer
    ? (globalPlayer.activeTrack?.audioUrl === src || (Boolean(id) && globalPlayer.activeTrack?.id === id))
    : false;

  const isPlaying = globalPlayer ? isCurrentGlobal && globalPlayer.isPlaying : localPlaying;

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

  // Send command to YouTube iframe
  const sendYouTubeCommand = (command: string, value?: any) => {
    if (youtubeIframeRef.current?.contentWindow) {
      youtubeIframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: command, args: value ? [value] : [] }),
        'https://www.youtube.com'
      );
    }
  };

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
    } else if (activeSource.type === 'youtube' && youtubeIframeRef.current) {
      if (isPlaying) {
        sendYouTubeCommand('pauseVideo');
      } else {
        sendYouTubeCommand('playVideo');
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
      {/* Source Selector — only when multiple sources with preview */}
      {sources.length > 1 && sources.some(s => s.type === 'preview') && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">Fuente:</label>
          <select
            value={currentSource?.type || ''}
            onChange={(e) => {
              const selected = sources.find(s => s.type === e.target.value);
              if (selected) switchSource(selected);
            }}
            className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded"
          >
            {sources.map((s) => (
              <option key={s.type} value={s.type}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* YouTube Only — button to open in YouTube */}
      {sources.length === 1 && sources[0].type === 'youtube' && track?.youtube_video_id && (
        <a
          href={`https://www.youtube.com/watch?v=${track.youtube_video_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          Ver en YouTube
        </a>
      )}

      {/* Main Player */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition flex-shrink-0"
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
        >
          {isPlaying ? "⏸" : "▶"}
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

              {/* YouTube Iframe Embed */}
              {(currentSource?.type === 'youtube' || (track?.youtube_video_id && (!track?.audio_preview_url || track.audio_preview_url === '—') && !track?.spotify_url && !track?.apple_music_url)) && (
                <iframe
                  ref={youtubeIframeRef}
                  src={currentSource?.embedUrl || `https://www.youtube.com/embed/${track?.youtube_video_id}?autoplay=1&enablejsapi=1`}
                  width="100%"
                  height="100"
                  frameBorder="0"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  title="YouTube Player"
                  className="rounded-lg"
                  style={{ minHeight: '100px' }}
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
