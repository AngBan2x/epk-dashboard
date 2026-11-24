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
 * se archiva primero y se avisa después. Un 502 de Resend, una fila sin `user_id`
 * o un artista borrado no pueden convertirse en un 500 que esconda el resultado
 * del UPDATE — el show ya está archivado, y quien mira el log tiene que ver eso,
 * no un error de correo.
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
      // Ya se ha archivado la fila. Perder el aviso es un problema menor; perder
      // el UPDATE —o su recuento— no lo es.
      console.error(
        `[API/shows/cleanup] aviso fallido para el show ${show.id} (${show.artist_id}), el show sigue archivado:`,
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

/**
 * `UPDATE ... SET deleted_at` — **D5: los shows se marcan, no se borran.**
 *
 * Hasta P21 esto era un `DELETE FROM shows`, y el cron de `cleanup-shows.yml` lo
 * ejecutaba a diario: un show pasado desaparecía para siempre. Pero `shows` tiene
 * `deleted_at` desde el principio y **todos** los lectores públicos y del artista
 * ya filtran `deleted_at IS NULL` (`lib/db.ts:2206`, `:2271`, `:2284`, `:2319`),
 * así que marcar la fila consigue exactamente el mismo efecto visible sin perder
 * el historial: se puede recuperar y el script de purga es el único que borra de
 * verdad.
 *
 * El `updated_at` se toca a la vez a propósito: es el mismo criterio que usa
 * cualquier `UPDATE` de `lib/db.ts`, y así queda una traza de cuándo se archivó,
 * aparte de `deleted_at`.
 *
 * `AND deleted_at IS NULL` es idempotencia: una fila ya archivada no vuelve a
 * contar en `rowsAffected` ni se re-notifica.
 *
 * La marca va como parámetro y no como `datetime('now')` porque ese formato
 * (`YYYY-MM-DD HH:MM:SS`) no es comparable como cadena con el ISO que escribe el
 * resto del esquema (`...T...Z`): una purga que comparase `deleted_at < cutoff`
 * ordenaría mal **todas** las filas, no algunas.
 */
function archiveByIds(
  ids: readonly string[],
  nowIso: string
): { sql: string; args: string[] } | null {
  if (ids.length === 0) return null;
  return {
    sql:
      `UPDATE shows SET deleted_at = ?, updated_at = ? ` +
      `WHERE id IN (${ids.map(() => "?").join(", ")}) AND deleted_at IS NULL`,
    // Los dos primeros son los timestamps; los ids vienen después.
    args: [nowIso, nowIso, ...ids],
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
  // `deleted_at IS NULL` no es cosmético: sin él, un show archivado ayer sigue
  // casando con el filtro de "pasado" mañana y se volvería a notificar todos los
  // días. Marcar en vez de borrar convierte ese olvido en un bucle de correos.
  if (client) {
    const { rows } = await client.execute(
      `SELECT ${SELECT_COLUMNS} FROM shows WHERE deleted_at IS NULL`
    );
    return (rows as unknown as Record<string, unknown>[]).map(toPastShowRow);
  }
  return (
    getLocalDbWrite()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM shows WHERE deleted_at IS NULL`)
      .all() as Record<string, unknown>[]
  ).map(toPastShowRow);
}

async function archiveShows(
  client: Client | null,
  ids: readonly string[],
  nowIso: string
): Promise<number> {
  const upd = archiveByIds(ids, nowIso);
  if (!upd) return 0;
  if (client) {
    const result = await client.execute({ sql: upd.sql, args: upd.args });
    return Number(result.rowsAffected);
  }
  return getLocalDbWrite().prepare(upd.sql).run(...(upd.args as never[])).changes;
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
    // deja vivo. Archivar una fila que no se puede fechar sería pérdida de datos
    // disfrazada de limpieza.
    const sinFecha = all.filter((s) => showStartInstant(s.date, s.time).kind !== "instant");
    for (const show of sinFecha) {
      console.warn(
        `[API/shows/cleanup] "${show.id}" no se archiva: fecha ausente o ilegible ` +
          `(date=${JSON.stringify(show.date)})`
      );
    }

    const expired = all.filter((s) => isShowPastCutoff(s, cutoff));
    // Primero el UPDATE, después el aviso: un fallo de Resend no puede llevarse
    // por delante el mensaje de un show que ya está archivado (ver
    // `notifyPastShows`).
    const archived = await archiveShows(client, expired.map((s) => s.id), new Date().toISOString());
    const artistsNotified = await notifyPastShows(expired);

    console.info(
      `[API/shows/cleanup] ventana=${SHOW_CLEANUP_GRACE_HOURS}h ` +
        `pasados=${expired.length} archivados=${archived} sin_fecha=${sinFecha.length} ` +
        `artistas_notificados=${artistsNotified} cutoff=${cutoff.toISOString()}`
    );

    return NextResponse.json({
      // `archived`, no `deleted`: la ruta ya no borra (D5). El nombre del campo
      // es lo que impide que alguien lea la respuesta y crea que la fila no
      // existe, cuando en realidad está marcada y se puede recuperar.
      archived,
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