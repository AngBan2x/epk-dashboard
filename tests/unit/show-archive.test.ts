/**
 * D16 — el artista ve sus shows archivados, con distintivo; el público no los ve.
 *
 * Hay dos mitades y las dos se prueban aquí, cada una con el instrumento que le
 * toca:
 *
 * 1. **La decisión de la vista** (`lib/show-archive.ts`) se ejecuta, no se lee:
 *    orden, no mutación, y la etiqueta del contador con su plural.
 * 2. **El alcance de los lectores** se prueba contra la base de datos de verdad:
 *    un show aprobado sale en el lector público, se archiva con `deleted_at`, y
 *    entonces deja de salir en el público **pero sigue saliendo en el del
 *    dueño**. La primera aserción es la que impide que la segunda sea vacía: si
 *    el show nunca hubiera salido, "no sale" no probaría nada.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createArtist,
  createShow,
  deleteArtist,
  deleteShow,
  getApprovedShowsByArtist,
  getDbWrite,
  getShowsByArtist,
} from "@/lib/db";
import { isArchived, orderForOwner, selectPurgeable, showsCountLabel } from "@/lib/show-archive";

/** Lo mínimo que miran los helpers: no hace falta construir un `Show` entero. */
const fila = (id: string, deleted_at: string | null) => ({ id, deleted_at });

describe("show-archive: la decisión, ejecutada", () => {
  it("isArchived solo mira deleted_at", () => {
    expect(isArchived({ deleted_at: null })).toBe(false);
    expect(isArchived({ deleted_at: "2026-11-24T00:00:00.000Z" })).toBe(true);
  });

  it("orderForOwner deja los activos primero, y respeta la fecha dentro de cada grupo", () => {
    const entrada = [
      fila("archivado-viejo", "2026-09-01T00:00:00.000Z"),
      fila("futuro", null),
      fila("pasado-activo", null),
      fila("archivado-reciente", "2026-10-01T00:00:00.000Z"),
    ];
    expect(orderForOwner(entrada).map((s) => s.id)).toEqual([
      "futuro",
      "pasado-activo",
      "archivado-viejo",
      "archivado-reciente",
    ]);
  });

  it("no muta la entrada", () => {
    const entrada = [fila("a", "2026-09-01T00:00:00.000Z"), fila("b", null)];
    const copia = [...entrada];
    orderForOwner(entrada);
    expect(entrada).toEqual(copia);
  });

  it("el contador no cambia cuando no hay archivados, y concuerda en plural", () => {
    expect(showsCountLabel(5, 0)).toBe("5 shows");
    expect(showsCountLabel(5, 1)).toBe("5 shows · 1 archivado");
    expect(showsCountLabel(5, 2)).toBe("5 shows · 2 archivados");
  });
});

describe("P20.2: qué se puede purgar, ejecutado", () => {
  const ahora = Date.parse("2026-11-26T00:00:00.000Z");
  const dias = 90;
  const corte = ahora - dias * 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString();

  it("incluye el borde exacto de la ventana y excluye un milisegundo después", () => {
    const { candidates } = selectPurgeable(
      [fila("borde", iso(corte)), fila("un-ms-joven", iso(corte + 1))],
      { days: dias, now: ahora },
    );
    expect(candidates.map((c) => c.show.id)).toEqual(["borde"]);
  });

  it("informa los días completos archivado", () => {
    const { candidates } = selectPurgeable([fila("viejo", iso(ahora - 120 * 86_400_000))], {
      days: dias,
      now: ahora,
    });
    expect(candidates[0]?.days).toBe(120);
  });

  it("no toca los shows activos, por viejos que sean", () => {
    const { candidates } = selectPurgeable([fila("activo", null)], { days: dias, now: ahora });
    expect(candidates).toEqual([]);
  });

  it("una fecha ilegible no se purga: se aparta y se informa", () => {
    // Tratarla como "antiquísima" convertiría un dato corrupto en un borrado
    // irreversible. Es la única rama que no puede tener un default optimista.
    const { candidates, unreadable } = selectPurgeable(
      [fila("roto", "no-es-una-fecha"), fila("viejo", iso(corte))],
      { days: dias, now: ahora },
    );
    expect(candidates.map((c) => c.show.id)).toEqual(["viejo"]);
    expect(unreadable.map((s) => s.id)).toEqual(["roto"]);
  });
});

describe("D16 contra la DB: el dueño sí, el público no", () => {
  let artistId = "";
  const showIds: string[] = [];

  beforeAll(async () => {
    const artist = await createArtist({
      name: `Archivo D16 ${Date.now()}`,
      genre: "Test",
      location: "Test",
    });
    artistId = artist.id;
  });

  afterAll(async () => {
    for (const id of showIds) {
      try {
        await deleteShow(id);
      } catch {
        // limpieza best-effort
      }
    }
    try {
      await deleteArtist(artistId);
    } catch {
      // limpieza best-effort
    }
  });

  it("archivar lo saca del lector público y lo deja en el del dueño", async () => {
    const show = await createShow({
      artist_id: artistId,
      venue_name: "Sala D16",
      city: "Caracas",
      country: "VE",
      date: "2026-01-10",
      time: "20:00",
      status: "pasado",
      approved: true,
    });
    showIds.push(show.id);

    // Control: antes de archivar, el público **sí** lo ve.
    const antes = await getApprovedShowsByArtist(artistId);
    expect(antes.some((s) => s.id === show.id)).toBe(true);

    // No hay función de negocio para archivar: `updateShow` toma un
    // `Partial<CreateShowInput>` y `deleted_at` no está ahí. La marca la escribe
    // la ruta de limpieza con SQL propio, así que aquí se escribe igual.
    getDbWrite()
      .prepare("UPDATE shows SET deleted_at = ? WHERE id = ?")
      .run("2026-11-24T00:00:00.000Z", show.id);

    const despues = await getApprovedShowsByArtist(artistId);
    expect(despues.some((s) => s.id === show.id)).toBe(false);

    const delDueno = await getShowsByArtist(artistId);
    const mio = delDueno.find((s) => s.id === show.id);
    expect(mio, "el dueño tiene que seguir viendo su show archivado").toBeDefined();
    expect(mio?.deleted_at).toBe("2026-11-24T00:00:00.000Z");
  });
});
