import { describe, it, expect } from "vitest";
import {
  AUDIO_SOURCE_PRIORITY,
  CORS_VERIFIED_AUDIO_HOSTS,
  advanceQueue,
  createQueue,
  getAudioSources,
  getPlayableAudioSource,
  getPrimaryAudioSource,
  hasNextInQueue,
  hasPlayableSource,
  hasPrevInQueue,
  isQueueItemPlayable,
  isUsableAudioUrl,
  nextQueueIndex,
  prevQueueIndex,
  queuePositionLabel,
  reindexQueue,
  shouldUseCrossOrigin,
  type QueueTrack,
} from "@/lib/audio-priority";
import { parseDurationToSeconds, sumDurations } from "@/lib/null-safe";

// URLs reales del catálogo (scripts/seed-f9-catalog.ts)
const APPLE_PREVIEW =
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/a7/d7/1f/a7d71f16-1b4b-4c80-9e32-c5ef7862c86d/mzaf_14085285085985977537.plus.aac.p.m4a";
const SPOTIFY_TRACK = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT";
const APPLE_SONG = "https://music.apple.com/us/song/1440857781/daft-punk";
const APPLE_ALBUM = "https://music.apple.com/us/album/697194953/around-the-world/1440857781";

function queue(...ids: string[]): QueueTrack[] {
  return ids.map((id) => ({ id, audioUrl: `${APPLE_PREVIEW}#${id}` }));
}

describe("P2 cola de audio — precedencia de fuentes", () => {
  it("ordena preview (100) > spotify/apple (90) > youtube (50)", () => {
    const sources = getAudioSources({
      audio_preview_url: APPLE_PREVIEW,
      spotify_url: SPOTIFY_TRACK,
      apple_music_url: APPLE_SONG,
      youtube_video_id: "dQw4w9WgXcQ",
    });

    expect(sources.map((s) => s.type)).toEqual(["preview", "spotify", "apple_music", "youtube"]);
    expect(AUDIO_SOURCE_PRIORITY.preview).toBeGreaterThan(AUDIO_SOURCE_PRIORITY.spotify);
    expect(AUDIO_SOURCE_PRIORITY.apple_music).toBeGreaterThan(AUDIO_SOURCE_PRIORITY.youtube);
    expect(getPrimaryAudioSource({ audio_preview_url: APPLE_PREVIEW, spotify_url: SPOTIFY_TRACK })?.type).toBe("preview");
  });

  it("desempata el 90 de Spotify y Apple Music por orden de inserción, no por el motor", () => {
    const sources = getAudioSources({ spotify_url: SPOTIFY_TRACK, apple_music_url: APPLE_SONG });
    expect(sources.map((s) => s.type)).toEqual(["spotify", "apple_music"]);
    // Y al revés también: si solo hay Apple, no se inventa un Spotify delante.
    expect(getAudioSources({ apple_music_url: APPLE_SONG }).map((s) => s.type)).toEqual(["apple_music"]);
  });

  it("extrae el mismo id de Spotify y de Apple Music que antes solo aceptaba una de las dos regex", () => {
    // Apple: `song/` y `album/.../<id>`. Antes audio-priority solo aceptaba `song/`
    // y el id era 22 chars exactos en Spotify; las dos divergían con lib/youtube.ts.
    const album = getAudioSources({ apple_music_url: APPLE_ALBUM })[0];
    expect(album?.type).toBe("apple_music");
    expect(album?.url).toBe(APPLE_ALBUM);

    const spotify = getAudioSources({ spotify_url: SPOTIFY_TRACK })[0];
    expect(spotify?.embedUrl).toContain("4cOdK2wGLETKBW3PvgPWqT");

    // Y desde `external_links`, que es donde viven algunos tracks del seed.
    const external = getAudioSources({ external_links: { spotify: SPOTIFY_TRACK } });
    expect(external.map((s) => s.type)).toEqual(["spotify"]);
  });

  describe('el hueco de "—" (safeString lo vuelve truthy)', () => {
    it('trata "" , "-" y "—" como ausencia de preview, no como URL', () => {
      for (const token of ["", "   ", "-", "—", null, undefined]) {
        expect(isUsableAudioUrl(token)).toBe(false);
        expect(getAudioSources({ audio_preview_url: token as string }).map((s) => s.type)).toEqual([]);
      }
    });

    it('una pista cuyo preview es "—" no tiene fuente reproducible', () => {
      // Esto es lo que hacía que la tarjeta dijera "Reproducir" en vez de
      // "No hay audio disponible".
      const track = { audio_preview_url: "—", spotify_url: SPOTIFY_TRACK };
      expect(getAudioSources(track).map((s) => s.type)).toEqual(["spotify"]);
      expect(hasPlayableSource(track)).toBe(false);
    });

    it("Spotify/Apple sin preview ni YouTube no habilitan el play (no hay embed que renderizar)", () => {
      expect(hasPlayableSource({ spotify_url: SPOTIFY_TRACK, apple_music_url: APPLE_SONG })).toBe(false);
      expect(hasPlayableSource({ youtube_video_id: "dQw4w9WgXcQ" })).toBe(true);
      expect(hasPlayableSource({ audio_preview_url: APPLE_PREVIEW })).toBe(true);
      expect(hasPlayableSource(null)).toBe(false);
      expect(hasPlayableSource(undefined)).toBe(false);
      expect(getPlayableAudioSource({ spotify_url: SPOTIFY_TRACK })).toBeNull();
    });

    it("rechaza basura que no es una URL", () => {
      for (const junk of ["Reproducir", "no disponible", "spotify:track:abc", "ver en YouTube"]) {
        expect(isUsableAudioUrl(junk)).toBe(false);
      }
    });
  });
});

