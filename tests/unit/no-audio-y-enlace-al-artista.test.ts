/**
 * ## Qué protege este fichero
 *
 * Dos cosas que se rompieron por no estar escritas en ningún sitio, y que un test
 * de "se ve bien" no cazarían:
 *
 * 1. **El icono de "no hay audio".** Estaba escrito dos veces (filas de
 *    `ReleaseTrackList` y `AudioPlayer`), y el de las filas era el `ban` de
 *    Heroicons: un círculo con una diagonal que, a `w-4 h-4`, **es
 *    indistinguible del icono de imagen rota** del navegador. El usuario lo
 *    reportó como un SVG roto en las filas sin audio de *Tour de France*.
 *
 * 2. **El botón del catálogo.** Enlazaba a `/artists` —el catálogo de todo el
 *    mundo— desde una ficha de un artista concreto, y no bajaba a su lista de
 *    lanzamientos.
 *
 * Los dos son comprobaciones de **código fuente**, no de DOM. Es a propósito: el
 * primero no se puede ver en un test de render sin fijar el `viewBox` y el
 * `strokeWidth` a mano, y el segundo depende de un prop que solo el servidor
 * puede resolver (`artistId`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const raiz = process.cwd();
const leer = (...partes: string[]) => readFileSync(path.join(raiz, ...partes), "utf8");

describe("el icono de no-hay-audio", () => {
  const ICONO = "components/icons/MutedSpeakerIcon.tsx";

  it("existe como componente propio, y no duplicado en dos ficheros", () => {
    // Un icono, un sitio. Dos copias del mismo símbolo divergen, que es lo que
    // pasó con el logo de Apple Music antes de `lib/release-links.ts`.
    expect(() => leer(ICONO)).not.toThrow();

    const tracklist = leer("components/ReleaseTrackList.tsx");
    const player = leer("components/AudioPlayer.tsx");

    expect(tracklist).toContain("MutedSpeakerIcon");
    expect(player).toContain("MutedSpeakerIcon");

    // Y ninguno debe llevar ya el "ban" de Heroicons, que es el path que había.
    const ban = "M18.364 18.364A9 9 0 005.636 5.636";
    expect(tracklist).not.toContain(ban);
    expect(player).not.toContain(ban);
  });

  it("el altavoz apagado va aria-hidden, porque el texto ya lo dice", () => {
    const icono = leer(ICONO);
    expect(icono).toContain('aria-hidden="true"');
    // El símbolo de las ondas apagadas es lo que lo distingue de un icono de
    // imagen rota: sin la cruz, sería un altavoz normal.
    expect(icono).toMatch(/M11 5L6 9H2v6h4l5 4V5z/);
    expect(icono).toContain("M22 9l-6 6");
  });
});

describe("la etiqueta del tipo no puede decir dos cosas distintas", () => {
  /**
   * La fila de *Tour de France* (Kraftwerk) tiene `release_type = 'Single'` y 2
   * hijas. Con `capitalizeReleaseType` a secas, la tarjeta del catálogo decía
   * "Single" sobre "2 pistas" y la ficha de release decía otra cosa. Dos
   * etiquetas para la misma fila, en dos páginas: es el mismo bug que reportó el
   * usuario, solo que repartido.
   */
  const SIN_HELPER = /capitalizeReleaseType\(\s*(track|release)\.release_type/;

  it("ni la ficha, ni la tarjeta, ni la lista de lanzamientos lo calculan por su cuenta", () => {
    for (const f of [
      "app/releases/[id]/page.tsx",
      "components/EPKCard.tsx",
      "components/ArtistTracksSection.tsx",
    ]) {
      const src = leer(...f.split("/"));
      expect(src, f).not.toMatch(SIN_HELPER);
    }
  });

  it("las tres usan el helper, que sabe que un single es una pista", () => {
    for (const f of [
      "app/releases/[id]/page.tsx",
      "components/EPKCard.tsx",
      "components/ArtistTracksSection.tsx",
    ]) {
      expect(leer(...f.split("/")), f).toContain("releaseTypeLabel");
    }
  });
});

describe("el botón del catálogo lleva al artista", () => {
  const ACCIONES = "components/ReleaseActions.tsx";

  it("acepta `artistId` y lo usa para el enlace", () => {
    const src = leer(ACCIONES);
    expect(src).toContain("artistId?: string | null");
    // El ancla es lo que hace que el navegador baje solo a la lista de
    // lanzamientos en vez de aterrizar en la bio del artista.
    expect(src).toContain("#lanzamientos");
  });

  it("si no hay `artistId`, cae al catálogo entero", () => {
    // Ir al catálogo entero es peor que no ir, pero llevar a un artista
    // equivocado es peor todavía: por eso el fallback es `/artists`.
    const src = leer(ACCIONES);
    expect(src).toMatch(/artistId\s*\?\s*`\/artists\/\$\{artistId\}#lanzamientos`\s*:\s*"\/artists"/);
  });

  it("el ancla existe en la página del artista, y con `scroll-mt`", () => {
    const seccion = leer("components/ArtistTracksSection.tsx");
    expect(seccion).toContain('id="lanzamientos"');
    // Sin `scroll-mt`, el encabezado queda pegado al borde de arriba y la lista
    // de debajo esconde justo donde hay que mirar.
    expect(seccion).toMatch(/scroll-mt-\d+/);
  });

  it("la etiqueta distingue «su catálogo» de «el catálogo»", () => {
    const src = leer(ACCIONES);
    expect(src).toContain("Ver su catálogo");
    expect(src).toContain("Explorar el catálogo");
  });
});
