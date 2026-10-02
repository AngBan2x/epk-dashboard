// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * RC.33 Ola 3 (cierre) — un álbum no tiene playcount propio en Last.fm: el dato
 * está en sus pistas. Si la tarjeta no resuelve las hijas, un álbum con datos
 * reales se ve como "—", que es justo lo que el usuario pidió que se arreglara
 * ("para los álbumes, agregar las de sus hijos").
 *
 * `resolveAlbumMetrics` ya estaba probado como función pura. Lo que faltaba
 * probar era el **cableado**: que `EPKCard` pase el playcount de cada hija. Una
 * función pura verde no dice nada de si la tarjeta se la pasa.
 */

const { mockPlayQueue } = vi.hoisted(() => ({ mockPlayQueue: vi.fn() }));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

vi.mock("@/context/AudioPlayerContext", async () => {
  const { createContext } = await import("react");
  const globalPlayer = {
    playQueue: mockPlayQueue,
    playTrack: vi.fn(),
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
  default: ({ alt, src }: { alt?: string; src?: unknown }) =>
    createElement("img", { alt: alt ?? "", src: typeof src === "string" ? src : "/cover.jpg" }),
}));

import { EPKCard } from "@/components/EPKCard";

/** El álbum: sin métricas curadas, sin YouTube. Todo el dato está en las hijas. */
const ALBUM = {
  id: "rel-dsotm",
  title: "The Dark Side of the Moon",
  artist_name: "Pink Floyd",
  release_type: "album",
  release_date: "1973-03-01",
  status: "approved",
  duration: "42:36",
  metrics: null,
} as never;

const CHILDREN = [
  { id: "trk-money", title: "Money", artist_name: "Pink Floyd", duration: "4:22", metrics: null },
  { id: "trk-eclipse", title: "Eclipse", artist_name: "Pink Floyd", duration: "4:18", metrics: null },
] as never;

beforeEach(() => {
  mockPlayQueue.mockClear();
  cleanup();
});

/**
 * El separador de miles depende del locale (`formatNumber` usa `es-VE`), y
 * cambiar de locale en el runner cambiaría el texto. Comparar sobre los dígitos
 * hace el test estable sin duplicar la implementacion de `formatNumber`.
 */
function renderedStreams(): string {
  const node = document.querySelector('[data-testid="epkcard-streams"]');
  if (!node) throw new Error("no hay nodo de streams en la tarjeta");
  return (node.textContent ?? "").replace(/\D/g, "");
}

describe("EPKCard — un álbum sin dato propio se alimenta de sus hijas (RC.33)", () => {
  it("suma el playcount de las hijas y lo atribuye a Last.fm", () => {
    render(
      createElement(EPKCard, {
        track: ALBUM,
        childrenTracks: CHILDREN,
        lastfmByTrack: { "trk-money": 15740854, "trk-eclipse": 8000000 },
        detailHref: "/releases/rel-dsotm",
      })
    );
    // 15.740.854 + 8.000.000
    expect(renderedStreams()).toBe("23740854");
  });

  it("sin el mapa de hijas vuelve a '—', y no a 0", () => {
    render(
      createElement(EPKCard, {
        track: ALBUM,
        childrenTracks: CHILDREN,
        detailHref: "/releases/rel-dsotm",
      })
    );
    expect(renderedStreams()).toBe("");
  });

  it("una hija con entrada y otra sin ella: suma solo la que tiene", () => {
    render(
      createElement(EPKCard, {
        track: ALBUM,
        childrenTracks: CHILDREN,
        lastfmByTrack: { "trk-money": 1000 },
        detailHref: "/releases/rel-dsotm",
      })
    );
    expect(renderedStreams()).toBe("1000");
  });

  it("métricas curadas del padre ganan a las hijas: no se mezclan fuentes", () => {
    render(
      createElement(EPKCard, {
        track: {
          ...(ALBUM as object),
          metrics: { streams: 500, saves: 1, playlist_additions: 0, top_countries: [] },
        } as never,
        childrenTracks: CHILDREN,
        lastfmByTrack: { "trk-money": 15740854, "trk-eclipse": 8000000 },
        detailHref: "/releases/rel-dsotm",
      })
    );
    // 500 curados + 15740854 de una hija que NO tiene curados, pero la fuente
    // elegida es "itunes", asi que las hijas de Last.fm se ignoran enteras.
    expect(renderedStreams()).toBe("500");
  });
});
