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

/**
 * `@/lib/db` se mockea entero, y no por limpieza: **importarlo carga
 * `better-sqlite3`**, un módulo nativo, y al descargar el worker el hook de
 * limpieza nativo se ejecuta con el isolate ya destruido —la aserción
 * `node::RemoveEnvironmentCleanupHook (env) != nullptr` y el
 * `ERR_IPC_CHANNEL_CLOSED` que documenta AGENTS.md—. Se dispara al cargar un
 * módulo nativo a través de una ruta, que es justo lo que hace esta página.
 *
 * Antes esta página solo llegaba a la base por `@/lib/releases`, que está
 * mockeado, así que el módulo nativo no entraba. Por eso el mock es del módulo
 * entero y no de una función.
 */
vi.mock("@/lib/db", () => ({
  getArtistByName: vi.fn(),
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

/**
 * ## Por qué hay un stub de `IntersectionObserver` en este fichero
 *
 * La página usa `PageTransition` y `SlideIn` (`components/MotionWrappers.tsx`), y
 * `SlideIn` anima con `whileInView`. Eso es framer-motion, y framer-motion
 * **construye un `IntersectionObserver` al montar**: jsdom no trae ese API, así
 * que sin este stub la página entera revienta con
 * `ReferenceError: IntersectionObserver is not defined` y los 50 tests de este
 * fichero salen rojos por un motivo que no tiene nada que ver con lo que
 * comprueban.
 *
 * El stub dice "todo es visible": al observar un elemento dispara el callback de
 * inmediato con `isIntersecting: true`, así que el contenido está en su estado
 * final desde el primer render. Para lo que estos tests miran —encabezados,
 * `aria-labelledby`, hrefs, áreas táctiles— es exactamente lo que se quiere: se
 * prueba el DOM final, no la animación.
 *
 * Va aquí y no en un `setupFiles` global a propósito: tocar `vitest.config.ts`
 * cambia el comportamiento de los otros 66 ficheros, y este es un hueco de jsdom
 * que solo aparece al renderizar componentes de cliente. Si otro test empieza a
 * renderizar `MotionWrappers`, se sube a `setupFiles` entonces, y con un motivo.
 */
type IoCallback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [0];

    constructor(private readonly callback: IoCallback) {}

    /** Dispara el callback ya resuelto: para estos tests, "visible" es el estado final. */
    observe(target: Element) {
      this.callback([{ target, isIntersecting: true }]);
    }

    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof globalThis.IntersectionObserver;
}

import ReleaseDetailPage from "@/app/releases/[id]/page";
import { getArtistByName } from "@/lib/db";
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
  vi.mocked(getArtistByName).mockResolvedValue({
    id: "art-1",
    name: rel.artist_name,
  } as Awaited<ReturnType<typeof getArtistByName>>);

  render(await ReleaseDetailPage({ params: { id: rel.id } }));
}

const bodyText = () => document.body.textContent ?? "";

/**
 * Los encabezados `<h2>` de la página, en orden de documento y tal cual.
 *
 * A diferencia de `sectionHeadings` (abajo), este mira **todos** los `<h2>`. Se
 * usa para los bloques que traen su propio encabezado —`VideoShowcase` dice
 * "Videoclip Oficial"—, que es donde hace falta verlos.
 */
const rawHeadings = () =>
  Array.from(document.querySelectorAll("h2")).map((h) => (h.textContent ?? "").trim());

/**
 * Los encabezados de las **secciones de la página**, en orden de documento, sin
 * el contador de pistas.
 *
 * Dos decisiones, y las dos importan:
 *
 * - **Por `aria-labelledby`, no por todos los `<h2>`.** Es lo que ata una sección
 *   a su título: si alguien borra el atributo, esta lista deja de ver la sección y
 *   el test se pone rojo por el motivo correcto. Y los bloques de ficha que se
 *   montan en el bloque 7 traen su PROPIO `<h2>` dentro, así que contarlos sería
 *   contar cosas que este test no controla.
 * - **Sin el contador de pistas.** El diseño escribe "Pistas (8)" en el álbum y
 *   "Pistas (1)" en el single, y comparar contra una lista fija obligaría a
 *   duplicarla por cada número posible. El contador se comprueba aparte.
 */
const headings = () =>
  Array.from(document.querySelectorAll("section[aria-labelledby]"))
    .map((section) => {
      const id = section.getAttribute("aria-labelledby") ?? "";
      return document.getElementById(id)?.textContent?.trim() ?? "";
    })
    .filter((text) => text !== "")
    .map((text) => text.replace(/\s*\(\d+\)$/, ""));

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
 *
 * ⚠️ **Los encabezados se leen de los `<section aria-labelledby>`, no de todos
 * los `<h2>` de la página**, y el motivo es concreto: los bloques de ficha que
 * se montan en el bloque 7 (`VideoShowcase`, `ProductionDetails`) traen su
 * PROPIO `<h2>` dentro. Con `querySelectorAll("h2")` este guard empezaría a
 * contar cabeceras de terceros, y un test que cuenta cosas que no controla es un
 * test que un día se rompe solo y nadie sabe qué protegía.
 */
describe("C1 · la página de release tiene las cuatro secciones", () => {
  /**
   * Las cuatro, **en el orden del esqueleto nuevo**.
   *
   * ## Por qué cambió esta lista
   *
   * El diseño de C1 era una columna: descripción, pistas, enlaces, letra, y
   * prensa al final. El rediseño (P8) mueve la página al esqueleto de la ficha de
   * pista —dos columnas, `lg:col-span-2` para el contenido y barra lateral para
   * lo que se consulta sin leer—, y eso cambia el orden:
   *
   * - **Enlaces** pasa a la barra lateral y se llama "Enlaces Externos", el mismo
   *   nombre que usa la ficha de pista. Coincidir el nombre es lo que permite
   *   leer las dos vistas como la misma plantilla.
   * - **Prensa** también va a la barra lateral, y en DOM va **después** de
   *   enlaces, no después de las cuatro secciones.
   *
   * Lo que NO cambia, y por eso los tests de abajo siguen siendo los mismos: una
   * sección sin dato no se inventa, cada una queda atada a su encabezado con
   * `aria-labelledby`, y una sección ausente no puede pasar por presente.
   */
  const SECTIONS = ["Descripción", "Pistas", "Enlaces Externos", "Letra"] as const;

  /**
   * La quinta sección, y no es una más: la de **descargas para prensa**, que
   * `/track/[id]` montaba con alcance de artista y que al quedar en 301 se quedó
   * sin ninguna página donde estar (ver el bloque 7). Va **después** de las
   * cuatro, para que el orden acordado no se mezcle con ella.
   *
   * Se nombra aquí y no en el bloque 7 porque este test es el que ata el
   * **esqueleto completo** de la página: si mañana aparece una sexta sección sin
   * que nadie la anuncie, esta lista la ve.
   */
  const PRESS = "Ficha técnica para prensa";

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

  /**
   * Los encabezados de las **secciones de la página**, en orden de documento.
   *
   * Se usa el `aria-labelledby` porque es lo que ata una sección a su título: si
   * alguien borra el atributo, esta lista deja de ver la sección y el test se
   * pone rojo por el motivo correcto (la sección ya no se anuncia).
   */
  const sectionHeadings = headings;

  it("con descripción, pistas, enlaces y letra salen las CUATRO", async () => {
    await renderFullRelease();
    const rendered = headings();
    for (const section of SECTIONS) {
      expect(rendered).toContain(section);
    }
  });

  it("y en el orden del esqueleto: descripción, pistas, letra, y enlaces en la barra lateral", async () => {
    // El orden real en DOM. "Enlaces Externos" y "Ficha técnica para prensa" van
    // en la barra lateral, que en el HTML va **después** de la columna de
    // contenido, así que "Enlaces" queda entre "Pistas" y "Letra" en vez de
    // después de "Letra".
    await renderFullRelease();
    expect(headings()).toEqual(["Descripción", "Pistas", "Letra", "Enlaces Externos", PRESS]);
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
    expect(rendered).not.toContain("Enlaces Externos");
    expect(rendered).toEqual(["Descripción", "Pistas", PRESS]);
  });

  it("el texto de una sección ausente no puede pasar por presente", async () => {
    // `Descripción` es subcadena de `Descripción del álbum`: un `includes`
    // sobre el texto completo de la página daría verde con la sección
    // equivocada. El test mira los encabezados de sección, no el `bodyText`.
    await renderPage({ id: "rel-nodesc", description: null, lyrics: null }, [{ id: "c1" }]);
    expect(headings()).not.toContain("Descripción");
    expect(bodyText()).not.toContain("Descripción del álbum");
  });

  /**
   * ## Lo que el rediseño de P8 introduce, y por qué necesita su propio test
   *
   * Los tests de arriba comprueban que las secciones siguen ahí. Estos dos
   * comprueban cosas que **antes no existían** en esta página, y que por eso
   * nadie está mirando:
   *
   * 1. **El reproductor está en la carta**, junto a la portada. Antes no había
   *    reproductor en la página: solo la lista de pistas, en la que un single
   *    tiene su única fila.
   * 2. **La barra lateral existe y es un `<aside>`**, no un `<div>`. No es
   *    cosmético: un lector de pantalla anuncia la complemento del contenido, y
   *    esto dice "lo que viene es referencia", que es lo que es.
   */
  describe("el esqueleto de dos columnas", () => {
    it("el single trae reproductor en la carta, con su título", async () => {
      await renderPage({ id: "rel-hero", title: "Cancion con audio" }, []);
      const carta = document.querySelector("section");
      expect(carta?.textContent ?? "").toContain("Cancion con audio");
      // `AudioPlayer` sin fuente reproducible dice "No hay audio disponible":
      // ese texto es la prueba de que el componente se montó, porque la página
      // no lo escribe por su cuenta.
      expect(bodyText()).toMatch(/No hay audio disponible|▶/);
    });

    it("los enlaces y la prensa van en un <aside>, y las secciones de lectura no", async () => {
      await renderFullRelease();
      const aside = document.querySelector("aside");
      expect(aside).not.toBeNull();
      // Las dos cosas que se consultan sin leer están dentro del aside...
      expect(aside?.textContent ?? "").toContain("Enlaces Externos");
      expect(aside?.textContent ?? "").toContain(PRESS);
      // ...y la lista de pistas, que se lee, no.
      expect(aside?.textContent ?? "").not.toContain("Aguante");
      expect(document.querySelector("aside section[aria-labelledby='release-tracks']")).toBeNull();
    });

    it("un álbum NO monta reproductor en la carta: no tiene audio propio", async () => {
      // La fila padre existe solo para agrupar; su `audio_preview_url` está
      // vacía. Montar el reproductor aquí era el botón de play que no hace nada.
      await renderPage({ id: "rel-album-sin-audio" }, [{ id: "c1", title: "Aguante" }]);
      expect(bodyText()).not.toContain("No hay audio disponible");
    });

    it("la carta enseña la portada, la ficha y los hechos, en ese orden", async () => {
      // El orden es el de la ficha de pista: imagen, texto, y luego la barra de
      // hechos al pie de la caja. Es lo que da la lectura de "portada a un lado,
      // ficha al otro" que buscaba el rediseño.
      //
      // La portada hay que darla: `baseTrack` no trae `cover_image`, y sin ella
      // `getCoverImage` cae a la miniatura de YouTube —que sin `youtube_video_id`
      // también es `null`— así que la caja se pinta sin imagen y el orden que se
      // quiere comprobar no existe.
      await renderPage(
        { id: "rel-orden", title: "Orden de la carta", cover_image: "https://img.test/portada.jpg" },
        [{ id: "c1" }]
      );
      const carta = document.querySelector("section");
      const html = carta?.innerHTML ?? "";
      const img = html.indexOf("<img");
      const h1 = html.indexOf("<h1");
      const dl = html.indexOf("<dl");
      expect(img).toBeGreaterThanOrEqual(0);
      expect(h1).toBeGreaterThan(img);
      expect(dl).toBeGreaterThan(h1);
    });

    /**
     * La portada es **1:1 declarado**, no "lo que dé la fila".
     *
     * Con `sm:h-full` la caja tomaba la altura de la columna de texto, que depende
     * de cuánto texto hay al lado: la misma portada salía a 288×288 en una ficha y a
     * 288×354 en otra, y dos lanzamientos con la misma carátula no se veían igual.
     */
    it("la portada es 1:1 siempre, no la altura de la fila", async () => {
      await renderPage(
        { id: "rel-cuadrada", title: "Cuadrada", cover_image: "https://img.test/p.jpg" },
        [{ id: "c1" }]
      );
      const marco = document.querySelector("section img")?.parentElement;
      expect(marco?.className).toContain("aspect-square");
      // `sm:h-full` es lo que rompía el cuadrado; no debe volver.
      expect(marco?.className).not.toContain("h-full");
    });

    it("la barra lateral se queda pegada al scroll", async () => {
      // Sin `self-start` el sticky no hace nada: la rejilla estira sus hijos y un
      // elemento estirado ocupa toda la altura de la columna, sin nada que fijar.
      await renderFullRelease();
      const aside = document.querySelector("aside");
      expect(aside?.className).toContain("lg:sticky");
      expect(aside?.className).toContain("lg:self-start");
    });

    it("la duración sale UNA vez, en la barra de hechos", async () => {
      // Salía dos: junto al badge de tipo y en "Duración". Con datos de hoy no
      // además sobraba: el 100% de las fichas tiene duración, así que la segunda
      // copia no era un respaldo para un dato ausente.
      await renderPage(
        { id: "rel-una-duracion", title: "Una duracion", duration: "3:57" },
        []
      );
      const carta = document.querySelector("section")?.textContent ?? "";
      const ocurrencias = carta.match(/\d+:\d{2}/g) ?? [];
      expect(ocurrencias).toHaveLength(1);
    });

    it("el badge dice «Single» aunque la ficha tenga varias pistas", async () => {
      // `Tour de France` (Kraftwerk) tiene `release_type = 'single'` y 2 hijas.
      //
      // Antes esto exigía "EP": el commit 2376240 razona que "un single es, por
      // definición, una pista" y que la columna mintió. El propietario del
      // catálogo decidió lo contrario: es un single con una versión alternativa
      // por idioma, no un extended play. La etiqueta dice lo que dice la columna
      // y el número de pistas ya va al lado — "2 pistas" es un dato, "EP" era
      // una interpretación.
      //
      // Lo que NO vuelve es el bug que 2376240 vino a cerrar: dos etiquetas
      // distintas para la misma fila según la página. Las tres superficies
      // (ficha, catálogo y lista) tienen que decir Single; lo ata
      // `tests/unit/no-audio-y-enlace-al-artista.test.ts`.
      await renderPage({ id: "rel-badge", title: "Tour de France", release_type: "single" }, [
        { id: "c1", title: "Version Francaise" },
        { id: "c2", title: "Version Alemana" },
      ]);
      const carta = document.querySelector("section")?.textContent ?? "";
      expect(carta).toContain("Single");
      expect(carta).not.toContain("EP");
      // Y el dato de las 2 pistas sigue estando: la etiqueta no lo sustituye.
      expect(carta).toContain("2 pistas");
    });

    it("un álbum conserva su tipo", async () => {
      await renderPage({ id: "rel-album-badge", release_type: "album" }, [{ id: "c1" }]);
      expect(document.querySelector("section")?.textContent ?? "").toContain("Album");
    });

    it("y un single sin hijas sigue diciendo Single", async () => {
      // En su propio `it` y no en el del álbum a propósito: `renderPage` monta
      // sobre el mismo `document.body` y solo limpia en `afterEach`, así que dos
      // renders en el mismo test se apilan y `querySelector("section")` devuelve
      // el primero. Aquí se vería "Album" y el test passería por la razón
      // equivocada.
      await renderPage({ id: "rel-single-badge", release_type: "single" }, []);
      expect(document.querySelector("section")?.textContent ?? "").toContain("Single");
    });
  });
});

/* ── 7. C1-bis · la ficha de una pista, que el 301 dejó sin página ─────────── */

/**
 * ## Qué es esto
 *
 * `/track/[id]` es un **301 para toda fila**: si es hija va al release de su
 * padre, y si es cabecera va a su propio release. Su ficha —videoclip, ficha
 * técnica, galería de prensa— queda por tanto solo para las huérfanas, y esos
 * bloques no estaban en la página de release. Es decir: **no tenían ninguna
 * página donde estar**.
 *
 * La regla es la del enunciado del enunciado de siempre: `!isMultiTrack` es
 * "esta fila es una canción". Con hijas, un disco no tiene videoclip oficial
 * propio ni una afinación única, y pintarlos sería la tarjeta vacía que este
 * proyecto ya pagó una vez.
 *
 * Lo que se prueba aquí:
 *
 * 1. Los tres bloques de pista vuelven cuando hay dato.
 * 2. **No** se montan cuando el lanzamiento tiene hijas.
 * 3. La descarga de prensa se monta en **los dos** casos, porque es del artista.
 * 4. Los enlaces se leen de **todas** las columnas, no solo de
 *    `external_links`: para 7 de los 9 singles del catálogo esa columna está
 *    vacía y sus enlaces viven en `spotify_url`, `itunes_track_id` y
 *    `youtube_video_id`.
 */
describe("C1-bis · la ficha de una pista vuelve a la página de release", () => {
  /** Un single con todo lo que tenía `/track/[id]` y ya no tenía página. */
  const ficha = {
    id: "rel-ficha",
    title: "Bohemian Rhapsody",
    youtube_video_id: "fJ9rUzIMcZQ",
    video_embed_url: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
    gallery_images: ["https://example.test/prensa/1.jpg"],
    spotify_url: "https://open.spotify.test/track/7tFiy",
    itunes_track_id: "158672215",
    production_details: {
      daw: "EMI Studios (16-track tape)",
      guitars: "Brian May Red Special",
      effects_chain: "Deacy Amp + AC30 + Univibe",
      tuning: "Standard E",
      key: "B\u266d Major",
    },
  } as ReleaseFixture;

  it("un single con vídeo monta el Videoclip Oficial", async () => {
    await renderPage(ficha, []);
    // `VideoShowcase` solo se monta si hay `youtubeVideoId` o `videoEmbedUrl`, y
    // su encabezado trae un icono delante (`▶ Videoclip Oficial`), así que la
    // comprobación es por `bodyText` y no por igualdad de `<h2>`.
    expect(bodyText()).toContain("Videoclip Oficial");
  });

  it("un single con ficha técnica la muestra, y la del seed no", async () => {
    await renderPage(ficha, []);
    // `ProductionDetails` sale **plegado**: por defecto enseña el resumen
    // (género, BPM, tonalidad, sub-género y mood) y no los diez campos. Por eso
    // el test mira la tonalidad, que sí está en el resumen, y no la guitarra.
    expect(bodyText()).toContain("B\u266d Major");

    // El caso contrario, y es el importante: el objeto de `production_details`
    // con TODO a `null` —lo que escribe el seed en las cabeceras de álbum— no es
    // una ficha. Sin el filtro salía "Sin datos de producción" debajo del
    // título, que es la tarjeta vacía.
    await renderPage(
      {
        id: "rel-sinficha",
        production_details: {
          daw: null,
          guitars: null,
          effects_chain: null,
          tuning: null,
          key: null,
        },
      },
      []
    );
    expect(bodyText()).not.toContain("Sin datos de producción");
  });

  it("un single con fotos de prensa monta la galería", async () => {
    await renderPage(ficha, []);
    expect(bodyText()).toContain("Galería de Prensa");
  });

  it("un álbum NO monta los bloques de pista: no tiene videoclip ni afinación propia", async () => {
    // El padre puede tener `youtube_video_id` (Kid A lo tiene) y un
    // `production_details` con todo a `null`. Ensañárselos al visitante sería
    // afirmar que el disco entero tiene un videoclip y una afinación.
    await renderPage(
      {
        id: "rel-album-ficha",
        youtube_video_id: "ALBUMVIDEO01",
        production_details: { daw: "Pro Tools", key: "D minor" } as Track["production_details"],
      },
      [{ id: "c1" }, { id: "c2" }]
    );
    expect(bodyText()).not.toContain("Videoclip Oficial");
    expect(bodyText()).not.toContain("D minor");
  });

  it("la descarga de prensa sale en los dos casos, y con el alcance del artista", async () => {
    // Es del ARTISTA, no de la pista: por eso se monta también en un álbum. Y es
    // la mitad del motivo por el que existe un EPK.
    await renderPage(ficha, []);
    expect(bodyText()).toContain("Ficha técnica para prensa");

    await renderPage({ id: "rel-album-press" }, [{ id: "c1" }]);
    expect(bodyText()).toContain("Ficha técnica para prensa");
  });

  it("los enlaces se leen de spotify_url e itunes_track_id, no solo de external_links", async () => {
    // El caso real de 7 de los 9 singles: `external_links` vacío y los enlaces en
    // las columnas de la fila. Antes la sección entera no se montaba, porque la
    // condición era `Object.keys(external_links).length > 0`.
    await renderPage({ ...ficha, external_links: {} }, []);
    const links = Array.from(document.querySelectorAll('a[target="_blank"]'));
    const hrefs = links.map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("https://open.spotify.test/track/7tFiy");
    // El dominio de Apple es el real y va **hardcodeado**, igual que en la ficha
    // de `/track/[id]`: `itunes_track_id` es un id de iTunes y su URL pública se
    // compone aquí, no hay columna que traiga el enlace completo.
    expect(hrefs).toContain("https://music.apple.com/us/album/158672215");
    expect(hrefs).toContain("https://www.youtube.com/watch?v=fJ9rUzIMcZQ");
  });

  it("el placeholder '—' de safeString no se convierte en un enlace", async () => {
    // `lib/db.ts` pasa las columnas por `safeString`, que convierte `""` en el
    // string truthy "—". Un `!= null` lo habría pintado como botón, y el botón
    // llevaría a una página que no existe.
    await renderPage(
      {
        id: "rel-placeholder",
        spotify_url: "—",
        itunes_track_id: null,
        youtube_video_id: null,
        external_links: { spotify: "", apple_music: "—", youtube: "" },
      },
      []
    );
    expect(document.querySelectorAll('a[target="_blank"]')).toHaveLength(0);
    expect(headings()).not.toContain("Enlaces");
  });

  it("no sale un enlace por plataforma cuando las dos columnas coinciden", async () => {
    // `external_links.youtube` y `youtube_video_id` apuntan al mismo vídeo: sale
    // UN botón, no dos.
    await renderPage(
      {
        id: "rel-doble",
        youtube_video_id: "fJ9rUzIMcZQ",
        external_links: {
          spotify: "",
          apple_music: "",
          youtube: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
        },
      },
      []
    );
    const hrefs = Array.from(document.querySelectorAll('a[target="_blank"]')).map(
      (a) => a.getAttribute("href") ?? ""
    );
    expect(hrefs.filter((h) => h.includes("youtube.com"))).toHaveLength(1);
  });

  it("deezer y bandcamp salen, que antes no se leían", async () => {
    await renderPage(
      {
        id: "rel-deezer",
        external_links: {
          spotify: "",
          apple_music: "",
          youtube: "",
          deezer: "https://deezer.test/track/1",
          bandcamp: "https://bandcamp.test/track/1",
        },
      },
      []
    );
    expect(bodyText()).toContain("Deezer");
    expect(bodyText()).toContain("Bandcamp");
  });
});

/* ── 8. C1-ter · los vídeos, y cuál de ellos se puede llamar videoclip ─────── */

/**
 * ## Qué protects
 *
 * `tracks.video_kind` (RC.33, Ola 4) tiene tres valores y **solo uno** es el
 * vídeo que la ficha quiere mostrar. Antes de esta ola **ninguna parte de la UI
 * lo leía**: `grep video_kind app components` no devolvía nada, o sea que nada
 * impedía enseñar un `- Topic` autogenerado por YouTube con el nombre
 * "Videoclip Oficial".
 *
 * Y hay que decirlo porque el dato es incómodo: de las 28 hijas con vídeo, **11
 * son `live` y 17 son `topic_audio`, y no hay ni un `videoclip`**. El catálogo no
 * tiene ningún vídeo oficial curado de un álbum. La sección existe para cuando
 * lo haya, y sobre todo para que la **exclusión** sea una regla testeada en vez
 * de un olvido.
 */
describe("C1-ter · un - Topic no es el videoclip de la pista", () => {
  it("un `- Topic` autogenerado NO se enseña", async () => {
    // Un canal `- Topic` es el audio del tema con una imagen fija. Enseñarlo
    // como videoclip oficial del álbum sería afirmar algo que es falso.
    await renderPage({ id: "rel-album" }, [
      { id: "c1", title: "Aguante", youtube_video_id: "TOPIC123456", video_kind: "topic_audio" },
    ]);
    expect(bodyText()).not.toContain("Videoclips oficiales");
    expect(headings()).not.toContain("Videoclips oficiales");
  });

  it("un directo tampoco", async () => {
    // Un `live` es una grabación en directo: no es la pista del lanzamiento.
    await renderPage({ id: "rel-album" }, [
      { id: "c1", title: "Aguante", youtube_video_id: "LIVE1234567", video_kind: "live" },
    ]);
    expect(bodyText()).not.toContain("Videoclips oficiales");
  });

  it("un `videoclip` sí, con su miniatura y su enlace", async () => {
    await renderPage({ id: "rel-album" }, [
      { id: "c1", title: "Aguante", youtube_video_id: "VIDEOCLIP1", video_kind: "videoclip" },
      { id: "c2", title: "Medianoche" },
    ]);
    expect(headings()).toContain("Videoclips oficiales");
    // El recuento es honesto: 1 de 2, no "2 vídeos".
    expect(bodyText()).toContain("1 de las pistas tiene videoclip oficial");
    const hrefs = Array.from(document.querySelectorAll('a[target="_blank"]')).map(
      (a) => a.getAttribute("href") ?? ""
    );
    expect(hrefs).toContain("https://www.youtube.com/watch?v=VIDEOCLIP1");
    // La miniatura de `VideoShowcase`, la misma.
    const thumbs = document.querySelectorAll(
      'img[src="https://img.youtube.com/vi/VIDEOCLIP1/hqdefault.jpg"]'
    );
    expect(thumbs).toHaveLength(1);
    // Decorativa: el título ya está en el texto de al lado.
    expect(thumbs[0].getAttribute("alt")).toBe("");
  });

  it("varias a la vez: el recuento usa el plural", async () => {
    await renderPage({ id: "rel-album" }, [
      { id: "c1", youtube_video_id: "VIDEOAAA111", video_kind: "videoclip" },
      { id: "c2", youtube_video_id: "VIDEOBBB222", video_kind: "videoclip" },
      { id: "c3", youtube_video_id: "LIVECCC333", video_kind: "live" },
    ]);
    expect(bodyText()).toContain("2 de las pistas tienen videoclip oficial");
  });

  it("el single NO monta la lista de vídeos: ya tiene su Videoclip Oficial", async () => {
    // Un single es su propia pista. Montar las dos cosas sería enseñar el mismo
    // vídeo dos veces, una como tarjeta grande y otra como fila.
    await renderPage(
      { id: "rel-single", youtube_video_id: "VIDEOAAA111", video_kind: "videoclip" },
      []
    );
    expect(bodyText()).toContain("Videoclip Oficial");
    expect(bodyText()).not.toContain("Videoclips oficiales");
  });

  it("un single con vídeo `- Topic` tampoco lo enseña como videoclip", async () => {
    // La regla es la MISMA para las dos ramas, y por eso vive en
    // `showableVideo` y no en la página: dos copias divergirían en silencio.
    await renderPage(
      { id: "rel-single", youtube_video_id: "TOPIC123456", video_kind: "topic_audio" },
      []
    );
    expect(bodyText()).not.toContain("Videoclip Oficial");
  });

  it("un `null` se conserva: son los ids curados a mano del seed", async () => {
    // Los 9 singles del catálogo tienen `video_kind = NULL` porque los escribió
    // una persona antes de que la columna existiera. Si `null` se excluyera, la
    // página de 9 singles perdería su vídeo y el arreglo de C1-bis sería inútil.
    await renderPage({ id: "rel-single", youtube_video_id: "CURADOMANO1" }, []);
    expect(bodyText()).toContain("Videoclip Oficial");
  });

  it("un álbum sin ningún vídeo de pista no monta la sección", async () => {
    await renderPage({ id: "rel-album" }, [{ id: "c1" }, { id: "c2" }]);
    expect(headings()).not.toContain("Videoclips oficiales");
  });
});