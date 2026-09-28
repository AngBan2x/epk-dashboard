"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import {
  createAudioVisualizer,
  generateSyntheticFrequencies,
  computeBandFrequencies,
  computeBandLevels,
  DEFAULT_FFT_SIZE,
  DEFAULT_BAND_CURVE,
  DEFAULT_BAND_GAIN,
  PEAK_DECAY,
  type AudioVisualizerNode,
  type FrequencyBand,
} from "@/lib/web-audio";

interface AudioVisualizerProps {
  className?: string;
  barCount?: number;
  height?: number;
}

export function AudioVisualizer({
  className = "",
  barCount = 48,
  height = 140,
}: AudioVisualizerProps) {
  const { audioRef, isPlaying } = useAudioPlayer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const peaksRef = useRef<number[]>([]);
  const bandsRef = useRef<FrequencyBand[] | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  isPlayingRef.current = isPlaying;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${height}px`;
  }, [height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    updateCanvasSize();

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    resizeObserver.observe(container);

    let visualizerNode: AudioVisualizerNode | null = null;
    let cancelled = false;

    const setupVisualizer = async () => {
      if (cancelled) return;
      try {
        if (audioRef.current) {
          visualizerNode = await createAudioVisualizer(audioRef.current, DEFAULT_FFT_SIZE);
          if (visualizerNode) {
            bandsRef.current = computeBandFrequencies(
              visualizerNode.sampleRate,
              visualizerNode.analyser.fftSize,
              barCount
            );
            peaksRef.current = new Array(barCount).fill(0);
          }
        }
      } catch {
        visualizerNode = null;
      }
    };
    setupVisualizer();

    const drawBars = (frequencies: number[], peaks: number[]) => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width;
      const canvasHeight = canvas.height;

      ctx.clearRect(0, 0, width, canvasHeight);

      const barWidth = (width / barCount) * 0.65;
      const gap = (width / barCount) * 0.35;
      const isDark = document.documentElement.classList.contains("dark");

      frequencies.forEach((value, i) => {
        const percent = Math.max(0, Math.min(1, value / 255));
        const barHeight = Math.max(6 * dpr, percent * canvasHeight);
        const x = i * (barWidth + gap);
        const y = canvasHeight - barHeight;

        const gradient = ctx.createLinearGradient(0, canvasHeight, 0, y);
        if (isDark) {
          gradient.addColorStop(0, `rgba(79, 70, 229, ${0.4 + percent * 0.6})`);
          gradient.addColorStop(0.5, `rgba(139, 92, 246, ${0.5 + percent * 0.5})`);
          gradient.addColorStop(1, `rgba(236, 72, 153, ${0.6 + percent * 0.4})`);
        } else {
          gradient.addColorStop(0, `rgba(99, 90, 235, ${0.5 + percent * 0.5})`);
          gradient.addColorStop(0.5, `rgba(155, 110, 252, ${0.6 + percent * 0.4})`);
          gradient.addColorStop(1, `rgba(244, 90, 170, ${0.7 + percent * 0.3})`);
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, [4 * dpr, 4 * dpr, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, barHeight);
        }

        if (percent > 0.3) {
          ctx.shadowColor = isDark ? "#8b5cf6" : "#7c3aed";
          ctx.shadowBlur = 4 * dpr;
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        const peakValue = peaks[i] ?? 0;
        if (peakValue > 0.04 && peakValue > percent) {
          const peakY = canvasHeight - Math.max(2 * dpr, peakValue * canvasHeight);
          ctx.fillStyle = isDark ? "rgba(236, 72, 153, 0.85)" : "rgba(190, 24, 93, 0.85)";
          ctx.fillRect(x, peakY, barWidth, 2 * dpr);
        }
      });
    };

    const readFrequencies = (): { frequencies: number[]; peaks: number[] } => {
      if (isPlayingRef.current && visualizerNode) {
        const bands = bandsRef.current;
        if (bands && bands.length === barCount) {
          const data = visualizerNode.getFrequencyData();
          const levels = computeBandLevels(data, bands, {
            gain: DEFAULT_BAND_GAIN,
            curve: DEFAULT_BAND_CURVE,
            previousPeaks: peaksRef.current,
            peakDecay: PEAK_DECAY,
          });
          peaksRef.current = levels.map((l) => l.peak);
          return { frequencies: levels.map((l) => l.level * 255), peaks: peaksRef.current };
        }
      }

      if (isPlayingRef.current) {
        const synthetic = generateSyntheticFrequencies(barCount, 0.9);
        peaksRef.current = synthetic.map((v) => Math.max(0, Math.min(1, v / 255)));
        return { frequencies: synthetic, peaks: peaksRef.current };
      }

      const time = Date.now() / 1000;
      const idle = Array.from(
        { length: barCount },
        (_, i) => (Math.sin(time * 0.8 + i * 0.4) * 15 + 20)
      );
      return { frequencies: idle, peaks: new Array(barCount).fill(0) };
    };

    if (reducedMotion) {
      const { frequencies, peaks } = readFrequencies();
      drawBars(frequencies, peaks);
      return () => {
        cancelled = true;
        resizeObserver.disconnect();
      };
    }

    const render = () => {
      if (cancelled) return;
      const { frequencies, peaks } = readFrequencies();
      drawBars(frequencies, peaks);
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioRef, barCount, updateCanvasSize, reducedMotion]);

  return (
    <div ref={containerRef} className={`w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900/60 p-4 border border-slate-200 dark:border-slate-700/50 backdrop-blur-md ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
          Visualizador de frecuencia
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 pr-10">
          {isPlaying ? "Espectro en vivo" : "En pausa"}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full block"
        role="img"
        aria-label={isPlaying ? "Espectro de audio en vivo" : "Visualizador de audio en pausa"}
      />
    </div>
  );
}
