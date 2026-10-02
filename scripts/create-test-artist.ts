import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

/**
 * RC.33 P1 — este script creaba la cuenta con el correo y la contrasena
 * hardcodeados. El correo es PII de una persona real y la contrasena es un
 * secreto: ninguno debe seguir en el repo, y borrarlos del fichero no basta
 * porque quedan en el historial.
 *
 * Se leen del entorno con **default vacio** a proposito: sin `TEST_ARTIST_EMAIL`
 * el script falla con un mensaje util en vez de crear una cuenta con una
 * direccion que no es de aqui.
 */
const EMAIL = process.env.TEST_ARTIST_EMAIL ?? "";
const PASSWORD = process.env.TEST_ARTIST_PASSWORD ?? "";

if (!EMAIL || !PASSWORD) {
  console.error(
    "Falta TEST_ARTIST_EMAIL o TEST_ARTIST_PASSWORD en .env.local.\n" +
      "Este script ya no lleva credenciales dentro: definelas en el entorno y vuelve a correrlo."
  );
  process.exit(1);
}

async function main() {
  const Database = require("better-sqlite3");
  const bcrypt = require("bcryptjs");
  const path = require("path");
  const crypto = require("crypto");
  
  const db = new Database(path.join(process.cwd(), "data", "music_catalog.db"));
  
  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  
  // Insert user
  db.prepare("INSERT OR IGNORE INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(
    userId, "Angel Bandres", EMAIL, passwordHash, "artist"
  );
  
  // Get user ID
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(EMAIL);
  
  // Create artist profile
  const artistId = `art-${Date.now()}`;
  db.prepare("INSERT OR IGNORE INTO artists (id, name, user_id, biography, genre, location, monthly_listeners) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    artistId, "Angel Bandres", user.id, "Guitarrista y compositor de rock alternativo.", "Rock Alternativo", "Madrid, España", 15000
  );
  
  console.log("Created artist user:", user.id);
  console.log("Created artist profile:", artistId);
  
  // Sync to Turso
  const { getTursoClient } = await import("../lib/turso");
  const client = getTursoClient();
  if (client) {
    await client.execute({
      sql: "INSERT OR REPLACE INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [userId, "Angel Bandres", EMAIL, passwordHash, "artist", new Date().toISOString()]
    });
    
    await client.execute({
      sql: "INSERT OR REPLACE INTO artists (id, name, user_id, biography, genre, location, monthly_listeners, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [artistId, "Angel Bandres", userId, "Guitarrista y compositor de rock alternativo.", "Rock Alternativo", "Madrid, España", 15000, new Date().toISOString()]
    });
    
    console.log("Synced to Turso");
  }
}

main();
