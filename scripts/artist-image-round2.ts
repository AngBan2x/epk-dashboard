const QUERIES: Array<[string, string]> = [
  ["Queen", "Queen Elektra publicity photo band"],
  ["Nirvana", "Kurt Cobain Nirvana MTV"],
  ["Eagles", "Eagles rock band 1970s portrait"],
];
async function main() {
  for (const [artist, q] of QUERIES) {
    console.log(`== ${artist} :: ${q}`);
    try {
      const u =
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search" +
        `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=10` +
        "&prop=imageinfo&iiprop=url%7Csize&iiurlwidth=1280";
      const r = await fetch(u, { headers: { "User-Agent": "PressPlayBot/1.0 (artist images curation)" } });
      const j = (await r.json()) as any;
      for (const p of Object.values(j?.query?.pages ?? {}) as any[]) {
        const w = p.imageinfo?.[0]?.width ?? 0, h = p.imageinfo?.[0]?.height ?? 0;
        console.log(`  ${w}x${h} | ${p.title}`);
      }
    } catch (e) { console.log("  ERR", String(e).slice(0, 120)); }
    await new Promise((r) => setTimeout(r, 5000));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
