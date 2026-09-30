#!/usr/bin/env tsx
/**
 * Correcciones sobre el catálogo YA sembrado, sin depender de re-ejecutar
 * `scripts/seed-influential-catalog.ts` (RC.31, P7 + P15).
 *
 * El seed queda arreglado también en su origen, pero re-sembrar no sirve para
 * esto: el upsert es por clave estable y las filas que se van a corregir tienen
 * justo la clave que el seed ya escribiría, así que volver a correrlo las deja
 * como están. Y `fix-seed-data.ts` no se limita a Turso: escribe en el motor
 * que haya activo.
 *
 * Qué corrige, todo ello seleccionando por el VALOR ERRONEO y no por id, para
 * que el script sea idempotente y funcione igual contra Turso que contra el
 * SQLite local (donde los ids son distintos):
 *
 *  1. "Ashe to Ashes" -> "Ashes to Ashes" (errata viva en la pista hija).
 *  2. El título `"Heroes"` con las comillas LITERALES dentro del título, en el
 *     padre y en su hija. Se busquen con comillas porque el título correcto
 *     ("Heroes") es un prefijo suyo: buscar por el valor ya corregido
 *     encontraría la fila buena y no la mala.
 *  3. `release_type` de *Vulnicura Strings*: `EP` -> `Album`. Es un álbum de 12
 *     pistas (versiones con cuerdas), no un EP. El flag vive en el padre Y en
 *     sus 5 hijas, y cada fila se pinta como tarjeta propia, así que se
 *     corrigen las 6: dejarlas en `EP` daría un álbum con etiqueta de EP y
 *     cinco pistas sueltas marcadas como EP.
 *  4. La duración de los 9 padres, que quedó en "00:00" hardcodeada y se
 *     propagó a los 3 formatos de export. Es la suma de las duraciones de sus
 *     hijas, en `M:SS` con `sumDurations()` de `lib/null-safe.ts` —el contrato
 *     compartido de RC.31— para que una etiqueta de dos dígitos no quede
 *     inconsistente al lado de las hijas (`"6:07"`, no `"06:07"`).
 *
 * Lo que NO toca, a propósito:
 *  - `start_time` / `end_time`. La deriva de 10 s en *The Dark Side of the Moon*
 *    y de 3 s en *Kid A* está corregida en el origen del seed, pero aquí solo
 *    cambiarían los offsets de salto de vídeo de 2 filas de cada álbum y no
 *    se han pedido. Se reporta al final.
 *  - `release_date` de *Vulnicura Strings*, que dice 2016-11-04 cuando el
 *    álbum es de 2015.
 *
 * Uso:
 *   npx tsx scripts/fix-seed-data.ts           # dry-run (default)
 *   npx tsx scripts/fix-seed-data.ts --apply   # escribir cambios
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { getDbWrite, isTursoEnabled, tursoExec, tursoExecUpdate } from "../lib/db";
import { sumDurations } from "@/lib/null-safe";
import { SEED_ARTISTS, SEED_RELEASES } from "./seed-influential-catalog";

/** Los 5 artistas del seed, para acotar el alcance de cada UPDATE. */
const SEED_ARTIST_NAMES = SEED_ARTISTS.map((a) => a.name);

const HEROES_ARTIST = "David Bowie";
/** Con las comillas LITERALES: así es como está escrito en la base de datos. */
const HEROES_TITLE_WRONG = '"Heroes"';
const HEROES_TITLE_RIGHT = "Heroes";

const ASHES_ARTIST = "David Bowie";
const ASHES_TITLE_WRONG = "Ashe to Ashes";
const ASHES_TITLE_RIGHT = "Ashes to Ashes";

const VULNICURA_TITLE = "Vulnicura Strings";
const VULNICURA_TYPE_WRONG = "EP";
const VULNICURA_TYPE_RIGHT = "Album";

interface Row {
  id: string;
  title: string;
  artist_name: string;
  release_id: string | null;
  release_type: string;
  duration: string;
}

interface Fix {
  label: string;
  sql: string;
  args: unknown[];
  /** Filas que este arreglo debe tocar. Sirve para marcar ⚠️ en el dry-run. */
  expected: number;
  /** `SELECT COUNT(*)` con la MISMA cláusula WHERE, para el dry-run. */
  countSql: string;
  countArgs: unknown[];
}

async function readRows(sql: string, args: unknown[]): Promise<Row[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec(sql, args);
    return rows as Row[];
  }
  return getDbWrite()
    .prepare(sql)
    .all(...(args as never[])) as unknown as Row[];
}

/** Devuelve el número de FILAS afectadas, no el de sentencias. */
async function writeRows(sql: string, args: unknown[]): Promise<number> {
  if (isTursoEnabled()) {
    return tursoExecUpdate(sql, args);
  }
  const result = getDbWrite()
    .prepare(sql)
    .run(...(args as never[]));
  return Number(result.changes ?? 0);
}

