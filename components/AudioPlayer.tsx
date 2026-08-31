"use client";

import { useRef, useState, useContext } from "react";
import { safeString } from "@/lib/null-safe";
import { AudioPlayerContext } from "@/context/AudioPlayerContext";

interface AudioPlayerProps {
  src: string | undefined;
  title: string | null;
  id?: string;
  artist?: string;
  coverImage?: string;
}

export function AudioPlayer({ src, title, id, artist, coverImage }: AudioPlayerProps) {
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const [localPlaying, setLocalPlaying] = useState(false);
  const globalPlayer = useContext(AudioPlayerContext);

  const isCurrentGlobal =
    globalPlayer?.activeTrack?.audioUrl === src ||
    (Boolean(id) && globalPlayer?.activeTrack?.id === id);

  const isPlaying = globalPlayer ? isCurrentGlobal && globalPlayer.isPlaying : localPlaying;

  const togglePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!src) return;

    if (globalPlayer) {
      if (isCurrentGlobal) {
        globalPlayer.togglePlay();
      } else {
        globalPlayer.playTrack({
          id: id || src,
          title: safeString(title),
          artist: safeString(artist, "Artista EPK"),
          audioUrl: src,
          coverImage,
        });
      }
      return;
    }

    const audio = localAudioRef.current;
    if (!audio) return;
    if (localPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setLocalPlaying(!localPlaying);
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-dark-800 rounded-lg">
      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition flex-shrink-0"
        aria-label={isPlaying ? "Pausar" : "Reproducir"}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {safeString(title)}
        </p>
        {src ? (
          <>
            {!globalPlayer && (
              <audio
                ref={localAudioRef}
                src={src}
                onEnded={() => setLocalPlaying(false)}
              />
            )}
            <p className="text-xs text-primary-600 dark:text-primary-400 font-medium">
              {isPlaying ? "Reproduciendo..." : "Listo para reproducir"}
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-400">No hay audio disponible</p>
        )}
      </div>
    </div>
  );
}
