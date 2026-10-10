import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SEED_ARTISTS,
  SEED_RELEASES,
  SEED_PARENT_SQL,
  pickSeedParent,
  seedReleaseTotalDuration,
  type SeedParentRow,
} from "@/scripts/seed-influential-catalog";
import { parseDurationToSeconds, sumDurations } from "@/lib/null-safe";
import { RELEASE_TYPE_VALUES } from "@/lib/release-type";

/**
 * Integridad del catálogo semilla de `scripts/seed-influential-catalog.ts`
 * (RC.31, P1 + P7 + P15) — agente B.
 *
 * Todo lo que hay aquí lee el catálogo del propio archivo, no la base de datos:
 * los tests no tocan Turso ni el SQLite local, y por eso el módulo tiene que
 * ser importable sin sembrar nada (el propio seed lo garantiza con el guard de
 * entrypoint). Cada aserción está escrita para que FALLE al revertir el arreglo
 * que la acompaña.
 *
 * Los tres typos y el `release_type` se comprueban sobre los MISMOS valores que
 * se escribieron en producción, para que el test no pueda quedarse viejo: si
 * alguien vuelve a escribir "Ashe to Ashes" en el origen, esto salta.
 */

const release = (artist: string, title: string) =>
  SEED_RELEASES.find((r) => r.artistName === artist && r.title === title);

describe("P7 — erratas del seed", () => {
  it("no existe ninguna pista llamada 'Ashe to Ashes'", () => {
    // El error en producción era `trk-2b0ed8eb`, la cara A del single de Bowie.
    const ashe = SEED_RELEASES.flatMap((r) =>
      r.tracks.filter((t) => t.title === "Ashe to Ashes").map((t) => `${r.artistName} — ${t.title}`)
    );
    expect(ashe).toEqual([]);
  });

  it("la cara A del single de Bowie se llama 'Ashes to Ashes'", () => {
    const sr = release("David Bowie", "Ashes to Ashes");
    expect(sr).toBeDefined();
    expect(sr!.tracks[0].title).toBe("Ashes to Ashes");
  });

  it("ningún título del seed lleva comillas literales dentro", () => {
    // El error en producción eran el padre `rel-937c314f` y su hija
    // `trk-37bd32a1`, los dos con `"Heroes"` y las comillas DENTRO del título.
    const quoted = [
      ...SEED_RELEASES.filter((r) => r.title.includes('"')).map((r) => `padre: ${r.title}`),
      ...SEED_RELEASES.flatMap((r) =>
        r.tracks.filter((t) => t.title.includes('"')).map((t) => `hija: ${t.title}`)
      ),
    ];
    expect(quoted).toEqual([]);
  });

  it('el single de Bowie se llama "Heroes", sin comillas, en el padre y en la hija', () => {
    const sr = release("David Bowie", "Heroes");
    expect(sr).toBeDefined();
    expect(sr!.tracks[0].title).toBe("Heroes");
    // La hija conserva el resto del single: lado B de "Heroes".
    expect(sr!.tracks[1].title).toBe("V-2 Schneider");
  });
});

/**
 * `release_type` de Vulnicura Strings y la normalización de la columna.
 *
 * El valor es **`ep`**, y por decisión del propietario del catálogo: el disco
 * son las versiones con cuerdas de un álbum de 12 pistas, así que `album` sería
 * más fiel. Este bloque ya no afirma lo contrario —antes decía "es Album y no
 * EP"— porque ese texto describía el disco en vez de registrar la decisión, y
 * una descripción que se contradice con el dato es una descripción que nadie
 * sabe cuál de las dos vale.
 */
describe("P7 — release_type de Vulnicura Strings", () => {
  it('es "ep", y lo es por decisión de catálogo', () => {
    const sr = release("Björk", "Vulnicura Strings");
    expect(sr).toBeDefined();
    expect(sr!.releaseType).toBe("ep");
  });

  it("el release_type se propaga a las hijas, así que Vulnicura son 6 filas", () => {
    // El seed copia `sr.releaseType` a cada hija: por eso el valor está en 6
    // filas (el padre más sus 5 hijas) y no en una. Un valor por hija
    // distinto dejaría el álbum con etiqueta de EP y cinco pistas sueltas.
    const vulnicura = release("Björk", "Vulnicura Strings")!;
    expect(vulnicura.tracks).toHaveLength(5);
    const enEp = vulnicura.tracks.filter((t) => (t as { releaseType?: string }).releaseType === "ep");
    // Las hijas no llevan `releaseType` propio: lo heredan al escribirse.
    expect(enEp).toEqual([]);
  });
});

