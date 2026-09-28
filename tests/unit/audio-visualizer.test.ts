import { describe, it, expect } from "vitest";
import {
  computeBandFrequencies,
  computeBandLevels,
  generateSyntheticFrequencies,
  DEFAULT_FFT_SIZE,
  MIN_HZ,
  MAX_HZ,
} from "@/lib/web-audio";

describe("P6 visualizador de audio (alcance M)", () => {
  describe("computeBandFrequencies", () => {
    it("reparte bandas dentro de la ventana 30 Hz - 18 kHz", () => {
      const bands = computeBandFrequencies(44100, DEFAULT_FFT_SIZE, 48);
      expect(bands).toHaveLength(48);
      expect(bands[0].startHz).toBeGreaterThanOrEqual(MIN_HZ);
      const last = bands[bands.length - 1];
      expect(last.endHz).toBeLessThanOrEqual(MAX_HZ + 1);
    });

    it("mantiene el orden creciente de frecuencias", () => {
      for (const sampleRate of [44100, 48000]) {
        const bands = computeBandFrequencies(sampleRate, DEFAULT_FFT_SIZE, 48);
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

    it("resiste entradas invalidas sin lanzar", () => {
      expect(computeBandFrequencies(0, DEFAULT_FFT_SIZE, 48)).toEqual([]);
      expect(computeBandFrequencies(44100, 0, 48)).toEqual([]);
      expect(computeBandFrequencies(44100, DEFAULT_FFT_SIZE, 0)).toEqual([]);
      expect(computeBandFrequencies(44100, DEFAULT_FFT_SIZE, 48, 18000, 30)).toEqual([]);
    });
  });

  describe("computeBandLevels", () => {
    const bands = computeBandFrequencies(44100, DEFAULT_FFT_SIZE, 8);

    it("normaliza los niveles entre 0 y 1", () => {
      const loud = new Uint8Array(512).fill(255);
      const silent = new Uint8Array(512);
      for (const level of computeBandLevels(loud, bands).map((l) => l.level)) {
        expect(level).toBeGreaterThan(0);
        expect(level).toBeLessThanOrEqual(1);
      }
      for (const level of computeBandLevels(silent, bands).map((l) => l.level)) {
        expect(level).toBe(0);
      }
    });

    it("el pico se mantiene y decae cuando el nivel baja", () => {
      const loud = new Uint8Array(512).fill(255);
      const quiet = new Uint8Array(512).fill(40);
      const first = computeBandLevels(loud, bands);
      const peaks = first.map((l) => l.peak);
      const second = computeBandLevels(quiet, bands, { previousPeaks: peaks });
      expect(second[0].peak).toBeLessThanOrEqual(peaks[0]);
      expect(second[0].peak).toBeGreaterThan(0);
      expect(second[0].level).toBeLessThan(second[0].peak);
    });

    it("un tono agudo no queda por debajo de uno grave con la misma energia", () => {
      const data = new Uint8Array(512);
      const bassBand = bands[0];
      const trebleBand = bands[bands.length - 1];
      data.fill(200, bassBand.startBin, bassBand.endBin + 1);
      const bass = computeBandLevels(data, bands);

      const trebleData = new Uint8Array(512);
      trebleData.fill(200, trebleBand.startBin, trebleBand.endBin + 1);
      const treble = computeBandLevels(trebleData, bands);

      expect(treble[treble.length - 1].level).toBeGreaterThan(0);
      expect(bass[0].level).toBeGreaterThan(0);
      expect(
        Math.abs(treble[treble.length - 1].level - bass[0].level)
      ).toBeLessThan(0.15);
    });

    it("tolera arrays mas cortos de lo esperado", () => {
      const short = new Uint8Array(4).fill(120);
      const levels = computeBandLevels(short, bands);
      expect(levels).toHaveLength(bands.length);
      for (const level of levels) {
        expect(level.level).toBeGreaterThanOrEqual(0);
        expect(level.level).toBeLessThanOrEqual(1);
      }
      expect(computeBandLevels(new Uint8Array(0), bands).every((l) => l.level === 0)).toBe(true);
    });
  });

  it("generateSyntheticFrequencies devuelve valores en rango de byte", () => {
    const values = generateSyntheticFrequencies(48, 0.9);
    expect(values).toHaveLength(48);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(255);
    }
  });
});
