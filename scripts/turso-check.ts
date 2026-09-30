import { createClient } from "@libsql/client";
import fs from "node:fs";
import { sumDurations } from "@/lib/null-safe";

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
      sql: `SELECT id, title, artist_name, release_id, duration
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
  } catch (e) {
    console.log(`seed_padres_con_duracion_correcta: ERROR ${(e as Error).message.slice(0, 120)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
