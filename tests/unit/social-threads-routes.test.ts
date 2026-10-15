import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests de las dos rutas de Threads de RC.45.
 *
 * ## Que se esta atando
 *
 * **Que la ruta de publicar no escriba sin `confirmar: true`.** Se comprueba
 * mirando las llamadas al `fetch`, no el codigo de respuesta: un `400` con la red
 * tocada seria un fallo igual de grave que un `200` sin publicar. El test mira
 * `calls.length === 0`.
 *
 * **Que nadie que no sea admin llegue a la red.** El `fetch` se cuenta tambien
 * para un usuario normal y para uno sin sesion.
 *
 * **Que se revalide en el momento de publicar.** Se manda texto de 501
 * caracteres con `confirmar: true`: tiene que devolver 400 y no tocar Threads.
 * Confiar en el preview seria confiar en el navegador.
 *
 * **Que la vista previa no pueda publicar aunque se lo pidan.** Se manda
 * `publicar: true` dentro del cuerpo del preview, porque es lo que haria alguien
 * que|clubiese las dos rutas en una.
 */

vi.mock("@/lib/auth", () => ({ validateRequest: vi.fn() }));

import { validateRequest } from "@/lib/auth";
import { POST as preview } from "@/app/api/admin/social/threads/preview/route";
import { POST as publicar } from "@/app/api/admin/social/threads/publish/route";
import { NextRequest } from "next/server";

const mockValidate = validateRequest as unknown as ReturnType<typeof vi.fn>;

