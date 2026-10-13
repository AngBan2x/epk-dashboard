/**
 * Tests de `lib/social/config.ts`.
 *
 * ## Que se esta atando aqui
 *
 * Tres cosas que ya han salido de esta fase:
 *
 * 1. **Una cadena vacia —o de solo espacios— no es "definida".** Una variable
 *    presente pero vacia es lo que deja un `.env.local` al que se le borra el
 *    valor, y "   " es lo que deja un terminal que ha metido un espacio de
 *    sobra. Con cualquiera de las dos cosas, el token viaja a la API real y la
 *    respuesta es un 401 que habla de permisos del usuario y no del problema.
 *
 *    Mutacion verificada: quitar el `.trim()` de `leer()` pone **2 tests** en
 *    rojo. Y una nota sobre lo que NO protege: cambiar ese `trim` por un `??`
 *    **no** rompe nada, porque `"" ?? ""` y `"".trim() ?? ""` dan lo mismo.
 *    Aqui el `??` es inocuo de verdad; lo que no lo es es el `trim`. En
 *    `scripts/lib/credentials.ts` el `??` si importa, porque alli hay un default
 *    real al que una cadena vacia no debe llegar. Aca no hay default al que
 *    llegar, y decirlo evita que alguien "simplifique" aqui creyendo que esta
 *    protegiendo lo que no protege.
 *
 * 2. **Faltar devuelve NOMBRES, no valores.** `estaConfigurada` y `faltanPara` no
 *    pueden devolver el token ni su longitud, porque su salida se pinta en
 *    terminals y a veces en issues. El tipo lo hace estructuralmente imposible.
 *
 * 3. **Threads no comparte credenciales con Facebook.** Es lo que dice la
 *    documentacion de Meta: el caso de uso Threads genera su propio par de App
 *    ID y App Secret. Si alguien "simplifica" haciendo que Threads lea
 *    `META_ACCESS_TOKEN`, este test se pone rojo.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  REQUISITOS,
  estaConfigurada,
  faltanPara,
  informe,
  opcionesBluesky,
  opcionesFacebook,
  opcionesInstagram,
  opcionesLinkedin,
  opcionesMastodon,
  opcionesThreads,
} from "@/lib/social/config";

/** `fetch` que nunca se usa: estos tests no salen a la red. */
const httpFalso = (async () => {
  throw new Error("este test no debe llamar a la red");
}) as unknown as Parameters<typeof opcionesBluesky>[0];

const TODAS = [
  "BLUESKY_USERNAME",
  "BLUESKY_APP_PASSWORD",
  "BLUESKY_PDS",
  "BLUESKY_REPO",
  "MASTODON_URL",
  "MASTODON_ACCESS_TOKEN",
  "META_PAGE_ID",
  "META_ACCESS_TOKEN",
  "META_PAGE_ACCESS_TOKEN",
  "META_USER_ACCESS_TOKEN",
  "META_IG_USER_ID",
  "THREADS_APP_ID",
  "THREADS_USER_ID",
  "THREADS_ACCESS_TOKEN",
  "LINKEDIN_AUTHOR_URN",
  "LINKEDIN_ACCESS_TOKEN",
];

let guardadas: Record<string, string | undefined> = {};

