/**
 * Web Audio API helper utilities and visualizer abstractions.
 * Handles audio context lifecycle, analyser nodes, and safe frequency analysis.
 */

let sharedAudioCtx: AudioContext | null = null;

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
    // Intenta resumir con interacción del usuario
    sharedAudioCtx.resume().catch(() => {
      // Ignorar si aún no hay interacción de usuario
    });
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
 * Maneja excepciones de CORS cuando el audio proviene de un origen cruzado (ej. CDN de Apple).
 */
export function createAudioVisualizer(
  audioElement: HTMLAudioElement,
  fftSize = 64
): AudioVisualizerNode | null {
  const ctx = getAudioContext();
  if (!ctx) return null;

  try {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.8;

    // Solo podemos conectar createMediaElementSource una vez por elemento
    const source = ctx.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(ctx.destination);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    return {
      analyser,
      dataArray,
      getFrequencyData: () => {
        analyser.getByteFrequencyData(dataArray);
        return dataArray;
      },
    };
  } catch (err) {
    // Si falla por CORS o elemento ya conectado, retornamos null para activar modo sintético en visualizer
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
