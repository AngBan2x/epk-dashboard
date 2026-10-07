import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { buildReleaseLinks } from "@/lib/release-links";
import type { Track } from "@/types/music";

/**
 * Los enlaces de streaming tienen UNA fuente.
 *
 * ## El bug que este fichero existe para que no vuelva
 *
 * `buildReleaseLinks` vivía dentro de `app/releases/[id]/page.tsx` y la barra
 * lateral de `app/track/[id]/page.tsx` tenía su propia lista. Las dos copias se
 * separaron con el tiempo y el usuario reportó tres síntomas el 2026-10-06:
 *
 * - **Apple Music "monocromático"**: la barra lateral pintaba el path
 *   `M12 3v10.55c-.59-.34…`, que es una **nota musical genérica**, no el logo de
 *   Apple. Estaba junto al texto "Escuchar en Apple Music".
 * - **Tidal ausente**: no había rama para él en ninguna de las dos, así que un
 *   `external_links.tidal` curado a mano no salía.
 * - **Deezer con otro dibujo**: el `d` de la barra lateral
 *   (`M18.81 4.16v3.19h-4.78…`) no era el de `lib/social-platforms.ts`.
 *
 * El síntoma era "hay SVGs rotos", y el problema real era que había tres
 * versiones del mismo logo en tres ficheros, y nadie lo notaría al compilar.
 */

function release(extra: Partial<Track>): Track {
  return { id: "r1", title: "T", artist_name: "A", ...extra } as Track;
}

describe("buildReleaseLinks", () => {
  it("lee de las dos fuentes: la curada y la de la columna", () => {
    const links = buildReleaseLinks(
      release({ spotify_url: "https://open.spotify.test/x" }),
    );
    expect(links.map((l) => l.key)).toContain("spotify");
  });

  it("gana external_links sobre la columna de la fila", () => {
    const links = buildReleaseLinks(
      release({
        spotify_url: "https://open.spotify.test/columna",
        external_links: { spotify: "https://open.spotify.test/curada" },
      }),
    );
    expect(links.find((l) => l.key === "spotify")?.href).toBe("https://open.spotify.test/curada");
  });

  it("Tidal sale, que antes no salía en ninguna vista", () => {
    const links = buildReleaseLinks(
      release({ external_links: { tidal: "https://tidal.com/browse/track/1" } }),
    );
    expect(links.map((l) => l.key)).toContain("tidal");
  });

  it("un enlace por plataforma cuando las dos columnas coinciden", () => {
    // El mismo vídeo curado y el de la fila: UN botón, no dos.
    const links = buildReleaseLinks(
      release({
        youtube_video_id: "abc123",
        external_links: { youtube: "https://www.youtube.com/watch?v=abc123" },
      }),
    );
    expect(links.filter((l) => l.key === "youtube")).toHaveLength(1);
  });

  it("el placeholder '—' de safeString no se convierte en un enlace", () => {
    // `lib/db.ts` pasa "" por `safeString` y sale "—", que es truthy. Un
    // `if (!valor)` lo daría por bueno.
    const links = buildReleaseLinks(
      release({ spotify_url: "—", external_links: { spotify: "  ", deezer: "-" } }),
    );
    expect(links).toHaveLength(0);
  });

  it("el orden en pantalla es estable, no el de llegada", () => {
    const links = buildReleaseLinks(
      release({
        external_links: {
          youtube: "https://y.test/1",
          bandcamp: "https://b.test/1",
          tidal: "https://t.test/1",
          spotify: "https://s.test/1",
        },
      }),
    );
    expect(links.map((l) => l.key)).toEqual(["spotify", "tidal", "bandcamp", "youtube"]);
  });

  it("toda plataforma trae icono y color desde SOCIAL_PLATFORMS", () => {
    // Bandcamp salía con `icon: null`: un botón con etiqueta y sin dibujo.
    const links = buildReleaseLinks(
      release({ external_links: { bandcamp: "https://b.test/1", deezer: "https://d.test/1" } }),
    );
    for (const link of links) {
      expect(link.color, `${link.key} sin color`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(link.platformKey).toBe(link.key);
    }
  });
});

/**
 * El invariante: **ninguna de las dos páginas vuelve a escribir un `d` de icono
 * por su cuenta**.
 *
 * Se comprueba contra los paths concretos que causaron el bug, en vez de con un
 * `not.toMatch(/d="M/)`: las páginas tienen SVG legítimos propios (los chevrons
 * de anterior/siguiente), así que un genérico daría falso positivo y el test se
 * desactivaría por cansancio.
 */
describe("los iconos de plataforma tienen una sola fuente", () => {
  const releasePage = readFileSync(
    path.resolve(process.cwd(), "app", "releases", "[id]", "page.tsx"),
    "utf8",
  );
  const trackPage = readFileSync(
    path.resolve(process.cwd(), "app", "track", "[id]", "page.tsx"),
    "utf8",
  );

  const PATHS_INLINADOS = [
    ["nota genérica en vez del logo de Apple", "M12 3v10.55c-.59-.34"],
    ["Deezer con un d que no es el de social-platforms", "M18.81 4.16v3.19h-4.78"],
    ["Spotify", "M12 0C5.4 0 0 5.4 0 12s5.4 12"],
    ["logo de Apple", "M23.994 6.124a9.23"],
    ["logo de YouTube", "M23.498 6.186a3.016"],
  ] as const;

  it.each(PATHS_INLINADOS)(
    "ninguna pagina lleva su copia: %s",
    (_motivo, fragmento) => {
      expect(releasePage).not.toContain(fragmento);
      expect(trackPage).not.toContain(fragmento);
    },
  );

  it("las dos importan del modulo comun", () => {
    expect(releasePage).toContain('from "@/lib/release-links"');
    expect(trackPage).toContain('from "@/lib/release-links"');
  });

  it("el icono se pinta con SocialPlatformIcon, no con un svg propio", () => {
    expect(releasePage).toContain("SocialPlatformIcon");
    expect(trackPage).toContain("SocialPlatformIcon");
  });
});

describe("el icono de 'sin audio' no se confunde con una imagen rota", () => {
  const player = readFileSync(
    path.resolve(process.cwd(), "components", "AudioPlayer.tsx"),
    "utf8",
  );

  it("el ban-circle de Heroicons no esta", () => {
    // Un círculo con una diagonal a 16 px es indistinguible del icono de imagen
    // rota del navegador. El usuario lo reportó como "un SVG roto".
    expect(player).not.toContain("M18.364 18.364A9 9 0 005.636 5.636");
  });

  it("en su lugar hay un altavoz, y con aria-hidden", () => {
    expect(player).toContain("M11 5L6 9H2v6h4l5 4V5z");
    expect(player).toContain("aria-hidden");
  });
});
