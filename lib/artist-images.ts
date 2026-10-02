/**
 * Logica pura de seleccion y verificacion de imagenes de artista.
 *
 * Todo lo que decide SI una imagen sirve vive aqui, sin red y sin DB, para poder
 * testearlo. Los scripts (`artist-image-candidates.ts`, `check-image-urls.ts`,
 * `apply-artist-images.ts`) solo hacen E/S y llaman a estas funciones.
 *
 * Existe porque el modo de fallo que ya costo caro en produccion es una imagen
 * plausible pero falsa: cuando se uso Unsplash para portadas, el buscador
 * devolvio retratos creibles de bandas que no tienen nada que ver (Holger Bonse
 * con un hombre, Greatest Hits con un hombre mayor, Brothers in Arms con un
 * hombre mayor). RC.32 las sustituyo por Cover Art Archive. Una imagen plausible
 * pero falsa es PEOR que ninguna, porque parece correcta y no se detecta.
 *
 * El principio que gobierna el modulo: **"Ninguna imagen sin nombre propio y
 * revisada a ojo."** Por eso devuelve un nivel de atribucion explicito en vez de
 * un booleano, y por eso un archivo sin el nombre del artista se descarta aunque
 * tenga buena pinta: una busqueda de "Radiohead" en Commons devuelve gente con
 * ese nombre y portadas de album, y lo que ya vive en `tracks.cover_image`.
 */

// ---------------------------------------------------------------------------
// Normalizacion de texto
// ---------------------------------------------------------------------------

/** Sin acentos, en minusculas y sin puntuacion. "Björk" y "Bjork" colisionan. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** `File:Björk_in_2007.jpg` -> `bjork in 2007`. */
export function stripFilePrefix(title: string): string {
  let t = title.trim();
  if (/^file:/i.test(t)) t = t.slice(5);
  try {
    t = decodeURIComponent(t);
  } catch {
    // Un "%" suelto no debe tumbar el lote.
  }
  return t.replace(/_/g, " ").replace(/\.(jpe?g|png|gif|svg|webp|tiff?)$/i, "").trim();
}

/**
 * Los parentesis de desambigucion: `Nirvana (band)` -> `band`.
 *
 * Commons los usa para separar homonimos, que es justo el riesgo aqui: un
 * `Queen (chess)` o un `Radiohead (comic)`share nombre con el artista y no son
 * el artista.
 */
export function disambiguationParentheticals(title: string): string[] {
  const out: string[] = [];
  const re = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title)) !== null) {
    const inner = m[1].trim();
    if (inner) out.push(inner);
  }
  return out;
}

/**
 * Parentesis que NO son de desambiguacion sino tecnicos.
 *
 * `(cropped)` es la trampa clasica: parece una aclaracion de homonimo y no lo es.
 * Tratarlo como tal descartaba `David Bowie (135687113) (cropped 2).jpg`, que es
 * buena foto, mientras dejaba pasar los homonimos de verdad.
 */
const TECHNICAL_PARENTHETICAL =
  /^(cropped|cropped\s*\d*|retouched|edited|enhanced|colori[sz]ed|restored|cleaned|b\s*\/?\s*w|black\s+and\s+white|upright|invert(?:ed)?|resized|thumb|derivative)([\s,].*)?$/i;

/**
 * Un parentesis que NO es musical es una senal de homonimo.
 *
 * Solo mira parentesis con texto: los anos van fuera a proposito, porque
 * `Nirvana_around_1992` no dice nada sobre que sea el grupo o una cafeteria.
 */
