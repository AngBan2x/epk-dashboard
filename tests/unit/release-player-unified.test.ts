// @vitest-environment jsdom
/**
 * ## Qué protege este fichero
 *
 * El reproductor unificado (`AudioPlayer`) tiene **cuatro** formas de vivir y
 * el commit `4592bd3` las tocaba todas sin comprobarlas. Este fichero las
 * renderiza de verdad:
 *
 * 1. Single con preview de iTunes → botón "Reproducir", etiqueta "Preview (30s)".
 * 2. Single con solo YouTube → botón "Reproducir", etiqueta "YouTube".
 * 3. Cola (álbum) → botón "Reproducir N pistas de X" y texto "Reproducir • N pistas".
 * 4. Sin nada que suene → botón apagado con el altavoz, "No hay audio disponible".
 *
 * Y dos cosas que ya se habían roto y que ningún test miraba:
 *
 * - **La pausa.** `isPlaying` tiene que alternar Reproducir/Pausar, y la tarjeta
 *   de un álbum tiene que Alternate también (su `id` no es el de la pista que
 *   suena: lo que suena es una hija).
 * - **La etiqueta honesta.** Una pista con Spotify **y** YouTube se anunciaba
 *   como "Spotify" mientras sonaba el vídeo. `resolvePlayingLabel` sale de
 *   `getPlayableAudioSource` justamente para que la etiqueta y el botón no
 *   puedan discrepar.
 *
 * El repo tiene `environment: "node"` por defecto (`vitest.config.ts:22`), así
 * que este fichero necesita el `// @vitest-environment jsdom` de la línea 1.
 * Y `include` solo recoge ficheros `.test.ts` (no `.tsx`), de ahí el
 * `createElement` en vez de JSX.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, useState, type ReactNode } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { AudioPlayer, NO_AUDIO_TEXT, NO_CHILDREN_TEXT } from "@/components/AudioPlayer";
import {
  AudioPlayerContext,
  type ActiveTrack,
  type AudioPlayerContextType,
} from "@/context/AudioPlayerContext";
import { resolvePlayingLabel } from "@/lib/audio-priority";

/**
 * `AudioPlayer` cuenta scrobbles con un `fetch` a `/api/tracks/{id}/streams`
 * en cuanto suena. En jsdom no hay red, así que se sustituye por una promesa
 * resuelta: si no, el efecto lanza y el fallo aparece como "el test se cayó",
 * que no dice nada del reproductor.
 */
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Reproductor global falso, pero **con estado**: es lo que hace posible
 * comprobar que el botón alterna. Un `isPlaying: false` fijo daría un botón
 * que nunca cambia y un test que pasa sin comprobar el toggle. */
interface Harness {
  playQueue: ReturnType<typeof vi.fn>;
  playTrack: ReturnType<typeof vi.fn>;
  togglePlay: ReturnType<typeof vi.fn>;
  provider: (props: { children: ReactNode }) => ReturnType<typeof createElement>;
}

function montarConReproductorGlobal(): Harness {
  const playQueue = vi.fn();
  const playTrack = vi.fn();
  const togglePlay = vi.fn();

  function Provider({ children }: { children: ReactNode }) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    /**
     * Se rellenan **todos** los campos de `AudioPlayerContextType`, no solo los
     * que lee `AudioPlayer`. Un `as unknown as` los habría escondido y el
     * harness habría dejado de ser un reproductor para dejar de ser un objeto
     * con la forma correcta: si mañana `AudioPlayer` empieza a leer
     * `timelineWarning`, aquí sale `""` y el test sigue siendo válido.
     */
    const value: AudioPlayerContextType = {
      activeTrack: activeId
        ? { id: activeId, title: "En curso", artist: "X", audioUrl: "https://cdn.example.com/a.m4a" }
        : null,
      isPlaying,
      isLoading: false,
      error: null,
      duration: 0,
      currentTime: 0,
      volume: 1,
      isVisualizerOpen: false,
      isYouTubeMode: false,
      timelineWarning: "",
      queue: [],
      queueIndex: -1,
      queuePosition: "",
      hasNext: false,
      hasPrev: false,
      playQueue: (items: ActiveTrack[], startIndex = 0) => {
        playQueue(items, startIndex);
        const creado = items[startIndex];
        if (creado) {
          setActiveId(creado.id);
          setIsPlaying(true);
        }
      },
      playTrack: (t: ActiveTrack) => {
        playTrack(t);
        setActiveId(t.id);
        setIsPlaying(true);
      },
      // Alterna de verdad, y por eso el botón alterna de verdad.
      togglePlay: () => {
        togglePlay();
        setIsPlaying((v) => !v);
      },
      pause: () => setIsPlaying(false),
      next: vi.fn(),
      prev: vi.fn(),
      clearTrack: () => {
        setActiveId(null);
        setIsPlaying(false);
      },
      seek: vi.fn(),
      setVolume: vi.fn(),
      toggleVisualizer: vi.fn(),
      audioRef: { current: null },
    };

    return createElement(AudioPlayerContext.Provider, { value }, children);
  }

  return { playQueue, playTrack, togglePlay, provider: Provider };
}

