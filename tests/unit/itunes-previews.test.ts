import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

import {
  audioArtistMatches,
  buildAudioUpdate,
  collectionMatches,
  hasITunesArtwork,
  matchAudioTitle,
  normalizeAudioText,
  rankAudioCandidate,
  resolveAudioPreview,
  selectPendingUpdates,
  toITunesTrackId,
  verifyPreviewUrl,
  type AudioCandidate,
  type PreviewProbe,
  type PreviewVerifier,
  type WantedTrack,
} from "@/lib/seed-audio";

/**
 * P3 (RC.31) — el backfill de audio, y los otros dos arreglos de este agente.
 *
 * ── Por qué la P3 ──────────────────────────────────────────────────────────
 * Las 6 URLs de preview escritas a mano en `scripts/seed-f9-catalog.ts` están
 * CADUCADAS: hoy dan 404 (comprobado con `curl -I`). El "Error al iniciar
 * reproducción — archivo no disponible" de la pantalla es una URL muerta, no
 * CORS: D1 midió `Access-Control-Allow-Origin: *` en
 * `audio-ssl.itunes.apple.com`, así que el arreglo de `AI_LOG.md:1268`
 * ("removido crossOrigin para evitar CORS con CDN Apple") resolvía un problema
 * que no existía.
 *
 * Estos tests fijan las TRES propiedades que hacen que el arreglo no vuelva a
 * ser de adorno:
 *  1. una URL que no da 200 no se ofrece como escribible — ni cuando la
 *     petición la hace `verifyPreviewUrl`, ni cuando el verificador devuelve
 *     fallo;
 *  2. `itunes_track_id` se escribe con el `trackId` del resultado de iTunes,
 *     como texto;
 *  3. la desambiguación RECHAZA un título que solo coincide parcialmente, un
 *     artista distinto y una colección distinta.
 *
 * ── Por qué los otros dos describe están aquí ──────────────────────────────
 * Este agente solo puede abrir ficheros nuevos que le pertenecen, y `tests/unit/**`
 * ya existente es de otros. Un fix sin un test que falle al revertirlo es un fix
 * que se deshace en la siguiente ola sin que nadie lo note — y el repo ya pagó
 * eso: el 500 del PDF costó tres despliegues porque el check pasaba siempre. Por
 * eso S0/P12b y P15 se cubren aquí, con un comentario que dice de qué fix son, en
 * vez de dejar el arreglo sin guardia.
 */

/** Las 6 URLs del seed que hoy dan 404. Es el caso real que motivó el arreglo. */
const DEAD_SEED_URL =
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/a7/d7/1f/a7d71f16-1b4b-4c80-9e32-c5ef7862c86d/mzaf_14085285085985977537.plus.aac.p.m4a";
const ALIVE_SEED_URL =
  "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/21/c0/a8/21c0a8a9-dadf-55e5-aeba-50dcc704a736/mzaf_5583157979505295580.plus.aac.p.m4a";

function candidate(over: Partial<AudioCandidate> = {}): AudioCandidate {
  return {
    trackId: 1440831175,
    artistName: "Kate Bush",
    trackName: "Running Up That Hill",
    collectionName: "Hounds of Love",
    previewUrl: ALIVE_SEED_URL,
    releaseDate: "1985-08-05T07:00:00Z",
    ...over,
  };
}

/** Verificador que decide sin red, y anota a qué URL se le preguntó. */
function fixedVerifier(fail: PreviewProbe, calls: string[] = []): PreviewVerifier {
  return async (url: string) => {
    calls.push(url);
    return fail;
  };
}

const okProbe = (url: string): PreviewProbe => ({
  ok: true,
  url,
  httpStatus: 200,
  contentType: "audio/x-m4p",
  accessControlAllowOrigin: "*",
  usedRangeGet: false,
});

