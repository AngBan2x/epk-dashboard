#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { requireCredentials } from "./lib/credentials";

/**
 * P7 — crea la cuenta de artista de pruebas.
 *
 * Este script ya no lleva el correo ni la contrasena dentro. El correo es PII de
 * una persona real y la contrasena es un secreto: borrar las cadenas del
 * fichero no basta, porque quedan en el historial de git.
 *
 * La validacion **no es propia**: usa `requireCredentials` de
 * `scripts/lib/credentials.ts`, el mismo que los ~35 ficheros restantes. La
 * version anterior hacia aqui un `if (!EMAIL || !PASSWORD)` a mano, que es
 * exactamente la clase de duplicacion que diverge sin avisar: el dia que el
 * helper cambie el mensaje de error, esta copia seguira diciendo el antiguo.
 *
 * El nombre "Angel Bandres" si se queda: es el nombre artistico del catalogo,
 * no una credencial.
 */
async function main() {
  const Database = require("better-sqlite3");
  const bcrypt = require("bcryptjs");
  const path = require("path");
  const crypto = require("crypto");

  const { email, password } = requireCredentials("artist", "seed de la cuenta de artista");

  const db = new Database(path.join(process.cwd(), "data", "music_catalog.db"));

  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  // Insert user
  db.prepare("INSERT OR IGNORE INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(
    userId, "Angel Bandres", email, passwordHash, "artist"
  );

  // Get user ID
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);

  // Create artist profile
  const artistId = `art-${Date.now()}`;
  db.prepare("INSERT OR IGNORE INTO artists (id, name, user_id, biography, genre, location, monthly_listeners) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    artistId, "Angel Bandres", user.id, "Guitarrista y compositor de rock alternativo.", "Rock Alternativo", "Madrid, España", 15000
  );

  console.log("Created artist user:", user.id);
  console.log("Created artist profile:", artistId);
  console.log("Password: <la de TEST_ARTIST_PASSWORD, no se imprime>");

  // Sync to Turso
  // `getTursoClientSync` (de `lib/db.ts`, no de `lib/turso.ts`) y no
  // `getTursoClient`: lee `process.env` en tiempo de llamada. El otro captura un
  // snapshot al importar el modulo, y si el env llega tarde devuelve `null` con
  // el env ya presente — que es exactamente el patron que produjo el 500 en
  // produccion (ver AGENTS.md, RC.32).
  const { getTursoClientSync } = await import("../lib/db");
  const client = getTursoClientSync();
  if (client) {
    await client.execute({
      sql: "INSERT OR REPLACE INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [userId, "Angel Bandres", email, passwordHash, "artist", new Date().toISOString()]
    });

    await client.execute({
      sql: "INSERT OR REPLACE INTO artists (id, name, user_id, biography, genre, location, monthly_listeners, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [artistId, "Angel Bandres", userId, "Guitarrista y compositor de rock alternativo.", "Rock Alternativo", "Madrid, España", 15000, new Date().toISOString()]
    });

    console.log("Synced to Turso");
  } else {
    console.log("Turso no configurado (saltando sync remoto)");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});