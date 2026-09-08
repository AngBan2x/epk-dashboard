/**
 * Web Audio API helper utilities and visualizer abstractions.
 * Handles audio context lifecycle, analyser nodes, and safe frequency analysis.
 */

let sharedAudioCtx: AudioContext | null = null;

// Cache to avoid calling createMediaElementSource multiple times on the same element
const sourceCache = new WeakMap<HTMLAudioElement, AudioVisualizerNode>();

export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!sharedAudioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass();
    }
  }

  if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }

  return sharedAudioCtx;
}

export interface AudioVisualizerNode {
  analyser: AnalyserNode;
  dataArray: Uint8Array;
  getFrequencyData: () => Uint8Array;
}

/**
 * Conecta un elemento HTMLAudioElement a un AnalyserNode.
 * Usa WeakMap cache para no reconectar el mismo elemento (createMediaElementSource solo puede llamarse 1 vez).
 */
export function createAudioVisualizer(
  audioElement: HTMLAudioElement,
  fftSize = 64
): AudioVisualizerNode | null {
  // Return cached node if already connected
  const cached = sourceCache.get(audioElement);
  if (cached) {
    // Update fftSize if changed
    if (cached.analyser.fftSize !== fftSize) {
      cached.analyser.fftSize = fftSize;
    }
    return cached;
  }

  const ctx = getAudioContext();
  if (!ctx) return null;

  try {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.8;

    const source = ctx.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(ctx.destination);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const node: AudioVisualizerNode = {
      analyser,
      dataArray,
      getFrequencyData: () => {
        analyser.getByteFrequencyData(dataArray);
        return dataArray;
      },
    };

    sourceCache.set(audioElement, node);
    return node;
  } catch (err) {
    console.warn("[WebAudio] No se pudo vincular AnalyserNode a MediaElement:", err);
    return null;
  }
}

/**
 * Generador sintético de barras de espectro para cuando el audio reproduce
 * pero CORS restringe la lectura directa del buffer de audio.
 */
export function generateSyntheticFrequencies(bars = 32, intensity = 1): number[] {
  const frequencies: number[] = [];
  const time = Date.now() / 150;

  for (let i = 0; i < bars; i++) {
    const base = Math.sin(time + i * 0.3) * 0.5 + 0.5;
    const variation = Math.cos(time * 1.5 + i * 0.2) * 0.3;
    const val = Math.max(0.1, Math.min(1, (base + variation) * intensity));
    frequencies.push(Math.round(val * 255));
  }

  return frequencies;
}
