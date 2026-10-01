import { describe, it, expect } from "vitest";
import {
  computeBandFrequencies,
  computeBandLevels,
  frequencyByteToDb,
  dbToFrequencyByte,
  isAnalyserSafeElement,
  DEFAULT_FFT_SIZE,
  MIN_HZ,
  MAX_HZ,
  MIN_BAND_BINS,
  DEFAULT_BAND_BOOST_DB,
  ANALYSER_MIN_DB,
  ANALYSER_MAX_DB,
  SPECTRUM_FLOOR_DB,
  type BandLevelOptions,
  type FrequencyBand,
} from "@/lib/web-audio";

/**
 * Helpers de espectros de referencia.
 *
 * Todos los datos FFT que entran al analizador son **bytes de una ventana de dB**,
 * no magnitudes lineales. Construirlos con `dbToFrequencyByte()` es lo que hace
 * estos tests honestos: "a -15 dBFS" es literalmente eso, y no un byte que por
 * casualidad se parezca.
 */

const BAND_COUNT = 48;
const NO_TILT: BandLevelOptions = { tiltDbPerOctave: 0 };

function bands48(sampleRate: number): FrequencyBand[] {
  return computeBandFrequencies(sampleRate, DEFAULT_FFT_SIZE, BAND_COUNT);
}

/** Espectro con un único dBFS en una banda y silencio digital en el resto. */
function spectrumWithBand(
  sampleRate: number,
  bandIndex: number,
  db: number,
  bands: FrequencyBand[] = bands48(sampleRate)
): Uint8Array {
  const data = new Uint8Array(bands[bands.length - 1].endBin + 1);
  const band = bands[bandIndex];
  data.fill(dbToFrequencyByte(db), band.startBin, band.endBin + 1);
  return data;
}

/** Nivel de una sola banda a un dBFS exacto. */
function levelOfBand(
  sampleRate: number,
  bandIndex: number,
  db: number,
  options?: BandLevelOptions,
  bands: FrequencyBand[] = bands48(sampleRate)
): number {
  return computeBandLevels(spectrumWithBand(sampleRate, bandIndex, db, bands), bands, options)[
    bandIndex
  ].level;
}

/** dBFS por banda a `-octaves` dB/octava alrededor de `anchorHz`. */
function dbPerOctave(
  bands: FrequencyBand[],
  anchorDb: number,
  octaves: number,
  anchorHz = 1000
): number[] {
  return bands.map((band) => anchorDb - octaves * Math.log2(band.centerHz / anchorHz));
}

function spectrumFromDb(bands: FrequencyBand[], dbs: number[]): Uint8Array {
  const data = new Uint8Array(bands[bands.length - 1].endBin + 1);
  bands.forEach((band, i) => {
    data.fill(dbToFrequencyByte(dbs[i]), band.startBin, band.endBin + 1);
  });
  return data;
}

function countNonIncreasing(values: number[]): number {
  let count = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] >= values[i - 1]) count++;
  }
  return count;
}

