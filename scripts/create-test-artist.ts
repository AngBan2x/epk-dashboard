import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const Database = require("better-sqlite3");
  const bcrypt = require("bcryptjs");
  const path = require("path");
  const crypto = require("crypto");
  
  const db = new Database(path.join(process.cwd(), "data", "music_catalog.db"));
  
  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash("12345678", 10);
  
  // Insert user
  db.prepare("INSERT OR IGNORE INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(
    userId, "Angel Bandres", "angab06@gmail.com", passwordHash, "artist"
  );
  
  // Get user ID
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get("angab06@gmail.com");
  
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
      args: [userId, "Angel Bandres", "angab06@gmail.com", passwordHash, "artist", new Date().toISOString()]
    });
    
    await client.execute({
      sql: "INSERT OR REPLACE INTO artists (id, name, user_id, biography, genre, location, monthly_listeners, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [artistId, "Angel Bandres", userId, "Guitarrista y compositor de rock alternativo.", "Rock Alternativo", "Madrid, España", 15000, new Date().toISOString()]
    });
    
    console.log("Synced to Turso");
  }
}

main();