/**
 * La columna entera en minúsculas, en el ORIGEN.
 *
 * `getTracksByReleaseType()` (`lib/db.ts`) filtra con `WHERE release_type = ?`
 * y en SQLite eso distingue mayúsculas, así que `Single` y `single` conviviendo
 * hacían que pedir `'single'` devolviera 8 de 21 singles. La normalización de
 * las filas vive en `scripts/normalize-release-type.ts`; esto ata el **origen**,
 * que es lo que impediría que una re-siembra reintrodujera la mezcla.
 */
describe("normalización de release_type en el seed", () => {
  it("ningún releaseType del seed lleva mayúsculas", () => {
    const conMayusculas = SEED_RELEASES.filter((r) => r.releaseType !== r.releaseType.toLowerCase());
    expect(conMayusculas.map((r) => `${r.artistName} — ${r.title}`)).toEqual([]);
  });

  it("todos los releaseType son valores del vocabulario canónico", () => {
    for (const r of SEED_RELEASES) {
      expect(RELEASE_TYPE_VALUES).toContain(r.releaseType);
    }
  });

  it("y el origen ya declara `ep` en minúsculas, no `EP`", () => {
    // Si alguien revierte esto a `EP`, el guard de `scripts/turso-check.ts`
    // (`lower(release_type) = 'ep'`) seguirá en verde contra las filas ya
    // normalizadas, y una re-siembra volvería a dejar la columna mezclada sin
    // que nada se entere.
    const sr = release("Björk", "Vulnicura Strings")!;
    expect(sr.releaseType).not.toBe("EP");
    expect(sr.releaseType).toBe("ep");
  });
});