describe("RC.32 — reparto de bandas (lib/web-audio.ts)", () => {
  it("reparte bandas dentro de la ventana 30 Hz - 18 kHz", () => {
    const bands = computeBandFrequencies(44100, DEFAULT_FFT_SIZE, BAND_COUNT);
    expect(bands).toHaveLength(BAND_COUNT);
    expect(bands[0].startHz).toBeGreaterThanOrEqual(MIN_HZ);
    const last = bands[bands.length - 1];
    expect(last.endHz).toBeLessThanOrEqual(MAX_HZ + 1);
  });

  it("mantiene el orden creciente de frecuencias", () => {
    for (const sampleRate of [44100, 48000]) {
      const bands = bands48(sampleRate);
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].startBin).toBeGreaterThanOrEqual(bands[i - 1].startBin);
        expect(bands[i].endBin).toBeGreaterThanOrEqual(bands[i].startBin);
        expect(bands[i].centerHz).toBeGreaterThanOrEqual(bands[i - 1].centerHz);
      }
    }
  });

  it("ancla los bins al ancho de bin real (sampleRate / fftSize)", () => {
    const sampleRate = 44100;
    const bins = DEFAULT_FFT_SIZE / 2;
    const binHz = sampleRate / 2 / bins;
    const bands = computeBandFrequencies(sampleRate, DEFAULT_FFT_SIZE, 24);
    for (const band of bands) {
      expect(band.startBin).toBeLessThanOrEqual(bins - 1);
      expect(band.endBin).toBeLessThanOrEqual(bins - 1);
      expect(band.startHz).toBeCloseTo(band.startBin * binHz, 1);
    }
  });

  /**
   * Regresión de la meseta del tercio izquierdo.
   *
   * Los bordes logarítmicos se redondeaban por separado y luego se recortaban
   * contra `lastBin`, así que bandas contiguas colapsaban al mismo bin: con 48
   * bandas sobre fftSize 1024 eran 7 duplicados exactos y las 13 primeras barras
   * dependían de solo 8 números. `toBeGreaterThanOrEqual` —que era lo que se
   * comprobaba— **permitía** precisamente eso.
   */
  it("NINGUNA banda adyacente lee el mismo bin, y las bandas son contiguas sin huecos", () => {
    for (const sampleRate of [44100, 48000]) {
      for (const bandCount of [16, 24, 32, 48, 64]) {
        const bands = computeBandFrequencies(sampleRate, DEFAULT_FFT_SIZE, bandCount);
        expect(bands).toHaveLength(bandCount);
        for (let i = 1; i < bands.length; i++) {
          expect(
            bands[i].startBin,
            `banda ${i} (${bands[i].startHz} Hz) repite el bin de la anterior en ${sampleRate} Hz / ${bandCount} bandas`
          ).toBeGreaterThan(bands[i - 1].startBin);
          // Contiguo y sin solapar: la banda i arranca justo donde acaba la i-1.
          expect(bands[i].startBin).toBe(bands[i - 1].endBin + 1);
          expect(bands[i].endBin).toBeGreaterThanOrEqual(bands[i].startBin);
        }
      }
    }
  });

  it("ninguna banda se queda con un solo bin cuando el espectro da para mas", () => {
    for (const sampleRate of [44100, 48000]) {
      const bands = bands48(sampleRate);
      for (const band of bands) {
        expect(band.endBin - band.startBin + 1).toBeGreaterThanOrEqual(MIN_BAND_BINS);
      }
    }
  });

  /**
   * El reparto sigue siendo logaritmico por abajo.
   *
   * Forzar un ancho minimo de bins no basta: si no hay resolucion, el reparto
   * degeneraba en **lineal** en el extremo bajo y las primeras bandas se comian
   * el mismo trozo de espectro con centros a mas del doble de la anterior. Con
   * fftSize 1024 el primer salto es de ~2.3x; con 4096 es de ~1.6x. El techo de
   * 1.9x mide lo que importa —que la razon entre centros vecinos no se dispare—
   * sin atar el test a una frecuencia concreta.
   */
  it("la razon entre centros de bandas vecinas no se dispara", () => {
    for (const sampleRate of [44100, 48000]) {
      for (const bandCount of [24, 48, 64]) {
        const bands = computeBandFrequencies(sampleRate, DEFAULT_FFT_SIZE, bandCount);
        for (let i = 1; i < bands.length; i++) {
          const ratio = bands[i].centerHz / bands[i - 1].centerHz;
          expect(
            ratio,
            `banda ${i} salta ${ratio.toFixed(2)}x sobre la anterior (${sampleRate} Hz / ${bandCount} bandas)`
          ).toBeLessThan(1.9);
          expect(ratio).toBeGreaterThan(1);
        }
      }
    }
  });

  it("el numero de bins distintos leidos crece con la banda, no se estanca", () => {
    // La mitad baja tiene que distinguir muchos mas valores que antes.
    for (const sampleRate of [44100, 48000]) {
      const bands = bands48(sampleRate);
      const firstQuarter = bands.slice(0, BAND_COUNT / 4);
      const distinct = new Set(firstQuarter.map((b) => b.startBin));
      expect(distinct.size).toBe(firstQuarter.length);
    }
  });

  it("resiste entradas invalidas sin lanzar", () => {
    expect(computeBandFrequencies(0, DEFAULT_FFT_SIZE, BAND_COUNT)).toEqual([]);
    expect(computeBandFrequencies(44100, 0, BAND_COUNT)).toEqual([]);
    expect(computeBandFrequencies(44100, DEFAULT_FFT_SIZE, 0)).toEqual([]);
    expect(computeBandFrequencies(44100, DEFAULT_FFT_SIZE, BAND_COUNT, 18000, 30)).toEqual([]);
    // Un FFT tan corto que no cabe una banda por bin no puede esconderlo con un
    // reparto degenerado: devuelve vacio.
    expect(computeBandFrequencies(44100, 64, BAND_COUNT)).toEqual([]);
  });
});