describe("P3 — un preview caducado (404) NO se ofrece como escribible", () => {
  it("verifyPreviewUrl rechaza con 'http-no-200' cuando el CDN contesta 404", async () => {
    // `fetch` global se sustituye: el test NO depende de la red y puede fijar
    // el 404 exactamente, en vez de rezar por que iTunes lo sirva.
    const stub = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404, headers: { "content-type": "text/html" } })
    );
    try {
      const probe = await verifyPreviewUrl(DEAD_SEED_URL);
      expect(probe.ok).toBe(false);
      if (probe.ok) throw new Error("una URL con 404 no puede pasar la verificación");
      expect(probe.reason).toBe("http-no-200");
      expect(probe.detail).toContain("404");
    } finally {
      stub.mockRestore();
    }
  });

  it("verifyPreviewUrl acepta el 200 con content-type de audio y ACAO", async () => {
    const stub = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          "content-type": "audio/x-m4p",
          "access-control-allow-origin": "*",
        },
      })
    );
    try {
      const probe = await verifyPreviewUrl(ALIVE_SEED_URL);
      expect(probe.ok).toBe(true);
      if (!probe.ok) throw new Error("el 200 con audio y ACAO tiene que pasar");
      expect(probe.httpStatus).toBe(200);
      expect(probe.contentType).toBe("audio/x-m4p");
      expect(probe.accessControlAllowOrigin).toBe("*");
    } finally {
      stub.mockRestore();
    }
  });

  it("verifyPreviewUrl rechaza un 200 SIN Access-Control-Allow-Origin", async () => {
    // El reproductor es un `<audio crossorigin="anonymous">`: sin ACAO el
    // navegador rechaza `play()` aunque el 200 sea correcto.
    const stub = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200, headers: { "content-type": "audio/x-m4p" } })
    );
    try {
      const probe = await verifyPreviewUrl(ALIVE_SEED_URL);
      expect(probe.ok).toBe(false);
      if (probe.ok) throw new Error("sin ACAO el navegador no reproduce");
      expect(probe.reason).toBe("sin-acao");
    } finally {
      stub.mockRestore();
    }
  });

  it("verifyPreviewUrl rechaza un 200 que en realidad es una página HTML", async () => {
    const stub = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "access-control-allow-origin": "*" },
      })
    );
    try {
      const probe = await verifyPreviewUrl(ALIVE_SEED_URL);
      expect(probe.ok).toBe(false);
      if (probe.ok) throw new Error("un HTML no es un preview");
      expect(probe.reason).toBe("content-type-no-audio");
    } finally {
      stub.mockRestore();
    }
  });

  it("resolveAudioPreview devuelve chosen=null y no hay actualización que escribir", async () => {
    const wanted: WantedTrack = {
      id: "trk-006",
      title: "Running Up That Hill",
      artistName: "Kate Bush",
      releaseDate: "1985-08-05",
    };
    const calls: string[] = [];
    const resolution = await resolveAudioPreview(
      wanted,
      [candidate()],
      fixedVerifier({ ok: false, reason: "http-no-200", detail: "HTTP 404" }, calls)
    );

    expect(calls).toEqual([ALIVE_SEED_URL]);
    expect(resolution.chosen).toBeNull();
    expect(resolution.verified).toBeNull();
    expect(resolution.reason).toContain("no pasaron la prueba HTTP");
    expect(resolution.httpRejected[0]?.reason).toBe("http-no-200");

    // ESTA es la aserción que hace trabajo, y la que falla al revertir el
    // arreglo: la fila que se escribiría. Con el bug original (ofrecer el primer
    // candidato sin comprobarlo) aquí se escribiría la URL caducada.
    expect(buildAudioUpdate(resolution)).toBeNull();
    expect(selectPendingUpdates([resolution])).toEqual([]);
  });

  it("si el primer candidato está caducado, cae al segundo que sí vive", async () => {
    // La pregunta no es "¿el primero de la lista funcionaba?", sino "¿hay audio
    // que reproduzca?".
    const wanted: WantedTrack = {
      id: "trk-006",
      title: "Running Up That Hill",
      artistName: "Kate Bush",
      releaseDate: "1985-08-05",
    };
    const alive = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/aa/bb/cc/dd.m4a";
    const resolution = await resolveAudioPreview(
      wanted,
      [
        candidate({ trackId: 111, previewUrl: DEAD_SEED_URL }),
        candidate({ trackId: 222, previewUrl: alive }),
      ],
      async (url) => (url === DEAD_SEED_URL
        ? { ok: false, reason: "http-no-200", detail: "HTTP 404" }
        : okProbe(url))
    );

    expect(resolution.chosen?.trackId).toBe(222);
    expect(resolution.verified?.url).toBe(alive);
    expect(resolution.httpRejected[0]?.reason).toBe("http-no-200");
    expect(buildAudioUpdate(resolution)?.audio_preview_url).toBe(alive);
  });

  it("no reescribe una fila que ya tiene exactamente esa URL y ese id", async () => {
    const wanted: WantedTrack = {
      id: "trk-006",
      title: "Running Up That Hill",
      artistName: "Kate Bush",
      releaseDate: "1985-08-05",
      currentPreviewUrl: ALIVE_SEED_URL,
      currentITunesTrackId: "1440831175",
    };
    const resolution = await resolveAudioPreview(
      wanted,
      [candidate()],
      async (url) => okProbe(url)
    );
    expect(buildAudioUpdate(resolution)).not.toBeNull();
    expect(selectPendingUpdates([resolution])).toEqual([]);
  });
});

