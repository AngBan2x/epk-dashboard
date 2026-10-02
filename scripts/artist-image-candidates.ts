/**
 * Candidatos de foto de perfil y banner por artista, desde Wikimedia Commons.
 *
 * NO escribe nada en la base de datos: solo produce `artist-image-candidates.json`,
 * un informe para revision visual. Que alguien mire la imagen antes de que llegue
 * a produccion es el unico control real contra el fallo de "plausible pero falsa".
 *
 * Unsplash esta descartado (RC.32): devolvia retratos creibles de bandas sin
 * relacion, que es como se colaron las 9 caratulas falsas. Commons obliga a que el
 * archivo tenga un nombre propio y una licencia, y eso ya es media garantia.
 *
 * Uso: npx tsx scripts/artist-image-candidates.ts [--role=avatar|banner] [--only="Nombre,Otro"]
 */
import fs from "fs";
import {
  ARTIST_IDENTITIES,
  type ArtistIdentity,
  type Candidate,
  type ImageRole,
  type ScoredCandidate,
  attributeCandidate,
  canonicalizeWikimediaUrl,
  judgeImageResponse,
  scoreCandidate,
} from "../lib/artist-images";

// API de Wikimedia. Sin User-Agent propio, Wikimedia responde 429 antes de
// devolver nada, asi que se identifica como el proyecto que es.
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "PressPlay-EPK/1.0 (candidate review; https://github.com/pressplay)";
const OUT = "artist-image-candidates.json";

interface CommonsHit {
  pageid: number;
  title: string;
  pageUrl: string;
  width: number;
  height: number;
  url: string;
  thumbUrl: string;
  description: string;
  date: string;
  license: string;
  author: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildQuery(query: string): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "30",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "1280",
  });
  return `${API}?${params.toString()}`;
}

/**
 * Un solo fetch, con `extmetadata` para traer licencia y autor.
 *
 * La licencia y el autor se piden aqui y no despues a mano porque Commons obliga a
 * atribuir: si el perfil va a ser publico, sin `license` y `author` en el informe
 * la imagen no se puede publicar. El HTML de `extmetadata` se limpia en
 * `stripHtml`; si no, el informe sale con etiquetas dentro y no se lee.
 */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ")
    .trim();
}

