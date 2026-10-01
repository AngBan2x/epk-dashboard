import { describe, it, expect } from "vitest";

import {
  buildCoverUpdate,
  isImageContentType,
  isStockPhotoUrl,
  isYouTubeThumbnailUrl,
  matchReleaseIdentity,
  rankMusicBrainzRelease,
  resolveCoverArt,
  selectCoverUpdates,
  shouldReplaceCover,
  type CoverWanted,
  type ImageProbe,
  type MusicBrainzRelease,
} from "@/lib/deezer";

/**
 * RC.32 · agente G — carátulas desde MusicBrainz / Cover Art Archive.
 *
 * Las tres propiedades que hacen que este script no degrade el catálogo:
 *
 *  1. **El thumbnail de YouTube no se acepta como carátula.** No es artwork: es
 *     el fotograma que el uploader exportó como miniatura del vídeo.
 *  2. **Un release que solo coincide parcialmente se rechaza.** En carátulas no
 *     hay holgura: es el error de *Tour de France* (single de 1983 frente al
 *     álbum de 2003), que ya se cometió con iTunes.
 *  3. **Una portada que no es una imagen no se escribe.** Y una que ya viene de
 *     iTunes no se toca.
 *
 * Ninguno de estos tests toca la red: el verificador es un doble inyectado.
 */

/**
 * *Tour de France* es el caso real y el que tiene la trampa: existe como single
 * de 1983 y como álbum de 2003. Los valores por defecto de los fixtures son los
 * de ese release, para que cada test parta de un par que **encaja** y solo se
 * desvíe en lo que pretende probar.
 */
const MBID_TDF_1983 = "4a9ef5d5-9331-4f62-b1a1-05bac3d1d19e";
const MBID_TDF_1983_SIN_PORTADA = "796d4cf7-76a9-4747-842b-d085b52dfd27";
const MBID_COMPUTER_WORLD = "4ae1b539-8574-4fc7-aeaa-4385a1744ba1";

/**
 * URL final de archive.org, que es la estable. Cover Art Archive es un
 * redirector (`307` → `302`), así que lo que se guarda es esto.
 */
const CAA_FINAL = `https://archive.org/download/mbid-${MBID_TDF_1983}/mbid-${MBID_TDF_1983}-front.jpg`;

function okImage(url: string = CAA_FINAL): ImageProbe {
  return { ok: true, url, httpStatus: 200, contentType: "image/jpeg", bytes: 314_572 };
}

function failImage(reason: "sin-portada" | "no-es-imagen", detail: string): ImageProbe {
  return { ok: false, reason, detail };
}

function release(over: Partial<MusicBrainzRelease> = {}): MusicBrainzRelease {
  return {
    id: MBID_TDF_1983,
    title: "Tour de France",
    artistNames: ["Kraftwerk"],
    date: "1983-06-01",
    status: "Official",
    primaryType: "Single",
    ...over,
  };
}

function wanted(over: Partial<CoverWanted> = {}): CoverWanted {
  return {
    id: "rel-2f1c",
    title: "Tour de France",
    artistName: "Kraftwerk",
    releaseDate: "1983-06-01",
    currentCoverImage: "https://images.unsplash.com/photo-1519892300165-cb5542fb47c7",
    ...over,
  };
}

// ── 1 · El thumbnail de YouTube NO es una carátula ──────────────────────────

describe("isYouTubeThumbnailUrl", () => {
  // ── EL TEST QUE CAMBIA AL REVERTIR (1) ────────────────────────────────
  it("reconoce el thumbnail de YouTube por HOST, no por el nombre del fichero", () => {
    // Es el que construye `lib/youtube.ts:82-85` y el que el catálogo ya usa.
    expect(isYouTubeThumbnailUrl("https://img.youtube.com/vi/M7Z_1wzbxG8/maxresdefault.jpg")).toBe(true);
    expect(isYouTubeThumbnailUrl("https://i.ytimg.com/vi/P03mdT9cxlg/maxresdefault.jpg")).toBe(true);
    expect(isYouTubeThumbnailUrl("https://i9.ytimg.com/vi/abc/hqdefault.jpg")).toBe(true);
    // Aunque el nombre del fichero diga "cover" o "portada", el host manda.
    expect(isYouTubeThumbnailUrl("https://img.youtube.com/vi/abc/album-cover.jpg")).toBe(true);

    expect(isYouTubeThumbnailUrl("https://archive.org/download/mbid-x/front.jpg")).toBe(false);
    expect(isYouTubeThumbnailUrl("https://is1-ssl.mzstatic.com/image/thumb/Music/jpeg.jpg")).toBe(false);
    expect(isYouTubeThumbnailUrl("https://images.unsplash.com/photo-1519892300165.jpg")).toBe(false);
    expect(isYouTubeThumbnailUrl("")).toBe(false);
    expect(isYouTubeThumbnailUrl(null)).toBe(false);
    expect(isYouTubeThumbnailUrl("no-es-una-url")).toBe(false);
  });

  it("una carátula que resuelve a un thumbnail de YouTube se rechaza igual", async () => {
    //aunque la fuente sea CAA, si el recurso final es un thumbnail no vale.
    const resolution = await resolveCoverArt(wanted(), [release()], async () =>
      okImage("https://img.youtube.com/vi/xyz/maxresdefault.jpg")
    );
    expect(resolution.verified).toBeNull();
    expect(resolution.rejected.some((r) => r.reason === "es-thumbnail-de-youtube")).toBe(true);
    expect(buildCoverUpdate(resolution)).toBeNull();
  });
});