describe("P3 — mapeo de itunes_track_id", () => {
  it("es el trackId del resultado de iTunes, y como texto", async () => {
    const wanted: WantedTrack = {
      id: "trk-006",
      title: "Running Up That Hill",
      artistName: "Kate Bush",
      releaseDate: "1985-08-05",
    };
    const resolution = await resolveAudioPreview(
      wanted,
      [candidate({ trackId: 1440831175 })],
      async (url) => okProbe(url)
    );

    const update = buildAudioUpdate(resolution);
    expect(update).not.toBeNull();
    expect(update?.itunes_track_id).toBe("1440831175");
    expect(typeof update?.itunes_track_id).toBe("string");
    // `itunes_track_id` es TEXT en el esquema (`lib/db.ts:196`): si se
    // guardara número, `parseTrack` devolvería number donde el código espera
    // string y el export JSON mezclaría tipos.
    expect(update?.itunes_track_id).toBe(toITunesTrackId(resolution.chosen!));
    expect(Number(update?.itunes_track_id)).toBe(1440831175);
  });

  it("cada pista se lleva SU id, no el de otra ni el del release padre", async () => {
    const make = (id: string, title: string, trackId: number, itunesId: string) => {
      const wanted: WantedTrack = { id, title, artistName: "Pink Floyd", releaseDate: "1973-03-01" };
      return resolveAudioPreview(
        wanted,
        [
          candidate({
            trackId,
            artistName: "Pink Floyd",
            trackName: title,
            collectionName: "The Dark Side of the Moon",
          }),
        ],
        async (url) => okProbe(url)
      ).then((r) => ({ url: itunesId, update: buildAudioUpdate(r) }));
    };

    const eclipse = await make("trk-09f2889b", "Eclipse", 1100324296, "1100324296");
    const money = await make("trk-350f3460", "Money", 1100324324, "1100324324");

    expect(eclipse.update?.itunes_track_id).toBe("1100324296");
    expect(money.update?.itunes_track_id).toBe("1100324324");
    expect(eclipse.update?.id).toBe("trk-09f2889b");
    expect(money.update?.id).toBe("trk-350f3460");
  });

  it("el id se escribe aunque el preview se actualice (no se queda el viejo pegado)", async () => {
    const wanted: WantedTrack = {
      id: "trk-006",
      title: "Running Up That Hill",
      artistName: "Kate Bush",
      releaseDate: "1985-08-05",
      currentPreviewUrl: DEAD_SEED_URL,
      currentITunesTrackId: null,
    };
    const resolution = await resolveAudioPreview(
      wanted,
      [candidate()],
      async (url) => okProbe(url)
    );
    const pending = selectPendingUpdates([resolution]);
    expect(pending).toHaveLength(1);
    expect(pending[0].audio_preview_url).toBe(ALIVE_SEED_URL);
    expect(pending[0].itunes_track_id).toBe("1440831175");
  });
});