beforeEach(() => {
  guardadas = {};
  for (const k of TODAS) guardadas[k] = process.env[k];
  for (const k of TODAS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(guardadas)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function definir(todas: Record<string, string>): void {
  for (const [k, v] of Object.entries(todas)) process.env[k] = v;
}

describe("lectura del entorno", () => {
  it("una cadena vacia cuenta como ausente, no como definida", () => {
    definir({
      BLUESKY_USERNAME: "demo.bsky.social",
      BLUESKY_APP_PASSWORD: "abcd-1234",
      BLUESKY_PDS: "https://bsky.social",
      BLUESKY_REPO: "",
    });

    // El repo esta presente en el entorno pero vacio.
    expect(process.env.BLUESKY_REPO).toBe("");
    expect(faltanPara("bluesky")).toEqual(["BLUESKY_REPO"]);
    expect(estaConfigurada("bluesky")).toBe(false);
  });

  it("rodea de espacios sigue contando como definida", () => {
    definir({
      BLUESKY_USERNAME: "  demo.bsky.social  ",
      BLUESKY_APP_PASSWORD: " abcd-1234 ",
      BLUESKY_PDS: " https://bsky.social ",
      BLUESKY_REPO: " did:plc:abc123 ",
    });

    const r = opcionesBluesky(httpFalso);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.identifier).toBe("demo.bsky.social");
      expect(r.valor.repo).toBe("did:plc:abc123");
    }
  });

  it("no propaga espacios a las opciones del adaptador", () => {
    definir({
      BLUESKY_USERNAME: " demo.bsky.social ",
      BLUESKY_APP_PASSWORD: " clave ",
      BLUESKY_PDS: " https://bsky.social ",
      BLUESKY_REPO: " did:plc:abc ",
    });

    const r = opcionesBluesky(httpFalso);
    expect(r.ok).toBe(true);
    if (r.ok) {
      for (const valor of Object.values(r.valor)) {
        if (typeof valor === "string") expect(valor).toBe(valor.trim());
      }
    }
  });
});

describe("lo que devuelve al faltar", () => {
  it("faltanPara devuelve solo nombres de variable, nunca el valor", () => {
    definir({ BLUESKY_USERNAME: "demo.bsky.social", BLUESKY_APP_PASSWORD: "secreto-de-verdad" });

    const faltan = faltanPara("bluesky");
    expect(faltan).toEqual(["BLUESKY_PDS", "BLUESKY_REPO"]);

    // Ninguna entrada contiene el valor, ni un fragmento suyo.
    for (const f of faltan) expect(f).not.toContain("secreto-de-verdad");
  });

  it("el informe no incluye ningun valor ni su longitud", () => {
    definir({ META_PAGE_ID: "130636161590121", META_ACCESS_TOKEN: "EAAB-secret-token-value" });

    for (const p of informe()) {
      expect(p.faltan.every((f) => f === f.toUpperCase().replace(/[^A-Z0-9_]/g, ""))).toBe(true);
      expect(p.motivo).not.toContain("EAAB");
    }
  });

  it("un adaptador devuelve ok:false con la lista de ausentes", () => {
    definir({ BLUESKY_USERNAME: "demo.bsky.social" });

    const r = opcionesBluesky(httpFalso);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.faltan).toEqual(["BLUESKY_APP_PASSWORD", "BLUESKY_PDS", "BLUESKY_REPO"]);
    }
  });
});

describe("Threads no comparte credenciales con Facebook", () => {
  it("Threads exige THREADS_ACCESS_TOKEN, y no acepta el token de Facebook", () => {
    definir({
      META_PAGE_ID: "130636161590121",
      META_PAGE_ACCESS_TOKEN: "EAAB-token-de-page",
      META_IG_USER_ID: "17841400000000001",
      THREADS_APP_ID: "1234567890123456",
      THREADS_USER_ID: "9876543210987654",
      // Sin THREADS_ACCESS_TOKEN.
    });

    // Facebook e Instagram si quedan completas.
    expect(estaConfigurada("facebook")).toBe(true);
    expect(estaConfigurada("instagram")).toBe(true);

    // Threads no: el token de Facebook no le sirve.
    expect(estaConfigurada("threads")).toBe(false);
    expect(faltanPara("threads")).toEqual(["THREADS_ACCESS_TOKEN"]);

    const r = opcionesThreads(httpFalso);
    expect(r.ok).toBe(false);
  });

  it("Threads y Facebook declaradas como requisitos separados", () => {
    const varsThreads = REQUISITOS.find((r) => r.plataforma === "threads")!.variables;
    const varsFacebook = REQUISITOS.find((r) => r.plataforma === "facebook")!.variables;

    expect(varsThreads).toContain("THREADS_ACCESS_TOKEN");
    expect(varsThreads).not.toContain("META_PAGE_ACCESS_TOKEN");
    expect(varsFacebook).toContain("META_PAGE_ACCESS_TOKEN");
    expect(varsFacebook).not.toContain("THREADS_ACCESS_TOKEN");
  });
});

