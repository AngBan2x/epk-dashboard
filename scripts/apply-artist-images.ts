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
  //
  // **Los 5 tienen ya las dos imagenes.** Pink Floyd, Radiohead y Kraftwerk
  // entraron con `profile: null` y el motivo era el mismo en los tres: en
  // Commons no hay retrato de grupo de una banda, hay escenario. Ese motivo
  // sigue siendo cierto, pero la conclusion que se habia sacado —dejar el
  // avatar vacio y que pusiese el degradado— ya no: la peticion es que ningun
  // artista se quede sin imagen, y un avatar con una foto real de la banda es
  // mejor que un circulo de degradado. Asi que en los tres se eligio la foto de
  // escenario **menos mala**, mirando las candidatas una a una.
  //
  // Lo que no se hizo, y conviene tener escrito para no volver a proponerlo: se
  // descarto usar el logotipo SVG de la banda que hay en Commons. Un wordmark
  // al lado de los otros nueve artistas, que si tienen fotografia, rompe la
  // serie visual del catalogo.
  // ------------------------------------------------------------------

  "Pink Floyd": {
    // Sin retrato de grupo en Commons: las cuatro candidatas que pasan el
    // verificador son de Live 8. Se descargaron las cuatro y se miraron.
    //
    // Las dos de 2048x1536 dejan a la banda diminuta en una franja baja, con la
    // proyeccion luminosa del fondo ocupando el encuadre: en un circulo de 80 px
    // sale luz morada y ningun cuerpo. La de 1753x890 es lejana tambien.
    //
    // Esta es la unica que aguanta el recorte, y por un motivo concreto: 2048x896
    // es 2,29:1, de manera que al pasar a circulo se recorta **a lo ancho**, no a
    // lo alto. Se conservan las cuatro figuras y el muro rojo iluminado, y el
    // centro del circulo cae sobre Mason y Waters, que es lo que queda de verdad
    // dentro del radio. No es un retrato y no pretende serlo: es una foto de la
    // banda tocando, y aun asi es mas legible que el degradado.
    profile:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/London%2C_Live_8%2C_Pink_Floyd_%28cropped%29.jpg/1280px-London%2C_Live_8%2C_Pink_Floyd_%28cropped%29.jpg",
    banner:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Pink_Floyd_at_Live_8%2C_London.jpg/1280px-Pink_Floyd_at_Live_8%2C_London.jpg",
    creditos:
      "Dave Bushe, CC BY 2.0 - Live 8, Londres (perfil) / Jon Lean, CC BY-SA 2.0 - Live 8, Londres (banner)",
  },
  Radiohead: {
    // Mismo caso que Pink Floyd, y aqui hay mas donde elegir: Commons tiene seis
    // tomas del Uber Arena de 2025 y todas son la banda en el escenario.
    //
    // Se eligio la 01 porque es la que mejor aguanta el recorte en circulo de las
    // seis: es 3:2, asi que al pasar a cuadrado se recorta a lo ancho y el centro
    // se queda con Thom Yorke de frente y con la cara visible, con los dos
    // companeros a los lados. En las demas —las numeradas 02, 09, 13, 26 y 32— las
    // figuras salen mas pequenas o de perfil, y a 80 px no se distinguen.
    //
    // Aqui si que hay una foto de una persona, no del grupo: es una banda con voz
    // principal y el avatar lo representa, que es como se representa a casi
    // cualquier banda rock en un cartel.
    profile:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/2025_Radiohead_live_concert_at_Uber_Arena%2C_Berlin_01.jpg/1280px-2025_Radiohead_live_concert_at_Uber_Arena%2C_Berlin_01.jpg",
    banner:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/2025_Radiohead_live_concert_at_Uber_Arena%2C_Berlin_07.jpg/1280px-2025_Radiohead_live_concert_at_Uber_Arena%2C_Berlin_07.jpg",
    creditos: "Raph_PH, CC BY 4.0 - Uber Arena, Berlin, 2025",
  },
  // ------------------------------------------------------------------
  // **Björk entra** (2026-10-06), y solo con el perfil.
  //
  // El veredicto sobre Björk ya estaba escrito más abajo en este mismo bloque,
  // y era el contrario que el de Bowie: la candidata
  // https://upload.wikimedia.org/wikipedia/commons/9/98/Bj%C3%B6rk_performing_at_Cirque_en_Chantier_1_e
  // es 1000×1416, vertical, **centrada y ocupando el encuadre**, así que en el
  // recorte circular del avatar funciona: se ve la cara y el tocado naranja. Es
  // una foto de escenario con grano, pero el contraste es real.
  //
  // El **banner sigue en NULL**, y por lo que ya decía el comentario: no hay
  // panorámica decente. La única ("Björk live Paris 2023") sale casi negra con
  // la artista diminuta al fondo, y eso de fondo es peor que el degradado que
  // pone `ArtistHero`.
  //
  // El nombre del fichero se ha vuelto a sacar de `artist-image-candidates.ts`,
  // no de memoria: la primera versión de esta entrada.endswith `..._1_electrum_
  // %28Unsplash%29.jpg`, inventada al completar el comentario que estaba
  // truncado, y daba **404**. El dry-run lo cazó antes de escribir nada, que es
  // justo para lo que está. El correcto es `..._1_edit.jpg`.
  //
  // Bowie sigue fuera por su motivo, que es el del principio del bloque.
  "Björk": {
    profile:
      "https://upload.wikimedia.org/wikipedia/commons/9/98/Bj%C3%B6rk_performing_at_Cirque_en_Chantier_1_edit.jpg",
    // Banner: el "live Paris 2023" que motivaba dejar esto en NULL está
    // **descartado a propósito**: la mitad izquierda es negro puro y la artista
    // sale diminuta al fondo. Con el degradado de `ArtistHero` encima quedaba un
    // rectángulo negro; con esta foto, un escenario real.
    //
    // 2538x1692 panorámica, muy bien expuesta, con público y lasers. Björk es la
    // figura blanca del centro. Es foto de concierto y ella no es la
    // protagonista del encuadre —para eso está el avatar—, pero como franja
    // panorámica funciona, y es lo que se buscaba: que ningún artista se quede
    // sin imagen.
    banner:
      "https://upload.wikimedia.org/wikipedia/commons/c/c9/Bj%C3%B6rk_-_Volta_Tour_a_Verona_-_2712755835.jpg",
    creditos: "Rlef89, CC BY-SA 2.0 (perfil) / ecodallaluna, CC BY-SA 2.0 (banner)",
  },
  // ------------------------------------------------------------------
  // **David Bowie entra entero** (2026-10-06), con las dos imágenes.
  //
  // Estaba fuera porque la candidata de entonces era inútil, y el motivo sigue
  // siendo cierto **para esa foto**: `David_Bowie_Live_1974.jpg` es 1280x1280
  // con Bowie en el tercio derecho y el 40% izquierdo negro puro, así que el
  // recorte circular centrado salía negro con una franja de traje blanco.
  //
  // El error no era "no hay foto de Bowie": era que se miró **una** candidata y
  // se descartó **al artista**. Las de abajo se eligieron mirando las fotos, no
  // por la puntuación del verificador —que ya había aceptado la mala con 75—.
  //
  // `artist-image-candidates.ts` las propose como aceptadas; lo que faltaba era
  // el criterio de encuadre, y ese no es automático.
  // ------------------------------------------------------------------
  "David Bowie": {
    // 1043x1033, retrato de estudio en B/N, **cuadrado**, sujeto centrado y
    // fondo de degradado limpio. La cara cae a 0,35 del centro en un eje de 1,0,
    // así que queda dentro del radio 0,5 del círculo: entra cabeza y torso, que
    // es lo que se busca en un avatar de 80 px.
    profile:
      "https://upload.wikimedia.org/wikipedia/commons/a/a2/David_Bowie_-_1983_Let%27s_Dance_Promo_003.jpg",
    // 1280x720, que es **exactamente** la proporción de la franja del hero
    // (`h-48 md:h-64` a ancho completo): no hay recorte que perder. Bowie a la
    // izquierda con la caña, Dick Cavett a la derecha, bien expuesta.
    banner:
      "https://upload.wikimedia.org/wikipedia/commons/2/2b/David_Bowie_and_Dick_Cavett_%22The_Dick_Cavett_Show%22_%281974_ABC_press_photo%29.jpg",
    creditos: "Greg Gorman / EMI America, dominio publico (perfil) · ABC Television, dominio publico (banner)",
  },
  Kraftwerk: {
    // El verificador propuso seis, y dos se descartaron sin llegar a mirar la
    // foto entera: `Stefan Pfaffe Kraftwerk live.jpg` y `Kraftwerk live.jpg`
    // (Roskilde, 2013) son retratos de **una persona concreta** —Stefan Pfaffe y
    // Ralf Huetter—, por mucho que el titulo diga "Kraftwerk". Poner a un miembro
    // suelto para representar a la banda es justo lo que el bloque de Bowie mas
    // abajo explica que no hay que hacer, asi que no.
    //
    // De las que si son la banda, `Kraftwerk on stage.jpg` se cae sola: los dos
    // musicos estan en los extremos y el centro del encuadre es **pared teal
    // vacia**, que es justo lo que ocupa el circulo. Y la de Stockholm (dominio
    // publico, 850 px) tiene el cartel verde "COMPUTERWORLD" ocupando las dos
    // terceras partes, con la banda enana debajo.
    //
    // La que gana es la de Genoa 2023: las cuatro figuras con mono rojo y, detras,
    // el "MACHINE" blanco sobre negro. Al recortar a cuadrado el centro cae
    // sobre la tipografia, que a 80 px es lo mas legible de las seis y hace de
    // marca reconocible aunque el resto no se distinga.
    profile:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Kraftwerk_-_Live_at_Arena_Del_Mare%2C_Genoa_%28July_8th%2C_2023%29_-_9464.jpg/1280px-Kraftwerk_-_Live_at_Arena_Del_Mare%2C_Genoa_%28July_8th%2C_2023%29_-_9464.jpg",
    banner:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Kraftwerk_live_07.09.1981_Nakano_Sun_Plaza_Tokyo.jpg/1280px-Kraftwerk_live_07.09.1981_Nakano_Sun_Plaza_Tokyo.jpg",
    creditos:
      "Luca Dell'Orto, CC BY-SA 4.0 - Genoa, 2023 (perfil) / CC BY 2.5 - Nakano Sun Plaza, Tokio, 1981 (banner)",
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
// `--only=<artista>`: el mapa es curado a mano y no todas las entradas valen
    // para todos los campos. Conviene comprobar el arte **y** la composición antes
    // de escribir: una foto correcta de la persona equivocada es peor que
    // ninguna, y una buena foto en el hueco equivocado también (un retrato
    // apaisado con el sujeto en el tercio derecho, recortado en un círculo de
    // 40px, sale casi negro).
    if (flags.only.length > 0 && !flags.only.includes(name.toLowerCase())) {
      continue;
    }
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