describe("P3 — la desambiguación rechaza lo que solo coincide parcialmente", () => {
  it("matchAudioTitle distingue exacto / parcial / distinto", () => {
    expect(matchAudioTitle("Stonemilker", "Stonemilker")).toBe("exacto");
    expect(matchAudioTitle("Stonemilker (Strings)", "Stonemilker")).toBe("parcial");
    expect(matchAudioTitle("Stonemilker", "Stonemilker (Strings)")).toBe("parcial");
    expect(matchAudioTitle("Notget", "Black Lake")).toBe("distinto");
    // La tilde no puede decidir el resultado: sin diacríticos, "Björk" y "Bjork"
    // son el mismo artista, y eso es lo que tiene que pasar.
    expect(matchAudioTitle("Isobel", "Isobel")).toBe("exacto");
    expect(audioArtistMatches("Björk", "Bjork")).toBe(true);
    expect(audioArtistMatches("Björk & Trilogy", "Björk")).toBe(false);
    expect(normalizeAudioText("Tour de France")).toBe("tour de france");
  });

  it("Björk: una pista '(Strings)' NO se resuelve con el preview de la versión de estudio", async () => {
    // Las 5 hijas de *Vulnicura Strings* se llaman "X (Strings)", pero el álbum
    // de cuerdas de iTunes titula sus pistas "X" a secas. Con un `includes()`
    // se escribiría el preview de la grabación de 1996: mismo título, otra
    // canción.
    const wanted: WantedTrack = {
      id: "trk-5b53f1b7",
      title: "Stonemilker (Strings)",
      artistName: "Björk",
      releaseDate: "2016-11-04",
      expectedCollection: "Vulnicura Strings",
    };
    const resolution = await resolveAudioPreview(
      wanted,
      [
        candidate({
          trackId: 1037463014,
          artistName: "Björk",
          trackName: "Stonemilker",
          collectionName: "Vulnicura Strings",
        }),
      ],
      async (url) => okProbe(url)
    );

    expect(resolution.chosen).toBeNull();
    expect(resolution.rejected[0]?.reason).toBe("titulo-parcial");
    expect(buildAudioUpdate(resolution)).toBeNull();
  });

  it("un resultado de OTRO artista se rechaza aunque el título sea idéntico", async () => {
    // Kraftwerk *The Model* y *Computer Love* son lados A/B del mismo single, y
    // hay tribute covers y remixes con exactamente el mismo título.
    const wanted: WantedTrack = {
      id: "trk-d19f4469",
      title: "The Model",
      artistName: "Kraftwerk",
      releaseDate: "1981-12-04",
    };
    const resolution = await resolveAudioPreview(
      wanted,
      [
        candidate({
          trackId: 999,
          artistName: "Kraftwerk Live",
          trackName: "The Model",
          collectionName: "Minimum-Maximum",
        }),
      ],
      async (url) => okProbe(url)
    );
    expect(resolution.chosen).toBeNull();
    expect(resolution.rejected[0]?.reason).toBe("artista-distinto");
    expect(buildAudioUpdate(resolution)).toBeNull();
  });

  it("el ancla de colección manda cuando la portada salió de iTunes", async () => {
    // "Lionsong" está en *Homogenic*, en *Vespertine* y en el álbum de cuerdas:
    // los tres son "Björk — Lionsong" y los tres pasan el filtro de título.
    const lionsong = candidate({
      trackId: 1440857781,
      artistName: "Björk",
      trackName: "Lionsong",
      collectionName: "Homogenic",
    });

    const wrongCollection = await resolveAudioPreview(
      {
        id: "trk-b32dd6a9",
        title: "Lionsong",
        artistName: "Björk",
        releaseDate: "2016-11-04",
        expectedCollection: "Vulnicura Strings",
      },
      [lionsong],
      async (url) => okProbe(url)
    );
    expect(wrongCollection.chosen).toBeNull();
    expect(wrongCollection.rejected[0]?.reason).toBe("coleccion-distinta");

    const rightCollection = await resolveAudioPreview(
      {
        id: "otra",
        title: "Lionsong",
        artistName: "Björk",
        releaseDate: "1997-09-22",
        expectedCollection: "Homogenic",
      },
      [lionsong],
      async (url) => okProbe(url)
    );
    expect(rightCollection.chosen?.trackId).toBe(1440857781);
  });

  it("sin ancla (portada que no viene de iTunes) no se exige colección, y el título exacto manda", async () => {
    const model = candidate({
      trackId: 1100324231,
      artistName: "Kraftwerk",
      trackName: "The Model",
      collectionName: "The Man-Machine",
    });
    const resolution = await resolveAudioPreview(
      {
        id: "trk-d19f4469",
        title: "The Model",
        artistName: "Kraftwerk",
        releaseDate: "1981-12-04",
        expectedCollection: null,
      },
      [model],
      async (url) => okProbe(url)
    );
    expect(resolution.chosen?.trackId).toBe(1100324231);
  });

  it("hasITunesArtwork distingue una portada de iTunes de una de Unsplash o YouTube", () => {
    expect(
      hasITunesArtwork(
        "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/3e/76/b0/886445635829.jpg/600x600bb.jpg"
      )
    ).toBe(true);
    expect(hasITunesArtwork("https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=600&q=80")).toBe(false);
    expect(hasITunesArtwork("https://img.youtube.com/vi/M7Z_1wzbxG8/maxresdefault.jpg")).toBe(false);
    expect(hasITunesArtwork(null)).toBe(false);
    expect(hasITunesArtwork("")).toBe(false);
  });

  it("collectionMatches acepta los adornos de una reedición y no otro disco", () => {
    expect(collectionMatches("Kid A (Deluxe Edition)", "Kid A")).toBe(true);
    expect(collectionMatches("The Wall (Remastered)", "The Wall")).toBe(true);
    expect(collectionMatches("Heroes / Helden / Héros - EP", "Heroes")).toBe(true);
    expect(collectionMatches("Homogenic", "Vulnicura Strings")).toBe(false);
    // Prefijo sin separador: "Kid A" no ancla con "Kid After Kid".
    expect(collectionMatches("Kid After Kid", "Kid A")).toBe(false);
    expect(collectionMatches(undefined, "The Wall")).toBe(false);
    expect(collectionMatches(null, null)).toBe(true);
  });

  it("a igualdad de título y artista, el año del seed gana al de la reedición", () => {
    // *Tour de France* tiene un álbum de 2003 con el mismo nombre 20 años
    // después. Con el título exacto y sin ancla, el desempate es el año del
    // seed, no el más reciente.
    const wanted: WantedTrack = {
      id: "rel-2f1cd59c",
      title: "Tour de France",
      artistName: "Kraftwerk",
      releaseDate: "1983-06-01",
    };
    const original = candidate({
      trackId: 1,
      artistName: "Kraftwerk",
      trackName: "Tour de France",
      collectionName: "Tour de France",
      releaseDate: "1983-06-01T07:00:00Z",
    });
    const reissue = candidate({
      trackId: 2,
      artistName: "Kraftwerk",
      trackName: "Tour de France",
      collectionName: "Tour de France",
      releaseDate: "2003-05-19T07:00:00Z",
    });
    expect(rankAudioCandidate(original, wanted)).toBeGreaterThan(rankAudioCandidate(reissue, wanted));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// S0/P12b — `app/api/dashboard` devolvía `showsByArtist` sin filtrar, y a
// anónimos. Es la fuga que `app/api/shows` ya cerró, por otra puerta.
//
// `getAllShows()` NO se puede tocar: `scripts/qa-cleanup.ts` la usa para limpiar
// los shows QA de producción, incluidos los no aprobados. El filtro va en el
// punto de exposición, y por eso el lector filtrado vive en `lib/db.ts`.
// ═══════════════════════════════════════════════════════════════════════════

vi.mock("@/lib/approval-notifications", () => ({
  notifyApprovalDecision: vi.fn(async () => ({ notificationCreated: true, emailSent: false })),
}));
vi.mock("@/lib/subscriber-notifications", () => ({
  notifyArtistSubscribers: vi.fn(async () => ({ notified: 0, emailsSent: false, skipped: 0, failures: [] })),
  notifyArtistOwner: vi.fn(async () => ({ notified: 0, emailsSent: false })),
}));

import { GET as dashboardGET } from "@/app/api/dashboard/route";
import { createSessionToken } from "@/lib/auth";
import { createArtist, createShow, createUser, deleteArtist, deleteUser, isTursoConfigured } from "@/lib/db";

const BASE = "http://localhost:3000";
const SWEEP = `${Date.now()}`;
const OWNER_USER_ID = `preview-sweep-owner-${SWEEP}`;
const ARTIST_NAME = `Artista Preview Sweep ${SWEEP}`;

let ownerToken = "";
let sweepArtistId = "";
let pendingShowId = "";
let approvedShowId = "";

function jsonRequest(url: string, options: { token?: string; ip?: string } = {}): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.cookie = `auth_session=${options.token}`;
  if (options.ip) headers["x-forwarded-for"] = options.ip;
  return new NextRequest(url, { method: "GET", headers });
}

beforeAll(async () => {
  if (isTursoConfigured()) return;
  ownerToken = await createSessionToken({
    userId: OWNER_USER_ID,
    email: `preview-sweep-${SWEEP}@example.com`,
    role: "artist",
  });
  await createUser({
    id: OWNER_USER_ID,
    name: ARTIST_NAME,
    email: `preview-sweep-${SWEEP}@example.com`,
    password_hash: "x",
    role: "artist",
    preferences: {
      email_notifications: true,
      push_notifications: true,
      new_release_alerts: true,
      show_alerts: true,
      marketing_emails: false,
    },
    avatar: null,
    email_verified: false,
    deleted_at: null,
    last_login: null,
  });
  const artist = await createArtist({ name: ARTIST_NAME, userId: OWNER_USER_ID });
  sweepArtistId = artist.id;

  // Sin aprobar: es lo que `POST /api/shows` crea para cualquier artista.
  const pending = await createShow({
    artist_id: sweepArtistId,
    venue_name: `Sala Pendiente ${SWEEP}`,
    date: "2027-03-01",
    status: "proximamente",
  });
  pendingShowId = pending.id;

  const approved = await createShow({
    artist_id: sweepArtistId,
    venue_name: `Sala Aprobada ${SWEEP}`,
    date: "2027-04-01",
    status: "proximamente",
    approved: true,
  });
  approvedShowId = approved.id;
});

afterAll(async () => {
  if (isTursoConfigured()) return;
  // `deleteUser` NO borra la fila de `artists` (solo dependencias por
  // `artist_name`), así que sin este `deleteArtist` explícito cada ejecución
  // dejaba un artista y dos shows en el SQLite de desarrollo. El linter lo
  // marcaba como variable sin usar si no se borrara, y `security-sweep.test.ts`
  // ya borra sus artistas a mano por el mismo motivo.
  await deleteArtist(sweepArtistId);
  await deleteUser(OWNER_USER_ID);
});

describe("S0/P12b residual — /api/dashboard no expone shows sin aprobar", () => {
  it("un anónimo NO recibe el show sin aprobar en showsByArtist", async () => {
    if (isTursoConfigured()) return;
    const res = await dashboardGET(jsonRequest(`${BASE}/api/dashboard`, { ip: "10.20.0.1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids: string[] = (json.showsByArtist[sweepArtistId] ?? []).map((s: { id: string }) => s.id);
    expect(ids).not.toContain(pendingShowId);
    expect(ids).toContain(approvedShowId);
    expect(ids.every((id: string) => id !== pendingShowId)).toBe(true);
  });

  it("el mismo show sin aprobar tampoco aparece por ninguna otra vía de la respuesta", async () => {
    if (isTursoConfigured()) return;
    const res = await dashboardGET(jsonRequest(`${BASE}/api/dashboard`, { ip: "10.20.0.2" }));
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain(pendingShowId);
    expect(JSON.stringify(json)).toContain(approvedShowId);
  });

  it("el dueño autenticado SÍ ve el suyo sin aprobar, y lo ve en su propio carrusel", async () => {
    if (isTursoConfigured()) return;
    const res = await dashboardGET(
      jsonRequest(`${BASE}/api/dashboard`, { token: ownerToken, ip: "10.20.0.3" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    const artistShowIds: string[] = (json.artistShows ?? []).map((s: { id: string }) => s.id);
    expect(artistShowIds).toContain(pendingShowId);
    expect(artistShowIds).toContain(approvedShowId);

        const carouselIds: string[] = (json.showsByArtist[sweepArtistId] ?? []).map((s: { id: string }) => s.id);
    expect(carouselIds).toContain(pendingShowId);
  });

  it("un artist que no es el dueño NO lee el show ajeno sin aprobar", async () => {
    if (isTursoConfigured()) return;
    const stranger = await createSessionToken({
      userId: `preview-sweep-stranger-${SWEEP}`,
      email: `preview-sweep-stranger-${SWEEP}@example.com`,
      role: "artist",
    });
    const res = await dashboardGET(
      jsonRequest(`${BASE}/api/dashboard`, { token: stranger, ip: "10.20.0.4" })
    );
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain(pendingShowId);
  });

  it("el admin conserva el alcance completo para poder aprobar", async () => {
    if (isTursoConfigured()) return;
    const adminToken = await createSessionToken({
      userId: `preview-sweep-admin-${SWEEP}`,
      email: `preview-sweep-admin-${SWEEP}@example.com`,
      role: "admin",
    });
    const res = await dashboardGET(
      jsonRequest(`${BASE}/api/dashboard`, { token: adminToken, ip: "10.20.0.5" })
    );
    const json = await res.json();
    expect(JSON.stringify(json)).toContain(pendingShowId);
    expect(JSON.stringify(json)).toContain(approvedShowId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P15 — `app/releases/[id]` era el ÚNICO de los tres sitios de render que
// seguía imprimiendo `⏱️ {release.duration}` al lado de `🎵 N pistas`.
// `app/track/[id]` y `components/ReleaseTracklistSection.tsx` ya suman las
// hijas con `sumDurations`.
//
// No hay DOM en este entorno (`environment: "node"`), así que la aserción es
// de fuente, igual que la de `tests/unit/downloads-b2.test.ts`.
//
// `sumDurations` en sí ya está cubierto por `tests/unit/duration-parsing.test.ts`,
// que es de otro agente: aquí lo que se fija es que ESTA página lo use.
// ═══════════════════════════════════════════════════════════════════════════

const releasePageSource = readFileSync(
  path.join(process.cwd(), "app", "releases", "[id]", "page.tsx"),
  "utf8"
);

describe("P15 — /releases/[id] muestra la duración sumada de las hijas", () => {
  it("importa sumDurations de lib/null-safe", () => {
    expect(releasePageSource).toMatch(/import\s*\{[^}]*\bsumDurations\b[^}]*\}\s*from\s*"@\/lib\/null-safe"/);
  });

  it("calcula la duración total con las hijas del release", () => {
    expect(releasePageSource).toContain("sumDurations(childTracks.map((t) => t.duration))");
  });

  it("la etiqueta sale de la SUMA de las hijas, no del valor crudo del padre", () => {
    // Estas dos son las que se rompen al revertir. Sin ellas, el fichero
    // compila igual de bien con `release.duration` en medio y el test pasa: un
    // check que no puede fallar no protege de nada.
    expect(releasePageSource).toMatch(
      /const\s+durationLabel\s*=\s*\(isMultiTrack\s*\?\s*totalDuration\?\.label/
    );
    expect(releasePageSource).not.toMatch(/const\s+durationLabel\s*=\s*release\.duration/);
  });

  it("NO imprime la duración cruda del padre, y sí la etiqueta sumada", () => {
    // La aserción mira el JSX, no el fichero entero: un comentario que nombre el
    // arreglo no puede hacer fallar (ni pasar) el test.
    //
    // Y ya no exige el emoji ⏱️, ni que `durationLabel` aparezca entre llaves. Ese
    // check ataba el test a dos decisiones de diseño que han cambiado por buenas
    // razones: la etiqueta estaba en su propia línea con el emoji, y luego la
    // duración pasó a la barra de hechos de la carta, que la compone como dato y
    // la pinta con `{fact.value}`. Lo que este bloque protege es otra cosa, y
    // sigue siendo verdad: **lo que se pinta es `durationLabel` y nunca
    // `release.duration`**. Lo behavioural lo comprueba `release-page.test.ts`
    // ("un álbum enseña la suma en la cabecera y en la lista").
    expect(releasePageSource).not.toMatch(/\{\s*release\.duration\s*\}/);
    // La duración tiene que entrar en la barra de hechos desde `durationLabel`: es
    // el único camino que lleva al `<dd>` de "Duración".
    expect(releasePageSource).toMatch(/label:\s*"Duración",\s*value:\s*durationLabel/);
  });

  it("no reintroduce un parser de duración propio en la página", () => {
    // El `formatDuration` local (segundos→string, sin llamar) ya no está: la
    // knowledge de formato vive en `lib/null-safe.ts`. Si vuelve a aparecer un
    // `split(":")` aquí, es knowledge duplicada otra vez.
    expect(releasePageSource).not.toMatch(/split\(\s*":"\s*\)/);
    expect(releasePageSource).not.toMatch(/function\s+formatDuration/);
  });
});
