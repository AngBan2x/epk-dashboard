import { describe, it, expect } from "vitest";

import {
  DEEZER_PREVIEW_TOKEN_TTL_SECONDS,
  MIN_DURABLE_PREVIEW_TTL_SECONDS,
  buildDeezerUpdate,
  deezerPreviewExpiryMs,
  deezerPreviewTtlSeconds,
  deezerArtistMatches,
  isDurablePreviewUrl,
  isTrackResult,
  matchDeezerTitle,
  normalizeDeezerText,
  rankDeezerCandidate,
  resolveDeezerPreview,
  selectDeezerUpdates,
  type AudioProbe,
  type DeezerCandidate,
  type DeezerWanted,
} from "@/lib/deezer";

/**
 * RC.32 · agente G — previews de Deezer.
 *
 * Fijan las cuatro propiedades que hacen que el script no cometa los errores que
 * este repo ya pagó con iTunes (`AI_LOG.md:5448-5449`):
 *
 *  1. Un título que **solo coincide parcialmente** se rechaza. Nunca.
 *  2. Una URL que **no da 200** no se ofrece.
 *  3. Un candidato de la **desambiguación equivocada** se descarta.
 *  4. Una URL que **caduca** no se escribe, aunque dé 200 con `ACAO: *`.
 *
 * Ninguno de estos tests toca la red: el verificador HTTP es un doble inyectado.
 */

// ── El doble de red ────────────────────────────────────────────────────────

const NOW = 1_790_000_000_000; // fijo: los tests no dependen del reloj

/** URL firmada con la caducidad que se le pida. */
function signedPreview(expSeconds: number, id = "a".repeat(32)): string {
  return (
    `https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/d/${id}.mp3` +
    `?hdnea=exp=${expSeconds}~acl=/api/1/1/a/b/c/d/${id}.mp3~data=user_id=0,application_id=42~hmac=deadbeef`
  );
}

const LONG_LIVED = signedPreview(Math.floor(NOW / 1000) + 30 * 24 * 3600);
const SHORT_LIVED = signedPreview(Math.floor(NOW / 1000) + DEEZER_PREVIEW_TOKEN_TTL_SECONDS);

function okProbe(url: string): AudioProbe {
  return { ok: true, url, httpStatus: 200, contentType: "audio/mpeg", accessControlAllowOrigin: "*" };
}

function failProbe(reason: "http-no-200" | "sin-acao" | "content-type-no-audio", detail: string): AudioProbe {
  return { ok: false, reason, detail };
}

function candidate(over: Partial<DeezerCandidate> = {}): DeezerCandidate {
  return {
    id: 1,
    title: "Speak to Me",
    artistName: "Pink Floyd",
    albumTitle: "The Dark Side of the Moon",
    previewUrl: LONG_LIVED,
    releaseDate: "1973-03-01",
    type: "track",
    ...over,
  };
}

function wanted(over: Partial<DeezerWanted> = {}): DeezerWanted {
  return {
    id: "trk-1",
    title: "Speak to Me",
    artistName: "Pink Floyd",
    releaseDate: "1973-03-01",
    expectedCollection: "The Dark Side of the Moon",
    currentPreviewUrl: null,
    ...over,
  };
}

// ── 1 · Normalización y desambiguación ──────────────────────────────────────

describe("normalizeDeezerText", () => {
  it("quita diacríticos, puntuación y mayúsculas", () => {
    expect(normalizeDeezerText("Björk")).toBe("bjork");
    expect(normalizeDeezerText("V-2 Schneider")).toBe("v 2 schneider");
    expect(normalizeDeezerText("  'Heroes'  ")).toBe("heroes");
  });

  it("el artista tiene que coincidir EXACTO: 'Björk & Someone' no es Björk", () => {
    expect(deezerArtistMatches("Björk", "Björk")).toBe(true);
    expect(deezerArtistMatches("Björk", "björk")).toBe(true);
    // La colaboración NO es la artista del catálogo. Con `includes` colaría.
    expect(deezerArtistMatches("Björk & The Heritage Orchestra", "Björk")).toBe(false);
    expect(deezerArtistMatches("David Bowie (Tribute Band)", "David Bowie")).toBe(false);
    expect(deezerArtistMatches("", "Pink Floyd")).toBe(false);
  });
});

