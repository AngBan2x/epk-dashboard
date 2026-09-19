"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { createAudioVisualizer, generateSyntheticFrequencies, type AudioVisualizerNode } from "@/lib/web-audio";

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

  // Sync ref with state for the render loop
  isPlayingRef.current = isPlaying;

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
        if (audioRef.current && !cancelled) {
          visualizerNode = await createAudioVisualizer(audioRef.current, 128);
        }
      } catch {
        // CORS or other error — will use synthetic frequencies
        visualizerNode = null;
      }
    };
    setupVisualizer();

    const render = () => {
      if (cancelled) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width;
      const canvasHeight = canvas.height;

      ctx.clearRect(0, 0, width, canvasHeight);

      let frequencies: number[] = [];

      if (isPlayingRef.current) {
        if (visualizerNode) {
          const data = visualizerNode.getFrequencyData();
          const binCount = data.length;
          // Logarithmic frequency grouping: low octaves get more bins
          const logMin = Math.log(1);
          const logMax = Math.log(binCount);
          for (let i = 0; i < barCount; i++) {
            const lo = Math.exp(logMin + (logMax - logMin) * (i / barCount));
            const hi = Math.exp(logMin + (logMax - logMin) * ((i + 1) / barCount));
            const binLo = Math.max(0, Math.floor(lo));
            const binHi = Math.min(binCount - 1, Math.floor(hi));
            let sum = 0;
            let count = 0;
            for (let b = binLo; b <= binHi; b++) {
              sum += data[b];
              count++;
            }
            frequencies.push(count > 0 ? sum / count : 0);
          }
        } else {
          frequencies = generateSyntheticFrequencies(barCount, 0.9);
        }
      } else {
        const time = Date.now() / 1000;
        frequencies = Array.from({ length: barCount }, (_, i) =>
          Math.sin(time * 0.8 + i * 0.4) * 15 + 20
        );
      }

      const barWidth = (width / barCount) * 0.65;
      const gap = (width / barCount) * 0.35;

      const isDark = document.documentElement.classList.contains("dark");

      frequencies.forEach((value, i) => {
        const percent = value / 255;
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
      });

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
  }, [audioRef, barCount, updateCanvasSize]);

  return (
    <div ref={containerRef} className={`w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900/60 p-4 border border-slate-200 dark:border-slate-700/50 backdrop-blur-md ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
          Audio Frequency Visualizer
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 pr-10">
          {isPlaying ? "Live Spectrum" : "Paused"}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full block"
      />
    </div>
  );
}
