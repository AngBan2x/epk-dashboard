/**
 * Imprime un `--album <id>` y un `--single <id>` válidos para el barrido de
 * `rc30-track-regression.ts`.
 *
 * Lee de Turso con SQL directo porque las lecturas HTTP no sirven: el catálogo
 * JSON no incluye `release_id`, el HTML tampoco lo enlaza, y `/api/artists` en
 * local sirve la réplica SQLite (7 artistas) en lugar de Turso (12), así que sus
 * ids son otros. La fuente de verdad son las consultas SQL, como manda AGENTS.md.
 *
 * Uso: npx tsx scripts/rc30-ids.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { tursoExec } from "../lib/db";

(async () => {
  const parent = (await tursoExec(
    `SELECT id, title FROM tracks
      WHERE release_id IS NULL AND status = 'approved'
        AND EXISTS (SELECT 1 FROM tracks c WHERE c.release_id = tracks.id AND c.status = 'approved')
      ORDER BY title LIMIT 1`,
    []
  )) as { id: string; title: string }[];
  const child = (await tursoExec(
    `SELECT id, title FROM tracks
      WHERE release_id IS NULL AND status = 'approved'
        AND NOT EXISTS (SELECT 1 FROM tracks c WHERE c.release_id = tracks.id)
      ORDER BY title LIMIT 1`,
    []
  )) as { id: string; title: string }[];

  if (!parent.length || !child.length) {
    console.error("No hay album ni pista suelta en Turso.");
    process.exit(1);
  }

  console.error(`album:   ${parent[0].title} (${parent[0].title})`.replace(`(${parent[0].title})`, ""));
  console.log(`--album ${parent[0].id} --single ${child[0].id}`);
  console.error(`suelta:  ${child[0].title}`);
})();
