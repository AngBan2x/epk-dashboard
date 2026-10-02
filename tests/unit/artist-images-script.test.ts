/**
 * Tests de la logica de seleccion de imagenes de artista.
 *
 * Sin red: todo lo que decide aqui son funciones puras de `lib/artist-images.ts`.
 * Los scripts que si pegan a Wikimedia quedan fuera a proposito; lo que se prueba
 * aqui es el filtro, que es justo la parte que decidio que se colaran imagenes
 * falsas.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  ARTIST_IDENTITIES,
  MISSING_IMAGE_ARTISTS,
  attributeCandidate,
  canonicalizeWikimediaUrl,
  deprecatedWikimediaHosts,
  disambiguationParentheticals,
  getArtistIdentity,
  isWikimediaHost,
  judgeImageResponse,
  normalizeText,
  parseScriptFlags,
  scoreCandidate,
  stripFilePrefix,
  type ArtistIdentity,
  type Candidate,
  type ImageRole,
} from "@/lib/artist-images";

const radiohead = getArtistIdentity("Radiohead") as ArtistIdentity;
const bjork = getArtistIdentity("Björk") as ArtistIdentity;
const bowie = getArtistIdentity("David Bowie") as ArtistIdentity;
const pinkFloyd = getArtistIdentity("Pink Floyd") as ArtistIdentity;

function cand(over: Partial<Candidate> = {}): Candidate {
  return {
    title: "File:Radiohead performing live.jpg",
    description: "",
    date: "2019-01-01",
    license: "CC BY-SA 4.0",
    author: "Alguien",
    width: 2000,
    height: 1500,
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/1280px-x.jpg",
    ...over,
  };
}

describe("normalizacion", () => {
  it("quita acentos para que Bjork y Björk colisionen", () => {
    expect(normalizeText("Björk")).toBe("bjork");
    expect(normalizeText("BJÖRK")).toBe("bjork");
  });

  it("quita el prefijo File: y la extension", () => {
    expect(stripFilePrefix("File:Björk_in_2007.jpg")).toBe("Björk in 2007");
    expect(stripFilePrefix("File:Björk_in_2007.PNG")).toBe("Björk in 2007");
  });

  it("decodifica el %20 que deja la API de Commons", () => {
    expect(stripFilePrefix("File:Ed_Sheeran_Concert%2C_Bangalore.jpg")).toBe(
      "Ed Sheeran Concert, Bangalore"
    );
  });

  it("extrae los parentesis de desambiguacion", () => {
    expect(disambiguationParentheticals("Nirvana (band) 1992 (cropped)")).toEqual([
      "band",
      "cropped",
    ]);
  });
});

describe("atribucion: el filtro que decide si la imagen es de ESE artista", () => {
  it("acepta un parentesis que confirma que es el conjunto musical", () => {
    const r = attributeCandidate("File:Nirvana (band) 1992.jpg", getArtistIdentity("Nirvana")!);
    expect(r.level).toBe("exacto");
  });

  it("RECHAZA un parentesis que apunta a otra cosa aunque el nombre este", () => {
    // Este es el fallo real: un `includes` lo daria por bueno.
    const r = attributeCandidate("File:Radiohead (comic series).jpg", radiohead);
    expect(r.level).toBe("ninguno");
    expect(r.why).toMatch(/homonimo/);
  });

  it("RECHAZA un titulo que no menciona al artista", () => {
    const r = attributeCandidate("File:Thom Yorke in Concert.jpg", radiohead);
    expect(r.level).toBe("ninguno");
    expect(r.why).toMatch(/no menciona/);
  });

  it("deja en revision un nombre desnudo, sin escribirlo solo", () => {
    const r = attributeCandidate("File:Radiohead 2005.jpg", radiohead);
    expect(r.level).toBe("parcial");
  });

  it("acepta el nombre junto a contexto de foto (retrato, en vivo)", () => {
    expect(attributeCandidate("File:Radiohead live concert Berlin.jpg", radiohead).level).toBe("exacto");
    expect(attributeCandidate("File:Radiohead portrait 2016.jpg", radiohead).level).toBe("exacto");
  });

  it("(cropped) es tecnico, no de desambiguacion", () => {
    // Tratar (cropped) como parentesis de homonimo descartaba esta foto buena.
    const r = attributeCandidate("File:David Bowie (135687113) (cropped 2).jpg", bowie);
    expect(r.level).not.toBe("ninguno");
  });

  it("un ano entre parentesis no convierte a nadie en homonimo", () => {
    expect(attributeCandidate("File:Pink Floyd Animals Tour 1977.jpg", pinkFloyd).level).toBe("exacto");
  });

  it("RECHAZA cuando el artista es el autor del retrato y no el sujeto", () => {
    // Pintor cujo apellido solo se parece: sin este caso pasaba como retrato de Bjork.
    const r = attributeCandidate(
      "File:Jacob Bjork - Portrait of Georg Gustaf Stal von Holstein.jpg",
      bjork
    );
    expect(r.level).toBe("ninguno");
  });

  it("el alias que solo es una variante de acento NO da atribucion exacta", () => {
    // El bug: "Bjork" como alias hacia que cualquier nombre desnudo contara como exacto.
    const r = attributeCandidate("File:TUVA Bjork en la alfombra roja.jpg", bjork);
    expect(r.level).toBe("parcial");
  });
});

describe("scoring", () => {
  const role = (r: ImageRole = "avatar") => r;

  it("PENALIZA una portada de album como avatar", () => {
    const cover = scoreCandidate(
      cand({ title: "File:Radiohead OK Computer (album cover).jpg" }),
      radiohead,
      role()
    );
    const foto = scoreCandidate(
      cand({ title: "File:Radiohead performing live.jpg" }),
      radiohead,
      role()
    );
    expect(cover.verdict).toBe("descartado");
    expect(foto.verdict).toBe("aceptado");
    expect(foto.score).toBeGreaterThan(cover.score);
    expect(cover.flags.join(" ")).toMatch(/cover|portada/i);
  });

  it("PENALIZA un logo", () => {
    const logo = scoreCandidate(
      cand({ title: "File:Radiohead logo.svg", description: "El logo de la banda" }),
      radiohead,
      role()
    );
    expect(logo.verdict).toBe("descartado");
    expect(logo.flags.join(" ")).toMatch(/logo/);
  });

  it("no deja que la descripcion resucite un logo", () => {
    // El titulo manda: si no, bastaba con poner "logo" en la ficha del archivo.
    const logo = scoreCandidate(
      cand({ title: "File:Radiohead 2019.jpg", description: "Logo oficial de la banda" }),
      radiohead,
      role()
    );
    expect(logo.verdict).not.toBe("aceptado");
  });

  it("ACEPTA 'publicity photo' y 'concert'", () => {
    const prensa = scoreCandidate(
      cand({ title: "File:Pink Floyd publicity photo 1971.jpg" }),
      pinkFloyd,
      role()
    );
    const concierto = scoreCandidate(
      cand({ title: "File:Radiohead concert Berlin 2018.jpg" }),
      radiohead,
      role()
    );
    expect(prensa.verdict).toBe("aceptado");
    expect(concierto.verdict).toBe("aceptado");
    expect(prensa.score).toBeGreaterThan(0);
    expect(concierto.score).toBeGreaterThan(0);
  });

  it("PREMIALIZA 'publicity photo' frente a una foto sin contexto", () => {
    const conPrensa = scoreCandidate(
      cand({ title: "File:Radiohead publicity photo.jpg" }),
      radiohead,
      role()
    );
    const sinPrensa = scoreCandidate(
      cand({ title: "File:Radiohead stage 3.jpg" }),
      radiohead,
      role()
    );
    expect(conPrensa.score).toBeGreaterThan(sinPrensa.score);
  });

  it("DESCARTA un grupo tribute aunque ponga el nombre del artista", () => {
    const tribute = scoreCandidate(
      cand({ title: "File:Welcome To The Machine Pink Floyd Tribute Band.jpg" }),
      pinkFloyd,
      role()
    );
    expect(tribute.verdict).toBe("descartado");
    expect(tribute.flags.join(" ")).toMatch(/tribute/i);
  });

  it("marca para revision lo que no puede confirmar", () => {
    const r = scoreCandidate(cand({ title: "File:Radiohead 2005.jpg" }), radiohead, role());
    expect(r.verdict).toBe("revision");
    expect(r.flags.length).toBeGreaterThan(0);
  });

  it("penaliza una imagen pequena", () => {
    const grande = scoreCandidate(
      cand({ title: "File:Radiohead live.jpg", width: 3000, height: 2000 }),
      radiohead,
      role()
    );
    const pequena = scoreCandidate(
      cand({ title: "File:Radiohead live.jpg", width: 300, height: 200 }),
      radiohead,
      role()
    );
    expect(grande.flags).not.toContain(pequena.flags[0] ?? "x");
    expect(pequena.flags.join(" ")).toMatch(/bajo|borroso/);
  });

  it("un avatar panoramico puntua peor que uno cuadrado", () => {
    const cuadrado = scoreCandidate(
      cand({ title: "File:Radiohead portrait.jpg", width: 1000, height: 1000 }),
      radiohead,
      "avatar"
    );
    const panoramica = scoreCandidate(
      cand({ title: "File:Radiohead portrait.jpg", width: 3000, height: 500 }),
      radiohead,
      "avatar"
    );
    expect(cuadrado.score).toBeGreaterThan(panoramica.score);
  });

  it("para banner, la panoramica gana", () => {
    const panoramica = scoreCandidate(
      cand({ title: "File:Radiohead live stage.jpg", width: 2400, height: 800 }),
      radiohead,
      "banner"
    );
    const cuadrada = scoreCandidate(
      cand({ title: "File:Radiohead live stage.jpg", width: 800, height: 800 }),
      radiohead,
      "banner"
    );
    expect(panoramica.score).toBeGreaterThan(cuadrada.score);
  });

  it("devuelve los motivos para que la revision visual sea informada", () => {
    const r = scoreCandidate(
      cand({ title: "File:Pink Floyd publicity photo 1971.jpg", license: "CC BY 2.0", author: "FOT" }),
      pinkFloyd,
      role()
    );
    expect(r.reasons.join(" ")).toMatch(/prensa/);
    expect(r.license).toBe("CC BY 2.0");
    expect(r.author).toBe("FOT");
  });
});

describe("verificacion HTTP", () => {
  it("ACEPTA 200 con content-type de imagen", () => {
    const r = judgeImageResponse(200, "image/jpeg");
    expect(r.ok).toBe(true);
  });

  it("RECHAZA content-type text/html aunque el status sea 200", () => {
    // El fallo tipico de Wikimedia: HTML con 200 cuando el archivo ya no esta.
    const r = judgeImageResponse(200, "text/html; charset=utf-8");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("not-an-image");
  });

  it("RECHAZA 200 sin content-type", () => {
    expect(judgeImageResponse(200, null).code).toBe("no-content-type");
  });

  it("acepta image/svg+xml y acepta los parametros del content-type", () => {
    expect(judgeImageResponse(200, "image/svg+xml; charset=utf-8").ok).toBe(true);
    expect(judgeImageResponse(200, "IMAGE/JPEG").ok).toBe(true);
  });

  it("distingue 404 de 429: 404 no se reintenta, 429 si", () => {
    expect(judgeImageResponse(404, "image/jpeg").retryable).toBe(false);
    const ratelimit = judgeImageResponse(429, "image/jpeg");
    expect(ratelimit.retryable).toBe(true);
    expect(ratelimit.code).toBe("rate-limited");
  });

  it("trata 5xx como transitorio", () => {
    expect(judgeImageResponse(503, null).retryable).toBe(true);
  });
});

describe("hosts de Wikimedia", () => {
  it("reconoce upload.wikimedia.org y sus subdominios", () => {
    expect(isWikimediaHost("https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg")).toBe(true);
    expect(isWikimediaHost("https://thumb.wikimedia.org/wikipedia/commons/a/ab/x.jpg")).toBe(true);
  });

  it("no confunde Unsplash con Wikimedia", () => {
    expect(isWikimediaHost("https://images.unsplash.com/photo-1?w=600")).toBe(false);
  });

  it("no explota con una URL invalida", () => {
    expect(isWikimediaHost("no-es-una-url")).toBe(false);
    expect(deprecatedWikimediaHosts("no-es-una-url")).toEqual([]);
  });

  it("canonicaliza el alias thumb.wikimedia.org al host de origen", () => {
    // El bug de la ola: un alias historico que nadie habia verificado.
    const antes = "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/22/x.jpg/1280px-x.jpg";
    const despues = canonicalizeWikimediaUrl(antes);
    expect(despues).toContain("upload.wikimedia.org");
    expect(despues).not.toContain("thumb.wikimedia.org");
  });

  it("avisa del host alias en vez de fallar, porque responde", () => {
    expect(
      deprecatedWikimediaHosts("https://thumb.wikimedia.org/wikipedia/commons/a/ab/x.jpg")
    ).toEqual(["thumb.wikimedia.org"]);
    expect(deprecatedWikimediaHosts("https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg")).toEqual([]);
  });

  it("deja intacta una URL que no es de Wikimedia", () => {
    const u = "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&q=80";
    expect(canonicalizeWikimediaUrl(u)).toBe(u);
  });
});

describe("CLI: el default de los scripts de datos es dry-run", () => {
  it("sin flags NO escribe", () => {
    expect(parseScriptFlags([]).apply).toBe(false);
  });

  it("solo --apply escribe", () => {
    expect(parseScriptFlags(["--apply"]).apply).toBe(true);
  });

  it("--dry explicito tambien es dry-run", () => {
    const f = parseScriptFlags(["--dry"]);
    expect(f.apply).toBe(false);
    expect(f.dryRequested).toBe(true);
  });

  it("ningun script escribe sin --apply", () => {
    // Guarda contra la regresion: el script que uso Unsplash tenia el default
    // inverso (`--dry` opcional y escribir por defecto).
    const scripts = [
      "apply-artist-images.ts",
      "artist-image-candidates.ts",
      "check-image-urls.ts",
    ];
    for (const s of scripts) {
      const src = fs.readFileSync(path.join(process.cwd(), "scripts", s), "utf8");
      expect(src, `${s} debe salir por parseScriptFlags`).toMatch(/parseScriptFlags|judgeImageResponse|scoreCandidate/);
      expect(src, `${s} no debe invertir el default`).not.toMatch(/DRY\s*=\s*!.*--dry/);
    }
    expect(fs.existsSync(path.join(process.cwd(), "scripts", "seed-artist-images.ts"))).toBe(false);
  });
});

describe("cobertura del catalogo", () => {
  it("cubre los 5 artistas que faltaban y tambien los 6 ya revisados", () => {
    expect(MISSING_IMAGE_ARTISTS.sort()).toEqual(
      ["Björk", "David Bowie", "Kraftwerk", "Pink Floyd", "Radiohead"].sort()
    );
    const nombres = ARTIST_IDENTITIES.map((a) => a.name);
    for (const n of [
      "Kate Bush", "Queen", "Nirvana", "The Weeknd", "Eagles", "Ed Sheeran",
      "Pink Floyd", "Radiohead", "Björk", "David Bowie", "Kraftwerk",
    ]) {
      expect(nombres).toContain(n);
    }
  });

  it("cada artista declara como se busca, para no buscar el alias equivocado", () => {
    for (const a of ARTIST_IDENTITIES) {
      expect(a.queries.length).toBeGreaterThan(0);
      expect(a.musicParentheticals.length).toBeGreaterThan(0);
    }
  });

  it("los terminos de identificacion no son trivialmente cortos", () => {
    for (const a of ARTIST_IDENTITIES) {
      expect(a.terms.length).toBeGreaterThan(0);
      for (const t of a.terms) expect(t.length).toBeGreaterThanOrEqual(3);
    }
  });
});