describe("matchDeezerTitle", () => {
  it("exacto cuando coincide tal cual, con o sin ancla", () => {
    expect(matchDeezerTitle("Speak to Me", "Speak to Me", false)).toBe("exacto");
    expect(matchDeezerTitle("Speak to Me", "Speak to Me", true)).toBe("exacto");
  });

  // ── EL TEST QUE CAMBIA AL REVERTIR (1) ──────────────────────────────────
  it("RECHAZA un título que solo coincide parcialmente, y no hay ancla que lo salve", () => {
    // Sin ancla, "Stonemilker" para "Stonemilker (Strings)" es `parcial`.
    // `parcial` NUNCA se acepta: es la versión de estudio de otro álbum, el
    // error que este repo ya pagó dos veces.
    expect(matchDeezerTitle("Stonemilker", "Stonemilker (Strings)", false)).toBe("parcial");

    // Con ancla el mismo caso pasa a `calificado`, porque el ancla dice de qué
    // álbum sale. Ambas cosas tienen que ser verdad a la vez.
    expect(matchDeezerTitle("Stonemilker", "Stonemilker (Strings)", true)).toBe("calificado");

    // Un título que se solapa sin calificador de por medio sigue siendo parcial.
    expect(matchDeezerTitle("Speak to Me / Breathe", "Speak to Me", true)).toBe("parcial");
  });

  it("NO admite 'version' como calificador transparente: el álbum de 2003 no entra", () => {
    // Deezer devuelve `Tour de France '03 (Version 3)` del álbum de 2003. Con
    // `"version"` en la lista de calificadores transparentes esto se aceptaría
    // como el single de 1983. No.
    expect(matchDeezerTitle("Tour de France '03 (Version 3)", "Tour de France", true)).not.toBe(
      "calificado"
    );
    expect(matchDeezerTitle("Tour de France (Live)", "Tour de France", true)).not.toBe("calificado");
  });

  it("un grupo con 'version' + un AÑO tampoco se quita: es la aislada de la regla", () => {
    // El caso anterior se rechaza por **dos** razones a la vez (`version` no es
    // transparente Y `3` no es un año de 4 cifras), así que no distingue si
    // `"version"` está en la lista o no. Este sí la aísla: el grupo se compone
    // solo de `version` y un año, que es exactamente lo que un grupo transparente
    // necesita para pasar el filtro. Si alguien mete `"version"` en
    // `TRANSPARENT_TITLE_QUALIFIERS`, este test falla y aquél no.
    expect(matchDeezerTitle("Tour de France (Version 2003)", "Tour de France", true)).not.toBe(
      "calificado"
    );
    // Y el control: quitando `version` del grupo, el título encaja de verdad.
    expect(matchDeezerTitle("Tour de France (2003 Remaster)", "Tour de France", true)).toBe(
      "calificado"
    );
  });

  it("SÍ admite un calificador de edición, pero solo con ancla", () => {
    // El único resultado de Deezer para Heroes es el remaster de 2017. Con
    // ancla es `calificado`; sin ancla se queda en `parcial` y no se acepta.
    expect(matchDeezerTitle('"Heroes" (2017 Remaster)', "Heroes", true)).toBe("calificado");
    expect(matchDeezerTitle('"Heroes" (2017 Remaster)', "Heroes", false)).toBe("parcial");

    expect(
      matchDeezerTitle("V-2 Schneider (2017 Remaster)", "V-2 Schneider", true)
    ).toBe("calificado");
  });

  it("un grupo con una palabra no transparente NO se quita entero", () => {
    // "(Single Version; 2002 Digital Remaster)" lleva `remaster`, pero también
    // `single`, `version` y `digital`: no es un grupo transparente y el título
    // no encaja.
    expect(
      matchDeezerTitle(
        "Heroes (Single Version; 2002 Digital Remaster)",
        "Heroes",
        true
      )
    ).not.toBe("calificado");
  });

  it("distinto cuando no hay nada en común", () => {
    expect(matchDeezerTitle("Atom Dance", "Notget (Strings)", true)).toBe("distinto");
  });
});