describe("P2 cola de audio — crossOrigin condicional (medido)", () => {
  it("lo activa para los hosts que se midieron con Access-Control-Allow-Origin", () => {
    // Medición 2026-09-30: audio-ssl.itunes.apple.com -> 200 + `ACAO: *`.
    expect(CORS_VERIFIED_AUDIO_HOSTS).toContain("audio-ssl.itunes.apple.com");
    expect(shouldUseCrossOrigin(APPLE_PREVIEW)).toBe(true);
  });

  it("lo activa en lo mismo-origen y en assets locales", () => {
    expect(shouldUseCrossOrigin("/uploads/demo.mp3")).toBe(true);
    expect(shouldUseCrossOrigin("blob:https://epk-dashboard.vercel.app/1234")).toBe(true);
  });

  it("lo omite para terceros sin medir: preferimos audio sin visualizador", () => {
    expect(shouldUseCrossOrigin("https://cdn.desconocido.example/preview.m4a")).toBe(false);
    expect(shouldUseCrossOrigin("https://example.com/x.mp3")).toBe(false);
    expect(shouldUseCrossOrigin("")).toBe(false);
    expect(shouldUseCrossOrigin(null)).toBe(false);
  });

  it("un host de la allowlist dentro de una URL rara no cuela", () => {
    expect(shouldUseCrossOrigin("https://audio-ssl.itunes.apple.com.evil.example/x.m4a")).toBe(false);
  });
});

describe("P2 cola de audio — playQueue", () => {
  it("arranca en el índice pedido", () => {
    const state = createQueue(queue("a", "b", "c"), 1);
    expect(state?.index).toBe(1);
    expect(state?.items[state!.index].id).toBe("b");
    expect(queuePositionLabel(state)).toBe("2/3");
  });

  it("recorta índices fuera de rango y cae en el primero reproducible", () => {
    expect(createQueue(queue("a", "b"), 99)?.index).toBe(1);
    expect(createQueue(queue("a", "b"), -5)?.index).toBe(0);
    expect(createQueue(queue("a", "b"), Number.NaN)?.index).toBe(0);
  });

  it("si lo pedido no es reproducible, salta a la siguiente que sí lo sea", () => {
    const items: QueueTrack[] = [
      { id: "a", audioUrl: APPLE_PREVIEW },
      { id: "muda", audioUrl: "" },
      { id: "b", audioUrl: APPLE_PREVIEW },
    ];
    const state = createQueue(items, 1);
    expect(state?.index).toBe(2);
  });

  it("devuelve null si no hay nada reproducible: playQueue no debe tocar la reproducción", () => {
    expect(createQueue([], 0)).toBeNull();
    expect(createQueue([{ id: "x", audioUrl: "—" }, { id: "y" }], 0)).toBeNull();
    // YouTube sin videoId tampoco cuenta.
    expect(isQueueItemPlayable({ id: "z", audioUrl: APPLE_PREVIEW, isYouTube: true })).toBe(false);
    expect(isQueueItemPlayable({ id: "z", isYouTube: true, youtubeVideoId: "abc" })).toBe(true);
  });
});

