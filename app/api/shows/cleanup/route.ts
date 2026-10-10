import { NextRequest, NextResponse } from "next/server";
import type { Client } from "@libsql/client";
import { getLocalDbWrite, getTursoClientSync } from "@/lib/db";
import { notifyArtistOwner } from "@/lib/subscriber-notifications";
import { requireAdmin } from "@/lib/webhook-auth";
import {
  SHOW_CLEANUP_GRACE_HOURS,
  isShowPastCutoff,
  showCleanupCutoff,
  showStartInstant,
} from "@/lib/show-cleanup";

const MAX_NOTIFY_SHOWS = 50;

interface PastShowRow {
  id: string;
  venue_name: string;
  date: string | null;
  time: string | null;
  artist_id: string;
}

const SELECT_COLUMNS = "id, venue_name, date, time, artist_id";

/**
 * Avisa a los dueños de los shows borrados.
 *
 * **Best-effort por diseño** (mismo contrato que el buzón de sugerencias, P10):
 * se borra primero y se avisa después. Un 502 de Resend, una fila sin `user_id`
 * o un artista borrado no pueden convertirse en un 500 que esconda el resultado
 * del DELETE — el show ya no está, y quien mira el log tiene que ver eso, no un
 * error de correo.
 *
 * Por eso `notifyPastShows` no lanza: cada aviso va en su propio `try`, se
 * cuenta el fallo y se sigue con el siguiente.
 */
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
    const when = show.date ? `${show.date}${show.time ? ` ${show.time}` : ""}` : null;
    try {
      const summary = await notifyArtistOwner({
        artistId: show.artist_id,
        title: "Tu show ya pasó",
        message: `Tu show "${show.venue_name}"${when ? ` del ${when}` : ""} ya pasó y fue archivado del calendario. Puedes revisarlo o crear uno nuevo desde tu dashboard.`,
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
          showDate: when ?? undefined,
          dashboardUrl: "/dashboard",
          notificationTitle: "Tu show ya pasó",
          notificationMessage: `Tu show "${show.venue_name}"${when ? ` del ${when}` : ""} ya pasó y fue archivado del calendario.`,
        },
      });
      if (summary.notified > 0 || summary.emailsSent > 0) notified += 1;
    } catch (error) {
      // Ya se ha borrado la fila. Perder el aviso es un problema menor; perder
      // el DELETE —o su recuento— no lo es.
      console.error(
        `[API/shows/cleanup] aviso fallido para el show ${show.id} (${show.artist_id}), el show sigue borrado:`,
        error
      );
    }
  }

  return notified;
}

/** Normaliza una fila de `shows` a lo que necesitan el filtro y el aviso. */
function toPastShowRow(row: Record<string, unknown>): PastShowRow {
  return {
    id: String(row.id ?? ""),
    venue_name: String(row.venue_name ?? ""),
    date: row.date === null || row.date === undefined ? null : String(row.date),
    time: row.time === null || row.time === undefined ? null : String(row.time),
    artist_id: String(row.artist_id ?? ""),
  };
}

/** `IN (...)` con marcadores. `null` si no hay nada que borrar. */
function deleteByIds(ids: readonly string[]): { sql: string; args: string[] } | null {
  if (ids.length === 0) return null;
  return {
    sql: `DELETE FROM shows WHERE id IN (${ids.map(() => "?").join(", ")})`,
    args: [...ids],
  };
}

/**
 * Lectura y borrado, cada uno con el handle de su brazo.
 *
 * `getLocalDbWrite()` devuelve un **singleton** cacheado en `lib/db.ts`, igual
 * que en el resto de la aplicación: no se cierra al terminar. La versión
 * anterior abría su propia `new Database(...)` y hacía `db.close()`; con el
 * singleton, cerrar habría dejado el handle cacheado en cerrado y la segunda
 * llamada (el DELETE) habría fallado con "database connection is not open".
 */
async function readShows(client: Client | null): Promise<PastShowRow[]> {
  if (client) {
    const { rows } = await client.execute(`SELECT ${SELECT_COLUMNS} FROM shows`);
    return (rows as unknown as Record<string, unknown>[]).map(toPastShowRow);
  }
  return (
    getLocalDbWrite().prepare(`SELECT ${SELECT_COLUMNS} FROM shows`).all() as Record<string, unknown>[]
  ).map(toPastShowRow);
}

async function deleteShows(client: Client | null, ids: readonly string[]): Promise<number> {
  const del = deleteByIds(ids);
  if (!del) return 0;
  if (client) {
    const result = await client.execute({ sql: del.sql, args: del.args });
    return Number(result.rowsAffected);
  }
  return getLocalDbWrite().prepare(del.sql).run(...(del.args as never[])).changes;
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireAdmin(req);
    if (denied) return denied;

    // ── Backend y corte se deciden AQUÍ, no al importar ─────────────────────
    //
    // Este archivo no lee `process.env`: pregunta a `getTursoClientSync()`, que
    // es la **única** fuente de verdad sobre el backend y lee `process.env` en
    // tiempo de llamada (`lib/db.ts:173`). La versión anterior se montaba su
    // propia decisión con `Boolean(process.env.TURSO_DATABASE_URL && ...)` y
    // además abría su cliente con un `import("@libsql/client")` a mano: dos
    // predicados para lo mismo, que es exactamente el patrón (GAP-B) que RC.32
    // rompió y dejó rutas respondiendo 500 en producción. Y el handle local se
    // abre **solo** en el brazo sin cliente, nunca antes.
    const client = getTursoClientSync();
    const cutoff = showCleanupCutoff(new Date());

    const all = await readShows(client);

    // Sin fecha utilizable un show no puede estar "pasado": se cuenta aparte y se
    // deja vivo. Borrar una fila que no se puede fechar sería pérdida de datos
    // disfrazada de limpieza.
    const sinFecha = all.filter((s) => showStartInstant(s.date, s.time).kind !== "instant");
    for (const show of sinFecha) {
      console.warn(
        `[API/shows/cleanup] "${show.id}" no se borra: fecha ausente o ilegible ` +
          `(date=${JSON.stringify(show.date)})`
      );
    }

    const expired = all.filter((s) => isShowPastCutoff(s, cutoff));
    // Primero el DELETE, después el aviso: un fallo de Resend no puede llevarse
    // por delante el mensaje de un show que ya no está (ver `notifyPastShows`).
    const deleted = await deleteShows(client, expired.map((s) => s.id));
    const artistsNotified = await notifyPastShows(expired);

    console.info(
      `[API/shows/cleanup] ventana=${SHOW_CLEANUP_GRACE_HOURS}h ` +
        `pasados=${expired.length} eliminados=${deleted} sin_fecha=${sinFecha.length} ` +
        `artistas_notificados=${artistsNotified} cutoff=${cutoff.toISOString()}`
    );

    return NextResponse.json({
      deleted,
      cutoff: cutoff.toISOString(),
      graceHours: SHOW_CLEANUP_GRACE_HOURS,
      notified: artistsNotified,
      skippedSinFecha: sinFecha.length,
    });
  } catch (error) {
    console.error("[API/shows/cleanup] Error:", error);
    return NextResponse.json({ error: "Error en cleanup" }, { status: 500 });
  }
}