describe("isTrackResult", () => {
  // ── EL TEST QUE CAMBIA AL REVERTIR (3, parte 1) ────────────────────────
  it("un álbum de Deezer no es una canción", () => {
    // `The Wall`, `OK Computer`, `The Dark Side of the Moon` y
    // `Vulnicura Strings` son títulos de álbum: Deezer los devuelve tal cual y
    // "coincidirían" con el título del release.
    expect(isTrackResult({ type: "album" })).toBe(false);
    expect(isTrackResult({ type: "track" })).toBe(true);
    // Sin tipo no se admite: no se puede demostrar que sea una pista.
    expect(isTrackResult({})).toBe(false);
    expect(isTrackResult(null)).toBe(false);
  });
});

describe("rankDeezerCandidate", () => {
  it("prefiere el título exacto y el año del catálogo", () => {
    const w = wanted();
    const exactoMismoAnyo = candidate({
      title: "Speak to Me",
      albumTitle: "The Dark Side of the Moon",
      releaseDate: "1973-03-01",
    });
    const exactoOtroAnyo = candidate({
      title: "Speak to Me",
      albumTitle: "The Dark Side of the Moon (Remastered)",
      releaseDate: "2011-09-26",
    });
    const calificado = candidate({
      title: "Speak to Me (2011 Remaster)",
      albumTitle: "The Dark Side of the Moon (Remastered)",
      releaseDate: "2011-09-26",
    });
    expect(rankDeezerCandidate(exactoMismoAnyo, w, "exacto")).toBeGreaterThan(
      rankDeezerCandidate(exactoOtroAnyo, w, "exacto")
    );
    expect(rankDeezerCandidate(exactoOtroAnyo, w, "exacto")).toBeGreaterThan(
      rankDeezerCandidate(calificado, w, "calificado")
    );
  });
});

// ── 2 · La caducidad: por qué no se escribe ────────────────────────────────

describe("deezerPreviewTtlSeconds", () => {
  it("lee el `exp` de la query firmada", () => {
    const exp = Math.floor(NOW / 1000) + 600;
    expect(deezerPreviewExpiryMs(signedPreview(exp))).toBe(exp * 1000);
    expect(deezerPreviewTtlSeconds(signedPreview(exp), NOW)).toBe(600);
  });

  it("una URL sin `exp` da `null` — desconocido, no infinito", () => {
    expect(deezerPreviewTtlSeconds("https://cdnt-preview.dzcdn.net/api/1/1/x/y/z/w.mp3", NOW)).toBeNull();
    expect(isDurablePreviewUrl("https://cdnt-preview.dzcdn.net/api/1/1/x/y/z/w.mp3", NOW)).toBe(false);
    expect(deezerPreviewTtlSeconds(null, NOW)).toBeNull();
  });

  // ── EL TEST QUE CAMBIA AL REVERTIR (4) ────────────────────────────────
  it("una URL que caduca en 15 min NO es durable, aunque dé 200 con ACAO", () => {
    // Es el caso real de Deezer: el token `hdnea` expira a los 900 s y la firma
    // es obligatoria (sin la query da 403). Escribirla produciría una tarjeta
    // con "Reproducir" que responde "archivo no disponible".
    expect(DEEZER_PREVIEW_TOKEN_TTL_SECONDS).toBe(900);
    expect(isDurablePreviewUrl(SHORT_LIVED, NOW)).toBe(false);
    expect(isDurablePreviewUrl(LONG_LIVED, NOW)).toBe(true);

    // Y una URL ya caducada tampoco.
    const expired = signedPreview(Math.floor(NOW / 1000) - 10);
    expect(deezerPreviewTtlSeconds(expired, NOW)).toBe(-10);
    expect(isDurablePreviewUrl(expired, NOW)).toBe(false);
  });

  it("el umbral por defecto son 7 días", () => {
    expect(MIN_DURABLE_PREVIEW_TTL_SECONDS).toBe(7 * 24 * 3600);
  });
});

