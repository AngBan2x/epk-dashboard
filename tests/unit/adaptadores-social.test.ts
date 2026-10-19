/**
 * P13 — Los seis adaptadores, probados contra una capa HTTP falsa.
 *
 * ## Qué prueba esto y qué no
 *
 * **Sí:** que cada adaptador envía el cuerpo, la ruta y el orden de llamadas que
 * dice la documentación; que valida antes de enviar; que un error de la API se
 * propaga en vez de disfrazarse de éxito; y que `redactar()` recorta lo que tiene
 * que recortar y avisa de lo que no sabe.
 *
 * **No:** que la API acepte el cuerpo. Eso necesita una credencial real, y esta
 * fase termina justo antes de tenerla. El riesgo asumido está escrito en
 * `docs/PHASE_P13.md`: si un payload está mal, el fallo aparece al probar contra
 * la API de verdad, no aquí.
 *
 * ## Por qué la capa es un parámetro y no un `vi.mock`
 *
 * Porque los adaptadores reciben `http` por opción. Un doble de red global no
 * dejaría ver qué URL se pidió, que es justo lo que hay que comprobar: en
 * Threads el host es `graph.threads.net` y no `graph.facebook.com`, y en LinkedIn
 * el texto va en `commentary` y no en `text`.
 *
 * ## La capa falla si la llaman más veces de las previstas
 *
 * Una llamada de más en una API de publicación es una publicación duplicada, y
 * con una capa que devuelve siempre lo mismo no se detectaría. Por eso la cola
 * está acotada y la última llamada revienta.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { abrirSesion, crearAdaptador as crearBluesky } from "@/lib/social/bluesky";
import { crearAdaptador as crearThreads } from "@/lib/social/threads";
import { crearAdaptador as crearInstagram } from "@/lib/social/instagram";
import { crearAdaptador as crearFacebook } from "@/lib/social/facebook";
import { crearAdaptador as crearLinkedin } from "@/lib/social/linkedin";
import { crearAdaptador as crearMastodon } from "@/lib/social/mastodon";

import type { CapaHttp, Publicacion } from "@/lib/social/tipos";
import { LIMITES, cabeElTexto, contarGraphemes, limiteDeTexto } from "@/lib/social/limites";

interface Llamada {
  url: string;
  init: RequestInit;
}

/** Bytes de imagen: la respuesta de una descarga no es JSON. */
const BYTES = () => new Response(new Uint8Array([1, 2, 3]));

