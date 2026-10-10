// @vitest-environment jsdom
/**
 * ## Qué protege este fichero
 *
 * Que la tarjeta del álbum **monte el reproductor con una cola de verdad**, y no
 * que lo monte "más o menos".
 *
 * El commit `4592bd3` añadió el `<AudioPlayer>` a `EPKCard` para el caso álbum,
 * pero dejó la decisión de si podía sonar dentro de `AudioPlayer`, que solo
 * miraba la fila cabecera. Como la cabecera de un lanzamiento no tiene audio
 * propio por definición, el botón salía apagado y la tarjeta de *OK Computer*
 * decía "No hay audio disponible" sobre un disco con pistas reproducibles. Los
 * 6 tests que lo cazaban (`epkcard-audio-control.test.ts`) estaban en rojo y el
 * commit se dio por bueno porque los tests **nuevos** eran aserciones vacías
 * (`true` contra `true`, que no miran nada).
 *
 * Aquí se comprueba lo que de verdad importa y que se puede comprobar:
 *
 * 1. La cola la construye **la tarjeta** con `buildReleaseQueue`, la misma
 *    función que usa `ReleaseTrackList`. Se pasa **sin** la prop `queue`, a
 *    propósito: si el test le pasara la cola ya montada, pasaría igual con
 *    `buildReleaseQueue` roto.
 * 2. Un álbum con hijas reproducibles pinta "Reproducir N pistas de <título>".
 * 3. Un álbum con hijas y **ninguna** reproducible no pinta botón y dice la
 *    frase exacta.
 * 4. Una pista suelta sigue siendo una pista suelta: botón "Reproducir", nada
 *    de "pistas", y sin frase de álbum.
 *
 * `// @vitest-environment jsdom` porque `vitest.config.ts:22` pone `node` por
 * defecto, y `createElement` en vez de JSX porque `include` solo recoge
 * `.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const { mockPlayQueue, mockPlayTrack } = vi.hoisted(() => ({
  mockPlayQueue: vi.fn(),
  mockPlayTrack: vi.fn(),
}));

/** `EPKCard` pide el usuario para el like; sin usuario, no toca la API de likes. */
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

/**
 * El contexto se monta con `createContext(globalPlayer)`, o sea como **valor por
 * defecto**: `AudioPlayer` hace `useContext(AudioPlayerContext)` y no pasa por
 * un Provider. Con `activeTrack: null` y `isPlaying: false` fijo se comprueba el
 * estado inicial, que es donde viven las etiquetas.
 */
vi.mock("@/context/AudioPlayerContext", async () => {
  const { createContext } = await import("react");
  const globalPlayer = {
    playQueue: mockPlayQueue,
    playTrack: mockPlayTrack,
    togglePlay: vi.fn(),
    activeTrack: null,
    isPlaying: false,
    isLoading: false,
    error: null,
  };
  return {
    AudioPlayerContext: createContext(globalPlayer),
    AudioPlayerProvider: ({ children }: { children: unknown }) => children,
    useAudioPlayer: () => globalPlayer,
  };
});

vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => createElement("img", { alt: alt ?? "", src: "/c.jpg" }),
}));

import { EPKCard } from "@/components/EPKCard";