/** Cuenta las llamadas a la red y responde a Threads sin tocar nada de verdad. */
function espiarRed(): { calls: string[]; restaurar: () => void } {
  const calls: string[] = [];
  const falso = (async (url: string) => {
    calls.push(url);
    if (url.includes("/me")) {
      return new Response(JSON.stringify({ data: { id: "1", username: "pressplayepk" } }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("threads_publish")) {
      return new Response(JSON.stringify({ id: "TID_123", permalink: "https://threads.net/p/x" }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/threads")) {
      return new Response(JSON.stringify({ id: "CID_456" }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(null, { status: 200, headers: { "content-type": "image/png" } });
  }) as unknown as typeof fetch;

  vi.stubGlobal("fetch", falso);
  return { calls, restaurar: () => vi.unstubAllGlobals() };
}

function peticion(url: string, cuerpo: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(cuerpo),
    headers: { "content-type": "application/json" },
  });
}

const RUTA_PREVIEW = "/api/admin/social/threads/preview";
const RUTA_PUBLISH = "/api/admin/social/threads/publish";

beforeEach(() => {
  vi.clearAllMocks();
  // Por defecto, admin. Cada test que no sea de permisos lo cambia.
  mockValidate.mockResolvedValue({ userId: "admin-1", role: "admin" });
  process.env.THREADS_APP_ID = process.env.THREADS_APP_ID || "1390840160777783";
  process.env.THREADS_USER_ID = process.env.THREADS_USER_ID || "29332926652967905";
  process.env.THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN || "th_test";
});

describe("permisos", () => {
  it("sin sesion no se publica ni se toca la red", async () => {
    mockValidate.mockResolvedValue(null);
    const red = espiarRed();

    const r = await publicar(peticion(RUTA_PUBLISH, { texto: "hola", confirmar: true }));

    expect(r.status).toBe(403);
    expect(red.calls).toHaveLength(0);
    red.restaurar();
  });

  it("un suscriptor no publica, aunque tenga sesion", async () => {
    mockValidate.mockResolvedValue({ userId: "u-1", role: "subscriber" });
    const red = espiarRed();

    const r = await publicar(peticion(RUTA_PUBLISH, { texto: "hola", confirmar: true }));

    // El rol importa tanto como la sesion: el endpoint es de administracion y
    // un suscriptor autenticado sigue sin serlo.
    expect(r.status).toBe(403);
    expect(red.calls).toHaveLength(0);
    red.restaurar();
  });

  it("la vista previa tambien es de admin", async () => {
    mockValidate.mockResolvedValue(null);

    const r = await preview(peticion(RUTA_PREVIEW, { titulo: "x", cuerpo: "y" }));

    expect(r.status).toBe(403);
  });
});

describe("publicar: la red no se toca sin confirmar", () => {
  it("sin `confirmar` responde 400 y NO llama a Threads", async () => {
    const red = espiarRed();

    const r = await publicar(peticion(RUTA_PUBLISH, { texto: "hola mundo" }));

    expect(r.status).toBe(400);
    // Esto es lo importante: no basta con el codigo. Un 400 con la red tocada
    // habria publicado el post y luego habria informado del error.
    expect(red.calls).toHaveLength(0);
    red.restaurar();
  });

  it("`confirmar: false` tampoco vale", async () => {
    // El chequeo es `=== true`, no de presencia: un `{"confirmar": "si"}` o un
    // `1` tienen que quedarse fuera.
    const red = espiarRed();

    const r = await publicar(peticion(RUTA_PUBLISH, { texto: "hola", confirmar: false }));

    expect(r.status).toBe(400);
    expect(red.calls).toHaveLength(0);
    red.restaurar();
  });

  it("`confirmar: 1` tampoco vale: es booleano, no verdadiness", async () => {
    const red = espiarRed();

    const r = await publicar(peticion(RUTA_PUBLISH, { texto: "hola", confirmar: 1 }));

    expect(r.status).toBe(400);
    expect(red.calls).toHaveLength(0);
    red.restaurar();
  });
});

describe("publicar: revalida en el momento, no confia en el preview", () => {
  it("texto de mas de 500 caracteres no llega a Threads", async () => {
    const red = espiarRed();

    const r = await publicar(peticion(RUTA_PUBLISH, { texto: "a".repeat(501), confirmar: true }));

    expect(r.status).toBe(400);
    expect(red.calls).toHaveLength(0);
    red.restaurar();
  });

  it("una imagen que no es imagen no llega a Threads", async () => {
    // El fallo de medio deja el post a medias: el contenedor se crea y la
    // publicacion no llega. Mejor un 400 aqui que un post a medias visible.
    const red = espiarRed();
    vi.stubGlobal(
      "fetch",
      (async (url: string) => {
        red.calls.push(url);
        if (url.includes("/threads") || url.includes("threads_publish")) {
          return new Response(JSON.stringify({ id: "x" }), {
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(null, { status: 200, headers: { "content-type": "text/html" } });
      }) as unknown as typeof fetch
    );

    const r = await publicar(
      peticion(RUTA_PUBLISH, {
        texto: "hola",
        imagenes: ["https://cdn.example.com/a.jpg"],
        confirmar: true,
      })
    );

    expect(r.status).toBe(400);
    expect(red.calls.filter((u) => u.includes("threads"))).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe("publicar: el camino feliz", () => {
  it("crea el contenedor y luego publica, y devuelve id y permalink", async () => {
    const red = espiarRed();

    const r = await publicar(peticion(RUTA_PUBLISH, { texto: "Primer post", confirmar: true }));
    const cuerpo = (await r.json()) as Record<string, unknown>;

    expect(r.status).toBe(200);
    expect(cuerpo.publicado).toBe(true);
    expect(cuerpo.id).toBe("TID_123");
    expect(cuerpo.url).toBe("https://threads.net/p/x");
    // El orden importa: el contenedor SIEMPRE antes que el publish. Al reves,
    // Threads no tiene nada que publicar y devuelve 400.
    const posiciones = red.calls.map((u, i) => ({ u, i }));
    const cont = posiciones.find((p) => p.u.endsWith("/threads"))?.i ?? -1;
    const pub = posiciones.find((p) => p.u.includes("threads_publish"))?.i ?? -1;
    expect(cont).toBeGreaterThanOrEqual(0);
    expect(pub).toBeGreaterThan(cont);
    red.restaurar();
  });

  it("sin permalink devuelve la nota, no un enlace inventado", async () => {
    vi.stubGlobal(
      "fetch",
      (async (url: string) => {
        if (url.includes("threads_publish")) {
          return new Response(JSON.stringify({ id: "TID_SIN_URL" }), {
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ id: "CID_1" }), {
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch
    );

    const r = await publicar(peticion(RUTA_PUBLISH, { texto: "sin url", confirmar: true }));
    const cuerpo = (await r.json()) as Record<string, unknown>;

    // Un post de solo texto viene sin permalink. Componer una URL a mano
    // devolveria un enlace que no existe.
    expect(cuerpo.url).toBeNull();
    expect(cuerpo.nota).toContain("permalink");
    vi.unstubAllGlobals();
  });
});

describe("preview: no publica aunque se lo pidan en el cuerpo", () => {
  it("ignora un `publicar: true` en el cuerpo", async () => {
    const red = espiarRed();

    const r = await preview(
      peticion(RUTA_PREVIEW, { titulo: "T", cuerpo: "hola", publicar: true, confirmar: true })
    );
    const cuerpo = (await r.json()) as Record<string, unknown>;

    expect(r.status).toBe(200);
    expect(cuerpo.publicado).toBe(false);
    expect(red.calls.filter((u) => u.includes("threads_publish"))).toHaveLength(0);
    red.restaurar();
  });

  it("recorta a 500 caracteres y lo dice", async () => {
    const red = espiarRed();

    const r = await preview(peticion(RUTA_PREVIEW, { cuerpo: "b".repeat(900) }));
    const cuerpo = (await r.json()) as { caracteres: number; ajustes: string[] };

    // El recorte se dice siempre. Un recorte silencioso deja al admin
    // confundido por un texto mas corto del que escribio.
    expect(cuerpo.caracteres).toBe(500);
    expect(cuerpo.ajustes.join(" ")).toContain("500");
    red.restaurar();
  });

  it("`listoParaPublicar` es false si alguna imagen no vale", async () => {
    vi.stubGlobal(
      "fetch",
      (async (url: string) =>
        new Response(null, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch
    );

    const r = await preview(
      peticion(RUTA_PREVIEW, { cuerpo: "hola", imagenes: ["https://cdn.example.com/a.jpg"] })
    );
    const cuerpo = (await r.json()) as { listoParaPublicar: boolean; imagenes: { ok: boolean }[] };

    expect(cuerpo.listoParaPublicar).toBe(false);
    expect(cuerpo.imagenes[0].ok).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("preview y publish: entorno sin configurar", () => {
  it("el preview responde 503 diciendo que faltan, sin nilaiar valores", async () => {
    const backup = process.env.THREADS_ACCESS_TOKEN;
    delete process.env.THREADS_ACCESS_TOKEN;

    const r = await preview(peticion(RUTA_PREVIEW, { cuerpo: "hola" }));
    const cuerpo = (await r.json()) as { faltan: string[] };

    expect(r.status).toBe(503);
    expect(cuerpo.faltan).toContain("THREADS_ACCESS_TOKEN");
    // Solo el nombre de la variable. Un token en la respuesta de error acabaria
    // en el log del navegador y en la consola de quien lo ve.
    expect(JSON.stringify(cuerpo)).not.toContain(backup ?? "@@@nunca@@@");

    if (backup !== undefined) process.env.THREADS_ACCESS_TOKEN = backup;
  });
});