// ── 3 · Resolución ─────────────────────────────────────────────────────────

describe("resolveDeezerPreview", () => {
  it("resuelve cuando artista, título, colección y HTTP encajan", async () => {
    const resolution = await resolveDeezerPreview(wanted(), [candidate()], async (u) => okProbe(u), NOW);
    expect(resolution.chosen?.title).toBe("Speak to Me");
    expect(resolution.verified?.httpStatus).toBe(200);
    expect(resolution.reason).toBe("");
    expect(resolution.usedQualifiedTitle).toBe(false);
    expect(resolution.ttlSeconds).toBeGreaterThan(MIN_DURABLE_PREVIEW_TTL_SECONDS);
  });

  it("acepta el título calificado y deja constancia de que lo usó", async () => {
    const resolution = await resolveDeezerPreview(
      wanted({
        title: "Stonemilker (Strings)",
        artistName: "Björk",
        expectedCollection: "Vulnicura Strings",
        releaseDate: "2016-11-04",
      }),
      [
        candidate({
          id: 2629697932,
          title: "Stonemilker",
          artistName: "Björk",
          albumTitle: "Vulnicura Strings (Vulnicura: The Acoustic Version…)",
          previewUrl: LONG_LIVED,
          releaseDate: "2018-04-13",
        }),
      ],
      async (u) => okProbe(u),
      NOW
    );
    expect(resolution.chosen?.id).toBe(2629697932);
    expect(resolution.usedQualifiedTitle).toBe(true);
  });

  // ── EL TEST QUE CAMBIA AL REVERTIR (2) ────────────────────────────────
  it("una URL que NO da 200 no se ofrece", async () => {
    const resolution = await resolveDeezerPreview(
      wanted(),
      [candidate()],
      async () => failProbe("http-no-200", "HTTP 404"),
      NOW
    );
    expect(resolution.chosen).toBeNull();
    expect(resolution.verified).toBeNull();
    expect(resolution.httpRejected).toHaveLength(1);
    expect(resolution.reason).toContain("no pasaron la prueba HTTP");
  });

  it("una URL sin ACAO tampoco se ofrece (el navegador rechazaría play())", async () => {
    const resolution = await resolveDeezerPreview(
      wanted(),
      [candidate()],
      async () => failProbe("sin-acao", "el CDN no devolvió Access-Control-Allow-Origin"),
      NOW
    );
    expect(resolution.chosen).toBeNull();
  });

  it("si el mejor candidato muere por HTTP, prueba el siguiente", async () => {
    const primero = candidate({ id: 10, previewUrl: LONG_LIVED });
    const segundo = candidate({ id: 11, albumTitle: "The Dark Side of the Moon (Remastered)" });
    const probed: string[] = [];
    const resolution = await resolveDeezerPreview(
      wanted(),
      [primero, segundo],
      async (url) => {
        probed.push(url);
        return probed.length === 1
          ? failProbe("http-no-200", "HTTP 404")
          : okProbe(url);
      },
      NOW
    );
    expect(resolution.chosen?.id).toBe(11);
    expect(probed).toHaveLength(2);
    expect(resolution.httpRejected).toHaveLength(1);
  });

  it("descarta artista distinto, colección distinta y álbum", async () => {
    const resolution = await resolveDeezerPreview(
      wanted(),
      [
        candidate({ id: 1, artistName: "Roger Waters" }),
        candidate({ id: 2, albumTitle: "Pulse" }),
        candidate({ id: 3, type: "album" }),
        candidate({ id: 4 }),
      ],
      async (u) => okProbe(u),
      NOW
    );
    expect(resolution.chosen?.id).toBe(4);
    const reasons = resolution.rejected.map((r) => r.reason);
    expect(reasons).toContain("artista-distinto");
    expect(reasons).toContain("coleccion-distinta");
    expect(reasons).toContain("tipo-no-track");
  });

  it("sin ancla, un título parcial deja la pista NO RESUELTA", async () => {
    // Sin ancla, un "Stonemilker" a secas es la versión de estudio de *Homogenic*,
    // no la de cuerdas: es exactamente el error que este repo ya pagó.
    const resolution = await resolveDeezerPreview(
      wanted({
        title: "Stonemilker (Strings)",
        artistName: "Björk",
        expectedCollection: null,
      }),
      [candidate({ title: "Stonemilker", artistName: "Björk", albumTitle: "Homogenic" })],
      async (u) => okProbe(u),
      NOW
    );
    expect(resolution.chosen).toBeNull();
    expect(resolution.rejected[0]?.reason).toBe("titulo-parcial-sin-ancla");
  });
});

