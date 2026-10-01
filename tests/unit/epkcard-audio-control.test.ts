// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * RC.33 Ola 1 — `EPKCard` pintaba DOS controles contradictorios en un
 * lanzamiento multipista:
 *
 *   1. un `<button disabled>` con un círculo tachado + "Este lanzamiento no tiene
 *      audio propio"
 *   2. justo debajo, un botón que SÍ reproducía las 12 pistas
 *
 * Decía "no hay audio" sobre una tarjeta que sí lo tenía, y lo decía con el
 * control más inservible que existe. Este es el **primer test del repo que
 * renderiza un componente**: `@testing-library/react` y `jsdom` estaban
 * instalados desde siempre pero ningún test los usaba, así que `tsc` + `vitest`
 * en verde no probaban nada de esta ola.
 *
 * Verificado revirtiendo el arreglo: el caso 1 se pone rojo.
 */

/**
 * `vi.mock` se hoistea por encima del resto del módulo, así que su factory no
 * puede leer una `const` de arriba: se inicializa después y sale
 * `Cannot access 'mockPlayQueue' before initialization`. `vi.hoisted` crea el
 * mock en el momento correcto.
 */
const { mockPlayQueue } = vi.hoisted(() => ({ mockPlayQueue: vi.fn() }));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

/**
 * `AudioPlayer.tsx:43` no usa el hook: hace `useContext(AudioPlayerContext)`
 * directamente, y decide entre reproductor local y global según si el contexto
 * viene informado (línea 100: `globalPlayer ? ... : localPlaying`). Por eso el
 * mock expone **las dos** cosas: el contexto, para el `<AudioPlayer>` anidado, y
 * el hook, para el propio `EPKCard`.
 */
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

const ALBUM = {
  id: "rel-ok-computer",
  title: "OK Computer",
  artist_name: "Radiohead",
  release_type: "album",
  release_date: "1997-05-21",
  status: "approved",
  duration: "53:21",
} as never;

const CHILD = {
  id: "trk-airbag",
  title: "Airbag",
  artist_name: "Radiohead",
  release_id: "rel-ok-computer",
  duration: "4:44",
};

/** Segunda hija: solo cambia el id, para no repetir el objeto entero. */
const CHILD_2 = { ...CHILD, id: "trk-paranoid", title: "Paranoid Android", duration: "6:23" };

/** Dos hijas reproducibles. */
const PLAYABLE_QUEUE = [
  { id: "trk-airbag", title: "Airbag", audioUrl: "https://cdn.example.com/airbag.m4a" },
  { id: "trk-paranoid", title: "Paranoid Android", audioUrl: "https://cdn.example.com/paranoid.m4a" },
] as never;

/** Hijas que existen pero no se pueden reproducir: ni preview ni vídeo. */
const UNPLAYABLE_QUEUE = [
  { id: "trk-airbag", title: "Airbag", audioUrl: "" },
  { id: "trk-paranoid", title: "Paranoid Android", audioUrl: "" },
] as never;

function renderAlbum(queue: unknown, childrenTracks: unknown) {
  return render(
    createElement(EPKCard, {
      track: ALBUM,
      childrenTracks: childrenTracks as never,
      queue: queue as never,
      detailHref: "/releases/rel-ok-computer",
    })
  );
}

beforeEach(() => {
  mockPlayQueue.mockClear();
  cleanup();
});

describe("EPKCard — control de audio de un lanzamiento multipista (RC.33 Ola 1)", () => {
  it("con cola reproducible pinta UN solo control, y es el que funciona", () => {
    renderAlbum(PLAYABLE_QUEUE, [CHILD, CHILD_2]);

    const play = screen.getByRole("button", { name: /Reproducir 2 pistas de OK Computer/ });
    expect(play).toBeTruthy();
    expect((play as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Escuchar 2 pistas/)).toBeTruthy();
  });

  it("no dice NUNCA 'no tiene audio propio' sobre una tarjeta que sí tiene audio", () => {
    const { container } = renderAlbum(PLAYABLE_QUEUE, [CHILD, CHILD_2]);
    expect(container.textContent ?? "").not.toMatch(/no tiene audio propio/i);
  });

  it("no deja ningún botón deshabilitado en la tarjeta", () => {
    const { container } = renderAlbum(PLAYABLE_QUEUE, [CHILD, CHILD_2]);
    const disabled = container.querySelectorAll("button[disabled], button[aria-disabled='true']");
    expect(disabled.length).toBe(0);
  });

  it("el play llama a playQueue con la cola entera empezando en 0", () => {
    renderAlbum(PLAYABLE_QUEUE, [CHILD, CHILD_2]);
    fireClick(screen.getByRole("button", { name: /Reproducir 2 pistas/ }));
    expect(mockPlayQueue).toHaveBeenCalledTimes(1);
    expect(mockPlayQueue.mock.calls[0][1]).toBe(0);
  });

  it("con hijas no reproducibles: ningún control, solo la frase honesta", () => {
    const { container } = renderAlbum(UNPLAYABLE_QUEUE, [CHILD, CHILD_2]);
    expect(screen.queryByRole("button", { name: /Reproducir/ })).toBeNull();
    expect(screen.getByText(/Ninguna de sus pistas tiene audio disponible/)).toBeTruthy();
    // Y tampoco cae en la mentira contraria.
    expect(container.textContent ?? "").not.toMatch(/Escuchar/);
  });

  it("el badge 'Multipista' ya no existe en la tarjeta", () => {
    const { container } = renderAlbum(PLAYABLE_QUEUE, [CHILD, CHILD_2]);
    expect(container.textContent ?? "").not.toMatch(/Multipista/i);
  });

  it("una pista suelta conserva su reproductor normal", () => {
    render(
      createElement(EPKCard, {
        track: { id: "trk-005", title: "Shape of You", artist_name: "Ed Sheeran", release_type: "single", duration: "3:53" } as never,
        detailHref: "/track/trk-005",
      })
    );
    // Sin hijas no hay bloque de lanzamiento: el texto de "no tiene audio" no debe aparecer.
    expect(document.body.textContent ?? "").not.toMatch(/no tiene audio propio/i);
  });
});

/** react-dom no expone fireEvent aquí sin importar más; esto es equivalente. */
function fireClick(el: Element) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}