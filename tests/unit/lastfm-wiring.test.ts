import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LASTFM_ARTIST_LIMIT,
  LASTFM_TOP_TRACKS_LIMIT,
  buildLastfmPlaycountIndex,
  lastfmArtistKey,
  lastfmPlaycountFor,
  lastfmPlaycountForRow,
  lastfmTitleKey,
} from "@/lib/lastfm-playcounts";
import type { LastfmTopTrack } from "@/lib/lastfm";

/**
 * RC.34 — el cableado de Last.fm, sin red.
 *
 * `EPKCard` ya aceptaba `lastfmPlaycount` y `lib/metrics-source.ts` ya lo usaba
 * en la cadena `itunes -> youtube -> lastfm`, pero nadie se lo pasaba: la cadena
 * llegaba a YouTube y saltaba al "—". Estos tests fijan las dos piezas que hacen
 * que eso funcione —la clave con la que se indexa y la que se busca, y el hecho
 * de que la ausencia sea `null` y no `0`— más la protección del endpoint.
 *
 * ⚠️ El mapa por título es la pieza que se rompe en silencio: si la clave del
 *   índice y la de la búsqueda dejaran de coincidir, la respuesta sería "todo
 *   funciona" y las tarjetas pintarían "—" para siempre. Por eso los casos con y
 *   sin sufijo entre paréntesis están escritos uno a uno.
 */

function topTrack(name: string, playcount: number): LastfmTopTrack {
  return { name, playcount, listeners: 1, url: `https://last.fm/${name}` };
}

describe("lastfmTitleKey — la clave con la que se indexa y se busca", () => {
  it("normaliza a minúsculas, sin diacríticos ni puntuación", () => {
    expect(lastfmTitleKey("Karma Police")).toBe("karma police");
    expect(lastfmTitleKey("Björk — Jóga")).toBe(lastfmTitleKey("bjork joga"));
    expect(lastfmTitleKey("Hello, Goodbye")).toBe(lastfmTitleKey("hello goodbye"));
  });

  /**
   * El caso que motivó la función. Last.fm devuelve el título SIN el calificador
   * de edición que sí trae el catálogo, así que sin quitar el grupo final
   * "Army of Me" y "Army of Me (2013)" serían dos claves distintas y el mapa no
   * casaría nunca.
   */
  it("con y sin sufijo entre paréntesis dan la MISMA clave", () => {
    expect(lastfmTitleKey("Army of Me (2013)")).toBe(lastfmTitleKey("Army of Me"));
    expect(lastfmTitleKey("Fake Plastic Trees (Acoustic Version)")).toBe(
      lastfmTitleKey("Fake Plastic Trees"),
    );
    expect(lastfmTitleKey("Subtitles (2009 Remaster)")).toBe(lastfmTitleKey("Subtitles"));
    expect(lastfmTitleKey("Army of Me (2013)")).toBe("army of me");
  });

  it("encadena varios grupos al final", () => {
    expect(lastfmTitleKey("Army of Me (2013) (Remastered)")).toBe("army of me");
  });

  it("también quita la decoración de título de vídeo (reutilizada de lib/youtube)", () => {
    expect(lastfmTitleKey("Karma Police [Official Video]")).toBe("karma police");
    expect(lastfmTitleKey("Another Brick in the Wall (Official Video)")).toBe(
      "another brick in the wall",
    );
  });

  it("lo que NO está entre paréntesis se conserva", () => {
    // `normalizeOfficialText` convierte los signos en espacios, no los borra:
    // "V - 2 Schneider" se queda en tres tokens ("v 2 schneider"), que es
    // distinto tanto de "v2 schneider" como de un título al que se le hubiera
    // quitado el guion.
    expect(lastfmTitleKey("V - 2 Schneider")).toBe("v 2 schneider");
    expect(lastfmTitleKey("V - 2 Schneider")).not.toBe("v2 schneider");
  });

  it("una entrada no textual da clave vacía, nunca la cadena 'null'", () => {
    expect(lastfmTitleKey(null)).toBe("");
    expect(lastfmTitleKey(undefined)).toBe("");
    expect(lastfmTitleKey("")).toBe("");
    expect(lastfmTitleKey("   ")).toBe("");
  });
});