describe("RC.32 — escala de niveles: sin zona muerta (lib/web-audio.ts)", () => {
  it("convierte byte <-> dBFS de forma invertible dentro de la ventana", () => {
    expect(frequencyByteToDb(0)).toBeCloseTo(ANALYSER_MIN_DB, 6);
    expect(frequencyByteToDb(255)).toBeCloseTo(ANALYSER_MAX_DB, 6);
    expect(dbToFrequencyByte(ANALYSER_MIN_DB)).toBe(0);
    expect(dbToFrequencyByte(ANALYSER_MAX_DB)).toBe(255);
    for (const db of [-90, -70, -50, -30, -15, -3, 0]) {
      expect(frequencyByteToDb(dbToFrequencyByte(db))).toBeCloseTo(db, 0);
    }
    // Fuera de ventana satura en los extremos, no se desborda.
    expect(dbToFrequencyByte(-200)).toBe(0);
    expect(dbToFrequencyByte(20)).toBe(255);
    expect(frequencyByteToDb(-10)).toBe(ANALYSER_MIN_DB);
    expect(frequencyByteToDb(999)).toBe(ANALYSER_MAX_DB);
  });

  /**
   * Requisito RC.32: -15 dBFS y -50 dBFS no pueden acabar a la misma altura.
   *
   * Antes: `byte * 1.35 >= 255` a partir del byte 189 (= -29.4 dBFS en la
   * ventana de entonces), así que -15 salía exactamente 1.000. Se mide sin tilt
   * para que la diferencia sea atribuible a la escala y no a la compensación.
   */
  it("una banda a -15 dBFS y otra a -50 dBFS producen alturas distintas", () => {
    for (const sampleRate of [44100, 48000]) {
      const loud = levelOfBand(sampleRate, 6, -15, NO_TILT);
      const quiet = levelOfBand(sampleRate, 6, -50, NO_TILT);
      expect(loud).toBeGreaterThan(0);
      expect(quiet).toBeGreaterThan(0);
      expect(loud - quiet).toBeGreaterThan(0.2);
    }
  });

  /**
   * Este es el test que mata la zona muerta.
   *
   * Con la escala anterior, -30 dBFS y -25 dBFS caían los dos en 1.000 exacto:
   * 19 dB de rango por encima de -29.4 dBFS donde la altura de la barra no
   * transmitía nada, que es lo que clavaba los graves de un preview masterizado
   * contra el techo y aplastaba todo lo demás al fondo.
   */
  it("cinco dB de diferencia dentro del rango musical mueven la barra", () => {
    for (const sampleRate of [44100, 48000]) {
      for (const [a, b] of [
        [-30, -25],
        [-25, -20],
        [-20, -15],
      ] as const) {
        const lower = levelOfBand(sampleRate, 6, a, NO_TILT);
        const upper = levelOfBand(sampleRate, 6, b, NO_TILT);
        expect(
          upper - lower,
          `${b} dBFS debería verse por encima de ${a} dBFS en ${sampleRate} Hz`
        ).toBeGreaterThan(0.02);
        expect(upper).toBeLessThan(1);
      }
    }
  });

  it("no hay meseta en todo el rango: cada paso de 5 dB sube la barra", () => {
    for (const sampleRate of [44100, 48000]) {
      const bands = bands48(sampleRate);
      for (const options of [NO_TILT, undefined]) {
        const levels: number[] = [];
        for (let db = -70; db <= 0; db += 5) {
          levels.push(levelOfBand(sampleRate, 6, db, options, bands));
        }
        expect(levels[0]).toBeGreaterThan(0);
        expect(levels[levels.length - 1]).toBeLessThanOrEqual(1);
        for (let i = 1; i < levels.length; i++) {
          expect(
            levels[i],
            `${-70 + i * 5} dBFS no puede quedarse igual que ${-75 + i * 5} dBFS en ${sampleRate} Hz`
          ).toBeGreaterThan(levels[i - 1]);
        }
      }
    }
  });

  /**
   * Donde recorta exactamente.
   *
   * La zona muerta no desaparece: se mueve. Ahora mide `DEFAULT_BAND_BOOST_DB`
   * (3 dB) y esta pegada al ceiling del analizador, no a mitad de rango. Antes
   * media 19.4 dB y empezaba en -29.4 dBFS. El test lo fija en numero en vez de
   * decir "no debe saturar", que es una promesa que un margen no puede cumplir.
   */
  it("la zona muerta mide el margen en dB y esta pegada al ceiling", () => {
    const bands = bands48(48000);
    const levelAt = (db: number) => {
      const data = new Uint8Array(bands[bands.length - 1].endBin + 1);
      data.fill(dbToFrequencyByte(db));
      return computeBandLevels(data, bands, NO_TILT)[0].level;
    };

    // Todo el rango musical por debajo del margen sigue siendo distinguible.
    for (const db of [-60, -50, -40, -30, -20, -10, -5, -4]) {
      expect(levelAt(db), `${db} dBFS no debe saturar`).toBeLessThan(1);
    }
    // Y el umbral cae donde dice la cuenta, no antes.
    expect(ANALYSER_MAX_DB - DEFAULT_BAND_BOOST_DB).toBe(-3);
    expect(levelAt(-4)).toBeLessThan(1);
    expect(levelAt(-2)).toBe(1);
  });

  it("el tilt mantiene los graves por debajo del techo aun con 0 dBFS de media", () => {
    // Con tilt 0, 0 dBFS en la banda mas grave recorta. El tilt sube los agudos
    // y deja cabecera a los graves, que es donde cae un master real.
    const bands = bands48(48000);
    const data = new Uint8Array(bands[bands.length - 1].endBin + 1).fill(255);
    const levels = computeBandLevels(data, bands);
    expect(levels[0].level).toBeLessThan(1);
  });

  it("el piso de ruido devuelve exactamente 0 y no barras de silencio", () => {
    for (const sampleRate of [44100, 48000]) {
      expect(levelOfBand(sampleRate, 6, SPECTRUM_FLOOR_DB - 1, NO_TILT)).toBe(0);
      expect(levelOfBand(sampleRate, 6, ANALYSER_MIN_DB, NO_TILT)).toBe(0);
      expect(levelOfBand(sampleRate, 6, SPECTRUM_FLOOR_DB + 3, NO_TILT)).toBeGreaterThan(0);
    }
  });

  it("normaliza los niveles entre 0 y 1", () => {
    const bands = bands48(44100);
    const loud = new Uint8Array(bands[bands.length - 1].endBin + 1).fill(255);
    const silent = new Uint8Array(bands[bands.length - 1].endBin + 1);
    for (const level of computeBandLevels(loud, bands).map((l) => l.level)) {
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThanOrEqual(1);
    }
    for (const level of computeBandLevels(silent, bands).map((l) => l.level)) {
      expect(level).toBe(0);
    }
  });

  it("el pico se mantiene y decae cuando el nivel baja", () => {
    const bands = bands48(44100);
    const loud = new Uint8Array(bands[bands.length - 1].endBin + 1).fill(255);
    const quiet = new Uint8Array(bands[bands.length - 1].endBin + 1).fill(120);
    const first = computeBandLevels(loud, bands);
    const peaks = first.map((l) => l.peak);
    const second = computeBandLevels(quiet, bands, { previousPeaks: peaks });
    expect(second[0].peak).toBeLessThanOrEqual(peaks[0]);
    expect(second[0].peak).toBeGreaterThan(0);
    expect(second[0].level).toBeGreaterThan(0);
    expect(second[0].level).toBeLessThan(second[0].peak);
  });

  it("tolera arrays mas cortos de lo esperado", () => {
    const bands = bands48(44100);
    const short = new Uint8Array(4).fill(120);
    const levels = computeBandLevels(short, bands);
    expect(levels).toHaveLength(bands.length);
    for (const level of levels) {
      expect(level.level).toBeGreaterThanOrEqual(0);
      expect(level.level).toBeLessThanOrEqual(1);
    }
    expect(
      computeBandLevels(new Uint8Array(0), bands).every((l) => l.level === 0)
    ).toBe(true);
  });

  it("un tono agudo no queda por debajo de uno grave con la misma energia", () => {
    // Se conserva la intencion original (el contenido no se pondera por
    // posicion), pero contra una banda ancha y con el tilt desactivado: con el
    // relleno plano de antes, `mean == max == valor` hacia pasar este test
    // hiciese lo que hiciese el ancho de banda, y no podia observar el defecto.
    const bands = bands48(44100);
    const bassBand = bands[0];
    const trebleBand = bands[bands.length - 1];

    const bassData = new Uint8Array(bands[bands.length - 1].endBin + 1);
    bassData.fill(dbToFrequencyByte(-30), bassBand.startBin, bassBand.endBin + 1);
    const bass = computeBandLevels(bassData, bands, NO_TILT);

    const trebleData = new Uint8Array(bands[bands.length - 1].endBin + 1);
    trebleData.fill(dbToFrequencyByte(-30), trebleBand.startBin, trebleBand.endBin + 1);
    const treble = computeBandLevels(trebleData, bands, NO_TILT);

    expect(bass[0].level).toBeGreaterThan(0);
    expect(treble[treble.length - 1].level).toBeGreaterThan(0);
    // Mismo dB, sin tilt: el nivel debe coincidir con independencia del ancho.
    expect(bass[0].level).toBeCloseTo(treble[treble.length - 1].level, 6);
  });
});

