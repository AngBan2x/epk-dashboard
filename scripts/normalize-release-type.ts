#!/usr/bin/env tsx
/**
 * Normaliza `tracks.release_type` a minúsculas y deja *Vulnicura Strings*
 * marcada como `ep` (decisión de catálogo).
 *
 * ── Qué arregla ──────────────────────────────────────────────────────────────
 *
 * La columna estaba mezclada: 8 padres en `single` frente a 13 en
 * `Single`/`Album`, y las 65 filas hijas en `Album`/`Single`. Como
 * `getTracksByReleaseType()` (`lib/db.ts`) filtra con `WHERE release_type = ?`
 * y en SQLite eso **distingue mayúsculas**, pedir `'single'` devolvía 8 de 21
 * singles. El valor canónico pasa a ser minúscula —la capitalización la
 * repone `capitalizeReleaseType()` para la UI— y *Vulnicura Strings* queda en
 * `ep`, que es lo que decidió el propietario del catálogo aunque el disco sea
 * un álbum de 12 pistas.
 *
 * ── Por qué un script y no un `UPDATE` suelto ─────────────────────────────────
 *
 * Porque son 83 filas repartidas entre padres e hijas, y porque el resultado
 * tiene que poder **revisarse antes de escribir**. El dry-run imprime fila a
 * fila el valor de ahora y el de después, que es lo que hay que mirar. Es el
 * mismo contrato que `scripts/fix-seed-data.ts` y `scripts/qa-cleanup.ts`.
 *
 * ── Idempotencia ─────────────────────────────────────────────────────────────
 *
 * Cada `UPDATE` lleva el valor ANTIGUO en el `WHERE`, así que re-aplicar el
 * script cuenta 0 filas afectadas: se puede correr tantas veces como haga
 * falta y nunca hace daño.
 *
 * ── Lo que NO hace ───────────────────────────────────────────────────────────
 *
 * - No inventa `release_type` en las filas que lo tienen `NULL` o vacío: las
 *   lista y las deja como están (`planReleaseTypeNormalization().sinValor`).
 * - No toca `release_date`, ni duraciones, ni el resto del catálogo.
 *
 * Uso:
 *   npx tsx scripts/normalize-release-type.ts           # dry-run (default)
 *   npx tsx scripts/normalize-release-type.ts --apply   # escribir cambios
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { getDbWrite, isTursoEnabled, tursoExec, tursoExecUpdate } from "../lib/db";
import {
  VULNICURA_RELEASE_TITLE,
  parseDataScriptFlags,
  planReleaseTypeNormalization,
  type ReleaseTypeChange,
  type ReleaseTypeRow,
} from "@/lib/release-type";

async function readRows(): Promise<ReleaseTypeRow[]> {
  if (isTursoEnabled()) {
    const rows = await tursoExec(
      `SELECT id, title, release_id, release_type FROM tracks ORDER BY id`
    );
    return rows as unknown as ReleaseTypeRow[];
  }
  return getDbWrite()
    .prepare(`SELECT id, title, release_id, release_type FROM tracks ORDER BY id`)
    .all() as unknown as ReleaseTypeRow[];
}

/** Devuelve el número de FILAS afectadas, no el de sentencias. */
async function writeRows(sql: string, args: unknown[]): Promise<number> {
  if (isTursoEnabled()) {
    return tursoExecUpdate(sql, args);
  }
  const result = getDbWrite().prepare(sql).run(...(args as never[]));
  return Number(result.changes ?? 0);
}

async function main() {
  const { apply, dryRequested } = parseDataScriptFlags(process.argv.slice(2));

  console.log(
    `\n${apply ? "🔧 APLICANDO" : "🔍 DRY-RUN"} — normalize-release-type\n`
  );
  console.log(`Motor: ${isTursoEnabled() ? "Turso" : "SQLite local"}\n`);
  console.log(
    `Objetivo: todo tracks.release_type en minúscula; ` +
      `"${VULNICURA_RELEASE_TITLE}" (padre + hijas) en "ep".\n`
  );

  const rows = await readRows();
  const plan = planReleaseTypeNormalization(rows);

  console.log(`Filas leídas: ${rows.length}`);
  console.log(`  · ya correctas: ${plan.unchanged}`);
  console.log(`  · a corregir:   ${plan.changes.length}`);
  console.log(`  · sin valor:    ${plan.sinValor.length}`);

  if (plan.sinValor.length > 0) {
    console.log(
      `\n⚠️  ${plan.sinValor.length} fila(s) con release_type NULL o vacío. ` +
        `No se tocan: no hay nada que normalizar y rellenarlo sería inventar un dato.`
    );
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(apply ? "CAMBIOS A APLICAR" : "CAMBIOS QUE SE APLICARÍAN");
  console.log("=".repeat(72));

  for (const change of plan.changes as ReleaseTypeChange[]) {
    const marca = change.motivo === "catalogo-ep" ? "🎛️ " : "·";
    console.log(
      `${marca} ${change.id}  ${change.title}  ` +
        `[${change.release_id ? "hija" : "padre"}]  ` +
        `${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}` +
        (change.motivo === "catalogo-ep" ? "  (decisión de catálogo)" : "")
    );
  }

  console.log("=".repeat(72));
  console.log(`Total de filas afectadas: ${plan.changes.length}`);

  if (!apply) {
    console.log("\n🔍 DRY-RUN. No se escribió nada. Añade --apply para ejecutarlo.");
    if (dryRequested) console.log("(--dry explícito: mismo efecto que no poner nada.)");
    return;
  }

  if (plan.changes.length === 0) {
    console.log("\n✅ Nada que hacer: los valores ya están normalizados.");
    return;
  }

  let written = 0;
  for (const change of plan.changes) {
    // El `WHERE` lleva el valor VIEJO: re-aplicar el script no cuenta como
    // arreglo y nunca pisa un cambio hecho por otra persona entre medias.
    const changes = await writeRows(
      `UPDATE tracks SET release_type = ? WHERE id = ? AND release_type = ?`,
      [change.to, change.id, change.from]
    );
    written += changes;
    console.log(`  ↻ ${change.id}  ${change.from} -> ${change.to}  (${changes} fila(s))`);
  }

  console.log(
    `\n✅ Escritas ${written} filas en ${isTursoEnabled() ? "Turso" : "SQLite local"}.`
  );
  if (written !== plan.changes.length) {
    console.warn(
      `⚠️  El dry-run predecía ${plan.changes.length} y se escribieron ${written}: ` +
        `alguna fila cambió entre medias. Vuelve a lanzar el dry-run para ver el estado.`
    );
  }
}

const invokedDirectly = (process.argv[1] ?? "")
  .replace(/\\/g, "/")
  .endsWith("normalize-release-type.ts");

if (invokedDirectly) {
  main().catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
}