describe("lastfmArtistKey", () => {
  it("normaliza el nombre para que la clave case con la fila del catálogo", () => {
    expect(lastfmArtistKey("Björk")).toBe("bjork");
    expect(lastfmArtistKey("  Radiohead  ")).toBe("radiohead");
    expect(lastfmArtistKey("Björk")).toBe(lastfmArtistKey("bjork"));
  });

  it("un nombre vacío o el '—' que deja lib/db.ts dan clave vacía", () => {
    expect(lastfmArtistKey("")).toBe("");
    expect(lastfmArtistKey(null)).toBe("");
    expect(lastfmArtistKey("—")).toBe("");
  });
});

describe("buildLastfmPlaycountIndex — el índice por artista", () => {
  it("indexa por título normalizado", () => {
    const index = buildLastfmPlaycountIndex([
      topTrack("Army of Me", 1234),
      topTrack("Karma Police", 987),
    ]);

    expect(index).toEqual({ "army of me": 1234, "karma police": 987 });
  });

  it("el índice construido desde Last.fm casa con el título del catálogo, con o sin sufijo", () => {
    const index = buildLastfmPlaycountIndex([topTrack("Army of Me", 42)]);

    expect(lastfmPlaycountFor(index, "Army of Me")).toBe(42);
    expect(lastfmPlaycountFor(index, "Army of Me (2013)")).toBe(42);
  });

  it("con variantes que colapsan en la misma clave gana la más escuchada", () => {
    const index = buildLastfmPlaycountIndex([
      topTrack("Heroes (Live)", 12),
      topTrack("Heroes", 9_001),
      topTrack("Heroes (Remastered)", 40),
    ]);

    expect(index).toEqual({ heroes: 9_001 });
  });

  it("un playcount 0 de Last.fm se conserva: 0 es un dato, la ausencia es la clave que falta", () => {
    const index = buildLastfmPlaycountIndex([topTrack("Rare Track", 0)]);

    expect(index).toEqual({ "rare track": 0 });
    expect(lastfmPlaycountFor(index, "Rare Track")).toBe(0);
  });

  it("un título vacío no crea una entrada que todo lo demás colisionaría", () => {
    const index = buildLastfmPlaycountIndex([topTrack("", 500), topTrack("   ", 900)]);

    expect(index).toEqual({});
  });

  it("una lista vacía da un índice vacío, no un error", () => {
    expect(buildLastfmPlaycountIndex([])).toEqual({});
  });
});

describe("lastfmPlaycountFor — la ausencia es null, NUNCA 0", () => {
  const index = buildLastfmPlaycountIndex([topTrack("Army of Me", 5)]);

  it("una pista que no está en el mapa devuelve null", () => {
    expect(lastfmPlaycountFor(index, "Paranoid Android")).toBeNull();
  });

  it("un índice vacío o ausente devuelve null", () => {
    expect(lastfmPlaycountFor({}, "Army of Me")).toBeNull();
    expect(lastfmPlaycountFor(null, "Army of Me")).toBeNull();
    expect(lastfmPlaycountFor(undefined, "Army of Me")).toBeNull();
  });

  it("un título no textual devuelve null, no un NaN que se pintaría como dato", () => {
    expect(lastfmPlaycountFor(index, null)).toBeNull();
    expect(lastfmPlaycountFor(index, "")).toBeNull();
    expect(lastfmPlaycountFor(index, "   ")).toBeNull();
  });

  it("un valor no numérico en el mapa se trata como ausencia, no se propaga", () => {
    const roto = { "army of me": Number.NaN } as unknown as Record<string, number>;
    expect(lastfmPlaycountFor(roto, "Army of Me")).toBeNull();
    const infinito = { "army of me": Number.POSITIVE_INFINITY } as unknown as Record<string, number>;
    expect(lastfmPlaycountFor(infinito, "Army of Me")).toBeNull();
  });
});

