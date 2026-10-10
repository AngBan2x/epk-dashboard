/**
 * Normalización de `tracks.release_type` — la parte pura y los guardas de
 * regresión (PARTE 1).
 *
 * ## Qué protege cada bloque
 *
 * - La lógica (`planReleaseTypeNormalization`) decide qué filas se reescriben.
 *   No toca la base de datos: la lee el script, y eso permite probarla entero
 *   sin abrir Turso.
 * - Los guardas de fuente son los que evitan el fallo silencioso que motiva la
 *   tarea: un check que sigue en verde porque ya no compara contra nada real.
 *   Cada test de ese bloque está escrito para **fallar si alguien revierte el
 *   arreglo**, y eso se comprobó revirtiéndolo.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_RELEASE_TYPE,
  RELEASE_TYPE_VALUES,
  VULNICURA_RELEASE_TITLE,
  VULNICURA_RELEASE_TYPE,
  normalizeReleaseType,
  parseDataScriptFlags,
  planReleaseTypeNormalization,
  type ReleaseTypeRow,
} from "@/lib/release-type";
import { sinComentarios } from "../helpers/strip-comments";

function row(over: Partial<ReleaseTypeRow> = {}): ReleaseTypeRow {
  return {
    id: "trk-1",
    title: "Canción",
    release_id: null,
    release_type: "single",
    ...over,
  };
}

/** Padre + 5 hijas de Vulnicura, con las 6 filas en el estado de producción. */
function vulnicuraRows(tipo: string | null): ReleaseTypeRow[] {
  return [
    row({ id: "rel-869486ab", title: VULNICURA_RELEASE_TITLE, release_type: tipo }),
    ...[1, 2, 3, 4, 5].map((n) =>
      row({
        id: `trk-vuln-${n}`,
        title: `Pista ${n} (Strings)`,
        release_id: "rel-869486ab",
        release_type: tipo,
      })
    ),
  ];
}

describe("normalizeReleaseType", () => {
  it("pasa a minúsculas y quita los espacios de los bordes", () => {
    expect(normalizeReleaseType("Single")).toBe("single");
    expect(normalizeReleaseType("  EP  ")).toBe("ep");
  });

  it('lo que no es una cadena es "" y no "undefined"', () => {
    expect(normalizeReleaseType(null)).toBe("");
    expect(normalizeReleaseType(undefined)).toBe("");
    expect(normalizeReleaseType(42)).toBe("");
  });

  it("el vocabulario canónico y el default son minúscula", () => {
    // Si el default volviera a "Single", el próximo track creado por un artista
    // reintroduciría la mezcla que este trabajo quita.
    expect(RELEASE_TYPE_VALUES).toEqual(["album", "ep", "single"]);
    expect(DEFAULT_RELEASE_TYPE).toBe("single");
    for (const v of RELEASE_TYPE_VALUES) expect(v).toBe(v.toLowerCase());
  });
});

describe("planReleaseTypeNormalization — las mayúsculas", () => {
  it("marca cada fila que tiene mayúsculas, con el valor de origen intacto", () => {
    const plan = planReleaseTypeNormalization([
      row({ id: "a", release_type: "Single" }),
      row({ id: "b", release_type: "Album" }),
      row({ id: "c", release_type: "single" }),
    ]);
    expect(plan.changes).toEqual([
      { id: "a", title: "Canción", release_id: null, from: "Single", to: "single", motivo: "minusculas" },
      { id: "b", title: "Canción", release_id: null, from: "Album", to: "album", motivo: "minusculas" },
    ]);
    expect(plan.unchanged).toBe(1);
  });

  it("las hijas se normalizan igual que los padres", () => {
    // El bug que se iba a reportar: el filtro `WHERE release_type = 'single'`
    // devolvía 8 de 21 singles porque las 65 hijas seguían en `Single`.
    const plan = planReleaseTypeNormalization([
      row({ id: "padre", release_type: "Single" }),
      row({ id: "hija-1", release_id: "padre", release_type: "Single" }),
      row({ id: "hija-2", release_id: "padre", release_type: "Album" }),
    ]);
    expect(plan.changes.map((c) => c.id).sort()).toEqual(["hija-1", "hija-2", "padre"]);
  });

  it("es idempotente: con todo en minúscula no hay ni un cambio", () => {
    const plan = planReleaseTypeNormalization([
      row({ id: "a", release_type: "single" }),
      row({ id: "b", release_type: "album" }),
      row({ id: "c", release_type: "ep" }),
    ]);
    expect(plan.changes).toEqual([]);
    expect(plan.unchanged).toBe(3);
  });

  it("un valor con espacios alrededor se corrige a la versión sin espacios", () => {
    const plan = planReleaseTypeNormalization([row({ release_type: " Single " })]);
    expect(plan.changes[0].to).toBe("single");
  });
});

