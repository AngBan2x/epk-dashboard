// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * P2 · Ola 10 — la página de un lanzamiento.
 *
 * ## Qué protege este fichero
 *
 * `app/releases/[id]/page.tsx` es un Server Component, así que se monta
 * llamándolo a mano y se mockean las tres cosas que un Server Component no
 * puede traer a un test: el router de `next/navigation`, los contextos de
 * cliente y la lectura de datos.
 *
 * Lo que NO se prueba aquí es que `getReleaseWithTracks` lea bien la base de
 * datos. Lo que importa de `lib/releases.ts` es la FORMA que devuelve, y esa
 * forma es pura (`lib/release-page.ts`) y se prueba con aserciones directas
 * más abajo. Aquí se le pasa la forma ya resuelta y se mira lo que se pinta.
 *
 * ## Los cuatro bugs que fija
 *
 * 1. **Un single sin hijas no tenía dónde reproducir.** La página solo montaba
 *    la lista de pistas `if (isMultiTrack)`, así que los 6 singles sin hijas del
 *    catálogo se quedaban sin un solo control de play.
 * 2. **`sumDurations([])` daba "0:00"** (o caía al `"00:00"` de relleno del
 *    padre): un disco de cero segundos pintado con tipografía de dato.
 * 3. **`0` como sustituto de "no lo sé"** en las métricas.
 * 4. **RC.33 no se rompe**: en un álbum, padre e hijas se resuelven con la
 *    MISMA fuente y se suman solo las hijas de esa fuente. Un refactor de
 *    maquetación no puede cambiar la aritmética de las métricas.
 *
 * ## Y el bloque de C1, que es de otra cosa
 *
 * El usuario pidió revertida la maquetación de P2 (2026-10-03): el diseño
 * acordado tenía **cuatro** secciones y el de P2 tenía **tres**. El revert no
 * puede reponer los arreglos de arriba —este fichero lo comprueba—, pero
 * tampoco puede perder una sección por el camino, que es justo lo que un revert
 * de layout hace sin avisar. De ahí el bloque 6: las cuatro secciones, su orden
 * y su enlace al encabezado.
 *
 * Los tres que importan se han **mutado** para comprobar que el test se pone
 * rojo al deshacer el arreglo (RC.32 gastó una release entera por no hacerlo):
 * quitar la sección de letra → 3 rojos; quitar el filtro del relleno `"00:00"`
 * de `ReleaseTrackList` → 2 rojos; condicionar la sección de pistas a
 * `isMultiTrack` → 5 rojos.
 */

const { mockPlayQueue } = vi.hoisted(() => ({ mockPlayQueue: vi.fn() }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/releases",
}));

vi.mock("@/lib/releases", () => ({
  getReleaseWithTracks: vi.fn(),
  getReleaseNeighbours: vi.fn(),
  resolveTrackRoute: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, hasRole: () => false }),
}));

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

import ReleaseDetailPage from "@/app/releases/[id]/page";
import { getReleaseNeighbours, getReleaseWithTracks } from "@/lib/releases";
import { NO_VALUE, releaseDurationLabel, releaseMetrics, releaseShape } from "@/lib/release-page";
import type { Metrics, Track } from "@/types/music";

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const PREVIEW = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview.m4a";

const baseTrack: Track = {
  id: "rel-1",
  title: "Album de prueba",
  artist_name: "Artista de prueba",
  release_type: "album",
  release_date: "1994-09-26",
  duration: "00:00",
  cover_image: "",
  audio_preview_url: "",
  spotify_url: null,
  youtube_video_id: null,
  metrics: null,
  production_details: {
    daw: null,
    guitars: null,
    effects_chain: null,
    tuning: null,
    key: null,
  },
  lyrics: null,
  status: "approved",
};

const baseChild: Partial<Track> = {
  title: "Pista de prueba",
  artist_name: "Artista de prueba",
  release_type: "album",
  release_date: "1994-09-26",
  duration: "3:45",
  cover_image: "",
  audio_preview_url: PREVIEW,
  status: "approved",
  disc_number: 1,
};

function metrics(streams: number): Metrics {
  return { streams, saves: 0, playlist_additions: 0, top_countries: [] };
}

/* ── Render ──────────────────────────────────────────────────────────────── */

