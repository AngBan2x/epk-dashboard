import { NextResponse } from "next/server";
import { notifyArtistOwner } from "@/lib/subscriber-notifications";

const MAX_NOTIFY_SHOWS = 50;

interface PastShowRow {
  id: string;
  venue_name: string;
  date: string | null;
  artist_id: string;
}

async function notifyPastShows(rows: PastShowRow[]): Promise<number> {
  let notified = 0;
  const targets = rows.slice(0, MAX_NOTIFY_SHOWS);
  if (rows.length > targets.length) {
    console.warn(
      `[API/shows/cleanup] truncado: ${rows.length - targets.length} shows pasados sin notificar (límite ${MAX_NOTIFY_SHOWS})`
    );
  }

  for (const show of targets) {
    if (!show.artist_id) continue;
    const summary = await notifyArtistOwner({
      artistId: show.artist_id,
      title: "Tu show ya pasó",
      message: `Tu show "${show.venue_name}"${show.date ? ` del ${show.date}` : ""} ya pasó y fue archivado del calendario. Puedes revisarlo o crear uno nuevo desde tu dashboard.`,
      data: {
        show_id: show.id,
        showId: show.id,
        venue_name: show.venue_name,
        showVenue: show.venue_name,
        showDate: show.date,
        status: "pasado",
        dashboardUrl: "/dashboard",
      },
      emailType: "system",
      emailData: {
        showVenue: show.venue_name,
        showDate: show.date ?? undefined,
        dashboardUrl: "/dashboard",
        notificationTitle: "Tu show ya pasó",
        notificationMessage: `Tu show "${show.venue_name}"${show.date ? ` del ${show.date}` : ""} ya pasó y fue archivado del calendario.`,
      },
    });
    if (summary.notified > 0 || summary.emailsSent > 0) notified += 1;
  }

  return notified;
}

export async function DELETE() {
  try {
    const TURSO_URL = process.env.TURSO_DATABASE_URL;
    const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
    const USE_TURSO = Boolean(TURSO_URL && TURSO_TOKEN);

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 48);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    let deleted = 0;
    let affected: PastShowRow[] = [];

    if (USE_TURSO) {
      const { createClient } = await import("@libsql/client");
      const client = createClient({ url: TURSO_URL!, authToken: TURSO_TOKEN! });
      const rows = await client.execute({
        sql: "SELECT id, venue_name, date, artist_id FROM shows WHERE date < ?",
        args: [cutoffStr],
      });
      affected = (rows.rows as unknown as Record<string, unknown>[]).map((row) => ({
        id: String(row.id ?? ""),
        venue_name: String(row.venue_name ?? ""),
        date: row.date === null || row.date === undefined ? null : String(row.date),
        artist_id: String(row.artist_id ?? ""),
      }));
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
      const rows = db.prepare("SELECT id, venue_name, date, artist_id FROM shows WHERE date < ?").all(cutoffStr) as Record<string, unknown>[];
      affected = rows.map((row) => ({
        id: String(row.id ?? ""),
        venue_name: String(row.venue_name ?? ""),
        date: row.date === null || row.date === undefined ? null : String(row.date),
        artist_id: String(row.artist_id ?? ""),
      }));
      const result = db.prepare("DELETE FROM shows WHERE date < ?").run(cutoffStr);
      deleted = result.changes;
      db.close();
    }

    const artistsNotified = await notifyPastShows(affected);
    console.info(
      `[API/shows/cleanup] shows pasados=${affected.length} eliminados=${deleted} artistas_notificados=${artistsNotified} cutoff=${cutoffStr}`
    );

    return NextResponse.json({ deleted, cutoff: cutoffStr });
  } catch (error) {
    console.error("[API/shows/cleanup] Error:", error);
    return NextResponse.json({ error: "Error en cleanup" }, { status: 500 });
  }
}
