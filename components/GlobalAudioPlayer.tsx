"use client";

import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";

export function GlobalAudioPlayer() {
  const { activeTrack, isPlaying, duration, currentTime, volume, isVisualizerOpen, isYouTubeMode, togglePlay, clearTrack, seek, setVolume, toggleVisualizer, audioRef } = useAudioPlayer();
  const [showVolume, setShowVolume] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Auto-hide: collapse after 5s of no interaction when playing
  useEffect(() => {
    if (!activeTrack || !isPlaying) {
      setIsExpanded(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      return;
    }

    const startTimer = () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        if (isPlayingRef.current) setIsExpanded(false);
      }, 5000);
    };

    startTimer();

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [activeTrack, isPlaying]);

  const handleMouseEnter = () => {
    setIsExpanded(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };

  const handleMouseLeave = () => {
    if (isPlaying) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        if (isPlayingRef.current) setIsExpanded(false);
      }, 5000);
    }
  };

  if (!activeTrack) return null;

  const formatTime = (s: number) => {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <AnimatePresence>
      {activeTrack && (
        <motion.div
          key="global-audio-player"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 shadow-2xl safe-area-pb"
        >
          {isVisualizerOpen && (
            <div className="relative w-full h-24 bg-slate-50 dark:bg-slate-800/50">
              <AudioVisualizer />
              <button
                onClick={toggleVisualizer}
                className="absolute top-2 right-2 p-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 transition-colors z-10"
                aria-label="Cerrar visualizador"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Progress bar — always visible (thin bar when collapsed) */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-700">
            <motion.div
              className="h-full bg-gradient-to-r from-primary-500 to-violet-500"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
            />
          </div>

          <AnimatePresence mode="wait">
            {isExpanded ? (
              <motion.div
                key="expanded"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="max-w-7xl mx-auto px-4 py-3 overflow-hidden"
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleVisualizer}
                    className={`p-2 rounded-lg transition-colors ${isVisualizerOpen ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    aria-label={isVisualizerOpen ? "Cerrar visualizador" : "Abrir visualizador"}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {activeTrack.coverImage && (
                      <img src={activeTrack.coverImage} alt={activeTrack.title} className="w-12 h-12 rounded-lg object-cover shadow-md" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{activeTrack.title}</p>
                        {isYouTubeMode && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded border border-red-200 dark:border-red-800">
                            YT
                          </span>
                        )}
                      </div>
                      {activeTrack.artist && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{activeTrack.artist}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-1 justify-center max-w-xl">
                    <span className="text-xs text-slate-500 dark:text-slate-400 w-10 text-right font-mono">{formatTime(currentTime)}</span>

                    <div className="flex-1 relative group">
                      <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={currentTime}
                        onChange={(e) => seek(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-primary-500 group-hover:h-2 transition-all"
                      />
                    </div>

                    <span className="text-xs text-slate-500 dark:text-slate-400 w-10 font-mono">{formatTime(duration)}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <div
                      className="relative"
                      onMouseEnter={() => setShowVolume(true)}
                      onMouseLeave={() => setShowVolume(false)}
                    >
                      <button
                        onClick={() => setVolume(volume > 0 ? 0 : 0.85)}
                        className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        {volume === 0 ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                          </svg>
                        ) : volume < 0.5 ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                        )}
                      </button>

                      <AnimatePresence>
                        {showVolume && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl p-3 w-8 h-24 flex items-center justify-center"
                          >
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={volume}
                              onChange={(e) => setVolume(parseFloat(e.target.value))}
                              className="w-20 h-1 accent-primary-500"
                              style={{ writingMode: "vertical-lr", direction: "rtl", height: "100%" }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <button
                      onClick={togglePlay}
                      className="p-2.5 bg-primary-500 text-white rounded-full hover:bg-primary-600 transition-colors shadow-lg shadow-primary-500/25"
                    >
                      {isPlaying ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                        </svg>
                      )}
                    </button>

                    <button
                      onClick={clearTrack}
                      className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      aria-label="Cerrar reproductor"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="collapsed"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="max-w-7xl mx-auto px-4 py-2 overflow-hidden"
              >
                <div className="flex items-center gap-3">
                  {activeTrack.coverImage && (
                    <img src={activeTrack.coverImage} alt={activeTrack.title} className="w-8 h-8 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{activeTrack.title}</p>
                  </div>
                  <button
                    onClick={togglePlay}
                    className="p-1.5 bg-primary-500 text-white rounded-full hover:bg-primary-600 transition-colors"
                  >
                    {isPlaying ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={clearTrack}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                    aria-label="Cerrar reproductor"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
