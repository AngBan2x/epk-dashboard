"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import {
  createAudioVisualizer,
  computeBandFrequencies,
  computeBandLevels,
  DEFAULT_FFT_SIZE,
  PEAK_DECAY,
  type AudioVisualizerNode,
  type FrequencyBand,
} from "@/lib/web-audio";

interface AudioVisualizerProps {
  className?: string;
  barCount?: number;
  height?: number;
}

/**
 * Estado del espectro. Distinguir "aún no" de "no va a venir" es lo que evita
 * que se dibuje un espectro inventado: antes, mientras `createAudioVisualizer()`
 * resolvía y si devolvía `null`, la lectura caía a `generateSyntheticFrequencies()`
 * y pintaba barras falsas — un flash visible en cada apertura, y **para
 * siempre** sin que la UI dijera nada, porque el `aria-label` decía
 * "Espectro de audio en vivo" en los dos casos.
 */
type SpectrumState = "pending" | "ready" | "unavailable";

const IDLE_BASE_LEVEL = 0.02;
const IDLE_AMPLITUDE = 0.03;

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
  const [reducedMotion, setReducedMotion] = useState(false);
  const [spectrumState, setSpectrumState] = useState<SpectrumState>("pending");
  const spectrumStateRef = useRef<SpectrumState>("pending");

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
    let bands: FrequencyBand[] | null = null;
    let setupStarted = false;
    let cancelled = false;

    const settle = (state: SpectrumState) => {
      spectrumStateRef.current = state;
      setSpectrumState(state);
      redrawOnSettle();
    };

    const drawBars = (levels: number[], peaks: number[]) => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width;
      const canvasHeight = canvas.height;

      ctx.clearRect(0, 0, width, canvasHeight);

      const barWidth = (width / barCount) * 0.65;
      const gap = (width / barCount) * 0.35;
      const isDark = document.documentElement.classList.contains("dark");

      /** Marca de pico-hold, en el mismo espacio que la barra. */
      const drawPeakCap = (
        peakValue: number,
        percent: number,
        x: number,
        barWidth: number
      ) => {
        if (peakValue <= 0.04 || peakValue <= percent) return;
        const peakY = canvasHeight - Math.max(2 * dpr, peakValue * canvasHeight);
        ctx.fillStyle = isDark ? "rgba(236, 72, 153, 0.85)" : "rgba(190, 24, 93, 0.85)";
        ctx.fillRect(x, peakY, barWidth, 2 * dpr);
      };

      levels.forEach((rawLevel, i) => {
        const level = Math.max(0, Math.min(1, rawLevel));
        const percent = level;
        const x = i * (barWidth + gap);

        if (level === 0) {
          // Ranura de reposo. Antes era `Math.max(6 * dpr, percent * canvasHeight)`,
          // que imponía 6 px a todo lo que bajara del ~4 %: en la mitad baja del
          // canvas todo se veía igual y el silencio parecía una meseta.
          ctx.fillStyle = isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(100, 116, 139, 0.18)";
          ctx.fillRect(x, canvasHeight - 2 * dpr, barWidth, 2 * dpr);
          // El pico sigue viva aunque la barra este en reposo: es justo cuando se
          // ve que acaba de caer.
          drawPeakCap(peaks[i] ?? 0, percent, x, barWidth);
          return;
        }

        const barHeight = percent * canvasHeight;
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

        drawPeakCap(peaks[i] ?? 0, percent, x, barWidth);
      });
    };

    /**
     * Animación de reposo. Baja y lenta a propósito: sirve para pausa, para el
     * estado `pending` y para `unavailable`, y en los tres casos lo que se ve
     * tiene que ser claramente "no hay datos", nunca un espectro convincente.
     */
    const idleFrame = (): { levels: number[]; peaks: number[] } => {
      const time = Date.now() / 1000;
      const levels = Array.from(
        { length: barCount },
        (_, i) =>
          IDLE_BASE_LEVEL +
          IDLE_AMPLITUDE * ((Math.sin(time * 0.8 + i * 0.4) + 1) / 2)
      );
      return { levels, peaks: new Array<number>(barCount).fill(0) };
    };

    /**
     * El setup se reintenta desde el propio bucle de render en vez de disparo
     * paralelo: `createAudioVisualizer()` es async y antes `render()` arrancaba
     * sin esperar, así que la ventana entre montar y tener nodo+banda pintaba
     * datos falsos. Aquí solo hay datos cuando hay nodo, y si `audioRef.current`
     * todavía no existe se reintenta el siguiente frame en lugar de rendirse.
     */
    const trySetup = () => {
      if (setupStarted || visualizerNode) return;
      const audio = audioRef.current;
      if (!audio) return;

      setupStarted = true;
      void createAudioVisualizer(audio, DEFAULT_FFT_SIZE)
        .then((created) => {
          if (cancelled) return;
          if (!created) {
            settle("unavailable");
            return;
          }
          const computed = computeBandFrequencies(
            created.sampleRate,
            created.analyser.fftSize,
            barCount
          );
          if (computed.length !== barCount) {
            settle("unavailable");
            return;
          }
          visualizerNode = created;
          bands = computed;
          peaksRef.current = new Array<number>(barCount).fill(0);
          settle("ready");
        })
        .catch(() => {
          if (!cancelled) settle("unavailable");
        });
    };

    const readFrame = (): { levels: number[]; peaks: number[] } => {
      trySetup();

      if (isPlayingRef.current && spectrumStateRef.current === "ready" && visualizerNode && bands) {
        const data = visualizerNode.getFrequencyData();
        const levels = computeBandLevels(data, bands, {
          previousPeaks: peaksRef.current,
          peakDecay: PEAK_DECAY,
        });
        peaksRef.current = levels.map((l) => l.peak);
        return { levels: levels.map((l) => l.level), peaks: peaksRef.current };
      }

      if (spectrumStateRef.current === "ready") {
        // Reproducción detenida: el pico decae, las barras bajan a reposo.
        peaksRef.current = peaksRef.current.map((p) => p * PEAK_DECAY);
        const idle = idleFrame();
        return { levels: idle.levels, peaks: peaksRef.current };
      }

      return idleFrame();
    };

    // Con `prefers-reduced-motion` no hay bucle de frames, asi que el unico
    // repintado llega cuando el setup resuelve. Sin esto, el visualizador se
    // quedaba en la animacion de reposo para siempre aunque el analizador
    // estuviera listo y sonando.
    const redrawOnSettle = () => {
      if (!reducedMotion || cancelled) return;
      const frame = readFrame();
      drawBars(frame.levels, frame.peaks);
    };

    if (reducedMotion) {
      const { levels, peaks } = readFrame();
      drawBars(levels, peaks);
      return () => {
        cancelled = true;
        resizeObserver.disconnect();
      };
    }

    const render = () => {
      if (cancelled) return;
      const { levels, peaks } = readFrame();
      drawBars(levels, peaks);
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

  const label = !isPlaying
    ? "En pausa"
    : spectrumState === "ready"
      ? "Espectro en vivo"
      : spectrumState === "pending"
        ? "Conectando…"
        : "Espectro no disponible";

  const ariaLabel = !isPlaying
    ? "Visualizador de audio en pausa"
    : spectrumState === "ready"
      ? "Espectro de audio en vivo"
      : spectrumState === "pending"
        ? "Conectando con el espectro de audio"
        : "Espectro de audio no disponible";

  return (
    <div ref={containerRef} className={`w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900/60 p-4 border border-slate-200 dark:border-slate-700/50 backdrop-blur-md ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
          Visualizador de frecuencia
        </span>
        <span
          data-testid="audio-visualizer-state"
          className="text-xs text-slate-500 dark:text-slate-400 pr-10"
        >
          {label}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full block"
        role="img"
        aria-label={ariaLabel}
      />
    </div>
  );
}