describe("lastfmPlaycountForRow — artista + título, como lo consume EPKCard", () => {
  const byArtist = {
    radiohead: buildLastfmPlaycountIndex([topTrack("Army of Me", 5)]),
  };

  it("busca por artista y por título normalizados", () => {
    expect(lastfmPlaycountForRow(byArtist, "Radiohead", "Army of Me")).toBe(5);
    expect(lastfmPlaycountForRow(byArtist, "radiohead", "Army of Me (2013)")).toBe(5);
    expect(lastfmPlaycountForRow(byArtist, " Björk ", "Army of Me")).toBeNull();
  });

  it("un artista que no vino en el lote da null, no 0", () => {
    expect(lastfmPlaycountForRow({}, "Radiohead", "Army of Me")).toBeNull();
    expect(lastfmPlaycountForRow({ radiohead: {} }, "Radiohead", "Army of Me")).toBeNull();
  });

  it("el artist_name vacío o '—' que deja lib/db.ts no rompe la búsqueda", () => {
    expect(lastfmPlaycountForRow(byArtist, "", "Army of Me")).toBeNull();
    expect(lastfmPlaycountForRow(byArtist, "—", "Army of Me")).toBeNull();
    expect(lastfmPlaycountForRow(byArtist, null, "Army of Me")).toBeNull();
  });
});