export function nonMusicParenthetical(title: string): string | null {
  for (const raw of disambiguationParentheticals(title)) {
    const inner = raw.toLowerCase();
    if (TECHNICAL_PARENTHETICAL.test(raw.trim())) continue;
    if (/\d/.test(inner)) continue;
    if (/\b(album|single|ep|disc|discography|cover|track|band|banda|group|grupo|musician|musico|singer|cantante|cantora|songwriter|rock|pop|jazz|hip hop|electronic|electrónica|electro|soul|funk|metal|indie|alternative|clasico|clásico|glam|reggae|dance|orchestra|orquesta|solo|duo|trio|guitarist|bassist|drummer|vocalist|member|integrante)\b/.test(inner)) {
      continue;
    }
    return raw;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Identidad de cada artista
// ---------------------------------------------------------------------------

export interface ArtistIdentity {
  /** Debe coincidir EXACTAMENTE con `artists.name`, porque el UPDATE va por nombre. */
  name: string;
  /** Alias que aparecen en titulos de Commons. */
  aliases: string[];
  /**
   * Terminos normalizados (sin acentos, en minusculas) que tienen que aparecer
   * TODOS en el titulo del archivo para que se atribuya a este artista.
   *
   * Varios y no uno, porque un solo termino abre la puerta a los homonimos:
   * "Bowie" tambien es un apellido comun. Con "david" + "bowie" a la vez, un
   * `David Bowie - Portrait of <alguien>` (donde es el autor, no el sujeto) se
   * descarta por otra regla, pero el resto de homonimos ya no cuelan.
   */
  terms: string[];
  /** Consultas de busqueda. El nombre real primero: "The Weeknd", no "Weeknd". */
  queries: string[];
  /**
   * Parentesis que confirman que el homonimo es el conjunto musical.
   */
  musicParentheticals: string[];
  /**
   * Actuaciones con el mismo nombre que NO son este artista. El caso de
   * "Australian Pink Floyd" es el que mas se repite: es un grupo tribute
   * legalmente protegido que comparte nombre exacto con la banda original, asi
   * que ni el termino ni el contexto de "en vivo" lo delatan. Va como dato y no
   * como regexp porque cada caso es distinto y asi queda a la vista.
   */
  homonyms?: string[];
  /**
   * Releases ya presentes en `tracks.cover_image`. Si el archivo se parece a una
   * de estas, es portada y como avatar no sirve.
   */
  knownReleases: string[];
}

function terms(...parts: string[]): string[] {
  return parts.map(normalizeText).filter((t) => t.length >= 3);
}

export const ARTIST_IDENTITIES: ArtistIdentity[] = [
  {
    name: "Pink Floyd",
    aliases: ["Pink Floyd band"],
    terms: terms("Pink Floyd"),
    queries: [
      "Pink Floyd band portrait",
      "Pink Floyd publicity photo",
      "Pink Floyd press photo",
      "Pink Floyd band members",
      "Pink Floyd live",
    ],
    musicParentheticals: ["band", "banda", "group", "grupo", "rock"],
    knownReleases: ["The Dark Side of the Moon", "Dark Side of the Moon", "The Wall"],
    homonyms: [
      "australian pink floyd",
      "british pink floyd",
      "pink floyd tribute",
      "the pink floyd show",
      "pink floyd experience",
      "floyd forever",
    ],
  },
  {
    name: "Radiohead",
    aliases: ["Radiohead band"],
    terms: terms("Radiohead"),
    queries: [
      "Radiohead band portrait",
      "Radiohead publicity photo",
      "Thom Yorke Radiohead portrait",
      "Radiohead band members",
      "Radiohead live",
    ],
    musicParentheticals: ["band", "banda", "group", "grupo", "rock"],
    knownReleases: ["OK Computer", "Kid A"],
  },
  {
    name: "Björk",
    aliases: ["Bjork"],
    terms: terms("Björk", "Bjork"),
    queries: [
      "Björk portrait",
      "Björk publicity photo",
      "Björk headshot photo",
      "Björk singer",
      "Björk live",
    ],
    musicParentheticals: [
      "singer", "cantante", "cantora", "musician", "musico", "musica",
      "artist", "artista", "band", "banda", "icelandic", "islandesa",
    ],
    knownReleases: ["Vulnicura", "Homogenic", "Post"],
  },
  {
    name: "David Bowie",
    aliases: ["Bowie"],
    terms: terms("David Bowie", "Bowie"),
    queries: [
      "David Bowie publicity photo",
      "David Bowie portrait",
      "David Bowie",
      "David Bowie live",
    ],
    musicParentheticals: [
      "singer", "cantante", "musician", "musico", "musica", "artist",
      "artista", "band", "banda", "british", "britanico",
    ],
    knownReleases: ["Heroes", "Low", "Ziggy Stardust", "Diamond Dogs", "Station to Station"],
  },
  {
    name: "Kraftwerk",
    aliases: [],
    terms: terms("Kraftwerk"),
    queries: [
      "Kraftwerk band portrait",
      "Kraftwerk publicity photo",
      "Kraftwerk press photo",
      "Kraftwerk live",
    ],
    musicParentheticals: [
      "band", "banda", "group", "grupo", "electronic", "electronica",
      "musik", "musical", "rock", "krautrock",
    ],
    knownReleases: [],
  },
  // Los 6 que ya estan revisados a mano desde 2026-09-23. Se listan para que el
  // informe tambien los cubra, pero sus URLs NO estan en CURATED: ya estan
  // escritas en produccion y las fijo alli mismo.
  {
    name: "Kate Bush",
    aliases: ["Kate Bush"],
    terms: terms("Kate Bush"),
    queries: ["Kate Bush singer", "Kate Bush portrait", "Kate Bush live"],
    musicParentheticals: ["singer", "cantante", "musician", "musico", "band", "banda"],
    knownReleases: ["Hounds of Love"],
  },
  {
    name: "Queen",
    aliases: [],
    terms: terms("Queen"),
    queries: ["Queen band", "Queen band members", "Queen live"],
    musicParentheticals: ["band", "banda", "group", "grupo", "rock"],
    knownReleases: ["News of the World", "A Night at the Opera"],
    homonyms: ["queen st", "queen street", "queen's qwik stop", "queen of", "queen mum", "queen city", "queen district"],
  },
  {
    name: "Nirvana",
    aliases: [],
    terms: terms("Nirvana"),
    queries: ["Nirvana band", "Nirvana band members", "Nirvana live"],
    musicParentheticals: ["band", "banda", "group", "grupo", "grunge", "rock"],
    knownReleases: ["Nevermind", "In Utero", "Bleach"],
    homonyms: ["nirvana studios", "nirvana tattoo", "nirvana bar", "nirvana club", "nirvana hotel", "nirvana thai"],
  },
  {
    name: "The Weeknd",
    aliases: ["Weeknd"],
    terms: terms("The Weeknd", "Weeknd"),
    queries: ["The Weeknd", "The Weeknd portrait", "The Weeknd live"],
    musicParentheticals: [
      "singer", "cantante", "musician", "musico", "canadian", "canadiense",
      "artist", "artista", "band", "banda", "concert", "concierto",
    ],
    knownReleases: ["After Hours", "Dawn FM", "My Dear Melancholy"],
  },
  {
    name: "Eagles",
    aliases: ["The Eagles"],
    terms: terms("Eagles"),
    queries: ["Eagles band", "The Eagles band members", "Eagles live"],
    musicParentheticals: ["band", "banda", "group", "grupo", "rock"],
    knownReleases: ["Hotel California"],
  },
  {
    name: "Ed Sheeran",
    aliases: ["Sheeran"],
    terms: terms("Ed Sheeran", "Sheeran"),
    queries: ["Ed Sheeran", "Ed Sheeran portrait", "Ed Sheeran live"],
    musicParentheticals: [
      "singer", "cantante", "musician", "musico", "british", "britanico",
      "artist", "artista", "concert", "concierto",
    ],
    knownReleases: [],
  },
];

export function getArtistIdentity(name: string): ArtistIdentity | undefined {
  const n = normalizeText(name);
  return ARTIST_IDENTITIES.find((a) => normalizeText(a.name) === n);
}

/** Los 5 del catalogo influyente, los que ningun script cubria. */
export const MISSING_IMAGE_ARTISTS: string[] = ARTIST_IDENTITIES.filter((a) =>
  ["Pink Floyd", "Radiohead", "Björk", "David Bowie", "Kraftwerk"].includes(a.name)
).map((a) => a.name);

// ---------------------------------------------------------------------------
// Atribucion: la capa mas dura, y la que decide casi todo
// ---------------------------------------------------------------------------

export type AttributionLevel = "exacto" | "parcial" | "ninguno";

export interface Attribution {
  level: AttributionLevel;
  why: string;
}

/**
 * Contexto que dice "esto es una foto de esa persona", no "esto es otra cosa".
 *
 * Es la unica via, junto a un parentesis musical, para que un nombre desnudo cuente
 * como atribucion exacta. Sin esto, `File:Björk 2008.jpg` y
 * `File:Tuva Björk at the 2025 Film Festival.jpg` se aceptan igual, y la segunda es
 * una actriz.
 */
const MUSIC_CONTEXT =
  /publicity\s?(photo|shot)|press\s?(photo|kit|shot)|promo(tional)?\s?(photo|shot)?|headshot|\bportrait\b|\bperforming\b|\bperformance\b|\bconcert\b|\bconcierto\b|\bon\s?stage\b|\blive\b|\btour\b|\bband\b|\bgroup\s+photo\b|\bband\s+photo\b/i;

/**
 * Decide si un archivo es DE ESE artista o de un homonimo.
 *
 * El nombre en el titulo NO basta. `File:Radiohead (comic series).jpg` y
 * `File:Queen (chess piece).jpg` pasan un `includes` y son justo el fallo que hay
 * que evitar. Por eso `exacto` exige evidencia positiva, por este orden:
 *
 *  1. todos los terminos del artista aparecen, y
 *  2. un parentesis de desambiguacion confirma que el homonimo es el conjunto
 *     musical, o el nombre aparece junto a contexto fotografico ("retrato",
 *     "en vivo", "foto de prensa"), que es como se declara una foto de alguien.
 *
 * Un nombre desnudo se queda en `parcial`, que es `revision`: no se descarta,
 * pero tampoco se escribe solo. Preferimos que un artista siga con la inicial en
 * un circulo antes que ponerle la foto de un tio que se le parece.
 */
export function attributeCandidate(title: string, artist: ArtistIdentity): Attribution {
  const core = normalizeText(stripFilePrefix(title));

  // 0. Actuaciones con el MISMO nombre. Se comprueba antes que nada porque
  //    comparten los terminos exactos y el contexto "en vivo", asi que ninguna
  //    otra regla las para: "Australian Pink Floyd" es un grupo tribute con
  //    nombre casi idéntico y 71 archivos en Commons.
  const namesake = (artist.homonyms ?? []).find((h) => core.includes(normalizeText(h)));
  if (namesake) {
    return {
      level: "ninguno",
      why: `"${namesake}" es otra actuacion con nombre parecido, no ${artist.name}`,
    };
  }

  // 1. Parentesis que apuntan a otra cosa.
  const bad = nonMusicParenthetical(title);
  if (bad) {
    return {
      level: "ninguno",
      why: `el parentesis "(${bad})" no identifica a ${artist.name} como conjunto musical; es un homonimo`,
    };
  }

  // 2. Todos los terminos tienen que aparecer.
  const missing = artist.terms.filter((t) => !core.includes(t));
  if (artist.terms.length > 0 && missing.length > 0) {
    return {
      level: "ninguno",
      why: `el titulo no menciona a ${artist.name} (falta "${missing.join('", "')}")`,
    };
  }

  // 3. "Portrait of <alguien>" significa que el artista es el AUTOR, no el sujeto.
  //    Sin este caso, `Jacob Bjork - Portrait of Georg Gustaf Stal von Holstein`
  //    pasa como retrato de Bjork cuando es un retrato pintado por un pintor cuyo
  //    apellido solo se le parece.
  const ofMatch = core.match(/\b(portrait|photograph|photo|retrato|foto)\s+of\b/);
  if (ofMatch) {
    const lastTerm = artist.terms[artist.terms.length - 1];
    const at = core.indexOf(lastTerm);
    const ofAt = core.indexOf(ofMatch[0]);
    if (at < ofAt) {
      return {
        level: "ninguno",
        why: `"${ofMatch[0]}" de otra persona, ${artist.name} aparece como autor, no como sujeto`,
      };
    }
  }

  // 4. Parentesis musical explicito.
  const musicParen = disambiguationParentheticals(title).find((p) =>
    !TECHNICAL_PARENTHETICAL.test(p.trim()) &&
    !/\d/.test(p) &&
    artist.musicParentheticals.some((mp) => normalizeText(p).includes(normalizeText(mp)))
  );
  if (musicParen) {
    return {
      level: "exacto",
      why: `el parentesis "(${musicParen})" lo identifica como conjunto musical`,
    };
  }

  // 5. El nombre junto a contexto de foto.
  if (MUSIC_CONTEXT.test(stripFilePrefix(title))) {
    const found = stripFilePrefix(title).match(MUSIC_CONTEXT)?.[0].trim();
    return {
      level: "exacto",
      why: `el nombre aparece junto a "${found}", que es como se declara una foto de esa persona`,
    };
  }

  return {
    level: "parcial",
    why: `solo aparece el nombre, sin contexto que confirme que sea ${artist.name} y no un homonimo`,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type ImageRole = "avatar" | "banner";

export interface Candidate {
  title: string;
  description: string;
  date: string;
  license: string;
  author: string;
  width: number;
  height: number;
  url: string;
}

export type CandidateVerdict = "aceptado" | "revision" | "descartado";

export interface ScoredCandidate extends Candidate {
  score: number;
  attribution: Attribution;
  verdict: CandidateVerdict;
  /** Motivos a favor y en contra, en texto, para que la revision sea informada. */
  reasons: string[];
  flags: string[];
  role: ImageRole;
}

const REJECT_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\b(logo|logotype|logotipo)\b/, why: "es un logo, no una foto" },
  { re: /\b(album|single|ep|lp|compilation)\s*(cover|artwork|sleeve|caratula|carátula)\b/, why: "es portada de disco" },
  { re: /\bcover\b/, why: "el titulo dice 'cover'" },
  { re: /\bcaratula\b/, why: "es una caratula" },
  { re: /\b(vinyl|cd|disc|cassette|casete|sleeve|booklet|insert)\b/, why: "es un formato fisico, no un retrato" },
  { re: /\b(poster|pancartada|cartel|flyer|afiche|advertisement|anuncio|advert|stickers|sticker)\b/, why: "es carteleria" },
  { re: /\b(autograph|autografo|autógrafo|signature|firma)\b/, why: "es una firma" },
  { re: /\b(grave|gravestone|tombstone|cementerio|cemetery|memorial|cenotaphio)\b/, why: "es una tumba o memorial" },
  { re: /\b(statue|estatua|monument|monumento|bust|busto|sculpture|escultura)\b/, why: "es una escultura" },
  { re: /\b(banknote|billete|moneda|coin|stamp|sello)\b/, why: "es un objeto impreso" },
  { re: /\b(map|mapa|diagram|chart|grafic|gráfico|infographic)\b/, why: "es un grafico o diagrama" },
  { re: /\bcover\s?(side|band|group)\b/, why: "es un grupo tribute, no el artista" },
  { re: /\btribute\b/, why: "es un grupo tribute, no el artista" },
  { re: /\b(soundalike|lookalike|tribute\s?act)\b/, why: "es un imitador, no el artista" },
  { re: /\b(megaband|supergroup)\b/, why: "es un supergrupo distinto del artista" },
];

const BOOST_PATTERNS: { re: RegExp; why: string; points: number }[] = [
  { re: /publicity\s?(photo|shot)/, why: "foto de prensa oficial", points: 30 },
  { re: /press\s?(photo|kit|shot|conference)/, why: "foto de prensa", points: 25 },
  { re: /\bpromo(tional)?\s?(photo|shot)?\b/, why: "foto promocional", points: 15 },
  { re: /\bportrait\b/, why: "retrato", points: 25 },
  { re: /\bheadshot\b/, why: "primer plano", points: 20 },
  { re: /\b(band\s+photo|group\s+photo)\b/, why: "foto de grupo", points: 20 },
  { re: /\b(live|on\s?stage|performing|performance|concert|concierto|festival|tour)\b/, why: "actuacion en vivo", points: 20 },
  { re: /\bband\b/, why: "menciona al conjunto", points: 8 },
];

function aspectRatio(width: number, height: number): number {
  if (!width || !height) return 0;
  return width / height;
}

/**
 * Puntua un candidato. Separada de la red para poder testearla.
 *
 * Los pesos estan puestos en este orden de prioridad: primero que sea una foto
 * de una persona o de una banda (no un objeto), segundo que la atribucion sea
 * exacta, tercero el encaje de formato. Un `File:..._logo.svg` con la palabra
 * "portrait" en la descripcion no puede ganar: los descartes son duros.
 */
export function scoreCandidate(
  c: Candidate,
  artist: ArtistIdentity,
  role: ImageRole = "avatar"
): ScoredCandidate {
  const titleText = normalizeText(stripFilePrefix(c.title));
  // Sin extension: "Radiohead logo.svg" debe decir "es un logo", no "es un svg".
  const titleNoExt = normalizeText(stripFilePrefix(c.title.replace(/\.[a-z0-9]+$/i, "")));
  // Los descartes miran SOLO el titulo. Si miraran tambien la descripcion,
  // bastaria con que la ficha del archivo mencione "CD" para tirar una foto buena.
  const titleOnly = titleNoExt;
  const hay = `${titleText} ${normalizeText(c.description)}`;
  const reasons: string[] = [];
  const flags: string[] = [];
  let score = 0;

  // 1. Atribucion. Va primero porque decide si el resto tiene sentido.
  const attribution = attributeCandidate(c.title, artist);
  if (attribution.level === "exacto") {
    score += 40;
    reasons.push(attribution.why);
  } else if (attribution.level === "parcial") {
    score += 5;
    flags.push(attribution.why);
  } else {
    flags.push(attribution.why);
  }

  // 2. Descartes duros por tipo de imagen. No se pueden compensar con peso.
  //    La extension va primero: un .webm o un .svg no es una foto de perfil, y
  //    aunque el nombre del archivo sea perfecto.
  //    Primero el tipo y despues la extension: "Radiohead logo.svg" debe decir
  //    "es un logo", no "es un svg". La extension solo pilla lo que se escapa.
  const reject = REJECT_PATTERNS.find((p) => p.re.test(titleOnly));
  if (reject) {
    flags.push(reject.why);
    return {
      ...c, score, attribution, verdict: "descartado", reasons, flags, role,
    };
  }
  const ext = c.title.toLowerCase().match(/\.(webm|ogv|gif|svg|pdf|tif|tiff|djvu|mid|ogg|mp3|mp4)\b/);
  if (ext) {
    flags.push(`el archivo es ${ext[1]}, no una foto`);
    return { ...c, score: score - 60, attribution, verdict: "descartado", reasons, flags, role };
  }

  // 3. Portada de un release que ya tenemos. "The Wall (album).jpg" no vale.
  const asRelease = artist.knownReleases.find((r) => titleOnly.includes(normalizeText(r)));
  if (asRelease) {
    flags.push(`se parece a la portada de "${asRelease}", que ya vive en tracks.cover_image`);
    return {
      ...c, score: score - 60, attribution, verdict: "descartado", reasons, flags, role,
    };
  }

  // 4. Atributos que hacen que sea una foto de alguien.
  for (const b of BOOST_PATTERNS) {
    if (b.re.test(hay)) {
      score += b.points;
      reasons.push(b.why);
    }
  }

  // 5. Formato segun el destino. Un avatar se ve en circulo: casi cuadrado.
  const ar = aspectRatio(c.width, c.height);
  if (role === "avatar") {
    if (ar > 0 && ar <= 1.35) {
      score += 10;
      reasons.push("formato cuadrado, encaja con el avatar en circulo");
    } else if (ar > 2.2) {
      score -= 10;
      flags.push(`muy panoramica (${ar.toFixed(2)}): se recortaria mal en circulo`);
    }
  } else if (role === "banner") {
    if (ar >= 1.5) {
      score += 10;
      reasons.push("panoramica, encaja con el banner");
    } else {
      score -= 10;
      flags.push(`vertical (${ar.toFixed(2)}): no encaja con el banner`);
    }
  }

  // 6. Resolucion minima. Un avatar de 200 px se ve como una mancha.
  const minSide = role === "avatar" ? 500 : 1000;
  if (Math.min(c.width, c.height) >= minSide) {
    score += 5;
    reasons.push(`${c.width}x${c.height}: resolucion suficiente`);
  } else {
    score -= 25;
    flags.push(`${c.width}x${c.height}: por debajo de ${minSide}px, se veria borroso`);
  }

  const verdict: CandidateVerdict =
    attribution.level === "ninguno" ? "descartado"
      : attribution.level === "parcial" ? "revision"
        : "aceptado";

  return { ...c, score, attribution, verdict, reasons, flags, role };
}

/** Los problemas de una linea que hay que mirar antes de mirar la imagen. */
export function attributionSummary(scored: ScoredCandidate): string {
  const head = scored.title.replace(/^File:/i, "");
  const lic = scored.license ? ` | licencia: ${scored.license}` : "";
  const aut = scored.author ? ` | autor: ${scored.author}` : "";
  const when = scored.date ? ` | fecha: ${scored.date}` : "";
  return `${head}${when}${lic}${aut}`;
}

// ---------------------------------------------------------------------------
// Verificacion HTTP
// ---------------------------------------------------------------------------

export type ProbeCode =
  | "ok" | "not-found" | "rate-limited" | "server-error"
  | "not-an-image" | "no-content-type" | "unreachable";

export interface ProbeResult {
  ok: boolean;
  code: ProbeCode;
  note: string;
  /** Si hay que reintentar: 429 y 5xx son transitorios, 404 no. */
  retryable: boolean;
}

/**
 * Decide si una respuesta HEAD sirve una imagen de verdad.
 *
 * El fallo tipico, y el que motiva esto: un host devuelve **HTML con 200** cuando
 * la imagen ya no esta. Un verificador que solo mire el status lo da por bueno y
 * deja un avatar roto en produccion. Se exige `image/*`.
 *
 * El 429 tambien importa: Wikimedia limita las peticiones, asi que un 429 es
 * "no lo se todavia", no "esta roto". Sin distinguirlo, un verificador reporta
 * fallos falsos y hace que se descarte una imagen buena.
 */
export function judgeImageResponse(
  status: number,
  contentType: string | null | undefined
): ProbeResult {
  const ct = (contentType ?? "").split(";")[0].trim().toLowerCase();

  if (status === 429) {
    return { ok: false, code: "rate-limited", note: "429 Wikimedia limita peticiones, reintentar", retryable: true };
  }
  if (status === 404 || status === 410) {
    return { ok: false, code: "not-found", note: `${status} el archivo no existe`, retryable: false };
  }
  if (status >= 500) {
    return { ok: false, code: "server-error", note: `${status} error del servidor`, retryable: true };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, code: "not-found", note: `${status} respuesta inesperada`, retryable: false };
  }
  if (!ct) {
    return { ok: false, code: "no-content-type", note: "sin content-type, no se puede confirmar que sea imagen", retryable: true };
  }
  if (!ct.startsWith("image/")) {
    return { ok: false, code: "not-an-image", note: `200 pero content-type "${ct}", no es imagen`, retryable: false };
  }
  return { ok: true, code: "ok", note: `${status} ${ct}`, retryable: false };
}

export function unreachableResult(message: string): ProbeResult {
  return { ok: false, code: "unreachable", note: message.split("\n")[0].slice(0, 120), retryable: true };
}

// ---------------------------------------------------------------------------
// Hosts de Wikimedia
// ---------------------------------------------------------------------------

/**
 * `thumb.wikimedia.org` es un alias historico: responde, pero nadie lo ha
 * verificado nunca porque los verificadores Antiguos solo miraban
 * `images.unsplash.com`. Se canonicaliza a `upload.wikimedia.org`, que es el
 * host de origen real y el que documenta Wikimedia. La funcion es pura y
 * reversible, asi que el mismo archivo con dos hosts se detecta como el mismo.
 */
const WIKIMEDIA_HOSTS = ["upload.wikimedia.org", "thumb.wikimedia.org", "commons.wikimedia.org"];

export function isWikimediaHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "upload.wikimedia.org" || h.endsWith(".wikimedia.org");
  } catch {
    return false;
  }
}

