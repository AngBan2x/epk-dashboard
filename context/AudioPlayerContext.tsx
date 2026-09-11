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
}

export interface AudioPlayerContextType {
  activeTrack: ActiveTrack | null;
  isPlaying: boolean;
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
  const [isVisualizerOpen, setIsVisualizerOpen] = useState(false);
  const [isYouTubeMode, setIsYouTubeMode] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeSyncRef = useRef<NodeJS.Timeout | null>(null);

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
        audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
      }
      return;
    }

    // New track
    setActiveTrack(track);
    setIsYouTubeMode(isYT);
    setIsPlaying(true);

    if (isYT) {
      // YouTube mode
      const yt = getYouTubePlayer();
      yt.init(track.youtubeVideoId!, {
        onReady: () => {
          yt.setVolume(volume);
          yt.play();
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
      });
    } else {
      // HTML5 audio mode
      stopYouTubeSync();
      destroyYouTubePlayer();
      getAudioContext();
      if (audioRef.current) {
        audioRef.current.src = track.audioUrl;
        audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
      }
    }
  }, [activeTrack, isPlaying, volume, startYouTubeSync, stopYouTubeSync]);

  const togglePlay = useCallback(() => {
    if (!activeTrack) return;

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
        audio.play().then(() => setIsPlaying(true)).catch(console.error);
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

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
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
