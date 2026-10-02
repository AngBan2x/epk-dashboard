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

async function renderPage(
  release: Partial<Track>,
  children: Partial<Track>[]
) {
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
  it("un single SIN hijas tiene reproductor — antes no tenía ninguno", async () => {
    await renderPage({ id: "rel-single" }, []);
    expect(document.querySelector('[data-testid="release-audio-player"]')).not.toBeNull();
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
    // El reproductor grande del ALBÚM no se monta: un álbum no tiene audio.
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

  it("cada fila del álbum trae miniatura y su duración alineada", async () => {
    await renderPage(
      { id: "rel-album", cover_image: "https://example.test/cover.jpg" },
      [
        { id: "c1", duration: "3:45" },
        { id: "c2", duration: "4:18" },
      ]
    );
// La miniatura es decorativa: la portada del disco ya está-described arriba.
const section = screen.getByTestId("release-play-section");
const thumbs = section.querySelectorAll('img[src="https://example.test/cover.jpg"]');
expect(thumbs.length).toBeGreaterThanOrEqual(2);
for (const thumb of Array.from(thumbs)) {
  expect(thumb.getAttribute("alt")).toBe("");
}
expect(section.textContent).toContain("3:45");
expect(section.textContent).toContain("4:18");
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