"use client";

import { useRef, useState } from "react";
import { safeString, hasValue } from "@/lib/null-safe";

interface AudioPlayerProps {
  src: string | undefined;
  title: string | null;
}

export function AudioPlayer({ src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-dark-50 dark:bg-dark-800 rounded-lg">
      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition"
        aria-label={isPlaying ? "Pausar" : "Reproducir"}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {safeString(title)}
        </p>
        {hasValue(src, "src") ? (
          <audio
            ref={audioRef}
            src={src}
            onEnded={() => setIsPlaying(false)}
          />
        ) : (
          <p className="text-xs text-dark-400">No hay audio disponible</p>
        )}
      </div>
    </div>
  );
}