/** Marcadores para los `IN (...)` de la lista de artistas del seed. */
const ARTIST_PLACEHOLDERS = SEED_ARTIST_NAMES.map(() => "?").join(", ");

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");

  console.log(
    `\n${apply ? "🔧 APLICANDO" : "🔍 DRY-RUN"} — fix-seed-data (RC.31 P7 + P15)\n`
  );
  console.log(
    `Motor: ${isTursoEnabled() ? "Turso" : "SQLite local"}\n`
  );

  // ------------------------------------------------------------------
  // Parents de los 9 releases del seed, con sus hijos ya adjoining.
  // ------------------------------------------------------------------
  const parents = await readRows(
    `SELECT id, title, artist_name, release_id, release_type, duration
       FROM tracks
      WHERE release_id IS NULL
        AND artist_name IN (${ARTIST_PLACEHOLDERS})
      ORDER BY artist_name, created_at, id`,
    SEED_ARTIST_NAMES
  );

  console.log(`Padres de releases del seed encontrados: ${parents.length}`);
  for (const p of parents) {
    console.log(
      `  ${p.id}  ${p.artist_name} — ${p.title}  [${p.release_type}, duration="${p.duration}"]`
    );
  }
  if (parents.length !== SEED_RELEASES.length) {
    console.log(
      `\n⚠️  Se esperaban ${SEED_RELEASES.length} padres y hay ${parents.length}. ` +
        `Los parents que no estén aquí no se tocan; sigue leyendo el dry-run antes de aplicar.`
    );
  }

  const fixes: Fix[] = [];

  // ------------------------------------------------------------------
  // 1. "Ashe to Ashes" -> "Ashes to Ashes" (solo la hija; el padre ya
  //    decía "Ashes to Ashes", que es el título correcto del single).
  // ------------------------------------------------------------------
  fixes.push({
    label: `titulo "${ASHES_TITLE_WRONG}" -> "${ASHES_TITLE_RIGHT}"`,
    sql: `UPDATE tracks SET title = ? WHERE title = ? AND artist_name = ?`,
    args: [ASHES_TITLE_RIGHT, ASHES_TITLE_WRONG, ASHES_ARTIST],
    expected: 1,
    countSql: `SELECT COUNT(*) c FROM tracks WHERE title = ? AND artist_name = ?`,
    countArgs: [ASHES_TITLE_WRONG, ASHES_ARTIST],
  });

  // ------------------------------------------------------------------
  // 2. "Heroes" con comillas literales, en el padre y en su hija.
  //    Padre e hija comparten título, así que se separan por `release_id` y no
  //    por el título. Localizar la hija a través del padre (que en un segundo
  //    pase ya no tiene el título erróneo) haría que el arreglo se quedara a
  //    medias: con el padre arreglado, `heroesParent` salía `null` y la hija
  //    con comillas se quedaba sin corregir. Acotando por `release_id IS NULL`
  //    / `IS NOT NULL` cada fila se localiza por su propia forma.
  // ------------------------------------------------------------------
  fixes.push({
    label: `titulo padre ${HEROES_TITLE_WRONG} -> ${HEROES_TITLE_RIGHT}`,
    sql: `UPDATE tracks SET title = ? WHERE title = ? AND artist_name = ? AND release_id IS NULL`,
    args: [HEROES_TITLE_RIGHT, HEROES_TITLE_WRONG, HEROES_ARTIST],
    expected: 1,
    countSql: `SELECT COUNT(*) c FROM tracks WHERE title = ? AND artist_name = ? AND release_id IS NULL`,
    countArgs: [HEROES_TITLE_WRONG, HEROES_ARTIST],
  });

  fixes.push({
    label: `titulo hija ${HEROES_TITLE_WRONG} -> ${HEROES_TITLE_RIGHT}`,
    sql: `UPDATE tracks SET title = ? WHERE title = ? AND artist_name = ? AND release_id IS NOT NULL`,
    args: [HEROES_TITLE_RIGHT, HEROES_TITLE_WRONG, HEROES_ARTIST],
    expected: 1,
    countSql: `SELECT COUNT(*) c FROM tracks WHERE title = ? AND artist_name = ? AND release_id IS NOT NULL`,
    countArgs: [HEROES_TITLE_WRONG, HEROES_ARTIST],
  });

  // ------------------------------------------------------------------
  // 3. Vulnicura Strings: EP -> Album en el padre y en sus 5 hijas.
  // ------------------------------------------------------------------
  const vulnicura = parents.find((p) => p.title === VULNICURA_TITLE);
  if (vulnicura) {
    fixes.push({
      label: `release_type ${VULNICURA_TYPE_WRONG} -> ${VULNICURA_TYPE_RIGHT} (padre + hijas de ${vulnicura.id})`,
      sql: `UPDATE tracks
               SET release_type = ?
             WHERE release_type = ?
               AND (id = ? OR release_id = ?)`,
      args: [VULNICURA_TYPE_RIGHT, VULNICURA_TYPE_WRONG, vulnicura.id, vulnicura.id],
      expected: 6,
      countSql: `SELECT COUNT(*) c FROM tracks WHERE release_type = ? AND (id = ? OR release_id = ?)`,
      countArgs: [VULNICURA_TYPE_WRONG, vulnicura.id, vulnicura.id],
    });
  } else {
    console.log(`\n⚠️  No se encuentra el release ${VULNICURA_TITLE}: se omite el flag.`);
  }

  // ------------------------------------------------------------------
  // 4. Duración de los 9 padres = suma de las duraciones de sus hijas.
  //    Uno por padre y no un UPDATE masivo: cada padre lleva una suma
  //    distinta, y además así se puede dry-runear el valor exacto que se
  //    va a escribir, que es lo que hay que revisar antes de aplicar.
  // ------------------------------------------------------------------
  const durationPlan: Array<{
    id: string;
    label: string;
    title: string;
    current: string;
    next: string;
    children: number;
  }> = [];

  for (const parent of parents) {
    const children = await readRows(
      `SELECT id, title, artist_name, release_id, release_type, duration
         FROM tracks
        WHERE release_id = ?`,
      [parent.id]
    );
    const total = sumDurations(children.map((c) => c.duration));
    if (!total) {
      console.log(
        `\n⚠️  ${parent.artist_name} — ${parent.title}: sus ${children.length} hijas no suman nada, se deja la duración como está.`
      );
      continue;
    }
    if (total.label === parent.duration) {
      console.log(
        `\n  = ${parent.artist_name} — ${parent.title}: duration ya es "${total.label}", no se toca.`
      );
      continue;
    }
    durationPlan.push({
      id: parent.id,
      label: `duration ${parent.duration} -> ${total.label}`,
      title: `${parent.artist_name} — ${parent.title}`,
      current: parent.duration,
      next: total.label,
      children: children.length,
    });
    fixes.push({
      label: `duration ${parent.artist_name} — ${parent.title}: ${parent.duration} -> ${total.label}`,
      sql: `UPDATE tracks SET duration = ? WHERE id = ?`,
      args: [total.label, parent.id],
      expected: 1,
      countSql: `SELECT COUNT(*) c FROM tracks WHERE id = ? AND duration = ?`,
      countArgs: [parent.id, parent.duration],
    });
  }

  // ------------------------------------------------------------------
  // Dry-run: contar filas afectadas de verdad, sin escribir.
  // ------------------------------------------------------------------
  console.log(`\n${"=".repeat(72)}`);
  console.log(apply ? "CAMBIOS A APLICAR" : "CAMBIOS QUE SE APLICARÍAN");
  console.log("=".repeat(72));

  let totalRows = 0;
  for (const fix of fixes) {
    const rows = await readRows(fix.countSql, fix.countArgs);
    const affected = Number(
      (rows[0] as unknown as { c: number } | undefined)?.c ?? 0
    );
    const mark = affected === 0 ? "·" : affected === fix.expected ? "✅" : "⚠️ ";
    totalRows += affected;
    console.log(`${mark} ${fix.label}  [${affected} fila(s)]`);
  }

  console.log("=".repeat(72));
  console.log(`Total de filas afectadas: ${totalRows}`);

  if (!apply) {
    console.log("\n🔍 DRY-RUN. No se escribió nada. Añade --apply para ejecutarlo.");
    console.log(
      "Lo que NO se toca aquí: la deriva de start_time/end_time (10 s en The Dark Side of the Moon," +
        "\n3 s en Kid A) y la release_date de Vulnicura Strings (2016-11-04 cuando el álbum es de 2015)."
    );
    return;
  }

  if (totalRows === 0) {
    console.log("\n✅ Nada que hacer: los valores ya están corregidos.");
    return;
  }

  let written = 0;
  for (const fix of fixes) {
    const changes = await writeRows(fix.sql, fix.args);
    written += changes;
    console.log(`  ↻ ${fix.label}  (${changes} fila(s))`);
  }

  console.log(`\n✅ Escritas ${written} filas en ${isTursoEnabled() ? "Turso" : "SQLite local"}.`);
}

const invokedDirectly = (process.argv[1] ?? "")
  .replace(/\\/g, "/")
  .endsWith("fix-seed-data.ts");

if (invokedDirectly) {
  main().catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
}
