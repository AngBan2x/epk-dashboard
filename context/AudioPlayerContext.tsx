"use client";

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import { getAudioContext } from "@/lib/web-audio";
import { getYouTubePlayer, destroyYouTubePlayer, YT_STATE } from "@/lib/youtube-player";

export interface ActiveTrack {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
  coverImage?: string;
  isYouTube?: boolean;
  youtubeVideoId?: string;
  // P3 Batch 2: YouTube timestamps for multi-track
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
  playTrack: (track: ActiveTrack) => void;
  togglePlay: () => void;
  pause: () => void;
  clearTrack: () => void;
  seek: (time: number) => void;
  setVolume: (val: number) => void;
  toggleVisualizer: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [activeTrack, setActiveTrack] = useState<ActiveTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisualizerOpen, setIsVisualizerOpen] = useState(false);
  const [isYouTubeMode, setIsYouTubeMode] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeSyncRef = useRef<NodeJS.Timeout | null>(null);
  const endTimestampRef = useRef<number>(0);

  // Sync YouTube player state with context
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

      // P3 Batch 2: Stop at endTimestamp for multi-track YouTube
      if (endTimestampRef.current > 0 && ytTime >= endTimestampRef.current) {
        yt.pause();
        setIsPlaying(false);
        stopYouTubeSync();
        return;
      }

      if (ytState === YT_STATE.ENDED) {
        setIsPlaying(false);
      } else if (ytState === YT_STATE.PLAYING) {
        setIsPlaying(true);
      } else if (ytState === YT_STATE.PAUSED) {
        setIsPlaying(false);
      }
    }, 250);
  }, []);

  const stopYouTubeSync = useCallback(() => {
    if (youtubeSyncRef.current) {
      clearInterval(youtubeSyncRef.current);
      youtubeSyncRef.current = null;
    }
  }, []);

  const playTrack = useCallback((track: ActiveTrack) => {
    const isYT = track.isYouTube === true && !!track.youtubeVideoId;

    // Reset error on new track
    setError(null);

    // If same track and already playing, do nothing
    if (activeTrack?.id === track.id && isPlaying) return;

    // If same track and paused, just resume
    if (activeTrack?.id === track.id && !isPlaying) {
      if (isYT) {
        const yt = getYouTubePlayer();
        yt.play();
        setIsPlaying(true);
        startYouTubeSync();
      } else if (audioRef.current) {
        getAudioContext();
        audioRef.current.play().then(() => setIsPlaying(true)).catch((err) => {
          console.error("Error resuming playback:", err);
          setError("Error al reanudar reproducción");
        });
      }
      return;
    }

    // New track
    setActiveTrack(track);
    setIsYouTubeMode(isYT);

    // P3 Batch 2: Set endTimestamp for multi-track YouTube
    endTimestampRef.current = track.endTimestamp || 0;

    if (isYT) {
      // YouTube mode
      const yt = getYouTubePlayer();
      yt.init(track.youtubeVideoId!, {
        onReady: () => {
          yt.setVolume(volume);
          // Seek to startTimestamp if provided
          if (track.startTimestamp && track.startTimestamp > 0) {
            yt.seek(track.startTimestamp);
          }
          yt.play();
          setIsPlaying(true);
          startYouTubeSync();
        },
        onStateChange: (state) => {
          if (state === YT_STATE.ENDED) {
            setIsPlaying(false);
            stopYouTubeSync();
          } else if (state === YT_STATE.PLAYING) {
            setIsPlaying(true);
          } else if (state === YT_STATE.PAUSED) {
            setIsPlaying(false);
          }
        },
        onError: (errorCode: number) => {
          const errorMessages: Record<number, string> = {
            2: "Parámetro inválido",
            3: "Error de reproducción",
            5: "Error de HTML5",
            100: "Video no encontrado",
            150: "Video no disponible",
          };
          setError(errorMessages[errorCode] || "Error de YouTube desconocido");
          setIsPlaying(false);
        },
      });
    } else {
      // HTML5 audio mode
      stopYouTubeSync();
      destroyYouTubePlayer();
      getAudioContext();
      if (audioRef.current) {
        audioRef.current.src = track.audioUrl;
        audioRef.current.play().then(() => setIsPlaying(true)).catch((err) => {
          console.error("Error starting playback:", err);
          setError("Error al iniciar reproducción — archivo no disponible");
          setIsPlaying(false);
        });
      }
    }
  }, [activeTrack, isPlaying, volume, startYouTubeSync, stopYouTubeSync]);

  const togglePlay = useCallback(() => {
    if (!activeTrack) return;

    setError(null);

    if (isYouTubeMode) {
      const yt = getYouTubePlayer();
      if (isPlaying) {
        yt.pause();
        setIsPlaying(false);
        stopYouTubeSync();
      } else {
        yt.play();
        setIsPlaying(true);
        startYouTubeSync();
      }
    } else {
      const audio = audioRef.current;
      if (!audio) return;

      getAudioContext();

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        audio.play().then(() => setIsPlaying(true)).catch((err) => {
          console.error("Error toggling playback:", err);
          setError("Error al reanudar reproducción");
        });
      }
    }
  }, [activeTrack, isPlaying, isYouTubeMode, startYouTubeSync, stopYouTubeSync]);

  const pause = useCallback(() => {
    if (isYouTubeMode) {
      const yt = getYouTubePlayer();
      yt.pause();
      setIsPlaying(false);
      stopYouTubeSync();
    } else if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [isYouTubeMode, stopYouTubeSync]);

  const clearTrack = useCallback(() => {
    if (isYouTubeMode) {
      destroyYouTubePlayer();
      stopYouTubeSync();
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.load();
    }
    setActiveTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsVisualizerOpen(false);
    setIsYouTubeMode(false);
  }, [isYouTubeMode, stopYouTubeSync]);

  const seek = useCallback((time: number) => {
    if (!Number.isFinite(time)) return;

    if (isYouTubeMode) {
      const yt = getYouTubePlayer();
      yt.seek(time);
      setCurrentTime(time);
    } else if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, [isYouTubeMode]);

  const setVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);

    if (isYouTubeMode) {
      const yt = getYouTubePlayer();
      yt.setVolume(clamped);
    } else if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, [isYouTubeMode]);

  const toggleVisualizer = useCallback(() => {
    setIsVisualizerOpen((prev) => !prev);
  }, []);

  // HTML5 audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handleEnded = () => setIsPlaying(false);
    const handleLoadingStart = () => setIsLoading(true);
    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => {
      setIsLoading(false);
      setError(null);
    };
    // P3.34: Error event handlers
    const handleError = () => {
      setIsLoading(false);
      setError("Error de reproducción — archivo no disponible");
      setIsPlaying(false);
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
        playTrack,
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
      <audio
        ref={audioRef}
        preload="metadata"
        crossOrigin="anonymous"
        className="hidden"
      />
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
