import { createClient } from "@libsql/client";
import fs from "node:fs";
import { parseDurationToSeconds, sumDurations } from "@/lib/null-safe";

function loadEnv() {
  const text = fs.readFileSync(".env.local", "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  loadEnv();
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const queries = [
    ["tracks", "SELECT COUNT(*) c FROM tracks"],
    ["shows", "SELECT COUNT(*) c FROM shows"],
    ["users", "SELECT COUNT(*) c FROM users"],
    ["track_submissions", "SELECT COUNT(*) c FROM track_submissions"],
    ["qa_tracks", "SELECT COUNT(*) c FROM tracks WHERE title LIKE 'QA %' OR id LIKE 'qa-%'"],
    ["qa_shows", "SELECT COUNT(*) c FROM shows WHERE venue_name LIKE 'QA %'"],
    ["qa_users", "SELECT COUNT(*) c FROM users WHERE email LIKE '%example.com'"],
    ["subscribers", "SELECT COUNT(*) c FROM users WHERE role='subscriber'"],
    ["artists", "SELECT COUNT(*) c FROM artists"],
    ["artists_sin_dueno", "SELECT COUNT(*) c FROM artists WHERE user_id IS NULL"],
  ];
  for (const [label, sql] of queries) {
    try {
      const r = await client.execute(sql);
      console.log(`${label}: ${r.rows[0].c}`);
    } catch (e) {
      console.log(`${label}: ERROR ${(e as Error).message.slice(0, 120)}`);
    }
  }

  // ------------------------------------------------------------------
  // Integridad del catálogo semilla (RC.31, P1 + P7 + P15). Las anteriores
  // cuentan filas; estas preguntan si el contenido es el correcto, que es lo
  // que los tres arreglos de esta ola cambian y lo que una re-siembra podría
  // volver a romper.
  // ------------------------------------------------------------------
  console.log("\n--- Integridad del catálogo semilla ---");
  const SEED_ARTISTS = [
    "Pink Floyd",
    "Radiohead",
    "Björk",
    "David Bowie",
    "Kraftwerk",
  ];
  const inList = SEED_ARTISTS.map(() => "?").join(", ");

  const seedQueries: Array<[string, string, boolean]> = [
    [
      "seed_padres",
      `SELECT COUNT(*) c FROM tracks WHERE release_id IS NULL AND artist_name IN (${inList})`,
      true,
    ],
    [
      "seed_hijas",
      `SELECT COUNT(*) c FROM tracks WHERE release_id IS NOT NULL AND artist_name IN (${inList})`,
      true,
    ],
    [
      "seed_huerfanas",
      `SELECT COUNT(*) c FROM tracks t WHERE t.release_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM tracks p WHERE p.id = t.release_id)`,
      false,
    ],
    // P15: los 9 padres quedaron con "00:00" hardcodeado.
    [
      "seed_padres_duracion_cero",
      `SELECT COUNT(*) c FROM tracks WHERE release_id IS NULL AND artist_name IN (${inList}) AND duration IN ('00:00','0:00','','—')`,
      true,
    ],
    // P7 erratas: la hija con la errata y las comillas literales en los títulos.
    ["seed_errata_ashe_to_ashes", `SELECT COUNT(*) c FROM tracks WHERE title = 'Ashe to Ashes'`, false],
    ["seed_titulos_con_comillas", `SELECT COUNT(*) c FROM tracks WHERE title LIKE '"%'`, false],
    // P7 flag: Vulnicura Strings es un álbum, no un EP (padre + 5 hijas).
    [
      "seed_vulnicura_como_EP",
      `SELECT COUNT(*) c FROM tracks
        WHERE (title = 'Vulnicura Strings' OR release_id IN (SELECT id FROM tracks WHERE title = 'Vulnicura Strings' AND release_id IS NULL))
          AND release_type = 'EP'`,
      false,
    ],
    // P1: cuántas portadas del seed siguen siendo las fotos genéricas de Unsplash.
    [
      "seed_portadas_itunes",
      `SELECT COUNT(*) c FROM tracks WHERE artist_name IN (${inList}) AND cover_image LIKE 'https://is%.mzstatic.com/%'`,
      true,
    ],
    [
      "seed_portadas_unsplash",
      `SELECT COUNT(*) c FROM tracks WHERE artist_name IN (${inList}) AND cover_image LIKE 'https://images.unsplash.com/%'`,
      true,
    ],
  ];

  for (const [label, sql, usesArgs] of seedQueries) {
    try {
      // El cliente de libSQL rechaza los args si la sentencia no tiene
      // marcadores: "Number of arguments mismatch: expected 0, got 5".
      const r = usesArgs
        ? await client.execute({ sql, args: SEED_ARTISTS })
        : await client.execute(sql);
      console.log(`${label}: ${r.rows[0].c}`);
    } catch (e) {
      console.log(`${label}: ERROR ${(e as Error).message.slice(0, 120)}`);
    }
  }

  // P15: la duración del padre tiene que ser la suma de las de sus hijas. Se
  // calcula en JS porque `duration` es "M:SS" y SQLite no parsea ese formato;
  // `sumDurations()` es el helper del contrato de RC.31.
  try {
    const { rows } = await client.execute({
      sql: `SELECT id, title, artist_name, release_id, duration,
                   disc_number, track_number, start_time, end_time
              FROM tracks WHERE artist_name IN (${inList})`,
      args: SEED_ARTISTS,
    });
    const all = rows as unknown as Array<{
      id: string;
      title: string;
      artist_name: string;
      release_id: string | null;
      duration: string;
    }>;
    const parents = all.filter((t) => t.release_id === null);
    const mismatches: string[] = [];
    for (const parent of parents) {
      const children = all.filter((t) => t.release_id === parent.id);
      const total = sumDurations(children.map((c) => c.duration));
      if (!total) {
        mismatches.push(`${parent.artist_name} — ${parent.title}: hijas sin duración`);
      } else if (total.label !== parent.duration) {
        mismatches.push(
          `${parent.artist_name} — ${parent.title}: padre "${parent.duration}" vs suma "${total.label}"`
        );
      }
    }
    console.log(`seed_padres_con_duracion_correcta: ${parents.length - mismatches.length}/${parents.length}`);
    for (const m of mismatches) console.log(`  ⚠️  ${m}`);

    // ------------------------------------------------------------------
    // RC.32 Tarea 3 — checks que LEEN LA BASE DE DATOS. El prefijo `db_` no es
    // decorativo: las consultas de arriba y las de `tests/unit/seed-integrity.test.ts`
    // leen el catálogo del propio FICHERO del seed, y por eso no detectaron nada
    // cuando el seed ya estaba corregido y las filas de Turso seguían con los
    // valores viejos. Estos dos leen lo que hay escrito.
    //
    // 1. `db_seed_timeline_desalineada`: `start_time`/`end_time` son SEGUNDOS
    //    enteros, y tienen que encadenar sin huecos ni solapamientos dentro de
    //    cada disco, con `end_time = start_time + duration`. La deriva viva era
    //    de +10 s en The Dark Side of the Moon (desde "Us and Them") y de +3 s en
    //    el final de Kid A.
    // 2. `db_seed_padres_duracion_vs_recorrido`: la duración declarada del padre
    //    (suma de las duraciones de sus hijas) contra el `end_time` de su última
    //    pista. Son dos cosas distintas y se contradecían: el padre decía
    //    "42:36" (2556 s) y el recorrido llegaba a 2566 s.
    // ------------------------------------------------------------------
    const timeline = rows as unknown as Array<{
      id: string;
      title: string;
      artist_name: string;
      release_id: string | null;
      duration: string;
      disc_number: number | null;
      track_number: number | null;
      start_time: number;
      end_time: number;
    }>;
    const seedChildren = timeline.filter((t) => t.release_id !== null);
    const desalineadas: string[] = [];
    const recorridoMismatches: string[] = [];
    const recorridoOmitidos: string[] = [];

    for (const parent of parents) {
      const children = seedChildren.filter((t) => t.release_id === parent.id);

      // Por disco, porque The Wall reinicia en 0 el segundo.
      const byDisc = new Map<number, typeof children>();
      for (const child of children) {
        const disc = Number(child.disc_number ?? 1);
        const bucket = byDisc.get(disc) ?? [];
        bucket.push(child);
        byDisc.set(disc, bucket);
      }
      const byDiscEnd = new Map<number, number>();
      for (const [disc, list] of byDisc) {
        const ordered = [...list].sort(
          (a, b) => (a.track_number ?? 9999) - (b.track_number ?? 9999) || a.start_time - b.start_time
        );
        let previousEnd = 0;
        for (const child of ordered) {
          const seconds = parseDurationToSeconds(child.duration);
          const expectedEnd = child.start_time + (seconds ?? 0);
          if (seconds == null) {
            desalineadas.push(
              `${parent.artist_name} — ${parent.title} d${disc} "${child.title}": duración "${child.duration}" no parseable`
            );
          } else if (expectedEnd !== child.end_time) {
            desalineadas.push(
              `${parent.artist_name} — ${parent.title} d${disc} "${child.title}": ${child.start_time} + ${seconds} = ${expectedEnd}, end_time es ${child.end_time}`
            );
          }
          if (child.start_time !== previousEnd) {
            desalineadas.push(
              `${parent.artist_name} — ${parent.title} d${disc} "${child.title}": hueco/solape de ${
                child.start_time - previousEnd
              } s con la anterior`
            );
          }
          previousEnd = child.end_time;
        }
        byDiscEnd.set(disc, previousEnd);
      }

      // El padre contra el RECORRIDO, solo donde el recorrido SIGNIFICA algo: un
      // release de un solo disco, que va de 0 a su `end_time` final. En The Wall
      // (2 discos que reinician en 0) el recorrido de un disco son 1941 s y el
      // padre dice 61:06 = 3666 s, que es la SUMA de los dos discos, no un
      // recorrido: ahí la comparación no aplica y no se reporta como fallo.
      if (byDisc.size === 1) {
        const onlyDisc = [...byDisc.keys()][0];
        const recorrido = byDiscEnd.get(onlyDisc) ?? 0;
        const declared = parseDurationToSeconds(parent.duration);
        if (declared == null) {
          recorridoMismatches.push(
            `${parent.artist_name} — ${parent.title}: duración padre "${parent.duration}" no parseable`
          );
        } else if (recorrido > 0 && recorrido !== declared) {
          recorridoMismatches.push(
            `${parent.artist_name} — ${parent.title}: padre "${parent.duration}" (${declared} s) vs recorrido ${recorrido} s`
          );
        }
      } else {
        recorridoOmitidos.push(
          `${parent.artist_name} — ${parent.title}: ${byDisc.size} discos (el padre es la suma de los discos, no un recorrido)`
        );
      }
    }

    console.log(`db_seed_timeline_desalineada: ${desalineadas.length}`);
    for (const d of desalineadas) console.log(`  ⚠️  ${d}`);
    console.log(`db_seed_padres_duracion_vs_recorrido: ${recorridoMismatches.length}`);
    for (const m of recorridoMismatches) console.log(`  ⚠️  ${m}`);
    for (const o of recorridoOmitidos) console.log(`  –  ${o}`);
  } catch (e) {
    console.log(`seed_padres_con_duracion_correcta: ERROR ${(e as Error).message.slice(0, 120)}`);
  }

  // ── Buzón de sugerencias (P4) ──────────────────────────────────────────
  // El interés de este check no es el recuento: es el segundo. El buzón tiene
  // cinco capas de anti-spam y la cuarta es "1 por correo cada 24 h". Si en
  // producción hay dos sugerencias del mismo correo en 24 h, significa que esa
  // capa no está funcionando en Turso aunque los tests digamos que pasa — y los
  // tests corren contra SQLite, no contra Turso.
  //
  // `ip_hash` es un HMAC con SESSION_SECRET, así que aquí solo se comprueba que
  // existe. Nunca se imprimen correos ni mensajes: son PII de quien escribió el
  // formulario.
  try {
    const porEstado = await client.execute(
      `SELECT status, COUNT(*) c FROM suggestions GROUP BY status ORDER BY status`
    );
    console.log("\nsuggestions_por_estado:");
    if (porEstado.rows.length === 0) console.log("  (ninguna)");
    for (const r of porEstado.rows) {
      console.log(`  ${(r.status as string).padEnd(9)} ${r.c}`);
    }

    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { rows: dup } = await client.execute(
      `SELECT COUNT(*) c FROM (
         SELECT email FROM suggestions
         WHERE created_at > ?
         GROUP BY email HAVING COUNT(*) > 1
       )`,
      [hace24h]
    );
    const duplicados = Number(dup[0]?.c ?? 0);
    console.log(`suggestions_email_duplicado_en_24h: ${duplicados}`);
    if (duplicados > 0) {
      console.log("  ⚠️  la capa 4 del anti-spam NO está conteniendo en Turso");
    }

    const { rows: sinHash } = await client.execute(
      `SELECT COUNT(*) c FROM suggestions WHERE ip_hash IS NULL`
    );
    console.log(`suggestions_sin_ip_hash: ${Number(sinHash[0]?.c ?? 0)}`);
  } catch (e) {
    // La tabla se crea la primera vez que `ensureTursoSchema()` corre contra
    // Turso. Antes de ese momento este check no puede existir.
    console.log(
      `suggestions: no disponible (${(e as Error).message.slice(0, 80)}) — ¿migración aplicada?`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

