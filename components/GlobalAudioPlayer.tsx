"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { imageOptimizationProps } from "@/lib/image-config";
import {
  SKIP_NEXT_GLYPH,
  SKIP_PREV_GLYPH,
  formatClock,
  resolvePlaybackTimeline,
  timelineProgress,
  timelineScrubValue,
  timelineSeekTarget,
} from "@/lib/audio-priority";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";

const AudioVisualizer = dynamic(() => import("@/components/AudioVisualizer").then((m) => m.AudioVisualizer), {
  ssr: false,
});

export function GlobalAudioPlayer() {
  const {
    activeTrack, isPlaying, isLoading, error, duration, currentTime, volume,
    isVisualizerOpen, isYouTubeMode, timelineWarning, queuePosition, hasNext, hasPrev,
    togglePlay, next, prev, clearTrack, seek, setVolume, toggleVisualizer, audioRef,
  } = useAudioPlayer();
  const [showVolume, setShowVolume] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Determine play/pause button content (Unicode icons matching EPKCard)
  const playButton = isPlaying ? "⏸" : "▶";
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

  /**
   * Una sola línea de tiempo para la barra, el scrubber y las dos etiquetas.
   *
   * Antes cada zona calculaba su propia ventana a partir de
   * `activeTrack.startTimestamp/endTimestamp` con `duration` como suplente, y por
   * eso la etiqueta izquierda (`formatTime(currentTime)`, del elemento `<audio>`)
   * y la derecha (`formatTime(end || duration)`, de metadatos de capítulo) salían
   * de **fuentes distintas**: un preview de iTunes con `end_time = 501` pintaba
   * `0:08` a la izquierda y `8:21` a la derecha.
   *
   * `resolvePlaybackTimeline` decide por **medio que suena**: si no es YouTube,
   * los capítulos no aplican. Y `mediaDuration` es la duración real
   * (`loadedmetadata` / `yt.getDuration()`), no el `end_time` inventado.
   */
  const timeline = resolvePlaybackTimeline({
    sourceType: isYouTubeMode ? "youtube" : "preview",
    declaredStart: activeTrack.startTimestamp,
    declaredEnd: activeTrack.endTimestamp,
    mediaDuration: duration,
  });

  const progress = timelineProgress(timeline, currentTime);

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
          {isVisualizerOpen && !isYouTubeMode && (
            <div className="relative w-full h-48 bg-slate-50 dark:bg-slate-800/50">
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

          {/* Barra de progreso. `progress` viene recortado a [0, 100] y nunca es
              negativo: la versión anterior hacía `((currentTime - start) /
              segmentDuration) * 100`, que con `start=265, end=501, currentTime=8`
              daba -108% → recortado a 0, y la barra se quedaba en 0 durante los
              30 s enteros del preview. */}
          {(() => {
            return isExpanded ? (
              <div className="mt-4 bg-slate-200 dark:bg-slate-700 h-1">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary-500 to-violet-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            ) : (
              <div className="mt-2 bg-slate-200 dark:bg-slate-700 h-1">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary-500 to-violet-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            );
          })()}

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
                  {!isYouTubeMode && (
                    <button
                      onClick={toggleVisualizer}
                      className={`p-2 rounded-lg transition-colors ${isVisualizerOpen ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      aria-label={isVisualizerOpen ? "Cerrar visualizador" : "Abrir visualizador"}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </button>
                  )}

                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {activeTrack.coverImage && (
                      <Image src={activeTrack.coverImage} alt={activeTrack.title} width={48} height={48} {...imageOptimizationProps(activeTrack.coverImage)} className="w-12 h-12 rounded-lg object-cover shadow-md" />
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

                  <button
                    onClick={prev}
                    disabled={!hasPrev}
                    aria-disabled={!hasPrev}
                    aria-label="Pista anterior"
                    title={hasPrev ? "Pista anterior" : "No hay pista anterior"}
                    className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-slate-500 dark:disabled:hover:text-slate-400 transition-colors flex-shrink-0"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {/* RC.32: este botón llevaba el glifo *forward* (`>>`). El
                          handler y el `aria-label` ya eran correctos; lo cruzado
                          era la ruta. `SKIP_PREV_GLYPH` apunta a la izquierda. */}
                      <path strokeLinecap="round" strokeLinejoin="round" d={SKIP_PREV_GLYPH} />
                    </svg>
                  </button>

                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition flex-shrink-0"
                    aria-label={isPlaying ? "Pausar" : "Reproducir"}
                  >
                    {playButton}
                  </button>

                  <button
                    onClick={next}
                    disabled={!hasNext}
                    aria-disabled={!hasNext}
                    aria-label="Pista siguiente"
                    title={hasNext ? "Pista siguiente" : "No hay pista siguiente"}
                    className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-slate-500 dark:disabled:hover:text-slate-400 transition-colors flex-shrink-0"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {/* RC.32: este botón llevaba el glifo *backward* (`<<`). */}
                      <path strokeLinecap="round" strokeLinejoin="round" d={SKIP_NEXT_GLYPH} />
                    </svg>
                  </button>

                  {queuePosition && (
                    <span
                      className="text-xs font-mono text-slate-400 dark:text-slate-500 flex-shrink-0"
                      aria-label={`Pista ${queuePosition} de la cola`}
                    >
                      {queuePosition}
                    </span>
                  )}

                  <button
                    onClick={clearTrack}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                    aria-label="Cerrar reproductor"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-2 flex-1 justify-center max-w-xl">
                    <span className="text-xs text-slate-500 dark:text-slate-400 w-10 text-right font-mono">{formatClock(currentTime)}</span>
                    <div className="flex-1 relative group">
                      <input
                        type="range"
                        min={timeline.start}
                        max={timeline.end}
                        step={0.1}
                        value={timelineScrubValue(timeline, currentTime)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          seek(timelineSeekTarget(timeline, val));
                        }}
                        aria-label="Posición de reproducción"
                        aria-valuetext={`${formatClock(currentTime)} de ${formatClock(timeline.end)}`}
                        className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-primary-500 group-hover:h-2 transition-all"
                      />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 w-10 font-mono">{formatClock(timeline.end)}</span>
                  </div>

                  {/* Aviso de línea de tiempo: los capítulos del vídeo no aplican a
                      este medio, o el segmento declarado no era utilizable. No es
                      un error de reproducción, así que no se mezcla con `error`
                      (que lleva su propio "Reintentar").
                      El texto viene del contexto, no de `timeline.warning`: al
                      pintar, `activeTrack` ya viene limpio de timestamps y
                      `timeline.warning` sería siempre `""`. */}
                  {timelineWarning && (
                    <div
                      className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg"
                      role="status"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>{timelineWarning}</span>
                    </div>
                  )}

                  {/* P3.34: Error indicator */}
                  {error && (
                    <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>{error}</span>
                      <button
                        onClick={togglePlay}
                        className="ml-2 underline hover:no-underline"
                      >
                        Reintentar
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setVolume(volume > 0 ? 0 : 0.85)}
                      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1.5"
                    >
                      <svg
                        className="w-4 h-4 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        {volume === 0 ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        ) : volume < 0.5 ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        )}
                      </svg>
                      <span className="text-xs font-medium ml-1">{Math.round(volume * 100)}%</span>
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-24 h-1.5 accent-primary-500 rounded-full cursor-pointer accent-primary-500 group-hover:h-2 transition-all"
                      style={{ width: "100px" }}
                    />
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
                      <Image src={activeTrack.coverImage} alt={activeTrack.title} width={32} height={32} {...imageOptimizationProps(activeTrack.coverImage)} className="w-8 h-8 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{activeTrack.title}</p>
                  </div>
                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition"
                  >
                    {playButton}
                  </button>
                  <button
                    onClick={clearTrack}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    aria-label="Cerrar reproductor"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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