describe("RC.32 — inclinacion espectral y agregado (lib/web-audio.ts)", () => {
  /**
   * Referencia de espectro musical: -4.5 dB/octava, que es la caida natural de
   * un spectrum con musica y la que motivaba el tilt. Debe leerse como
   * descendente de arriba abajo, con margen y sin tocar el techo.
   */
  it("la altura baja de forma estrictamente decreciente con la frecuencia", () => {
    for (const sampleRate of [44100, 48000]) {
      const bands = bands48(sampleRate);
      const dbs = dbPerOctave(bands, -25, 4.5);
      const levels = computeBandLevels(spectrumFromDb(bands, dbs), bands).map((l) => l.level);

      expect(levels[0]).toBeGreaterThan(levels[levels.length - 1]);
      expect(levels.every((v) => v < 1)).toBe(true);
      expect(levels[0] - levels[levels.length - 1]).toBeGreaterThan(0.15);
      expect(
        countNonIncreasing(levels),
        `esperando descenso estricto con ${sampleRate} Hz`
      ).toBe(0);
    }
  });

  /**
   * Referencia rosa (-3 dB/octava), que es el caso limite.
   *
   * Con 48 bandas y una ventana de 8 bits, el paso por banda cae por debajo de
   * un peldaño de cuantizacion (0.35 dB): hay parejas de bandas que el byte no
   * distingue. El descenso estricto no es observable por la API de bytes, y el
   * test lo dice en vez de fingir lo contrario.
   *
   * Lo que si tiene que cumplirse, y con la escala anterior fallaba de las dos
   * formas: ninguna banda satura (-35 dBFS a 1 kHz empujaba las diez primeras a
   * 1.000 exacto) y el orden se conserva en todas las parejas que el byte si
   * distingue.
   */
  it("un espectro rosa de referencia no satura y respeta el orden del byte", () => {
    for (const sampleRate of [44100, 48000]) {
      const bands = bands48(sampleRate);
      const dbs = dbPerOctave(bands, -35, 3);
      const data = spectrumFromDb(bands, dbs);
      const levels = computeBandLevels(data, bands).map((l) => l.level);
      const bytes = bands.map((band) => data[band.startBin]);

      expect(
        levels.filter((v) => v >= 0.999),
        `bandas saturadas a ${sampleRate} Hz`
      ).toEqual([]);
      expect(levels[0]).toBeGreaterThan(levels[levels.length - 1]);
      expect(levels[0] - levels[levels.length - 1]).toBeGreaterThan(0.08);

      // Donde el byte baja, la altura baja. En un empate de byte decide el tilt,
      // y por eso el desplazamiento queda acotado (se comprueba abajo).
      let resolvable = 0;
      for (let i = 1; i < levels.length; i++) {
        if (bytes[i] < bytes[i - 1]) {
          expect(
            levels[i],
            `banda ${i} invierte el orden del byte en ${sampleRate} Hz`
          ).toBeLessThan(levels[i - 1]);
          resolvable++;
        }
      }
      expect(resolvable).toBeGreaterThan(BAND_COUNT / 2);

      // Empates de byte: el tilt es lo unico que separa las bandas, asi que el
      // salto tiene que ser el del tilt y no un salto de escala.
      let maxTieJump = 0;
      for (let i = 1; i < levels.length; i++) {
        if (bytes[i] === bytes[i - 1]) {
          maxTieJump = Math.max(maxTieJump, Math.abs(levels[i] - levels[i - 1]));
        }
      }
      expect(maxTieJump).toBeLessThan(0.02);
    }
  });

/**
   * El limite del anterior, aislado: con dos bandas al mismo byte, la mas aguda
   * queda por encima porque el tilt la levanta. Documenta el mecanismo para que
   * no se lea como un fallo del mapeo.
   */
  it("en un empate de byte la mas aguda gana por el tilt, y solo por el tilt", () => {
    const bands = bands48(48000);
    const data = new Uint8Array(bands[bands.length - 1].endBin + 1);
    const treble = bands[bands.length - 1];
    // -60 dBFS cae por debajo del piso de ruido: forzar el byte equivalente.
    data.fill(dbToFrequencyByte(-60), bands[20].startBin, bands[20].endBin + 1);
    data.fill(dbToFrequencyByte(-60), treble.startBin, treble.endBin + 1);
    const levelAt = (index: number, options?: BandLevelOptions) =>
      computeBandLevels(data, bands, options)[index].level;

    expect(levelAt(20, NO_TILT)).toBeCloseTo(levelAt(bands.length - 1, NO_TILT), 6);
    expect(levelAt(bands.length - 1)).toBeGreaterThan(levelAt(20));
  });

  it("el tilt levanta los agudos respecto a los graves con la misma energia", () => {
    for (const sampleRate of [44100, 48000]) {
      const bands = bands48(sampleRate);
      const bass = levelOfBand(sampleRate, 0, -40, undefined, bands);
      const treble = levelOfBand(sampleRate, bands.length - 1, -40, undefined, bands);
      expect(treble).toBeGreaterThan(bass);

      // Sin tilt no hay diferencia: el peso no viene de la frecuencia.
      const bassFlat = levelOfBand(sampleRate, 0, -40, NO_TILT, bands);
      const trebleFlat = levelOfBand(sampleRate, bands.length - 1, -40, NO_TILT, bands);
      expect(trebleFlat).toBeCloseTo(bassFlat, 6);
    }
  });

  /**
   * El agregador es un maximo, no una media.
   *
   * El ancho de banda va de MIN_BAND_BINS a unas 180 bins. Promediando todas, un
   * pico de una sola bin en una banda ancha se dividia entre 180 y se perdia; el
   * ataque es justo lo que un visualizador tiene que mostrar.
   */
  it("un pico estrecho dentro de una banda ancha no se diluye", () => {
    const bands = bands48(48000);
    const widths = bands.map((band) => band.endBin - band.startBin + 1);
    const widest = widths.indexOf(Math.max(...widths));
    expect(widths[widest]).toBeGreaterThan(MIN_BAND_BINS);

    const data = new Uint8Array(bands[bands.length - 1].endBin + 1);
    data[bands[widest].startBin] = 255;
    const level = computeBandLevels(data, bands, NO_TILT)[widest].level;
    expect(level).toBeGreaterThan(0.8);
  });

  it("el pico de una banda con mas energia no lo fija otra banda", () => {
    const bands = bands48(48000);
    const data = new Uint8Array(bands[bands.length - 1].endBin + 1);
    data[bands[10].startBin] = dbToFrequencyByte(-40);
    const levels = computeBandLevels(data, bands, NO_TILT);
    expect(levels[10].level).toBeGreaterThan(0);
    for (let i = 0; i < levels.length; i++) {
      if (i === 10) continue;
      expect(levels[i].level).toBe(0);
    }
  });
});

