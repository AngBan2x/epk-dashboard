import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * RC.31 — `GET /api/artist-catalog`: el catálogo COMPLETO del artista, con sesión.
 *
 * Se mockea `@/lib/db` por la misma razón que en `pdf-export-bundle.test.ts` y
 * por una propia: las aserciones no pueden depender de lo que haya en el
 * catálogo, y este repo tiene 83 tracks en Turso y otra cosa distinta en la
 * réplica SQLite. El patrón es el de `security-sweep.test.ts`: se invoca el route
 * handler directamente con un `NextRequest` y la cookie `auth_session` que
 * genera `createSessionToken`, sin levantar un servidor.
 *
 * Lo que se verifica aquí es lo que NO se puede ver en la página pública:
 * - sin sesión, 401;
 * - la propiedad se resuelve por sesión, no por un `?user_id=` de query;
 * - entran borradores y pendientes, que `POST /api/export` deja fuera a propósito;
 * - se agrupa por release y se distingue el padre de las hijas;
 * - la duración del padre sale de sumar las hijas, no de su columna `"00:00"`.
 */

const OWNER_USER_ID = "owner-c31";
const STRANGER_USER_ID = "stranger-c31";
const OWNER_ARTIST_ID = "art-owner-c31";
const OWNER_ARTIST_NAME = "Dueño C31";

vi.mock("@/lib/auth", () => ({
  validateRequest: vi.fn(async (req: NextRequest) => {
    const cookie = req.cookies.get("auth_session");
    if (!cookie) return null;
    if (cookie.value === OWNER_USER_ID) return { userId: OWNER_USER_ID, role: "artist" };
    if (cookie.value === STRANGER_USER_ID) return { userId: STRANGER_USER_ID, role: "artist" };
    return null;
  }),
}));

/**
 * Álbum aprobado con `duration = "00:00"` y dos hijas (`3:45` + `6:07` = `9:52`),
 * un single pendiente, y un artista ajeno. Reproduce el caso verificado contra
 * Turso: los 9 padres del catálogo semilla traen `"00:00"` literal.
 */
const OWN_ALBUM: Record<string, unknown> = {
  id: "c31-album",
  title: "Álbum del dueño",
  artist_name: OWNER_ARTIST_NAME,
  release_type: "album",
  release_date: "2026-02-02",
  duration: "00:00",
  status: "approved",
  cover_image: "https://example.test/cover.jpg",
  release_id: null,
  disc_number: 1,
  metrics: { streams: 100, saves: 1, playlist_additions: 0, top_countries: [] },
};

const OWN_CHILD_1: Record<string, unknown> = {
  id: "c31-album-1",
  title: "Primera",
  artist_name: OWNER_ARTIST_NAME,
  release_type: "album",
  release_date: "2026-02-02",
  duration: "3:45",
  status: "approved",
  release_id: "c31-album",
  disc_number: 1,
  track_number: 1,
  audio_preview_url: "https://example.test/a1.mp3",
  metrics: { streams: 60, saves: 1, playlist_additions: 0, top_countries: [] },
};

const OWN_CHILD_2: Record<string, unknown> = {
  id: "c31-album-2",
  title: "Segunda",
  artist_name: OWNER_ARTIST_NAME,
  release_type: "album",
  release_date: "2026-02-02",
  duration: "6:07",
  status: "draft",
  release_id: "c31-album",
  disc_number: 1,
  track_number: 2,
  audio_preview_url: null,
  metrics: { streams: 40, saves: 0, playlist_additions: 0, top_countries: [] },
};

const OWN_PENDING_SINGLE: Record<string, unknown> = {
  id: "c31-single",
  title: "Single pendiente",
  artist_name: OWNER_ARTIST_NAME,
  release_type: "single",
  release_date: "2026-05-05",
  duration: "4:00",
  status: "pending",
  release_id: null,
  disc_number: 1,
  track_number: null,
  metrics: { streams: 0, saves: 0, playlist_additions: 0, top_countries: [] },
};

