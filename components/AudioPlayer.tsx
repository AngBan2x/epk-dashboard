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

export function AudioPlayer({ src, title, id, artist, coverImage, track }: AudioPlayerProps) {
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const youtubeIframeRef = useRef<HTMLIFrameElement>(null);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [currentSource, setCurrentSource] = useState<AudioSource | null>(null);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const globalPlayer = useContext(AudioPlayerContext);

  // Determine available audio sources from track data
  const sources = track ? getAudioSources(track) : [];

  // Determine if this track is the current global track
  const isCurrentGlobal = globalPlayer
    ? (globalPlayer.activeTrack?.audioUrl === src || (Boolean(id) && globalPlayer.activeTrack?.id === id))
    : false;

  const isPlaying = globalPlayer ? isCurrentGlobal && globalPlayer.isPlaying : localPlaying;

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
        globalPlayer.playTrack({
          id: id || src || track?.youtube_video_id || 'unknown',
          title: safeString(title),
          artist: safeString(artist, "Artista EPK"),
          audioUrl: src || '',
          coverImage,
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
    setShowSourceSelector(false);
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
      {/* Source Selector */}
      {sources.length > 1 && (
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
                {s.label} {s.type === 'preview' && '(30s)'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* YouTube Only Notice */}
      {sources.length === 1 && sources[0].type === 'youtube' && (
        <div className="p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-700 dark:text-amber-300">
          🎥 Reproduciendo desde YouTube (iframe embed)
        </div>
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
              {(currentSource?.type === 'youtube' || (track?.youtube_video_id && !track?.audio_preview_url && !track?.spotify_url && !track?.apple_music_url)) && (
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

        {/* Source Switcher Button */}
        {sources.length > 1 && (
          <button
            onClick={() => setShowSourceSelector(!showSourceSelector)}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Cambiar fuente de audio"
          >
            🔀
          </button>
        )}
      </div>

      {/* Source Selector Dropdown */}
      {showSourceSelector && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg p-2 z-10">
          {sources.map((source) => (
            <button
              key={source.type}
              onClick={() => switchSource(source)}
              className={`w-full text-left px-3 py-2 text-sm rounded ${
                currentSource?.type === source.type
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{source.label}</span>
                {source.type === 'preview' && <span className="text-xs text-slate-500">(30s preview)</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
