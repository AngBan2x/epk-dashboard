import dotenv from "dotenv";

// `tsx` no carga `.env.local` solo: es Next quien lo hace en dev/build. Sin esto
// `getTursoClient()` devuelve `null` y el script dice "no hay nada que migrar",
// que es una mentira util: el script no escribe nada porque no habia donde.
dotenv.config({ path: ".env.local" });

import { getTursoClient } from "@/lib/turso";

/**
 * RC.33 - aplicar en Turso las migraciones que el codigo ya declara.
 *
 * `lib/turso.ts:144` ya hace `ALTER TABLE tracks ADD COLUMN video_kind TEXT`
 * dentro del bloque de migraciones, pero ese bloque solo corre cuando algo lo
 * invoca. Los scripts de ingesta lo detectan con `PRAGMA table_info` y avisan en
 * vez de morir, asi que `scripts/fetch-official-videos.ts --apply` escribio los
 * `youtube_video_id` y dejo `video_kind` sin columna.
 *
 * Idempotente: si la columna ya existe, el ALTER falla y se ignora.
 */
async function main() {
  const client = getTursoClient();
  if (!client) {
    console.log("Sin Turso configurado: no hay nada que migrar.");
    return;
  }

  const info = await client.execute("PRAGMA table_info(tracks)");
  const columnas = new Set(info.rows.map((r) => String(r.name)));
  console.log(`tracks tiene ${columnas.size} columnas`);

  const faltan = ["video_kind"].filter((c) => !columnas.has(c));
  if (faltan.length === 0) {
    console.log("video_kind ya existe. Nada que hacer.");
    return;
  }

  for (const col of faltan) {
    await client.execute(`ALTER TABLE tracks ADD COLUMN ${col} TEXT`);
    console.log(`+ tracks.${col} añadida`);
  }

  const check = await client.execute("PRAGMA table_info(tracks)");
  console.log(`Ahora tracks tiene ${check.rows.length} columnas`);
}

main().catch((err) => {
  console.error("Fallo la migracion:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});