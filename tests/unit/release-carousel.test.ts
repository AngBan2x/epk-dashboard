// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * RC.33 Ola 7 — el carrusel horizontal de releases de `/dashboard`, 4 por página.
 *
 * ── Por qué este test ───────────────────────────────────────────────────────
 *
 * Lo caro de esta ola no es que el carrusel se pinte: es que
 * **`slidesToScroll` tiene que ser igual al número de slides visibles**. Con 4
 * visibles y `slidesToScroll: 1`, `scrollNext()` desplaza un slide, quedan 3 a la
 * vista y se lee como un glitch. Y con un 4 fijo se rompe en el otro sentido:
 * a `sm` hay 2 visibles y Embla agruparía los snaps de cuatro en cuatro, así
 * que `scrollNext()` saltaría una página entera y los slides 2 y 3 no se verían
 * nunca.
 *
 * Ese invariante es comprobable sin navegador, y aquí se comprueba en los dos
 * sitios donde puede romperse: en el escalonado de `lib/carousel.ts` y en las
 * opciones que el hook entrega a Embla.
 *
 * ── Por qué Embla va mockeado ───────────────────────────────────────────────
 *
 * El Embla real necesita `ResizeObserver` e `IntersectionObserver`, que jsdom no
 * implementa, y mediría un DOM sin layout. Lo que importa aquí no es que el
 * motor calcule los snaps, sino **qué recibe**: si `slidesToScroll` y
 * `breakpoints` son correctos, el motor hace su trabajo. Así que el mock
 * captura las opciones y devuelve una API mínima, y el test afirma sobre las
 * opciones y sobre el DOM que produce el componente.
 */

const { emblaOptions, emblaState } = vi.hoisted(() => ({
  emblaOptions: [] as Array<Record<string, unknown>>,
  /** Cuántos snaps reporta la API falsa; lo fija cada test. */
  emblaState: { snaps: [0] as number[] },
}));

vi.mock("embla-carousel-react", async () => {
  return {
    default: (options: Record<string, unknown>) => {
      emblaOptions.push(options);
      // El primer elemento del par es el ref callback del viewport. Aquí no hay
      // motor que inicializar, así que es un no-op: React lo llama con el nodo al
      // montar y con `null` al desmontar, y no pasa nada en ninguno de los dos.
      const noopRef = () => {};
      return [
        noopRef,
        {
          on: vi.fn(),
          off: vi.fn(),
          selectedScrollSnap: () => 0,
          scrollSnapList: () => emblaState.snaps,
          canScrollPrev: () => false,
          canScrollNext: () => false,
          scrollNext: vi.fn(),
          scrollPrev: vi.fn(),
          scrollTo: vi.fn(),
          reInit: vi.fn(),
        },
      ];
    },
  };
});

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

