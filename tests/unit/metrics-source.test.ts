import { describe, it, expect } from "vitest";
import {
  METRICS_SOURCE_ORDER,
  metricsTooltip,
  resolveAlbumMetrics,
  resolveMetrics,
  type MetricsCandidates,
} from "@/lib/metrics-source";
import type { Metrics } from "@/types/music";

/**
 * RC.33 · Ola 3 — `lib/metrics-source.ts` decide qué cifra se enseña.
 *
 * Todo es función pura: ni red, ni `process.env`, ni mocks. Si este fichero
 * necesitara algo de eso, la decisión de qué fuente gana habría dejado de ser
 * testeable, que es justo lo que la volvió imposible de testear antes (todo el cálculo
 * estaba en el JSX de `EPKCard`, donde no se puede assertar nada).
 *
 * La aserción que más importa es la del `0`: que un cero curado GANE, y que la
 * ausencia NUNCA se convierta en cero. Es la diferencia entre "nadie escuchó
 * esto" y "no lo sabemos", y la segunda no se puede pintar como la primera.
 */

function curated(streams: number, saves = 0): Metrics {
  return { streams, saves, playlist_additions: 0, top_countries: [] };
}

describe("resolveMetrics — la cadena de fallback", () => {
  it("el JSON curado gana aunque valga 0", () => {
    // Un `streams: 0` escrito por alguien es un dato. Si esto devolviera
    // "youtube" o "none", estaríamos respetando menos al dato curado del que
    // respeta hoy el catálogo, y el usuario dijo explícitamente que las
    // métricas inventadas no se borran.
    const resolved = resolveMetrics({
      curated: curated(0),
      youtubeViewCount: 9_000_000,
      lastfmPlaycount: 44_000_000,
    });
    expect(resolved).toEqual({ value: 0, source: "itunes" });
  });

  it("sin curado, con YouTube, gana YouTube", () => {
    const resolved = resolveMetrics({
      curated: null,
      youtubeViewCount: 2_100_000,
      lastfmPlaycount: 44_000_000,
    });
    expect(resolved).toEqual({ value: 2_100_000, source: "youtube" });
  });

  it("sin curado ni YouTube, con Last.fm, gana Last.fm", () => {
    const resolved = resolveMetrics({
      curated: null,
      youtubeViewCount: null,
      lastfmPlaycount: 44_000_000,
    });
    expect(resolved).toEqual({ value: 44_000_000, source: "lastfm" });
  });

  it("ninguna fuente: value null y source none — NUNCA 0", () => {
    const resolved = resolveMetrics({
      curated: null,
      youtubeViewCount: null,
      lastfmPlaycount: null,
    });
    expect(resolved).toEqual({ value: null, source: "none" });
    // La aserción explícita que protege el bug original: si esto volviera a ser
    // `0`, el pie de la tarjeta se volvería a pintar como una medición.
    expect(resolved.value).not.toBe(0);
    expect(resolved.value).toBeNull();
  });

  it("sin argumentos también es ausencia, no cero", () => {
    expect(resolveMetrics({})).toEqual({ value: null, source: "none" });
  });

  it("un 0 de YouTube o de Last.fm SÍ es un dato (solo null es ausencia)", () => {
    // El contrato está documentado en el módulo: si la integración falló, se
    // pasa `null`. Un `0` que llega de verdad significa que la fuente respondió
    // cero, y convertirlo en "—" sería perder un dato real.
    expect(resolveMetrics({ curated: null, youtubeViewCount: 0 })).toEqual({
      value: 0,
      source: "youtube",
    });
    expect(resolveMetrics({ curated: null, lastfmPlaycount: 0 })).toEqual({
      value: 0,
      source: "lastfm",
    });
  });

  it("descarta NaN, Infinity y negativos como dato", () => {
    for (const bogus of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(resolveMetrics({ curated: null, youtubeViewCount: bogus }).source).toBe("none");
    }
  });
});

