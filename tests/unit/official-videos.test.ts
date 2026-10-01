import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

import {
  buildOfficialVideoUpdate,
  buildUploadsPlaylistId,
  channelNameMatchesArtist,
  createQuotaMeter,
  deriveChapterTiming,
  domainMatchesOfficial,
  extractOfficialDomains,
  isVideoEmbedAllowed,
  needsMadeForKidsDisclosure,
  matchOfficialVideoTitle,
  parseISO8601Duration,
  probeOfficialVideo,
  resolveOfficialVideo,
  selectOfficialVideoUpdates,
  stripVideoDecorations,
  verifyOfficialChannel,
  YOUTUBE_QUOTA_COST,
  type OfficialChannelCandidate,
  type OfficialVideoCandidate,
  type OfficialVideoVerifier,
  type YouTubeChannel,
} from "@/lib/youtube";
import { OFFICIAL_CHANNEL_CANDIDATES } from "@/scripts/fetch-official-videos";

/**
 * RC.32 · agente H — el canal oficial verificado de YouTube.
 *
 * ── Qué fija estos tests ────────────────────────────────────────────────────
 *
 *  1. **La comparación nombre + dominio rechaza un canal cuya descripción no
 *     enlaza al sitio oficial.** Es la propiedad que decide si esta ola sirve de
 *     algo: con `search.list` un mashup, una tribute band o un canal «topic»
 *     autogenerado salen igual de bien ordenados que el vídeo oficial, y nada
 *     en la respuesta lo dice. Aquí la evidencia es estructural, y si no está,
 *     el artista se queda `NO VERIFICADO`.
 *  2. **La desambiguación rechaza un título que solo coincide parcialmente.** Un
 *     `includes()` aceptaría `"Stonemilker"` para `"Stonemilker (Strings)"` y
 *     `"Tour de France"` para `"Tour de France (Version Allemande)"`: dos
 *     grabaciones distintas. Este repo ya se equivocó dos veces con iTunes por
 *     fiarse del primer resultado.
 *  3. **Un vídeo de un canal no verificado no se ofrece**, ni aunque el título
 *     coincida exactamente.
 *
 * ── Por qué son funciones puras ─────────────────────────────────────────────
 *
 * `verifyOfficialChannel`, `matchOfficialVideoTitle` y `resolveOfficialVideo` no
 * salen a la red: reciben lo declarado a mano y lo que devolvió la API. Eso
 * permite ejercitar el descarte exacto **sin gastar una unidad de cuota**, que
 * es lo que hace el dry-run del script (`npx tsx
 * scripts/fetch-official-videos.ts`) cuando se quiere probar un caso raro.
 */

const PINK_FLOYD: OfficialChannelCandidate = {
  artistName: "Pink Floyd",
  handle: "pinkfloyd",
  officialDomain: "pinkfloyd.com",
};

function channel(over: Partial<YouTubeChannel> = {}): YouTubeChannel {
  return {
    id: "UCmXbY_fI0d3xD8lS4eTFq3w",
    title: "Pink Floyd",
    description: "The official Pink Floyd channel. Visit www.pinkfloyd.com for more.",
    type: "channel",
    customUrl: "https://www.youtube.com/@pinkfloyd",
    uploadsPlaylistId: "UUmXbY_fI0d3xD8lS4eTFq3w",
    subscriberCount: 3_000_000,
    viewCount: 900_000_000,
    ...over,
  };
}

function video(over: Partial<OfficialVideoCandidate> = {}): OfficialVideoCandidate {
  return {
    videoId: "5qap5aO4i9A",
    title: "Another Brick in the Wall, Part 1",
    description: "",
    durationSeconds: 239,
    videoOwnerChannelId: "UCmXbY_fI0d3xD8lS4eTFq3w",
    publishedAt: "2013-03-22T00:00:00Z",
    ...over,
  };
}

/** Verificador que aprueba siempre, para no meter red en los tests de lógica. */
const verifyOk: OfficialVideoVerifier = async (videoId) => ({
  ok: true,
  httpStatus: 200,
  oembedTitle: `título de ${videoId}`,
  detail: "doble de prueba",
});

