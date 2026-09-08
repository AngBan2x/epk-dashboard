import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Poblar la base de datos con datos de prueba (artists, tracks, users)",
  args: {
    table: tool.schema.string().optional().describe("Tabla específica a poblar (users, artists, tracks) o vacío para todas"),
  },
  async execute(args) {
    const { execSync } = await import("child_process");
    try {
      if (args.table) {
        const output = execSync(`npx tsx scripts/seed-${args.table}.ts 2>&1`, {
          encoding: "utf-8",
          timeout: 30000,
        });
        return `✅ Seed ${args.table}:\n${output}`;
      }
      const output = execSync("npx tsx scripts/seed-all.ts 2>&1", {
        encoding: "utf-8",
        timeout: 30000,
      });
      return `✅ Seed completo:\n${output}`;
    } catch (error: any) {
      return `❌ Seed error:\n${error.stdout || error.message}`;
    }
  },
});
