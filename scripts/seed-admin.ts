#!/usr/bin/env tsx
/**
 * Seed: Crear usuario admin por defecto
 */
import Database from "better-sqlite3";
import path from "path";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const DB_PATH = path.join(process.cwd(), "data", "music_catalog.db");

function main() {
  console.log("🌱 Seed Admin: Creando usuario admin por defecto...\n");

  const db = new Database(DB_PATH);

  // Crear tabla users si no existe
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
    console.log("✅ Usuario admin ya existe:", existingAdmin);
    db.close();
    return;
  }

  // Crear admin
  const passwordHash = bcrypt.hashSync("admin123", 10);
  const adminId = randomUUID();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(adminId, "Admin EPK", "admin@epk.local", passwordHash, "admin");

  console.log("✅ Usuario admin creado:");
  console.log("   Email: admin@epk.local");
  console.log("   Password: admin123");
  console.log("   Role: admin");
  console.log("   ID:", adminId);

  db.close();
  console.log("\n✅ Seed admin completado\n");
}

main();