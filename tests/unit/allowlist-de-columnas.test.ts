/**
 * P12, fila 7 — el nombre de la columna no viene del body.
 *
 * ## Por qué este fichero existe
 *
 * `updateTrack` y `upsertDossier` construían el `SET` con `Object.keys()` del
 * objeto recibido:
 *
 * ```ts
 * const fields = Object.keys(updates).filter((k) => k !== "id");
 * const setClause = fields.map((k) => `${k} = ?`).join(", ");
 * ```
 *
 * El **valor** ya iba con `?`, pero el **nombre** de la columna se interpolaba.
 * La firma de TypeScript acota las claves en compilación, y el objeto viene de
 * `req.json()`: en runtime no hay nada que lo ate. `PUT /api/tracks` pasaba el
 * body entero sin filtrar, así que una clave como
 * `"title = (SELECT password_hash FROM users LIMIT 1) --"` producía SQL
 * arbitrario. Es admin-only y `SameSite=lax` bloquea el CSRF cross-site, así que
 * la severidad está acotada — pero es el único sitio del repo donde el nombre de
 * una columna viene de entrada de usuario.
 *
 * ## Por qué la allowlist está en `lib/db.ts` y no en la ruta
 *
 * Dos rutas ya tenían la suya (`app/api/tracks/[id]/route.ts` y
 * `app/api/releases/route.ts`) y una no (`app/api/tracks`). La divergencia
 * existía porque la validación estaba en el sitio que se olvidó de ponerla. En la
 * capa de datos no hay sitio que se pueda olvidar.
 *
 * ## Qué comprueba aquí
 *
 * Que la allowlist y la interfaz digan lo mismo. Se.ataron a mano y no coinciden
 * —la primera versión de la de dossiers tenía columnas que no existen y le
 * faltaban otras—, que es exactamente como se rompe una allowlist: nadie la
 * ejecuta, se mira.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

const DB = read("lib/db.ts");
const TYPES = read("types/music.ts");

/** Los campos de una interface, en el orden del fichero. */
function camposDe(interfaz: string, fuente = DB): string[] {
  const cuerpo = fuente.match(new RegExp(`export interface ${interfaz} \\{([\\s\\S]*?)\\n\\}`));
  expect(cuerpo, `no se encuentra la interfaz ${interfaz}`).not.toBeNull();
  return [...cuerpo![1].matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
}

/** Los literales de una constante `new Set([...])`. */
function setDe(constante: string): string[] {
  const cuerpo = DB.match(new RegExp(`const ${constante} = new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  expect(cuerpo, `no se encuentra ${constante}`).not.toBeNull();
  return [...cuerpo![1].matchAll(/"([\w]+)"/g)].map((m) => m[1]);
}

describe("updateTrack solo escribe columnas de tracks", () => {
  const allowlist = setDe("TRACK_UPDATABLE_COLUMNS");

  it("cubre todos los campos de la firma menos los que se escriben aparte", () => {
    // `updateTrack` recibe un `Partial<{…}>` en línea, no una interfaz con
    // nombre, así que se lee del propio `export async function updateTrack`.
    const firma = DB.match(
      /export async function updateTrack\([\s\S]*?updates: Partial<\{([\s\S]*?)\n\}>\)/
    );
    expect(firma, "no se encuentra la firma de updateTrack").not.toBeNull();
    const campos = [...firma![1].matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);

    const fuera = campos.filter((c) => !allowlist.includes(c));
    expect(fuera, `columnas de la firma sin allowlist: ${fuera.join(", ")}`).toEqual([]);
  });

  it("no inventa columnas que la tabla no tiene", () => {
    // Si la allowlist nombra una columna inexistente, el UPDATE falla en
    // producción la primera vez que alguien la use. `RawTrackRow` está en
    // `types/music.ts`, no en `lib/db.ts` — de ahí el segundo argumento.
    const track = camposDe("RawTrackRow", TYPES);
    const estructuradas = ["metrics", "production_details", "stems_urls", "gallery_images"];
    const fantasma = allowlist.filter((c) => !track.includes(c) && !estructuradas.includes(c));
    expect(fantasma, `columnas en la allowlist que no existen: ${fantasma.join(", ")}`).toEqual([]);
  });

  it("filtra antes de construir el SET", () => {
    // El orden importa: si el filtro estuviera después del `join`, la allowlist
    // no protegería nada.
    expect(DB).toMatch(
      /const fields = pedidas\.filter\(\(k\) => TRACK_UPDATABLE_COLUMNS\.has\(k\)\);[\s\S]*?const setClause = fields\.map/
    );
  });

  it("avisa de lo que descarta, en vez de perderlo en silencio", () => {
    // Sin el `console.warn`, un caller que mande una columna equivocada recibe
    // 200 y cree que guardó. El peor resultado no es que no se escriba: es no
    // enterarse de que no se escribió.
    expect(DB).toMatch(/console\.warn\(\s*`\[updateTrack\] claves ignoradas/);
  });
});

describe("upsertDossier solo escribe columnas de dossiers", () => {
  const allowlist = setDe("DOSSIER_UPDATABLE_COLUMNS");
  const campos = camposDe("DossierData");

  it("cubre todos los campos menos id, artist_id y las de timestamp", () => {
    const excluyentes = ["id", "artist_id", "created_at", "updated_at"];
    const fuera = campos.filter((c) => !excluyentes.includes(c) && !allowlist.includes(c));
    expect(fuera, `columnas de DossierData sin allowlist: ${fuera.join(", ")}`).toEqual([]);
  });

  it("no inventa columnas", () => {
    const fantasma = allowlist.filter((c) => !campos.includes(c));
    expect(fantasma, `columnas en la allowlist que no existen: ${fantasma.join(", ")}`).toEqual([]);
  });

  it("avisa de lo que descarta", () => {
    expect(DB).toMatch(/console\.warn\(`\[upsertDossier\] claves ignoradas/);
  });
});

describe("el nombre de la columna ya no se interpola desde una clave cualquiera", () => {
  it("ninguna función construye un SET con Object.keys sin filtrar", () => {
    // La forma exacta del fallo: `Object.keys(x).filter(...)` cuyo filtro solo
    // quita identificadores, sin comprobar que lo que queda sea una columna.
    const setSinFiltrar =
      /const \w+ = Object\.keys\([^)]+\)\.filter\([^)]*\);[\s\S]{0,200}?\.map\(\(?\s*\w+\s*\)?\s*=>\s*`\$\{\w+\} = \?`\)/;
    expect(DB, "queda un SET construido con Object.keys sin allowlist").not.toMatch(setSinFiltrar);
  });

  it("la ruta que quedaba abierta sigue siendo la puerta, y ahora la capa la cierra", () => {
    // `PUT /api/tracks` no tenía allowlist propia —la de `[id]` sí la tenía— y
    // por eso quedaba abierta. La capa de datos la cierra, pero la ruta sigue
    // siendo por donde entra el body.
    const TRACKS = read("app/api/tracks/route.ts");
    expect(TRACKS).toMatch(/const \{ id, \.\.\.updates \} = body;/);
    expect(TRACKS).toMatch(/await updateTrack\(id, updates\)/);
  });
});
