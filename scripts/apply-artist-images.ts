/**
 * Escribe las fotos de perfil y los banners curados de Wikimedia Commons.
 *
 * Dry-run por defecto: sin `--apply` no escribe nada. Antes este script escribia
 * siempre, sin pedir permiso, y con un mapa fijo que se habia quedado viejo.
 *
 * Que no escriba por defecto no es purismo. Dos motivos concretos:
 *
 *  1. Las URLs de `artists` son de produccion y no hay vuelta atras. Un UPDATE
 *     equivocado borra una imagen que alguien reviso a ojo.
 *  2. El mapa de este fichero estaba DESFASADO respecto a lo que hay en Turso. Lo
 *     que tiene el `artists` de produccion es mas reciente que este script: para
 *     Queen, la foto de prensa del grupo (Press_Kit_Photo_02) en vez de un retrato
 *     solo de Freddie Mercury, y para Ed Sheeran el archivo `_04` en vez del
 *     `_02`. Ejecutar el script tal cual habria sobrescrito la revision con una
 *     version anterior. Por eso el script compara antes de escribir y se niega a
 *     cambiar un valor que ya existe sin `--force`.
 *
 * Principio: "Ninguna imagen sin nombre propio y revisada a ojo." Cada URL de
 * abajo tiene un archivo con nombre propio en Commons, licencia, autor y fecha,
 * y se ha mirado la imagen antes de escribirla. Donde no habia retrato decente,
 * se deja NULL y se usa el degradado de `ArtistHero` como fallback.
 *
 * Uso:
 *   npx tsx scripts/apply-artist-images.ts            # dry-run, informa
 *   npx tsx scripts/apply-artist-images.ts --apply    # escribe
 *   npx tsx scripts/apply-artist-images.ts --apply --force  # pisa lo revisado
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import {
  canonicalizeWikimediaUrl,
  deprecatedWikimediaHosts,
  judgeImageResponse,
  parseScriptFlags,
} from "../lib/artist-images";

const UA = "PressPlay-EPK/1.0 (artist image apply; https://github.com/pressplay)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Curated {
  profile: string | null;
  banner: string | null;
  /** Licencia y autor, para poder atribuir si el perfil es publico. */
  creditos?: string;
}

/**
 * Los 6 de 2026-09-23, con las URLs que hay HOY en produccion (no las que tenia
 * este script, que eran anteriores). El host `thumb.wikimedia.org` se canonicaliza
 * a `upload.wikimedia.org`: el alias funciona, pero nadie lo habia verificado
 * nunca porque los verificadores Antiguos solo probaban `images.unsplash.com`.
 */
