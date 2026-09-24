import * as fs from "fs";

// Gather Wikimedia Commons image candidates per catalog artist (no DB writes).
const QUERIES: Record<string, string[]> = {
  "Kate Bush": ["Kate Bush singer", "Kate Bush 1980s"],
  Queen: ["Queen Freddie Mercury band 1970s", "Queen band concert"],
  Nirvana: ["Nirvana Kurt Cobain band", "Nirvana band concert"],
  "The Weeknd": ["The Weeknd singer", "The Weeknd concert"],
  Eagles: ["Eagles band 1970s", "Eagles Hotel California band"],
  "Ed Sheeran": ["Ed Sheeran singer", "Ed Sheeran concert"],
};

interface Cand { title: string; w: number; h: number; thumb: string; }

async function search(q: string): Promise<Cand[]> {
  const u =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search" +
    `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=12` +
    "&prop=imageinfo&iiprop=url%7Csize&iiurlwidth=1280";
  const j = (await (await fetch(u)).json()) as any;
  const pages = j?.query?.pages ?? {};
  return Object.values(pages).map((p: any) => ({
    title: p.title as string,
    w: p.imageinfo?.[0]?.width ?? 0,
    h: p.imageinfo?.[0]?.height ?? 0,
    thumb: (p.imageinfo?.[0]?.thumburl as string ?? "").split("?")[0],
  }));
}

function score(c: Cand): number {
  let s = 0;
  const t = c.title.toLowerCase();
  if (/logo|cover|album|single|vinyl|disc|ticket|poster|advertisement/.test(t)) s -= 50;
  if (/\bcropped\b/.test(t)) s -= 5;
  if (/publicity photo|press photo|portrait|live|concert|band|on stage|performance/.test(t)) s += 20;
  if (c.w >= 1000 && c.h >= 600) s += 10;
  if (c.w < 400 || c.h < 400) s -= 20;
  return s;
}

async function main() {
  const out: Record<string, Cand[]> = {};
  for (const [artist, queries] of Object.entries(QUERIES)) {
    const seen = new Map<string, Cand>();
    for (const q of queries) {
      try {
        for (const c of await search(q)) {
          if (!seen.has(c.title) && c.thumb) seen.set(c.title, c);
        }
      } catch (e) {
        console.log(`ERR ${q}:`, String(e).slice(0, 100));
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    out[artist] = [...seen.values()]
      .map((c) => ({ ...c, _s: score(c) }))
      .sort((a, b) => (b as any)._s - (a as any)._s)
      .slice(0, 8)
      .map(({ title, w, h, thumb }) => ({ title, w, h, thumb }));
    console.log(`== ${artist} (${out[artist].length}) ==`);
    for (const c of out[artist]) console.log(`  ${c.w}x${c.h} | ${c.title}`);
  }
  fs.writeFileSync("artist-image-candidates.json", JSON.stringify(out, null, 2));
  console.log("saved artist-image-candidates.json");
}
main().catch((e) => { console.error(e); process.exit(1); });
