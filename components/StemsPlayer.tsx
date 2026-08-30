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

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    channels.forEach((ch) => {
      const el = audioRefs.current[ch.key];
      if (el && Number.isFinite(time)) {
        el.currentTime = time;
      }
    });
  };

  const handleVolumeChange = (key: string, val: number) => {
    setVolumes((prev) => ({ ...prev, [key]: val }));
    const el = audioRefs.current[key];
    if (el) {
      el.volume = getEffectiveVolume(key, val, muted[key], soloed[key]);
    }
  };

  const toggleMute = (key: string) => {
    const nextMuted = !muted[key];
    setMuted((prev) => ({ ...prev, [key]: nextMuted }));
    const el = audioRefs.current[key];
    if (el) {
      el.volume = getEffectiveVolume(key, volumes[key], nextMuted, soloed[key]);
    }
  };

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
    <section className={`p-6 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl ${className}`}>
      {/* Header del Mixer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>🎚️</span> {safeString(title)}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Consola de mezcla interactiva multicanal con Web Audio API
          </p>
        </div>

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
      <div className="mb-6 bg-slate-100 dark:bg-slate-950/80 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="w-10 font-mono text-right">{formatSeconds(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={(e) => handleSeek(parseFloat(e.target.value))}
          className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary-500 hover:h-2.5 transition-all"
          aria-label="Línea de tiempo de stems"
        />
        <span className="w-10 font-mono">{formatSeconds(duration)}</span>
      </div>

      {/* Canales de Mezcla */}
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
                  ? "bg-white dark:bg-slate-800/90 border-amber-500/80 shadow-lg shadow-amber-500/10"
                  : isMuted
                  ? "bg-slate-100 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 opacity-60"
                  : "bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              {/* Info Canal */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{ch.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{ch.label}</p>
                    <span className="text-[10px] uppercase font-mono text-slate-500 dark:text-slate-400">Canal {ch.key}</span>
                  </div>
                </div>

                {/* Animated VU Activity Indicator */}
                <div className="flex items-end gap-0.5 h-5 w-4">
                  {[0.4, 0.8, 0.6, 1].map((h, i) => (
                    <div
                      key={i}
                      className={`w-0.5 rounded-full transition-all duration-150 ${
                        isAudible ? "bg-emerald-400" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                      style={{
                        height: isAudible ? `${Math.random() * 80 + 20}%` : "15%",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Fader de Volumen */}
              <div className="my-3">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
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
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
                  aria-label={`Volumen de ${ch.label}`}
                />
              </div>

              {/* Controles Mute / Solo */}
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                <button
                  onClick={() => toggleMute(ch.key)}
                  className={`py-1 rounded text-xs font-bold transition ${
                    isMuted
                      ? "bg-red-600 text-white shadow"
                      : "bg-slate-100 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  MUTE
                </button>
                <button
                  onClick={() => toggleSolo(ch.key)}
                  className={`py-1 rounded text-xs font-bold transition ${
                    isSoloed
                      ? "bg-amber-500 text-slate-950 shadow font-black"
                      : "bg-slate-100 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
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
