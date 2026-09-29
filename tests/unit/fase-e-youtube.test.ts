import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Fase E — el N+1 de YouTube.
 *
 * Antes `EPKCard` llamaba a `/videos?id=<uno>` una vez por track, así que un
 * catálogo de N tracks gastaba N unidades de cuota del API v3 por visitante.
 * Ahora hay un lote (`videos?id=A,B,C`, hasta 50) y los motivos de fallo están
 * discriminados, incluido el `res.ok` que faltaba.
 */
async function loadYoutube(key: string | undefined) {
  vi.resetModules();
  if (key === undefined) delete process.env.YOUTUBE_API_KEY;
  else process.env.YOUTUBE_API_KEY = key;
  return await import("@/lib/youtube");
}

function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): unknown {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  };
}

function item(id: string, viewCount = "10", likeCount = "2") {
  return {
    id,
    snippet: {
      title: `Video ${id}`,
      description: "desc",
      thumbnails: { high: { url: `https://img/${id}.jpg` } },
    },
    contentDetails: { duration: "PT3M21S" },
    statistics: { viewCount, likeCount, commentCount: "1" },
  };
}

describe("Fase E — lib/youtube.ts lote y motivos", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.YOUTUBE_API_KEY;
  });

  describe("motivos discriminados", () => {
    it("sin YOUTUBE_API_KEY devuelve no_key sin tocar la red", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { getVideoStats } = await loadYoutube(undefined);

      const res = await getVideoStats("dQw4w9WgXcQ");

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("no_key");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("403 se mapea a quota: antes se parseaba como éxito porque faltaba res.ok", async () => {
      // Cuerpo con items: si no se comprobara `res.ok`, esto parecería éxito.
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({ items: [item("dQw4w9WgXcQ", "999")] }, { ok: false, status: 403 }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { getVideoStats } = await loadYoutube("clave");

      const res = await getVideoStats("dQw4w9WgXcQ");

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("quota");
    });

    it("429 también es quota", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 429 })));
      const { getVideoStats } = await loadYoutube("clave");

      const res = await getVideoStats("dQw4w9WgXcQ");

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("quota");
    });

    it("500 es upstream, no not_found", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })));
      const { getVideoStats } = await loadYoutube("clave");

      const res = await getVideoStats("dQw4w9WgXcQ");

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("upstream");
    });

    it("cuerpo de error con quotaExceeded ( aunque el status sea 200 ) es quota", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({ error: { errors: [{ reason: "quotaExceeded" }] } }),
        ),
      );
      const { getVideoStats } = await loadYoutube("clave");

      const res = await getVideoStats("dQw4w9WgXcQ");

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("quota");
    });

    it("keyInvalid se mapea a no_key, no a upstream genérico", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({ error: { errors: [{ reason: "keyInvalid" }] } }),
        ),
      );
      const { getVideoStats } = await loadYoutube("clave-mala");

      const res = await getVideoStats("dQw4w9WgXcQ");

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("no_key");
    });

    it("200 con items vacío es not_found (el video no existe)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [] })));
      const { getVideoStats } = await loadYoutube("clave");

      const res = await getVideoStats("no-existe-123");

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("not_found");
    });

    it("un fallo de red es network y escribe en console.error", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
      const { getVideoStats } = await loadYoutube("clave");

      const res = await getVideoStats("dQw4w9WgXcQ");

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("network");
      expect(spy).toHaveBeenCalled();
      expect(String(spy.mock.calls[0]?.[0])).toContain("youtube");
    });

    it("un timeout es upstream y no se registra como error de red", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const timeout = new Error("aborted");
      timeout.name = "TimeoutError";
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
      const { getVideoStats } = await loadYoutube("clave");

      const res = await getVideoStats("dQw4w9WgXcQ");

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("upstream");
      expect(spy).not.toHaveBeenCalled();
    });

    it("un videoId vacío es not_found, no un null sin explicación", async () => {
      const { getVideoStats } = await loadYoutube("clave");

      const res = await getVideoStats("");

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("not_found");
    });

    it("un body ilegible no rompe: cae en upstream", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("no soy json");
          },
        }),
      );
      const { getVideoStats } = await loadYoutube("clave");

      const res = await getVideoStats("dQw4w9WgXcQ");

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("not_found");
    });
  });

  describe("lote (el N+1)", () => {
    it("N ids entran en UNA sola llamada con id=A,B,C", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({
          items: [item("aaa", "1", "1"), item("bbb", "2", "2"), item("ccc", "3", "3")],
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { getVideoStatsBatch } = await loadYoutube("clave");

      const res = await getVideoStatsBatch(["aaa", "bbb", "ccc"]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain("/youtube/v3/videos?id=aaa,bbb,ccc");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.size).toBe(3);
        expect(res.data.get("bbb")?.viewCount).toBe(2);
        expect(res.data.get("bbb")?.likeCount).toBe(2);
      }
    });

    it("parte en trozos de 50 (el máximo del API v3) y no en N llamadas", async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `id${i}`);
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        const idsParam = decodeURIComponent(url.split("?")[1].split("&")[0].replace("id=", ""));
        return jsonResponse({ items: idsParam.split(",").map((id) => item(id)) });
      });
      vi.stubGlobal("fetch", fetchMock);
      const { getVideoStatsBatch, YOUTUBE_BATCH_LIMIT } = await loadYoutube("clave");

      const res = await getVideoStatsBatch(ids);

      expect(YOUTUBE_BATCH_LIMIT).toBe(50);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.size).toBe(51);
    });

    it("duplica ids → una sola entrada en el mapa y una sola vez en la URL", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [item("aaa")] }));
      vi.stubGlobal("fetch", fetchMock);
      const { getVideoStatsBatch } = await loadYoutube("clave");

      const res = await getVideoStatsBatch(["aaa", " aaa ", "aaa"]);

      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.size).toBe(1);
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(decodeURIComponent(url)).toContain("id=aaa&");
    });

    it("los ids que YouTube omite no son un error: simplemente no están", async () => {
      // YouTube no garantiza orden ni que devuelva todo lo pedido.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ items: [item("ccc", "30", "3"), item("aaa", "10", "1")] })),
      );
      const { getVideoStatsBatch } = await loadYoutube("clave");

      const res = await getVideoStatsBatch(["aaa", "bbb", "ccc"]);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.size).toBe(2);
        // Emparejado por `id`, no por posición.
        expect(res.data.get("ccc")?.viewCount).toBe(30);
        expect(res.data.has("bbb")).toBe(false);
      }
    });

    it("lista vacía: ok con mapa vacío y sin gastar cuota", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { getVideoStatsBatch } = await loadYoutube("clave");

      const res = await getVideoStatsBatch([]);

      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.size).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("un 403 tumba todo el lote con motivo quota", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ items: [item("aaa")] }, { ok: false, status: 403 })),
      );
      const { getVideoStatsBatch } = await loadYoutube("clave");

      const res = await getVideoStatsBatch(["aaa", "bbb"]);

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("quota");
    });

    it("si ningún id vuelve, el lote es not_found (no un error de cuota)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [] })));
      const { getVideoStatsBatch } = await loadYoutube("clave");

      const res = await getVideoStatsBatch(["a", "b"]);

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("not_found");
    });

    it("el fetch del lote lleva revalidate y signal de timeout", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [item("aaa")] }));
      vi.stubGlobal("fetch", fetchMock);
      const { getVideoStatsBatch } = await loadYoutube("clave");

      await getVideoStatsBatch(["aaa"]);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { next?: unknown }];
      expect(init.next).toEqual({ revalidate: 300 });
      expect(init.signal).toBeDefined();
      expect(String((fetchMock.mock.calls[0] as [string])[0])).toContain("part=statistics");
    });
  });

  describe("utilidades para la UI", () => {
    it("toStatsRecord aplana el Map a un objeto serializable Server → Client", async () => {
      const { toStatsRecord } = await loadYoutube("clave");
      const map = new Map([
        ["aaa", { viewCount: 1, likeCount: 2, commentCount: 3, duration: "", title: "", thumbnail: "", description: "" }],
      ]);

      const record = toStatsRecord(map);

      expect(record).toEqual({ aaa: { viewCount: 1, likeCount: 2 } });
      expect(JSON.parse(JSON.stringify(record))).toEqual({ aaa: { viewCount: 1, likeCount: 2 } });
    });

    it("toStatsRecord(null) devuelve {} en vez de reventar", async () => {
      const { toStatsRecord } = await loadYoutube("clave");
      expect(toStatsRecord(null)).toEqual({});
    });

    it("collectVideoIds se queda solo con los ids utilizables", async () => {
      const { collectVideoIds } = await loadYoutube("clave");
      const ids = collectVideoIds([
        { youtube_video_id: "aaa" },
        { youtube_video_id: null },
        { youtube_video_id: "  " },
        { youtube_video_id: "bbb" },
        {},
      ]);
      expect(ids).toEqual(["aaa", "bbb"]);
    });
  });
});

