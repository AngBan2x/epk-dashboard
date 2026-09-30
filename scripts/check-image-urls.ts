/**
 * Comprueba que una URL de imagen resuelve de verdad (200 + content-type de
 * imagen) antes de meterla en la semilla.
 *
 * Existe porque la primera siembra metio `https://example.com/covers/*.jpg` en
 * los 9 releases: es el dominio de ejemplo reservado por la RFC, nunca resuelve,
 * y en la pagina del artista salia el icono de imagen rota. 74 filas correctas
 * y 9 portadas rotas, y ningun test lo vio porque los tests no miran la red.
 *
 * Uso: npx tsx scripts/check-image-urls.ts [--strict]
 */
import fs from "fs";

const candidates = [
  // Los 4 que el proyecto ya usa (gallery, VideoShowcase, landing). Verificados.
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&q=80",
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&q=80",
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80",
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80",
  // Candidatos de tema musical. NO se dan por buenos: se comprueban y los que
  // no devuelven 200 + image/* se descartan antes de tocar la semilla.
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80",
  "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=600&q=80",
  "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&q=80",
  "https://images.unsplash.com/photo-1499415479124-43c32433a620?w=600&q=80",
  "https://images.unsplash.com/photo-1466428996289-f53558da0c7f?w=600&q=80",
  "https://images.unsplash.com/photo-1471478331149-c72f17e33c73?w=600&q=80",
  "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=600&q=80",
  "https://images.unsplash.com/photo-1524650359799-842906ca1c06?w=600&q=80",
  "https://images.unsplash.com/photo-1501612780327-45045538702b?w=600&q=80",
  "https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=600&q=80",
  "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=600&q=80",
  "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&q=80",
  "https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?w=600&q=80",
  "https://images.unsplash.com/photo-1445985543470-41fba5c3144a?w=600&q=80",
  "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=600&q=80",
  "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=600&q=80",
];

async function check(url: string): Promise<{ ok: boolean; note: string }> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    const type = res.headers.get("content-type") ?? "";
    return { ok: res.ok && type.startsWith("image/"), note: `${res.status} ${type.split(";")[0]}` };
  } catch (e) {
    return { ok: false, note: (e as Error).message.split("\n")[0] };
  }
}

(async () => {
  const strict = process.argv.includes("--strict");
  const bad: string[] = [];
  console.log("");
  for (const url of candidates) {
    const r = await check(url);
    const id = url.match(/photo-[0-9a-f-]+/)?.[0] ?? url;
    console.log(`  ${r.ok ? "OK  " : "FALLA"}  ${id.padEnd(40)} ${r.note}`);
    if (!r.ok) bad.push(id);
  }
  console.log("");
  if (bad.length === 0) {
    console.log("Todas las URLs resuelven.");
  } else if (strict) {
    console.log(`FALLAN ${bad.length}: ${bad.join(", ")}`);
    process.exit(1);
  } else {
    console.log(`Aviso: ${bad.length} no resuelven. Con --strict el script falla.`);
  }
})();