beforeEach(() => {
  mockPlayQueue.mockClear();
  mockPlayTrack.mockClear();
  // `EPKCard` pide los likes al montar; sin red, el efecto falla en silencio
  // (`catch {}`) pero ensucia el stderr con un error por test.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** La fila cabecera de *OK Computer*: por definición no tiene audio propio. */
const CABECERA = {
  id: "rel-ok-computer",
  title: "OK Computer",
  artist_name: "Radiohead",
  release_type: "album",
  release_date: "1997-05-21",
  duration: "00:00",
  audio_preview_url: "—",
} as never;

/** Hija con preview propio: es la vía normal de una pista del catálogo. */
const HIJA_CON_PREVIEW = (id: string, title: string) => ({
  id,
  title,
  artist_name: "Radiohead",
  release_id: "rel-ok-computer",
  duration: "4:00",
  audio_preview_url: `https://audio-ssl.itunes.apple.com/${id}.m4p`,
});

/** Hija sin preview ni vídeo: existe en el catálogo y no suena. */
const HIJA_MUDA = (id: string, title: string) => ({
  id,
  title,
  artist_name: "Radiohead",
  release_id: "rel-ok-computer",
  duration: "4:00",
  audio_preview_url: "—",
  youtube_video_id: null,
});

describe("EPKCard — el álbum monta la cola él mismo", () => {
  it("sin prop `queue`: construye la cola con buildReleaseQueue y cuenta las pistas", () => {
    // Deliberadamente **sin** `queue`. Si el test se la pasara ya montada,
    // pasaría igual con `buildReleaseQueue` roto, que es el bug que había.
    render(
      createElement(EPKCard, {
        track: CABECERA,
        childrenTracks: [
          HIJA_CON_PREVIEW("trk-airbag", "Airbag"),
          HIJA_CON_PREVIEW("trk-paranoid", "Paranoid Android"),
        ] as never,
        detailHref: "/releases/rel-ok-computer",
      })
    );

    const boton = screen.getByRole("button", { name: /Reproducir 2 pistas de OK Computer/ });
    expect((boton as HTMLButtonElement).disabled).toBe(false);
    expect(document.body.textContent ?? "").toMatch(/Reproducir • 2 pistas/);
  });

  it("la cola que construyó es la que se le pasa a playQueue, con la portada del álbum", () => {
    render(
      createElement(EPKCard, {
        track: CABECERA,
        childrenTracks: [
          HIJA_CON_PREVIEW("trk-airbag", "Airbag"),
          HIJA_CON_PREVIEW("trk-paranoid", "Paranoid Android"),
        ] as never,
        detailHref: "/releases/rel-ok-computer",
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /Reproducir 2 pistas de OK Computer/ }));

    expect(mockPlayQueue).toHaveBeenCalledTimes(1);
    const [cola, indice] = mockPlayQueue.mock.calls[0] as [Array<{ id: string; title: string }>, number];
    expect(indice).toBe(0);
    expect(cola.map((t) => t.id)).toEqual(["trk-airbag", "trk-paranoid"]);
    // `buildReleaseQueue` es la fuente única: si la tarjeta construyera la cola
    // por su cuenta, estos títulos saldrían de otro sitio (y es lo que pasó:
    // dos copias de la construcción divergen).
    expect(cola.map((t) => t.title)).toEqual(["Airbag", "Paranoid Android"]);
  });

  it("las hijas mudas no cuentan ni entran en la cola", () => {
    render(
      createElement(EPKCard, {
        track: CABECERA,
        childrenTracks: [
          HIJA_CON_PREVIEW("trk-airbag", "Airbag"),
          HIJA_MUDA("trk-muda", "Muda"),
          HIJA_CON_PREVIEW("trk-paranoid", "Paranoid Android"),
        ] as never,
        detailHref: "/releases/rel-ok-computer",
      })
    );

    // "3 pistas" sobre una cola que solo reproduce 2 no cuadraría con el
    // contador "2/3" del reproductor global.
    expect(screen.getByRole("button", { name: /Reproducir 2 pistas de OK Computer/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Reproducir 2 pistas de OK Computer/ }));
    const [cola] = mockPlayQueue.mock.calls[0] as [Array<{ id: string }>];
    expect(cola.map((t) => t.id)).not.toContain("trk-muda");
  });

  it("con una sola hija reproducible, el singular", () => {
    render(
      createElement(EPKCard, {
        track: CABECERA,
        childrenTracks: [HIJA_CON_PREVIEW("trk-airbag", "Airbag")] as never,
        detailHref: "/releases/rel-ok-computer",
      })
    );
    expect(document.body.textContent ?? "").toMatch(/Reproducir • 1 pista(?!s)/);
  });
});

describe("EPKCard — el álbum sin audio NO lleva botón", () => {
  it("ningún botón, y la frase exacta, sin punto final", () => {
    const { container } = render(
      createElement(EPKCard, {
        track: CABECERA,
        childrenTracks: [HIJA_MUDA("trk-a", "A"), HIJA_MUDA("trk-b", "B")] as never,
        detailHref: "/releases/rel-ok-computer",
      })
    );

    expect(screen.queryByRole("button", { name: /Reproducir/ })).toBeNull();
    expect(screen.getByText(/Ninguna de sus pistas tiene audio disponible/)).toBeTruthy();
    // El texto completo, para que nadie "arregle" el string añadiendo un punto.
    expect(container.textContent).toContain("Ninguna de sus pistas tiene audio disponible");

    // Y ni una palabra que prometa reproducción.
    expect(container.textContent ?? "").not.toMatch(/Reproducir/);
    expect(container.textContent ?? "").not.toMatch(/Escuchar/);
  });

  it("tampoco cae en la otra mentira: 'no hay audio' es de las filas, no del álbum", () => {
    const { container } = render(
      createElement(EPKCard, {
        track: CABECERA,
        childrenTracks: [HIJA_MUDA("trk-a", "A")] as never,
        detailHref: "/releases/rel-ok-computer",
      })
    );
    expect(container.textContent ?? "").not.toMatch(/No hay audio disponible/);
    expect(container.textContent ?? "").not.toMatch(/no tiene audio propio/i);
  });

  it("pero una fila hija **suelta** sin audio sí lleva botón apagado", () => {
    // La asimetría es el contrato: para una fila el botón explica qué le pasa a
    // esa fila; para un álbum no hay fila que explicar, hay pistas que subir.
    render(
      createElement(EPKCard, {
        track: {
          id: "trk-suelta",
          title: "Suelta",
          artist_name: "X",
          release_type: "single",
          duration: "3:00",
          audio_preview_url: "—",
        } as never,
        detailHref: "/track/trk-suelta",
      })
    );

    const boton = screen.getByRole("button", { name: "Reproducir" });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("No hay audio disponible")).toBeTruthy();
  });
});

describe("EPKCard — una pista suelta no se convierte en álbum", () => {
  it("sin hijas: botón 'Reproducir' corto y etiqueta de la fuente real", () => {
    render(
      createElement(EPKCard, {
        track: {
          id: "trk-005",
          title: "Shape of You",
          artist_name: "Ed Sheeran",
          release_type: "single",
          duration: "3:53",
          audio_preview_url: "https://audio-ssl.itunes.apple.com/shape.m4p",
        } as never,
        detailHref: "/track/trk-005",
      })
    );

    // El nombre accesible corto es el que localizan los 20 specs E2E con
    // `button[aria-label="Reproducir"]`: aquí no hay N ni título de álbum.
    expect(screen.getByRole("button", { name: "Reproducir" })).toBeTruthy();
    expect(document.body.textContent ?? "").toMatch(/Reproducir • Preview \(30s\)/);
    expect(document.body.textContent ?? "").not.toMatch(/pistas/);
    expect(document.body.textContent ?? "").not.toMatch(/Ninguna de sus pistas/);
  });

  it("y una pista con Spotify + YouTube no se anuncia como Spotify", () => {
    render(
      createElement(EPKCard, {
        track: {
          id: "trk-006",
          title: "Airbag",
          artist_name: "Radiohead",
          release_type: "single",
          duration: "4:44",
          spotify_url: "https://open.spotify.com/track/5ghIJDpPex3bJPsFkqkR6P",
          youtube_video_id: "XqZsoesa55w",
        } as never,
        detailHref: "/track/trk-006",
      })
    );

    const texto = document.body.textContent ?? "";
    expect(texto).toMatch(/Reproducir • YouTube/);
    expect(texto).not.toMatch(/Spotify/);
  });
});

describe("EPKCard — no queda ni una sombra del reproductor eliminado", () => {
  it("no monta StemsPlayer ni LyricsModal, y la tarjeta no los menciona", () => {
    const { container } = render(
      createElement(EPKCard, {
        track: CABECERA,
        childrenTracks: [HIJA_CON_PREVIEW("trk-airbag", "Airbag")] as never,
        detailHref: "/releases/rel-ok-computer",
      })
    );

    const html = container.innerHTML;
    expect(html).not.toMatch(/StemsPlayer/);
    expect(html).not.toMatch(/LyricsModal/);
    // Y solo hay UN control de audio: el del reproductor consolidado.
    expect(container.querySelectorAll("audio, [data-stems], [data-lyrics]")).toHaveLength(0);
  });
});
