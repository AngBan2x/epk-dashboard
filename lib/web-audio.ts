/**
 * Web Audio API helper utilities and visualizer abstractions.
 * Handles audio context lifecycle, analyser nodes, and safe frequency analysis.
 */

let sharedAudioCtx: AudioContext | null = null;

const sourceCache = new WeakMap<HTMLAudioElement, AudioVisualizerNode>();

// ---------------------------------------------------------------------------
// Constantes del analizador y de la escala de niveles
// ---------------------------------------------------------------------------
//
// La escala de niveles se define **en dB**, nunca sobre el byte. El byte que
// devuelve `getByteFrequencyData()` es una codificación lineal de una ventana de
// dB elegida por `minDecibels`/`maxDecibels`, así que trabajar sobre él es
// trabajar sobre un logaritmo disfrazado de lineal. RC.32 lo hacía y por eso el
// extremo grave saturaba (ver `computeBandLevels`).

/**
 * fftSize del analizador.
 *
 * 1024 daba 43-47 Hz por bin, y con 48 bandas logarítmicas de 30 Hz a 18 kHz
 * eso obliga a que muchas bandascecitan el mismo bin. 4096 deja la resolución
 * en 10.8-11.7 Hz por bin: con `MIN_BAND_BINS = 2` ninguna banda queda con un
 * solo bin y ninguna se solapa con su vecina.
 */
export const DEFAULT_FFT_SIZE = 4096;

/** Ventana de frequencies cubierta por las bandas. */
export const MIN_HZ = 30;
export const MAX_HZ = 18000;

/**
 * Extremos de la ventana del analizador.
 *
 * `maxDecibels = -10` (el valor anterior) creaba una zona muerta de 19 dB en la
 * parte alta: cualquier bin por encima de -10 dBFS leía 255, y un preview
 * masterizado pone los graves ahí. Subirlo a 0 dBFS devuelve la zona muerta
 * entera al rango musical, porque casi ningún *bin* individual de un master llega
 * a 0 dBFS (el ceiling es del bus, no de una banda del FFT).
 */
export const ANALYSER_MIN_DB = -90;
export const ANALYSER_MAX_DB = 0;

/**
 * Piso de ruido: por debajo de esto la barra vale 0.
 *
 * Sin él, el extremo bajo de la ventana produce barras de altura no nula para
 * silencio digital (un byte 0 son -90 dBFS y aun así la curva perceptual lo
 * levantaba). Es el mismo defecto que la saturación, pero en el otro extremo.
 */
export const SPECTRUM_FLOOR_DB = -72;

/** Rango dinámico realmente pintado, del piso de ruido al ceiling. */
export const LEVEL_SPAN_DB = ANALYSER_MAX_DB - SPECTRUM_FLOOR_DB;

/**
 * Margen en dB aplicado antes de normalizar.
 *
 * Antes era `gain = 1.35`, un multiplicador sobre el byte: `byte * 1.35 >= 255`
 * a partir del byte 189, o sea **-29.4 dBFS**. Todo lo más fuerte que eso
 * clavaba a 1.0. En dB el margen es una traslación y el recorte ocurre en 0
 * dBFS, no a mitad de rango.
 */
export const DEFAULT_BAND_BOOST_DB = 3;

/**
 * Gamma perceptual sobre la posición normalizada.
 *
 * <1 expande los niveles bajos para que se vean sin robar rango a los altos.
 * Aplicado en el dominio de la posición, no sobre el byte.
 */
export const DEFAULT_BAND_CURVE = 0.62;

/**
 * Inclinación espectral en dB por octava, referredia a `DEFAULT_TILT_REFERENCE_HZ`.
 *
 * Es un **tilt**, no una ganancia por frecuencia: una recta en log(f), la misma
 * forma que un pink-noise o un A-weighting. Sin ella la caída natural del
 * espectro (~-4.5 dB/octava) se come el rango y las cuatro últimas bandas quedan
 * indistinguibles entre sí.
 *
 * 1.6 es deliberadamente menos que el -3 dB/octava de un rosa real: compensa la
 * mayor parte de la caída sin aplanar el espectro, que debe seguir leyéndose
 * como descendente.
 */
export const DEFAULT_TILT_DB_PER_OCTAVE = 1.6;

/** Frecuencia a la que el tilt vale 0 dB. */
export const DEFAULT_TILT_REFERENCE_HZ = 1000;

/** Suavizado temporal del analizador (0 = nada, ~1 = congelado). */
export const ANALYSER_SMOOTHING = 0.7;

/** Retención del pico por banda entre frames. */
export const PEAK_DECAY = 0.94;

