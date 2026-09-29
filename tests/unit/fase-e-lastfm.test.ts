import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Fase E — el cliente de Last.fm ya no traga errores.
 *
 * `lib/lastfm.ts` lee `process.env.LASTFM_API_KEY` en el momento de cargar el
 * módulo, así que cada caso recarga el módulo con `vi.resetModules()`.
 */
async function loadLastfm(key: string | undefined) {
  vi.resetModules();
  if (key === undefined) delete process.env.LASTFM_API_KEY;
  else process.env.LASTFM_API_KEY = key;
  return await import("@/lib/lastfm");
}

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): FetchMock {
  const fn = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockFetchThrow(error: Error): FetchMock {
  const fn = vi.fn().mockRejectedValue(error);
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Cuerpo de éxito de `artist.getinfo`. */
const ARTIST_OK = {
  artist: {
    name: "PressPlay Test",
    stats: { listeners: "1234", playcount: "5678" },
    similar: { artist: [{ name: "Otro", match: "0.9" }] },
    tags: { tag: [{ name: "techno" }, { name: "house" }] },
    bio: { summary: "Bio de prueba" },
  },
};

describe("Fase E — lib/lastfm.ts motivos discriminados", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sin LASTFM_API_KEY devuelve no_key y ni siquiera toca la red", async () => {
    const fetchMock = mockFetchOnce(ARTIST_OK);
    const { fetchArtistInfo } = await loadLastfm(undefined);

    const res = await fetchArtistInfo("Artista Sin Clave");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no_key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("403 (cuota o clave sin permisos) se mapea a quota, no a null mudo", async () => {
    mockFetchOnce({}, { ok: false, status: 403 });
    const { fetchArtistInfo } = await loadLastfm("clave");

    const res = await fetchArtistInfo("Artista");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("quota");
  });

  it("429 también es quota", async () => {
    mockFetchOnce({}, { ok: false, status: 429 });
    const { fetchTopTracks } = await loadLastfm("clave");

    const res = await fetchTopTracks("Artista");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("quota");
  });

  it("500 es upstream: el proveedor respondió, pero con error", async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const { fetchArtistInfo } = await loadLastfm("clave");

    const res = await fetchArtistInfo("Artista");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("upstream");
  });

  it("data.error 6 (artista inexistente) se mapea a not_found", async () => {
    mockFetchOnce({ error: 6, message: "The artist you supplied could not be found" });
    const { fetchArtistInfo } = await loadLastfm("clave");

    const res = await fetchArtistInfo("Artista Inventado");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_found");
  });

  it("data.error 10 (API key inválida) se mapea a quota", async () => {
    mockFetchOnce({ error: 10, message: "Invalid API key" });
    const { fetchArtistInfo } = await loadLastfm("clave-mala");

    const res = await fetchArtistInfo("Artista");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("quota");
  });

  it("data.error 11 (servicio caído) se mapea a upstream", async () => {
    mockFetchOnce({ error: 11, message: "Service offline" });
    const { fetchTopTracks } = await loadLastfm("clave");

    const res = await fetchTopTracks("Artista");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("upstream");
  });

  it("HTTP 200 sin `artist` es not_found, no un error de red", async () => {
    mockFetchOnce({});
    const { fetchArtistInfo } = await loadLastfm("clave");

    const res = await fetchArtistInfo("Artista");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_found");
  });

  it("HTTP 200 sin `toptracks` es not_found", async () => {
    mockFetchOnce({});
    const { fetchTopTracks } = await loadLastfm("clave");

    const res = await fetchTopTracks("Artista");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_found");
  });

  it("un fallo de red se reporta como network y escribe en console.error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchThrow(new TypeError("fetch failed"));
    const { fetchArtistInfo } = await loadLastfm("clave");

    const res = await fetchArtistInfo("Artista");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("network");
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0]?.[0])).toContain("lastfm");
  });

  it("un timeout no es un fallo de red: es upstream, y no ensucia el log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    mockFetchThrow(timeout);
    const { fetchArtistInfo } = await loadLastfm("clave");

    const res = await fetchArtistInfo("Artista");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("upstream");
    expect(spy).not.toHaveBeenCalled();
  });

  it("usa https (nada de redirect 301), con revalidate y timeout de 5 s", async () => {
    const fetchMock = mockFetchOnce(ARTIST_OK);
    const { fetchArtistInfo } = await loadLastfm("clave");

    await fetchArtistInfo("Artista");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { next?: unknown }];
    expect(url.startsWith("https://ws.audioscrobbler.com/2.0/")).toBe(true);
    expect(url).toContain("method=artist.getinfo");
    expect(url).toContain("format=json");
    expect(init.next).toEqual({ revalidate: 3600 });
    expect(init.signal).toBeDefined();
  });

  it("los wrappers conservan su firma: null / [] aunque el motivo sea culpa nuestra", async () => {
    mockFetchOnce({}, { ok: false, status: 500 });
    const { getArtistInfo, getTopTracks, getTrackInfo } = await loadLastfm("clave");

    expect(await getArtistInfo("Artista")).toBeNull();
    expect(await getTopTracks("Artista")).toEqual([]);
    expect(await getTrackInfo("Artista", "Canzón")).toBeNull();
  });

  it("un ArtistInfo correcto se parsea igual que antes", async () => {
    mockFetchOnce(ARTIST_OK);
    const { fetchArtistInfo } = await loadLastfm("clave");

    const res = await fetchArtistInfo("Artista");

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.name).toBe("PressPlay Test");
      expect(res.data.listeners).toBe(1234);
      expect(res.data.plays).toBe(5678);
      expect(res.data.tags).toEqual(["techno", "house"]);
      expect(res.data.similar).toEqual([{ name: "Otro", match: 0.9 }]);
    }
  });

  it("Top tracks correctos se parsean con el id, playcount y listeners", async () => {
    mockFetchOnce({
      toptracks: {
        track: [
          {
            name: "Tema 1",
            playcount: "900",
            listeners: "120",
            url: "https://last.fm/tema-1",
            image: [{ "#text": "https://img/small.jpg", size: "small" }],
          },
        ],
      },
    });
    const { fetchTopTracks } = await loadLastfm("clave");

    const res = await fetchTopTracks("Artista", 5);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toMatchObject({ name: "Tema 1", playcount: 900, listeners: 120 });
      // Solo se toma la imagen `medium`, como antes.
      expect(res.data[0].image).toBeUndefined();
    }
  });
});

