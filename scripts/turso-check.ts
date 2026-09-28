import { createClient } from "@libsql/client";
import fs from "node:fs";

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
    ["qa_shows", "SELECT COUNT(*) c FROM shows WHERE venue_name LIKE 'QA %' OR title LIKE 'QA %'"],
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
