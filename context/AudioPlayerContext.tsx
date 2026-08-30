"use client";

import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { getAudioContext } from "@/lib/web-audio";

export interface ActiveTrack {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
  coverImage?: string;
}

export interface AudioPlayerContextType {
  activeTrack: ActiveTrack | null;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  volume: number;
  isVisualizerOpen: boolean;
  playTrack: (track: ActiveTrack) => void;
  togglePlay: () => void;
  pause: () => void;
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

  const audioRef = useRef<HTMLAudioElement>(null);

  const playTrack = (track: ActiveTrack) => {
    if (!track.audioUrl) return;

    getAudioContext();

    if (activeTrack?.id === track.id && audioRef.current) {
      if (!isPlaying) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
      }
      return;
    }

    setActiveTrack(track);
    setIsPlaying(true);

    if (audioRef.current) {
      audioRef.current.src = track.audioUrl;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) return;

    getAudioContext();

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const pause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const seek = (time: number) => {
    if (audioRef.current && Number.isFinite(time)) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setVolume = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  };

  const toggleVisualizer = () => {
    setIsVisualizerOpen((prev) => !prev);
  };

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

  return (
    <AudioPlayerContext.Provider
      value={{
        activeTrack,
        isPlaying,
        duration,
        currentTime,
        volume,
        isVisualizerOpen,
        playTrack,
        togglePlay,
        pause,
        seek,
        setVolume,
        toggleVisualizer,
        audioRef,
      }}
    >
      {children}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
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