/**
 * `description` no está en el tipo `Track` (la columna existe y `parseTrack` la
 * mapea —`lib/db.ts:774`— pero el tipo no la declara, y por eso la página la lee
 * con un cast). El fixture necesita poder ponerla, o la sección de Descripción
 * no se puede probar.
 */
type ReleaseFixture = Partial<Track> & { description?: string | null };

async function renderPage(release: ReleaseFixture, children: Partial<Track>[]) {
  const rel = { ...baseTrack, ...release } as Track;
  const kids = children.map(
    (child, index) =>
      ({ ...baseChild, ...child, id: child.id ?? `child-${index}` }) as Track
  );

  vi.mocked(getReleaseWithTracks).mockResolvedValue({
    release: rel,
    tracks: kids,
    ...releaseShape(rel, kids),
  });
  vi.mocked(getReleaseNeighbours).mockResolvedValue({ previous: null, next: null });

  render(await ReleaseDetailPage({ params: { id: rel.id } }));
}

const bodyText = () => document.body.textContent ?? "";

beforeEach(() => {
  mockPlayQueue.mockClear();
  cleanup();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/* ── 1. La duración: el bug del "0:00" ───────────────────────────────────── */

describe("P2 · la duración de un lanzamiento", () => {
  const filler = { ...baseTrack, duration: "00:00" } as Track;

  it("SIN hijas sale la duración del PROPIO release, no 0", () => {
    // El bug exacto: `sumDurations([])` es `null`, la línea siguiente caía a
    // `release.duration` en crudo.
    expect(releaseDurationLabel({ ...filler, duration: "3:45" }, [])).toBe("3:45");
  });

  it("CON hijas sale la SUMA, y el padre no manda", () => {
    const kids = [
      { ...baseChild, id: "c1", duration: "3:45" },
      { ...baseChild, id: "c2", duration: "4:18" },
    ] as Track[];
    expect(releaseDurationLabel(filler, kids)).toBe("8:03");
  });

  it("el relleno '00:00' es ausencia de dato, no un disco de cero segundos", () => {
    expect(releaseDurationLabel(filler, [])).toBe(NO_VALUE);
    expect(releaseDurationLabel(filler, [])).not.toBe("0:00");
  });

  it("un tracklist entero de '00:00' tampoco lo es", () => {
    const kids = [
      { ...baseChild, id: "c1", duration: "00:00" },
      { ...baseChild, id: "c2", duration: "00:00" },
    ] as Track[];
    expect(releaseDurationLabel(filler, kids)).toBe(NO_VALUE);
  });

  it("tres segmentos ('1:02:03') no se parten como dos", () => {
    // El parser que hubo antes hacía `const [m, s] = split(":")` y con tres
    // segmentos daba 62 s en vez de 3723.
    const kids = [{ ...baseChild, id: "c1", duration: "1:02:03" }] as Track[];
    expect(releaseDurationLabel(filler, kids)).toBe("62:03");
  });

  it("la página de un single sin hijas enseña su duración real", async () => {
    await renderPage({ id: "rel-single", duration: "3:45" }, []);
    expect(screen.getByTestId("release-play-section").textContent).toContain("3:45");
  });

  it("la página de un single sin duración no enseña '0:00'", async () => {
    await renderPage({ id: "rel-empty", duration: "00:00" }, []);
    const section = screen.getByTestId("release-play-section");
    expect(section.textContent).not.toContain("0:00");
    expect(bodyText()).not.toContain("0 pistas");
  });

  it("la página de un álbum enseña la suma en la cabecera y en la lista", async () => {
    await renderPage(
      { id: "rel-album", duration: "00:00" },
      [
        { id: "c1", duration: "3:45" },
        { id: "c2", duration: "4:18" },
      ]
    );
    expect(bodyText()).toContain("8:03");
    expect(bodyText()).toContain("2 pistas");
  });
});

/* ── 2. El único punto de play ───────────────────────────────────────────── */

describe("P2 · un solo sitio de play", () => {
    it("un single SIN hijas tiene un control de play — antes no tenía ninguno", async () => {
    await renderPage({ id: "rel-single", title: "Cancion suelta" }, []);
    // El diseño revertido vuelve a `ReleaseTrackList`, así que el control es la
    // fila de la lista, no el reproductor grande del diseño rico. Lo que no
    // puede volver a pasar es que la página del single no tenga NINGÚN sitio de
    // play: la fila es la del propio release, porque en el esquema un single es
    // a la vez pista y cabecera.
    const section = screen.getByTestId("release-play-section");
    expect(section.textContent).toContain("Cancion suelta");
    expect(screen.getByRole("button", { name: /Cancion suelta/ })).not.toBeNull();
  });

  it("un single SIN hijas no dice '0 pistas'", async () => {
    await renderPage({ id: "rel-single" }, []);
    expect(bodyText()).toContain("1 pista");
    expect(bodyText()).not.toContain("0 pistas");
  });

  it("no hay ningún enlace a /track/: la página ES la página", async () => {
    await renderPage({ id: "rel-single" }, []);
    expect(document.querySelectorAll("a[href^='/track/']")).toHaveLength(0);
  });

  it("un álbum monta la lista de pistas en el MISMO sitio de play", async () => {
    await renderPage({ id: "rel-album" }, [{ id: "c1" }, { id: "c2" }]);
    expect(screen.getByTestId("release-play-section")).not.toBeNull();
    // El reproductor grande no se monta en ninguna de las dos ramas: es el
    // diseño rico el que lo traía, y aquí no hay caso que lo necesite.
    expect(document.querySelector('[data-testid="release-audio-player"]')).toBeNull();
  });

  it("la fila del single tiene etiqueta con el título y anillo de foco", async () => {
    await renderPage({ id: "rel-single", title: "Cancion suelta" }, []);
    const button = screen.getByRole("button", { name: /Cancion suelta/ });
    expect(button.getAttribute("aria-label")).toContain("Cancion suelta");
    expect(button.className).toContain("focus-visible:ring");
  });

  it("cada fila del álbum tiene un control de play CON EL NOMBRE de su pista", async () => {
    await renderPage(
      { id: "rel-album" },
      [
        { id: "c1", title: "Aguante" },
        { id: "c2", title: "Medianoche" },
        { id: "c3", title: "Coda" },
      ]
    );
    // Un "Reproducir" repetido tres veces no le dice nada a quien recorre la
    // lista con un lector de pantalla: el nombre va en la etiqueta.
    const plays = screen.getAllByRole("button", { name: /^Reproducir \d+: / });
    expect(plays).toHaveLength(3);
    expect(plays.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Reproducir 1: Aguante",
      "Reproducir 2: Medianoche",
      "Reproducir 3: Coda",
    ]);
    for (const button of plays) {
      expect(button.className).toContain("focus-visible:ring");
    }
  });

  it("el botón de play es táctil: 44 px de área, no 32", async () => {
    await renderPage({ id: "rel-album" }, [{ id: "c1" }]);
    const button = screen.getByRole("button", { name: /^Reproducir \d+: / });
    // `p-2` con un icono de 16 px se quedaba en 32 px, por debajo del mínimo
    // táctil que mira `scripts/a11y-check.ts`. El arreglo vive en
    // `ReleaseTrackList.tsx`, que no se revirtió con el diseño.
    expect(button.className).toContain("p-2.5");
  });

  it("cada fila del álbum trae su duración, y el relleno '00:00' no se pinta", async () => {
    await renderPage(
      { id: "rel-album", cover_image: "https://example.test/cover.jpg" },
      [
        { id: "c1", duration: "3:45" },
        { id: "c2", duration: "4:18" },
        // El relleno del seed: si se pintara, la fila daría "0:00" mientras la
        // cabecera da la suma de las demás. El filtro vive en
        // `releaseRowDurationLabel` y NO se revierte con el diseño.
        { id: "c3", duration: "00:00" },
      ]
    );
    const section = screen.getByTestId("release-play-section");
    expect(section.textContent).toContain("3:45");
    expect(section.textContent).toContain("4:18");
    expect(section.textContent).not.toContain("00:00");
  });

  it("la sección de play se anuncia con un encabezado accesible", async () => {
    await renderPage({ id: "rel-album" }, [{ id: "c1" }]);
    const section = screen.getByTestId("release-play-section");
    const labelledBy = section.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)).not.toBeNull();
  });
});