describe("resolveAlbumMetrics — se agrega, pero nunca mezclando fuentes", () => {
  it("suma las hijas de la MISMA fuente que el padre", () => {
    const resolved = resolveAlbumMetrics(
      { curated: curated(100) },
      [{ curated: curated(60) }, { curated: curated(40) }],
    );
    // 100 del padre + 60 + 40 de las hijas. El padre se suma porque en el
    // catálogo real trae streams propios del disco, no una copia de las hijas.
    expect(resolved).toEqual({ value: 200, source: "itunes" });
  });

  it("NO mezcla: una hija con Last.fm no se suma a las que tienen JSON curado", () => {
    const resolved = resolveAlbumMetrics(
      { curated: curated(100) },
      [
        { curated: curated(60) },
        { curated: null, lastfmPlaycount: 44_000_000 },
        { curated: curated(40) },
      ],
    );
    // 200, NO 44.000.200. Sumar scrobbles con streams curados daría un número
    // sin unidad, y además distinto en cada visita según qué fuente respondió
    // primero. La hija de Last.fm se ignora por completo: no cae a la siguiente
    // fuente, porque eso rompería la fuente elegida.
    expect(resolved).toEqual({ value: 200, source: "itunes" });
  });

  it("sin dato en el padre, manda la primera fuente de la cadena con alguna hija", () => {
    const resolved = resolveAlbumMetrics(
      { curated: null, youtubeViewCount: null, lastfmPlaycount: null },
      [
        { curated: null, youtubeViewCount: null, lastfmPlaycount: 10 },
        { curated: null, youtubeViewCount: 5, lastfmPlaycount: 999 },
      ],
    );
    // YouTube está antes que Last.fm en la cadena, así que gana YouTube y solo
    // se suma la hija de YouTube. La de Last.fm (10) queda fuera.
    expect(resolved).toEqual({ value: 5, source: "youtube" });
  });

  it("todas las hijas sin la fuente elegida: se ignoran, no se rellenan con 0", () => {
    // Padre con JSON curado de 0 (dato real) e hija sin nada: 0, no 0+0 con
    // ingeniería. La clave es que la hija no inventa un 0 que justifique nada.
    const resolved = resolveAlbumMetrics({ curated: curated(0) }, [{ curated: null }]);
    expect(resolved).toEqual({ value: 0, source: "itunes" });
  });

  it("un álbum sin ninguna cifra es ausencia, no 0", () => {
    const resolved = resolveAlbumMetrics({ curated: null }, [
      { curated: null, youtubeViewCount: null, lastfmPlaycount: null },
    ]);
    expect(resolved).toEqual({ value: null, source: "none" });
    expect(resolved.value).toBeNull();
  });

  it("un álbum sin hijas se resuelve como una pista normal", () => {
    expect(resolveAlbumMetrics({ curated: curated(7) }, [])).toEqual({
      value: 7,
      source: "itunes",
    });
  });

  it("acumula en el orden de la cadena, no en el orden de arrival", () => {
    // El orden de los objetos de entrada no debe cambiar el resultado: la
    // cadena es la que decide, no la posición de la hija en el array.
    const a: MetricsCandidates = { curated: null, youtubeViewCount: 1 };
    const b: MetricsCandidates = { curated: curated(2) };
    expect(resolveAlbumMetrics({ curated: null }, [a, b])).toEqual(
      resolveAlbumMetrics({ curated: null }, [b, a])
    );
  });
});

describe("la cadena está declarada en un solo sitio", () => {
  it("el orden es el que pidió el usuario", () => {
    expect(METRICS_SOURCE_ORDER).toEqual(["itunes", "youtube", "lastfm"]);
  });
});

describe("metricsTooltip — el «—» necesita explicación", () => {
  it("sin dato, el tooltip dice que no hay dato y no menciona un proveedor", () => {
    const tooltip = metricsTooltip({ value: null, source: "none" });
    expect(tooltip).toContain("Sin dato");
    expect(tooltip).not.toContain("YouTube");
    expect(tooltip).not.toContain("Last.fm");
  });

  it("con dato, el tooltip dice de qué fuente sale", () => {
    expect(metricsTooltip({ value: 10, source: "lastfm" })).toContain("Last.fm");
    expect(metricsTooltip({ value: 10, source: "youtube" })).toContain("YouTube");
  });

  it("el extra se añade sin pisar el texto base", () => {
    const tooltip = metricsTooltip({ value: null, source: "none" }, "No se pudieron obtener");
    expect(tooltip).toContain("Sin dato");
    expect(tooltip).toContain("No se pudieron obtener");
  });
});