export function canonicalizeWikimediaUrl(url: string): string {
  if (!isWikimediaHost(url)) return url;
  return url.replace(/^(https?:)\/\/thumb\.wikimedia\.org\//i, "$1//upload.wikimedia.org/");
}

/** Hosts que funcionan pero no son el canonico. Para el informe, no para fallar. */
export function deprecatedWikimediaHosts(url: string): string[] {
  const out: string[] = [];
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h !== "upload.wikimedia.org" && WIKIMEDIA_HOSTS.includes(h)) out.push(h);
  } catch {
    // URL invalida: la reporta judgeImageResponse, no esta.
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI: el default de todo script de datos es dry-run
// ---------------------------------------------------------------------------

export interface ScriptFlags {
  apply: boolean;
  dryRequested: boolean;
  /**
   * Artistas a los que se limita la corrida, en minusculas. Vacio = todos.
   * `--only=<artista>` acepta lista separada por comas o espacios.
   */
  only: string[];
  /** Texto para el banner que va al principio de la salida. */
  label: string;
}

/**
 * `--apply` es la unica forma de escribir. Sin el, dry-run, aunque no se pase
 * ningun flag.
 *
 * Se invierte el default del script que uso Unsplash, que era `--dry` opcional y
 * escribir por defecto: un script de datos que escribe en produccion sin que se
 * lo pidan explicitamente es un pie dangerous, y mas aqui, donde las escrituras
 * van contra Turso y no hay vuelta atras.
 */
export function parseScriptFlags(argv: readonly string[]): ScriptFlags {
  const apply = argv.includes("--apply");
  const dryRequested = argv.includes("--dry") || argv.includes("--dry-run");
  // `--only="Pink Floyd,Radiohead"`.
  //
  // Se parte **solo por comas**, nunca por espacios: los nombres de artista
  // llevan espacios ("Pink Floyd", "David Bowie", "The Weeknd"), y partir por
  // espacios los rompe en tokens que no coinciden nunca con la clave. Un filtro
  // que no puede seleccionar es peor que no tener filtro, porque parece funcionar.
  const only = argv
    .filter((a) => a.startsWith("--only="))
    .flatMap((a) => a.slice("--only=".length).split(","))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return { apply, dryRequested, only, label: apply ? "APLICANDO" : "DRY-RUN (sin escrituras)" };
}