/* ── 3. Métricas: `—` y nunca `0` ────────────────────────────────────────── */

describe("P2 · métricas del lanzamiento", () => {
  it("sin dato en ninguna fuente sale '—', no '0'", () => {
    const resolution = releaseMetrics({ ...baseTrack, metrics: null }, []);
    expect(resolution.value).toBeNull();
    expect(resolution.source).toBe("none");
  });

  it("la página pinta '—' con su explicación, y no un cero", async () => {
    await renderPage({ id: "rel-nometrics", metrics: null }, []);
    expect(bodyText()).toContain(NO_VALUE);
    expect(bodyText()).toContain("Sin dato");
    expect(bodyText()).not.toMatch(/\b0\s*Streams/);
  });

  it("RC.33: un álbum suma el padre y las hijas en la MISMA fuente", () => {
    const head = { ...baseTrack, metrics: metrics(500) } as Track;
    const kids = [
      { ...baseChild, id: "c1", metrics: metrics(1000) },
      { ...baseChild, id: "c2", metrics: metrics(2000) },
    ] as Track[];
    const resolution = releaseMetrics(head, kids);
    expect(resolution.source).toBe("itunes");
    // 500 del padre + 1000 + 2000 de las hijas.
    expect(resolution.value).toBe(3500);
  });

  it("RC.33: si el padre no tiene, manda la primera fuente de las hijas", () => {
    const head = { ...baseTrack, metrics: null } as Track;
    const kids = [
      { ...baseChild, id: "c1", metrics: null },
      { ...baseChild, id: "c2", metrics: metrics(42) },
    ] as Track[];
    const resolution = releaseMetrics(head, kids);
    expect(resolution.source).toBe("itunes");
    expect(resolution.value).toBe(42);
  });

  it("RC.33: NO se mezclan fuentes", () => {
    const head = { ...baseTrack, metrics: metrics(10) } as Track;
    // Esta hija no tiene dato curado: se ignora entera, no cae a otra fuente.
    const kids = [{ ...baseChild, id: "c1", metrics: null }] as Track[];
    expect(releaseMetrics(head, kids).value).toBe(10);
  });

  it("RC.33: un 0 curado a propósito SIGUE siendo un dato", () => {
    const head = { ...baseTrack, metrics: metrics(0) } as Track;
    const resolution = releaseMetrics(head, []);
    expect(resolution.source).toBe("itunes");
    expect(resolution.value).toBe(0);
  });

  it("la página enseña el número cuando hay dato", async () => {
    await renderPage({ id: "rel-metrics", metrics: metrics(1234) }, []);
    expect(bodyText()).toContain("1.234");
  });
});

