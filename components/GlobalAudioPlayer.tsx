"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { safeString } from "@/lib/null-safe";
import { AudioVisualizer } from "./AudioVisualizer";

const AUTO_HIDE_DELAY = 5000; // 5 seconds

export function GlobalAudioPlayer() {
  const {
    activeTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isVisualizerOpen,
    togglePlay,
    seek,
    setVolume,
    toggleVisualizer,
  } = useAudioPlayer();

  const [isHovered, setIsHovered] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      if (!isPlaying) {
        setIsMinimized(true);
      }
    }, AUTO_HIDE_DELAY);
  }, [clearHideTimer, isPlaying]);

  // Auto-hide when playing and no interaction
  useEffect(() => {
    if (isPlaying && !isHovered) {
      startHideTimer();
    } else {
      clearHideTimer();
    }
    return clearHideTimer;
  }, [isPlaying, isHovered, startHideTimer, clearHideTimer]);

  // Show player when track starts
  useEffect(() => {
    if (activeTrack) {
      setIsMinimized(false);
    }
  }, [activeTrack]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    setIsMinimized(false);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  if (!activeTrack) return null;

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(parseFloat(e.target.value));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };

  const formatSeconds = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Minimized state: show thin progress bar
  if (isMinimized && !isHovered) {
    return (
      <div
        ref={containerRef}
        className="fixed bottom-0 left-0 right-0 z-50"
        onMouseEnter={handleMouseEnter}
        onTouchStart={() => setIsMinimized(false)}
      >
        {/* Thin progress bar */}
        <div className="max-w-4xl mx-auto px-4">
          <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Full player
  return (
    <div
      ref={containerRef}
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isVisualizerOpen && (
        <div className="max-w-4xl mx-auto mb-3">
          <AudioVisualizer height={80} />
        </div>
      )}

      <div className="max-w-4xl mx-auto bg-dark-900/90 dark:bg-dark-900/95 backdrop-blur-xl border border-dark-700/80 rounded-2xl shadow-2xl p-3 sm:p-4 text-white">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Info del Track */}
          <div className="flex items-center gap-3 w-full sm:w-1/3 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-dark-800 flex-shrink-0 overflow-hidden relative border border-dark-700">
              {activeTrack.coverImage ? (
                <img
                  src={activeTrack.coverImage}
                  alt={safeString(activeTrack.title)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl">
                  🎵
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">
                {safeString(activeTrack.title)}
              </p>
              <p className="text-xs text-dark-400 truncate">
                {safeString(activeTrack.artist, "Artista EPK")}
              </p>
            </div>
          </div>

          {/* Controles Principales & Scrubber */}
          <div className="flex-1 w-full flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-primary-600 hover:bg-primary-500 text-white flex items-center justify-center transition shadow-md hover:scale-105"
                aria-label={isPlaying ? "Pausar" : "Reproducir"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>

              <button
                onClick={toggleVisualizer}
                className={`text-xs px-2.5 py-1 rounded-full border transition flex items-center gap-1.5 ${
                  isVisualizerOpen
                    ? "bg-purple-600/30 border-purple-500 text-purple-300"
                    : "border-dark-700 text-dark-400 hover:text-white"
                }`}
                title="Alternar Visualizador de Espectro"
              >
                <span>📊</span>
                <span className="hidden md:inline">Visualizador</span>
              </button>
            </div>

            {/* Barra de progreso */}
            <div className="w-full flex items-center gap-2 text-xs text-dark-400">
              <span className="w-8 text-right font-mono">{formatSeconds(currentTime)}</span>
              <div className="relative flex-1 flex items-center">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeekChange}
                  className="w-full h-1.5 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500 hover:h-2 transition-all"
                  aria-label="Progreso del audio"
                />
              </div>
              <span className="w-8 font-mono">{formatSeconds(duration)}</span>
            </div>
          </div>

          {/* Control de Volumen */}
          <div className="hidden sm:flex items-center justify-end gap-2 w-1/4">
            <span className="text-xs text-dark-400">
              {volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-1.5 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
              aria-label="Control de volumen"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