// ---------------------------------------------------------------------------
// 1 y 2 — pistas sueltas
// ---------------------------------------------------------------------------

describe("AudioPlayer — single con preview", () => {
  it("el botón se llama 'Reproducir' y la etiqueta dice la fuente REAL", () => {
    const { provider: Provider } = montarConReproductorGlobal();
    render(
      createElement(
        Provider,
        null,
        createElement(AudioPlayer, {
          id: "trk-001",
          src: "https://audio-ssl.itunes.apple.com/x.m4p",
          title: "Airbag",
          track: { audio_preview_url: "https://audio-ssl.itunes.apple.com/x.m4p" },
        })
      )
    );

    expect(screen.getByRole("button", { name: "Reproducir" })).toBeTruthy();
    // El patrón único de la casa: `{acción} • {fuente}`.
    expect(screen.getByTestId("audio-player-status").textContent).toMatch(
      /Reproducir • Preview \(30s\)/
    );
  });

  it("el botón alterna Reproducir → Pausar → Reproducir, sin reiniciar la pista", () => {
    const { provider: Provider, playTrack, togglePlay } = montarConReproductorGlobal();
    render(
      createElement(
        Provider,
        null,
        createElement(AudioPlayer, {
          id: "trk-001",
          src: "https://audio-ssl.itunes.apple.com/x.m4p",
          title: "Airbag",
          track: { audio_preview_url: "https://audio-ssl.itunes.apple.com/x.m4p" },
        })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Reproducir" }));
    expect(playTrack).toHaveBeenCalledTimes(1);
    // Pausar: el nombre accesible cambia…
    const pausar = screen.getByRole("button", { name: "Pausar" });
    expect(pausar).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reproducir" })).toBeNull();

    // …y al pulsarlo llama a `togglePlay`, **no** a `playTrack`: si llamara a
    // `playTrack` volvería a cargar la fuente desde el segundo 0.
    fireEvent.click(pausar);
    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(playTrack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Reproducir" })).toBeTruthy();
  });
});

describe("AudioPlayer — la etiqueta dice lo que suena, no lo que tiene más prioridad", () => {
  it("con Spotify + YouTube y sin preview dice 'YouTube', NUNCA 'Spotify'", () => {
    // Este es el bug que reportó el usuario. Spotify tiene prioridad 90 y
    // YouTube 50, así que `getAudioSources(track)[0]` es Spotify — y Spotify no
    // suena nunca. Etiquetar con `primarySource.label` decía "Spotify" mientras
    // la pista reproducía el vídeo.
    const track = {
      spotify_url: "https://open.spotify.com/track/5ghIJDpPex3bJPsFkqkR6P",
      youtube_video_id: "XqZsoesa55w",
    };

    expect(resolvePlayingLabel(track)).toBe("YouTube");
    expect(resolvePlayingLabel(track)).not.toBe("Spotify");

    const { provider: Provider } = montarConReproductorGlobal();
    render(
      createElement(
        Provider,
        null,
        createElement(AudioPlayer, { id: "trk-yt", src: undefined, title: "Airbag", track })
      )
    );

    const status = screen.getByTestId("audio-player-status").textContent ?? "";
    expect(status).toMatch(/Reproducir • YouTube/);
    expect(status).not.toMatch(/Spotify/);
  });

  it("con preview + YouTube manda el preview, y se dice", () => {
    // El preview son 30 s reales de audio; el vídeo es el respaldo.
    const status = resolvePlayingLabel({
      audio_preview_url: "https://audio-ssl.itunes.apple.com/x.m4p",
      spotify_url: "https://open.spotify.com/track/5ghIJDpPex3bJPsFkqkR6P",
      youtube_video_id: "XqZsoesa55w",
    });
    expect(status).toBe("Preview (30s)");
  });

  it("sin fila pero en modo YouTube, el respaldo es 'YouTube', no un genérico", () => {
    // El `videoId` puede vivir solo en el `ActiveTrack` de la cola.
    expect(resolvePlayingLabel(null, true)).toBe("YouTube");
    expect(resolvePlayingLabel(null, false)).toBe("Audio");
  });
});

// ---------------------------------------------------------------------------
// 3 — la cola (álbum)
// ---------------------------------------------------------------------------

describe("AudioPlayer — cola de un lanzamiento", () => {
  const COLA = [
    { id: "trk-airbag", title: "Airbag", audioUrl: "https://cdn.example.com/a.m4a" },
    { id: "trk-paranoid", title: "Paranoid Android", audioUrl: "https://cdn.example.com/p.m4a" },
  ];

  it("el botón cuenta las pistas y el texto visible usa el patrón de la casa", () => {
    const { provider: Provider } = montarConReproductorGlobal();
    render(
      createElement(
        Provider,
        null,
        createElement(AudioPlayer, {
          id: "rel-ok-computer",
          src: undefined,
          title: "OK Computer",
          // Fila cabecera: sin audio propio. Antes esto decidía `canPlay` y
          // apagaba el botón entero.
          track: { audio_preview_url: "—" },
          queue: COLA,
          hasChildren: true,
        })
      )
    );

    expect(screen.getByRole("button", { name: "Reproducir 2 pistas de OK Computer" })).toBeTruthy();
    expect(screen.getByTestId("audio-player-status").textContent).toMatch(/Reproducir • 2 pistas/);
  });

  it("con una sola pista dice 'pista' en singular", () => {
    const { provider: Provider } = montarConReproductorGlobal();
    render(
      createElement(
        Provider,
        null,
        createElement(AudioPlayer, {
          id: "rel-x",
          src: undefined,
          title: "X",
          queue: [COLA[0]],
          hasChildren: true,
        })
      )
    );
    expect(screen.getByTestId("audio-player-status").textContent).toMatch(/Reproducir • 1 pista(?!s)/);
    expect(screen.getByRole("button", { name: /Reproducir 1 pista de X/ })).toBeTruthy();
  });

  it("cuenta solo las pistas que SUENAN, no las que hay en el array", () => {
    // Una hija muda dentro de la cola no puede contar: el contador "3/4" del
    // reproductor global no cuadraría con lo que suena.
    const { provider: Provider } = montarConReproductorGlobal();
    render(
      createElement(
        Provider,
        null,
        createElement(AudioPlayer, {
          id: "rel-x",
          src: undefined,
          title: "X",
          queue: [
            COLA[0],
            { id: "trk-muda", title: "Muda", audioUrl: "" },
            COLA[1],
            { id: "trk-muda2", title: "Muda 2", audioUrl: "—" },
          ],
          hasChildren: true,
        })
      )
    );
    expect(screen.getByRole("button", { name: "Reproducir 2 pistas de X" })).toBeTruthy();
  });

  it("pulsa la cola entera empezando en 0, y después PAUSA en vez de reiniciar", () => {
    const { provider: Provider, playQueue, playTrack, togglePlay } = montarConReproductorGlobal();
    render(
      createElement(
        Provider,
        null,
        createElement(AudioPlayer, {
          id: "rel-ok-computer",
          src: undefined,
          title: "OK Computer",
          queue: COLA,
          hasChildren: true,
        })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: /Reproducir 2 pistas de OK Computer/ }));
    expect(playQueue).toHaveBeenCalledTimes(1);
    expect(playQueue.mock.calls[0][0]).toHaveLength(2);
    expect(playQueue.mock.calls[0][1]).toBe(0);

    // Ahora suena `trk-airbag`, una **hija**: el `id` de la tarjeta es
    // `rel-ok-computer` y no coincide con el de la pista activa. Antes el botón
    // se quedaba en "Reproducir" y el segundo clic reiniciaba el disco desde
    // la pista 1 en vez de pausar.
    expect(screen.getByRole("button", { name: "Pausar 2 pistas de OK Computer" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pausar 2 pistas de OK Computer" }));
    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(playQueue).toHaveBeenCalledTimes(1);
    expect(playTrack).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4 — los dos casos de "no suena", que NO son el mismo caso
// ---------------------------------------------------------------------------

describe("AudioPlayer — los dos 'no suena' son distintos", () => {
  it("una pista suelta sin fuente: botón apagado con altavoz + frase", () => {
    const { provider: Provider } = montarConReproductorGlobal();
    render(
      createElement(
        Provider,
        null,
        createElement(AudioPlayer, {
          id: "trk-muda",
          title: "Sin fuente",
          src: "—",
          track: { audio_preview_url: "—", spotify_url: null, youtube_video_id: null },
        })
      )
    );

    const boton = screen.getByRole("button", { name: "Reproducir" });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    expect(boton.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByTestId("audio-player-status").textContent).toBe(NO_AUDIO_TEXT);
  });

  it("un lanzamiento sin ninguna pista reproducible: NINGÚN botón y la frase honesta", () => {
    const { provider: Provider } = montarConReproductorGlobal();
    render(
      createElement(
        Provider,
        null,
        createElement(AudioPlayer, {
          id: "rel-mudo",
          src: undefined,
          title: "Álbum mudo",
          track: { audio_preview_url: "—" },
          queue: [
            { id: "trk-a", title: "A", audioUrl: "" },
            { id: "trk-b", title: "B", audioUrl: "—" },
          ],
          hasChildren: true,
        })
      )
    );

    // Ni botón, ni siquiera apagado: un control que no hace nada sobre un disco
    // que sí tiene pistas es ruido, y "no hay audio" sería mentira.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("audio-player-status").textContent).toBe(NO_CHILDREN_TEXT);
    expect(NO_CHILDREN_TEXT).toBe("Ninguna de sus pistas tiene audio disponible");
  });

  it("las dos frases son distintas, y ninguna de las dos se cuela en la otra", () => {
    // Si alguien unifica los dos mensajes, la tarjeta deja de poder decir qué
    // hay que arreglar: una fila sin preview se arregla en el formulario de
    // release, un álbum sin pistas se arregla subiendo pistas.
    expect(NO_AUDIO_TEXT).not.toBe(NO_CHILDREN_TEXT);
    expect(NO_CHILDREN_TEXT).not.toMatch(/^No hay audio/);
  });
});
