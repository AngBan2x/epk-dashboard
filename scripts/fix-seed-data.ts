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
 *  3. `release_type` de *Vulnicura Strings* y de sus 5 hijas: queda en `ep`.
 *     Esto ya **no** es una descripción del disco —son las versiones con
 *     cuerdas de un álbum de 12 pistas, así que `album` sería más fiel— sino una
 *     decisión del propietario del catálogo. Por eso el valor es `ep` y no
 *     `Album`: `scripts/normalize-release-type.ts` deja toda la columna en
 *     minúsculas porque `getTracksByReleaseType()` compara `WHERE release_type = ?`
 *     **exacto**, y volver a escribir `Album` aquí reintroduciría la mezcla que
 *     ese script acaba de arreglar. El `WHERE` es `lower(...) <> 'ep'` por el
 *     mismo motivo: tiene que reconocer el valor bueno con cualquier
 *     capitalización, o el arreglo no sería idempotente. El flag vive en el
 *     padre Y en sus 5 hijas, y cada fila se pinta como tarjeta propia, así que
 *     se corrigen las 6.
 *  4. La duración de los 9 padres, que quedó en "00:00" hardcodeada y se
 *     propagó a los 3 formatos de export. Es la suma de las duraciones de sus
 *     hijas, en `M:SS` con `sumDurations()` de `lib/null-safe.ts` —el contrato
 *     compartido de RC.31— para que una etiqueta de dos dígitos no quede
 *     inconsistente al lado de las hijas (`"6:07"`, no `"06:07"`).
 *  5. (RC.32 Tarea 3) La deriva de `start_time` / `end_time` de las hijas, que
 *     en RC.31 quedó documentada como "no se toca" y era la incoherencia viva
 *     más visible del catálogo. Ver abajo.
 *
 * ── 5. La deriva de la línea de tiempo (RC.32) ──────────────────────────────
 * En `The Dark Side of the Moon`, `Us and Them` empezaba en 1530 y acababa en
 * 2009 cuando 1530 + 469 (7:49) = 1999: los 10 s de desfase arrastraban el
 * `start_time` y el `end_time` de las tres pistas siguientes, y `Eclipse
 * acababa en 2566` en vez de 2556. En `Kid A`, `Motion Picture Soundtrack`
 * acababa en 3001 cuando 2577 + 421 (7:01) = 2998.
 *
 * La causa está corregida en el ORIGEN (`scripts/seed-influential-catalog.ts` ya
 * declara 1999/2203/2433/2556 y 2998), pero las filas ya sembradas conservan los
 * valores viejos: el upsert del seed es create-or-skip, así que volver a correrlo
 * no las toca. Por eso el arreglo va aquí.
 *
 * El efecto no era cosmético. El `duration` del padre `rel-9b286f4a` es la suma
 * de las duraciones de sus hijas (2556 s = "42:36"), pero el RECORRIDO de sus
 * `end_time` llegaba a 2566: padre e hijas se contradecían en la misma tabla, y
 * cualquier consumidor que usara los `end_time` (saltos de vídeo) se salía 10 s.
 * Al corregir la línea de tiempo, la contradicción se cierra sola.
 *
 * Se emparejan por `(disc_number, track_number)`, NO por título: en *Kid A* la
 * hija 2 se llama exactamente "Kid A" y en *Heroes* la hija 1 se llama "Heroes".
 *
 * Lo que NO toca, a propósito:
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
/**
 * Decisión de CATÁLOGO, no descripción del disco. Ver el punto 3 de la cabecera.
 *
 * Antes aquí ponía `EP` -> `Album`, y ese arreglo ya no se puede aplicar: la
 * decisión es `ep`, y `Album` es una de las formas que la normalización acaba de
 * eliminar de la columna.
 */
const VULNICURA_TYPE_RIGHT = "ep";

interface Row {
  id: string;
  title: string;
  artist_name: string;
  release_id: string | null;
  release_type: string;
  duration: string;
}

/**
 * Una hija del catálogo semilla. `start_time` / `end_time` son SEGUNDOS
 * enteros, no `"M:SS"` como `duration`: es como los escribe el seed
 * (`st.startTime` / `st.endTime`) y como los leen los saltos de vídeo.
 */
interface TimelineRow {
  id: string;
  title: string;
  disc_number: number | null;
  track_number: number | null;
  start_time: number;
  end_time: number;
}