describe("Aritmética de start_time / end_time", () => {
  it("cada pista dura lo que dura su start_time -> end_time", () => {
    // El bug: en The Dark Side of the Moon, `Us and Them` empezaba en 1530 y
    // acababa en 2009, cuando 1530 + 469 (7:49) = 1999. Los 10 s de desfase
    // arrastraban el start_time de las tres pistas siguientes. Y en Kid A,
    // 2577 + 421 (7:01) = 2998, no 3001.
    const bad: string[] = [];
    for (const sr of SEED_RELEASES) {
      // The Wall es de 2 discos: el segundo reinicia en 0, así que se agrupa
      // por disco antes de comprobar la continuidad.
      const byDisc = new Map<number, typeof sr.tracks>();
      for (const t of sr.tracks) {
        const list = byDisc.get(t.discNumber) ?? [];
        list.push(t);
        byDisc.set(t.discNumber, list);
      }
      for (const [disc, tracks] of byDisc) {
        const ordered = [...tracks].sort((a, b) => a.trackNumber - b.trackNumber);
        for (const t of ordered) {
          const seconds = parseDurationToSeconds(t.duration);
          if (seconds == null) {
            bad.push(`${sr.title} d${disc} "${t.title}": duración "${t.duration}" no parseable`);
            continue;
          }
          if (t.startTime + seconds !== t.endTime) {
            bad.push(
              `${sr.title} d${disc} "${t.title}": ${t.startTime} + ${seconds} (${t.duration}) = ${
                t.startTime + seconds
              }, pero end_time es ${t.endTime}`
            );
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("las pistas de un disco encadenan sin huecos ni solapamientos", () => {
    const gaps: string[] = [];
    for (const sr of SEED_RELEASES) {
      const byDisc = new Map<number, typeof sr.tracks>();
      for (const t of sr.tracks) {
        const list = byDisc.get(t.discNumber) ?? [];
        list.push(t);
        byDisc.set(t.discNumber, list);
      }
      for (const [disc, tracks] of byDisc) {
        const ordered = [...tracks].sort((a, b) => a.trackNumber - b.trackNumber);
        ordered.forEach((t, i) => {
          if (i > 0 && t.startTime !== ordered[i - 1].endTime) {
            gaps.push(
              `${sr.title} d${disc}: "${ordered[i - 1].title}" acaba en ${ordered[i - 1].endTime} y "${t.title}" empieza en ${t.startTime}`
            );
          }
        });
        if (ordered[0]?.startTime !== 0) {
          gaps.push(`${sr.title} d${disc}: la primera pista empieza en ${ordered[0]?.startTime}`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it("el final del último disco es la duración total, sin la deriva de 10 s", () => {
    const dsotm = release("Pink Floyd", "The Dark Side of the Moon")!;
    const last = [...dsotm.tracks].sort((a, b) => a.trackNumber - b.trackNumber).at(-1)!;
    // 2556 s, no los 2566 que dejó la deriva.
    expect(last.endTime).toBe(2556);
    expect(last.endTime).toBe(sumDurations(dsotm.tracks.map((t) => t.duration))?.seconds);

    const kidA = release("Radiohead", "Kid A")!;
    const lastKidA = [...kidA.tracks].sort((a, b) => a.trackNumber - b.trackNumber).at(-1)!;
    expect(lastKidA.endTime).toBe(2998);
  });
});

describe("P15 — la duración del padre es la suma de la de sus hijas", () => {
  it("seedReleaseTotalDuration devuelve la suma de las hijas en M:SS", () => {
    const sr = release("Pink Floyd", "The Dark Side of the Moon")!;
    const total = sumDurations(sr.tracks.map((t) => t.duration));
    expect(total?.seconds).toBe(2556);
    expect(seedReleaseTotalDuration(sr)).toBe("42:36");
  });

  it("los 9 padres del seed tienen duración calculada, no '00:00'", () => {
    // Los 9 padres llevaban `duration: "00:00"` hardcodeado, que se propagó a
    // los 3 formatos de export.
    const ceros = SEED_RELEASES.filter(
      (r) => seedReleaseTotalDuration(r) === "0:00" || seedReleaseTotalDuration(r) === "00:00"
    );
    expect(ceros.map((r) => `${r.artistName} — ${r.title}`)).toEqual([]);
  });

  it("ningún padre del seed se queda sin duración total", () => {
    for (const sr of SEED_RELEASES) {
      expect(seedReleaseTotalDuration(sr)).toMatch(/^\d+:\d{2}$/);
    }
  });

  it("el total de cada padre coincide con la suma de sus hijas, release por release", () => {
    // Los valores son los que se escribieron en Turso. Si alguien cambia una
    // duración hija sin recalcular el padre, esta tabla se queda vieja y salta.
    const expected: Record<string, string> = {
      "Pink Floyd|The Dark Side of the Moon": "42:36",
      "Pink Floyd|The Wall": "61:06",
      "Radiohead|OK Computer": "53:21",
      "Radiohead|Kid A": "49:58",
      "Björk|Vulnicura Strings": "27:42",
      "David Bowie|Heroes": "9:17",
      "David Bowie|Ashes to Ashes": "8:21",
      "Kraftwerk|The Model / Computer Love": "10:10",
      "Kraftwerk|Tour de France": "7:28",
    };
    const actual: Record<string, string> = {};
    for (const sr of SEED_RELEASES) {
      actual[`${sr.artistName}|${sr.title}`] = seedReleaseTotalDuration(sr);
    }
    expect(actual).toEqual(expected);
    expect(Object.keys(actual)).toHaveLength(9);
  });

  it("The Wall suma los DOS discos, porque su duración total son 61 minutos", () => {
    // El disco 2 reinicia en start_time 0, así que sumar start_time daría
    // 28:45. La duración total es la suma de las duraciones, no la del recorrido.
    const sr = release("Pink Floyd", "The Wall")!;
    const discs = new Set(sr.tracks.map((t) => t.discNumber));
    expect(discs.size).toBe(2);
    expect(seedReleaseTotalDuration(sr)).toBe("61:06");
  });

  it("las etiquetas salen en M:SS, sin relleno en los minutos, como las hijas", () => {
    // `formatDuration()` de `lib/null-safe.ts` solo rellena los segundos y
    // dejaría "06:07" al lado de una hija que dice "6:07". El padre hereda el
    // formato de `sumDurations()`, que es el de las hijas.
    const heroes = release("David Bowie", "Heroes")!;
    expect(seedReleaseTotalDuration(heroes)).toBe("9:17");
    expect(seedReleaseTotalDuration(heroes).startsWith("0")).toBe(false);
  });
});

/**
 * La colisión de `--cleanup`. Esta es la parte que podía perder datos.
 */
describe("--cleanup localiza al padre de forma determinista", () => {
  it("la consulta que trae los padres filtra release_id IS NULL", () => {
    // Sin este `WHERE`, la búsqueda se hace sobre un `SELECT *` sin ordenar y
    // puede devolver una hija. Y no es teórico: en Kid A la hija 2 se llama
    // exactamente "Kid A" y en Heroes la hija 1 se llama "Heroes".
    expect(SEED_PARENT_SQL).toMatch(/release_id IS NULL/i);
  });

  it("la consulta que trae los padres tiene un orden estable", () => {
    expect(SEED_PARENT_SQL).toMatch(/ORDER BY/i);
  });

  it("el lookup no se hace solo por (artist_name, title)", () => {
    // La forma anterior, `all.find(t => t.artist_name === x && t.title === y)`,
    // es exactamente la que hay que impedir: no distingue un padre de una hija
    // que se llama igual.
    const source = readFileSync(
      path.resolve(process.cwd(), "scripts/seed-influential-catalog.ts"),
      "utf8"
    );
    const cleanup = source.slice(
      source.indexOf("if (cleanup)"),
      source.indexOf("let stats =")
    );
    expect(cleanup).not.toMatch(/\.find\(\s*\(\s*t\s*\)\s*=>\s*t\.artist_name/);
  });

  it("devuelve el padre cuando una hija comparte su título exacto", () => {
    // Filas con la forma de producción: el padre de Kid A y sus 10 hijas, la
    // segunda de ellas llamada "Kid A". Sin el filtro por `release_id`, un
    // `find` sobre este array puede devolver la hija.
    const parent: SeedParentRow = {
      id: "rel-4e26ff30",
      artist_name: "Radiohead",
      title: "Kid A",
      release_id: null,
      created_at: null,
    };
    const rows: SeedParentRow[] = [
      parent,
      { id: "trk-6dc263b9", artist_name: "Radiohead", title: "Kid A", release_id: "rel-4e26ff30" },
    ];

    const found = pickSeedParent(rows, "Radiohead", "Kid A");
    expect(found?.id).toBe("rel-4e26ff30");
    expect(found?.release_id).toBeNull();
  });

  it("devuelve el padre de Heroes aunque su hija se llame 'Heroes'", () => {
    const parent: SeedParentRow = {
      id: "rel-937c314f",
      artist_name: "David Bowie",
      title: "Heroes",
      release_id: null,
    };
    const rows: SeedParentRow[] = [
      { id: "trk-37bd32a1", artist_name: "David Bowie", title: "Heroes", release_id: "rel-937c314f" },
      parent,
    ];
    expect(pickSeedParent(rows, "David Bowie", "Heroes")?.id).toBe("rel-937c314f");
  });

  it("devuelve null si solo hay hijas, en vez de elegir una y borrarla", () => {
    // Este es el fallo de verdad: sin padre no hay nada que borrar, y devolver
    // `null` es lo que evita que el cleanup borre una hija por accidente.
    const rows: SeedParentRow[] = [
      { id: "trk-6dc263b9", artist_name: "Radiohead", title: "Kid A", release_id: "rel-4e26ff30" },
    ];
    expect(pickSeedParent(rows, "Radiohead", "Kid A")).toBeNull();
  });

  it("el resultado no depende del orden de las filas de entrada", () => {
    // `getAllTracks()` es un `SELECT *` sin `ORDER BY`, así que el orden de
    // llegada varía. Con dos padres del mismo título el desempate tiene que ser
    // estable: aquí, `created_at` y luego `id`.
    const a: SeedParentRow = {
      id: "rel-a",
      artist_name: "X",
      title: "T",
      release_id: null,
      created_at: "2024-01-01",
    };
    const b: SeedParentRow = {
      id: "rel-b",
      artist_name: "X",
      title: "T",
      release_id: null,
      created_at: "2024-01-02",
    };
    expect(pickSeedParent([a, b], "X", "T")?.id).toBe("rel-a");
    expect(pickSeedParent([b, a], "X", "T")?.id).toBe("rel-a");
  });

  it("el orden estable también funciona con created_at NULL, como en producción", () => {
    // Las 74 filas del seed se sembraron con `created_at` NULL, así que el
    // desempate real cae en `id` y no puede romperse con un NULL.
    const rows: SeedParentRow[] = [
      { id: "rel-zzz", artist_name: "X", title: "T", release_id: null, created_at: null },
      { id: "rel-aaa", artist_name: "X", title: "T", release_id: null, created_at: null },
    ];
    expect(pickSeedParent(rows, "X", "T")?.id).toBe("rel-aaa");
    expect(pickSeedParent([...rows].reverse(), "X", "T")?.id).toBe("rel-aaa");
  });

  it("los 5 artistas del seed son los del catálogo, sin artistas nuevos", () => {
    expect(SEED_ARTISTS.map((a) => a.name)).toEqual([
      "Pink Floyd",
      "Radiohead",
      "Björk",
      "David Bowie",
      "Kraftwerk",
    ]);
  });

  it("el catálogo sigue siendo 9 releases y 65 hijas", () => {
    expect(SEED_RELEASES).toHaveLength(9);
    expect(SEED_RELEASES.reduce((n, r) => n + r.tracks.length, 0)).toBe(65);
  });
});
