/**
 * `POST /api/sync` — DESHABILITADO. Responde 410 Gone SIEMPRE. No lo reabras
 * sin leer el diagnóstico completo de abajo.
 *
 * ── Por qué ──────────────────────────────────────────────────────────────────
 * Antes de que este endpoint existiera, Turso es la base de datos de producción y
 * `lib/db.ts` escribe directamente contra ella. El endpoint no sincroniza nada
 * útil: es una vía para machacar el catálogo aprobado con el estado de una copia
 * local, y no tiene dry-run, ni backup, ni confirmación.
 *
 * Concretamente, la ruta antigua hacía dos cosas destructivas:
 *
 * 1. `syncLocalToTurso` (`lib/turso.ts:316-371`) escribe con
 *    `INSERT OR REPLACE INTO tracks` sobre 24 columnas. SQLite/Turso lo
 *    implementa como DELETE + INSERT, así que **toda columna que no esté en la
 *    lista vuelve a su DEFAULT/NULL**. La lista omite 8:
 *      - `release_id`   (:85) → NULL deja **huérfanas las 65 pistas hijas** de
 *        los releases multipista: `getTracksByReleaseId` ya no encuentra nada.
 *      - `start_time` (:86) y `end_time` (:87) → 0, se pierde la posición dentro
 *        del disco y el reparto de la cola de reproducción.
 *      - `track_number` (:100) → NULL, se pierde la numeración explícita por disco.
 *      - `genre` (:102) y `description` (:103) → NULL.
 *      - `admin_notes` (:104) → NULL, **se borra el audit trail de aprobación de
 *        P4.5** (la columna entera, no un campo).
 *      - `updated_at` → NULL.
 * 2. El mapeo de la ruta (líneas 27-41 de la versión anterior) copiaba 13 campos
 *    y **no incluía `status`**. Entonces el `(track as …).status ?? 'draft'` de
 *    `lib/turso.ts:360` evaluaba `'draft'` para las 83 filas, todas en
 *    `approved`. O sea: ejecutar el endpoint **revierte el catálogo aprobado
 *    entero a `draft`, es decir, lo despublica**.
 *
 * El resultado combinado no era un bug parcial: era perder a la vez la
 * estructura multipista, la auditoría y la publicación.
 *
 * ── Qué hacer en su lugar ────────────────────────────────────────────────────
 * - Para auditar el estado real de Turso: `npx tsx scripts/turso-check.ts`
 *   (solo lectura, es la fuente de verdad).
 * - Para escribir: las funciones de `lib/db.ts`. La app ya escribe contra Turso
 *   en cada petición; no hace falta "sincronizar" nada.
 * - Para una reparación puntual de datos: un `scripts/*` con dry-run por defecto
 *   y backup antes de escribir, nunca una route handler. Ese equivalente seguro
 *   NO se ha escrito aquí a propósito: tocaría `lib/turso.ts`, que en esta misma
 *   ola cambia su detección de env, y mezclar las dos cosas impediría saber
 *   cuál de las dos rompe algo.
 */

import { NextRequest, NextResponse } from "next/server";
import { syncLocalToTurso, ensureTursoSchema, getTursoClient } from "@/lib/turso";
import { getAllTracks } from "@/lib/db";
import { requireAdmin } from "@/lib/webhook-auth";

/** Payload único de la respuesta. El test `tests/unit/sync-endpoint-disabled.test.ts`
 *  lo comprueba, así que no lo reescribas sin actualizar también el test. */
function gone() {
  return NextResponse.json(
    {
      error: "ENDPOINT_DESHABILITADO",
      status: "gone",
      message:
        "POST /api/sync está deshabilitado permanentemente (410). Ejecutarlo revertía el catálogo aprobado a 'draft' y borraba el audit trail de admin_notes.",
      why: [
        "syncLocalToTurso() hace INSERT OR REPLACE sobre 24 columnas y omite 8: release_id, start_time, end_time, track_number, genre, description, admin_notes y updated_at.",
        "INSERT OR REPLACE borra y reinserta: lo omitido vuelve a DEFAULT/NULL. release_id → NULL deja huérfanas las 65 pistas hijas de los releases multipista.",
        "admin_notes → NULL borra el audit trail de aprobación de P4.5.",
        "El mapeo de la ruta no copiaba 'status', así que el ?? 'draft' de lib/turso.ts:360 aplicaba a las 83 filas: el catálogo entero volvía a draft, es decir, se despublicaba.",
        "No había dry-run, ni backup, ni confirmación.",
      ],
      useInstead: [
        "npx tsx scripts/turso-check.ts — auditoría de solo lectura del estado real de Turso.",
        "Las funciones de lib/db.ts — la app ya escribe contra Turso en cada petición.",
        "Para reparaciones puntuales: un scripts/* con dry-run por defecto y backup antes de escribir, nunca una route handler.",
      ],
    },
    { status: 410 }
  );
}

