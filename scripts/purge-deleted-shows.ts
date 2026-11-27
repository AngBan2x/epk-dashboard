/**
 * P20.2 / D5 — la purga de los shows archivados, y **solo a mano**.
 *
 * D5 dice que los shows se marcan, no se borran. El cron ya solo marca
 * (`P20.1`). Este script es la única puerta al borrado real, y por eso:
 *
 * - **Dry-run por defecto.** `--apply` es la única forma de escribir, igual que
 *   en `qa-cleanup.ts` y en los scripts de datos.
 * - **Ventana de gracia obligatoria.** Por defecto 90 días. Un show archivado
 *   ayer puede ser un clic equivocado, y `deleted_at` es lo único que permite
 *   deshacerlo; purgar sin margen convierte "no se borra" en "se borra con un
 *   día de retraso".
 * - **La selección no vive aquí.** `selectPurgeable()` está en
 *   `lib/show-archive.ts` y se ejecuta en `tests/unit/show-archive.test.ts`:
 *   la parte que decide qué se destruye no puede ser código que solo se lee.
 *
 * Uso:
 *   npx tsx scripts/purge-deleted-shows.ts              # dry-run
 *   npx tsx scripts/purge-deleted-shows.ts --days 30    # dry-run con otra ventana
 *   npx tsx scripts/purge-deleted-shows.ts --apply      # borra de verdad
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { deleteShow, getAllShows, isTursoEnabled } from "../lib/db";
import { selectPurgeable } from "../lib/show-archive";

const VENTANA_POR_DEFECTO = 90;

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const help = argv.includes("--help") || argv.includes("-h");
  let days = VENTANA_POR_DEFECTO;
  const i = argv.indexOf("--days");
  if (i !== -1) {
    const raw = argv[i + 1];
    const n = Number(raw);
    if (raw === undefined || !Number.isInteger(n) || n < 1) {
      throw new Error(`--days necesita un entero >= 1 (recibido: ${raw ?? "nada"})`);
    }
    days = n;
  }
  return { apply, help, days };
}

function help() {
  console.log(`
Purga de shows archivados (D5)

Uso:
  npx tsx scripts/purge-deleted-shows.ts [opciones]

Opciones:
  --days N    Ventana de gracia en días (default: ${VENTANA_POR_DEFECTO})
  --apply     Borrar de verdad (default: dry-run, no escribe nada)
  --help, -h  Esta ayuda

Qué borra: shows con \`deleted_at\` más antiguo que la ventana. Nada más.
Qué NO borra: shows activos, archivados recientes, y archivados con \`deleted_at\`
ilegible (no se sabe su edad, así que no se tocan).
`);
}

async function main() {
  let opts: ReturnType<typeof parseArgs>;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (opts.help) {
    help();
    return;
  }

  // Que se vea contra qué se está ejecutando. Un dry-run "verde" contra SQLite
  // local no dice nada de producción, y es la confusión más fácil de tener.
  console.log(`DB: ${isTursoEnabled() ? "Turso (remoto)" : "SQLite local"}`);

  const shows = await getAllShows();
  const { candidates, unreadable } = selectPurgeable(shows, { days: opts.days });
  const archivados = shows.filter((s) => !!s.deleted_at).length;

  console.log(
    `Archivados: ${archivados} · más antiguos que ${opts.days} días: ${candidates.length} · ` +
      `con fecha ilegible: ${unreadable.length}`,
  );

  if (unreadable.length > 0) {
    console.log("\n⚠️  Archivados con `deleted_at` ilegible (no se tocan):");
    for (const show of unreadable) {
      console.log(`   ${show.id}  deleted_at=${JSON.stringify(show.deleted_at)}`);
    }
  }

  if (candidates.length === 0) {
    console.log("\nNada que purgar.");
    return;
  }

  console.log("");
  for (const { show, days } of candidates) {
    console.log(`   ${show.id}  ${show.deleted_at}  (${days} días)  ${show.venue_name}`);
  }

  if (!opts.apply) {
    console.log(`\nDry-run: no se ha escrito nada. Para purgar de verdad: --apply`);
    return;
  }

  let borrados = 0;
  const fallos: string[] = [];
  for (const { show } of candidates) {
    try {
      if (await deleteShow(show.id)) borrados++;
      else fallos.push(`${show.id}: deleteShow devolvió false`);
    } catch (error) {
      fallos.push(`${show.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n✔ Purgados ${borrados} de ${candidates.length}.`);
  if (fallos.length > 0) {
    console.error(`✖ ${fallos.length} fallo(s):`);
    for (const fallo of fallos) console.error(`   ${fallo}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("✖ Error:", error);
  process.exit(1);
});