/** Clave de emparejamiento hija↔seed. El título NO sirve: hay daughters homónimas. */
const timelineKey = (disc: number | null, track: number | null): string =>
  `${disc ?? 1}|${track ?? ""}`;

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
  // 3. Vulnicura Strings: el padre y sus 5 hijas quedan en `ep`.
  //    Decisión de catálogo, no descripción del disco (cabecera, punto 3).
  //    El `WHERE` reconoce cualquier capitalización: si no, el arreglo no sería
  //    idempotente y volver a aplicarlo "arreglaría" filas ya correctas
  //    escribiendo mayúsculas encima.
  // ------------------------------------------------------------------
  const vulnicura = parents.find((p) => p.title === VULNICURA_TITLE);
  if (vulnicura) {
    fixes.push({
      label: `release_type de ${vulnicura.id} (padre + hijas) -> "${VULNICURA_TYPE_RIGHT}"`,
      sql: `UPDATE tracks
               SET release_type = ?
             WHERE lower(COALESCE(release_type, '')) <> ?
               AND (id = ? OR release_id = ?)`,
      args: [VULNICURA_TYPE_RIGHT, VULNICURA_TYPE_RIGHT, vulnicura.id, vulnicura.id],
      expected: 6,
      countSql: `SELECT COUNT(*) c FROM tracks
                  WHERE lower(COALESCE(release_type, '')) <> ?
                    AND (id = ? OR release_id = ?)`,
      countArgs: [VULNICURA_TYPE_RIGHT, vulnicura.id, vulnicura.id],
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
  // 5. (RC.32) La línea de tiempo de las hijas, contra el ORIGEN del seed.
  //
  //    Se recorre padre por padre porque es el único modo de saber a qué
  //    release pertenece cada hija: `SEED_RELEASES` es la lista de releases, y
  //    las hijas se localizan por `disc_number`/`track_number` DENTRO de él.
  // ------------------------------------------------------------------
  const timelineRows: string[] = [];
  let missingFromDb = 0;

  for (const parent of parents) {
    const sr = SEED_RELEASES.find(
      (r) => r.artistName === parent.artist_name && r.title === parent.title
    );
    if (!sr) {
      // El padre está en la base de datos pero no en el catálogo del seed: no
      // hay con qué comparar su línea de tiempo, y no se inventa.
      continue;
    }

    const children = (await readRows(
      `SELECT id, title, disc_number, track_number, start_time, end_time
         FROM tracks WHERE release_id = ?`,
      [parent.id]
    )) as unknown as TimelineRow[];

    const byKey = new Map<string, TimelineRow>();
    for (const child of children) {
      byKey.set(timelineKey(child.disc_number, child.track_number), child);
    }

    for (const st of sr.tracks) {
      const child = byKey.get(timelineKey(st.discNumber, st.trackNumber));
      if (!child) {
        missingFromDb += 1;
        continue;
      }
      const curStart = Number(child.start_time ?? 0);
      const curEnd = Number(child.end_time ?? 0);
      if (curStart === st.startTime && curEnd === st.endTime) continue;

      const label = `timeline ${parent.artist_name} — ${parent.title} #${st.trackNumber} "${st.title}": ` +
        `start ${curStart}->${st.startTime}, end ${curEnd}->${st.endTime}`;
      timelineRows.push(label);
      fixes.push({
        label,
        // El `WHERE` lleva los valores VIEJOS: re-aplicar el script no cuenta
        // como arreglo y el dry-run puede volver a correr las veces que quiera.
        sql: `UPDATE tracks SET start_time = ?, end_time = ?
               WHERE id = ? AND start_time = ? AND end_time = ?`,
        args: [st.startTime, st.endTime, child.id, curStart, curEnd],
        expected: 1,
        countSql: `SELECT COUNT(*) c FROM tracks
                    WHERE id = ? AND start_time = ? AND end_time = ?`,
        countArgs: [child.id, curStart, curEnd],
      });
    }
  }

  if (timelineRows.length > 0) {
    console.log(`\nDeriva de línea de tiempo a corregir: ${timelineRows.length} hija(s)`);
  }
  if (missingFromDb > 0) {
    console.log(
      `⚠️  ${missingFromDb} pista(s) del catálogo no están en la base de datos: ` +
        `su línea de tiempo no se puede comparar y se dejan como están.`
    );
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
      "Lo que NO se toca aquí: la release_date de Vulnicura Strings (2016-11-04 cuando el álbum es de 2015)."
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
