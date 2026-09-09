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
  height = 100,
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
      if (audioRef.current && !cancelled) {
        visualizerNode = await createAudioVisualizer(audioRef.current, 64);
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
          frequencies = Array.from(data).slice(0, barCount);
        } else {
          frequencies = generateSyntheticFrequencies(barCount, 0.9);
        }
      } else {
        frequencies = new Array(barCount).fill(12);
      }

      const barWidth = (width / barCount) * 0.75;
      const gap = (width / barCount) * 0.25;

      frequencies.forEach((value, i) => {
        const percent = value / 255;
        const barHeight = Math.max(4 * dpr, percent * canvasHeight);
        const x = i * (barWidth + gap);
        const y = canvasHeight - barHeight;

        const gradient = ctx.createLinearGradient(0, canvasHeight, 0, 0);
        gradient.addColorStop(0, "#4f46e5");
        gradient.addColorStop(0.5, "#8b5cf6");
        gradient.addColorStop(1, "#ec4899");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, [4 * dpr, 4 * dpr, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, barHeight);
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
    <div ref={containerRef} className={`w-full overflow-hidden rounded-xl bg-slate-900/60 dark:bg-slate-900/60 p-4 border border-slate-700/50 dark:border-slate-700/50 backdrop-blur-md ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
          Audio Frequency Visualizer
        </span>
        <span className="text-xs text-slate-400">
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