describe("Fase E — /api/lastfm", () => {
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

  it("400 si falta el artista", async () => {
    const { GET } = await import("@/app/api/lastfm/route");
    const res = await GET(fakeRequest("method=artist", "10.0.0.1"));
    expect(res.status).toBe(400);
  });

  it("503 sin LASTFM_API_KEY (antes devolvía 200 con payload vacío)", async () => {
    delete process.env.LASTFM_API_KEY;
    vi.resetModules();
    mockFetchOnce(ARTIST_OK);
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("artist=Artista", "10.0.0.2"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.reason).toBe("no_key");
    expect(body.artist).toBeNull();
  });

  it("429 cuando la cuota está agotada", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    mockFetchOnce({}, { ok: false, status: 429 });
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("artist=Artista", "10.0.0.3"));

    expect(res.status).toBe(429);
    expect((await res.json()).reason).toBe("quota");
  });

  it("502 si el proveedor devuelve 500", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    mockFetchOnce({}, { ok: false, status: 500 });
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("artist=Artista", "10.0.0.4"));

    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe("upstream");
  });

  it("502 si no hay red (fetch lanza)", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchThrow(new TypeError("fetch failed"));
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("artist=Artista", "10.0.0.5"));

    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe("network");
  });

  it("200 con null solo cuando el artista no existe en Last.fm", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    mockFetchOnce({ error: 6, message: "artist not found" });
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("artist=Nobody", "10.0.0.6"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.artist).toBeNull();
    expect(body.topTracks).toEqual([]);
    expect(body.reason).toBe("not_found");
  });

  it("200 con datos cuando todo va bien", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          url.includes("artist.getinfo")
            ? ARTIST_OK
            : { toptracks: { track: [{ name: "Tema 1", playcount: "9", listeners: "8" }] } },
      })),
    );
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("artist=Artista", "10.0.0.7"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.artist.listeners).toBe(1234);
    expect(body.topTracks).toHaveLength(1);
    expect(body.reason).toBeNull();
  });

  it("datos parciales: si hay algo que enseñar, 200 aunque un tramo falle", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => (url.includes("artist.getinfo") ? ARTIST_OK : { error: 6 }),
      })),
    );
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("artist=Artista", "10.0.0.12"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.artist.listeners).toBe(1234);
    expect(body.topTracks).toEqual([]);
  });

  it("method=track: 200 con el track, 502 si el proveedor revienta", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          track: {
            name: "Tema 1",
            duration: "213",
            listeners: "12",
            playcount: "34",
            toptags: { tag: [{ name: "techno" }] },
          },
        }),
      }),
    );
    const { GET } = await import("@/app/api/lastfm/route");

    const ok = await GET(fakeRequest("artist=Artista&track=Tema+1&method=track", "10.0.0.13"));
    const body = await ok.json();
    expect(ok.status).toBe(200);
    expect(body.track.playcount).toBe(34);
    expect(body.reason).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }),
    );
    vi.resetModules();
    const { GET: GET2 } = await import("@/app/api/lastfm/route");
    const fail = await GET2(fakeRequest("artist=Artista&track=Tema+1&method=track", "10.0.0.14"));
    expect(fail.status).toBe(502);
    expect((await fail.json()).reason).toBe("upstream");
  });

  it("method=track sin `track` en la query devuelve 400, no un null mudo", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    const { GET } = await import("@/app/api/lastfm/route");

    const res = await GET(fakeRequest("artist=Artista&method=track", "10.0.0.15"));

    expect(res.status).toBe(400);
  });

  it("gasta 2 unidades de cuota, no 3: la llamada a getTopAlbums desapareció", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes("artist.getinfo")
          ? ARTIST_OK
          : { toptracks: { track: [{ name: "Tema 1", playcount: "1", listeners: "1" }] } },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("@/app/api/lastfm/route");

    await GET(fakeRequest("artist=Artista", "10.0.0.8"));

    const metodos = fetchMock.mock.calls.map(([u]) => String(u));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(metodos.some((u) => u.includes("artist.getinfo"))).toBe(true);
    expect(metodos.some((u) => u.includes("artist.gettoptracks"))).toBe(true);
    expect(metodos.some((u) => u.includes("artist.gettopalbums"))).toBe(false);
  });

  it("las 2 llamadas van en paralelo, no secuenciales", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    const orden: string[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      orden.push(`inicio:${url.includes("getinfo") ? "getinfo" : "gettoptracks"}`);
      await new Promise((r) => setTimeout(r, url.includes("getinfo") ? 20 : 1));
      orden.push("fin");
      return {
        ok: true,
        status: 200,
        json: async () =>
          url.includes("getinfo") ? ARTIST_OK : { toptracks: { track: [] } },
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("@/app/api/lastfm/route");

    await GET(fakeRequest("artist=Artista", "10.0.0.9"));

    // Secuencial sería inicio:getinfo, fin, inicio:gettoptracks, fin.
    expect(orden).toEqual([
      "inicio:getinfo",
      "inicio:gettoptracks",
      "fin",
      "fin",
    ]);
  });

  it("rate limit: 31 peticiones desde la misma IP → 429 con Retry-After", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchOnce({ error: 6 });
    const { GET } = await import("@/app/api/lastfm/route");

    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await GET(fakeRequest("artist=Artista", "10.0.0.10"));
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it("rate limit por IP: otra IP no hereda el cupo", async () => {
    process.env.LASTFM_API_KEY = "clave";
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchOnce({ error: 6 });
    const { GET } = await import("@/app/api/lastfm/route");

    for (let i = 0; i < 30; i++) {
      await GET(fakeRequest("artist=Artista", "10.0.0.11"));
    }
    const otra = await GET(fakeRequest("artist=Artista", "10.0.0.99"));

    expect(otra.status).toBe(200);
  });
});