async function fetchHits(query: string): Promise<CommonsHit[]> {
  const res = await fetch(buildQuery(query), {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    query?: { pages?: Record<string, Record<string, unknown>> };
  };
  const pages = json?.query?.pages ?? {};
  const out: CommonsHit[] = [];
  for (const p of Object.values(pages)) {
    const info = (p.imageinfo as Array<Record<string, unknown>> | undefined)?.[0];
    if (!info) continue;
    const meta = (info.extmetadata as Record<string, { value?: string }> | undefined) ?? {};
    const pick = (k: string) => stripHtml(meta[k]?.value ?? "");
    out.push({
      pageid: Number(p.pageid ?? 0),
      title: String(p.title ?? ""),
      pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(p.title ?? ""))}`,
      width: Number(info.width ?? 0),
      height: Number(info.height ?? 0),
      url: String(info.url ?? ""),
      thumbUrl: canonicalizeWikimediaUrl(String(info.thumburl ?? String(info.url ?? ""))),
      description: pick("ImageDescription"),
      date: pick("DateTimeOriginal"),
      license: pick("LicenseShortName"),
      author: pick("Artist"),
    });
  }
  return out;
}

async function searchArtist(artist: ArtistIdentity, role: ImageRole): Promise<ScoredCandidate[]> {
  const seen = new Map<string, CommonsHit>();
  for (const q of artist.queries) {
    try {
      for (const hit of await fetchHits(q)) {
        if (!seen.has(hit.title) && hit.thumbUrl) seen.set(hit.title, hit);
      }
    } catch (e) {
      console.log(`  ERR "${q}": ${(e as Error).message.slice(0, 90)}`);
    }
    await sleep(700);
  }

  const scored: ScoredCandidate[] = [...seen.values()].map((h) =>
    scoreCandidate(
      {
        title: h.title,
        description: h.description,
        date: h.date,
        license: h.license,
        author: h.author,
        width: h.width,
        height: h.height,
        url: h.thumbUrl,
      } satisfies Candidate,
      artist,
      role
    )
  );
  return scored.sort((a, b) => b.score - a.score);
}

async function verify(url: string, attempts = 3): Promise<{ ok: boolean; note: string }> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": UA } });
      const verdict = judgeImageResponse(res.status, res.headers.get("content-type"));
      if (verdict.ok || !verdict.retryable) return { ok: verdict.ok, note: verdict.note };
      await sleep(1500 * (i + 1));
    } catch (e) {
      await sleep(1000 * (i + 1));
      if (i === attempts - 1) return { ok: false, note: (e as Error).message.split("\n")[0].slice(0, 80) };
    }
  }
  return { ok: false, note: "agotados los reintentos" };
}

async function main() {
  const roleArg = process.argv.find((a) => a.startsWith("--role="));
  const role = (roleArg?.split("=")[1] === "banner" ? "banner" : "avatar") as ImageRole;
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = (onlyArg?.slice("--only=".length) ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const target = only.length
    ? ARTIST_IDENTITIES.filter((a) => only.includes(a.name.toLowerCase()))
    : ARTIST_IDENTITIES;

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    role,
    source: "Wikimedia Commons",
    note:
      "Solo se proponen candidatos con atribucion exacta. Lo de 'revision' y 'descartado' se deja anotado para que la revision visual sepa que se ha mirado y por que se ha rechazado.",
    artists: {} as Record<string, unknown>,
  };

  for (const artist of target) {
    console.log(`\n== ${artist.name} (${role}) ==`);
    const scored = await searchArtist(artist, role);

    // Solo se verifican por HTTP los que pasaron la atribucion. Verificar 40
    // descartados por artista es gastar requests de Wikimedia para nada.
    const keep = scored.filter((c) => c.verdict !== "descartado").slice(0, 6);
    const verified: unknown[] = [];
    for (const c of keep) {
      const v = await verify(c.url);
      await sleep(400);
      const line =
        `  [${c.verdict.padEnd(10)}] ${String(c.score).padStart(4)}  ${c.title.replace(/^File:/i, "")}` +
        `\n       ${c.width}x${c.height} | ${c.license || "sin licencia"} | ${v.ok ? "URL OK" : "URL FALLA"} (${v.note})` +
        `\n       porque: ${c.reasons.join("; ") || "nada a favor"}` +
        (c.flags.length ? `\n       ojo:   ${c.flags.join("; ")}` : "");
      console.log(line);
      verified.push({
        title: c.title,
        page: (c as unknown as { pageUrl?: string }).pageUrl,
        url: c.url,
        width: c.width,
        height: c.height,
        description: c.description,
        date: c.date,
        license: c.license,
        author: c.author,
        score: c.score,
        verdict: c.verdict,
        urlCheck: v,
        attribution: c.attribution.why,
        reasons: c.reasons,
        flags: c.flags,
      });
    }

    const exact = keep.filter((c) => c.verdict === "aceptado");
    const none = scored.filter((c) => c.verdict === "descartado").slice(0, 5);
    console.log(
      `  -> ${exact.length} aceptados, ${keep.length - exact.length} para revision, ${scored.filter((c) => c.verdict === "descartado").length} descartados`
    );

    (report.artists as Record<string, unknown>)[artist.name] = {
      identidad: artist.terms,
      consultas: artist.queries,
      aceptados: verified.filter((v) => (v as { verdict: string }).verdict === "aceptado"),
      revision: verified.filter((v) => (v as { verdict: string }).verdict === "revision"),
      descartados: none.map((c) => ({
        title: c.title,
        motivo: c.attribution.level === "ninguno" ? c.attribution.why : c.flags[0] ?? "sin motivo",
      })),
    };
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\nGuardado ${OUT}. Esto NO escribe en la base de datos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});