describe("planReleaseTypeNormalization — Vulnicura Strings", () => {
  it("el padre y sus 5 hijas van a `ep`, no a `album`", () => {
    const plan = planReleaseTypeNormalization(vulnicuraRows("Album"));
    expect(plan.changes).toHaveLength(6);
    expect(plan.changes.every((c) => c.to === VULNICURA_RELEASE_TYPE)).toBe(true);
    expect(plan.changes.every((c) => c.motivo === "catalogo-ep")).toBe(true);
  });

  it("también cuando el valor ya es `EP` en mayúscula", () => {
    const plan = planReleaseTypeNormalization(vulnicuraRows("EP"));
    expect(plan.changes).toHaveLength(6);
    expect(plan.changes.every((c) => c.to === "ep")).toBe(true);
  });

  it("y no vuelve a tocar nada cuando ya está en `ep`", () => {
    const plan = planReleaseTypeNormalization(vulnicuraRows("ep"));
    expect(plan.changes).toEqual([]);
    expect(plan.unchanged).toBe(6);
  });

  it("solo afecta a las filas del release: otra release con el mismo título, no", () => {
    // El localizador es `release_id = <padre>`, no el título suelto: si una fila
    // de otro artista se llamara igual, tampoco debe saltar.
    const plan = planReleaseTypeNormalization([
      ...vulnicuraRows("Album"),
      row({ id: "otro", title: VULNICURA_RELEASE_TITLE, release_id: "rel-ajeno", release_type: "album" }),
    ]);
    expect(plan.changes.map((c) => c.id)).not.toContain("otro");
  });

  it("una hija homónima NO cuenta como el padre", () => {
    // Una hija con el mismo título y `release_id` distinto NO es el release.
    const plan = planReleaseTypeNormalization([
      row({ id: "rel-real", title: VULNICURA_RELEASE_TITLE, release_type: "album" }),
      row({ id: "trk-ajeno", title: VULNICURA_RELEASE_TITLE, release_id: "rel-otro", release_type: "album" }),
    ]);
    expect(plan.changes.map((c) => c.id)).toEqual(["rel-real"]);
  });
});

describe("planReleaseTypeNormalization — lo que NO toca", () => {
  it("una fila sin release_type no se inventa", () => {
    // Rellenar un `NULL` sería escribir un dato falso: "no lo sabemos" y
    // "es un single" no son lo mismo.
    const plan = planReleaseTypeNormalization([
      row({ id: "nulo", release_type: null }),
      row({ id: "vacio", release_type: "   " }),
      row({ id: "bien", release_type: "Single" }),
    ]);
    expect(plan.sinValor).toEqual(["nulo", "vacio"]);
    expect(plan.changes.map((c) => c.id)).toEqual(["bien"]);
  });
});

