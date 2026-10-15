import { describe, expect, it } from "vitest";
import {
  comprobarImagen,
  comprobarImagenes,
  falloEstatico,
  MAX_BYTES_THREADS,
  type InformeImagen,
} from "@/lib/social/imagenes";
import type { CapaHttp } from "@/lib/social/tipos";

/**
 * Tests de la comprobacion de medios de RC.45.
 *
 * ## Que se esta atando
 *
 * **Que un fallo de red NO bloquee la publicacion.** Threads descarga el medio en
 * el momento del intento. Un CDN lento o que no responde a `HEAD` no es motivo
 * para impedir publicar: es motivo para avisar. Si esto bloqueara, cualquier
 * problema pasajero de una imagen ajena dejaría al admin sin poder publicar nada,
 * que es peor que un post fallido y se ve.
 *
 * **Que un fallo que NO depende de la red SI la bloquee.** Una URL en `http://`,
 * una que apunte a localhost, una que devuelve HTML en vez de una imagen, o una
 * de 9 MB, fallan siempre. Reintentar no las arregla, y dejarlas pasar convierte
 * un error barato en un 400 opaco de Threads — o en una publicación a medias.
 *
 * **La separacion entre `problema` y `aviso`.** No es cosmetica: es lo que decide
 * si la ruta devuelve 400 o 200.
 */

function httpQueDevuelve(
  map: Record<string, { status?: number; headers?: Record<string, string>; lanza?: boolean }>
): CapaHttp {
  return (async (url: string) => {
    const r = map[url];
    if (r === undefined) throw new Error(`sin entrada para ${url}`);
    if (r.lanza === true) throw new Error("ECONNRESET");
    return new Response(null, { status: r.status ?? 200, headers: r.headers ?? {} });
  }) as unknown as CapaHttp;
}

const PNG = { "content-type": "image/png", "content-length": "1234" };

describe("falloEstatico: lo que no se arregla reintentando", () => {
  it("una URL sin esquema o rota no es una URL", () => {
    expect(falloEstatico("no-es-una-url")).not.toBeNull();
    expect(falloEstatico("")).not.toBeNull();
  });

  it("http no vale: Meta la descarga y el propio Threads exige https", () => {
    // El error 1349187 de OAuth ya salio por esto mismo en una redirect_uri.
    // Una imagen en http falla por el mismo motivo y con un mensaje menos claro.
    const problema = falloEstatico("http://cdn.example.com/a.jpg");

    expect(problema).toContain("https");
  });

  it("localhost no vale: Meta esta en otro servidor", () => {
    expect(falloEstatico("https://localhost/a.jpg")).toContain("localhost");
    expect(falloEstatico("https://127.0.0.1/a.jpg")).toContain("localhost");
    expect(falloEstatico("https://app.localhost/a.jpg")).toContain("localhost");
  });

  it("una https publica se acepta", () => {
    expect(falloEstatico("https://cdn.example.com/a.jpg")).toBeNull();
    expect(falloEstatico("https://is1-ssl.mzstatic.com/x/100000x100000bb.jpg")).toBeNull();
  });
});

describe("comprobarImagen: lo que bloquea", () => {
  it("una URL que devuelve HTML no es una imagen", async () => {
    // Es el caso real de un enlace de iCloud o de una pagina que devuelve 200 con
    // su pagina de error. Meta no lo detecta hasta que intenta descargarlo.
    const http = httpQueDevuelve({
      "https://cdn.example.com/a.jpg": { headers: { "content-type": "text/html" } },
    });

    const r = await comprobarImagen("https://cdn.example.com/a.jpg", http);

    expect(r.ok).toBe(false);
    expect(r.problema).toContain("no devuelve una imagen");
  });

  it("Threads no acepta un formato que no sea JPEG, PNG o WEBP", async () => {
    const http = httpQueDevuelve({
      "https://cdn.example.com/a.gif": { headers: { "content-type": "image/gif" } },
    });

    const r = await comprobarImagen("https://cdn.example.com/a.gif", http);

    expect(r.ok).toBe(false);
    expect(r.problema).toContain("JPEG");
  });

  it("una imagen de mas de 8 MB se rechaza antes de gastar la cuota", async () => {
    const http = httpQueDevuelve({
      "https://cdn.example.com/grande.jpg": {
        headers: { "content-type": "image/jpeg", "content-length": String(MAX_BYTES_THREADS + 1) },
      },
    });

    const r = await comprobarImagen("https://cdn.example.com/grande.jpg", http);

    expect(r.ok).toBe(false);
    expect(r.problema).toContain("8 MB");
  });

  it("una imagen justo en el limite se acepta", async () => {
    // El limite es "8 MB como maximo": 8 exacto entra, 8+1 no.
    const http = httpQueDevuelve({
      "https://cdn.example.com/justo.jpg": {
        headers: { "content-type": "image/jpeg", "content-length": String(MAX_BYTES_THREADS) },
      },
    });

    expect((await comprobarImagen("https://cdn.example.com/justo.jpg", http)).ok).toBe(true);
  });
});