// ── 4 · Decisión de escritura ───────────────────────────────────────────────

describe("buildDeezerUpdate / selectDeezerUpdates", () => {
  // ── EL TEST QUE CAMBIA AL REVERTIR (4, aplicado) ──────────────────────
  it("NO escribe una URL de Deezer, por muy bien que verifique", async () => {
    // Da 200, content-type de audio y ACAO: las tres comprobaciones pasan. Aun
    // así no se escribe, porque caduca a los 900 s.
    const resolution = await resolveDeezerPreview(
      wanted(),
      [candidate({ previewUrl: SHORT_LIVED })],
      async (u) => okProbe(u),
      NOW
    );
    expect(resolution.chosen).not.toBeNull();
    expect(resolution.verified?.httpStatus).toBe(200);
    expect(resolution.reason).toContain("NO escribible");
    expect(buildDeezerUpdate(resolution)).toBeNull();
    expect(selectDeezerUpdates([resolution], NOW)).toHaveLength(0);
  });

  it("sí escribiría una URL duradera, y solo si no cambia la actual", async () => {
    const durable = await resolveDeezerPreview(
      wanted({ currentPreviewUrl: null }),
      [candidate()],
      async (u) => okProbe(u),
      NOW
    );
    const update = buildDeezerUpdate(durable);
    expect(update?.audio_preview_url).toBe(LONG_LIVED);
    expect(selectDeezerUpdates([durable], NOW)).toHaveLength(1);

    // Si la fila ya tiene exactamente esa URL, no se reescribe: el recuento de
    // "filas aplicadas" tiene que significar algo.
    const yaEsta = await resolveDeezerPreview(
      wanted({ currentPreviewUrl: LONG_LIVED }),
      [candidate()],
      async (u) => okProbe(u),
      NOW
    );
    expect(selectDeezerUpdates([yaEsta], NOW)).toHaveLength(0);
  });

  // ── Por qué no se escribe `itunes_track_id` ──────────────────────────
  it("la actualización NO lleva ningún id de Deezer: no hay columna para él", async () => {
    const resolution = await resolveDeezerPreview(
      wanted(),
      [candidate()],
      async (u) => okProbe(u),
      NOW
    );
    const update = buildDeezerUpdate(resolution);
    expect(update).not.toBeNull();
    // `tracks` no tiene columna `deezer_track_id`, y rellenar la de iTunes con
    // un id de Deezer haría que `lib/downloadable-assets.ts` construyera un
    // enlace de Apple Music a otra canción.
    expect(Object.keys(update ?? {}).sort()).toEqual(["audio_preview_url", "id", "verified"]);
  });

  it("una resolución sin elegido no produce actualización", async () => {
    const resolution = await resolveDeezerPreview(wanted(), [], async () => okProbe("x"), NOW);
    expect(buildDeezerUpdate(resolution)).toBeNull();
    expect(selectDeezerUpdates([resolution], NOW)).toHaveLength(0);
  });
});