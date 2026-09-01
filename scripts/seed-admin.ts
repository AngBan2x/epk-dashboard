#!/usr/bin/env tsx
/**
 * Seed: Crear usuario admin por defecto
 * - En LOCAL: crea en better-sqlite3
 * - En TURSO: también sincroniza al remote
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import path from "path";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const USE_TURSO = Boolean(TURSO_URL && TURSO_TOKEN);

async function main() {
  console.log("🌱 Seed Admin: Creando usuario admin por defecto...\n");

  // ─── Local SQLite ───────────────────────────────────────────────────────

  const Database = (await import("better-sqlite3")).default;
  const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");
  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'artist',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

  const existingAdmin = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
  if (existingAdmin) {
    console.log("✅ Usuario admin ya existe en SQLite:", (existingAdmin as Record<string, unknown>).email);
  } else {
    const passwordHash = bcrypt.hashSync("admin123", 10);
    const adminId = randomUUID();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(adminId, "Admin EPK", "admin@epk.local", passwordHash, "admin");

    console.log("✅ Usuario admin creado en SQLite:");
    console.log("   Email: admin@epk.local");
    console.log("   Password: admin123");
    console.log("   Role: admin");
    console.log("   ID:", adminId);
  }

  db.close();

  // ─── Turso (if configured) ──────────────────────────────────────────────

  if (USE_TURSO) {
    console.log("\n🔄 Sincronizando admin a Turso...");
    const { createClient } = await import("@libsql/client");
    const turso = createClient({ url: TURSO_URL!, authToken: TURSO_TOKEN! });

    // Ensure users table exists in Turso
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'artist',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Check if admin exists in Turso
    const result = await turso.execute("SELECT * FROM users WHERE role = 'admin'");
    if (result.rows.length > 0) {
      console.log("✅ Admin ya existe en Turso:", result.rows[0].email);
    } else {
      const passwordHash = bcrypt.hashSync("admin123", 10);
      const adminId = randomUUID();

      await turso.execute({
        sql: "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
        args: [adminId, "Admin EPK", "admin@epk.local", passwordHash, "admin"],
      });

      console.log("✅ Admin creado en Turso:");
      console.log("   Email: admin@epk.local");
      console.log("   ID:", adminId);
    }
  } else {
    console.log("\nℹ️  Turso no configurado (saltando sync remoto)");
  }

  console.log("\n✅ Seed admin completado\n");
}

main().catch(console.error);
