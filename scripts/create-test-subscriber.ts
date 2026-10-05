#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { requireCredentials, DEFAULT_SUBSCRIBER_EMAIL } from "./lib/credentials";

/**
 * C6 — crea la cuenta de suscriptor de pruebas.
 *
 * Sin ella **no se puede verificar** la parte más grande de la superficie sin
 * cubrir: suscripciones, notificaciones, preferencias de email y el broadcast. Es
 * decir, todo lo que hace un suscriptor, que hoy no tiene ni una sola cuenta en
 * producción (7 artistas, 1 admin, 0 suscriptores).
 *
 * ## Dry-run por defecto
 *
 * Igual que los otros scripts de datos (`fetch-official-videos.ts`,
 * `apply-artist-images.ts`, `qa-cleanup.ts`): sin `--apply` no escribe nada y solo
 * informa de lo que escribiría. Aquí además **falla antes de informar** si no hay
 * contraseña, porque `requireCredentials` la exige en el punto exacto y no hay
 * nada que escribir sin ella: un seed que crea una cuenta con la clave vacía
 * sería peor que un seed que no corre.
 *
 * ## Nada de credenciales en el fichero
 *
 * Ni el correo ni la contraseña. El correo tiene default en
 * `scripts/lib/credentials.ts` (`subscriber@epk.local`, dominio inventado) y la
 * contraseña viene de `TEST_SUBSCRIBER_PASSWORD`. Borrar las cadenas del script
 * no bastaría de todas formas: quedan en el historial de git. Lo que se escribe
 * aquí es la *cuenta*, nunca la clave.
 *
 * ## El rol
 *
 * `subscriber`, que es lo que crea el registro público desde P4. No se toca
 * `lib/artist-promotion.ts` ni nada de ese camino: un suscriptor puede publicar
 * y sus releases quedan `pending` hasta que un admin los apruebe.
 */
async function main() {
  const bcrypt = require("bcryptjs");
  const crypto = require("crypto");

  const apply = process.argv.includes("--apply");
  const { email, password } = requireCredentials("subscriber", "seed de la cuenta de suscriptor");

  console.log(`\n=== ${apply ? "APPLY (escribe en Turso)" : "DRY-RUN (sin escrituras)"} ===`);
  console.log(`Correo: ${email}`);
  if (!apply) {
    console.log(`  (por defecto: ${DEFAULT_SUBSCRIBER_EMAIL})`);
  }
  console.log("Contraseña: <la de TEST_SUBSCRIBER_PASSWORD, no se imprime>");
  console.log(`Rol: subscriber`);

  const { getTursoClientSync } = await import("../lib/db");
  const client = getTursoClientSync();

  if (!client) {
    console.log("\nTurso NO configurado: no se escribe nada.");
    console.log("Es lo correcto en local sin credenciales, y un error si creías que sí lo estaba.");
    return;
  }

  // ¿Existe ya? `INSERT OR REPLACE` con un id nuevo crearía un duplicado si el
  // correo ya está, así que se busca primero y se informa en vez de reescribir.
  const existing = await client.execute({
    sql: "SELECT id, role FROM users WHERE email = ?",
    args: [email],
  });
  const row = existing.rows?.[0];

  if (row) {
    console.log(`\nYa existe: id=${String(row.id).slice(0, 8)}… rol=${String(row.role)}`);
    console.log("No se toca. Para cambiar la contraseña, `PUT /api/user/settings` o borra la fila a mano.");
    return;
  }

  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  if (!apply) {
    console.log(`\nSe escribiría 1 fila en users:`);
    console.log(`  id=${userId.slice(0, 8)}…  role=subscriber  (contraseña hasheada, bcrypt 10)`);
    console.log("\nDRY-RUN. No se ha escrito nada. Con --apply se crea la cuenta.");
    return;
  }

  await client.execute({
    sql: "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [userId, "Suscriptor de pruebas", email, passwordHash, "subscriber", now],
  });

  console.log(`\nCreada: id=${userId.slice(0, 8)}…  rol=subscriber`);
  console.log("Comprueba con: POST /api/auth/login y ese par de credenciales.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});