describe("isStockPhotoUrl / shouldReplaceCover", () => {
  it("detecta las fotos de banco del catálogo", () => {
    expect(isStockPhotoUrl("https://images.unsplash.com/photo-1519892300165-cb5542fb47c7")).toBe(true);
    expect(isStockPhotoUrl("https://images.pexels.com/photos/1/x.jpg")).toBe(true);
    expect(isStockPhotoUrl(CAA_FINAL)).toBe(false);
  });

  it("sustituye vacío y banco; NO toca iTunes ni thumbnail", () => {
    expect(shouldReplaceCover(null)).toBe(true);
    expect(shouldReplaceCover("")).toBe(true);
    expect(shouldReplaceCover("https://images.unsplash.com/photo-1519892300165-x.jpg")).toBe(true);

    // Una portada que ya viene de iTunes es buena: cambiarla a mano sería hacer
    // justo lo que este script existe para no hacer.
    expect(shouldReplaceCover("https://is1-ssl.mzstatic.com/image/thumb/Music/x.jpg")).toBe(false);
    // Y el thumbnail de YouTube tampoco se "mejora": no es artwork, y sustituirlo
    // por un artwork sí sería correcto — pero eso lo decide otro script, con
    // otra fuente. Aquí la regla es no tocar lo que no es banco.
    expect(shouldReplaceCover("https://img.youtube.com/vi/M7Z_1wzbxG8/maxresdefault.jpg")).toBe(false);
  });
});

describe("isImageContentType", () => {
  it("acepta imágenes reales y rechaza SVG y HTML", () => {
    expect(isImageContentType("image/jpeg")).toBe(true);
    expect(isImageContentType("image/png")).toBe(true);
    expect(isImageContentType("image/jpeg; charset=binary")).toBe(true);

    // Un SVG es un documento activo: servido como portada lo acaba ejecutando el
    // navegador. No es lo que devuelve CAA para un `front`.
    expect(isImageContentType("image/svg+xml")).toBe(false);
    // CAA devuelve 404 con HTML: colarse por ahí sería escribir un 404.
    expect(isImageContentType("text/html")).toBe(false);
    expect(isImageContentType("")).toBe(false);
  });
});

// ── 2 · Identidad del release ───────────────────────────────────────────────

describe("matchReleaseIdentity", () => {
  // ── EL TEST QUE CAMBIA AL REVERTIR (2) ────────────────────────────────
  it("RECHAZA un título que solo coincide parcialmente: en carátulas no hay holgura", () => {
    // A diferencia del audio, aquí no existe el "calificado con ancla": no hay
    // forma de probar de qué edición es la portada.
    const target = wanted({ title: "Tour de France", releaseDate: "1983-06-01" });
    expect(matchReleaseIdentity(release({ title: "Tour de France (Remastered)" }), target).ok).toBe(false);
    expect(matchReleaseIdentity(release({ title: "Tour de France Live" }), target).ok).toBe(false);
    expect(matchReleaseIdentity(release({ title: "Tour de France 2003" }), target).ok).toBe(false);
    expect(matchReleaseIdentity(release({ title: "Computer World" }), target).ok).toBe(false);
  });

  it("exige artista exacto y título exacto", () => {
    // Colaboración ≠ el artista del catálogo.
    expect(
      matchReleaseIdentity(release({ artistNames: ["Kraftwerk & Ryuichi Sakamoto"] }), wanted()).ok
    ).toBe(false);
    // Título distinto.
    expect(matchReleaseIdentity(release({ title: "Tour de France 2003" }), wanted()).ok).toBe(false);
    // Y el caso bueno: artista y título clavados.
    expect(matchReleaseIdentity(release(), wanted()).ok).toBe(true);
  });
});

describe("rankMusicBrainzRelease", () => {
  it("el año del catálogo gana: el single de 1983 sobre el álbum de 2003", () => {
    const target = wanted({ title: "Tour de France", releaseDate: "1983-06-01" });
    const del83 = release({ id: "a", title: "Tour de France", date: "1983-06-01" });
    const del2009 = release({ id: "b", title: "Tour de France", date: "2009-10-09" });
    const del83sinFecha = release({ id: "c", title: "Tour de France", date: null });

    expect(rankMusicBrainzRelease(del83, target)).toBeGreaterThan(rankMusicBrainzRelease(del2009, target));
    // Sin fecha no se sabe qué edición es: puntúa menos que una del año bueno,
    // pero más que una del año equivocado.
    expect(rankMusicBrainzRelease(del83sinFecha, target)).toBeGreaterThan(
      rankMusicBrainzRelease(del2009, target)
    );
  });

  it("un lanzamiento oficial puntúa más que una promoción", () => {
    const target = wanted();
    expect(rankMusicBrainzRelease(release({ status: "Official" }), target)).toBeGreaterThan(
      rankMusicBrainzRelease(release({ status: "Promotion" }), target)
    );
  });
});

