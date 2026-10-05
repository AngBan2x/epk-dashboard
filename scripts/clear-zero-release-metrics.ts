#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

/**
 * Pon a `NULL` las métricas que son un objeto de ceros de relleno.
 *
 * ## Qué es este objeto
 *
 * 74 filas de `tracks` (9 cabeceras de álbum + 65 hijas) llevan exactamente
 *
 *     {"streams":0,"saves":0,"playlist_additions":0,"top_countries":[]}
 *
 * No es una métrica curada: es el **relleno de una semilla**. Pero
 * `lib/metrics-source.ts` tiene una regla explícita —"el primero es el JSON
 * curado, y gana aunque valga 0: si alguien escribió `streams: 0` a propósito,
 * ese 0 es un dato, no una ausencia"— y el relleno se adueña de ese contrato.
 *
 * ## Consecuencia visible
 *
 * Las cabeceras de los 5 artistas influyentes salen con **0 reproducciones** y el
 * pie diciendo "métricas curadas del catálogo". No es un número pequeño: es un
 * número que afirma que nadie ha escuchado el álbum, con además la fuente
 * equivocada en el tooltip. Las 6 filas curadas de verdad (Queen, Nirvana,
 * The Weeknd, Eagles, Ed Sheeran, Kate Bush) tienen cifras reales y no se tocan.
 *
 * ## Por qué 74 filas y no 9
 *
 * `resolveAlbumMetrics` elige **una** fuente: la del padre si el padre tiene
 * alguna; si no, la primera de la cadena que tenga alguna hija. Con solo la
 * cabecera a NULL el álbum **seguiría mostrando 0**, porque las hijas también
 * traen el objeto de ceros y la fuente seguiría siendo "curado" con total 0.
 * Hay que vaciar el subárbol entero.
 *
 * ## Lo que este script NO puede predecir
 *
 * **El valor, y a veces hasta la fuente.** `youtubeViewCount` y
 * `lastfmPlaycount` no están en la base: los devuelve `/api/youtube/stats` y
 * `/api/lastfm` en tiempo de ejecución. Aquí solo se ven como
 * "hay `youtube_video_id`" o "no lo hay".
 *
 * Y eso obliga a leer el resumen con cuidado. La primera versión de este script
 * afirmaba que 4 de los 9 álbumes se quedarían en "sin dato" porque ninguna hija
 * tiene vídeo, y **estaba mal**: en producción los 4 salen con dato de **Last.fm**,
 * una fuente que el script no modelaba. La conclusión correcta era "sin dato **o**
 * una fuente que solo existe en ejecución", y la distinction importa porque
 * "— en la tarjeta" y "7.049.734 scrobbles" no son lo mismo.
 *
 * Lo único que este script sí asegura, porque es de la base, es el "antes": los 9
 * meager con 0 y fuente "curado".
 *
 * ## Dry-run por defecto
 *
 * Sin `--apply` no escribe nada. El `WHERE` del update es el objeto literal
 * exacto, así que ni por error puede tocar una fila curada de verdad.
 */
import { resolveAlbumMetrics, type MetricsCandidates } from "../lib/metrics-source";

const RELLENO = '{"streams":0,"saves":0,"playlist_additions":0,"top_countries":[]}';

const fmt = (v: number | null): string =>
  v === null ? "—" : new Intl.NumberFormat("es-ES").format(v);

interface Fila {
  id: string;
  artist_name: string;
  title: string;
  release_id: string | null;
  metrics: string | null;
  youtube_video_id: string | null;
}

/** Marcador de posición para YouTube: el valor real lo da la API, no la base. */
const SIN_NUMERO_YT = 0;

