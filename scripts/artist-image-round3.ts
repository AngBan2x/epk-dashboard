import * as fs from "fs";
const QUERIES: Array<[string, string, string[]]> = [
  ["Queen", "Queen Elektra publicity photo band", ["Queen News Of The World (1977 Press Kit Photo 01).jpg", "Freddie Mercury (1977 Press Kit Photo).jpg"]],
  ["Nirvana", "Kurt Cobain Nirvana MTV", ["Nirvana around 1992 (high quality).jpg"]],
  ["Eagles", "Eagles Hotel California band concert", []],
];
async function main() {
  const out: Record<string, any[]> = {};
  for (const [artist, q, wanted] of QUERIES) {
    console.log(`== ${artist} :: ${q}`);
    try {
      const u =
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search" +
        `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=15` +
        "&prop=imageinfo&iiprop=url%7Csize&iiurlwidth=1280";
      const r = await fetch(u, { headers: { "User-Agent": "PressPlayBot/1.0 (artist images curation)" } });
      const j = (await r.json()) as any;
      const all: any[] = Object.values(j?.query?.pages ?? {}).map((p: any) => ({
        title: p.title as string,
        w: p.imageinfo?.[0]?.width ?? 0,
        h: p.imageinfo?.[0]?.height ?? 0,
        thumb: ((p.imageinfo?.[0]?.thumburl as string) ?? "").split("?")[0],
      }));
      const picked = wanted.length
        ? all.filter((c) => wanted.some((w) => c.title.includes(w.replace("File:", ""))))
        : all.slice(0, 8);
      out[artist] = picked.length ? picked : all.slice(0, 8);
      for (const c of out[artist]) console.log(`  ${c.w}x${c.h} | ${c.title}\n    ${c.thumb}`);
    } catch (e) { console.log("  ERR", String(e).slice(0, 120)); }
    await new Promise((r) => setTimeout(r, 6000));
  }
  fs.writeFileSync("artist-image-round3.json", JSON.stringify(out, null, 2));
  console.log("saved artist-image-round3.json");
}
main().catch((e) => { console.error(e); process.exit(1); });
