import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { getTursoClient } = await import("../lib/turso");
  const client = getTursoClient();
  if (!client) {
    console.log("Turso not configured");
    return;
  }

  // Get users from local SQLite
  const Database = require("better-sqlite3");
  const path = require("path");
  const db = new Database(path.join(process.cwd(), "data", "music_catalog.db"));
  
  const users = db.prepare("SELECT * FROM users").all();
  console.log(`Found ${users.length} users in local SQLite`);
  
  for (const user of users) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [user.id, user.name, user.email, user.password_hash, user.role, user.created_at || new Date().toISOString()]
      });
      console.log(`  Synced user: ${user.email}`);
    } catch (error) {
      console.error(`  Error syncing user ${user.email}:`, error);
    }
  }

  // Also sync artists
  const artists = db.prepare("SELECT * FROM artists").all();
  console.log(`\nFound ${artists.length} artists in local SQLite`);
  
  for (const artist of artists) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO artists (id, name, user_id, biography, press_text, press_highlights, genre, location, monthly_listeners, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [artist.id, artist.name, artist.user_id || null, artist.biography || null, artist.press_text || null, artist.press_highlights || null, artist.genre || null, artist.location || null, artist.monthly_listeners || 0, artist.created_at || new Date().toISOString()]
      });
      console.log(`  Synced artist: ${artist.name}`);
    } catch (error) {
      console.error(`  Error syncing artist ${artist.name}:`, error);
    }
  }
  
  // Verify
  const result = await client.execute("SELECT id, name, email, role FROM users");
  console.log(`\nUsers in Turso now: ${result.rows.length}`);
  console.log(JSON.stringify(result.rows, null, 2));
}

main();
