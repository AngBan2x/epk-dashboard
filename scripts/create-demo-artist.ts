#!/usr/bin/env tsx
/**
 * P13 — Cuenta de demostracion para las capturas publicas.
 *
 * ## Por que existe esto
 *
 * `scripts/capture-social.ts` captura `/dashboard` **con sesion**, porque es la
 * unica de las cinco rutas que no existe sin ella. Capturada con la cuenta real
 * de artista, la imagen sale con su nombre, su correo y sus notificaciones
 * contadas — y esas imagenes van a `public/pressplay/`, que se sirve sin
 * autenticacion y esta pensado para publicarse en redes.
 *
 * Las otras cuatro rutas se capturan sin sesion justamente por eso: la primera
 * version de la landing salio con el nombre de una persona real.
 *
 * Asi que el problema no era "por que hay una captura autenticada", sino "de
 * quien". La respuesta es: de nadie. De un perfil inventado.
 *
 * ## Por que los datos son obviamente falsos
 *
 * No es por estilo. Es porque una captura con datos realistas acaba siendo
 * indistinguible de una captura real en cuanto sale del repositorio, y alguien
 * que la encuentre en un issue no tiene forma de saber que es de prueba. "Demo
 * Artist" con "Sala de Ensayo 3" se reconoce a la primera; "Nina Vega" con
 * "Sala Beatriz" no.
 *
 * ## Idempotencia
 *
 * Los IDs llevan el prefijo `demo-`, y los INSERT son `INSERT OR REPLACE`. Se
 * puede ejecutar tantas veces como haga falta sin duplicar nada.
 *
 * El prefijo no es decorativo: es lo que permite que `scripts/qa-cleanup.ts` y
 * una query manual localicen y borren esto sin tocar nada mas. `scripts/
 * turso-check.ts` tiene checks de huerfanos, y una cuenta de demostracion que se
 * queda ahi para siempre es justo el tipo de fila que hace que ese check deje de
 * servir para detectar problemas reales.
 *
 * ## Dry-run por defecto
 *
 *Igual que `scripts/qa-cleanup.ts`. Esto escribe en **Turso, que es produccion**,
 * y lo que crea sale en `/artists/<id>` sin autenticacion. Que sea reversible no
 * significa que haya que hacerlo sin querer.
 *
 *   npx tsx scripts/create-demo-artist.ts           # dry-run (default)
 *   npx tsx scripts/create-demo-artist.ts --apply   # escribe
 */

import { config } from "dotenv";

// El modulo que LEE el entorno lo CARGA: en ES modules los imports se evaluan
// antes que el cuerpo del modulo, asi que un `config()` en el consumidor corre
// DESPUES de que `lib/db` ya haya leido un `process.env` vacio. Ver
// `scripts/lib/credentials.ts` para el caso largo.
config({ path: ".env.local" });

import { missingDemoCredentialEnvVars, DEMO_ARTIST_EMAIL, DEMO_ARTIST_PASSWORD } from "./lib/credentials";

export const PREFIJO_DEMO = "demo-";

export const DEMO_ID = `${PREFIJO_DEMO}artista-001`;
export const DEMO_USER_ID = `${PREFIJO_DEMO}user-001`;

/** Catalogo inventado. Ver la nota del encabezado sobre por que es obvio. */
export interface ShowDemo {
  readonly id: string;
  readonly venue: string;
  readonly city: string;
  readonly date: string;
  readonly status: string;
}

export const SHOWS_DEMO: readonly ShowDemo[] = [
  {
    id: `${PREFIJO_DEMO}show-001`,
    venue: "Sala de Ensayo 3",
    city: "Madrid",
    date: "2026-11-14T20:30:00.000Z",
    status: "disponible",
  },
  {
    id: `${PREFIJO_DEMO}show-002`,
    venue: "Sala Sin Nombre",
    city: "Barcelona",
    date: "2026-12-05T21:00:00.000Z",
    status: "disponible",
  },
  {
    id: `${PREFIJO_DEMO}show-003`,
    venue: "Local de Ensayo Provisional",
    city: "Valencia",
    date: "2027-01-17T20:00:00.000Z",
    status: "disponible",
  },
];

