/**
 * Web Audio API helper utilities and visualizer abstractions.
 * Handles audio context lifecycle, analyser nodes, and safe frequency analysis.
 */

let sharedAudioCtx: AudioContext | null = null;

const sourceCache = new WeakMap<HTMLAudioElement, AudioVisualizerNode>();

export const DEFAULT_FFT_SIZE = 1024;
export const MIN_HZ = 30;
export const MAX_HZ = 18000;
export const DEFAULT_BAND_GAIN = 1.35;
export const DEFAULT_BAND_CURVE = 0.62;
export const PEAK_DECAY = 0.94;

export async function getAudioContext(): Promise<AudioContext | null> {
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
    try {
      await sharedAudioCtx.resume();
    } catch {
      return sharedAudioCtx;
    }
  }

  return sharedAudioCtx;
}

export interface AudioVisualizerNode {
  analyser: AnalyserNode;
  dataArray: Uint8Array;
  sampleRate: number;
  getFrequencyData: () => Uint8Array;
}

export async function createAudioVisualizer(
  audioElement: HTMLAudioElement,
  fftSize: number = DEFAULT_FFT_SIZE
): Promise<AudioVisualizerNode | null> {
  const cached = sourceCache.get(audioElement);
  if (cached) {
    if (cached.analyser.fftSize !== fftSize) {
      cached.analyser.fftSize = fftSize;
      cached.dataArray = new Uint8Array(cached.analyser.frequencyBinCount);
      cached.sampleRate = cached.analyser.context.sampleRate;
    }
    return cached;
  }

  const ctx = await getAudioContext();
  if (!ctx) return null;

  try {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.78;
    analyser.minDecibels = -85;
    analyser.maxDecibels = -10;

    const source = ctx.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(ctx.destination);

    const node: AudioVisualizerNode = {
      analyser,
      dataArray: new Uint8Array(analyser.frequencyBinCount),
      sampleRate: ctx.sampleRate,
      getFrequencyData: () => {
        analyser.getByteFrequencyData(node.dataArray as Uint8Array<ArrayBuffer>);
        return node.dataArray;
      },
    };

    sourceCache.set(audioElement, node);
    return node;
  } catch (err) {
    console.warn("[WebAudio] No se pudo vincular AnalyserNode a MediaElement:", err);
    return null;
  }
}

export interface FrequencyBand {
  startHz: number;
  endHz: number;
  centerHz: number;
  startBin: number;
  endBin: number;
}

/**
 * Reparte las bandas logarítmicamente entre minHz y maxHz (30 Hz – 18 kHz por
 * defecto) y las ancla a los bins reales del FFT según sampleRate/Nyquist.
 * Puras: sin DOM, sin window, determinista.
 */
export function computeBandFrequencies(
  sampleRate: number,
  fftSize: number,
  bandCount: number,
  minHz: number = MIN_HZ,
  maxHz: number = MAX_HZ
): FrequencyBand[] {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return [];
  if (!Number.isFinite(fftSize) || fftSize < 2) return [];
  if (!Number.isFinite(bandCount) || bandCount <= 0) return [];

  const binCount = Math.floor(fftSize / 2);
  const nyquist = sampleRate / 2;
  const binHz = nyquist / binCount;

  const lo = Math.max(1, Math.min(minHz, maxHz));
  const hi = Math.min(maxHz, nyquist - binHz);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [];

  const firstBin = Math.min(binCount - 1, Math.max(0, Math.round(lo / binHz)));
  const lastBin = Math.min(binCount - 1, Math.max(firstBin, Math.round(hi / binHz)));
  if (lastBin <= firstBin) return [];

  const bands: FrequencyBand[] = [];
  const logFirst = Math.log(firstBin + 1);
  const logLast = Math.log(lastBin + 1);

  for (let i = 0; i < bandCount; i++) {
    const progress = i / bandCount;
    const nextProgress = (i + 1) / bandCount;
    const edgeA = Math.round(Math.exp(logFirst + progress * (logLast - logFirst)) - 1);
    const edgeB = Math.round(Math.exp(logFirst + nextProgress * (logLast - logFirst)) - 1);

    const startBin = Math.min(lastBin, Math.max(firstBin, edgeA));
    const endBin = Math.min(lastBin, Math.max(startBin, edgeB - 1));

    const startHz = Math.round(startBin * binHz * 100) / 100;
    const endHz = Math.min(maxHz, Math.round((endBin + 1) * binHz * 100) / 100);

    bands.push({
      startHz,
      endHz,
      centerHz: Math.round(((startHz + endHz) / 2) * 100) / 100,
      startBin,
      endBin,
    });
  }

  return bands;
}

export interface BandLevel {
  level: number;
  peak: number;
}

/**
 * Convierte datos de frecuencia en niveles 0..1 por banda con ganancia y curva
 * perceptual, y aplica peak-hold usando los picos previos que le pase el caller
 * (la función sigue siendo pura). Tolera arrays más cortos de lo esperado.
 */
export function computeBandLevels(
  freqData: Uint8Array,
  bands: FrequencyBand[],
  options?: { gain?: number; curve?: number; previousPeaks?: number[]; peakDecay?: number }
): BandLevel[] {
  const gain = options?.gain ?? DEFAULT_BAND_GAIN;
  const curve = options?.curve ?? DEFAULT_BAND_CURVE;
  const previousPeaks = options?.previousPeaks ?? [];
  const peakDecay = options?.peakDecay ?? PEAK_DECAY;
  const available = Math.max(
    0,
    Math.min(freqData.length, bands.length > 0 ? bands[bands.length - 1].endBin + 1 : 0)
  );
  if (available === 0) {
    return bands.map((_, index) => {
      const previous = previousPeaks[index] ?? 0;
      return { level: 0, peak: Math.max(0, Math.min(1, previous * peakDecay)) };
    });
  }

  return bands.map((band, index) => {
    const start = Math.max(0, Math.min(available - 1, band.startBin));
    const end = Math.max(start, Math.min(available - 1, band.endBin));

    let sum = 0;
    let count = 0;
    for (let bin = start; bin <= end; bin++) {
      const value = freqData[bin];
      if (value === undefined) break;
      sum += value;
      count++;
    }

    const average = count > 0 ? sum / count : 0;
    const normalized = Math.max(0, Math.min(1, average / 255));
    const boosted = Math.max(0, Math.min(1, Math.pow(normalized * gain, curve)));

    const previous = previousPeaks[index] ?? 0;
    const peak = Math.max(boosted, previous * peakDecay);

    return { level: boosted, peak: Math.max(0, Math.min(1, peak)) };
  });
}

export function generateSyntheticFrequencies(count: number, intensity = 0.9): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = Date.now() / 1000;
    const wave =
      Math.sin(t * 1.7 + i * 0.35) * 0.5 + Math.sin(t * 0.9 + i * 0.12) * 0.35 + 0.5;
    out.push(Math.max(0, Math.min(1, wave)) * 255 * intensity);
  }
  return out;
}
