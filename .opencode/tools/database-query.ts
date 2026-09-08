import { tool } from "@opencode-ai/plugin";
import Database from "better-sqlite3";
import path from "path";

export default tool({
  description: "Ejecutar query SELECT contra la base de datos SQLite local",
  args: {
    query: tool.schema.string().describe("Query SQL SELECT a ejecutar"),
  },
  async execute(args, context) {
    const dbPath = path.join(context.worktree, "data", "music_catalog.db");
    try {
      const db = new Database(dbPath, { readonly: true });
      const rows = db.prepare(args.query).all();
      db.close();
      return JSON.stringify(rows, null, 2);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