const OTHER_TRACK: Record<string, unknown> = {
  id: "c31-other",
  title: "Pista de otro",
  artist_name: "Artista Ajeno C31",
  release_type: "single",
  release_date: "2026-02-02",
  duration: "2:00",
  status: "approved",
  release_id: null,
  disc_number: 1,
  metrics: { streams: 999, saves: 0, playlist_additions: 0, top_countries: [] },
};

const tracks = [OWN_ALBUM, OWN_CHILD_2, OWN_CHILD_1, OWN_PENDING_SINGLE, OTHER_TRACK];

vi.mock("@/lib/db", () => ({
  getAllTracks: vi.fn(async () => tracks),
  getArtistByUserId: vi.fn(async (userId: string) =>
    userId === OWNER_USER_ID
      ? {
          id: OWNER_ARTIST_ID,
          name: OWNER_ARTIST_NAME,
          user_id: OWNER_USER_ID,
          genre: "Art Pop",
          location: "Valencia, Venezuela",
        }
      : null
  ),
  isArtistOwnerOfTrackName: vi.fn(async (artistName: string, userId: string) =>
    artistName === OWNER_ARTIST_NAME && userId === OWNER_USER_ID
  ),
}));

import { GET } from "@/app/api/artist-catalog/route";

interface ChildJson {
  id: string;
  title: string;
  disc_number: number | null;
  track_number: number | null;
  duration: string;
  status: string;
}

interface ReleaseJson {
  id: string;
  title: string;
  duration: string;
  duration_source: string;
  status: string;
  track_count: number;
  streams: number;
  tracks: ChildJson[];
}

interface Body {
  artist: { id: string; name: string } | null;
  summary: { releases: number; tracks: number; children: number; by_status: Record<string, number> };
  releases: ReleaseJson[];
}

function request(url = "/api/artist-catalog", token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `auth_session=${token}`;
  return new NextRequest(`http://localhost:3000${url}`, { method: "GET", headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RC.31 — GET /api/artist-catalog exige sesión", () => {
  it("sin sesión responde 401 y no devuelve catálogo", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("No autenticado");
  });

  it("una sesión válida que no tiene perfil de artista responde 404", async () => {
    const res = await GET(request("/api/artist-catalog", STRANGER_USER_ID));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("perfil de artista");
  });
});

describe("RC.31 — la propiedad sale de la sesión, no de la query", () => {
  it("ignora un ?user_id= ajeno y sigue devolviendo el catálogo del dueño", async () => {
    const own = await GET(request("/api/artist-catalog", OWNER_USER_ID));
    const spoofed = await GET(
      request(`/api/artist-catalog?user_id=${STRANGER_USER_ID}`, OWNER_USER_ID)
    );

    expect(own.status).toBe(200);
    expect(spoofed.status).toBe(200);

    const a = (await own.json()) as Body;
    const b = (await spoofed.json()) as Body;
    expect(b.artist?.name).toBe(OWNER_ARTIST_NAME);
    expect(b.releases.map((r) => r.id)).toEqual(a.releases.map((r) => r.id));
    // Y el catálogo ajeno nunca aparece, venga el query que venga.
    expect(JSON.stringify(b)).not.toContain("Artista Ajeno C31");
    expect(JSON.stringify(b)).not.toContain("c31-other");
  });

  it("consume el helper de propiedad de lib/db.ts en vez de reescribirlo", async () => {
    const { isArtistOwnerOfTrackName } = await import("@/lib/db");
    await GET(request("/api/artist-catalog", OWNER_USER_ID));
    expect(isArtistOwnerOfTrackName).toHaveBeenCalledWith(OWNER_ARTIST_NAME, OWNER_USER_ID);
  });
});

