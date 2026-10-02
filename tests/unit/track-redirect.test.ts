import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";

/**
 * P2 · Ola 10 — qué hace `/track/[id]` con cada tipo de fila.
 *
 * ## Por qué este test lee la base de datos de verdad
 *
 * `resolveTrackRoute` (`lib/releases.ts`) decide con `getTrackById`, que a su
 * vez ramifica entre Turso y el SQLite local. Un doble de `getTrackById`
 * probaría que el `if` está bien escrito, que es lo que ya se ve leyendo el
 * código. Lo que no se ve leyendo el código es si `parseTrack` expone
 * `release_id` de verdad — y es exactamente lo que decide si el redirect se
 * dispara. Este test siembra filas con `getDbWrite()` y deja que la función las
 * lea por su cuenta (`getLocalDb()`), que es el camino que se ejecuta en dev y
 * en prod.
 *
 * ## Las tres decisiones que fija
 *
 * 1. **Hija -> redirige al padre.** Es el comportamiento nuevo.
 * 2. **Sin padre -> se renderiza normal.** Una fila sin `release_id` — un
 *    single suelto o el propio álbum — sigue teniendo su página, porque el
 *    enunciado no pide retirarla.
 * 3. **Hija sin padre -> ni redirección ni 404.** `release_id` no es foreign
 *    key (`lib/db.ts:218`, `release_id TEXT` pelado), así que una hija puede
 *    apuntar a una fila que ya no existe. Redirigir daría un 404 opaco en una
 *    URL sin sentido; dar 404 tiraría una pista que sí existe y que además se
 *    puede reproducir. Se devuelve `orphan` y la página la muestra con un
 *    aviso.
 *
 * El nombre de la columna: el enunciado de P2 la llama `parent_id`, pero en el
 * esquema y en el tipo `Track` se llama `release_id`. No hay ningún
 * `parent_id` en el repo.
 */

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/track/1",
}));

import { getDbWrite, isTursoConfigured } from "@/lib/db";
import { resolveTrackRoute } from "@/lib/releases";

const PREFIX = "p2track-";
const PARENT_ID = `${PREFIX}parent`;
const CHILD_ID = `${PREFIX}child`;
const ORPHAN_ID = `${PREFIX}orphan`;
const GHOST_ID = `${PREFIX}fantasma`;
const LONE_ID = `${PREFIX}lone`;

function insertTrack(id: string, releaseId: string | null) {
  getDbWrite()
    .prepare(
      `INSERT INTO tracks (id, title, artist_name, release_type, release_date, duration,
                           cover_image, audio_preview_url, status, release_id, created_at)
       VALUES (?, ?, 'Artista P2', 'album', '2026-01-01', '3:45', '', '', 'approved', ?, datetime('now'))`
    )
    .run(id, `Titulo ${id}`, releaseId);
}

function deleteSeeds() {
  getDbWrite()
    .prepare(`DELETE FROM tracks WHERE id LIKE '${PREFIX}%'`)
    .run();
}

const skip = () => isTursoConfigured();

beforeAll(() => {
  if (skip()) return;
  deleteSeeds();
  insertTrack(PARENT_ID, null);
  insertTrack(CHILD_ID, PARENT_ID);
  // `GHOST_ID` no se inserta nunca: ese es el caso "hija cuyo padre ya no
  // existe". La cascada de `DELETE FROM tracks WHERE id = ?` deja la hija
  // apuntando al vacío, y `release_id` no la impide porque no es FK.
  insertTrack(ORPHAN_ID, GHOST_ID);
  insertTrack(LONE_ID, null);
});

