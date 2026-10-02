/**
 * Comprueba que una URL de imagen resuelve de verdad (200 + `content-type: image/*`)
 * antes de meterla en la semilla o de darla por buena en la revision visual.
 *
 * Existe por dos motivos, ambos ya pagados:
 *
 *  1. La primera siembra metio `https://example.com/covers/*.jpg` en los 9 releases:
 *     es el dominio reservado por la RFC, nunca resuelve, y en la pagina del
 *     artista salia el icono de imagen rota. 74 filas correctas y 9 portadas
 *     rotas, y ningun test lo vio porque los tests no miran la red.
 *  2. Un verificador que solo mira el status no detecta el fallo tipico de
 *     Wikimedia: un host responde **HTML con 200** cuando el archivo ya no esta.
 *
 * Por eso se exige `image/*` y no solo 200, y por eso los hosts de Wikimedia
 * entran en la lista: `thumb.wikimedia.org` es un alias historico que responde
 * pero que nunca paso por aqui, porque el verificador solo probaba URLs de
 * `images.unsplash.com`. Una URL sin verificar es una URL que no se sabe.
 *
 * Uso: npx tsx scripts/check-image-urls.ts [--strict] [--extra=url,url]
 */
import {
  canonicalizeWikimediaUrl,
  deprecatedWikimediaHosts,
  isWikimediaHost,
  judgeImageResponse,
  type ProbeResult,
} from "../lib/artist-images";

const UA = "PressPlay-EPK/1.0 (image URL check; https://github.com/pressplay)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Los 4 que el proyecto ya usa (gallery, VideoShowcase, landing). Verificados.
 * Los de tema musical NO se dan por buenos: se comprueban y los que no devuelven
 * 200 + image/* se descartan antes de tocar la semilla.
 */
const themeCandidates = [
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

/**
 * Las URLs de artista que estan escritas en produccion. Se comprueban aqui porque
 * son las que un humano reviso a ojo en 2026-09-23 y luego no volvio a mirar
 * nadie: si Wikimedia renombra un archivo, el avatar se rompe en silencio.
 *
 * Traidas tal cual estan en Turso, no del mapa del script, para que el verificador
 * mida lo que hay en produccion y no lo que el script cree que hay.
 */
const wikimediaCandidates = [
  "https://upload.wikimedia.org/wikipedia/commons/5/56/Kate_Bush_1981.jpg",
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/22/Kate_Bush_Hounds_of_Love_%281985_EMI_publicity_photo%29_02.jpg/1280px-Kate_Bush_Hounds_of_Love_%281985_EMI_publicity_photo%29_02.jpg",
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5f/Queen_News_Of_The_World_%281977_Press_Kit_Photo_02%29.jpg/1280px-Queen_News_Of_The_World_%281977_Press_Kit_Photo_02%29.jpg",
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/10/Queen_News_Of_The_World_%281977_Press_Kit_Photo_01%29.jpg/1280px-Queen_News_Of_The_World_%281977_Press_Kit_Photo_01%29.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/5/5e/Nirvana_around_1992_%28high_quality%29.jpg",
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a0/The_Weeknd_Portrait_by_Brian_Ziff.jpg/1280px-The_Weeknd_Portrait_by_Brian_Ziff.jpg",
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3c/Concert_The_Weeknd_Paris_17.jpg/1280px-Concert_The_Weeknd_Paris_17.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/b/b1/The_Eagles_in_Concert_2010_-_Hotel_California.jpg",
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ec/Ed_Sheeran_in_Philadelphia_04.jpg/1280px-Ed_Sheeran_in_Philadelphia_04.jpg",
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/47/Ed_Sheeran_Concert%2C_Bangalore%2C_February_2025.jpg/1280px-Ed_Sheeran_Concert%2C_Bangalore%2C_February_2025.jpg",
];

/**
 * Candidatos propuestos para los 5 artistas que estaban sin imagen.
 *
 * Se rellena SOLO con archivos que hayan salido de `artist-image-candidates.ts`,
 * que este verificador haya dado por buenos y que ademas se hayan mirado a mano.
 * No se escriben URLs aqui que no se hayan comprobado: una URL inventada que
 * resuelve a otra imagen es exactamente el fallo que la ola viene a evitar.
 *
 * Los tres NULL a proposito (avatar de Pink Floyd, Radiohead y Kraftwerk, y
 * banner de Pink Floyd/Radiohead/Bjork) no aparecen porque no hay archivo: se
 * deja el degradado de `ArtistHero` como fallback.
 */
const proposedCandidates = [
  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Pink_Floyd_at_Live_8%2C_London.jpg/1280px-Pink_Floyd_at_Live_8%2C_London.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/2025_Radiohead_live_concert_at_Uber_Arena%2C_Berlin_07.jpg/1280px-2025_Radiohead_live_concert_at_Uber_Arena%2C_Berlin_07.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/9/98/Bj%C3%B6rk_performing_at_Cirque_en_Chantier_1_edit.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/David_Bowie_Live_1974.jpg/1280px-David_Bowie_Live_1974.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Kraftwerk_live_07.09.1981_Nakano_Sun_Plaza_Tokyo.jpg/1280px-Kraftwerk_live_07.09.1981_Nakano_Sun_Plaza_Tokyo.jpg",
];

async function probe(url: string, attempts = 3): Promise<ProbeResult> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        headers: { "User-Agent": UA },
      });
      const verdict = judgeImageResponse(res.status, res.headers.get("content-type"));
      if (verdict.ok || !verdict.retryable) return verdict;
      await sleep(1500 * (i + 1));
    } catch (e) {
      if (i === attempts - 1) {
        return { ok: false, code: "unreachable", note: (e as Error).message.split("\n")[0].slice(0, 90), retryable: true };
      }
      await sleep(1000 * (i + 1));
    }
  }
  return { ok: false, code: "server-error", note: "agotados los reintentos", retryable: true };
}