function capa(respuestas: (unknown | Response)[]): { http: CapaHttp; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  let i = 0;
  const http: CapaHttp = async (url, init) => {
    llamadas.push({ url, init });
    if (i >= respuestas.length) {
      throw new Error(`Llamada inesperada a ${url}: solo se esperaban ${respuestas.length}`);
    }
    const cuerpo = respuestas[i++];
    if (cuerpo instanceof Response) return cuerpo;
    return new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { http, llamadas };
}

const textoLargo = (n: number) => "a".repeat(n);

const pub = (texto = "Hola", imagenes: string[] = []): Publicacion => ({
  texto,
  imagenes: imagenes.map((url) => ({ url })),
});

const IMG = "https://epk-dashboard.vercel.app/pressplay/release-desktop-light.jpg";

/**
 * Lee una cabecera de una llamada, sea cual sea la forma de `HeadersInit`.
 *
 * `HeadersInit` es `Headers | string[][] | Record<string, string>`, así que
 * indexarlo con una cadena no compila en modo estricto. Normalizarlo aquí
 * evita el `as` en cada aserción, que es la forma de que un `as` mal puesto
 * termine affirmando algo que nunca se comprobó.
 */
function cabeceraDe(llamada: Llamada, nombre: string): string | undefined {
  const h = llamada.init.headers;
  if (h === undefined) return undefined;
  if (h instanceof Headers) return h.get(nombre) ?? undefined;
  if (Array.isArray(h)) return Object.fromEntries(h)[nombre];
  return h[nombre];
}

describe("la tabla de límites es la fuente de verdad", () => {
  it("los verificados tienen número y los no verificados son null, no inventados", () => {
    expect(limiteDeTexto("bluesky")).toBe(300);
    expect(limiteDeTexto("threads")).toBe(500);
    // Estos tres NO están publicados en la API. Rellenarlos de memoria sería
    // inventar, y el test cae justo para que no se pueda hacer en silencio.
    expect(limiteDeTexto("instagram")).toBeNull();
    expect(limiteDeTexto("facebook")).toBeNull();
    expect(limiteDeTexto("linkedin")).toBeNull();
  });

  it("`cabeElTexto` dice que no cuando no sabe, no que sí", () => {
    // El fallo peligroso sería devolver `true` por defecto. Ante la duda se
    // recorta de más: un post corto que vale se corrige; uno largo que sale sin
    // querer ya no.
    expect(cabeElTexto("threads", "corto")).toBe(true);
    expect(cabeElTexto("threads", textoLargo(501))).toBe(false);
    expect(cabeElTexto("instagram", "cualquier cosa")).toBe(false);
  });

  it("cuenta graphemes, no unidades UTF-16", () => {
    // Un emoji de familia es 1 grapheme y 11 unidades UTF-16. Contando por
    // UTF-16, Bluesky (300) rechazaría un texto que en pantalla ocupa 30.
    expect(contarGraphemes("👨‍👩‍👧‍👦")).toBe(1);
    expect("👨‍👩‍👧‍👦".length).toBeGreaterThan(5);
    expect(cabeElTexto("bluesky", "👨‍👩‍👧‍👦".repeat(299))).toBe(true);
  });

  it("cada límite lleva su nota, y LinkedIn lleva la suya que lo explica todo", () => {
    for (const p of Object.keys(LIMITES) as (keyof typeof LIMITES)[]) {
      expect(LIMITES[p].nota, `${p} sin nota`).toBeTruthy();
    }
    expect(LIMITES.linkedin.nota).toMatch(/no publica sus l/i);
  });
});

describe("Threads: dos pasos, contenedor y publicación", () => {
  const opciones = { threadsUserId: "12345", accessToken: "tok" };

  it("crea el contenedor en graph.threads.net y luego publica", async () => {
    const { http, llamadas } = capa([
      { id: "CONTAINER_1" },
      { id: "T_1", permalink: "https://www.threads.net/@x/p/T_1" },
    ]);
    const a = crearThreads({ ...opciones, http });

    const r = await a.publicar(pub("Hola", [IMG]));

    expect(llamadas.map((c) => c.url)).toEqual([
      "https://graph.threads.net/v1.0/12345/threads",
      "https://graph.threads.net/v1.0/12345/threads_publish",
    ]);
    expect(r.id).toBe("T_1");
  });

  it("el host NO es graph.facebook.com", async () => {
    const { http, llamadas } = capa([{ id: "C" }, { id: "T" }]);
    await crearThreads({ ...opciones, http }).publicar(pub("x"));
    expect(llamadas[0]!.url).not.toContain("graph.facebook.com");
  });

  it("el texto no pasa de 500 caracteres", () => {
    const { http } = capa([]);
    const a = crearThreads({ ...opciones, http });
    expect(a.validar(pub(textoLargo(501))).ok).toBe(false);
    expect(a.validar(pub(textoLargo(500))).ok).toBe(true);
  });
});

describe("Instagram: dos pasos, otro host y solo JPEG", () => {
  const opciones = { igUserId: "IG9", accessToken: "tok" };

  it("usa graph.instagram.com y luego media_publish", async () => {
    const { http, llamadas } = capa([{ id: "MEDIA_1" }, { id: "IG_1" }]);
    const r = await crearInstagram({ ...opciones, http }).publicar(pub("Mira esto", [IMG]));

    expect(llamadas[0]!.url).toContain("graph.instagram.com");
    expect(llamadas[0]!.url).toContain("/IG9/media");
    expect(llamadas[1]!.url).toContain("/IG9/media_publish");
    expect(r.id).toBe("IG_1");
  });

  it("exige cuenta profesional en el anclaje", () => {
    const { http } = capa([]);
    expect(crearInstagram({ ...opciones, http }).requiereAnclaje).toMatch(/profesional/i);
  });
});

describe("Facebook: endpoint distinto según haya imagen o no", () => {
  const opciones = { pageId: "P1", pageAccessToken: "pag" };

  it("sin imagen va a /feed y con imagen a /photos", async () => {
    const { http, llamadas } = capa([{ id: "POST_1" }, { id: "PHOTO_1", post_id: "POST_2" }]);
    const a = crearFacebook({ ...opciones, http });

    await a.publicar(pub("Solo texto"));
    expect(llamadas[0]!.url).toContain("/P1/feed");

    await a.publicar(pub("Con foto", [IMG]));
    expect(llamadas[1]!.url).toContain("/P1/photos");
  });

  it("devuelve el id del post, no el de la foto", async () => {
    // El endpoint de fotos devuelve dos: el de la foto y el del post. El que
    // sirve para borrar o editar es el segundo, y confundirlos deja
    // publicaciones que luego no se pueden retirar.
    const { http } = capa([{ id: "PHOTO_9", post_id: "POST_9" }]);
    const r = await crearFacebook({ ...opciones, http }).publicar(pub("x", [IMG]));
    expect(r.id).toBe("POST_9");
  });
});

describe("Bluesky: abrirSesion es lo unico que prueba las credenciales", () => {
  const opciones = {
    pds: "https://pds.example",
    identifier: "cuenta",
    password: "app-password",
    repo: "did:plc:x",
  };

  it("el app password solo sirve para autenticarse, no como bearer", async () => {
    // Este es el bug que hacia que el script de comprobacion dijera
    // "HTTP 400, credenciales malas" con unas credenciales **buenas**.
    //
    // Un app password se usa en `createSession`. Lo que autoriza las llamadas
    // despues es el `accessJwt` que esa llamada devuelve. Mandar el app password
    // como `Authorization: Bearer` no puede funcionar nunca, y el 400 que sale
    // no dice por que: se lee como "esta mal" cuando esta bien.
    const http = (async (url: string) => {
      if (url.includes("createSession")) {
        return new Response(
          JSON.stringify({ accessJwt: "jwt-real", handle: "prueba.bsky.social", did: "did:plc:x" }),
          { headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`no deberia llegar a ${url}`);
    }) as unknown as CapaHttp;

    const s = await abrirSesion({ ...opciones, http });

    expect(s.accessJwt).toBe("jwt-real");
    expect(s.handle).toBe("prueba.bsky.social");
    // Y lo que sale en el informe es la cuenta, no un error sin explicar.
    expect(`@${s.handle}`).toBe("@prueba.bsky.social");
  });

  it("el bearer es el accessJwt, no el app password", async () => {
    // Se comprueba en la llamada de verdad: si el bearer fuera el app password,
    // este test veria la cadena equivocada autorizando una peticion.
    let bearer: string | null = null;
    const http = (async (url: string, init?: RequestInit) => {
      if (url.includes("createSession")) {
        return new Response(JSON.stringify({ accessJwt: "jwt-real", handle: "h" }), {
          headers: { "content-type": "application/json" },
        });
      }
      bearer = (init?.headers as Record<string, string>)?.["Authorization"] ?? null;
      return new Response(JSON.stringify({ uri: "at://x", cid: "c" }), {
        headers: { "content-type": "application/json" },
      });
    }) as unknown as CapaHttp;

    await crearBluesky({ ...opciones, http }).publicar(pub("Hola"));

    expect(bearer).toBe("Bearer jwt-real");
    expect(bearer).not.toContain("app-password");
  });
});

describe("Bluesky: el AT Protocol no acepta URLs de imagen", () => {
  const opciones = {
    pds: "https://pds.example",
    identifier: "x",
    password: "app-password",
    repo: "did:plc:x",
  };

  it("sesiona, descarga la imagen, sube el blob y publica: cuatro llamadas en orden", async () => {
    // A diferencia de Meta, aquí no hay `image_url`: hay que bajar los bytes y
    // referenciar el blob. Omitir la descarga no da error, da un post sin imagen.
    const { http, llamadas } = capa([
      { did: "did:plc:x", accessJwt: "jwt" },
      BYTES(),
      { blob: { $type: "blob", ref: { $link: "BLOB1" } } },
      { uri: "at://x/app.bsky.feed.post/1", cid: "C" },
    ]);

    await crearBluesky({ ...opciones, http }).publicar(pub("Hola", [IMG]));

    // **El endpoint es `com.atproto.repo.createRecord`, no `app.bsky.feed.post`.**
    //
    // `app.bsky.feed.post` es el *lexicon type* del registro, no un método
    // invocable: el router no lo tiene, y llamarlo devolvía `501 Not
    // Implemented`. El método que escribe es el genérico de creación de
    // registros del AT Protocol, y el type va dentro, en `record.$type`.
    //
    // Este test afirmaba el endpoint equivocado, así que el bug estaba
    // "protegido" por él: verde mientras el post real no salía. Un test que
    // fija el error no lo detecta; uno que fija la verdad, sí.
    expect(llamadas.map((c) => c.url)).toEqual([
      "https://pds.example/xrpc/com.atproto.server.createSession",
      IMG,
      "https://pds.example/xrpc/com.atproto.repo.uploadBlob",
      "https://pds.example/xrpc/com.atproto.repo.createRecord",
    ]);
  });

  it("el registro lleva el type dentro, no en la URL", async () => {
    // `collection` dice qué tipo de registro es y `record.$type` lo repite.
    // Los dos van: el primero le dice al PDS dónde escribir, el segundo valida
    // el lexicon del registro.
    const { http, llamadas } = capa([
      { did: "did:plc:x", accessJwt: "jwt" },
      { uri: "at://x/app.bsky.feed.post/1", cid: "C" },
    ]);

    await crearBluesky({ ...opciones, http }).publicar(pub("Hola"));

    const cuerpo = JSON.parse(String(llamadas[1]!.init.body));
    expect(cuerpo.collection).toBe("app.bsky.feed.post");
    expect(cuerpo.record.$type).toBe("app.bsky.feed.post");
    expect(cuerpo.repo).toBe("did:plc:x");
  });

  it("un borrador con imágenes queda marcado para revisión, porque el máximo no está verificado", async () => {
    const { http } = capa([]);
    const a = crearBluesky({ ...opciones, http });
    const b = await a.redactar({ titulo: "T", cuerpo: "hola", imagenes: [{ url: IMG }] });
    expect(b.requiereRevision).toBe(true);
  });
});

describe("LinkedIn: el texto va en `commentary`, no en `text`", () => {
  const opciones = { authorUrn: "urn:li:person:1", accessToken: "t" };

  it("inicializa la subida, baja los bytes, los sube y publica", async () => {
    const { http, llamadas } = capa([
      { uploadUrl: "https://upload.example/img", image: "urn:li:image:1" },
      BYTES(),
      new Uint8Array([1, 2, 3]),
      { id: "urn:li:share:1" },
    ]);

    await crearLinkedin({ ...opciones, http }).publicar(pub("Hola", [IMG]));

    expect(llamadas[0]!.url).toContain("/images?action=initializeUpload");
    expect(llamadas[2]!.url).toBe("https://upload.example/img");
    expect(llamadas[3]!.url).toContain("/rest/posts");
  });

  it("el texto va dentro de commentary con su objeto de idioma", async () => {
    const { http, llamadas } = capa([
      { uploadUrl: "https://upload.example/img", image: "urn:li:image:1" },
      BYTES(),
      new Uint8Array([1, 2, 3]),
      { id: "urn:li:share:1" },
    ]);

    await crearLinkedin({ ...opciones, http }).publicar(pub("Hola", [IMG]));

    const cuerpo = JSON.parse(String(llamadas[3]!.init.body));
    // Un `commentary.text` anidado NO es un `text` de primer nivel, así que se
    // comprueba la forma del objeto y no la palabra suelta: buscar `"text":` en
    // la cadena daría falso positivo con el anidado, que es lo correcto.
    expect(cuerpo.commentary).toEqual({ text: "Hola", locale: "es-ES" });
    expect(Object.keys(cuerpo)).not.toContain("text");
  });

  it("siempre exige revisión, porque LinkedIn no publica sus límites", async () => {
    const { http } = capa([]);
    const b = await crearLinkedin({ ...opciones, http }).redactar({ titulo: "T", cuerpo: "hola" });
    expect(b.requiereRevision).toBe(true);
  });
});

describe("Mastodon: el host y el límite los pone la instancia", () => {
  it("baja los bytes, sube el medio y publica el estado", async () => {
    const { http, llamadas } = capa([BYTES(), { id: "MEDIA_1" }, { id: "STATUS_1", url: "https://m/@u/1" }]);

    await crearMastodon({ instancia: "https://mastodon.social", accessToken: "t", http }).publicar(
      pub("Hola", [IMG]),
    );

    expect(llamadas[1]!.url).toContain("/api/v1/media");
    expect(llamadas[2]!.url).toContain("/api/v1/statuses");
  });

  it("el status lleva Content-Type: application/json y el texto en el cuerpo", async () => {
    // **Por qué este test existe:** el primero de este bloque solo comprueba qué
    // endpoint se llama, no **qué se le manda**. Y con una capa HTTP falsa que
    // acepta cualquier cosa, un `Content-Type` ausente era invisible: 1822 tests
    // verdes y un 422 real en producción con el texto vacío.
    //
    // La causa: `cabeceras()` estaba compartida entre las dos llamadas, y la
    // del multipart **no puede** llevar `Content-Type` (el `boundary` lo genera
    // el transporte). La del JSON **sí**, porque Rails solo parsea el cuerpo si
    // ve esa cabecera. Compartiendo la función, la del JSON heredaba la
    // omisión del multipart y Mastodon leía un formulario vacío.
    //
    // El mensaje de la API —"Text cannot be blank"— culpa al texto, y el texto
    // era correcto. Por eso el test mira cabeceras y cuerpo, y no solo la URL.
    const { http, llamadas } = capa([BYTES(), { id: "MEDIA_1" }, { id: "STATUS_1", url: "https://m/@u/1" }]);

    await crearMastodon({ instancia: "https://mastodon.social", accessToken: "t", http }).publicar(
      pub("Hola", [IMG]),
    );

    const status = llamadas[2]!;
    expect(cabeceraDe(status, "Content-Type")).toBe("application/json");
    expect(JSON.parse(String(status.init.body)).status).toBe("Hola");
  });

  it("el multipart NO lleva Content-Type, porque lo pone el transporte", async () => {
    // La mitad opuesta del test anterior. Si alguien "arregla" la cabecera del
    // JSON y toca también esta, el `boundary` deja de ir y el medio sube vacío —
    // y ese fallo tampoco da error de sintaxis.
    const { http, llamadas } = capa([BYTES(), { id: "MEDIA_1" }, { id: "STATUS_1", url: "https://m/@u/1" }]);

    await crearMastodon({ instancia: "https://mastodon.social", accessToken: "t", http }).publicar(
      pub("Hola", [IMG]),
    );

    expect(cabeceraDe(llamadas[1]!, "Content-Type")).toBeUndefined();
  });

  it("un límite de instancia distinto manda sobre el de la tabla", () => {
    // El 500 de la tabla es el default; cada instancia lo baja. Con 280
    // medidos, un texto de 300 no vale aunque la tabla diga que sí.
    const { http } = capa([]);
    const a = crearMastodon({ instancia: "https://x.social", accessToken: "t", limiteTexto: 280, http });
    expect(a.validar(pub(textoLargo(281))).ok).toBe(false);
    expect(a.validar(pub(textoLargo(279))).ok).toBe(true);
  });

  it("sin límite medido solo avisa, no falla: el 500 es un default, no una ley", () => {
    const { http } = capa([]);
    const a = crearMastodon({ instancia: "https://x.social", accessToken: "t", http });
    const v = a.validar(pub(textoLargo(600)));
    expect(v.ok).toBe(true);
    expect(v.avisos.join(" ")).toMatch(/por defecto/i);
  });
});

describe("un error de la API no se disfraza de éxito", () => {
  it("un 400 se propaga con su cuerpo", async () => {
    const http: CapaHttp = async () =>
      new Response('{"error":{"message":"Invalid media_type"}}', { status: 400 });
    // Si esto devolviera `{ id: null }` y el admin lo leyera como publicado, el
    // post se pierde sin que nadie lo sepa. Un 4xx se lanza, siempre.
    await expect(crearThreads({ threadsUserId: "1", accessToken: "t", http }).publicar(pub("Hola"))).rejects.toThrow();
  });

  it("un 429 se propaga igual", async () => {
    const http: CapaHttp = async () => new Response("rate limited", { status: 429 });
    const a = crearBluesky({
      pds: "https://pds.example",
      identifier: "x",
      password: "p",
      repo: "did:plc:z",
      http,
    });
    await expect(a.publicar(pub("Hola"))).rejects.toThrow();
  });
});

describe("redactar recorta y lo dice", () => {
  it("si el texto no cabe, sale recortado y anotado", async () => {
    const { http } = capa([]);
    const b = await crearThreads({ threadsUserId: "1", accessToken: "t", http }).redactar({
      titulo: "T",
      cuerpo: textoLargo(900),
    });
    expect(b.ajustes.join(" ")).toMatch(/recort/i);
    expect([...b.publicacion.texto].length).toBeLessThanOrEqual(500);
  });

  it("si el recorte parte una URL, la quita entera en vez de dejarla rota", async () => {
    // **El caso real:** el primer post de Bluesky recortó el texto a 300
    // graphemes y partió la URL por la mitad, dejando `https://epk-da`. Un
    // enlace a medias parece que funciona y no lleva a ninguna parte, y el
    // recorte en la plataforma es irreversible: no hay "deshacer un post".
    //
    // Por eso se prefiere un post sin enlace a un post con un enlace roto.
    const { http } = capa([]);
    const b = await crearBluesky({
      pds: "https://pds.example",
      identifier: "x",
      password: "p",
      repo: "did:plc:z",
      http,
    }).redactar({
      titulo: "",
      cuerpo: textoLargo(280) + "\n\nhttps://epk-dashboard.vercel.app",
    });

    expect([...b.publicacion.texto].length).toBeLessThanOrEqual(300);
    // La URL no está a medias: o está entera, o no está.
    expect(b.publicacion.texto).not.toMatch(/https?:\/\/\S*$/m);
    expect(b.publicacion.texto).not.toContain("https://epk-da\n");
    // Y se dice, porque quitarla es una decision visible.
    expect(b.ajustes.join(" ")).toMatch(/enlace|URL/i);
  });

  it("si la URL cabe entera, se conserva", async () => {
    const { http } = capa([]);
    const b = await crearBluesky({
      pds: "https://pds.example",
      identifier: "x",
      password: "p",
      repo: "did:plc:z",
      http,
    }).redactar({
      titulo: "",
      cuerpo: "Corto.\n\nhttps://epk-dashboard.vercel.app",
    });

    expect(b.publicacion.texto).toContain("https://epk-dashboard.vercel.app");
  });

  it("si cabe, no inventa que ha recortado", async () => {
    const { http } = capa([]);
    const b = await crearThreads({ threadsUserId: "1", accessToken: "t", http }).redactar({
      titulo: "T",
      cuerpo: "corto",
    });
    expect(b.ajustes.filter((a) => /recort/i.test(a))).toHaveLength(0);
  });
});

describe("nunca hay un secreto escrito en los adaptadores", () => {
  it("tokens, repos y hosts entran por opciones", () => {
    // Un token escrito en el código se filtra por `git log` y no se puede
    // revocar desde el fichero. Es el mismo motivo por el que en P12 hubo que
    // reescribir el historial.
    for (const n of ["bluesky", "threads", "instagram", "facebook", "linkedin", "mastodon"]) {
      const src = readFileSync(path.resolve(process.cwd(), `lib/social/${n}.ts`), "utf8");
      expect(src, `${n}.ts`).not.toMatch(/token:\s*["'][A-Za-z0-9_-]{8,}/);
      expect(src, `${n}.ts`).not.toMatch(/Bearer [A-Za-z0-9_-]{12,}/);
    }
  });
});