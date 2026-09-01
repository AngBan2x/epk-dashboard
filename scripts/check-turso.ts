import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { getTursoClient } = await import("../lib/turso");
  const client = getTursoClient();
  if (!client) {
    console.log("Turso not configured");
    return;
  }
  
  const result = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
  console.log("Tables in Turso:", result.rows.map(r => r.name));
}

main();