/* ── 4. La forma: pistas y discos ────────────────────────────────────────── */

describe("P2 · la forma del lanzamiento", () => {
  it("un single cuenta como UNA pista, no como cero", async () => {
    await renderPage({ id: "rel-single" }, []);
    expect(bodyText()).toContain("1 pista");
  });

  it("un álbum de dos discos cuenta dos", async () => {
    await renderPage(
      { id: "rel-2discs" },
      [
        { id: "c1", disc_number: 1 },
        { id: "c2", disc_number: 2 },
      ]
    );
    expect(bodyText()).toContain("2 discos");
  });
});

/* ── 5. 404 ──────────────────────────────────────────────────────────────── */

describe("P2 · un id que no existe", () => {
  it("la página llama a notFound() en vez de renderizar media ficha", async () => {
    vi.mocked(getReleaseWithTracks).mockResolvedValue(null);
    await expect(
      ReleaseDetailPage({ params: { id: "no-existe" } })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

/* ── 6. C1 · las cuatro secciones del diseño acordado ─────────────────────── */

/**
 * ## Por qué este bloque existe
 *
 * El diseño de P2 tenía **tres** secciones y el acordado tiene **cuatro**:
 * Descripción, Pistas, Enlaces y Letra. Un revert de maquetación es
 * exactamente el sitio donde se cuela una sección sin avisar: el fichero
 * compila igual de bien con tres, nadie lo nota en el diff, y la sección que
 * falta es la que un periodista venía a buscar.
 *
 * Por eso el test no mira "que se vea algo": mira **las cuatro, con su
 * encabezado y en su orden**. Y el fixture se da con las cuatro fuentes de
 * datos puestas a la vez, que es el caso en el que una sección puede quedarse
 * vacía sin que nadie se entere.
 *
 * Para que el test pueda FALLAR, hay dos comprobaciones más que no son
 * decorativas:
 *
 * - El orden. Un `querySelectorAll("h2")` que solo compara longitudes dejaría
 *   pasar un revert que devolviera las secciones en otro orden.
 * - La letra pequeña: `Descripción` no es `Descripción del álbum`, y el
 *   `includes` de un texto más largo no distingue una cosa de la otra.
 */
describe("C1 · la página de release tiene las cuatro secciones", () => {
  /** Las cuatro, en el orden del diseño acordado. */
  const SECTIONS = ["Descripción", "Pistas", "Enlaces", "Letra"] as const;

  async function renderFullRelease() {
    await renderPage(
      {
        id: "rel-full",
        title: "Cancion suelta",
        description: "Una cancion con los cuatro bloques de datos.",
        lyrics: "Primera linea de la letra.\nSegunda linea.",
        external_links: {
          spotify: "https://open.spotify.test/album/rel-full",
          apple_music: "https://music.apple.test/album/rel-full",
          youtube: "https://youtube.test/watch?v=rel-full",
        },
      },
      [{ id: "c1", title: "Aguante" }]
    );
  }

  /** Los encabezados `<h2>` de la página, en orden de documento y tal cual. */
  const rawHeadings = () =>
    Array.from(document.querySelectorAll("h2")).map((h) => (h.textContent ?? "").trim());

  /**
   * Los mismos, sin el contador de pistas. El diseño escribe "Pistas (8)" en
   * el álbum y "Pistas (1)" en el single, así que comparar contra una lista
   * fija obligaría a duplicar la lista por cada número posible. El contador se
   * comprueba aparte, en el test de la sección de pistas.
   */
  const headings = () =>
    rawHeadings().map((text) => text.replace(/\s*\(\d+\)$/, ""));

  it("con descripción, pistas, enlaces y letra salen las CUATRO", async () => {
    await renderFullRelease();
    const rendered = headings();
    for (const section of SECTIONS) {
      expect(rendered).toContain(section);
    }
    expect(rendered).toHaveLength(SECTIONS.length);
  });

  it("y en el orden del diseño: descripción, pistas, enlaces, letra", async () => {
    await renderFullRelease();
    expect(headings()).toEqual([...SECTIONS]);
  });

  it("las tres secciones de datos quedan enlazadas a su encabezado", async () => {
    // Sin `aria-labelledby`, un lector de pantalla anuncia cuatro bloques
    // ("region", "region") sin decir de qué son. Y el revert las dejó sin
    // enlazar: el diseño rico usaba un helper con el `id` puesto a mano.
    await renderFullRelease();
    for (const id of ["release-description", "release-tracks", "release-links", "release-lyrics"]) {
      const section = document.querySelector(`section[aria-labelledby="${id}"]`);
      expect(section).not.toBeNull();
      const heading = document.getElementById(id);
      expect(heading?.tagName).toBe("H2");
      expect(heading?.textContent?.trim()).not.toBe("");
    }
  });

  it("la sección de pistas se monta aunque el lanzamiento no tenga hijas", async () => {
    // Un single suelto tiene una pista, y su sección es la del propio release.
    // Si la sección se condicionara a `isMultiTrack`, un single se quedaría sin
    // ella: es el bug nº 1 de P2, y el revert de diseño no lo puede reponer.
    await renderPage({ id: "rel-single" }, []);
    expect(rawHeadings()).toContain("Pistas (1)");
  });

  it("una sección sin dato NO se inventa: sin letra ni enlaces no hay sección", async () => {
    // Lo contrario también es un bug: pintar "Letra no disponible" y "No hay
    // enlaces externos" es lo que hizo la plantilla de `/track/[id]` con los
    // álbumes, y es ruido que ocupa media pantalla.
    await renderPage(
      {
        id: "rel-empty",
        description: "Solo descripcion.",
        lyrics: null,
        external_links: {},
      },
      [{ id: "c1" }]
    );
    const rendered = headings();
    expect(rendered).not.toContain("Letra");
    expect(rendered).not.toContain("Enlaces");
    expect(rendered).toEqual(["Descripción", "Pistas"]);
  });

  it("el texto de una sección ausente no puede pasar por presente", async () => {
    // `Descripción` es subcadena de `Descripción del álbum`: un `includes`
    // sobre el texto completo de la página daría verde con la sección
    // equivocada. El test mira los `<h2>`, no el `bodyText`.
    await renderPage({ id: "rel-nodesc", description: null, lyrics: null }, [{ id: "c1" }]);
    expect(headings()).not.toContain("Descripción");
    expect(bodyText()).not.toContain("Descripción del álbum");
  });
});