const CURATED: Record<string, Curated> = {
  "Kate Bush": {
    profile: "https://upload.wikimedia.org/wikipedia/commons/5/56/Kate_Bush_1981.jpg",
    banner:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/22/Kate_Bush_Hounds_of_Love_%281985_EMI_publicity_photo%29_02.jpg/1280px-Kate_Bush_Hounds_of_Love_%281985_EMI_publicity_photo%29_02.jpg",
    creditos: "EMI / archivo (1985)",
  },
  Queen: {
    profile:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5f/Queen_News_Of_The_World_%281977_Press_Kit_Photo_02%29.jpg/1280px-Queen_News_Of_The_World_%281977_Press_Kit_Photo_02%29.jpg",
    banner:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/10/Queen_News_Of_The_World_%281977_Press_Kit_Photo_01%29.jpg/1280px-Queen_News_Of_The_World_%281977_Press_Kit_Photo_01%29.jpg",
    creditos: "Press kit de 1977 (dominio publico)",
  },
  Nirvana: {
    profile: "https://upload.wikimedia.org/wikipedia/commons/5/5e/Nirvana_around_1992_%28high_quality%29.jpg",
    banner: "https://upload.wikimedia.org/wikipedia/commons/5/5e/Nirvana_around_1992_%28high_quality%29.jpg",
    creditos: "hacia 1992",
  },
  "The Weeknd": {
    profile:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a0/The_Weeknd_Portrait_by_Brian_Ziff.jpg/1280px-The_Weeknd_Portrait_by_Brian_Ziff.jpg",
    banner:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3c/Concert_The_Weeknd_Paris_17.jpg/1280px-Concert_The_Weeknd_Paris_17.jpg",
    creditos: "Brian Ziff (CC BY-SA 4.0) / concierto en Paris",
  },
  Eagles: {
    profile: "https://upload.wikimedia.org/wikipedia/commons/b/b1/The_Eagles_in_Concert_2010_-_Hotel_California.jpg",
    banner: "https://upload.wikimedia.org/wikipedia/commons/b/b1/The_Eagles_in_Concert_2010_-_Hotel_California.jpg",
    creditos: "concierto 2010, CC BY-SA 2.0",
  },
  "Ed Sheeran": {
    profile:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ec/Ed_Sheeran_in_Philadelphia_04.jpg/1280px-Ed_Sheeran_in_Philadelphia_04.jpg",
    banner:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/47/Ed_Sheeran_Concert%2C_Bangalore%2C_February_2025.jpg/1280px-Ed_Sheeran_Concert%2C_Bangalore%2C_February_2025.jpg",
    creditos: "CC BY-SA 4.0 / concierto en Bangalore, febrero 2025",
  },

  // ------------------------------------------------------------------
  // Los 5 del catalogo influyente, que estaban en NULL y no aparecian en
  // ningun script. Salieron de `artist-image-candidates.ts`, pasaron el
  // verificador HTTP y se miraron uno a uno antes de escribirse.
  // ------------------------------------------------------------------

  "Pink Floyd": {
    // Sin avatar: Commons no tiene un retrato de grupo utilizable de Pink Floyd,
    // solo fotos de escenario lejanas. Un avatar degraduate en circulo se veria
    // como una mancha, asi que se deja NULL y el degradado hace de avatar.
    profile: null,
    banner:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Pink_Floyd_at_Live_8%2C_London.jpg/1280px-Pink_Floyd_at_Live_8%2C_London.jpg",
    creditos: "Jon Lean, CC BY-SA 2.0 - Live 8, Londres, 2005",
  },
  Radiohead: {
    // Sin avatar, mismo motivo: no hay retrato, hay escenario.
    profile: null,
    banner:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/2025_Radiohead_live_concert_at_Uber_Arena%2C_Berlin_07.jpg/1280px-2025_Radiohead_live_concert_at_Uber_Arena%2C_Berlin_07.jpg",
    creditos: "Raph_PH, CC BY 4.0 - Uber Arena, Berlin, 2025",
  },
  "Björk": {
    profile:
      "https://upload.wikimedia.org/wikipedia/commons/9/98/Bj%C3%B6rk_performing_at_Cirque_en_Chantier_1_edit.jpg",
    // Sin banner: la unica panoramica decente (Björk live Paris 2023) sale
    // casi negra con la artista diminuta al fondo. Mejor el degradado.
    banner: null,
    creditos: "Rlef89, CC BY-SA 2.0 - Cirque en Chantier, 2013",
  },
  "David Bowie": {
    profile:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/David_Bowie_Live_1974.jpg/1280px-David_Bowie_Live_1974.jpg",
    banner:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/David_Bowie_Live_1974.jpg/1280px-David_Bowie_Live_1974.jpg",
    creditos: "RCA Records, dominio publico - Young Americans tour, 1974",
  },
  Kraftwerk: {
    // Sin avatar: la foto buena de grupo es panoramica y a 850 px de ancho, y las
    // caras quedan diminutas al recortar en circulo.
    profile: null,
    banner:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Kraftwerk_live_07.09.1981_Nakano_Sun_Plaza_Tokyo.jpg/1280px-Kraftwerk_live_07.09.1981_Nakano_Sun_Plaza_Tokyo.jpg",
    creditos: "CC BY 2.5 - Nakano Sun Plaza, Tokio, 1981",
  },
};

type Campo = "profile_image" | "banner_image";

async function probe(url: string, attempts = 3): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": UA } });
      const v = judgeImageResponse(res.status, res.headers.get("content-type"));
      if (v.ok || !v.retryable) return v.ok ? "OK" : `FALLA (${v.note})`;
      await sleep(1500 * (i + 1));
    } catch {
      await sleep(1000 * (i + 1));
    }
  }
  return "FALLA (sin verificar)";
}

function vacio(v: string | null | undefined): boolean {
  return !v || v.trim() === "";
}

