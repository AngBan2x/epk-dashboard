// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ArtistProfile } from "@/types/music";

/**
 * RC.33 Ola 6 — dos peticiones de usuario que se peelingan de "no funciona".
 *
 * ── 1. La tarjeta de artista solo enseña nombre y foto ──────────────────────
 *
 * Antes pintaba nombre, género, ubicación, biografía (3 líneas) y oyentes
 * mensuales, y **no tenía foto**, aunque `artist.profile_image` existía en el
 * tipo desde el principio y se leía en la ficha del artista. Cinco renglones de
 * texto donde el usuario pidió dos cosas.
 *
 * El test que importa no es "pinta el nombre" (eso lo pintaba antes y lo sigue
 * pintando, así que no distingue nada). Es el otro: **que el género y la
 * ubicación ya no aparezcan**. Un test que sigue pasando con el arreglo
 * revertido no protege de nada.
 *
 * ── 2. Las descargas del invitado ──────────────────────────────────────────
 *
 * `DownloadGrid` sin `artist_id` pintaba las 3 filas con 6 celdas
 * `disabled`. El usuario pidió solo la fila de catálogo. Aquí se comprueba el
 * DOM, no el `disabled`: "no montar" y "montar deshabilitado" se leen igual de
 * bien en un snapshot de texto, y no son lo mismo.
 */

/**
 * `vi.mock` se hoistea por encima del resto del módulo, así que su factory no
 * puede leer una `const` declarada abajo. `vi.hoisted` la crea en el momento
 * correcto.
 */
const { imageCalls } = vi.hoisted(() => ({ imageCalls: [] as Array<Record<string, unknown>> }));

/**
 * El mock de `next/image` **sí propaga `onError`**, a diferencia del de
 * `epkcard-audio-control.test.ts`. Sin él no se puede probar el caso del
 * `404`, que es medio contrato de la tarjeta: una `profile_image` rota tiene
 * que caer a iniciales, no dejar el icono del navegador dentro de la rejilla.
 *
 * `src` se pasa tal cual, sin normalizar: por eso el test puede comprobar que
 * el componente **no** monta nunca una imagen con `src=""` (un src vacío es una
 * petición fallida garantizada, no un caso borde).
 */
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    imageCalls.push(props);
    // `fill`, `sizes`, `priority` y `unoptimized` son de Next, no de `<img>`:
    // se quitan para no ensuciar el DOM (y no ensuciar la consola del test con
    // "non-boolean attribute"). `onError` **se queda**, y es el motivo de que
    // este mock exista: sin él no se puede probar que una foto rota cae a
    // iniciales.
    const { fill, sizes, priority, unoptimized, ...rest } = props;
    void fill;
    void sizes;
    void priority;
    void unoptimized;
    return createElement("img", rest);
  },
}));