describe("RC.31 — agrupa por release y entra en todos los estados", () => {
  it("devuelve los releases del artista, con el padre separado de las hijas", async () => {
    const res = await GET(request("/api/artist-catalog", OWNER_USER_ID));
    const json = (await res.json()) as Body;

    expect(json.artist).toEqual({ id: OWNER_ARTIST_ID, name: OWNER_ARTIST_NAME });
    expect(json.releases.map((r) => r.id)).toEqual(["c31-single", "c31-album"]);

    const album = json.releases.find((r) => r.id === "c31-album")!;
    expect(album.track_count).toBe(2);
    // Las hijas van ordenadas por disco y número, no por orden de inserción.
    expect(album.tracks.map((t) => t.id)).toEqual(["c31-album-1", "c31-album-2"]);
    expect(album.tracks[1].disc_number).toBe(1);
    expect(album.tracks[1].track_number).toBe(2);

    // El single suelto no tiene hijas: `tracks` vacío, no un grupo con la hija
    // colada dentro.
    const single = json.releases.find((r) => r.id === "c31-single")!;
    expect(single.tracks).toEqual([]);
  });

  it("incluye borradores y pendientes, que el export público deja fuera a propósito", async () => {
    const res = await GET(request("/api/artist-catalog", OWNER_USER_ID));
    const json = (await res.json()) as Body;

    const album = json.releases.find((r) => r.id === "c31-album")!;
    expect(album.status).toBe("approved");
    expect(album.tracks.map((t) => t.status).sort()).toEqual(["approved", "draft"]);
    expect(json.releases.find((r) => r.id === "c31-single")!.status).toBe("pending");

    expect(json.summary.releases).toBe(2);
    expect(json.summary.children).toBe(2);
    expect(json.summary.tracks).toBe(4);
    expect(json.summary.by_status).toEqual({ pending: 1, approved: 2, draft: 1 });
  });

  it("no incluye pistas de otros artistas ni crea grupos huérfanos", async () => {
    const res = await GET(request("/api/artist-catalog", OWNER_USER_ID));
    const json = (await res.json()) as Body;

    expect(JSON.stringify(json)).not.toContain("c31-other");
    // Solo aparecen las dos filas del dueño (padre + single) y sus dos hijas:
    // ninguna hija suelta se convierte en release por no encontrar su padre.
    const ids = json.releases.flatMap((r) => [r.id, ...r.tracks.map((t) => t.id)]);
    expect(ids.sort()).toEqual(["c31-album", "c31-album-1", "c31-album-2", "c31-single"]);
  });
});

describe("RC.31 — P15: la duración del padre sale de sus hijas", () => {
  it("sustituye el \"00:00\" del padre por la suma real, en M:SS", async () => {
    const res = await GET(request("/api/artist-catalog", OWNER_USER_ID));
    const json = (await res.json()) as Body;

    const album = json.releases.find((r) => r.id === "c31-album")!;
    // 3:45 (225 s) + 6:07 (367 s) = 592 s = "9:52". Un formato de dos segmentos
    // con cero a la izquierda ("09:52") quedaba inconsistente al lado de "3:45".
    expect(album.duration).toBe("9:52");
    expect(album.duration_source).toBe("children");
    expect(album.duration).not.toBe("00:00");
  });

  it("un release sin hijas conserva su duración declarada", async () => {
    const res = await GET(request("/api/artist-catalog", OWNER_USER_ID));
    const json = (await res.json()) as Body;

    const single = json.releases.find((r) => r.id === "c31-single")!;
    expect(single.duration).toBe("4:00");
    expect(single.duration_source).toBe("declared");
  });

  it("el padre no declara \"00:00\" aunque su columna lo siga teniendo", async () => {
    const res = await GET(request("/api/artist-catalog", OWNER_USER_ID));
    const raw = await res.text();
    // El `00:00` sigue en la fila de la BD a propósito: lo que se corrige es lo
    // que se imprime, no la columna.
    expect(raw).not.toContain('"duration":"00:00"');
  });
});
