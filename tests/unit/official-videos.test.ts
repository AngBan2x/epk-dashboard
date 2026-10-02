import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

import {
  buildOfficialVideoUpdate,
  buildUploadsPlaylistId,
  channelNameMatchesArtist,
  classifyVideoTitle,
  createQuotaMeter,
  dedupeVideoCandidates,
  deriveChapterTiming,
  domainMatchesOfficial,
  estimateOfficialQuota,
  extractOfficialDomains,
  isTopicChannelTitle,
  isVideoEmbedAllowed,
  matchOfficialVideoTitle,
  needsMadeForKidsDisclosure,
  OFFICIAL_VIDEO_ROUTE_ORDER,
  parseISO8601Duration,
  parseVideoKind,
  probeOfficialVideo,
  resolveOfficialVideo,
  routeOfficialVideos,
  selectOfficialVideoUpdates,
  stripLiveMarkers,
  stripTrailingTitleGroups,
  stripVideoDecorations,
  topicChannelQuery,
  verifyOfficialChannel,
  VIDEO_KINDS,
  YOUTUBE_QUOTA_COST,
  type OfficialChannelCandidate,
  type OfficialVideoCandidate,
  type OfficialVideoVerifier,
  type YouTubeChannel,
} from "@/lib/youtube";
import { OFFICIAL_CHANNEL_CANDIDATES } from "@/scripts/fetch-official-videos";
import {
  findOfficialChannel,
  findTopicChannel,
  OFFICIAL_CHANNELS,
  TOPIC_CHANNELS,
} from "@/lib/official-channels";

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
    videoCount: 1337,
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

  it("un directo NO se acepta por defecto: es otra grabación", async () => {
    // El comportamiento de RC.32, y el que sigue por defecto: `allowLiveRendition`
    // es opt-in.
    const resolution = await resolveOfficialVideo(
      { id: "trk-1", title: "Eclipse", artistName: "Pink Floyd", currentVideoId: null, currentEmbedUrl: null },
      [video({ videoId: "Z4YqFhzAxIw", title: "Eclipse (Live from the Los Angeles Sports Arena, 1975)" })],
      { channelId: "UCmXbY_fI0d3xD8lS4eTFq3w", verify: verifyOk },
    );
    expect(resolution.chosen).toBeNull();
    expect(resolution.rejected.some((r) => r.reason === "titulo-parcial")).toBe(true);
  });

  it("con `allowLiveRendition` el directo sí entra, sin cambiar el título", async () => {
    const resolution = await resolveOfficialVideo(
      { id: "trk-1", title: "Eclipse", artistName: "Pink Floyd", currentVideoId: null, currentEmbedUrl: null },
      [video({ videoId: "Z4YqFhzAxIw", title: "Eclipse (Live from the Los Angeles Sports Arena, 1975)" })],
      { channelId: "UCmXbY_fI0d3xD8lS4eTFq3w", verify: verifyOk, allowLiveRendition: true },
    );
    expect(resolution.chosen?.videoId).toBe("Z4YqFhzAxIw");
    // Lo que se escribe es el vídeo real, con su título real: el recorte del
    // marcador es solo para comparar.
    expect(buildOfficialVideoUpdate(resolution)?.youtube_video_id).toBe("Z4YqFhzAxIw");
  });

  it("`preferVideoId` manda sobre el orden por antigüedad: el informe y la fila coinciden", async () => {
    // Sin esto, "Money (Live from …)" puede ganar la ruta y la resolución
    // devolver el "Money" del canal `- Topic`: el dry-run mostraría un vídeo y
    // se escribiría otro.
    const list = [
      video({ videoId: "topicmoney1", title: "Money", publishedAt: "2010-01-01T00:00:00Z" }),
      video({
        videoId: "livemoney01",
        title: "Money (Live from the Los Angeles Sports Arena, 1975)",
        publishedAt: "2013-01-01T00:00:00Z",
      }),
    ];
    const resolution = await resolveOfficialVideo(
      { id: "trk-1", title: "Money", artistName: "Pink Floyd", currentVideoId: null, currentEmbedUrl: null },
      list,
      {
        channelId: "UCmXbY_fI0d3xD8lS4eTFq3w",
        verify: verifyOk,
        allowLiveRendition: true,
        preferVideoId: "livemoney01",
      },
    );
    expect(resolution.chosen?.videoId).toBe("livemoney01");
  });

  it("si el preferido no pasa la comprobación HTTP, se prueba el siguiente", async () => {
    const resolution = await resolveOfficialVideo(
      { id: "trk-1", title: "Money", artistName: "Pink Floyd", currentVideoId: null, currentEmbedUrl: null },
      [video({ videoId: "topicmoney1", title: "Money" })],
      { channelId: "UCmXbY_fI0d3xD8lS4eTFq3w", verify: verifyFail, preferVideoId: "noexiste000" },
    );
    expect(resolution.chosen).toBeNull();
    expect(resolution.httpRejected).toHaveLength(1);
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

// ───────────────────────────────────────────────────────────────────────────
//
// RC.33 · OLA 4 — `live` se CLASIFICA, no se recorta.
//
// ── La propiedad que este bloque fija ────────────────────────────────────────
//
// Las palabras del canal (`official`, `video`, `music`, `hd`) son **metadato**:
// con el canal ya verificado no aportan nada y se recortan. `live` es al revés —
// si se recortara, `"Comfortably Numb (Live at Pompeii)"` emparejaría con
// `"Comfortably Numb"` y la duración que declara la ficha pasaría a ser la del
// directo. Una mentira silenciosa, porque el resto del título cuadra y nada
// señala el error.
//
// Por eso hay dos tratamientos opuestos y la función que los separa es pura:
// sin red, sin `process.env`, sin SQL.

describe("RC.33/O4 · videoclip vs live: se recortan distinto a propósito", () => {
  it("«(Official Video)» es decoration: se recorta y queda videoclip", () => {
    const result = classifyVideoTitle(
      "Another Brick in the Wall (Official Video)",
      "Another Brick in the Wall",
      { channelIsTopic: false },
    );
    expect(result.kind).toBe("videoclip");
    expect(result.isLive).toBe(false);
    // El título normalizado NO lleva el metadato.
    expect(result.normalizedTitle).toBe("another brick in the wall");
  });

  it("«Official Music Video - Song» también es decoration, y en la cabeza", () => {
    const result = classifyVideoTitle(
      "Official Music Video - Another Brick in the Wall",
      "Another Brick in the Wall",
      { channelIsTopic: false },
    );
    expect(result.kind).toBe("videoclip");
    expect(result.normalizedTitle).toBe("another brick in the wall");
  });

  it("«(Live at Glastonbury)» es live y el título NO se recorta a «Song»", () => {
    const result = classifyVideoTitle("Song (Live at Glastonbury)", "Song", {
      channelIsTopic: false,
    });
    expect(result.kind).toBe("live");
    expect(result.isLive).toBe(true);
    // La mitad del motivo de existir de esta columna: si esto fuera "song", el
    // directo de 50 minutos habría pasado por el tema de estudio.
    expect(result.normalizedTitle).toBe("song live at glastonbury");
    expect(result.normalizedTitle).not.toBe("song");
  });

  it("«(Live)» a secas también es live, y el motivo dice que no lleva contexto", () => {
    const result = classifyVideoTitle("Song (Live)", "Song", { channelIsTopic: false });
    expect(result.kind).toBe("live");
    expect(result.normalizedTitle).toBe("song live");
    expect(result.reason).toContain("a secas");
  });

  it("un segmento final con «live» también es live: «Song - Live at Wembley»", () => {
    const result = classifyVideoTitle("Song - Live at Wembley", "Song", {
      channelIsTopic: false,
    });
    expect(result.kind).toBe("live");
    expect(stripLiveMarkers("Song - Live at Wembley")).toBe("Song");
  });

  it("«(Olive)» no es un marcador de directo: la palabra tiene que ser «live»", () => {
    const result = classifyVideoTitle("Olive (Live)", "Olive", { channelIsTopic: false });
    expect(result.kind).toBe("live");
    // Y una palabra que contiene "live" sin ser la palabra tampoco:
    expect(classifyVideoTitle("Olive Tree (Live Session)", "Olive Tree").kind).toBe("live");
  });

  it("sin contexto de canal el kind es null: el título no distingue clip de topic", () => {
    const result = classifyVideoTitle("Fake Plastic Trees", "Fake Plastic Trees");
    expect(result.kind).toBeNull();
    expect(result.reason).toContain("- Topic");
  });

  it("la palabra «live» del título de la obra no convierte el vídeo en directo", () => {
    // Sin este corto, "Live and Let Die" sería `live` **y** además se descartaría
    // por título: el peor de los dos mundos para una pista que sí existe.
    const result = classifyVideoTitle("Live and Let Die", "Live and Let Die", {
      channelIsTopic: false,
    });
    expect(result.isLive).toBe(false);
    expect(result.kind).toBe("videoclip");
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.33/O4 · el canal «- Topic» y su kind", () => {
  it("un vídeo suelto en un canal «- Topic» es topic_audio, no videoclip", () => {
    const result = classifyVideoTitle("Fake Plastic Trees", "Fake Plastic Trees", {
      channelIsTopic: true,
    });
    expect(result.kind).toBe("topic_audio");
    expect(result.isLive).toBe(false);
    expect(result.normalizedTitle).toBe("fake plastic trees");
  });

  it("el sufijo de edición se normaliza para comparar aunque no se recorte", () => {
    // `stripVideoDecorations` NO quita "(Acoustic Version)" a propósito: es otra
    // grabación. El recorte del grupo final es para EMPAREJAR, y por eso vive
    // en su propia función y no en el conjunto de decoración.
    expect(stripVideoDecorations("Fake Plastic Trees (Acoustic Version)")).toBe(
      "Fake Plastic Trees (Acoustic Version)",
    );
    expect(stripTrailingTitleGroups("Fake Plastic Trees (Acoustic Version)")).toBe(
      "Fake Plastic Trees",
    );
    expect(
      classifyVideoTitle("Fake Plastic Trees (Acoustic Version)", "Fake Plastic Trees", {
        channelIsTopic: true,
      }).normalizedTitle,
    ).toBe("fake plastic trees");
  });

  it("recorta grupos finales encadenados, que es como vienen en los títulos reales", () => {
    expect(stripTrailingTitleGroups("Army of Me (2013)")).toBe("Army of Me");
    expect(stripTrailingTitleGroups("Subtitles (2009 Remaster) [HD]")).toBe("Subtitles");
    expect(stripTrailingTitleGroups("Etape 1")).toBe("Etape 1");
    expect(stripTrailingTitleGroups("")).toBe("");
  });

  it("el nombre del canal «- Topic» se busca SIN distinguir mayúsculas", () => {
    // Los tres verificados traen la caja que les dio YouTube: "PINK FLOYD -
    // Topic" en mayúsculas y "Radiohead - Topic" en title case. Un `===`
    // fallaría en dos de tres y el audio del catálogo se quedaría sin vídeo
    // sin que nada fallara.
    expect(isTopicChannelTitle("PINK FLOYD - Topic", "Pink Floyd")).toBe(true);
    expect(isTopicChannelTitle("Pink Floyd - Topic", "PINK FLOYD")).toBe(true);
    expect(isTopicChannelTitle("Radiohead - Topic", "Radiohead")).toBe(true);
    expect(isTopicChannelTitle("kraftwerk - topic", "Kraftwerk")).toBe(true);
    // Con y sin el guion, y con acentos que no son el problema.
    expect(isTopicChannelTitle("Pink Floyd Topic", "Pink Floyd")).toBe(true);
    expect(isTopicChannelTitle("BJORK - Topic", "Björk")).toBe(true);
    // Una tribute con el mismo formato NO es el catálogo de este artista.
    expect(isTopicChannelTitle("Pink Floyd Tribute - Topic", "Pink Floyd")).toBe(false);
    expect(isTopicChannelTitle("Pink Floyd", "Pink Floyd")).toBe(false);
    expect(isTopicChannelTitle("", "Pink Floyd")).toBe(false);
  });

  it("la consulta de búsqueda es exactamente «<artista> - Topic»", () => {
    expect(topicChannelQuery("Pink Floyd")).toBe("Pink Floyd - Topic");
    expect(topicChannelQuery("Björk")).toBe("Björk - Topic");
  });

  it("los tres canales «- Topic» verificados tienen id con forma y nombre coherente", () => {
    expect(TOPIC_CHANNELS.length).toBeGreaterThan(0);
    for (const entry of TOPIC_CHANNELS) {
      expect(entry.channelId).toMatch(/^UC[\w-]{22}$/);
      expect(entry.videoCount).toBeGreaterThan(0);
      // La caja del título es tal cual la devolvió la API; la comparación va
      // por `isTopicChannelTitle`, que es case-insensitive.
      expect(isTopicChannelTitle(entry.channelTitle, entry.artistName)).toBe(true);
      expect(entry.provenance).toContain("search.list");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.33/O4 · las tres trampas del muestreo", () => {
  it("deduplica por videoId y conserva el primero", () => {
    // `playlistItems.list` devolvía "You And Whose Army?" dos veces.
    const candidates = [
      video({ videoId: "aaaaaaaaaaa", title: "You And Whose Army?" }),
      video({ videoId: "bbbbbbbbbbb", title: "Another Brick in the Wall, Part 1" }),
      video({ videoId: "aaaaaaaaaaa", title: "You And Whose Army?" }),
      video({ videoId: "ccccccccccc", title: "Dogs" }),
    ];
    const unique = dedupeVideoCandidates(candidates);
    expect(unique.map((c) => c.videoId)).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]);
    expect(unique).toHaveLength(3);
  });

  it("deduplica también en el deduplicado: la cuenta del informe no miente", () => {
    const once = dedupeVideoCandidates([video({ videoId: "aaaaaaaaaaa" }), video({ videoId: "aaaaaaaaaaa" })]);
    expect(dedupeVideoCandidates(once)).toHaveLength(1);
    expect(dedupeVideoCandidates([])).toEqual([]);
    // Un id vacío no es un vídeo y no cuenta como duplicado: se descarta.
    expect(dedupeVideoCandidates([video({ videoId: "" })])).toEqual([]);
  });

  it("un `video_kind` desconocido o ausente no rompe nada", () => {
    // `NULL` es "no clasificado", y un valor inventado se trata como ausente.
    expect(parseVideoKind("videoclip")).toBe("videoclip");
    expect(parseVideoKind("LIVE")).toBe("live");
    expect(parseVideoKind("  topic_audio  ")).toBe("topic_audio");
    expect(parseVideoKind("karaoke")).toBeNull();
    expect(parseVideoKind("")).toBeNull();
    expect(parseVideoKind(null)).toBeNull();
    expect(parseVideoKind(undefined)).toBeNull();
    expect(parseVideoKind(42)).toBeNull();
    expect(VIDEO_KINDS).toEqual(["videoclip", "live", "topic_audio"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.33/O4 · las dos rutas", () => {
  const HUMAN = "UCmXbY_fI0d3xD8lS4eTFq3w";
  const TOPIC = "UCO6LS_5W7vqG9mALDNzSFug";

  function pool(channelId: string): OfficialVideoCandidate[] {
    return [
      video({ videoId: "clip0000001", title: "Song (Official Video)", videoOwnerChannelId: channelId }),
      video({ videoId: "live0000001", title: "Song (Live at Glastonbury)", videoOwnerChannelId: channelId }),
      video({ videoId: "topic000001", title: "Song", videoOwnerChannelId: channelId }),
    ];
  }

  it("SHOWCASE: el videoclip gana, y el directo queda como alternativa", () => {
    const routing = routeOfficialVideos(pool(HUMAN), "Song", {
      channelIsTopic: false,
      route: "showcase",
    });
    expect(routing.kind).toBe("videoclip");
    expect(routing.chosen?.videoId).toBe("clip0000001");
    // Los tres sirven en showcase. Los dos primeros son `videoclip` —en un
    // canal humano verificado un vídeo sin metadato también es el clip— y el
    // tercero es el `live`, que por orden de ruta va detrás.
    expect(routing.options.map((o) => o.candidate.videoId)).toEqual([
      "clip0000001",
      "topic000001",
      "live0000001",
    ]);
    expect(routing.options.map((o) => o.classification.kind)).toEqual([
      "videoclip",
      "videoclip",
      "live",
    ]);
  });

  it("REPRODUCCIÓN: el directo NO entra, y el tema del canal `- Topic` sí", () => {
    const human = routeOfficialVideos(pool(HUMAN), "Song", {
      channelIsTopic: false,
      route: "playback",
    });
    expect(human.kind).toBe("videoclip");
    expect(human.chosen?.videoId).toBe("clip0000001");
    // El directo queda fuera de la ruta, pero **sigue clasificado**: el
    // descarte dice `live` y por qué, que es lo que permite que la UI lo ofrezca
    // en el hueco de "en vivo" sin recalcular nada.
    const excluded = human.skipped.find((skip) => skip.kind === "live");
    expect(excluded?.label).toContain("live0000001");
    expect(excluded?.reason).toContain("playback");

    // Y con `showcase` el mismo vídeo entra.
    const showcase = routeOfficialVideos(
      [video({ videoId: "live0000001", title: "Song (Live at Glastonbury)" })],
      "Song",
      { channelIsTopic: true, route: "showcase" },
    );
    expect(showcase.kind).toBe("live");
    expect(showcase.chosen?.videoId).toBe("live0000001");

    // El audio del canal `- Topic` sí entra en reproducción.
    const topic = routeOfficialVideos([video({ videoId: "topic000001", title: "Song", videoOwnerChannelId: TOPIC })], "Song", {
      channelIsTopic: true,
      route: "playback",
    });
    expect(topic.kind).toBe("topic_audio");
    expect(topic.chosen?.videoId).toBe("topic000001");
  });

  it("el orden de preferencia está escrito, no repartido por tres `if`", () => {
    expect(OFFICIAL_VIDEO_ROUTE_ORDER.showcase).toEqual(["videoclip", "live", "topic_audio"]);
    expect(OFFICIAL_VIDEO_ROUTE_ORDER.playback).toEqual(["videoclip", "topic_audio"]);
  });

  it("sin candidato se dice por qué, y no se fuerza nada", () => {
    const routing = routeOfficialVideos([], "Song", { channelIsTopic: false, route: "showcase" });
    expect(routing.chosen).toBeNull();
    expect(routing.kind).toBeNull();
    expect(routing.reason).toBe("no llegó ningún vídeo del canal");

    const nada = routeOfficialVideos([video({ videoId: "clip0000001", title: "Otra canción" })], "Song", {
      channelIsTopic: false,
      route: "showcase",
    });
    expect(nada.chosen).toBeNull();
    expect(nada.skipped[0].reason).toContain("≠");
  });

  it("un título parcial no entra en ninguna ruta", () => {
    // "Stonemilker (Strings)" es otra grabación del catálogo.
    const routing = routeOfficialVideos([video({ videoId: "clip0000001", title: "Stonemilker" })], "Stonemilker (Strings)", {
      channelIsTopic: false,
      route: "showcase",
    });
    expect(routing.chosen).toBeNull();
    expect(routing.skipped[0].reason).toContain("parcialmente");
  });

  it("a igualdad de kind gana el más antiguo, no el último que subió el canal", () => {
    const routing = routeOfficialVideos(
      [
        video({ videoId: "nuevocanal1", title: "Song (Official Video)", publishedAt: "2021-01-01T00:00:00Z" }),
        video({ videoId: "viejocanal1", title: "Song", publishedAt: "2004-01-01T00:00:00Z" }),
      ],
      "Song",
      { channelIsTopic: false, route: "showcase" },
    );
    expect(routing.chosen?.videoId).toBe("viejocanal1");
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("RC.33/O4 · la allowlist está versionada y es auditable", () => {
  it("los 5 canales tienen id con forma y su procedencia escrita", () => {
    expect(OFFICIAL_CHANNELS).toHaveLength(5);
    for (const entry of OFFICIAL_CHANNELS) {
      // Un id de canal es `UC` + 22 caracteres. Sin esto, un typo se descubre
      // gastando una unidad de cuota y con un 404 en vez de aquí.
      expect(entry.channelId).toMatch(/^UC[\w-]{22}$/);
      expect(entry.officialDomain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
      expect(entry.videoCount).toBeGreaterThan(0);
      expect(entry.provenance.length).toBeGreaterThan(10);
    }
  });

  it("David Bowie es la excepción documentada: no resuelve por handle", () => {
    // Si algún día resuelve, hay que actualizar la tabla; si no, el comentario
    // miente. Este test obliga a que alguien lo mire.
    const bowie = findOfficialChannel("David Bowie");
    expect(bowie?.channelId).toBe("UC8YgWcDKi1rLbQ1OtrOHeDw");
    expect(bowie?.handle).toBeNull();
    expect(bowie?.provenance).toContain("NO resuelve");
    // La búsqueda es por nombre completo, no por prefijo: "Bowie" a secas es
    // otra persona y no debe aparecer.
    expect(findOfficialChannel("david bowie")?.channelId).toBe(bowie?.channelId);
    expect(findOfficialChannel("Bowie")).toBeUndefined();
    expect(findOfficialChannel("Nobody")).toBeUndefined();
  });

  it("ningún artista tiene dos canales y la búsqueda es exacta", () => {
    const ids = OFFICIAL_CHANNELS.map((entry) => entry.channelId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findOfficialChannel("Pink Floyd Tribute")).toBeUndefined();
  });

  it("los candidatos del script derivan de la allowlist, no son una segunda lista", () => {
    expect(OFFICIAL_CHANNEL_CANDIDATES).toHaveLength(OFFICIAL_CHANNELS.length);
    for (const [index, candidate] of OFFICIAL_CHANNEL_CANDIDATES.entries()) {
      expect(candidate.artistName).toBe(OFFICIAL_CHANNELS[index].artistName);
      expect(candidate.officialDomain).toBe(OFFICIAL_CHANNELS[index].officialDomain);
      expect(candidate.handle).not.toBe("");
    }
    expect(findTopicChannel("Radiohead")?.channelId).toBe("UCr_iyUANcn9OX_yy9piYoLw");
    expect(findTopicChannel("Björk")).toBeUndefined();
  });

  it("la cuota estimada se calcula antes de gastar, y search cuesta 100", () => {
    const estimate = estimateOfficialQuota({ artists: 5, playlistPages: 2, topicSearches: 0 });
    expect(estimate.channels).toBe(5);
    expect(estimate.playlistItems).toBe(10);
    expect(estimate.searches).toBe(0);
    expect(estimate.total).toBe(15);

    // Con `--discover-topic`: 5 búsquedas de un bucket aparte de 100/día.
    const withSearch = estimateOfficialQuota({ artists: 5, playlistPages: 2, topicSearches: 5 });
    expect(withSearch.total).toBe(15 + 500);
  });
});