// ── 3 · Resolución y escritura ──────────────────────────────────────────────

describe("resolveCoverArt", () => {
  it("resuelve y guarda la URL FINAL de archive.org, no la de CAA", async () => {
    const resolution = await resolveCoverArt(wanted(), [release()], async () => okImage());
    expect(resolution.release?.id).toBe(MBID_TDF_1983);
    expect(resolution.verified?.url).toBe(CAA_FINAL);
    expect(resolution.reason).toBe("");
    expect(buildCoverUpdate(resolution)?.cover_image).toBe(CAA_FINAL);
  });

  it("prueba el siguiente release cuando el primero no tiene portada", async () => {
    // El primero puntúa más alto (fecha exacta del catálogo) y CAA devuelve 404
    // para él: es el caso real de `796d4cf7`. La pregunta no es "¿el primero de
    // la lista funcionaba?", sino "¿hay portada?".
    const sinPortada = release({ id: MBID_TDF_1983_SIN_PORTADA, date: "1983-06-01" });
    const conPortada = release({ id: MBID_TDF_1983, date: null });
    expect(rankMusicBrainzRelease(sinPortada, wanted())).toBeGreaterThan(
      rankMusicBrainzRelease(conPortada, wanted())
    );

    const resolution = await resolveCoverArt(wanted(), [conPortada, sinPortada], async (url) =>
      url.includes(MBID_TDF_1983_SIN_PORTADA) ? failImage("sin-portada", "HTTP 404") : okImage()
    );
    expect(resolution.release?.id).toBe(MBID_TDF_1983);
    expect(resolution.rejected.some((r) => r.reason === "sin-portada")).toBe(true);
  });

  // ── EL TEST QUE CAMBIA AL REVERTIR (3) ────────────────────────────────
  it("NO escribe un recurso que no es una imagen", async () => {
    // CAA devuelve 404 con `text/html`. Escribir eso en `cover_image` deja una
    // portada que no carga, que es peor que la foto de banco que había.
    const resolution = await resolveCoverArt(wanted(), [release()], async () =>
      failImage("no-es-imagen", 'content-type "text/html"')
    );
    expect(resolution.verified).toBeNull();
    expect(buildCoverUpdate(resolution)).toBeNull();
    expect(selectCoverUpdates([resolution])).toHaveLength(0);
  });

  it("descarta un release que no es Official", async () => {
    const resolution = await resolveCoverArt(
      wanted(),
      [release({ status: "Bootleg" })],
      async () => okImage()
    );
    expect(resolution.verified).toBeNull();
    expect(resolution.rejected.some((r) => r.reason === "no-es-un-lanzamiento")).toBe(true);
  });

  it("no escribe si la portada actual ya es buena", async () => {
    const resolution = await resolveCoverArt(
      wanted({ currentCoverImage: "https://is1-ssl.mzstatic.com/image/thumb/Music/x.jpg" }),
      [release()],
      async () => okImage()
    );
    // La resolución existe, pero la decisión de escritura dice que no.
    expect(resolution.verified).not.toBeNull();
    expect(buildCoverUpdate(resolution)).toBeNull();
    expect(selectCoverUpdates([resolution])).toHaveLength(0);
  });

  it("no reescribe si la URL es idéntica a la actual", async () => {
    const resolution = await resolveCoverArt(
      wanted({ currentCoverImage: CAA_FINAL }),
      [release()],
      async () => okImage()
    );
    expect(selectCoverUpdates([resolution])).toHaveLength(0);
  });

  it("sin releases, NO RESUELTO y nada que escribir", async () => {
    const resolution = await resolveCoverArt(wanted(), [], async () => okImage());
    expect(resolution.reason).toContain("MusicBrainz no devolvió");
    expect(selectCoverUpdates([resolution])).toHaveLength(0);
  });

  it("reparte la misma portada a la fila que la hereda", async () => {
    const padre = await resolveCoverArt(wanted(), [release()], async () => okImage());
    const hija: typeof padre = {
      ...padre,
      wanted: { ...padre.wanted, id: "trk-d19f", currentCoverImage: "https://images.unsplash.com/photo-1.jpg" },
    };
    const updates = selectCoverUpdates([padre, hija]);
    expect(updates).toHaveLength(2);
    expect(updates.map((u) => u.id)).toEqual(["rel-2f1c", "trk-d19f"]);
    // Misma URL: es la misma portada heredada, no dos imágenes distintas.
    expect(new Set(updates.map((u) => u.cover_image)).size).toBe(1);
  });
});