/**
 * Bins mínimos por banda.
 *
 * Con fftSize 1024 y 48 bandas logarítmicas, 23 de las 48 bandas caían en un
 * único bin. Dos bandas que leen el mismo bin no son dos bandas: son una, y el
 * tercio izquierdo de la pantalla queda gobernado por unos pocos números.
 */
export const MIN_BAND_BINS = 2;

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

/**
 * Convierte el byte de `getByteFrequencyData()` a dBFS.
 *
 * Exacto e inverso de `dbToFrequencyByte()`: el byte es una codificación lineal
 * de la ventana `[ANALYSER_MIN_DB, ANALYSER_MAX_DB]`, no una cantidad lineal de
 * energía.
 */
export function frequencyByteToDb(value: number): number {
  const clamped = Math.max(0, Math.min(255, value));
  return ANALYSER_MIN_DB + (clamped / 255) * (ANALYSER_MAX_DB - ANALYSER_MIN_DB);
}

/** Inverso de `frequencyByteToDb()`. */
export function dbToFrequencyByte(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const span = ANALYSER_MAX_DB - ANALYSER_MIN_DB;
  return Math.max(0, Math.min(255, Math.round(((db - ANALYSER_MIN_DB) / span) * 255)));
}

/** Forma mínima de `HTMLAudioElement` que necesita la comprobación de CORS. */
export interface AnalyserSafeElementProbe {
  crossOrigin: string | null;
  currentSrc?: string | null;
  src?: string;
}

/**
 * ¿La salida de este elemento puede pasar por un `MediaElementAudioSourceNode`
 * sin quedarse en silencio?
 *
 * `createMediaElementSource()` **reemplaza** la salida nativa del elemento: a
 * partir de ahí el audio solo se oye si pasa por el grafo. Con medio
 * cross-origin sin `Access-Control-Allow-Origin` el grafo entrega silencio, así
 * que reproducir una pista no verificada suena bien hasta que se abre el
 * visualizador, y entonces se corta.
 *
 * La autoridad es el atributo `crossOrigin` del propio elemento, no la URL: es
 * lo que el navegador mira para decidir si taña el medio. Consultar la lista de
 * hosts aquí duplicaría `shouldUseCrossOrigin()` de `lib/audio-priority.ts` y
 * podría quedarse desfasada; el elemento ya tiene la respuesta.
 *
 * Puro: sin DOM, sin `window`, testeable.
 */
