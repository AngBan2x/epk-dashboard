/**
 * P21.5 · script de danger: escribe en Turso.
 * Dry-run por defecto; --apply obligatorio para escribir.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// P21.5: dry-run por defecto, --apply obligatorio
const APPLY = process.argv.includes("--apply");
if (!APPLY) {
  console.log("🔍 Dry-run: no se escribe nada. Usa --apply para ejecutar.");
  process.exit(0);
}

import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function cleanup() {
  console.log("Connecting to Turso...");

  // Find test artists
  const result = await client.execute({
    sql: "SELECT id, name FROM artists WHERE name LIKE '%Test%' OR name LIKE '%Login%'",
    args: [],
  });

  console.log("Test artists found:", result.rows.length);

  for (const row of result.rows) {
    const artistId = row.id as string;
    const name = row.name as string;

    // Delete shows
    await client.execute({ sql: "DELETE FROM shows WHERE artist_id = ?", args: [artistId] });
    // Delete artist
    await client.execute({ sql: "DELETE FROM artists WHERE id = ?", args: [artistId] });

    console.log(`Deleted: ${name} (${artistId})`);
  }

  // Verify
  const remaining = await client.execute("SELECT id, name FROM artists ORDER BY name");
  console.log("\nRemaining artists:", remaining.rows.length);
  for (const row of remaining.rows) {
    console.log(`  - ${row.name}`);
  }
}

cleanup().catch(console.error);