describe("/api/lastfm?method=batch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.LASTFM_API_KEY;
  });

  /** Stub mínimo de NextRequest: la ruta solo usa `url` y `headers`. */
  function fakeRequest(query: string, ip: string) {
    return {
      url: `http://localhost:3000/api/lastfm?${query}`,
      headers: new Headers({ "x-forwarded-for": ip }),
    } as unknown as Parameters<typeof import("@/app/api/lastfm/route").GET>[0];
  }

  /** Cuerpo de éxito de `artist.gettoptracks`. */
  function toptracksBody(tracks: Array<[string, string]>) {
    return {
      toptracks: {
        track: tracks.map(([name, playcount]) => ({
          name,
          playcount,
          listeners: "7",
          url: `https://last.fm/${encodeURIComponent(name)}`,
        })),
      },
    };
  }

  /**
   * `lib/lastfm.ts` lee `LASTFM_API_KEY` al cargar el módulo, así que cada
   * caso fija el env y recarga. Sin red en ningún caso: el `fetch` global está
   * siempre stubbeado.
   */
  it("sin LASTFM_API_KEY devuelve {} con 200 y ni siquiera toca la red", async () => {
    delete process.env.LASTFM_API_KEY;
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("method=batch&artists=Radiohead", "10.2.0.1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tracksByArtist).toEqual({});
    expect(body.reason).toBe("no_key");
    expect(body.error).not.toContain(process.env.LASTFM_API_KEY ?? "imposible");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("una llamada upstream por ARTISTA, nunca por pista", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => toptracksBody([["Army of Me", "10"]]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(
      fakeRequest("method=batch&artists=Radiohead,Bj%C3%B6rk,Bowie", "10.2.0.2"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.every((u) => u.includes("method=artist.gettoptracks"))).toBe(true);
    // `track.getInfo` es 1 petición por pista: con este payload serían 3
    // números, pero en un catálogo de 83 filas serían 83 llamadas.
    expect(urls.some((u) => u.includes("track.getInfo"))).toBe(false);
    // `artist.getInfo` tampoco: el índice solo necesita los top tracks.
    expect(urls.some((u) => u.includes("method=artist.getinfo"))).toBe(false);
    for (const url of urls) {
      expect(new URL(url).searchParams.get("limit")).toBe(String(LASTFM_TOP_TRACKS_LIMIT));
    }
    expect(body.tracksByArtist).toEqual({ radiohead: { "army of me": 10 }, bjork: { "army of me": 10 }, bowie: { "army of me": 10 } });
    expect(body.batchSize).toBe(3);
  });

  it("un artista repetido en el payload se indexa una sola vez", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => toptracksBody([["Army of Me", "10"]]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("@/app/api/lastfm/route");

    // 83 pistas del mismo artista colapsan en UN nombre repetido, y también
    // en variantes de grafía: la clave del mapa es `normalizeOfficialText`.
    const res = await GET(
      fakeRequest(
        "method=batch&artists=Radiohead,Radiohead,radiohead,%20Radiohead%20,,Radiohead",
        "10.2.0.3",
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body.batchSize).toBe(1);
    expect(Object.keys(body.tracksByArtist)).toEqual(["radiohead"]);
    expect(body.tracksByArtist.radiohead).toEqual({ "army of me": 10 });
  });

  it(`el tope de ${LASTFM_ARTIST_LIMIT} artistas por petición se respeta: uno de más es 400 sin red`, async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("@/app/api/lastfm/route");

    const dentro = Array.from({ length: LASTFM_ARTIST_LIMIT }, (_, i) => `Artista${i}`);
    const ok = await GET(
      fakeRequest(`method=batch&artists=${dentro.join(",")}`, "10.2.0.4"),
    );
    expect(ok.status).toBe(200);
    // Justo en el tope: una llamada upstream por artista, ni una más.
    expect(fetchMock).toHaveBeenCalledTimes(LASTFM_ARTIST_LIMIT);

    fetchMock.mockClear();
    const exceeded = await GET(
      fakeRequest(`method=batch&artists=${[...dentro, "UnoMas"].join(",")}`, "10.2.0.5"),
    );
    const body = await exceeded.json();

    expect(exceeded.status).toBe(400);
    expect(body.tracksByArtist).toEqual({});
    // El rechazo es ANTES de la red: un payload enorme no se convierte en miles
    // de llamadas upstream.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin artistas (o con la lista vacía) devuelve 400, no un 200 con datos inventados", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("@/app/api/lastfm/route");

    for (const query of ["method=batch", "method=batch&artists=", "method=batch&artists=,,,"]) {
      const res = await GET(fakeRequest(query, "10.2.0.6"));
      expect(res.status).toBe(400);
      expect((await res.json()).tracksByArtist).toEqual({});
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("la cuota agotada degrada a {} con 200: la página nunca se rompe por una métrica opcional", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }),
    );
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("method=batch&artists=Radiohead", "10.2.0.7"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tracksByArtist).toEqual({});
    expect(body.reason).toBe("quota");
  });

  it("un fallo de red degrada igual, y escribe en console.error sin destapar la clave", async () => {
    process.env.LASTFM_API_KEY = "clave-super-secreta";
    vi.resetModules();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("method=batch&artists=Radiohead", "10.2.0.8"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tracksByArtist).toEqual({});
    expect(body.reason).toBe("network");
    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("clave-super-secreta");
  });

  it("un artista que Last.fm no conoce no invalida el dato de los demás", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          new URL(url).searchParams.get("artist") === "Radiohead"
            ? toptracksBody([["Army of Me", "77"]])
            : { error: 6, message: "artist not found" },
      })),
    );
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("method=batch&artists=Radiohead,Nobody", "10.2.0.9"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tracksByArtist).toEqual({ radiohead: { "army of me": 77 } });
    expect(body.reason).toBe("not_found");
  });

  it("el lote tiene su propio cupo: 21 peticiones seguidas desde una IP dan 429", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => toptracksBody([["Army of Me", "1"]]),
      }),
    );
    const { GET } = await import("@/app/api/lastfm/route");

    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await GET(fakeRequest("method=batch&artists=Radiohead", "10.2.0.10"));
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("el modo batch no consume el cupo del modo de artista suelto", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }),
    );
    const { GET } = await import("@/app/api/lastfm/route");

    for (let i = 0; i < 25; i++) {
      await GET(fakeRequest("method=batch&artists=Radiohead", "10.2.0.11"));
    }

    const otro = await GET(fakeRequest("artist=Radiohead", "10.2.0.11"));
    expect(otro.status).toBe(429);
  });
});