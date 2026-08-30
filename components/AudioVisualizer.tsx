"use client";

import React, { useEffect, useRef } from "react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { createAudioVisualizer, generateSyntheticFrequencies } from "@/lib/web-audio";

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
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let visualizerNode = audioRef.current
      ? createAudioVisualizer(audioRef.current, 64)
      : null;

    const render = () => {
      const width = canvas.width;
      const canvasHeight = canvas.height;

      ctx.clearRect(0, 0, width, canvasHeight);

      let frequencies: number[] = [];

      if (isPlaying) {
        if (visualizerNode) {
          const data = visualizerNode.getFrequencyData();
          frequencies = Array.from(data).slice(0, barCount);
        } else {
          frequencies = generateSyntheticFrequencies(barCount, 0.9);
        }
      } else {
        // Estado reposo con barras sutiles
        frequencies = new Array(barCount).fill(12);
      }

      const barWidth = (width / barCount) * 0.75;
      const gap = (width / barCount) * 0.25;

      frequencies.forEach((value, i) => {
        const percent = value / 255;
        const barHeight = Math.max(4, percent * canvasHeight);
        const x = i * (barWidth + gap);
        const y = canvasHeight - barHeight;

        // Gradiente dinámico
        const gradient = ctx.createLinearGradient(0, canvasHeight, 0, 0);
        gradient.addColorStop(0, "#4f46e5"); // Indigo
        gradient.addColorStop(0.5, "#8b5cf6"); // Violet
        gradient.addColorStop(1, "#ec4899"); // Pink

        ctx.fillStyle = gradient;
        ctx.beginPath();
        // Bordes redondeados en la parte superior
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, barHeight);
        }
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, audioRef, barCount]);

  return (
    <div className={`w-full overflow-hidden rounded-xl bg-dark-900/60 p-4 border border-dark-700/50 backdrop-blur-md ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
          Audio Frequency Visualizer
        </span>
        <span className="text-xs text-dark-400">
          {isPlaying ? "Live Spectrum" : "Paused"}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={height}
        className="w-full h-auto block"
      />
    </div>
  );
}
