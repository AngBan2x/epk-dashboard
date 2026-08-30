"use client";

import React, { useState, useRef, useEffect } from "react";
import { safeString } from "@/lib/null-safe";
import type { StemsUrls } from "@/types/music";
import { getAudioContext } from "@/lib/web-audio";

interface StemsPlayerProps {
  title?: string;
  stems?: StemsUrls | null;
  mainAudioUrl?: string | null;
  className?: string;
}

interface StemChannel {
  key: "vocals" | "guitars" | "bass" | "drums";
  label: string;
  icon: string;
  color: string;
  url: string;
}

export function StemsPlayer({
  title = "Mezclador de Stems Multicanal",
  stems,
  mainAudioUrl,
  className = "",
}: StemsPlayerProps) {
  // Canales configurados o sintetizados desde mainAudioUrl si no hay stems aislados
  const fallbackUrl = mainAudioUrl || "/audio/preview-default.mp3";

  const channels: StemChannel[] = [
    {
      key: "vocals",
      label: "Voz Principal",
      icon: "🎤",
      color: "from-pink-500 to-rose-500",
      url: stems?.vocals || fallbackUrl,
    },
    {
      key: "guitars",
      label: "Guitarras",
      icon: "🎸",
      color: "from-amber-500 to-orange-500",
      url: stems?.guitars || fallbackUrl,
    },
    {
      key: "bass",
      label: "Bajo",
      icon: "⚡",
      color: "from-purple-500 to-indigo-500",
      url: stems?.bass || fallbackUrl,
    },
    {
      key: "drums",
      label: "Batería / Percusión",
      icon: "🥁",
      color: "from-emerald-500 to-teal-500",
      url: stems?.drums || fallbackUrl,
    },
  ];

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);

  // Estados independientes por canal
  const [volumes, setVolumes] = useState<Record<string, number>>({
    vocals: 0.85,
    guitars: 0.8,
    bass: 0.85,
    drums: 0.9,
  });
  const [muted, setMuted] = useState<Record<string, boolean>>({
    vocals: false,
    guitars: false,
    bass: false,
    drums: false,
  });
  const [soloed, setSoloed] = useState<Record<string, boolean>>({
    vocals: false,
    guitars: false,
    bass: false,
    drums: false,
  });

  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  const hasAnySolo = Object.values(soloed).some(Boolean);

  // Sincronización de Play / Pause
  const toggleMasterPlay = () => {
    getAudioContext();
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);

    channels.forEach((ch) => {
      const el = audioRefs.current[ch.key];
      if (el) {
        if (nextPlaying) {
          el.play().catch(console.error);
        } else {
          el.pause();
        }
      }
    });
  };

  // Sincronización de Seek
  const handleSeek = (time: number) => {
    setCurrentTime(time);
    channels.forEach((ch) => {
      const el = audioRefs.current[ch.key];
      if (el && Number.isFinite(time)) {
        el.currentTime = time;
      }
    });
  };

  // Ajuste de Volumen
  const handleVolumeChange = (key: string, val: number) => {
    setVolumes((prev) => ({ ...prev, [key]: val }));
    const el = audioRefs.current[key];
    if (el) {
      el.volume = getEffectiveVolume(key, val, muted[key], soloed[key]);
    }
  };

  // Toggle Mute
  const toggleMute = (key: string) => {
    const nextMuted = !muted[key];
    setMuted((prev) => ({ ...prev, [key]: nextMuted }));
    const el = audioRefs.current[key];
    if (el) {
      el.volume = getEffectiveVolume(key, volumes[key], nextMuted, soloed[key]);
    }
  };

  // Toggle Solo
  const toggleSolo = (key: string) => {
    const nextSoloedState = {
      ...soloed,
      [key]: !soloed[key],
    };
    setSoloed(nextSoloedState);

    const isAnySoloActive = Object.values(nextSoloedState).some(Boolean);

    channels.forEach((ch) => {
      const el = audioRefs.current[ch.key];
      if (el) {
        let effVol = 0;
        if (isAnySoloActive) {
          effVol = nextSoloedState[ch.key] && !muted[ch.key] ? volumes[ch.key] : 0;
        } else {
          effVol = muted[ch.key] ? 0 : volumes[ch.key];
        }
        el.volume = effVol;
      }
    });
  };

  const getEffectiveVolume = (
    key: string,
    vol: number,
    isMuted: boolean,
    isSoloed: boolean
  ) => {
    if (hasAnySolo) {
      return isSoloed && !isMuted ? vol : 0;
    }
    return isMuted ? 0 : vol;
  };

  // Efecto para sincronizar evento timeupdate en el canal principal
  useEffect(() => {
    const primary = audioRefs.current["vocals"];
    if (!primary) return;

    const handleTimeUpdate = () => setCurrentTime(primary.currentTime);
    const handleLoadedMetadata = () => {
      if (primary.duration && Number.isFinite(primary.duration)) {
        setDuration(primary.duration);
      }
    };
    const handleEnded = () => setIsPlaying(false);

    primary.addEventListener("timeupdate", handleTimeUpdate);
    primary.addEventListener("loadedmetadata", handleLoadedMetadata);
    primary.addEventListener("ended", handleEnded);

    return () => {
      primary.removeEventListener("timeupdate", handleTimeUpdate);
      primary.removeEventListener("loadedmetadata", handleLoadedMetadata);
      primary.removeEventListener("ended", handleEnded);
    };
  }, []);

  const formatSeconds = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <section className={`p-6 bg-dark-900 text-white rounded-2xl border border-dark-700 shadow-xl ${className}`}>
      {/* Header del Mixer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-dark-800">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>🎚️</span> {safeString(title)}
          </h2>
          <p className="text-xs text-dark-400 mt-0.5">
            Consola de mezcla interactiva multicanal con Web Audio API
          </p>
        </div>

        {/* Master Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMasterPlay}
            className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-semibold text-sm flex items-center gap-2 transition shadow-lg hover:scale-105"
            aria-label={isPlaying ? "Pausar mezcla" : "Reproducir mezcla"}
          >
            <span>{isPlaying ? "⏸" : "▶"}</span>
            <span>{isPlaying ? "Pausar Stems" : "Reproducir Todo"}</span>
          </button>
        </div>
      </div>

      {/* Master Progress Bar */}
      <div className="mb-6 bg-dark-950/80 p-3 rounded-xl border border-dark-800 flex items-center gap-3 text-xs text-dark-400">
        <span className="w-10 font-mono text-right">{formatSeconds(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={(e) => handleSeek(parseFloat(e.target.value))}
          className="flex-1 h-2 bg-dark-800 rounded-lg appearance-none cursor-pointer accent-primary-500 hover:h-2.5 transition-all"
          aria-label="Línea de tiempo de stems"
        />
        <span className="w-10 font-mono">{formatSeconds(duration)}</span>
      </div>

      {/* Canales de Mezcla (Grid de Faders) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {channels.map((ch) => {
          const isMuted = muted[ch.key];
          const isSoloed = soloed[ch.key];
          const isAudible = isPlaying && (hasAnySolo ? isSoloed && !isMuted : !isMuted);

          return (
            <div
              key={ch.key}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                isSoloed
                  ? "bg-dark-800/90 border-amber-500/80 shadow-lg shadow-amber-500/10"
                  : isMuted
                  ? "bg-dark-950/40 border-dark-800 opacity-60"
                  : "bg-dark-800/50 border-dark-700 hover:border-dark-600"
              }`}
            >
              {/* Info Canal */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{ch.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-white truncate">{ch.label}</p>
                    <span className="text-[10px] uppercase font-mono text-dark-400">Canal {ch.key}</span>
                  </div>
                </div>

                {/* Animated VU Activity Indicator */}
                <div className="flex items-end gap-0.5 h-5 w-4">
                  {[0.4, 0.8, 0.6, 1].map((h, i) => (
                    <div
                      key={i}
                      className={`w-0.5 rounded-full transition-all duration-150 ${
                        isAudible ? "bg-emerald-400" : "bg-dark-700"
                      }`}
                      style={{
                        height: isAudible ? `${Math.random() * 80 + 20}%` : "15%",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Fader de Volumen Vertical / Horizontal */}
              <div className="my-3">
                <div className="flex justify-between text-xs text-dark-400 mb-1">
                  <span>Nivel</span>
                  <span className="font-mono">{Math.round(volumes[ch.key] * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volumes[ch.key]}
                  onChange={(e) => handleVolumeChange(ch.key, parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
                  aria-label={`Volumen de ${ch.label}`}
                />
              </div>

              {/* Controles Mute / Solo */}
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-dark-700/60">
                <button
                  onClick={() => toggleMute(ch.key)}
                  className={`py-1 rounded text-xs font-bold transition ${
                    isMuted
                      ? "bg-red-600 text-white shadow"
                      : "bg-dark-700/80 hover:bg-dark-700 text-dark-300 hover:text-white"
                  }`}
                >
                  MUTE
                </button>
                <button
                  onClick={() => toggleSolo(ch.key)}
                  className={`py-1 rounded text-xs font-bold transition ${
                    isSoloed
                      ? "bg-amber-500 text-dark-950 shadow font-black"
                      : "bg-dark-700/80 hover:bg-dark-700 text-dark-300 hover:text-white"
                  }`}
                >
                  SOLO
                </button>
              </div>

              {/* Audio Node Oculto */}
              <audio
                ref={(el) => {
                  audioRefs.current[ch.key] = el;
                }}
                src={ch.url}
                preload="auto"
                crossOrigin="anonymous"
                className="hidden"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