describe("el token de usuario NO vale como token de Page", () => {
  it("META_USER_ACCESS_TOKEN no aparece en ningun requisito", () => {
    // Este es el error de diseño que se cometió al escribir config.ts por
    // primera vez: una sola variable mapeada a los dos papeles. El token del
    // login es de USUARIO; POST /{page-id}/feed necesita el de PAGE. Se
    // distinguer por GET /me/accounts.
    for (const req of REQUISITOS) {
      expect(req.variables).not.toContain("META_USER_ACCESS_TOKEN");
    }
  });

  it("Facebook e Instagram piden META_PAGE_ACCESS_TOKEN", () => {
    expect(REQUISITOS.find((r) => r.plataforma === "facebook")!.variables).toContain(
      "META_PAGE_ACCESS_TOKEN"
    );
    expect(REQUISITOS.find((r) => r.plataforma === "instagram")!.variables).toContain(
      "META_PAGE_ACCESS_TOKEN"
    );
  });

  it("con solo el token de usuario, Facebook NO queda configurada", () => {
    // Y no cae a la primera: quedaría se queda en false en vez de tomar un token
    // que va a fallar en producción con un 401 que no explica nada.
    definir({ META_PAGE_ID: "130636161590121", META_USER_ACCESS_TOKEN: "EAA-usuario" });

    expect(estaConfigurada("facebook")).toBe(false);
    expect(faltanPara("facebook")).toEqual(["META_PAGE_ACCESS_TOKEN"]);

    const r = opcionesFacebook(httpFalso);
    expect(r.ok).toBe(false);
  });

  it("META_ACCESS_TOKEN (el nombre viejo) ya no lo usa nadie", () => {
    for (const req of REQUISITOS) {
      expect(req.variables).not.toContain("META_ACCESS_TOKEN");
    }
  });

  it("el token que LLEGA al adaptador de Instagram es el de Page, no el de usuario", () => {
    // El test anterior, que solo miraba `REQUISITOS.variables`, NO protecto esto:
    // el mapeo de `opcionesInstagram` es otro sitio, y se puede equivocar sin
    // que la lista de requisitos se entere. Se comprobo revirtiendo el mapeo:
    // 19 tests en verde con el bug puesto.
    //
    // Este si lo ata: comprueba el VALOR que sale, no el nombre que se pidio.
    definir({
      META_PAGE_ID: "130636161590121",
      META_IG_USER_ID: "17841400000000001",
      META_PAGE_ACCESS_TOKEN: "EAAB-ESTE-es-el-de-page",
      META_USER_ACCESS_TOKEN: "EAAH-ESTE-es-el-de-usuario",
    });

    const ig = opcionesInstagram(httpFalso);
    expect(ig.ok).toBe(true);
    if (ig.ok) {
      expect(ig.valor.accessToken).toBe("EAAB-ESTE-es-el-de-page");
      expect(ig.valor.accessToken).not.toBe("EAAH-ESTE-es-el-de-usuario");
    }

    const fb = opcionesFacebook(httpFalso);
    expect(fb.ok).toBe(true);
    if (fb.ok) {
      expect(fb.valor.pageAccessToken).toBe("EAAB-ESTE-es-el-de-page");
    }
  });
});

describe("plataformas completas", () => {
  it("Bluesky devuelve sus cinco campos", () => {
    definir({
      BLUESKY_USERNAME: "demo.bsky.social",
      BLUESKY_APP_PASSWORD: "abcd-efgh",
      BLUESKY_PDS: "https://bsky.social",
      BLUESKY_REPO: "did:plc:xyz",
    });

    const r = opcionesBluesky(httpFalso);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.identifier).toBe("demo.bsky.social");
      expect(r.valor.password).toBe("abcd-efgh");
      expect(r.valor.pds).toBe("https://bsky.social");
      expect(r.valor.repo).toBe("did:plc:xyz");
      expect(r.valor.http).toBe(httpFalso);
    }
  });

  it("Mastodon devuelve instancia y token", () => {
    definir({ MASTODON_URL: "https://mastodon.social", MASTODON_ACCESS_TOKEN: "tok" });

    const r = opcionesMastodon(httpFalso);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.instancia).toBe("https://mastodon.social");
      expect(r.valor.accessToken).toBe("tok");
    }
  });

  it("Facebook mapea META_PAGE_ID a pageId y el token a pageAccessToken", () => {
    definir({
      META_PAGE_ID: "130636161590121",
      META_PAGE_ACCESS_TOKEN: "EAAB-token-de-page",
    });

    const r = opcionesFacebook(httpFalso);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.pageId).toBe("130636161590121");
      expect(r.valor.pageAccessToken).toBe("EAAB-token-de-page");
    }
  });

  it("Instagram mapea META_IG_USER_ID a igUserId", () => {
    definir({
      META_IG_USER_ID: "17841400000000001",
      META_PAGE_ACCESS_TOKEN: "EAAB-token-de-page",
    });

    const r = opcionesInstagram(httpFalso);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.igUserId).toBe("17841400000000001");
  });

  it("LinkedIn mapea el URN a authorUrn", () => {
    definir({ LINKEDIN_AUTHOR_URN: "urn:li:organization:123", LINKEDIN_ACCESS_TOKEN: "tok" });

    const r = opcionesLinkedin(httpFalso);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.authorUrn).toBe("urn:li:organization:123");
  });
});

describe("informe", () => {
  it("cubre las seis plataformas", () => {
    expect(informe()).toHaveLength(6);
    expect(REQUISITOS.map((r) => r.plataforma).sort()).toEqual(
      ["bluesky", "facebook", "instagram", "linkedin", "mastodon", "threads"].sort(),
    );
  });

  it("con todas las variables definidas, las seis quedan configuradas", () => {
    for (const req of REQUISITOS) {
      for (const v of req.variables) process.env[v] = `valor-de-${v.toLowerCase()}`;
    }

    expect(informe().every((p) => p.configurada)).toBe(true);
  });
});