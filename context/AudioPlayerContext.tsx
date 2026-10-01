"use client";

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import { getAudioContext } from "@/lib/web-audio";
import { getYouTubePlayer, destroyYouTubePlayer, YT_STATE } from "@/lib/youtube-player";
import {
  advanceQueue,
  createQueue,
  hasNextInQueue,
  hasPrevInQueue,
  prevQueueIndex,
  queuePositionLabel,
  reindexQueue,
  resolvePlaybackTimeline,
  shouldUseCrossOrigin,
  timelineSeekTarget,
  type AudioSourceType,
  type QueueState,
  type QueueTrack,
} from "@/lib/audio-priority";

/**
 * Estructuralmente compatible con `QueueTrack` de `lib/audio-priority.ts`, así
 * que una `ActiveTrack[]` entra en `playQueue()` sin cast.
 */
export interface ActiveTrack extends QueueTrack {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
  coverImage?: string;
  isYouTube?: boolean;
  youtubeVideoId?: string;
  /**
   * P3 Batch 2: capítulos sobre un MISMO vídeo (segmentar un vídeo).
   * OJO: esto NO es la cola de pistas.
   *
   * ## Son un espacio de coordenadas DISTINTO al del medio que suena
   *
   * `startTimestamp`/`endTimestamp` son offsets dentro de un **vídeo de YouTube**.
   * Cuando la fuente es un **fichero independiente** (`source.type === 'preview'`,
   * el preview de iTunes/Deezer de 30 s) estos campos describen otro medio y no
   * aplican: `loadTrack` los **borra** en lugar de dejarlos "perder" contra la
   * duración.
   *
   * No basta con que `duration` gane en la etiqueta. El scrubber también los
   * leía, y con `start = 265, end = 501` sobre un fichero de 30 s el valor del
   * `input[type=range]` era 265 mientras la etiqueta decía 0:08; arrastrar
   * llamaba a `seek()`, que recortaba a `[265, 501]` → `audio.currentTime = 265`
   * en un fichero de 30 s → `ended` → **salto de pista**.
   *
   * Ver `resolvePlaybackTimeline` en `lib/audio-priority.ts` (fuente única de la
   * regla) y `validateChapterSegment` (validador publicado para el schema Zod).
   */
  startTimestamp?: number;
  endTimestamp?: number;
}