vi.mock("@/context/AudioPlayerContext", async () => {
  const { createContext } = await import("react");
  const globalPlayer = {
    playQueue: vi.fn(),
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

import {
  artistSlidesPerView,
  defaultEmblaOptions,
  emblaBreakpoints,
  releaseSlidesPerView,
  slidesPerViewAt,
} from "@/lib/carousel";
import { CatalogReleaseCarousel } from "@/components/dashboard/CatalogReleaseCarousel";
import { CatalogArtistsCarousel } from "@/components/dashboard/CatalogArtistsCarousel";

import type { Track } from "@/types/music";
import type { ArtistProfile } from "@/types/music";

/** `min-width` de cada escalón, para iterar sin reescribir 640/1024/1280. */
const CUTS = releaseSlidesPerView.map((step) => step.minWidth);

/** La clave de media query que `emblaBreakpoints` genera para un corte. */
const keyFor = (minWidth: number) => `(min-width: ${minWidth}px)`;

/** La última capa de opciones que recibió Embla (la del último render). */
function lastOptions(): Record<string, never> {
  const last = emblaOptions[emblaOptions.length - 1];
  if (!last) throw new Error("Embla no recibió ninguna capa de opciones");
  return last as Record<string, never>;
}

function track(id: string, over: Partial<Track> = {}): Track {
  return {
    id,
    title: `Lanzamiento ${id}`,
    artist_name: "Radiohead",
    release_type: "single",
    release_date: "1997-09-22",
    duration: "5:15",
    cover_image: "https://example.com/cover.jpg",
    audio_preview_url: "https://example.com/audio.mp3",
    spotify_url: null,
    youtube_video_id: null,
    metrics: null,
    production_details: {} as Track["production_details"],
    lyrics: null,
    status: "approved",
    ...over,
  };
}

function tracks(n: number): Track[] {
  return Array.from({ length: n }, (_, i) => track(`rel-${i}`));
}

/**
 * Props del padre. Las tres funciones son las que `app/dashboard/page.tsx`
 * ya tenía (`cardProps`, `statsFor`, `lastfmFor`): el carrusel no debe
 * recalcular nada, solo reenviarlas.
 */
function parentProps(over: Partial<Record<string, unknown>> = {}) {
  return {
    getCardProps: (t: Track) => ({ detailHref: `/releases/${t.id}` }),
    getYoutubeStats: (t: Track) =>
      t.id === "rel-0" ? { viewCount: 1234, likeCount: 56 } : null,
    getLastfmPlaycount: (t: Track) => (t.id === "rel-0" ? 987654 : null),
    lastfmByTrack: {},
    onLoginPrompt: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  emblaOptions.length = 0;
  emblaState.snaps = [0];
  cleanup();
  // `ShowsBooking` (montado por el carrusel de artistas) pide `/api/shows` al
  // montar. Se responde en local: este test no sale a la red.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ shows: [] }) }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ────────────────────────────────────────────────────────────────────────── */
/* 1. lib/carousel.ts — el invariante caro, sin DOM                            */
/* ────────────────────────────────────────────────────────────────────────── */

describe("slidesPerViewAt — cuántos slides por página a cada ancho", () => {
  it("1 en móvil, 2 en tablet, 3 en laptop y 4 en escritorio", () => {
    expect(slidesPerViewAt(releaseSlidesPerView, 390)).toBe(1);
    expect(slidesPerViewAt(releaseSlidesPerView, 700)).toBe(2);
    expect(slidesPerViewAt(releaseSlidesPerView, 1100)).toBe(3);
    expect(slidesPerViewAt(releaseSlidesPerView, 1440)).toBe(4);
  });

  it("gana el corte MÁS ANCHO que casa, no el más estrecho", () => {
    // A 1440 casan los tres media queries a la vez. Si la función cogiera el
    // primero que encuentra, aquí daría 2 y el escritorio se quedaría en 2.
    expect(slidesPerViewAt(releaseSlidesPerView, 1920)).toBe(4);
    expect(slidesPerViewAt(releaseSlidesPerView, 1024)).toBe(3);
  });

  it("el corte es inclusivo: min-width empieza en el propio ancho del corte", () => {
    for (const step of releaseSlidesPerView) {
      expect(slidesPerViewAt(releaseSlidesPerView, step.minWidth)).toBe(step.slides);
    }
  });

  it("por debajo del corte más bajo sigue habiendo 1, y nunca 0", () => {
    // 320px es el viewport más estrecho que se soporta; el paso `{minWidth: 0}`
    // existe para que esto no devuelva `undefined`.
    expect(slidesPerViewAt(releaseSlidesPerView, 320)).toBe(1);
    expect(slidesPerViewAt(releaseSlidesPerView, 0)).toBe(1);
  });
});

describe("emblaBreakpoints — la traducción al mapa nativo de Embla", () => {
  it("emite un breakpoint por escalón por encima del base, y ninguno de más", () => {
    expect(emblaBreakpoints(releaseSlidesPerView)).toEqual({
      "(min-width: 640px)": { slidesToScroll: 2 },
      "(min-width: 1024px)": { slidesToScroll: 3 },
      "(min-width: 1280px)": { slidesToScroll: 4 },
    });
  });

  it("NO emite el escalón `{minWidth: 0}`", () => {
    // Si se emitiera, su clave sería `(min-width: 0px)`, que casa SIEMPRE y,
    // como Embla fusiona en orden de inserción, aplastaría a los otros tres.
    // El 1 del base viene de `defaultEmblaOptions.slidesToScroll`.
    expect(keyFor(0) in emblaBreakpoints(releaseSlidesPerView)).toBe(false);
  });

  it("el orden de las claves es ascendente: Embla fusiona por orden de inserción", () => {
    // El orden no es cosmético. `optionsAtMedia` de Embla fusiona todas las
    // media queries que casan en el orden de sus claves, así que con las claves
    // al revés el último escalón sería el que ganara y 4 se quedaría en 2.
    const keys = Object.keys(emblaBreakpoints(releaseSlidesPerView));
    const widths = keys.map((k) => Number(/(\d+)px/.exec(k)?.[1] ?? 0));
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
  });

  it("slidesToScroll == slides visibles, en TODOS los cortes a la vez", () => {
    // El test que protege el bug caro. Para cada corte se compara lo que Embla
    // acabará aplicando con lo que realmente habrá en pantalla. No basta con el
    // caso de escritorio: un 4 fijo pasa en 1440px y falla en 700px.
    const breakpoints = emblaBreakpoints(releaseSlidesPerView);
    const samples = [320, 390, 700, 1024, 1100, 1440, 1920];
    for (const width of samples) {
      const visible = slidesPerViewAt(releaseSlidesPerView, width);
      const step = [...releaseSlidesPerView]
        .reverse()
        .find((s) => s.minWidth <= width && s.minWidth > 0);
      const embla = step
        ? breakpoints[keyFor(step.minWidth)].slidesToScroll
        : defaultEmblaOptions.slidesToScroll;
      expect(embla, `slidesToScroll debe ser ${visible} a ${width}px`).toBe(visible);
    }
  });

  it("con 2 visibles slidesToScroll es 2, no 4 (el salto de página entera)", () => {
    // El modo de fallo concreto: con `slidesToScroll: 4` fijo y 2 visibles,
    // `scrollNext()` agruparía los snaps de cuatro en cuatro y los slides 2 y 3
    // no aparecerían nunca.
    expect(emblaBreakpoints(releaseSlidesPerView)[keyFor(640)].slidesToScroll).toBe(2);
  });
});

describe("Retrocompatibilidad — el carrusel de artistas sigue con 1 por página", () => {
  it("su escalonado no produce ningún breakpoint", () => {
    expect(emblaBreakpoints(artistSlidesPerView)).toEqual({});
  });

  it("su valor sigue siendo 1 en cualquier ancho", () => {
    for (const width of [320, 390, 700, 1024, 1440, 1920]) {
      expect(slidesPerViewAt(artistSlidesPerView, width)).toBe(1);
    }
  });

  it("el default de lib/carousel.ts no se movió de 1", () => {
    // El valor por defecto del que hereda el consumidor de artistas. Si alguien lo
    // subiera a 4 "porque el carrusel de releases usa 4", el carrusel de artistas
    // avanzaría 4 slides sin verlos y este test lo pararía.
    expect(defaultEmblaOptions.slidesToScroll).toBe(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* 2. CatalogReleaseCarousel — lo que el componente entrega a Embla y al DOM  */
/* ────────────────────────────────────────────────────────────────────────── */

describe("CatalogReleaseCarousel — opciones que llegan a Embla", () => {
  it("el base es 1 slide por avance y el 4 llega por breakpoint de escritorio", () => {
    render(createElement(CatalogReleaseCarousel, { tracks: tracks(8), ...parentProps() }));
    const options = lastOptions();

    expect(options.slidesToScroll).toBe(1);
    expect(options.breakpoints).toEqual({
      "(min-width: 640px)": { slidesToScroll: 2 },
      "(min-width: 1024px)": { slidesToScroll: 3 },
      "(min-width: 1280px)": { slidesToScroll: 4 },
    });
  });

  it("no hace loop, y con align start + trimSnaps los snaps caen en páginas completas", () => {
    render(createElement(CatalogReleaseCarousel, { tracks: tracks(8), ...parentProps() }));
    const options = lastOptions();

    // `loop: false` es lo que hace que `trimSnaps` sirva de algo: con loop, los
    // slides clonados multiplican el ancho del track y los snaps dejan de caer en
    // los bordes de página.
    expect(options.loop).toBe(false);
    expect(options.align).toBe("start");
    expect(options.containScroll).toBe("trimSnaps");
  });

  it("el track va con gap-0 para que 4 × basis-1/4 quepan en el 100%", () => {
    const { container } = render(
      createElement(CatalogReleaseCarousel, { tracks: tracks(8), ...parentProps() })
    );
    const track = container.querySelector(".flex");

    // Con `gap-3` los cuatro items a `basis-1/4` sumarían 100% + 36px y la
    // cuarta tarjeta quedaría cortada por el `overflow-hidden` del viewport.
    expect(track?.className).toContain("gap-0");
    expect(track?.className).not.toContain("gap-3");
  });
});

describe("CatalogReleaseCarousel — los slides del DOM", () => {
  it("con N releases monta N slides, con su etiqueta accesible correcta", () => {
    render(createElement(CatalogReleaseCarousel, { tracks: tracks(5), ...parentProps() }));

    const slides = screen.getAllByRole("group");
    expect(slides).toHaveLength(5);
    for (const slide of slides) {
      expect(slide.getAttribute("aria-roledescription")).toBe("slide");
    }
    expect(screen.getByLabelText("Lanzamiento 1 de 5")).toBeTruthy();
    expect(screen.getByLabelText("Lanzamiento 5 de 5")).toBeTruthy();
    // Y el total del rotulado es el de releases, no el de artistas.
    expect(screen.queryByLabelText(/^Artista /)).toBeNull();
  });

  it("la región se anuncia como carrusel de lanzamientos, no de artistas", () => {
    render(createElement(CatalogReleaseCarousel, { tracks: tracks(3), ...parentProps() }));

    const region = screen.getByRole("region");
    expect(region.getAttribute("aria-roledescription")).toBe("carousel");
    expect(region.getAttribute("aria-label")).toBe("Catálogo de lanzamientos");
  });

  it("el ancho de cada slide sigue a slidesPerViewAt en todos los cortes", () => {
    // La defensa de que el CSS y el escalonado de `lib/carousel.ts` no se
    // separen. Las clases están escritas a mano en el componente porque Tailwind
    // no escanea clases construidas; este test ata las dos mitades.
    const { container } = render(
      createElement(CatalogReleaseCarousel, { tracks: tracks(4), ...parentProps() })
    );
    const slide = container.querySelector('[aria-roledescription="slide"]');
    const className = slide?.className ?? "";

    // El base siempre está, y las variantes responsivas suben de uno en uno.
    expect(className).toContain("basis-full");
    for (const [minWidth, columnClass, expectedSlides] of [
      [640, "sm:basis-1/2", 2],
      [1024, "lg:basis-1/3", 3],
      [1280, "xl:basis-1/4", 4],
    ] as const) {
      expect(className, `falta el ancho del corte ${minWidth}px`).toContain(columnClass);
      // Y el corte existe de verdad en el escalonado que alimenta a Embla, con
      // el MISMO número de slides por página que el que implica la clase:
      // `basis-1/4` son 4 slides por página, no 1/4 de slide.
      expect(CUTS).toContain(minWidth);
      expect(slidesPerViewAt(releaseSlidesPerView, minWidth)).toBe(expectedSlides);
    }
  });

  it("cada slide lleva su aire propio de 12px entre tarjetas", () => {
    const { container } = render(
      createElement(CatalogReleaseCarousel, { tracks: tracks(4), ...parentProps() })
    );
    const slide = container.querySelector('[aria-roledescription="slide"]');

    expect(slide?.className).toContain("px-1.5");
  });
});

describe("CatalogReleaseCarousel — contenido y estados", () => {
  it("con 0 releases enseña el estado vacío y NO monta el carrusel", () => {
    const { container } = render(
      createElement(CatalogReleaseCarousel, { tracks: [], ...parentProps() })
    );

    expect(screen.getByText("No se encontraron tracks.")).toBeTruthy();
    expect(container.querySelector('[aria-roledescription="carousel"]')).toBeNull();
    expect(container.querySelector('[aria-roledescription="slide"]')).toBeNull();
    // Y no se pintó ninguna tarjeta: el mensaje va en su lugar, no encima de un
    // carrusel vacío.
    expect(container.querySelector("img")).toBeNull();
  });

  it("con una sola página los dots no se montan", () => {
    emblaState.snaps = [0];
    render(createElement(CatalogReleaseCarousel, { tracks: tracks(3), ...parentProps() }));

    expect(screen.queryByLabelText("Ir al lanzamiento 1")).toBeNull();
    expect(screen.getByText("Página 1 de 1")).toBeTruthy();
  });

  it("con varias páginas los dots aparecen, uno por página y en el de \"lanzamiento\"", () => {
    emblaState.snaps = [0, 0.25, 0.5];
    render(createElement(CatalogReleaseCarousel, { tracks: tracks(12), ...parentProps() }));

    expect(screen.getByLabelText("Ir al lanzamiento 1")).toBeTruthy();
    expect(screen.getByLabelText("Ir al lanzamiento 3")).toBeTruthy();
    expect(screen.getByText("Página 1 de 3")).toBeTruthy();
    // Y el del segundo page está marcado como el actual.
    expect(screen.getByLabelText("Ir al lanzamiento 1").getAttribute("aria-current")).toBe("true");
  });

  it("las flechas se llaman por lanzamiento, no por artista", () => {
    render(createElement(CatalogReleaseCarousel, { tracks: tracks(8), ...parentProps() }));

    expect(screen.getByLabelText("Lanzamiento anterior")).toBeTruthy();
    expect(screen.getByLabelText("Lanzamiento siguiente")).toBeTruthy();
    expect(screen.queryByLabelText("Artista anterior")).toBeNull();
  });

  it("reenvía las props que ya resolvía el padre, sin recalcularlas", () => {
    const onLoginPrompt = vi.fn();
    const getCardProps = vi.fn((t: Track) => ({
      detailHref: `/releases/${t.id}`,
      queue: [{ id: t.id, title: t.title }] as never,
    }));
    const getYoutubeStats = vi.fn(() => ({ viewCount: 1234, likeCount: 56 }));
    const getLastfmPlaycount = vi.fn(() => 987654);

    render(
      createElement(CatalogReleaseCarousel, {
        tracks: tracks(4),
        getCardProps,
        getYoutubeStats,
        getLastfmPlaycount,
        lastfmByTrack: { "rel-1": 42 },
        onLoginPrompt,
      })
    );

    // Una llamada por slide y por render: se comprueba el conjunto de filas por
    // las que pasó, no el número de veces. Si el carrusel reconstruyera las
    // props en vez de reenviarlas, estas funciones se llamarían siempre con el
    // mismo argumento y la tarjeta de un álbum mentiría.
    //
    // El conteo no sirve aquí porque `useCarousel` hace `setScrollSnaps` en un
    // efecto y eso re-renderiza: el número de llamadas depende de cuántos
    // renders hubo, no de la lógica de las props.
    const asked = (fn: { mock: { calls: unknown[][] } }) =>
      [...new Set(fn.mock.calls.map((c) => (c[0] as Track).id))].sort();

    expect(asked(getCardProps)).toEqual(["rel-0", "rel-1", "rel-2", "rel-3"]);
    expect(asked(getYoutubeStats)).toEqual(["rel-0", "rel-1", "rel-2", "rel-3"]);
    expect(asked(getLastfmPlaycount)).toEqual(["rel-0", "rel-1", "rel-2", "rel-3"]);

    // Nada de esto se pide al usuario hasta que el suyo: el login lo sigue
    // disparando la tarjeta, no el carrusel.
    expect(onLoginPrompt).not.toHaveBeenCalled();
  });

  it("el mapa de playcounts de las hijas llega a cada tarjeta", () => {
    render(
      createElement(CatalogReleaseCarousel, {
        tracks: tracks(2),
        ...parentProps({ lastfmByTrack: { "rel-0": 1000, "rel-1": 2000 } }),
      })
    );

    // Con `childrenTracks` ausente, `EPKCard` no suma hijas, pero el prop tiene
    // que haber llegado: un álbum con hijas en producción depende de ello para
    // no enseñarse como "—".
    expect(screen.queryByText("No se encontraron tracks.")).toBeNull();
    expect(screen.getAllByRole("group")).toHaveLength(2);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* 3. CatalogArtistsCarousel — lo que NO debe cambiar                          */
/* ────────────────────────────────────────────────────────────────────────── */

describe("Retrocompatibilidad — CatalogArtistsCarousel sigue como estaba", () => {
  function artist(id: string): ArtistProfile {
    return {
      id,
      name: id,
      user_id: null,
      biography: null,
      press_text: null,
      press_highlights: null,
      genre: "Techno",
      location: "Valencia",
      monthly_listeners: 100,
      social_links: null,
      profile_image: null,
      banner_image: null,
      slug: null,
      is_active: true,
      deleted_at: null,
      created_at: "2024-01-01T00:00:00.000Z",
    };
  }

  it("sigue con slidesToScroll 1 y sin breakpoints en ningún ancho", () => {
    render(
      createElement(CatalogArtistsCarousel, {
        artists: [artist("a"), artist("b"), artist("c")],
        showsByArtist: {},
      })
    );

    const options = lastOptions();
    expect(options.slidesToScroll).toBe(1);
    expect(options.breakpoints).toEqual({});
    expect(options.loop).toBe(false);
  });

  it("sus slides siguen siendo de página completa y con etiqueta de artista", () => {
    const { container } = render(
      createElement(CatalogArtistsCarousel, {
        artists: [artist("a"), artist("b")],
        showsByArtist: {},
      })
    );

    const slides = screen.getAllByRole("group");
    expect(slides).toHaveLength(2);
    for (const slide of slides) {
      expect(slide.className).toContain("basis-full");
      // Sin ninguna clase `basis` responsiva: un slide de artista a 1/4 de ancho
      // es el defecto que C3 corrigió.
      expect(slide.className).not.toMatch(/(sm|lg|xl):basis/);
    }
    expect(screen.getByLabelText("Artista 1 de 2")).toBeTruthy();
    expect(container.querySelector(".gap-3")).not.toBeNull();
  });

  it("sus flechas siguen llamándose \"Artista\" y sus dots \"artista\"", () => {
    emblaState.snaps = [0, 0.5];
    render(
      createElement(CatalogArtistsCarousel, {
        artists: [artist("a"), artist("b")],
        showsByArtist: {},
      })
    );

    expect(screen.getByLabelText("Artista anterior")).toBeTruthy();
    expect(screen.getByLabelText("Artista siguiente")).toBeTruthy();
    expect(screen.getByLabelText("Ir al artista 1")).toBeTruthy();
  });
});