/**
 * `ArtistsCatalog` usa `useListSort` → `useRouter`/`usePathname` de
 * `next/navigation`. Fuera del App Router, `useRouter()` devuelve `null` en vez
 * de lanzar, pero `router.replace` reventaría en cuanto se tocara el `<select>`.
 * Se mockea para que el test dependa del componente y no del contexto de Next.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/artists",
  notFound: () => {
    throw new Error("notFound");
  },
}));

import { ArtistsCatalog } from "@/components/ArtistsCatalog";
import { DownloadGrid } from "@/components/CatalogDownloadButton";

function artist(over: Partial<ArtistProfile> = {}): ArtistProfile {
  return {
    id: "art-1",
    name: "Nube",
    user_id: null,
    biography: "Bio que no debe salir en la tarjeta",
    press_text: null,
    press_highlights: null,
    genre: "Techno hipnótico",
    location: "Valencia, Venezuela",
    monthly_listeners: 1234567,
    social_links: null,
    profile_image: "https://example.com/nube.jpg",
    banner_image: null,
    slug: null,
    is_active: true,
    deleted_at: null,
    created_at: "2024-01-01T00:00:00.000Z",
    ...over,
  };
}

function renderCatalog(artists: ArtistProfile[]) {
  return render(createElement(ArtistsCatalog, { artists }));
}

beforeEach(() => {
  imageCalls.length = 0;
  cleanup();
});

afterEach(() => {
  cleanup();
});

describe("Tarjeta de artista — solo nombre y foto (RC.33 Ola 6)", () => {
  it("NO enseña el género ni la ubicación, aunque el artista los tenga", () => {
    const { container } = renderCatalog([artist()]);
    const text = container.textContent ?? "";

    expect(text).not.toContain("Techno hipnótico");
    expect(text).not.toContain("Valencia, Venezuela");
    // El emoji de la ubicación tampoco: venía pegado al texto, no al componente.
    expect(text).not.toContain("📍");
  });

  it("tampoco enseña la biografía ni los oyentes mensuales", () => {
    const { container } = renderCatalog([artist()]);
    const text = container.textContent ?? "";

    expect(text).not.toContain("Bio que no debe salir");
    expect(text).not.toMatch(/oyentes mensuales/);
  });

  it("sí enseña el nombre", () => {
    renderCatalog([artist()]);
    expect(screen.getByText("Nube")).toBeTruthy();
  });

  it("sí monta la foto de perfil", () => {
    const { container } = renderCatalog([artist()]);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/nube.jpg");
  });

  it("el nombre es un encabezado y la foto lleva alt con el nombre", () => {
    renderCatalog([artist()]);

    // `h2`: la rejilla no puede aportarle un `h1` a la página, que ya lo tiene.
    expect(screen.getByRole("heading", { level: 2, name: "Nube" })).toBeTruthy();
    expect(screen.getByAltText("Foto de Nube")).toBeTruthy();
  });

  it("mantiene el enlace a la ficha del artista", () => {
    renderCatalog([artist({ id: "art-77" })]);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/artists/art-77");
  });

  it("fija el alto de la caja: la caja existe antes de que cargue la imagen", () => {
    // jsdom no calcula layout, así que el `aspect-square` se comprueba sobre el
    // marcado y no sobre medidas. Lo que importa es que la foto va con `fill`
    // dentro de un contenedor con ratio: sin el ratio, `fill` colapsa a 0 y la
    // tarjeta cambiaría de alto al cargar, en diagonal y celda a celda.
    const { container } = renderCatalog([artist()]);

    const img = container.querySelector("img") as HTMLImageElement;
    expect(imageCalls[0].fill).toBe(true);

    const box = img.parentElement as HTMLElement;
    expect(box.className).toContain("aspect-square");
    expect(box.className).toContain("relative");
    expect(img.className).toContain("object-cover");
  });
});

describe("Tarjeta de artista — el fallback de la foto", () => {
  it("sin foto monta iniciales sobre fondo y NINGÚN <img>", () => {
    const { container } = renderCatalog([artist({ profile_image: null })]);

    expect(container.querySelector("img")).toBeNull();
    // "N" de "Nube". El nombre sigue estando en el h2: la inicial es decoración
    // (`aria-hidden`), no la única fuente del nombre.
    expect(screen.getByText("Nube")).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("N");
  });

  it("nunca monta una imagen con src vacío", () => {
    // `safeString(profile_image, "")` distingue "no hay" de "hay". Un
    // `<Image src="">` sería una petición que falla siempre y, en el peor caso,
    // un `onError` en bucle.
    for (const emptyish of [null, "", "   "]) {
      cleanup();
      imageCalls.length = 0;
      const { container } = renderCatalog([artist({ profile_image: emptyish })]);

      expect(container.querySelector("img")).toBeNull();
      expect(imageCalls).toHaveLength(0);
    }
  });

  it("si la foto falla al cargar, cae a iniciales y quita la imagen rota", () => {
    const { container } = renderCatalog([artist()]);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();

    // Un 404 de la CDN: el `src` estaba bien escrito y aun así no hay imagen.
    fireEvent.error(img as HTMLImageElement);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("N");
  });

  it("un nombre vacío no rompe la tarjeta", () => {
    // `safeString(name, "Artista")`: sin él, `charAt(0)` de `""` daría `""` y
    // el fallback sería un círculo vacío sin nada dentro.
    const { container } = renderCatalog([artist({ name: "", profile_image: null })]);

    expect(screen.getByText("Artista")).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("A");
  });
});

describe("DownloadGrid — el invitado solo ve la fila de catálogo", () => {
  it("sin artistId monta UNA fila, la de catálogo", () => {
    const { container } = render(createElement(DownloadGrid, { artistName: "PressPlay" }));

    const rows = container.querySelectorAll('[data-section="catalog"]');
    expect(rows).toHaveLength(3); // 3 formatos
    expect(container.textContent ?? "").toContain("Catálogo");
  });

  it("sin artistId NO monta dossier ni rider: ni muertos, ni deshabilitados", () => {
    const { container } = render(createElement(DownloadGrid, { artistName: "PressPlay" }));

    expect(container.querySelectorAll('[data-section="dossier"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-section="rider"]')).toHaveLength(0);
    expect(container.textContent ?? "").not.toContain("Dossier de prensa");
    expect(container.textContent ?? "").not.toContain("Rider técnico");
  });

  it("sin artistId ninguna celda queda deshabilitada", () => {
    const { container } = render(createElement(DownloadGrid, { artistName: "PressPlay" }));

    // El bug anterior: 6 botones `disabled` con un `title` que explicaba por
    // qué. Un control deshabilitado promete algo que no va a pasar.
    const disabled = container.querySelectorAll("button[disabled]");
    expect(disabled).toHaveLength(0);
  });

  it("con artistId monta las TRES filas completas", () => {
    const { container } = render(
      createElement(DownloadGrid, { artistId: "art-1", artistName: "Nube" })
    );

    for (const section of ["dossier", "rider", "catalog"]) {
      expect(container.querySelectorAll(`[data-section="${section}"]`)).toHaveLength(3);
    }
    expect(container.querySelectorAll("button[disabled]")).toHaveLength(0);
    expect(container.textContent ?? "").toContain("Dossier de prensa");
    expect(container.textContent ?? "").toContain("Rider técnico");
    expect(container.textContent ?? "").toContain("Catálogo");
  });

  it("un artistId vacío o en blanco cuenta como invitado", () => {
    // `safeString(artistId, "")` es lo que decide, y `""` no es un id: es el
    // caso de `/track/[id]` con `artist?.id ?? null` cuando el track no tiene
    // ficha.
    for (const emptyish of [null, undefined, ""]) {
      cleanup();
      const { container } = render(
        createElement(DownloadGrid, { artistId: emptyish, artistName: "PressPlay" })
      );
      expect(container.querySelectorAll('[data-section="dossier"]')).toHaveLength(0);
      expect(container.querySelectorAll('[data-section="catalog"]')).toHaveLength(3);
    }
  });
});