export interface AudioPlayerContextType {
  activeTrack: ActiveTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  duration: number;
  currentTime: number;
  volume: number;
  isVisualizerOpen: boolean;
  isYouTubeMode: boolean;
  /**
   * Aviso de línea de tiempo de la pista en curso, `""` si no hay ninguno.
   *
   * Vive aquí y no en `activeTrack.endTimestamp` porque `loadTrack` **ya limpió**
   * los timestamps del `ActiveTrack`: al pintar, el reproductor vuelve a derivar
   * la línea de tiempo de esos valores saneados, y una ventana descartada ya no
   * se distingue de "no había ventana". El aviso se captura en el momento de
   * cargar, con los valores declarados, que es cuando existe la información.
   *
   * Ejemplos: los capítulos del vídeo no aplican a un preview de audio, o el
   * segmento declarado pasa de 30 s.
   */
  timelineWarning: string;
  /** Pistas de la cola montada con `playQueue`. */
  queue: QueueTrack[];
  /** Índice de la pista en curso, o -1 si no hay cola. */
  queueIndex: number;
  /** "3/12", o "" sin cola. */
  queuePosition: string;
  hasNext: boolean;
  hasPrev: boolean;
  playTrack: (track: ActiveTrack) => void;
  /** Monta la cola completa y arranca en `startIndex`. */
  playQueue: (items: ActiveTrack[], startIndex?: number) => void;
  next: () => void;
  prev: () => void;
  togglePlay: () => void;
  pause: () => void;
  clearTrack: () => void;
  seek: (time: number) => void;
  setVolume: (val: number) => void;
  toggleVisualizer: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

/** Referencia estable: un array nuevo en cada render re-renderiza el consumidor. */
const EMPTY_QUEUE: QueueTrack[] = [];

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [activeTrack, setActiveTrackState] = useState<ActiveTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisualizerOpen, setIsVisualizerOpen] = useState(false);
  const [isYouTubeMode, setIsYouTubeMode] = useState(false);
  const [timelineWarning, setTimelineWarning] = useState("");
  const [queueState, setQueueState] = useState<QueueState | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeSyncRef = useRef<NodeJS.Timeout | null>(null);
  const startTimestampRef = useRef<number>(0);
  const endTimestampRef = useRef<number>(0);
  const isYouTubeModeRef = useRef(false);

  // --- Espejos en refs -----------------------------------------------------
  // Antes, `useEffect(..., [])` (y los `setTimeout` de los callbacks de YouTube)
  // capturaban estado ya obsoleto. La cola se decide con funciones puras pero se
  // aplica con estos espejos, que nunca quedan viejos.
  const activeTrackRef = useRef<ActiveTrack | null>(null);
  const isPlayingRef = useRef(false);
  const volumeRef = useRef(0.85);
  /**
   * Espejo de `duration` para `seek()`, que se declara con `[]` y no puede leer
   * el estado. Sin esto recortaría contra la duración de la pista anterior.
   */
  const durationRef = useRef(0);
  const queueRef = useRef<QueueState | null>(null);
  /** Sube en cada carga: los callbacks de una pista ya descartada se ignoran. */
  const loadTokenRef = useRef(0);
  /** Puente entre `useEffect([])` / callbacks de YouTube y `advance`. */
  const advanceRef = useRef<() => void>(() => {});
  const sourceFailureRef = useRef<(track: ActiveTrack) => void>(() => {});

  const setActiveTrack = useCallback((track: ActiveTrack | null) => {
    activeTrackRef.current = track;
    setActiveTrackState(track);
  }, []);

  const updatePlaying = useCallback((next: boolean) => {
    isPlayingRef.current = next;
    setIsPlaying(next);
  }, []);

  const setQueue = useCallback((next: QueueState | null) => {
    queueRef.current = next;
    setQueueState(next);
  }, []);

  volumeRef.current = volume;
  durationRef.current = duration;

  const stopYouTubeSync = useCallback(() => {
    if (youtubeSyncRef.current) {
      clearInterval(youtubeSyncRef.current);
      youtubeSyncRef.current = null;
    }
  }, []);

  const startYouTubeSync = useCallback(() => {
    if (youtubeSyncRef.current) clearInterval(youtubeSyncRef.current);
    youtubeSyncRef.current = setInterval(() => {
      const yt = getYouTubePlayer();
      if (!yt.isReady()) return;

      const ytState = yt.getState();
      const ytTime = yt.getCurrentTime();
      const ytDuration = yt.getDuration();

      setCurrentTime(ytTime);
      if (ytDuration > 0) setDuration(ytDuration);

      // P3 Batch 2: fin de capítulo == fin de pista → avanzar.
      if (endTimestampRef.current > 0 && ytTime >= endTimestampRef.current) {
        yt.pause();
        advanceRef.current();
        return;
      }

      if (ytState === YT_STATE.ENDED) {
        advanceRef.current();
      } else if (ytState === YT_STATE.PLAYING) {
        updatePlaying(true);
      } else if (ytState === YT_STATE.PAUSED) {
        updatePlaying(false);
      }
    }, 250);
  }, [updatePlaying]);

  /**
   * Avance automático. Cuando se acaba la cola, `advanceQueue` devuelve `null`
   * y aquí se **para** (no se reinicia): un bucle infinito silencioso sería
   * peor que un final honesto. Las pistas no reproducibles se saltan solas.
   */
  const advance = useCallback((forcePlay = false) => {
    const next = advanceQueue(queueRef.current);
    if (!next) {
      setIsLoading(false);
      updatePlaying(false);
      return;
    }
    setQueue(next);
    loadTrackRef.current(next.items[next.index] as ActiveTrack, forcePlay || isPlayingRef.current);
  }, [setQueue, updatePlaying]);

  /** `loadTrack` se declara después de `advance`; este ref rompe el ciclo. */
  const loadTrackRef = useRef<(track: ActiveTrack, autoplay: boolean) => void>(() => {});

  /**
   * Carga una pista en el reproductor. `autoplay=false` deja la pista cargada
   * y en pausa (botón "siguiente" con la cola en pausa).
   */
  const loadTrack = useCallback((track: ActiveTrack, autoplay: boolean) => {
    const isYT = track.isYouTube === true && !!track.youtubeVideoId;
    const token = ++loadTokenRef.current;
    const isStale = () => token !== loadTokenRef.current;

    setError(null);
    setIsLoading(false);

    /**
     * Línea de tiempo de ESTA pista, y solo de esta.
     *
     * `mediaDuration` se pasa a `0` a propósito: la `duration` del estado es la
     * de la pista anterior hasta que llegue `loadedmetadata`. Para YouTube eso
     * deja el fallback de 30 s (el comportamiento previo) y para un preview da
     * `end = 0` — que es exactamente "no hay ventana de capítulo", porque los
     * timestamps declarados se descartan.
     *
     * Lo que sale de aquí se escribe en el `ActiveTrack` (limpieza de raíz) y en
     * los espejos que leen `seek()` y el poll de YouTube. Antes se hacía
     *
     *   const effectiveEnd = isYT && (!track.endTimestamp || track.endTimestamp === 0)
     *     ? 30 : (track.endTimestamp || 0);
     *
     * que para un preview de iTunes con `end_time = 501` daba `effectiveEnd = 501`
     * y propagaba el dato inventado a la etiqueta, al scrubber y al `seek()`.
     */
    const timeline = resolvePlaybackTimeline({
      sourceType: (isYT ? "youtube" : "preview") as AudioSourceType,
      declaredStart: track.startTimestamp,
      declaredEnd: track.endTimestamp,
      mediaDuration: 0,
    });

    setActiveTrack({ ...track, startTimestamp: timeline.start, endTimestamp: timeline.end });
    // Se captura aquí, con los valores **declarados**, porque a partir de este
    // punto el `ActiveTrack` ya no los tiene (es el punto de la limpieza).
    setTimelineWarning(timeline.warning);
    setIsYouTubeMode(isYT);
    isYouTubeModeRef.current = isYT;
    startTimestampRef.current = timeline.start;
    endTimestampRef.current = timeline.end;

    if (isYT) {
      // Pause HTML5 audio if playing and reset src to prevent conflicts
      const idle = audioRef.current;
      if (idle) {
        idle.pause();
        idle.src = "";
        idle.crossOrigin = null;
        idle.load();
      }
      stopYouTubeSync();

      setIsLoading(true);
      const yt = getYouTubePlayer();
      yt.init(track.youtubeVideoId!, {
        onReady: () => {
          if (isStale()) return;
          yt.setVolume(volumeRef.current);
          const doPlay = () => {
            if (isStale()) return;
            setIsLoading(false);
            if (!autoplay) {
              updatePlaying(false);
              return;
            }
            yt.play();
            updatePlaying(true);
            startYouTubeSync();
          };
          // `timeline.start`, no `track.startTimestamp`: si el segmento se
          // descartó por invertido o demasiado largo, arrancar en el capítulo
          // inválido era parte del salto instantáneo de pista.
          if (timeline.start > 0) {
            yt.seek(timeline.start);
            setTimeout(doPlay, 300);
          } else {
            // Minimum 500ms so "Cargando..." is visible
            setTimeout(doPlay, 500);
          }
        },
        onStateChange: (state) => {
          if (isStale()) return;
          if (state === YT_STATE.ENDED) {
            // Antes solo paraba. Ahora avanza: eso es lo que convierte un
            // release multipista en una cola con avance automático.
            advanceRef.current();
          } else if (state === YT_STATE.PLAYING) {
            updatePlaying(true);
          } else if (state === YT_STATE.PAUSED) {
            updatePlaying(false);
          }
        },
        onError: (errorCode: number) => {
          if (isStale()) return;
          const errorMessages: Record<number, string> = {
            2: "Parámetro inválido",
            3: "Error de reproducción",
            5: "Error de HTML5",
            100: "Video no encontrado",
            150: "Video no disponible",
          };
          setError(errorMessages[errorCode] || "Error de YouTube desconocido");
          updatePlaying(false);
        },
      }, {
        start: timeline.start > 0 ? timeline.start : undefined,
        end: timeline.end > 0 ? timeline.end : undefined,
      });
      return;
    }

    // HTML5 audio mode
    stopYouTubeSync();
    destroyYouTubePlayer();
    void getAudioContext();

    const audio = audioRef.current;
    if (!audio) return;

    // El atributo va **imperativamente**, no por prop: `setActiveTrack` es
    // asíncrono y si dependiera del render, la reproducción arrancaría con el
    // `crossOrigin` de la pista anterior. Ver la medición en
    // `shouldUseCrossOrigin`.
    audio.crossOrigin = shouldUseCrossOrigin(track.audioUrl) ? "anonymous" : null;

    if (!track.audioUrl || track.audioUrl.trim() === "") {
      sourceFailureRef.current(track);
      return;
    }

    audio.src = track.audioUrl;
    if (!autoplay) {
      updatePlaying(false);
      return;
    }
    audio.play().then(() => {
      if (isStale()) return;
      updatePlaying(true);
    }).catch((err) => {
      if (isStale()) return;
      console.error("Error starting playback:", err);
      sourceFailureRef.current(track);
    });
  }, [setActiveTrack, updatePlaying, stopYouTubeSync, startYouTubeSync]);

  // Se sincroniza tras cada render para que los listeners con `[]` y los
  // callbacks de YouTube vean siempre la versión viva.
  useEffect(() => {
    loadTrackRef.current = loadTrack;
    advanceRef.current = () => advance(true);
    sourceFailureRef.current = (track: ActiveTrack) => {
      const next = advanceQueue(queueRef.current);
      const label = track.title ? `«${track.title}»` : "La pista";
      if (next) {
        setQueue(next);
        loadTrackRef.current(next.items[next.index] as ActiveTrack, true);
        setError(`${label} no se pudo reproducir — se saltó a la siguiente`);
      } else {
        setError(`${label} no tiene una fuente disponible`);
        updatePlaying(false);
      }
    };
  });

  const playTrack = useCallback((track: ActiveTrack) => {
    // Si ya está sonando, no se reinicia (comportamiento previo). Si es la
    // misma pista en pausa, `togglePlay` es quien reanuda.
    if (activeTrackRef.current?.id === track.id && isPlayingRef.current) return;

    const state = queueRef.current;
    const inQueue = state?.items.some((item) => item.id === track.id) ?? false;
    // Ya estaba en la cola → se reinicia el índice ahí y **se conserva el
    // resto**. No estaba → la cola pasa a ser esa pista sola.
    const reindexed = inQueue ? reindexQueue(state, track) : createQueue([track], 0);

    if (!reindexed) {
      sourceFailureRef.current(track);
      return;
    }
    setQueue(reindexed);
    loadTrack(track, true);
  }, [loadTrack, setQueue]);

  const playQueue = useCallback((items: ActiveTrack[], startIndex = 0) => {
    const created = createQueue(items, startIndex);
    if (!created) {
      // Ninguna pista de la lista es reproducible: no se toca lo que esté
      // sonando y se dice por qué, en vez de dejar un botón inerte.
      const first = Array.isArray(items) ? items[0] : undefined;
      setError(
        first?.title
          ? `«${first.title}» no tiene ninguna fuente de audio disponible`
          : "Ninguna pista de esta lista tiene audio disponible",
      );
      return;
    }
    setQueue(created);
    loadTrack(created.items[created.index] as ActiveTrack, true);
  }, [loadTrack, setQueue]);

  const next = useCallback(() => {
    const state = queueRef.current;
    if (!state) return;
    if (!hasNextInQueue(state)) {
      updatePlaying(false);
      return;
    }
    advance(false);
  }, [advance, updatePlaying]);

  const prev = useCallback(() => {
    const state = queueRef.current;
    if (!state) return;
    const index = prevQueueIndex(state);
    if (index === state.index) {
      updatePlaying(false);
      return;
    }
    setQueue({ items: state.items, index });
    loadTrackRef.current(state.items[index] as ActiveTrack, isPlayingRef.current);
  }, [setQueue, updatePlaying]);

  const togglePlay = useCallback(() => {
    if (!activeTrackRef.current) return;

    setError(null);

    if (isYouTubeModeRef.current) {
      const yt = getYouTubePlayer();
      if (isPlayingRef.current) {
        yt.pause();
        updatePlaying(false);
        stopYouTubeSync();
      } else {
        void getAudioContext();
        yt.play();
        updatePlaying(true);
        startYouTubeSync();
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    void getAudioContext();

    if (isPlayingRef.current) {
      audio.pause();
      updatePlaying(false);
    } else {
      audio.play().then(() => updatePlaying(true)).catch((err) => {
        console.error("Error toggling playback:", err);
        setError("Error al reanudar reproducción");
      });
    }
  }, [updatePlaying, startYouTubeSync, stopYouTubeSync]);

  const pause = useCallback(() => {
    if (isYouTubeModeRef.current) {
      const yt = getYouTubePlayer();
      yt.pause();
      updatePlaying(false);
      stopYouTubeSync();
    } else if (audioRef.current) {
      audioRef.current.pause();
      updatePlaying(false);
    }
  }, [updatePlaying, stopYouTubeSync]);

  const clearTrack = useCallback(() => {
    // Always clean up YouTube player and sync regardless of current mode
    stopYouTubeSync();
    destroyYouTubePlayer();

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.crossOrigin = null;
      audioRef.current.load();
    }
    loadTokenRef.current++;
    setActiveTrack(null);
    updatePlaying(false);
    setCurrentTime(0);
    setDuration(0);
    durationRef.current = 0;
    setIsVisualizerOpen(false);
    setIsYouTubeMode(false);
    setTimelineWarning("");
    isYouTubeModeRef.current = false;
    startTimestampRef.current = 0;
    endTimestampRef.current = 0;
    setQueue(null);
  }, [setActiveTrack, setQueue, updatePlaying, stopYouTubeSync]);

  const seek = useCallback((time: number) => {
    if (!Number.isFinite(time)) return;

    /**
     * Se recorta con la **misma** línea de tiempo que pinta el scrubber, no con
     * los espejos sueltos.
     *
     * Antes:
     *
     *   const start = startTimestampRef.current;   // 265
     *   const end = endTimestampRef.current;       // 501
     *   if (end > 0) clamped = Math.max(start, Math.min(end, time));
     *
     * Es decir, `clamped = 265` siempre, sobre un fichero de 30 s. El `<audio>`
     * buscaba más allá de su final, disparaba `ended` y `handleEnded` saltaba de
     * pista. Ahora `startTimestampRef`/`endTimestampRef` contienen la ventana ya
     * saneada (0/0 para un preview), así que `timelineSeekTarget` recorta a
     * `[0, duración real]` y el salto no puede ocurrir.
     *
     * `durationRef` existe porque `seek` se declara con `[]`: sin espejo leería
     * la duración de la pista anterior.
     */
    const timeline = resolvePlaybackTimeline({
      sourceType: (isYouTubeModeRef.current ? "youtube" : "preview") as AudioSourceType,
      declaredStart: startTimestampRef.current,
      declaredEnd: endTimestampRef.current,
      mediaDuration: durationRef.current,
    });
    const clamped = timelineSeekTarget(timeline, time);

    if (isYouTubeModeRef.current) {
      const yt = getYouTubePlayer();
      yt.seek(clamped);
      setCurrentTime(clamped);
    } else if (audioRef.current) {
      audioRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    }
  }, []);

  const setVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    volumeRef.current = clamped;
    setVolumeState(clamped);

    if (isYouTubeModeRef.current) {
      const yt = getYouTubePlayer();
      yt.setVolume(clamped);
    } else if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  const toggleVisualizer = useCallback(() => {
    setIsVisualizerOpen((prev) => !prev);
  }, []);

  // HTML5 audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // P3 Batch 2: fin de capítulo en HTML5 → avanzar.
      if (endTimestampRef.current > 0 && audio.currentTime >= endTimestampRef.current) {
        audio.pause();
        advanceRef.current();
      }
    };
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    // Antes era `() => setIsPlaying(false)`: paraba en la pista. Ahora avanza.
    const handleEnded = () => advanceRef.current();
    const handleLoadingStart = () => setIsLoading(true);
    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => {
      setIsLoading(false);
      setError(null);
    };
    // P3.34: Error event handlers
    const handleError = () => {
      if (isYouTubeModeRef.current) return;
      setIsLoading(false);
      const track = activeTrackRef.current;
      if (track) {
        sourceFailureRef.current(track);
      } else {
        setError("Error de reproducción — archivo no disponible");
        setIsPlaying(false);
      }
    };
    const handleStalled = () => {
      setIsLoading(true);
    };
    const handleAbort = () => {
      setIsLoading(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadstart", handleLoadingStart);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleError);
    audio.addEventListener("stalled", handleStalled);
    audio.addEventListener("abort", handleAbort);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadstart", handleLoadingStart);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("stalled", handleStalled);
      audio.removeEventListener("abort", handleAbort);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopYouTubeSync();
      destroyYouTubePlayer();
    };
  }, [stopYouTubeSync]);

  return (
    <AudioPlayerContext.Provider
      value={{
        activeTrack,
        isPlaying,
        isLoading,
        error,
        duration,
        currentTime,
        volume,
        isVisualizerOpen,
        isYouTubeMode,
        timelineWarning,
        queue: queueState?.items ?? EMPTY_QUEUE,
        queueIndex: queueState?.index ?? -1,
        queuePosition: queuePositionLabel(queueState),
        hasNext: hasNextInQueue(queueState),
        hasPrev: hasPrevInQueue(queueState),
        playTrack,
        playQueue,
        next,
        prev,
        togglePlay,
        pause,
        clearTrack,
        seek,
        setVolume,
        toggleVisualizer,
        audioRef,
      }}
    >
      {children}
      {/* `crossOrigin` NO va como prop: se fija imperativamente en `loadTrack`
          antes de asignar `src` (ver `shouldUseCrossOrigin` en lib/audio-priority). */}
      <audio ref={audioRef} preload="metadata" className="hidden" />
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error("useAudioPlayer debe ser usado dentro de un AudioPlayerProvider");
  }
  return context;
}
