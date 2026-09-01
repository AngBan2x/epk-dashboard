import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { getTursoClient } = await import("../lib/turso");
  const client = getTursoClient();
  if (!client) {
    console.log("Turso not configured");
    return;
  }
  
  const result = await client.execute("SELECT id, name, email, role FROM users");
  console.log("Users in Turso:", JSON.stringify(result.rows, null, 2));
}

main();