describe("Fase E — /api/youtube/stats", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.YOUTUBE_API_KEY;
  });

  function fakeRequest(query: string, ip = "20.0.0.1") {
    return {
      url: `http://localhost:3000/api/youtube/stats?${query}`,
      headers: new Headers({ "x-forwarded-for": ip }),
    } as unknown as Parameters<typeof import("@/app/api/youtube/stats/route").GET>[0];
  }

  it("400 si no viene videoId ni ids", async () => {
    const { GET } = await import("@/app/api/youtube/stats/route");
    const res = await GET(fakeRequest(""));
    expect(res.status).toBe(400);
  });

  it("400 con un videoId con formato inválido", async () => {
    const { GET } = await import("@/app/api/youtube/stats/route");
    const res = await GET(fakeRequest("videoId=no%20es%20un%20id"));
    expect(res.status).toBe(400);
  });

  it("modo lote: ids=A,B devuelve el mapa y cuenta las unidades", async () => {
    process.env.YOUTUBE_API_KEY = "clave";
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [item("aaa", "11", "1"), item("bbb", "22", "2")] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("@/app/api/youtube/stats/route");

    const res = await GET(fakeRequest("ids=aaa,bbb"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stats).toEqual({
      aaa: { viewCount: 11, likeCount: 1 },
      bbb: { viewCount: 22, likeCount: 2 },
    });
    expect(body.reason).toBeNull();
    // 2 ids = 1 llamada upstream, no 2.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("modo lote: más de 100 ids devuelve 400 en vez de quemar cuota a lo loco", async () => {
    process.env.YOUTUBE_API_KEY = "clave";
    vi.resetModules();
    const ids = Array.from({ length: 101 }, (_, i) => `id${i}`).join(",");
    const { GET } = await import("@/app/api/youtube/stats/route");

    const res = await GET(fakeRequest(`ids=${ids}`));

    expect(res.status).toBe(400);
  });

  it("modo individual: mantiene la forma plana que esperaba UnifiedMetrics", async () => {
    process.env.YOUTUBE_API_KEY = "clave";
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [item("aaa", "7", "3")] })));
    const { GET } = await import("@/app/api/youtube/stats/route");

    const res = await GET(fakeRequest("videoId=aaa"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.viewCount).toBe(7);
    expect(body.likeCount).toBe(3);
    expect(body.reason).toBeNull();
  });

  it("modo individual: not_found responde 200 con viewCount null (no hay dato, no hay error)", async () => {
    process.env.YOUTUBE_API_KEY = "clave";
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [] })));
    const { GET } = await import("@/app/api/youtube/stats/route");

    const res = await GET(fakeRequest("videoId=zzz"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.viewCount).toBeNull();
    expect(body.reason).toBe("not_found");
  });

  it("modo lote: sin clave devuelve 503 con motivo no_key", async () => {
    delete process.env.YOUTUBE_API_KEY;
    vi.resetModules();
    const { GET } = await import("@/app/api/youtube/stats/route");

    const res = await GET(fakeRequest("ids=aaa"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.reason).toBe("no_key");
    expect(body.stats).toEqual({});
  });

  it("modo lote: cuota agotada devuelve 429", async () => {
    process.env.YOUTUBE_API_KEY = "clave";
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ items: [item("aaa")] }, { ok: false, status: 403 })),
    );
    const { GET } = await import("@/app/api/youtube/stats/route");

    const res = await GET(fakeRequest("ids=aaa"));

    expect(res.status).toBe(429);
    expect((await res.json()).reason).toBe("quota");
  });

  it("rate limit: 61 peticiones desde la misma IP → la última es 429", async () => {
    process.env.YOUTUBE_API_KEY = "clave";
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [item("aaa")] })));
    const { GET } = await import("@/app/api/youtube/stats/route");

    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      statuses.push((await GET(fakeRequest("ids=aaa", "20.0.0.50"))).status);
    }

    expect(statuses.filter((s) => s === 200)).toHaveLength(60);
    expect(statuses[60]).toBe(429);
  });
});
