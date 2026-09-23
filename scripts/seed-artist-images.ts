import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Populate empty artist profile/banner images:
// - profile_image: iTunes album artwork (600x600) by artist name
// - banner_image: Unsplash photo (genre + concert) via Access Key
// NEVER overwrites existing values. Skips Angel Bandres (owner manages own images via upload).
// Usage: npx tsx scripts/seed-artist-images.ts [--dry]

const SKIP = new Set(["angel bandres"]);
const DRY = process.argv.includes("--dry");

async function itunesArtwork(name: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=album&limit=1`
    );
    const j = (await r.json()) as any;
    const art = j?.results?.[0]?.artworkUrl100 as string | undefined;
    return art ? art.replace(/\/\d+x\d+bb\./, "/600x600bb.") : null;
  } catch {
    return null;
  }
}

async function unsplashBanner(query: string): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as any;
    return (j?.results?.[0]?.urls?.regular as string | undefined) ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const { getTursoClient } = await import("../lib/turso");
  const client = getTursoClient();
  if (!client) {
    console.error("Turso not configured");
    process.exit(1);
  }
  const res = await client.execute(
    "SELECT id, name, genre, profile_image, banner_image FROM artists"
  );
  let updated = 0;
  for (const row of res.rows as any[]) {
    const name: string = row.name;
    if (SKIP.has(name.toLowerCase())) {
      console.log(`SKIP ${name} (owner-managed)`);
      continue;
    }
    const patch: Record<string, string> = {};
    if (!row.profile_image) {
      const art = await itunesArtwork(name);
      if (art) patch.profile_image = art;
    }
    if (!row.banner_image) {
      const banner = await unsplashBanner(`${row.genre || name} concert`);
      if (banner) patch.banner_image = banner;
    }
    if (Object.keys(patch).length === 0) {
      console.log(`OK ${name} (already complete or no source)`);
      continue;
    }
    console.log(`${DRY ? "DRY" : "SET"} ${name}: ${Object.keys(patch).join(",")}`);
    if (!DRY) {
      const sets = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
      await client.execute({
        sql: `UPDATE artists SET ${sets} WHERE id = ?`,
        args: [...Object.values(patch), row.id],
      });
      updated++;
    }
  }
  console.log(`done. updated=${updated}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