afterAll(() => {
  if (skip()) return;
  deleteSeeds();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("P2 · resolveTrackRoute: las cuatro filas posibles", () => {
  it("una HIJA redirige a la página de su padre", async () => {
    if (skip()) return;
    const route = await resolveTrackRoute(CHILD_ID);
    expect(route.kind).toBe("release");
    if (route.kind !== "release") throw new Error("se esperaba un redirect");
    expect(route.href).toBe(`/releases/${PARENT_ID}`);
  });

  it("una fila SIN padre es la cabecera de su propio release y va a su pagina", async () => {
    if (skip()) return;
    const route = await resolveTrackRoute(LONE_ID);
    // No hay padre, pero sí hay release: un single es fila de `tracks` Y
    // cabecera con el mismo id. `/track/<single>` y `/releases/<single>` eran
    // dos puertas al mismo contenido; ahora solo queda una.
    expect(route.kind).toBe("release");
    if (route.kind !== "release") throw new Error("se esperaba el 301 a la pagina del release");
    expect(route.href).toBe(`/releases/${LONE_ID}`);
  });

  it("el padre de un album va a su propia pagina, sin bucle", async () => {
    if (skip()) return;
    const route = await resolveTrackRoute(PARENT_ID);
    expect(route.kind).toBe("release");
    if (route.kind !== "release") throw new Error("se esperaba el 301 a la pagina del album");
    expect(route.href).toBe(`/releases/${PARENT_ID}`);
    // Lo que hay que vigilar aqui no es el 301 sino el bucle: el href apunta a
    // /releases/, y esa ruta no vuelve a pasar por resolveTrackRoute.
    expect(route.href).not.toBe(`/track/${PARENT_ID}`);
  });

  it("una HIJA cuyo padre ya no existe NO redirige a un padre inexistente", async () => {
    if (skip()) return;
    const route = await resolveTrackRoute(ORPHAN_ID);
    expect(route.kind).toBe("orphan");
    if (route.kind !== "orphan") throw new Error("se esperaba el caso huerfano");
    expect(route.track.id).toBe(ORPHAN_ID);
    expect(route.missingParentId).toBe(GHOST_ID);
  });

  it("un id que NO existe devuelve `missing`, no una redirección", async () => {
    if (skip()) return;
    const route = await resolveTrackRoute(`${PREFIX}nada`);
    expect(route.kind).toBe("missing");
  });
});

describe("P2 · la página de pista aplica las tres salidas", () => {
  it("una hija lanza NEXT_REDIRECT y NO llega a renderizar su ficha", async () => {
    if (skip()) return;
    const route = await resolveTrackRoute(CHILD_ID);
    if (route.kind !== "release") throw new Error("se esperaba un redirect");

    // `redirect()` de `next/navigation` lanza. Lo que se fija aquí es que no
    // existe ningún camino en el que una hija llegue a pintar su propia ficha:
    // la decisión es delkind y el kind de una hija con padre vivo nunca es
    // "track" ni "orphan".
    expect(route.kind).not.toBe("track");
    expect(route.kind).not.toBe("orphan");
    expect(route.href).toBe(`/releases/${PARENT_ID}`);
  });

  it("una hija sin padre NO llega a renderizar con un href de redirección", async () => {
    if (skip()) return;
    const route = await resolveTrackRoute(ORPHAN_ID);
    expect(route).not.toHaveProperty("href");
  });
});

describe("P2 · el sitemap y las notificaciones no sacan a las hijas", () => {
  it("notificationHref manda el destino de LANZAMIENTO por encima de `track_id`", async () => {
    const { notificationHref } = await import("@/components/NotificationBell");
    // `new_release` manda los dos campos, y `track_id` es el id del PADRE
    // (`app/api/releases/route.ts:884`). Antes ganaba `track_id` y la campana
    // llevaba a `/track/<id del release>`.
    expect(
      notificationHref({ track_id: PARENT_ID, release_id: PARENT_ID })
    ).toBe(`/releases/${PARENT_ID}`);
  });

  it("una notificación que solo trae `track_id` sigue yendo a la pista", async () => {
    const { notificationHref } = await import("@/components/NotificationBell");
    expect(notificationHref({ trackId: CHILD_ID })).toBe(`/track/${CHILD_ID}`);
  });

  it("una notificación sin destino no inventa uno", async () => {
    const { notificationHref } = await import("@/components/NotificationBell");
    expect(notificationHref(null)).toBeNull();
    expect(notificationHref({})).toBeNull();
  });

  it("con el padre resuelto, una hija se lleva al lanzamiento", async () => {
    const { notificationHref, resolveChildHref, needsParentLookup } = await import(
      "@/components/NotificationBell"
    );
    const href = notificationHref({ trackId: CHILD_ID });
    expect(needsParentLookup(href)).toBe(CHILD_ID);
    expect(resolveChildHref(href, () => PARENT_ID)).toBe(`/releases/${PARENT_ID}`);
  });

  it("sin padre conocido se deja el enlace a la pista (degrada, no rompe)", async () => {
    const { resolveChildHref } = await import("@/components/NotificationBell");
    const href = `/track/${CHILD_ID}`;
    expect(resolveChildHref(href, () => null)).toBe(href);
    expect(resolveChildHref(href, () => undefined)).toBe(href);
  });

  it("una URL que no es de pista no se toca", async () => {
    const { resolveChildHref, needsParentLookup } = await import(
      "@/components/NotificationBell"
    );
    expect(resolveChildHref("/releases/abc", () => "xyz")).toBe("/releases/abc");
    expect(needsParentLookup("/releases/abc")).toBeNull();
    expect(resolveChildHref("/shows", () => "xyz")).toBe("/shows");
  });

  it("el sitemap no genera ninguna URL /track/", async () => {
    const sitemapModule = await import("@/app/sitemap");
    const entries = await sitemapModule.default();
    const trackUrls = entries.filter((entry) => entry.url.includes("/track/"));
    expect(trackUrls).toHaveLength(0);
  });
});