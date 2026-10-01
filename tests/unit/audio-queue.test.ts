import { describe, it, expect } from "vitest";
import {
  AUDIO_SOURCE_PRIORITY,
  CHAPTER_OFFSETS_DROPPED_WARNING,
  CORS_VERIFIED_AUDIO_HOSTS,
  PREVIEW_MAX_SEGMENT_SECONDS,
  SKIP_NEXT_GLYPH,
  SKIP_PREV_GLYPH,
  advanceQueue,
  createQueue,
  formatClock,
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
  resolvePlaybackTimeline,
  shouldUseCrossOrigin,
  skipGlyphDirection,
  timelineProgress,
  timelineScrubValue,
  timelineSeekTarget,
  tracklistDurationLabel,
  validateChapterSegment,
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

// ===========================================================================
// RC.32 — la tabla `tracks` mezcla dos espacios de coordenadas
// ===========================================================================
//
// Estos tests no renderizan React (`vitest.config.ts` es `environment: "node"`,
// `include: tests/unit/**/*.test.ts`), así que comprueban las **funciones puras**
// que la UI consume. Si alguien reintroduce el acoplamiento —leer
// `activeTrack.endTimestamp` antes que la duración del medio— reverte esto.

/**
 * Reproduce la fila real que、開 el síntoma: "Move On" (Bowie), `start_time=265`,
 * `end_time=501` (la duración total del release, 8:21). El preview de iTunes es
 * un fichero de 30 s.
 */
const BOWIE_MOVE_ON = { start_time: 265, end_time: 501, audio_preview_url: APPLE_PREVIEW };

/**
 * Una ventana de capítulo que el validador **acepta** (20 s, dentro del tope),
 * puesta sobre un preview. El caso de Bowie lo tapa el tope de 30 s, así que
 * para comprobar que es el **medio** lo que descarta los timestamps —y no
 * accidentalmente el validador— hace falta uno que pase el validador.
 */
const VALID_CHAPTER_ON_PREVIEW = { start_time: 265, end_time: 285, audio_preview_url: APPLE_PREVIEW };

/**
 * Reproduce las dos pasadas que hace el reproductor.
 *
 * `atLoad` es `loadTrack`: valores **declarados**, sin `loadedmetadata`. Ahí se
 * limpia el `ActiveTrack` y se captura el aviso.
 *
 * `atPaint` es el render: valores **ya saneados** + la duración real. Los números
 * del scrubber y de las etiquetas salen de aquí.
 */
function cleanedActiveTrack(track: {
  start_time?: number | null;
  end_time?: number | null;
  audio_preview_url?: string | null;
  youtube_video_id?: string | null;
}) {
  const isYT = !track.audio_preview_url && Boolean(track.youtube_video_id);
  const atLoad = resolvePlaybackTimeline({
    sourceType: isYT ? "youtube" : "preview",
    declaredStart: track.start_time ?? 0,
    declaredEnd: track.end_time ?? 0,
    // `mediaDuration: 0` = en el momento de cargar, `loadedmetadata` aún no ha
    // llegado. Es lo que hace `loadTrack`.
  });
  return {
    isYouTube: isYT,
    audioUrl: track.audio_preview_url ?? "",
    startTimestamp: atLoad.start,
    endTimestamp: atLoad.end,
    warning: atLoad.warning,
    atPaint: (mediaDuration: number) =>
      resolvePlaybackTimeline({
        sourceType: isYT ? "youtube" : "preview",
        declaredStart: atLoad.start,
        declaredEnd: atLoad.end,
        mediaDuration,
      }),
  };
}

describe("RC.32 · tarea 1 — la duración mostrada venía de otra fuente", () => {
  it("un preview descarta los capítulos incluso cuando el validador los acepta", () => {
    // El validador dice que este rango es bueno. La línea de tiempo dice que no
    // es de este medio. Lo segundo es lo que decide.
    expect(validateChapterSegment(265, 285).usable).toBe(true);

    const cleaned = cleanedActiveTrack(VALID_CHAPTER_ON_PREVIEW);
    expect(cleaned.startTimestamp).toBe(0);
    expect(cleaned.endTimestamp).toBe(0);
    expect(cleaned.warning).toBe(CHAPTER_OFFSETS_DROPPED_WARNING);

    const timeline = cleaned.atPaint(30);
    expect(timeline.start).toBe(0);
    expect(timeline.end).toBe(30);
    expect(timeline.applied).toBe(false);
    expect(formatClock(timeline.end)).toBe("0:30");
  });
});

describe("RC.32 · tarea 1 — la duración mostrada venía de otra fuente", () => {
  it("un ActiveTrack de preview con end_time = 501 NO arrastra el 501 a la pista activa", () => {
    const cleaned = cleanedActiveTrack(BOWIE_MOVE_ON);
    expect(cleaned.startTimestamp).toBe(0);
    expect(cleaned.endTimestamp).toBe(0);
    expect(cleaned.endTimestamp).not.toBe(501);
  });

  it("la etiqueta derecha muestra 0:30, la duración real del medio, no 8:21", () => {
    const cleaned = cleanedActiveTrack(BOWIE_MOVE_ON);
    const timeline = cleaned.atPaint(30);
    expect(formatClock(timeline.end)).toBe("0:30");
    expect(formatClock(timeline.end)).not.toBe("8:21");
    // La etiqueta izquierda viene del elemento `<audio>`: 8 s de reproducción.
    expect(formatClock(8)).toBe("0:08");
  });

  it("sin `loadedmetadata` todavía no inventa una duración: dice 0:00, no 8:21", () => {
    const timeline = cleanedActiveTrack(BOWIE_MOVE_ON).atPaint(0);
    expect(timeline.end).toBe(0);
    expect(formatClock(timeline.end)).toBe("0:00");
  });

  it("avisa de que los capítulos se han descartado, y solo si los había", () => {
    expect(
      resolvePlaybackTimeline({ sourceType: "preview", declaredStart: 265, declaredEnd: 501, mediaDuration: 30 }).warning,
    ).toBe(CHAPTER_OFFSETS_DROPPED_WARNING);
    expect(
      resolvePlaybackTimeline({ sourceType: "preview", declaredStart: 0, declaredEnd: 0, mediaDuration: 30 }).warning,
    ).toBe("");
  });

  it("un vídeo SÍ usa los capítulos: ahí los timestamps son del mismo medio", () => {
    const timeline = resolvePlaybackTimeline({
      sourceType: "youtube",
      declaredStart: 265,
      declaredEnd: 285,
      mediaDuration: 501,
    });
    expect(timeline.applied).toBe(true);
    expect(timeline.usesMediaDuration).toBe(false);
    expect(timeline.start).toBe(265);
    expect(timeline.end).toBe(285);
    expect(timeline.span).toBe(20);
    expect(timeline.warning).toBe("");
  });

  it("un vídeo sin capítulos muestra su duración real, no el default de 30 s", () => {
    const timeline = resolvePlaybackTimeline({
      sourceType: "youtube",
      declaredStart: 0,
      declaredEnd: 0,
      mediaDuration: 501,
    });
    expect(timeline.end).toBe(501);
    expect(timeline.applied).toBe(false);
  });

  it("un capítulo que pasa del vídeo se recorta al vídeo, no al revés", () => {
    // Recortar al revés dejaría el poll sin ver el final: la pista no avanzaría.
    const timeline = resolvePlaybackTimeline({
      sourceType: "youtube",
      declaredStart: 10,
      declaredEnd: 900,
      mediaDuration: 501,
    });
    expect(timeline.end).toBe(501);
  });
});

describe("RC.32 · tarea 2 — el scrubber perdía la pista", () => {
  it("el rango del scrubber es 0..30, no 265..501", () => {
    const timeline = cleanedActiveTrack(BOWIE_MOVE_ON).atPaint(30);
    expect(timeline.start).toBe(0);
    expect(timeline.end).toBe(30);
  });

  it("arrastrar el scrubber nunca pide un currentTime fuera del fichero", () => {
    const timeline = cleanedActiveTrack(BOWIE_MOVE_ON).atPaint(30);
    // El bug: el `value` del input se recortaba a `[265, 501]` y con
    // `currentTime = 8` salía 265. Ahora sale 8.
    expect(timelineScrubValue(timeline, 8)).toBe(8);
    expect(timelineScrubValue(timeline, 265)).toBe(30);
    // Y el `seek()` correspondiente no sale del fichero.
    for (const requested of [0, 8, 15, 29.9, 30, 265, 501, 9999, -50]) {
      const target = timelineSeekTarget(timeline, requested);
      expect(target).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThanOrEqual(30);
    }
  });

  it("revertir el recorte (Math.max(start, min(end, t)) sobre los espejos crudos) rompe el test", () => {
    // La regresión exacta: `effectiveEnd = end_time || 0` = 501, `start = 265`.
    const rawStart = 265;
    const rawEnd = 501;
    const oldClamp = Math.max(rawStart, Math.min(rawEnd, 8));
    expect(oldClamp).toBe(265);

    // Lo que hace ahora `seek()`: la ventana ya saneada, con la duración real.
    const cleaned = cleanedActiveTrack(BOWIE_MOVE_ON);
    const timeline = cleaned.atPaint(30);
    expect(timelineSeekTarget(timeline, 8)).toBe(8);
  });

  it("un vídeo con capítulos sí recorta el seek a la ventana", () => {
    const timeline = resolvePlaybackTimeline({
      sourceType: "youtube",
      declaredStart: 265,
      declaredEnd: 285,
      mediaDuration: 501,
    });
    expect(timelineSeekTarget(timeline, 0)).toBe(265);
    expect(timelineSeekTarget(timeline, 275)).toBe(275);
    expect(timelineSeekTarget(timeline, 400)).toBe(285);
    expect(timelineSeekTarget(timeline, Number.NaN)).toBe(265);
  });

  it("con la duración todavía desconocida el seek no recorta por arriba", () => {
    const timeline = resolvePlaybackTimeline({ sourceType: "preview", mediaDuration: 0 });
    expect(timeline.end).toBe(0);
    expect(timelineSeekTarget(timeline, 7)).toBe(7);
  });
});

describe("RC.32 · tarea 3 — la barra de progreso mentía", () => {
  it("con start=265, end=501 y currentTime=8 no sale negativo ni se queda en 0", () => {
    // La fórmula anterior: ((8 - 265) / (501 - 265)) * 100 = -108.9% → recortado a 0.
    const legacy = Math.max(0, Math.min(100, ((8 - 265) / (501 - 265)) * 100));
    expect(legacy).toBe(0);

    const timeline = resolvePlaybackTimeline({ sourceType: "preview", mediaDuration: 30 });
    const progress = timelineProgress(timeline, 8);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThanOrEqual(100);
    expect(progress).toBeCloseTo((8 / 30) * 100, 5);
  });

  it("es monótona de 0 a 100 y no sale de rango en ningún currentTime", () => {
    const timeline = resolvePlaybackTimeline({ sourceType: "preview", mediaDuration: 30 });
    let previous = -1;
    for (let t = 0; t <= 30; t += 0.5) {
      const progress = timelineProgress(timeline, t);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(100);
      expect(progress).toBeGreaterThanOrEqual(previous);
      previous = progress;
    }
    expect(previous).toBeCloseTo(100, 5);
  });

  it("nunca devuelve NaN con basura", () => {
    const timeline = resolvePlaybackTimeline({ sourceType: "preview", mediaDuration: 30 });
    for (const t of [Number.NaN, Number.POSITIVE_INFINITY, -1, -999]) {
      const progress = timelineProgress(timeline, t);
      expect(Number.isFinite(progress)).toBe(true);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(100);
    }
    expect(timelineProgress(timeline, 5)).toBeGreaterThanOrEqual(0);
  });

  it("con duración desconocida la barra da 0, no un porcentaje inventado", () => {
    expect(timelineProgress(resolvePlaybackTimeline({ sourceType: "preview", mediaDuration: 0 }), 5)).toBe(0);
  });

  it("un currentTime antes de la ventana da 0, no un porcentaje negativo", () => {
    // El caso que sí producía -1325%: se pinta el reproductor y `currentTime` va
    // por detrás del inicio del capítulo (el `seek` aún no se ha aplicado).
    const timeline = resolvePlaybackTimeline({
      sourceType: "youtube",
      declaredStart: 265,
      declaredEnd: 285,
      mediaDuration: 501,
    });
    expect(timelineProgress(timeline, 0)).toBe(0);
    expect(timelineProgress(timeline, 100)).toBe(0);
    // Quitar el `Math.max(0, ...)` de la función devuelve -1325 y -825 aquí.
    expect(timelineProgress(timeline, 0)).toBeGreaterThanOrEqual(0);
    expect(timelineProgress(timeline, 100)).toBeGreaterThanOrEqual(0);
  });

  it("mide la ventana, no el medio completo, en un vídeo con capítulos", () => {
    const timeline = resolvePlaybackTimeline({
      sourceType: "youtube",
      declaredStart: 265,
      declaredEnd: 285,
      mediaDuration: 501,
    });
    expect(timelineProgress(timeline, 265)).toBe(0);
    expect(timelineProgress(timeline, 275)).toBeCloseTo(50, 5);
    expect(timelineProgress(timeline, 285)).toBe(100);
  });
});

describe("RC.32 · tarea 4 — los glifos de avanzar y retroceder estaban intercambiados", () => {
  it("el glifo de «Pista anterior» apunta a la izquierda y el de «Pista siguiente» a la derecha", () => {
    expect(skipGlyphDirection(SKIP_PREV_GLYPH)).toBe("backward");
    expect(skipGlyphDirection(SKIP_NEXT_GLYPH)).toBe("forward");
  });

  it("son glifos distintos: no puede ser el mismo dibujo con dos nombres", () => {
    expect(SKIP_PREV_GLYPH).not.toBe(SKIP_NEXT_GLYPH);
  });

  it("revertir el intercambio falla: prev con el glifo forward y next con el backward", () => {
    const PREV = "M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5";
    const NEXT = "M12.75 4.5l-7.5 7.5 7.5 7.5m6-15l-7.5 7.5 7.5 7.5";
    expect(skipGlyphDirection(PREV)).toBe("forward");
    expect(skipGlyphDirection(NEXT)).toBe("backward");
    // El sentido deducido contradice al `aria-label` de cada botón.
    expect(skipGlyphDirection(PREV)).not.toBe("backward");
    expect(skipGlyphDirection(NEXT)).not.toBe("forward");
  });

  it("el análisis no se inventa sentidos para rutas que no son glifos de salto", () => {
    // La cruz de cerrar tiene UN solo `l`, así que no hay par de triángulos que
    // comparar: sin el mínimo de dos devolvería "forward" sin motivo.
    expect(skipGlyphDirection("M6 18L18 6M6 6l12 12")).toBeNull();
    expect(skipGlyphDirection("M6 18L18 6M6 6l-12-12")).toBeNull();
    expect(skipGlyphDirection("")).toBeNull();
    // Signos mezclados: no hay un sentido único.
    expect(skipGlyphDirection("M1 1l5 5m-5 5l-5 5")).toBeNull();
  });
});

describe("RC.32 · tarea 5 — el tracklist pintaba el rango del vídeo", () => {
  it("una pista con duración real muestra su duración, no el rango de capítulos", () => {
    const label = tracklistDurationLabel({ duration: "3:32", start_time: 265, end_time: 501 });
    expect(label.text).toBe("3:32");
    expect(label.isChapterRange).toBe(false);
    expect(label.warning).toBe("");
  });

  it("revertir la precedencia (ganar la rama de timestamps) rompe el test", () => {
    const track = { duration: "3:32", start_time: 265, end_time: 501 };
    const legacy = track.start_time || track.end_time
      ? `4:25 — 8:21`
      : track.duration;
    expect(legacy).toBe("4:25 — 8:21");
    expect(tracklistDurationLabel(track).text).toBe("3:32");
  });

  it("sin duración real el rango se conserva, pero marcado como lo que es", () => {
    const label = tracklistDurationLabel({ duration: "", start_time: 265, end_time: 501 });
    expect(label.text).toBe("4:25 — 8:21");
    expect(label.isChapterRange).toBe(true);
    expect(label.warning).not.toBe("");
  });

  it("acepta horas y rechaza los placeholders del seed", () => {
    expect(tracklistDurationLabel({ duration: "1:02:03", start_time: 10, end_time: 20 }).text).toBe("1:02:03");
    for (const placeholder of ["—", "-", "n/a", "", "   ", "Reproducir", "3:32 aprox"]) {
      expect(tracklistDurationLabel({ duration: placeholder, start_time: 0, end_time: 0 }).text).toBe("");
    }
  });

  it("una pista sin nada no inventa texto", () => {
    const label = tracklistDurationLabel({ duration: null, start_time: null, end_time: null });
    expect(label.text).toBe("");
    expect(label.invalidChapterRange).toBe(false);
    expect(label.warning).toBe("");
  });

  it("un rango invertido se marca como inválido en vez de imprimirse", () => {
    const label = tracklistDurationLabel({ duration: "—", start_time: 501, end_time: 265 });
    expect(label.text).toBe("");
    expect(label.invalidChapterRange).toBe(true);
    expect(label.warning).toMatch(/end_time debe ser mayor que start_time/);
  });

  it("formatClock coincide con lo que pintaba el reproductor (M:SS)", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(8)).toBe("0:08");
    expect(formatClock(30)).toBe("0:30");
    expect(formatClock(265)).toBe("4:25");
    expect(formatClock(501)).toBe("8:21");
    expect(formatClock(3723)).toBe("62:03");
    expect(formatClock(Number.NaN)).toBe("0:00");
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("RC.32 · tarea 6 — el segmento no puede pasar de 30 s", () => {
  it("acepta un segmento de 30 s exactos y rechaza el de 31", () => {
    expect(validateChapterSegment(0, PREVIEW_MAX_SEGMENT_SECONDS).usable).toBe(true);
    const tooLong = validateChapterSegment(0, PREVIEW_MAX_SEGMENT_SECONDS + 1);
    expect(tooLong.usable).toBe(false);
    expect(tooLong.issues.map((i) => i.code)).toContain("TOO_LONG");
    expect(tooLong.warning).toMatch(/31 s y el máximo son 30 s/);
  });

  it("mide la longitud del segmento, no el final absoluto", () => {
    // El bug de fondo: se validaba `end_time` contra 30 en vez de
    // `end_time - start_time`, así que cualquier capítulo a partir del segundo 30
    // del vídeo quedaba "demasiado largo" aunque durara 5 s.
    expect(validateChapterSegment(265, 285).usable).toBe(true);
    expect(validateChapterSegment(265, 285).length).toBe(20);
    expect(validateChapterSegment(265, 501).usable).toBe(false);
  });

  it("rechaza el final invertido, incluido el start sin end (bug del salto instantáneo)", () => {
    // `start=265, end=0` se convertía en `end=30 < start`: el poll de YouTube
    // veía `ytTime >= 30` en el primer tick y saltaba de pista al instante.
    const open = validateChapterSegment(265, 0);
    expect(open.usable).toBe(true); // capítulo abierto: legítimo
    expect(open.end).toBe(0); // 0 = "hasta el final del medio"

    const inverted = validateChapterSegment(501, 265);
    expect(inverted.usable).toBe(false);
    expect(inverted.issues.map((i) => i.code)).toContain("INVERTED");
  });

  it("el final invertido no rompe la línea de tiempo: cae al medio completo", () => {
    const timeline = resolvePlaybackTimeline({
      sourceType: "youtube",
      declaredStart: 501,
      declaredEnd: 265,
      mediaDuration: 300,
    });
    expect(timeline.start).toBe(0);
    expect(timeline.end).toBe(300);
    expect(timeline.applied).toBe(false);
    expect(timeline.warning).not.toBe("");
  });

  it("el segmento demasiado largo tampoco llega al reproductor", () => {
    const timeline = resolvePlaybackTimeline({
      sourceType: "youtube",
      declaredStart: 265,
      declaredEnd: 501,
      mediaDuration: 900,
    });
    expect(timeline.applied).toBe(false);
    expect(timeline.start).toBe(0);
    expect(timeline.end).toBe(900);
    expect(timeline.warning).toMatch(/236 s y el máximo son 30 s/);
  });

  it("rechaza negativos y no-números, pero distingue 'no declarado' de 'declarado mal'", () => {
    expect(validateChapterSegment(-5, 20).usable).toBe(false);
    expect(validateChapterSegment(-5, 20).issues.map((i) => i.code)).toContain("NEGATIVE");
    expect(validateChapterSegment(Number.NaN, 20).usable).toBe(false);
    expect(validateChapterSegment(Number.NaN, 20).issues.map((i) => i.code)).toContain("NON_FINITE");

    const nothing = validateChapterSegment(null, undefined);
    expect(nothing.declared).toBe(false);
    expect(nothing.usable).toBe(true);
    expect(nothing.warning).toBe("");

    const something = validateChapterSegment(0, 0);
    expect(something.declared).toBe(false);

    const broken = validateChapterSegment(0, Number.NaN);
    expect(broken.declared).toBe(false); // NaN no cuenta como "declarado"
    expect(broken.usable).toBe(false);
  });

  it("el tope es parametrizable para las vistas que solo preguntan por validez", () => {
    expect(validateChapterSegment(0, 236).usable).toBe(false);
    expect(validateChapterSegment(0, 236, Number.POSITIVE_INFINITY).usable).toBe(true);
    expect(validateChapterSegment(0, 236, 300).usable).toBe(true);
  });

  it("siempre ordena los problemas por código, para que el mensaje sea estable", () => {
    const result = validateChapterSegment(-1, -2);
    expect(result.usable).toBe(false);
    expect(result.issues.every((i) => i.action === "drop")).toBe(true);
    expect(result.warning).toBe(result.issues.map((i) => i.message).join(" · "));
  });
});

describe("RC.32 · la línea de tiempo nunca es un rango imposible", () => {
  const sourceTypes = ["preview", "youtube", "spotify", "apple_music", null, undefined] as const;

  it("span >= 0 y end >= start en todos los medios y con cualquier basura", () => {
    const values = [0, 1, -10, 30, 265, 501, Number.NaN, Number.POSITIVE_INFINITY];
    for (const sourceType of sourceTypes) {
      for (const start of values) {
        for (const end of values) {
          for (const mediaDuration of [0, 30, 501]) {
            const timeline = resolvePlaybackTimeline({ sourceType, declaredStart: start, declaredEnd: end, mediaDuration });
            expect(timeline.span).toBeGreaterThanOrEqual(0);
            expect(timeline.end).toBeGreaterThanOrEqual(timeline.start);
            expect(Number.isFinite(timeline.start)).toBe(true);
            expect(Number.isFinite(timeline.end)).toBe(true);
            expect(timelineScrubValue(timeline, 12.5)).toBeGreaterThanOrEqual(timeline.start);
            expect(timelineScrubValue(timeline, 12.5)).toBeLessThanOrEqual(timeline.end);
          }
        }
      }
    }
  });

  it("solo un vídeo puede tener una ventana de capítulo aplicada", () => {
    for (const sourceType of sourceTypes) {
      const timeline = resolvePlaybackTimeline({
        sourceType,
        declaredStart: 10,
        declaredEnd: 30,
        mediaDuration: 501,
      });
      if (sourceType === "youtube") {
        expect(timeline.applied).toBe(true);
        expect(timeline.start).toBe(10);
      } else {
        expect(timeline.applied).toBe(false);
        expect(timeline.start).toBe(0);
        expect(timeline.usesMediaDuration).toBe(true);
        expect(timeline.end).toBe(501);
        expect(timeline.warning).toBe(CHAPTER_OFFSETS_DROPPED_WARNING);
      }
    }
  });
});