function credencialesDemo(): { email: string; password: string } {
  const faltan = missingDemoCredentialEnvVars();
  if (faltan.length > 0) {
    throw new Error(
      `Faltan variables para la cuenta de demostracion: ${faltan.join(", ")}.\n` +
        `  Es la contrasena de una cuenta INVENTADA, pero no lleva default: si tuviera\n` +
        `  uno, estaria en el repositorio, y un default con un secreto es exactamente\n` +
        `  lo que este mismo modulo lleva tres reglas Y un test intentando que no ocurra.`
    );
  }
  return { email: DEMO_ARTIST_EMAIL, password: DEMO_ARTIST_PASSWORD };
}

async function main() {
  const aplicar = process.argv.includes("--apply");

  const credenciales = credencialesDemo();
  const bcrypt = await import("bcryptjs").then((m) => (m.default ?? m));
  const crypto = await import("crypto");

  const passwordHash = await (bcrypt as unknown as { hash: (s: string, r: number) => Promise<string> }).hash(
    credenciales.password,
    10
  );
  const ahora = new Date().toISOString();

  console.log(`Cuenta de demostracion ${aplicar ? "APLICADO" : "(dry-run)"}`);
  console.log("");
  console.log(`  usuario : ${DEMO_USER_ID}`);
  console.log(`  artista : ${DEMO_ID}   nombre: "Demo Artist"`);
  console.log(`  correo  : ${credenciales.email}`);
  console.log(`  shows   : ${SHOWS_DEMO.length} (${SHOWS_DEMO.map((s) => s.id).join(", ")})`);
  console.log("");
  console.log("  Todo lleva prefijo `demo-`. Para borrarlo:");
  console.log("    DELETE FROM shows        WHERE id LIKE 'demo-%'");
  console.log("    DELETE FROM artists      WHERE id LIKE 'demo-%'");
  console.log("    DELETE FROM users        WHERE id LIKE 'demo-%'");
  console.log("");
  console.log("  Nota: el usuario es la fila de la que cuelgan las demas. Si se borra en el");
  console.log("  orden inverso, `turso-check.ts` vera huerfanos y dira que hay un bug.");

  if (!aplicar) {
    console.log("");
    console.log("  Dry-run: no se ha escrito nada. Usa --apply para escribir en Turso.");
    return;
  }

  // `getTursoClientSync` (de `lib/db.ts`, no de `lib/turso.ts`): lee `process.env`
  // en tiempo de llamada. El otro captura un snapshot al importar el modulo y con
  // el env cargando tarde devuelve `null` con el env ya presente — el patron que
  // produjo el 500 en produccion (AGENTS.md, RC.32).
  const { getTursoClientSync } = await import("../lib/db");
  const client = getTursoClientSync();

  if (!client) {
    throw new Error(
      "Turso no esta configurado (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).\n" +
        "  Sin el, este script solo puede escribir en el SQLite local, y las capturas\n" +
        "  se sacan contra produccion. Abortando en vez de crear la cuenta a medias."
    );
  }

  await client.execute({
    sql: `INSERT OR REPLACE INTO users (id, name, email, password_hash, role, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [DEMO_USER_ID, "Demo Artist", credenciales.email, passwordHash, "artist", ahora],
  });

  await client.execute({
    sql: `INSERT OR REPLACE INTO artists
          (id, name, user_id, biography, genre, location, monthly_listeners, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      DEMO_ID,
      "Demo Artist",
      DEMO_USER_ID,
      // Biografia que se declara ficticia en su primera frase. Una captura de
      // demo con una bio que parece real es el problema que este script evita.
      "Perfil de demostracion. Todos los datos de esta cuenta son inventados y no corresponden a ninguna persona real.",
      "Rock Alternativo",
      "Madrid, Espana",
      15000,
      ahora,
    ],
  });

  for (const s of SHOWS_DEMO) {
    await client.execute({
      sql: `INSERT OR REPLACE INTO shows
            (id, artist_id, venue_name, city, country, date, time, status, approved, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        s.id,
        DEMO_ID,
        s.venue,
        s.city,
        "Espana",
        s.date,
        "20:30",
        s.status,
        1,
        ahora,
      ],
    });
  }

  console.log("");
  console.log(`  Escrito en Turso: 1 usuario, 1 artista, ${SHOWS_DEMO.length} shows.`);
  console.log("");
  console.log(`  Para las capturas: DEMO_ARTIST_EMAIL y DEMO_ARTIST_PASSWORD en .env.local,`);
  console.log(`  y capture-social.ts debe usar esas variables en /dashboard.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});