describe("RC.32 — proteccion de audio contra CORS (lib/web-audio.ts)", () => {
  /**
   * `createMediaElementSource()` reemplaza la salida nativa del elemento. Con
   * medio cross-origin sin ACAO el grafo entrega silencio: hoy el impacto es un
   * host, porque `shouldUseCrossOrigin()` solo autoriza los verificados.
   */
  it("solo acepta elementos cuya salida no se va a silenciar", () => {
    const origin = "https://epk-dashboard.vercel.app";

    // crossOrigin declarado: hay ACAO, el grafo suena.
    expect(
      isAnalyserSafeElement({ crossOrigin: "anonymous", src: "https://otro.example/x.m4a" }, origin)
    ).toBe(true);

    // Mismo origen, con y sin ruta absoluta.
    expect(isAnalyserSafeElement({ crossOrigin: null, src: "/uploads/demo.mp3" }, origin)).toBe(
      true
    );
    expect(
      isAnalyserSafeElement({ crossOrigin: null, src: `${origin}/api/preview.m4a` }, origin)
    ).toBe(true);

    // Objetos locales: no hay red de por medio.
    expect(isAnalyserSafeElement({ crossOrigin: null, src: "blob:" + origin + "/1234" }, origin)).toBe(
      true
    );
    expect(isAnalyserSafeElement({ crossOrigin: null, src: "data:audio/mp3;base64,AAA" }, origin)).toBe(
      true
    );

    // Nada cargado todavia: no hay medio todavia, asi que no hay riesgo.
    expect(isAnalyserSafeElement({ crossOrigin: null, src: "" }, origin)).toBe(true);

    // Tercero sin crossOrigin: silencioso por el grafo. Se rechaza.
    expect(
      isAnalyserSafeElement({ crossOrigin: null, src: "https://cdn.desconocido.example/p.m4a" }, origin)
    ).toBe(false);
    expect(isAnalyserSafeElement({ crossOrigin: null, src: "https://example.com/x.mp3" }, origin)).toBe(
      false
    );

    // `currentSrc` manda sobre `src`: es el recurso que realmente se cargo.
    expect(
      isAnalyserSafeElement(
        { crossOrigin: null, src: "/uploads/demo.mp3", currentSrc: "https://example.com/x.mp3" },
        origin
      )
    ).toBe(false);

    // Sin origen conocido no se puede verificar: se rechaza por prudencia.
    expect(isAnalyserSafeElement({ crossOrigin: null, src: "https://example.com/x.mp3" }, "")).toBe(
      false
    );

  });
});