describe("P2 cola de audio — next/prev y bordes", () => {
  it("avanza y retrocede dentro de la cola", () => {
    const state = createQueue(queue("a", "b", "c"), 0)!;
    expect(nextQueueIndex(state)).toBe(1);
    expect(prevQueueIndex(createQueue(queue("a", "b", "c"), 2)!)).toBe(1);
  });

  it("se detiene en los bordes: en el final no hay siguiente, en el inicio no hay anterior", () => {
    const last = createQueue(queue("a", "b"), 1)!;
    expect(nextQueueIndex(last)).toBe(1);
    expect(hasNextInQueue(last)).toBe(false);
    expect(hasPrevInQueue(last)).toBe(true);

    const first = createQueue(queue("a", "b"), 0)!;
    expect(prevQueueIndex(first)).toBe(0);
    expect(hasPrevInQueue(first)).toBe(false);
    expect(hasNextInQueue(first)).toBe(true);

    // Sin cola: ni siguiente ni anterior, y no revienta.
    expect(hasNextInQueue(null)).toBe(false);
    expect(hasPrevInQueue(null)).toBe(false);
    expect(nextQueueIndex(null)).toBe(-1);
    expect(queuePositionLabel(null)).toBe("");
  });

  it("salta las pistas mudas al avanzar y al retroceder", () => {
    const items: QueueTrack[] = [
      { id: "a", audioUrl: APPLE_PREVIEW },
      { id: "muda", audioUrl: "—" },
      { id: "muda2", audioUrl: "" },
      { id: "b", audioUrl: APPLE_PREVIEW },
    ];
    const state = createQueue(items, 0)!;
    expect(nextQueueIndex(state)).toBe(3);
    expect(prevQueueIndex(createQueue(items, 3)!)).toBe(0);
  });
});

describe("P2 cola de audio — avance automático al terminar una pista", () => {
  it("advanceQueue devuelve la siguiente: eso es lo que dispara `ended`", () => {
    const state = createQueue(queue("a", "b", "c"), 0)!;
    const next = advanceQueue(state);
    expect(next?.index).toBe(1);
    expect(next?.items).toBe(state.items);
  });

  it("al terminar la última se PARA (devuelve null) en vez de reiniciar", () => {
    // Decisión: parar. Reiniciar sola sería un bucle infinito silencioso.
    const last = createQueue(queue("a", "b"), 1)!;
    expect(advanceQueue(last)).toBeNull();
  });

  it("si la última no tiene fuente, salta a la anterior reproducible y para ahí", () => {
    const items: QueueTrack[] = [
      { id: "a", audioUrl: APPLE_PREVIEW },
      { id: "b", audioUrl: APPLE_PREVIEW },
      { id: "muda", audioUrl: "" },
    ];
    const next = advanceQueue(createQueue(items, 1)!);
    expect(next).toBeNull(); // no hay ninguna reproducible después
    const fromA = advanceQueue(createQueue(items, 0)!);
    expect(fromA?.index).toBe(1);
  });

  it("sin cola, advanceQueue no hace nada", () => {
    expect(advanceQueue(null)).toBeNull();
  });
});

describe("P2 cola de audio — cambiar de pista a mitad de cola", () => {
  it("reinicia el índice en esa pista y conserva el resto", () => {
    const items = queue("a", "b", "c");
    const state = createQueue(items, 0)!;
    const moved = reindexQueue(state, items[2]);
    expect(moved?.index).toBe(2);
    expect(moved?.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("si la pista no estaba, la cola pasa a ser esa pista sola", () => {
    const state = createQueue(queue("a", "b"), 0)!;
    const fresh = reindexQueue(state, { id: "z", audioUrl: APPLE_PREVIEW });
    expect(fresh?.items.map((i) => i.id)).toEqual(["z"]);
    expect(fresh?.index).toBe(0);
  });

  it("una pista sin fuente no se cuela como cola de un solo elemento", () => {
    expect(reindexQueue(createQueue(queue("a"), 0)!, { id: "z", audioUrl: "—" })).toBeNull();
  });
});

describe("P2 cola de audio — duraciones de la cola", () => {
  it("suma las duraciones de la cola e ignora las que no son duraciones", () => {
    const durations = ["3:32", "4:07", "3:32", "5:18"];
    expect(sumDurations(durations)).toEqual({ seconds: 989, label: "16:29" });
  });

  it('"—" , "" y null no cuentan como 0: no inflan ni la suma ni el listado', () => {
    expect(parseDurationToSeconds("—")).toBeNull();
    expect(parseDurationToSeconds("")).toBeNull();
    expect(parseDurationToSeconds(null)).toBeNull();
    // Una duración de seed inexistente no debe volverse "0:00" al pintar.
    expect(sumDurations(["3:32", "—", ""])).toEqual({ seconds: 212, label: "3:32" });
  });

  it("una hora no se destruye a 62 s (regresión de P15)", () => {
    expect(parseDurationToSeconds("1:02:03")).toBe(3723);
    expect(sumDurations(["1:02:03", "0:59"])).toEqual({ seconds: 3782, label: "63:02" });
  });

  it('los tokens de "sin duración" del seed ("-", "00:00") se distinguen', () => {
    expect(parseDurationToSeconds("-")).toBeNull();
    expect(parseDurationToSeconds("00:00")).toBe(0);
  });
});