export async function POST(_request: NextRequest) {
  // El 410 va ANTES de `requireAdmin` a propósito, no por descuido.
  //
  // Si el auth se comprobara primero, un POST sin sesión devolvería 401 y el
  // test de protección pasaría igual que con el endpoint abierto: 401 y 410
  // bloquean los dos. Con el 410 primero, la única respuesta posible de este
  // handler es "no existe", y reabrir el endpoint rompe el test de forma
  // ruidosa en vez de pasar en verde por casualidad.
  return gone();
}

export async function GET() {
  // Un GET que anunciara un POST funcional sería la misma trampa, solo que por
  // documentación. También 410.
  return gone();
}

// ─────────────────────────────────────────────────────────────────────────────
// CUERPO MUERTO — implementation anterior, conservada a propósito.
//
// Está aquí sin llamar, sin exportar y sin ninguna ruta que lo alcance, para que
// la decisión sea reversible: si algún día se quiere reimplementar la
// sincronización, el punto de partida y —sobre todo— la lista de lo que faltaba
// están escritos arriba y aquí.
//
// NO lo conectes. Si hay que mover datos, se escribe un `scripts/*` con dry-run y
// backup; eso no es este fichero.
// ─────────────────────────────────────────────────────────────────────────────
async function legacySyncImplementation(request: NextRequest) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    // OJO: esta era la comprobación rota. `isTursoConfigured` de `@/lib/turso`
    // leía un snapshot del `process.env` capturado al importar el módulo, así
    // que podía decir "true" mientras `getTursoClient()` devolvía `null` (el
    // env llega después del import en un bundle de Vercel) y la ruta respondía
    // 500. Ya no existe: usa `getTursoClient() !== null` directamente.
    const client = getTursoClient();
    if (!client) {
      return NextResponse.json(
        { status: "error", message: "Turso no configurado. Configure TURSO_DATABASE_URL y TURSO_AUTH_TOKEN." },
        { status: 503 }
      );
    }

    const schemaReady = await ensureTursoSchema();
    if (!schemaReady) {
      return NextResponse.json(
        { status: "error", message: "Error creando esquema en Turso" },
        { status: 500 }
      );
    }

    const tracks = await getAllTracks();
    const localTracks = tracks.map((track) => ({
      // 13 campos. Ninguno de ellos es `status`, `release_id`, `start_time`,
      // `end_time`, `track_number`, `genre`, `description` ni `admin_notes`.
      id: track.id,
      title: track.title,
      artist_name: track.artist_name,
      release_type: track.release_type,
      release_date: track.release_date,
      duration: track.duration,
      cover_image: track.cover_image,
      audio_preview_url: track.audio_preview_url,
      spotify_url: track.spotify_url,
      youtube_video_id: track.youtube_video_id,
      metrics: JSON.stringify(track.metrics),
      production_details: JSON.stringify(track.production_details),
      lyrics: track.lyrics,
    }));

    const result = await syncLocalToTurso(localTracks);

    return NextResponse.json({
      status: "ok",
      message: `Sincronización completada: ${result.synced} tracks sincronizados, ${result.failed} fallidos`,
      synced: result.synced,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Error en sync:", error);
    return NextResponse.json(
      { status: "error", message: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// Referencias explícitas a los símbolos del cuerpo muerto, para que ni el
// typechecker ni un linter decidan que el código conservado es basura
// eliminable. Si alguien borra esto, se lleva por delante el aviso.
void legacySyncImplementation;
void requireAdmin;