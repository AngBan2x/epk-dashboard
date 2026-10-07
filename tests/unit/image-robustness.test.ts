import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Toda imagen que venga de la base pasa por `CoverImage`.
 *
 * ## De dónde sale la regla
 *
 * `PLAN_DIRECTOR_EPK_DASHBOARD.md` dice, textualmente: *"IMÁGENES: `onError`
 * handler obligatorio en `<img>` para fallback a placeholder"*. Es una
 * **directiva**, y este test es su teeth.
 *
 * ## Por qué el ternario no basta
 *
 * `getCoverImage(x) ? <Image …> : <placeholder>` solo cubre el caso de la URL
 * **vacía**. Una URL que **existe y está muerta** —un 404, un host que no
 * resuelve, un `http://` sin TLS— se acepta igual, y lo que sale es el icono de
 * imagen rota del navegador. Eso es exactamente lo que pasaba con las 9 portadas
 * de la semilla, que apuntaban a `example.com`.
 *
 * Y como no hay estado, un `onError` que solo escribe en una variable de render
 * no vuelve a renderizar: hace falta un componente con `useState`. Por eso
 * existe `CoverImage` y por eso las cuatro vistas que pintan portadas **tienen
 * que pasar por él**.
 */

const VISTAS: { fichero: string[]; etiqueta: string }[] = [
  { fichero: ["app", "releases", "[id]", "page.tsx"], etiqueta: "ficha de release" },
  { fichero: ["app", "track", "[id]", "page.tsx"], etiqueta: "detalle de pista" },
  { fichero: ["app", "admin", "page.tsx"], etiqueta: "panel de admin" },
  { fichero: ["app", "admin", "approvals", "page.tsx"], etiqueta: "aprobaciones" },
];

const leer = (partes: string[]) =>
  readFileSync(path.resolve(process.cwd(), ...partes), "utf8");

describe("las portadas pasan por CoverImage", () => {
  it.each(VISTAS)("$etiqueta no pinta una portada con <Image> crudo", ({ fichero }) => {
    const fuente = leer(fichero);
    // Se busca el `<Image` seguido de cerca de un `src` de portada. Un
    // `<Image>` legitimo (una miniatura de vídeo que sí tiene onError) no entra
    // aqui porque su `src` no viene de `getCoverImage` ni de `cover`.
    const crudo = /<Image\b[^>]*\bsrc=\{[^}]*(getCoverImage|cover)[^}]*\}/.test(fuente);
    expect(
      crudo,
      `${fichero.join("/")} tiene un <Image> con la portada y sin onError`,
    ).toBe(false);
  });

  it.each(VISTAS)("$etiqueta importa CoverImage", ({ fichero }) => {
    const fuente = leer(fichero);
    const usaPortada = /getCoverImage|\bcover\b/.test(fuente);
    if (!usaPortada) return; // esta vista no pinta portadas: nada que exigir
    expect(fuente, `${fichero.join("/")} usa portada y no importa CoverImage`).toContain(
      "CoverImage",
    );
  });

  it("CoverImage tiene el onError con estado, que es lo que lo hace funcionar", () => {
    const fuente = leer(["components", "CoverImage.tsx"]);
    expect(fuente).toContain("useState");
    expect(fuente).toContain("onError");
  });
});

describe("la miniatura de YouTube tiene respaldo", () => {
  it("VideoShowcase cae a la portada si hqdefault no carga", () => {
    const fuente = leer(["components", "VideoShowcase.tsx"]);
    expect(fuente).toContain("hqdefault.jpg");
    expect(fuente, "sin onError, una hqdefault 404 saca el icono de imagen rota").toContain(
      "onError",
    );
    expect(fuente).toContain("setThumbFailed");
  });

  it("y documenta por qué hqdefault no está garantizada", () => {
    // El dato es del proveedor, no una preferencia: si alguien "simplifica" el
    // comentario y el día que viene un vídeo sin hqdefault aparece, al menos
    // queda escrito por qué el respaldo existe.
    const fuente = leer(["components", "VideoShowcase.tsx"]);
    expect(fuente).toContain("default.jpg");
  });

  it("ReleaseVideoList documenta la limitación en vez de romper su diseño", () => {
    // Es un Server Component por decisión ("N tarjetas, ninguna necesita
    // estado") y hoy no se monta: no hay ningún `videoclip` curado. Convertirlo
    // en cliente para una sección invisible sería un mal cambio, así que la
    // decisión es explícita y está escrita.
    const fuente = leer(["components", "ReleaseVideoList.tsx"]);
    expect(fuente).not.toContain('"use client"');
    expect(fuente).toMatch(/hqdefault[\s\S]{0,900}no está \*\*garantizada\*\*/);
  });
});