async function main() {
  const flags = parseScriptFlags(process.argv);
  const force = process.argv.includes("--force");

  console.log(`\n=== ${flags.label} ===`);
  if (flags.apply) {
    console.log(force
      ? "Con --force: tambien se pisan los valores que ya habia alguien revisado."
      : "No se pisa ningun valor existente salvo que sea el mismo con otro host.");
  } else {
    console.log("Nada se va a escribir. Con --apply se aplica lo de abajo.");
  }
  console.log("");

  const { getTursoClient } = await import("../lib/turso");
  const client = getTursoClient();
  if (!client) throw new Error("Turso no configurado: nada que ver, no hay a quien escribir.");

  const res = await client.execute("SELECT name, profile_image, banner_image FROM artists");
  const byName = new Map<string, { profile_image: string | null; banner_image: string | null }>();
  for (const raw of res.rows as Array<Record<string, unknown>>) {
    byName.set(String(raw.name), {
      profile_image: (raw.profile_image as string | null) ?? null,
      banner_image: (raw.banner_image as string | null) ?? null,
    });
  }

  interface Plan {
    name: string;
    campo: Campo;
    actual: string | null;
    siguiente: string | null;
    accion: "poner" | "igual" | "host" | "cambiar" | "nada";
  }
  const planes: Plan[] = [];

  for (const [name, cur] of Object.entries(CURATED)) {
    const row = byName.get(name);
    if (!row) {
      console.log(`  AVISO  ${name}: no existe en la tabla artists, se omite.`);
      continue;
    }
    for (const [campo, valor] of [["profile_image", cur.profile], ["banner_image", cur.banner]] as const) {
      const actual = row[campo];
      const canonico = valor ? canonicalizeWikimediaUrl(valor) : null;
      const actualCanonico = actual ? canonicalizeWikimediaUrl(actual) : null;

      let accion: Plan["accion"];
      if (vacio(actual) && canonico) accion = "poner";
      else if (vacio(actual) && !canonico) accion = "nada";
      else if (!canonico) accion = "cambiar";
      else if (actual === canonico) accion = "igual";
      else if (actualCanonico === canonico) accion = "host";
      else accion = "cambiar";

      planes.push({ name, campo, actual, siguiente: canonico, accion });
    }
  }

  const simbolo: Record<Plan["accion"], string> = {
    poner: "+",
    igual: "=",
    host: "~",
    cambiar: "!",
    nada: ".",
  };

  let aPoner = 0;
  let aCambiar = 0;
  for (const p of planes) {
    const hosts = p.siguiente ? deprecatedWikimediaHosts(p.siguiente) : [];
    const notaHost = hosts.length ? ` (host alias: ${hosts.join(",")})` : "";
    let linea = `  ${simbolo[p.accion]} ${p.name.padEnd(14)} ${p.campo.padEnd(14)}`;
    if (p.accion === "poner") linea += `NULL -> ${p.siguiente}${notaHost}`;
    else if (p.accion === "cambiar") linea += `CAMBIAR\n        actual:  ${p.actual}\n        nuevo:   ${p.siguiente}`;
    else if (p.accion === "host") linea += `misma imagen, otro host`;
    else if (p.accion === "nada") linea += `se deja NULL a proposito (sin retrato fiable)`;
    else linea += `sin cambios`;
    console.log(linea);

    const bloqueado = p.accion === "cambiar" && !force;
    if (p.accion === "cambiar") {
      aCambiar++;
      if (bloqueado) console.log(`        -> NO se toca: ya habia un valor revisado. Usa --force si de verdad.`);
    }
  }

  const verificables = planes.filter((p) => p.siguiente);
  console.log(`\nVerificando ${verificables.length} URLs (HEAD + content-type image/*)...`);
  const caidos: string[] = [];
  for (const p of verificables) {
    const r = await probe(p.siguiente as string);
    if (r !== "OK") caidos.push(`${p.name}/${p.campo}: ${r}`);
    await sleep(250);
  }
  if (caidos.length === 0) console.log("  Todas devuelven una imagen de verdad.");
  else for (const c of caidos) console.log(`  FALLA  ${c}`);

  const aAplicar = planes.filter((p) => {
    if (caidos.some((c) => c.startsWith(`${p.name}/${p.campo}`))) return false;
    if (p.accion === "poner" || p.accion === "host") return true;
    if (p.accion === "cambiar") return force;
    return false;
  });
  aPoner = aAplicar.length;

  console.log(`\nResumen: ${aPoner} a escribir, ${aCambiar} bloqueados por --force, ${planes.filter((p) => p.accion === "igual").length} ya correctos.`);
  if (planes.some((p) => p.accion === "nada")) {
    console.log("Los NULL a proposito se quedan con el degradado de ArtistHero como fallback.");
  }

  if (!flags.apply) {
    console.log("\nDRY-RUN. No se ha escrito nada. Con --apply se aplican estos cambios.");
    return;
  }
  if (aPoner === 0) {
    console.log("\nNo habia nada que escribir.");
    return;
  }

  console.log("");
  for (const p of aAplicar) {
    await client.execute({
      sql: `UPDATE artists SET ${p.campo} = ? WHERE name = ?`,
      args: [p.siguiente, p.name],
    });
    console.log(`  ESCRITO ${p.name} ${p.campo}`);
  }
  console.log(`\nAplicados ${aPoner} cambios.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});