async function main() {
  const apply = process.argv.includes("--apply");
  const { getTursoClientSync } = await import("../lib/db");
  const client = getTursoClientSync();

  if (!client) {
    console.log("\n=== DRY-RUN abortado: Turso no configurado ===");
    console.log("No se escribe nada y no se puede predecir nada sin la base real.");
    return;
  }

  console.log(`\n=== ${apply ? "APPLY (escribe en Turso)" : "DRY-RUN (sin escrituras)"} ===`);

  const res = await client.execute({
    sql: `SELECT id, artist_name, title, release_id, metrics, youtube_video_id
          FROM tracks
          WHERE metrics = ?
          ORDER BY release_id IS NOT NULL, release_id, track_number`,
    args: [RELLENO],
  });
  const filas = (res.rows ?? []) as unknown as Fila[];
  const cabeceras = filas.filter((f) => f.release_id === null);
  const hijas = filas.filter((f) => f.release_id !== null);

  console.log(
    `\nFilas con el objeto de relleno: ${filas.length}  (${cabeceras.length} cabeceras + ${hijas.length} hijas)`
  );

  if (filas.length === 0) {
    console.log("No hay nada que hacer: ya está limpio.");
    return;
  }

  const hijosDe = new Map<string, Fila[]>();
  for (const h of hijas) {
    const lista = hijosDe.get(h.release_id as string) ?? [];
    lista.push(h);
    hijosDe.set(h.release_id as string, lista);
  }

  console.log("\n--- Cómo se ve cada álbum ------------------------------------------");
  console.log("   después = subárbol sin curado; solo queda YouTube como fuente posible.\n");

  let conYt = 0;
  for (const cab of cabeceras) {
    const hijos = hijosDe.get(cab.id) ?? [];

    const antes = resolveAlbumMetrics(
      { curated: JSON.parse(cab.metrics as string) },
      hijos.map((h) => ({
        curated: JSON.parse(h.metrics as string),
        youtubeViewCount: h.youtube_video_id ? SIN_NUMERO_YT : null,
      }))
    );

    const despues = resolveAlbumMetrics(
      { curated: null },
      hijos.map((h) => ({
        curated: null,
        youtubeViewCount: h.youtube_video_id ? SIN_NUMERO_YT : null,
      }))
    );

    if (despues.source !== "none") conYt += 1;
    const hijasConVideo = hijos.filter((h) => h.youtube_video_id).length;

    console.log(`${(cab.artist_name + " — " + cab.title).padEnd(40)} ${String(hijos.length).padStart(2)} hijas (${hijasConVideo} con vídeo)`);
    console.log(`   antes:  ${fmt(antes.value).padStart(10)}   fuente: ${antes.source}`);
    console.log(
      `   después: ${(despues.source === "none" ? "—" : "vistas de YouTube").padEnd(20)}   fuente: ${despues.source}`
    );
  }

  console.log("\n--- Resumen --------------------------------------------");
  console.log(
    `  ${conYt} álbumes tienen hijas con youtube_video_id: la fuente YouTube es posible.`
  );
  console.log(`  ${cabeceras.length - conYt} no lo tienen, y no se puede saber más aquí:`);
  console.log(`  o caen en "sin dato" (— en la tarjeta) o en **Last.fm**, que es una`);
  console.log("  fuente que solo existe en ejecución y este script no modela.");
  console.log("  Las 6 filas curadas de verdad (Queen, Nirvana, The Weeknd, Eagles,");
  console.log("  Ed Sheeran, Kate Bush) NO se tocan: el WHERE es el objeto exacto.");

  if (!apply) {
    console.log("\nDRY-RUN. No se ha escrito nada. Con --apply se ponen a NULL.");
    return;
  }

  const upd = await client.execute({
    sql: "UPDATE tracks SET metrics = NULL WHERE metrics = ?",
    args: [RELLENO],
  });
  console.log(`\nActualizadas ${upd.rowsAffected ?? "?"} filas.`);

  const check = await client.execute({
    sql: "SELECT COUNT(*) AS quedan FROM tracks WHERE metrics = ?",
    args: [RELLENO],
  });
  const quedan = Number((check.rows?.[0] as unknown as { quedan: number } | undefined)?.quedan ?? -1);
  console.log(
    `Verificación: quedan ${quedan} filas con el relleno.` + (quedan === 0 ? " OK" : " REVISAR")
  );
  if (quedan !== 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});