const verifyFail: OfficialVideoVerifier = async () => ({
  ok: false,
  httpStatus: 404,
  detail: "oEmbed responde 404",
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.32/H · verificación estructural del canal", () => {
  it("ACEPTA un canal cuyo nombre es el del artista y enlaza al sitio oficial", () => {
    const result = verifyOfficialChannel(PINK_FLOYD, channel());
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.matchedDomain).toBe("pinkfloyd.com");
    expect(result.channel?.id).toBe("UCmXbY_fI0d3xD8lS4eTFq3w");
  });

  it("RECHAZA el canal si su descripción no enlaza al sitio oficial", () => {
    const result = verifyOfficialChannel(
      PINK_FLOYD,
      channel({
        description:
          "The best of Pink Floyd on this channel. Follow us on facebook.com/pinkfloydfans",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("dominio-distinto");
    // El motivo tiene que llevar los dominios que SÍ estaban, o no es auditable.
    expect(result.descriptionDomains).toContain("facebook.com");
    expect(result.detail).toContain("pinkfloyd.com");
  });

  it("RECHAZA el canal si la descripción no enlaza a nada", () => {
    const result = verifyOfficialChannel(PINK_FLOYD, channel({ description: "Official channel" }));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("sin-dominio-oficial");
  });

  it("RECHAZA un canal «topic» autogenerado por YouTube", () => {
    // El vídeo puede ser el correcto y el canal no: es el caso que más se cuela,
    // porque el contenido es bueno.
    const result = verifyOfficialChannel(
      PINK_FLOYD,
      channel({
        id: "UCKCycDWtrpayaSstdRDjIRA",
        type: "topic",
        title: "Pink Floyd - Topic",
        description: "Generated on YouTube. www.pinkfloyd.com",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("topic-channel");
  });

  it("RECHAZA una tribute band con el nombre parecido", () => {
    const result = verifyOfficialChannel(
      PINK_FLOYD,
      channel({ title: "Pink Floyd Tribute Band", description: "www.pinkfloyd.com" }),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("nombre-distinto");
  });

  it("RECHAZA el handle que no existe", () => {
    const result = verifyOfficialChannel(PINK_FLOYD, null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("canal-no-encontrado");
  });

  it("no acepta un dominio que solo contiene el oficial como sufijo", () => {
    // `pinkfloyd.com.example.tv` es un registro de otra gente. Un `includes()`
    // lo aceptaría, y es exactamente el agujero que hace inútil la comparación.
    expect(domainMatchesOfficial("pinkfloyd.com.example.tv", "pinkfloyd.com")).toBe(false);
    expect(domainMatchesOfficial("www.pinkfloyd.com", "pinkfloyd.com")).toBe(true);
    expect(domainMatchesOfficial("shop.pinkfloyd.com", "pinkfloyd.com")).toBe(true);
    expect(domainMatchesOfficial("notpinkfloyd.com", "pinkfloyd.com")).toBe(false);
  });

  it("exige igualdad exacta en el nombre del canal", () => {
    expect(channelNameMatchesArtist("Pink Floyd", "Pink Floyd")).toBe(true);
    expect(channelNameMatchesArtist("KRAFTWERK", "Kraftwerk")).toBe(true);
    expect(channelNameMatchesArtist("Kraftwerk2K", "Kraftwerk")).toBe(false);
    expect(channelNameMatchesArtist("Björk", "Björk")).toBe(true);
  });

  it("extrae dominios de una descripción real y descarta los falsos positivos", () => {
    const domains = extractOfficialDomains(
      "Official site: https://www.pinkfloyd.com/ · also bjork.com. Recorded 1.5 in the studio."
    );
    expect(domains).toContain("pinkfloyd.com");
    expect(domains).toContain("bjork.com");
    expect(domains.some((d) => d.includes("1.5"))).toBe(false);
  });

  it("deriva la playlist de subidas solo de un id con forma", () => {
    expect(buildUploadsPlaylistId("UCmXbY_fI0d3xD8lS4eTFq3w")).toBe("UUmXbY_fI0d3xD8lS4eTFq3w");
    // Sin prefijo UC no hay relación con la pestaña de subidas.
    expect(buildUploadsPlaylistId("mXbY_fI0d3xD8lS4eTFq3w")).toBeNull();
    expect(buildUploadsPlaylistId("UC123")).toBeNull();
    expect(buildUploadsPlaylistId("")).toBeNull();
  });

  it("los 5 artistas seedeados tienen handle y dominio declarados a mano", () => {
    // Los handles son una AFIRMACIÓN de alguien. Este test no dice que sean
    // ciertos —solo que existen y que cada uno trae su dominio oficial, que es
    // lo que hace auditable la comparación— y que cubren a los 5 del seed.
    expect(OFFICIAL_CHANNEL_CANDIDATES).toHaveLength(5);
    for (const candidate of OFFICIAL_CHANNEL_CANDIDATES) {
      expect(candidate.handle).toMatch(/^[\w.-]+$/);
      expect(candidate.officialDomain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    }
    const artists: string[] = OFFICIAL_CHANNEL_CANDIDATES.map((c: OfficialChannelCandidate) => c.artistName);
    expect([...artists].sort()).toEqual(
      ["Björk", "David Bowie", "Kraftwerk", "Pink Floyd", "Radiohead"].sort(),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.32/H · desambiguación de títulos", () => {
  it("quita el metadato de los bordes y conserva el resto", () => {
    expect(stripVideoDecorations("Another Brick in the Wall (Official Video)")).toBe(
      "Another Brick in the Wall",
    );
    expect(stripVideoDecorations("We Are The Champions | Official Music Video")).toBe(
      "We Are The Champions",
    );
    expect(stripVideoDecorations("Lionsong [HD]")).toBe("Lionsong");
    // No parte por «-» en medio: es un guion de un título real.
    expect(stripVideoDecorations("Spider-Man Across the Spider-Verse")).toBe(
      "Spider-Man Across the Spider-Verse",
    );
  });

  it("NO quita marcas de grabación distinta", () => {
    // «Remastered» dice qué grabación es. Si se quitara, un remaster entraría como
    // si fuera el original.
    expect(stripVideoDecorations("Ashes to Ashes (Remastered 2018)")).toBe(
      "Ashes to Ashes (Remastered 2018)",
    );
  });

  it("ACEPTA el título exacto y RECHAZA el parcial", () => {
    expect(matchOfficialVideoTitle("Lionsong (Official Video)", "Lionsong")).toBe("exacto");
    // Grabación distinta: el catálogo tiene la versión de cuerdas.
    expect(matchOfficialVideoTitle("Lionsong", "Lionsong (Strings)")).toBe("parcial");
    expect(matchOfficialVideoTitle("Stonemilker", "Stonemilker (Strings)")).toBe("parcial");
    expect(matchOfficialVideoTitle("Tour de France", "Tour de France (Version Allemande)")).toBe(
      "parcial",
    );
    expect(matchOfficialVideoTitle("The Model", "Computer Love")).toBe("distinto");
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.32/H · un vídeo de un canal no verificado NO se ofrece", () => {
  it("no resuelve nada con channelId a null aunque el título coincida exacto", async () => {
    const resolution = await resolveOfficialVideo(
      {
        id: "trk-1",
        title: "Lionsong",
        artistName: "Björk",
        currentVideoId: null,
        currentEmbedUrl: null,
      },
      [video({ videoId: "aaaaaaaaaaa", title: "Lionsong" })],
      { channelId: null, verify: verifyOk },
    );

    expect(resolution.chosen).toBeNull();
    expect(resolution.verified).toBeNull();
    expect(resolution.reason).toContain("no superó la verificación");
    expect(buildOfficialVideoUpdate(resolution)).toBeNull();
    expect(selectOfficialVideoUpdates([resolution])).toEqual([]);
  });

  it("no ofrece un vídeo publicado por otro canal, aunque el título cuadre", async () => {
    const resolution = await resolveOfficialVideo(
      {
        id: "trk-1",
        title: "Lionsong",
        artistName: "Björk",
        currentVideoId: null,
        currentEmbedUrl: null,
      },
      [video({ videoId: "aaaaaaaaaaa", title: "Lionsong", videoOwnerChannelId: "UCotroCanal" })],
      { channelId: "UCmXbY_fI0d3xD8lS4eTFq3w", verify: verifyOk },
    );

    expect(resolution.chosen).toBeNull();
    expect(resolution.rejected[0]?.reason).toBe("canal-distinto");
  });

  it("acepta el vídeo del canal verificado, lo verifica por HTTP y lo escribe", async () => {
    const resolution = await resolveOfficialVideo(
      {
        id: "trk-1",
        title: "Another Brick in the Wall, Part 1",
        artistName: "Pink Floyd",
        currentVideoId: null,
        currentEmbedUrl: null,
      },
      [video()],
      { channelId: "UCmXbY_fI0d3xD8lS4eTFq3w", verify: verifyOk },
    );

    expect(resolution.chosen?.videoId).toBe("5qap5aO4i9A");
    expect(resolution.verified?.ok).toBe(true);
    expect(selectOfficialVideoUpdates([resolution])).toEqual([
      {
        id: "trk-1",
        youtube_video_id: "5qap5aO4i9A",
        // La misma forma que las 6 filas del catálogo que ya lo traían.
        video_embed_url: "https://www.youtube.com/watch?v=5qap5aO4i9A",
      },
    ]);
  });

  it("rechaza un título parcial aunque el canal sea el bueno", async () => {
    const resolution = await resolveOfficialVideo(
      {
        id: "trk-1",
        title: "Stonemilker (Strings)",
        artistName: "Björk",
        currentVideoId: null,
        currentEmbedUrl: null,
      },
      [video({ videoId: "aaaaaaaaaaa", title: "Stonemilker" })],
      { channelId: "UCmXbY_fI0d3xD8lS4eTFq3w", verify: verifyOk },
    );

    expect(resolution.chosen).toBeNull();
    expect(resolution.rejected.some((r) => r.reason === "titulo-parcial")).toBe(true);
  });

  it("no escribe si la comprobación HTTP falla", async () => {
    const resolution = await resolveOfficialVideo(
      {
        id: "trk-1",
        title: "Another Brick in the Wall, Part 1",
        artistName: "Pink Floyd",
        currentVideoId: null,
        currentEmbedUrl: null,
      },
      [video()],
      { channelId: "UCmXbY_fI0d3xD8lS4eTFq3w", verify: verifyFail },
    );

    expect(resolution.chosen).toBeNull();
    expect(resolution.httpRejected[0]?.reason).toBe("http-no-verificable");
    expect(selectOfficialVideoUpdates([resolution])).toEqual([]);
  });

  it("no cuenta como cambio una fila que ya tiene lo mismo", async () => {
    const resolution = await resolveOfficialVideo(
      {
        id: "trk-1",
        title: "Another Brick in the Wall, Part 1",
        artistName: "Pink Floyd",
        currentVideoId: "5qap5aO4i9A",
        currentEmbedUrl: "https://www.youtube.com/watch?v=5qap5aO4i9A",
      },
      [video()],
      { channelId: "UCmXbY_fI0d3xD8lS4eTFq3w", verify: verifyOk },
    );

    // El recuento de «filas a escribir» tiene que significar algo.
    expect(selectOfficialVideoUpdates([resolution])).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.32/H · comprobación HTTP sin cuota", () => {
  function stubFetch(map: Record<string, { status: number; body?: unknown }>) {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const key = url.includes("/oembed") ? "oembed" : "embed";
      const entry = map[key];
      if (!entry) throw new Error(`sin doble para ${url}`);
      return {
        ok: entry.status >= 200 && entry.status < 300,
        status: entry.status,
        json: async () => entry.body ?? {},
        headers: new Headers(),
      } as unknown as Response;
    });
    return fetcher as unknown as typeof fetch;
  }

  it("aprueba cuando oEmbed y la página de embed responden bien", async () => {
    const probe = await probeOfficialVideo(
      "5qap5aO4i9A",
      stubFetch({ oembed: { status: 200, body: { title: "Another Brick" } }, embed: { status: 200 } }),
    );
    expect(probe.ok).toBe(true);
    if (probe.ok) expect(probe.oembedTitle).toBe("Another Brick");
  });

  it("rechaza cuando oEmbed responde 404, aunque /watch devuelva 200", async () => {
    // Un GET a /watch?v=… devuelve 200 para un vídeo borrado: YouTube sirve la
    // página de «no disponible». Por eso no se sirve de ese 200.
    const probe = await probeOfficialVideo("5qap5aO4i9A", stubFetch({ oembed: { status: 404 } }));
    expect(probe.ok).toBe(false);
    if (!probe.ok) expect(probe.detail).toContain("404");
  });

  it("rechaza un id con forma inválida sin gastar una petición", async () => {
    const fetcher = stubFetch({ oembed: { status: 200 } });
    const probe = await probeOfficialVideo("corto", fetcher);
    expect(probe.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.32/H · capítulos reales, no los inventados del seed", () => {
  const chapters = [
    { title: "Intro", startTime: 0, endTime: 30 },
    { title: "Family", startTime: 30, endTime: 260 },
    { title: "Lionsong", startTime: 260, endTime: 554 },
  ];

  it("devuelve el tramo del capítulo cuyo título coincide exacto", () => {
    const timing = deriveChapterTiming(chapters, "Lionsong", 900);
    expect(timing).toEqual({ startTime: 260, endTime: 554 });
  });

  it("devuelve null si no hay capítulo con el título exacto", () => {
    // «Lionsong (Strings)» es el nombre del catálogo; el capítulo real se llama
    // «Lionsong». Es otra grabación: no se inventa el tramo.
    expect(deriveChapterTiming(chapters, "Lionsong (Strings)", 900)).toBeNull();
  });

  it("devuelve null sin capítulos o sin duración válida", () => {
    expect(deriveChapterTiming([], "Lionsong", 900)).toBeNull();
    expect(deriveChapterTiming(chapters, "Lionsong", 0)).toBeNull();
    // Un capítulo que se pasa de la duración del vídeo no es de fiar.
    expect(deriveChapterTiming(chapters, "Lionsong", 300)).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.32/H · política de embed (Made For Kids)", () => {
  it("detecta el flag Made For Kids que exige la política de YouTube", () => {
    expect(needsMadeForKidsDisclosure({ madeForKids: true })).toBe(true);
    expect(needsMadeForKidsDisclosure({ selfDeclaredMadeForKids: true })).toBe(true);
    expect(needsMadeForKidsDisclosure({ madeForKids: false })).toBe(false);
    // `null` = YouTube no lo mandó. No es lo mismo que `false`, y no se inventa.
    expect(needsMadeForKidsDisclosure({ madeForKids: null })).toBe(false);
  });

  it("bloquea el embed si YouTube dice que no se puede o es privado", () => {
    expect(isVideoEmbedAllowed({ embeddable: false, privacyStatus: "public" })).toBe(false);
    expect(isVideoEmbedAllowed({ embeddable: true, privacyStatus: "private" })).toBe(false);
    expect(isVideoEmbedAllowed({ embeddable: true, privacyStatus: "public" })).toBe(true);
    expect(isVideoEmbedAllowed({})).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.32/H · /api/youtube pide part=status y expone el dato", () => {
  afterEach(() => {
    delete process.env.YOUTUBE_API_KEY;
  });

  async function callRoute() {
    vi.resetModules();
    process.env.YOUTUBE_API_KEY = "clave-de-prueba";
    const { GET } = await import("@/app/api/youtube/route");
    const req = new NextRequest("http://localhost/api/youtube?id=5qap5aO4i9A");
    return GET(req);
  }

  it("pide `status` y devuelve embeddable, privacyStatus y madeForKids", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "5qap5aO4i9A",
              snippet: { title: "Another Brick in the Wall", description: "" },
              contentDetails: { duration: "PT3M59S" },
              statistics: { viewCount: "1", likeCount: "1" },
              status: {
                privacyStatus: "public",
                embeddable: true,
                license: "youtube",
                publicStatsViewable: true,
                madeForKids: true,
                selfDeclaredMadeForKids: false,
              },
            },
          ],
        }),
      } as unknown as Response;
    });

    const res = await callRoute();
    expect(res.status).toBe(200);

    // La parte que faltaba: sin `part=status` no hay forma de leer estos campos.
    const url = seen[0] ?? "";
    expect(url).toContain("part=snippet,contentDetails,statistics,topicDetails,status");

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.embeddable).toBe(true);
    expect(body.privacyStatus).toBe("public");
    expect(body.madeForKids).toBe(true);
    expect(body.selfDeclaredMadeForKids).toBe(false);
    expect(body.embedAllowed).toBe(true);
    expect(body.madeForKidsDisclosureRequired).toBe(true);
  });

  it("no inventa `madeForKids: false` cuando `part=status` no viene", async () => {
    vi.stubGlobal("fetch", async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ id: "5qap5aO4i9A", snippet: { title: "x", description: "" } }],
        }),
      } as unknown as Response;
    });

    const res = await callRoute();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.madeForKids).toBeNull();
    expect(body.madeForKidsDisclosureRequired).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.32/H · la cuota se cuenta y se imprime", () => {
  it("acumula las unidades de cada método y deja ver que search cuesta 100", () => {
    const meter = createQuotaMeter();
    meter.charge("channels", "@pinkfloyd");
    meter.charge("playlistItems", "UU… pág 1");
    meter.charge("playlistItems", "UU… pág 2");
    expect(meter.calls).toBe(3);
    expect(meter.spent).toBe(3);

    // El motivo de no usar search es exactamente este número.
    expect(YOUTUBE_QUOTA_COST.channels).toBe(1);
    expect(YOUTUBE_QUOTA_COST.playlistItems).toBe(1);
    expect(YOUTUBE_QUOTA_COST.search).toBe(100);
  });

  it("parseISO8601Duration sigue funcionando (lo usa el script para las duraciones)", () => {
    expect(parseISO8601Duration("PT3M59S")).toBe(239);
    expect(parseISO8601Duration("PT1H2M3S")).toBe(3723);
  });
});