describe("CLI: el default de los scripts de datos es dry-run", () => {
  it("sin flags NO escribe", () => {
    expect(parseDataScriptFlags([]).apply).toBe(false);
  });

  it("solo --apply escribe", () => {
    expect(parseDataScriptFlags(["--apply"]).apply).toBe(true);
  });

  it("--dry explícito sigue siendo dry-run", () => {
    const f = parseDataScriptFlags(["--dry"]);
    expect(f.apply).toBe(false);
    expect(f.dryRequested).toBe(true);
  });

  it("--apply y --dry a la vez gana --apply, sin ambigüedad", () => {
    expect(parseDataScriptFlags(["--dry", "--apply"]).apply).toBe(true);
  });

  it("el script de normalización sale por parseDataScriptFlags y no invierte el default", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "scripts", "normalize-release-type.ts"),
      "utf8"
    );
    expect(src).toMatch(/parseDataScriptFlags/);
    // El patrón que tenía el script de Unsplash: `--dry` opcional y escribir por
    // defecto. Aquí no puede aparecer.
    expect(src).not.toMatch(/DRY\s*=\s*!.*--dry/);
    expect(src).not.toMatch(/process\.argv\.includes\(\s*["']--dry["']\s*\)/);
  });

  it("y el UPDATE lleva el valor ANTIGUO en el WHERE, para no pisar cambios ajenos", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "scripts", "normalize-release-type.ts"),
      "utf8"
    );
    expect(src).toMatch(/SET release_type = \? WHERE id = \? AND release_type = \?/);
  });
});

describe("el guard de turso-check sigue comparando contra algo real", () => {
  // Sin comentarios: el comentario que explica el arreglo **cita** el código que
  // el arreglo elimina, así que sobre el fichero entero este test se pondría
  // rojo por su propia documentación (ver `tests/helpers/strip-comments.ts`).
  const SRC = sinComentarios(
    fs.readFileSync(path.join(process.cwd(), "scripts", "turso-check.ts"), "utf8")
  );

  it("usa lower(release_type) = 'ep', no release_type = 'EP'", () => {
    // ESTE es el test que falla al revertir el arreglo. Con `release_type = 'EP'`
    // el check sigue sacando 0 después de normalizar —verde— pero porque ya no
    // compara contra nada real: `album` y `EP` darían la misma respuesta.
    expect(SRC).toMatch(/lower\(release_type\)\s*=\s*'ep'/);
    expect(SRC).not.toMatch(/release_type\s*=\s*'EP'/);
  });

  it("el guard sigue nombrando el release y sus hijas", () => {
    expect(SRC).toMatch(/title = 'Vulnicura Strings'/);
    expect(SRC).toMatch(/release_id IN \(SELECT id FROM tracks/);
  });

  it("y hay un check que declara que NINGÚN release_type lleva mayúsculas", () => {
    // Sin este, el guard de Vulnicura podría estar en verde con el resto de la
    // columna llena de `Album`.
    expect(SRC).toMatch(/tracks_release_type_con_mayusculas/);
    expect(SRC).toMatch(/release_type <> lower\(release_type\)/);
  });
});

describe("fix-seed-data ya no reintroduce mayúsculas", () => {
  const SRC = fs.readFileSync(path.join(process.cwd(), "scripts", "fix-seed-data.ts"), "utf8");

  it("escribe `ep` y ya no escribe `Album` como destino", () => {
    // `VULNICURA_TYPE_RIGHT = "Album"` era el arreglo anterior. Con la decisión
    // del catálogo, volver a aplicarlo deshacía la normalización entera.
    expect(SRC).toMatch(/VULNICURA_TYPE_RIGHT\s*=\s*"ep"/);
    expect(SRC).not.toMatch(/VULNICURA_TYPE_RIGHT\s*=\s*"Album"/);
  });

  it("el WHERE reconoce el valor bueno con cualquier capitalización", () => {
    // Con `WHERE release_type = 'ep'` el arreglo solo reconocería el valor ya
    // normalizado y no sería idempotente sobre una base en `Album`.
    expect(SRC).toMatch(/lower\(COALESCE\(release_type, ''\)\) <> \?/);
  });

  it("el comentario dice que es una decisión de catálogo, no del disco", () => {
    // Si el comentario vuelve a decir "es un álbum de 12 pistas, no un EP",
    // contradice el código y suelta a que alguien "arregle" el `ep` otra vez.
    expect(SRC).toMatch(/decisi[oó]n de CAT[AÁ]LOGO/i);
    expect(SRC).toMatch(/12 pistas/);
  });
});