function label(url: string): string {
  const m = url.match(/photo-[0-9a-f-]+/)?.[0];
  if (m) return m;
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return name.length > 46 ? `${name.slice(0, 44)}..` : name;
  } catch {
    return url.slice(0, 46);
  }
}

async function runGroup(
  title: string,
  urls: string[],
  bad: string[],
  warnings: string[]
): Promise<void> {
  if (urls.length === 0) return;
  console.log(`\n${title}`);
  for (const raw of urls) {
    const url = canonicalizeWikimediaUrl(raw);
    const v = await probe(url);
    const deprecated = deprecatedWikimediaHosts(raw);
    const warn = deprecated.length ? `  <- host alias, canonico: upload.wikimedia.org` : "";
    if (warn) warnings.push(`${label(raw)} usa ${deprecated.join(",")}`);
    console.log(
      `  ${v.ok ? "OK   " : "FALLA"}  ${label(raw).padEnd(48)} ${v.note}${warn}`
    );
    if (!v.ok) bad.push(label(raw));
    await sleep(300);
  }
}

(async () => {
  const strict = process.argv.includes("--strict");
  const extraArg = process.argv.find((a) => a.startsWith("--extra="));
  const extra = (extraArg?.slice("--extra=".length) ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  const bad: string[] = [];
  const warnings: string[] = [];

  console.log("Verificador de imagenes. Ninguna URL se acepta sin 200 + image/*.");

  await runGroup(
    "Unsplash - decoracion de tema (no son artistas)",
    themeCandidates,
    bad,
    warnings
  );
  await runGroup(
    "Wikimedia - lo que hay hoy en produccion",
    wikimediaCandidates,
    bad,
    warnings
  );
  if (proposedCandidates.length) {
    await runGroup("Wikimedia - los 5 que estaban sin imagen", proposedCandidates, bad, warnings);
  }
  if (extra.length) await runGroup("Wikimedia - pasado por --extra", extra, bad, warnings);

  console.log("");
  if (warnings.length) {
    console.log(`Avisos (${warnings.length}) - no fallan, pero conviene canonicalizar:`);
    for (const w of warnings) console.log(`  - ${w}`);
    console.log("");
  }
  if (bad.length === 0) {
    console.log("Todas las URLs resuelven y devuelven una imagen.");
  } else if (strict) {
    console.log(`FALLAN ${bad.length}: ${bad.join(", ")}`);
    process.exit(1);
  } else {
    console.log(`Aviso: ${bad.length} no resuelven. Con --strict el script falla.`);
  }
})();