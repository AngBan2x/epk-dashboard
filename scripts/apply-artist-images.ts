import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Curated artist images (Wikimedia Commons, manually reviewed 2026-09-23).
// Overwrites profile_image/banner_image (previous seed used wrong album art).
const MAP: Record<string, { profile: string | null; banner: string | null }> = {
  "Kate Bush": {
    profile: "https://upload.wikimedia.org/wikipedia/commons/5/56/Kate_Bush_1981.jpg",
    banner:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/22/Kate_Bush_Hounds_of_Love_%281985_EMI_publicity_photo%29_02.jpg/1280px-Kate_Bush_Hounds_of_Love_%281985_EMI_publicity_photo%29_02.jpg",
  },
  Queen: {
    profile: "https://upload.wikimedia.org/wikipedia/commons/9/96/Freddie_Mercury_%281977_Press_Kit_Photo%29.jpg",
    banner:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/10/Queen_News_Of_The_World_%281977_Press_Kit_Photo_01%29.jpg/1280px-Queen_News_Of_The_World_%281977_Press_Kit_Photo_01%29.jpg",
  },
  Nirvana: {
    profile: "https://upload.wikimedia.org/wikipedia/commons/5/5e/Nirvana_around_1992_%28high_quality%29.jpg",
    banner: "https://upload.wikimedia.org/wikipedia/commons/5/5e/Nirvana_around_1992_%28high_quality%29.jpg",
  },
  "The Weeknd": {
    profile:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a0/The_Weeknd_Portrait_by_Brian_Ziff.jpg/1280px-The_Weeknd_Portrait_by_Brian_Ziff.jpg",
    banner:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3c/Concert_The_Weeknd_Paris_17.jpg/1280px-Concert_The_Weeknd_Paris_17.jpg",
  },
  Eagles: {
    profile: "https://upload.wikimedia.org/wikipedia/commons/b/b1/The_Eagles_in_Concert_2010_-_Hotel_California.jpg",
    banner: "https://upload.wikimedia.org/wikipedia/commons/b/b1/The_Eagles_in_Concert_2010_-_Hotel_California.jpg",
  },
  "Ed Sheeran": {
    profile:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Ed_Sheeran_in_Philadelphia_02.jpg/1280px-Ed_Sheeran_in_Philadelphia_02.jpg",
    banner:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/47/Ed_Sheeran_Concert%2C_Bangalore%2C_February_2025.jpg/1280px-Ed_Sheeran_Concert%2C_Bangalore%2C_February_2025.jpg",
  },
};

async function main() {
  const { getTursoClient } = await import("../lib/turso");
  const client = getTursoClient();
  if (!client) throw new Error("no turso client");
  for (const [name, imgs] of Object.entries(MAP)) {
    await client.execute({
      sql: "UPDATE artists SET profile_image = ?, banner_image = ? WHERE name = ?",
      args: [imgs.profile, imgs.banner, name],
    });
    console.log(`SET ${name}`);
  }
  const r = await client.execute(
    "SELECT name, profile_image IS NOT NULL AND profile_image != '' AS p, banner_image IS NOT NULL AND banner_image != '' AS b FROM artists"
  );
  for (const row of r.rows as any[]) console.log(`${row.name}: p=${Number(row.p)} b=${Number(row.b)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
