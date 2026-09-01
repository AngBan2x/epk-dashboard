import { NextResponse } from "next/server";

export async function DELETE() {
  try {
    const TURSO_URL = process.env.TURSO_DATABASE_URL;
    const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
    const USE_TURSO = Boolean(TURSO_URL && TURSO_TOKEN);

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 48);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    let deleted = 0;

    if (USE_TURSO) {
      const { createClient } = await import("@libsql/client");
      const client = createClient({ url: TURSO_URL!, authToken: TURSO_TOKEN! });
      const result = await client.execute({
        sql: "DELETE FROM shows WHERE date < ?",
        args: [cutoffStr],
      });
      deleted = Number(result.rowsAffected);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require("better-sqlite3") as typeof import("better-sqlite3");
      const path = await import("path");
      const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");
      const db = new Database(DB_PATH);
      const result = db.prepare("DELETE FROM shows WHERE date < ?").run(cutoffStr);
      deleted = result.changes;
      db.close();
    }

    return NextResponse.json({ deleted, cutoff: cutoffStr });
  } catch (error) {
    console.error("[API/shows/cleanup] Error:", error);
    return NextResponse.json({ error: "Error en cleanup" }, { status: 500 });
  }
}
