import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { getTursoClient } = await import("../lib/turso");
  const client = getTursoClient();
  if (!client) { console.log("Turso not configured"); return; }

  // Drop and recreate artists table with user_id column
  await client.execute("DROP TABLE IF EXISTS shows");
  await client.execute("DROP TABLE IF EXISTS artists");
  
  await client.execute(`
    CREATE TABLE artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      user_id TEXT,
      biography TEXT,
      press_text TEXT,
      press_highlights TEXT,
      genre TEXT,
      location TEXT,
      monthly_listeners INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await client.execute(`
    CREATE TABLE shows (
      id TEXT PRIMARY KEY,
      artist_id TEXT NOT NULL,
      venue_name TEXT NOT NULL,
      city TEXT,
      country TEXT,
      date TEXT,
      time TEXT,
      price_range TEXT,
      status TEXT DEFAULT 'disponible',
      ticket_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (artist_id) REFERENCES artists(id)
    )
  `);

  console.log("Recreated artists and shows tables in Turso");

  // Sync artists from local SQLite
  const Database = require("better-sqlite3");
  const path = require("path");
  const db = new Database(path.join(process.cwd(), "data", "music_catalog.db"));
  
  const artists = db.prepare("SELECT * FROM artists").all();
  console.log(`Found ${artists.length} artists in local SQLite`);
  
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
  const result = await client.execute("SELECT id, name, user_id FROM artists");
  console.log(`\nArtists in Turso now: ${result.rows.length}`);
  console.log(JSON.stringify(result.rows, null, 2));
}

main();