export function isAnalyserSafeElement(
  element: AnalyserSafeElementProbe,
  selfOrigin: string
): boolean {
  if (element.crossOrigin) return true;

  const src = element.currentSrc || element.src || "";
  if (src === "") return true;
  if (/^(blob:|data:)/i.test(src)) return true;

  if (!selfOrigin) return false;
  try {
    return new URL(src, selfOrigin).origin === new URL(selfOrigin).origin;
  } catch {
    return false;
  }
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

  // Antes de tocar el grafo: si el elemento va a salir silencioso por CORS, es
  // preferible no tener visualizador a matar el audio.
  const selfOrigin = typeof window !== "undefined" ? window.location.origin : "";
  if (!isAnalyserSafeElement(audioElement, selfOrigin)) {
    console.warn(
      "[WebAudio] AnalyserNode no enlazado: el medio es cross-origin sin CORS y " +
        "createMediaElementSource() silenciaría la salida. Se reproduce sin espectro."
    );
    return null;
  }

  try {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;
    analyser.minDecibels = ANALYSER_MIN_DB;
    analyser.maxDecibels = ANALYSER_MAX_DB;

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
 *
 * Los bordes se calculan una vez en bin-space y se fuerzan a crecer de forma
 * **estrictamente** monotona, con un ancho mínimo de `MIN_BAND_BINS`. La versión
 * anterior redondeaba cada borde por separado y luego los recortaba contra
 * `lastBin`, así que dos bandas consecutivas podían recibir el mismo bin: con
 * 48 bandas sobre fftSize 1024 eran 7 duplicados exactos y las 13 primeras barras
 * dependían de 8 números.
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

  const span = lastBin - firstBin + 1;
  if (span < bandCount) return [];

  // Si el espectro no da para el ancho mínimo, se degrada al mínimo entero que
  // quepa; si no cabe ni un bin por banda, no hay reparto que hacer.
  const minBins = Math.max(1, Math.min(MIN_BAND_BINS, Math.floor(span / bandCount)));

  const logFirst = Math.log(firstBin + 1);
  const logLast = Math.log(lastBin + 1);

  // edges[i] es el primer bin de la banda i; hay bandCount + 1 bordes y la banda
  // i ocupa [edges[i], edges[i + 1] - 1].
  const edges: number[] = new Array<number>(bandCount + 1);
  edges[0] = firstBin;
  edges[bandCount] = lastBin + 1;

  for (let i = 1; i < bandCount; i++) {
    const raw = Math.exp(logFirst + (i / bandCount) * (logLast - logFirst)) - 1;
    const lowest = edges[i - 1] + minBins;
    const highest = lastBin + 1 - (bandCount - i) * minBins;
    edges[i] = Math.min(highest, Math.max(lowest, Math.ceil(raw)));
  }

  const bands: FrequencyBand[] = [];
  for (let i = 0; i < bandCount; i++) {
    const startBin = edges[i];
    const endBin = edges[i + 1] - 1;

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

export interface BandLevelOptions {
  /** Margen en dB antes de normalizar. */
  boostDb?: number;
  /** Gamma perceptual sobre la posición normalizada. */
  curve?: number;
  /** Inclinación espectral en dB por octava. 0 desactiva el tilt. */
  tiltDbPerOctave?: number;
  /** Frecuencia de referencia del tilt. */
  tiltReferenceHz?: number;
  previousPeaks?: number[];
  peakDecay?: number;
}

/**
 * Convierte datos de frecuencia en niveles 0..1 por banda, aplicando margen,
 * inclinación espectral, gamma perceptual y peak-hold sobre los picos que le
 * pase el caller. Tolera arrays más cortos de lo esperado.
 *
 * Toda la matemática ocurre en dBFS:
 *
 *   byte -> dB (lineal sobre una ventana de dB, no sobre energía)
 *        -> gate por `SPECTRUM_FLOOR_DB`
 *        -> + boost + tilt
 *        -> normalizado sobre `LEVEL_SPAN_DB` y recortado **aquí**
 *        -> ^ curve
 *
 * El recorte va **después** de sumar el margen, no antes. Antes iba antes, y como
 * el margen era un multiplicador sobre el byte (`byte * 1.35`), todo lo más
 * fuerte que -29.4 dBFS salía exactamente 1.0: 19 dB de ventana muerta donde
 * la altura de la barra no transmitía nada. Los graves de un preview masterizado
 * caen de sobra ahí, que es exactamente el síntoma reportado.
 *
 * Agregación por **máximo**, no por media: el ancho de banda va de `MIN_BAND_BINS`
 * a unas 180 bins y promediar todos diluye un pico estrecho en la banda ancha
 * justo donde se ve el ataque.
 */
export function computeBandLevels(
  freqData: Uint8Array,
  bands: FrequencyBand[],
  options?: BandLevelOptions
): BandLevel[] {
  const boostDb = options?.boostDb ?? DEFAULT_BAND_BOOST_DB;
  const curve = options?.curve ?? DEFAULT_BAND_CURVE;
  const tiltDbPerOctave = options?.tiltDbPerOctave ?? DEFAULT_TILT_DB_PER_OCTAVE;
  const tiltReferenceHz = options?.tiltReferenceHz ?? DEFAULT_TILT_REFERENCE_HZ;
  const previousPeaks = options?.previousPeaks ?? [];
  const peakDecay = options?.peakDecay ?? PEAK_DECAY;

  const decayOnly = () =>
    bands.map((_, index) => {
      const previous = previousPeaks[index] ?? 0;
      return { level: 0, peak: Math.max(0, Math.min(1, previous * peakDecay)) };
    });

  const available = Math.max(
    0,
    Math.min(freqData.length, bands.length > 0 ? bands[bands.length - 1].endBin + 1 : 0)
  );
  if (available === 0) return decayOnly();

  return bands.map((band, index) => {
    const start = Math.max(0, Math.min(available - 1, band.startBin));
    const end = Math.max(start, Math.min(available - 1, band.endBin));

    let loudestDb = Number.NEGATIVE_INFINITY;
    for (let bin = start; bin <= end; bin++) {
      const value = freqData[bin];
      if (value === undefined) break;
      const db = frequencyByteToDb(value);
      if (db > loudestDb) loudestDb = db;
    }

    if (!Number.isFinite(loudestDb) || loudestDb <= SPECTRUM_FLOOR_DB) {
      const previous = previousPeaks[index] ?? 0;
      return { level: 0, peak: Math.max(0, Math.min(1, previous * peakDecay)) };
    }

    const tiltDb =
      tiltDbPerOctave * Math.log2(Math.max(band.centerHz, 1) / Math.max(tiltReferenceHz, 1));

    const position = (loudestDb + boostDb + tiltDb - SPECTRUM_FLOOR_DB) / LEVEL_SPAN_DB;
    const normalized = Math.max(0, Math.min(1, position));
    const level = Math.pow(normalized, curve);

    const previous = previousPeaks[index] ?? 0;
    const peak = Math.max(level, previous * peakDecay);

    return { level: Math.max(0, Math.min(1, level)), peak: Math.max(0, Math.min(1, peak)) };
  });
}