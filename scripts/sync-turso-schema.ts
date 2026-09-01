import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Dynamic import after env is loaded
async function main() {
  const { ensureTursoSchema } = await import("../lib/turso");
  try {
    const result = await ensureTursoSchema();
    console.log("Turso schema sync result:", result);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