describe("comprobarImagen: lo que NO bloquea", () => {
  it("un HEAD que lanza se avisa, no se bloquea", async () => {
    // El requisito real de Threads es que el GET de la imagen funcione. Un HEAD
    // que revienta no dice nada de eso, y algunos CDN responden distinto a HEAD
    // que a GET: bloquear aqui dejaria al admin sin poder publicar por un CDN que
    // funciona.
    const http = httpQueDevuelve({
      "https://cdn.example.com/a.jpg": { lanza: true },
    });

    const r = await comprobarImagen("https://cdn.example.com/a.jpg", http);

    expect(r.ok).toBe(true);
    expect(r.problema).toBeNull();
    expect(r.aviso).toContain("No se ha podido comprobar");
  });

  it("un 403 a HEAD se avisa, no se bloquea", async () => {
    const http = httpQueDevuelve({
      "https://cdn.example.com/a.jpg": { status: 403 },
    });

    const r = await comprobarImagen("https://cdn.example.com/a.jpg", http);

    expect(r.ok).toBe(true);
    expect(r.aviso).toContain("403");
  });

  it("sin content-length se avisa del limite que no se pudo comprobar", async () => {
    const http = httpQueDevuelve({
      "https://cdn.example.com/a.jpg": { headers: { "content-type": "image/png" } },
    });

    const r = await comprobarImagen("https://cdn.example.com/a.jpg", http);

    expect(r.ok).toBe(true);
    expect(r.aviso).toContain("8 MB");
  });
});

describe("comprobarImagen: una imagen buena", () => {
  it("acepta un PNG y aun asi avisa de lo que no ha comprobado", async () => {
    const http = httpQueDevuelve({
      "https://is1-ssl.mzstatic.com/x/100000x100000bb.jpg": { headers: PNG },
    });

    const r = await comprobarImagen(
      "https://is1-ssl.mzstatic.com/x/100000x100000bb.jpg",
      http
    );

    expect(r.ok).toBe(true);
    expect(r.problema).toBeNull();
    expect(r.contentType).toBe("image/png");
    expect(r.bytes).toBe(1234);
    // Las dimensiones NO se comprueban, y el aviso lo dice. Un aviso que no
    // estuviera seria dar una seguridad que no existe.
    expect(r.aviso).toContain("320");
  });

  it("el content-type con parametros se lee igual", async () => {
    // Los CDN sirven `image/png; charset=binary` o similar. Comparar el tipo
    // entero rechazaria imagenes perfectly validas.
    const http = httpQueDevuelve({
      "https://cdn.example.com/a.png": {
        headers: { "content-type": "image/png; charset=binary", "content-length": "10" },
      },
    });

    expect((await comprobarImagen("https://cdn.example.com/a.png", http)).ok).toBe(true);
  });
});

describe("comprobarImagenes", () => {
  it("devuelve un informe por URL y en el mismo orden", async () => {
    const http = httpQueDevuelve({
      "https://cdn.example.com/a.png": { headers: PNG },
      "https://cdn.example.com/b.gif": { headers: { "content-type": "image/gif" } },
    });

    const informes = await comprobarImagenes(
      ["https://cdn.example.com/a.png", "https://cdn.example.com/b.gif"],
      http
    );

    // El orden importa: la vista previa los lista en el mismo orden que el
    // carrusel, y un informe descolocado haria pensar que la imagen buena es la
    // que se rechazo.
    expect(informes.map((i) => i.url)).toEqual([
      "https://cdn.example.com/a.png",
      "https://cdn.example.com/b.gif",
    ]);
    expect(informes[0].ok).toBe(true);
    expect(informes[1].ok).toBe(false);
  });

  it("una lista vacia devuelve una lista vacia y no hace red", async () => {
    const http = (async () => {
      throw new Error("no deberia llamarse");
    }) as unknown as CapaHttp;

    const informes = await comprobarImagenes([], http);

    expect(informes).toEqual([]);
  });

  it("un fallo estatico no lanza: se informa", async () => {
    const http = (async () => {
      throw new Error("no deberia llamarse");
    }) as unknown as CapaHttp;

    const informes = await comprobarImagenes(["http://cdn.example.com/a.png"], http);

    const uno: InformeImagen = informes[0];
    expect(uno.ok).toBe(false);
    expect(uno.problema).toContain("https");
  });
});
