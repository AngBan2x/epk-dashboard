import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./credentials";

/**
 * F9 Multimedia & Catálogo Expandido.
 *
 * **Este spec se reescribió entero el 2026-10-08**, porque sus cuatro tests
 * afirmaban cosas que el producto dejó de hacer hace tiempo. Fallaban los
 * cuatro contra producción, y ninguno de los cuatro fallos era un defecto: eran
 * expectativas obsoletas. Lo que se comprobaba y por qué ya no era cierto:
 *
 *   - `>= 6` tarjetas en `/dashboard`. Encontraba 4, y no porque falten: el spec
 *     **no iniciar sesión**. Sin sesión, `/dashboard` no pinta catálogo (los
 *     enlaces que encuentra son de cabecera y pie). Autenticado hay 20 tarjetas.
 *     Además el selector `[data-testid='epk-card']` no existió nunca: el
 *     testid real es `epkcard-streams`.
 *   - `Stems` visible en la ficha. `StemsPlayer` se **eliminó a propósito** en
 *     P3.15 ("Eliminar StemsPlayer + SocialBar (redundantes)", MASTER_PLAN.md).
 *     El componente sigue en `components/StemsPlayer.tsx` sin usarse, que es lo
 *     que hace que este test parezca razonable al leerlo. Reintroducir la
 *     aserción aquí sería reintroducir una fase que se cerró.
 *   - La espera `waitForURL` de la ficha: pedía una URL de tipo `track`, y desde
 *     P8 `/track/<id>` es un **shim de 301** a `/releases/<id>`. Esa URL nunca es
 *     la final, así que la espera no puede cumplirse y el test moría antes de
 *     comprobar nada. Ese mismo shim es ahora el invariante que sí se comprueba
 *     abajo.
 *   - "Exportar Dossier EPK" como `h2` del dashboard. El dashboard autenticado
 *     no tiene ningún `h2`.
 *
 * Lo que queda son invariantes que valen hoy: el catálogo pinta tarjetas que
 * enlazan a su ficha, la ficha enseña su título y su lista de pistas, `/track/`
 * aterriza en `/releases/`, y la ficha ofrece las tres descargas.
 *
 * Las tarjetas de **singles** enlazan a `/track/<id>` y las de **releases** a
 * `/releases/<id>`; ambas son válidas porque un single ES fila de `tracks` y
 * cabecera de release con el mismo id.
 *
 * El login se hace una vez por fichero con un contexto propio y se reutiliza el
 * `storageState`, en vez de `test.use({ storageState })`: esa forma de función
 * falla con "use() was not called in fixture" según la versión, y aquí no
 * compensa pelearse con el fixture por cuatro tests.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

/**
 * El catálogo del dashboard se pinta después de leer de Turso, que tarda 1,5-2 s
 * por consulta. Con la suite entera corriendo (43 min seguidos contra producción)
 * 15 s no scraping de llegadas: este spec falló una vez con
 * "element(s) not found" sobre `a[href^='/releases/']`, que sí aparece en cuanto
 * la página carga. Es margen para contenido que depende de la base de datos, no
 * para tapar una aserción.
 */
const ESPERA_CATALOGO = 60_000;

test.describe("F9 Multimedia & Catálogo Expandido", () => {
  // Contra Turso una ficha tarda 1,5-2 s en leer; 120 s es margen sin generar
  // falsos negativos por tiempo.
  test.describe.configure({ timeout: 180_000 });

  let sesion: Awaited<ReturnType<BrowserContext["storageState"]>>;

  test.beforeAll(async ({ browser }) => {
    const anon = await browser.newContext();
    let res = await anon.request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, rememberMe: false },
    });
    // El login tiene rate limit y devuelve 429 si se encadena. Un reintento tras
    // el minuto bastó; más que eso no es culpa de este spec.
    if (res.status() === 429) {
      await new Promise((r) => setTimeout(r, 65_000));
      res = await anon.request.post(`${BASE_URL}/api/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, rememberMe: false },
      });
    }
    expect(res.ok(), `login devolvió ${res.status()}`).toBeTruthy();
    sesion = await anon.storageState();
    await anon.close();
  });

  // El cierre traga sus errores a proposito: si una asercion ya fallo, un
  // "Target page, context or browser has been closed" en el `finally` tapaba
  // justo el mensaje que dice que fallo.
  async function paginaAutenticada(browser: Browser): Promise<{ page: Page; cerrar: () => Promise<void> }> {
    const ctx = await browser.newContext({ storageState: sesion });
    return { page: await ctx.newPage(), cerrar: () => ctx.close().catch(() => {}) };
  }

  test("el catálogo autenticado pinta tarjetas y cada una lleva a su ficha", async ({ browser }) => {
    const { page, cerrar } = await paginaAutenticada(browser);
    try {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1")).toBeVisible();

      // Una tarjeta ES un `Link` (EPKCard envuelve con `next/link`), así que se
      // cuentan los enlaces de ficha. Ojo: `data-testid='epkcard-streams'` NO es
      // la tarjeta, es el badge del número de streams dentro de su fila de
      // métricas; y `epk-card` no existió nunca. Y el mismo href sale dos veces
      // por tarjeta, así que se deduplica antes de contar.
      const hrefs = await page
        .locator("a[href^='/releases/'], a[href^='/track/']")
        .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") || ""));
      const fichas = Array.from(new Set(hrefs.filter(Boolean)));
      expect(fichas.length).toBeGreaterThanOrEqual(6);
    } finally {
      await cerrar();
    }
  });

  test("la ficha de un release muestra su título y su lista de pistas", async ({ browser }) => {
    const { page, cerrar } = await paginaAutenticada(browser);
    try {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      const enlace = page.locator("a[href^='/releases/']").first();
      await expect(enlace).toBeVisible({ timeout: ESPERA_CATALOGO });
      const href = await enlace.getAttribute("href");
      await page.goto(href!, { waitUntil: "domcontentloaded" });

      // La URL es la que se pinzó, sin redirección: el shim va en el sentido
      // contrario (de `/track/` hacia aquí).
      expect(new URL(page.url()).pathname).toBe(href);

      const h1 = ((await page.locator("h1").first().textContent()) ?? "").trim();
      expect(h1.length).toBeGreaterThan(0);

      // El bloque de pistas es el que el rediseño de F3 dejó como "Pistas (n)".
      // Se ancla por rol y no por texto exacto porque el número va suelto:
      // el DOM es `Pistas (<!-- -->5<!-- -->)`.
      await expect(page.getByRole("heading", { name: /^Pistas/ }).first()).toBeVisible();
    } finally {
      await cerrar();
    }
  });

  test("/track/<id> es un shim: aterriza en /releases/<id>", async ({ browser }) => {
    const { page, cerrar } = await paginaAutenticada(browser);
    try {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

      const enlaces = page.locator("a[href^='/track/']");
      await expect(enlaces.first()).toBeVisible({ timeout: ESPERA_CATALOGO });
      const hrefs = Array.from(
        new Set(
          await enlaces
            .evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter((h): h is string => !!h))
        )
      );

      // Se buscan enlaces **vivos** antes de navegar, y se navega una sola vez.
      //
      // Dos motivos, ambos medidos. Uno: el listado del dashboard se sirve desde
      // una réplica que va retrasada (AGENTS.md), así que tras un `qa-cleanup`
      // puede ofrecer un `/track/<id>` de una fila que ya no existe; con ese 404
      // no hay redirección que comprobar. Y por probarlos navigating se iba la
      // cuenta de tiempo del test entero (acababa en "Test ended").
      let vivo: string | null = null;
      for (const href of hrefs.slice(0, 5)) {
        const r = await page.request.get(href, { timeout: 20_000 });
        if (r.status() < 400) {
          vivo = href;
          break;
        }
      }
      expect(
        vivo,
        `Ninguno de los ${Math.min(hrefs.length, 5)} enlaces /track/ del dashboard responde bien: el listado apunta a filas que ya no existen`
      ).not.toBeNull();

      const idTrack = vivo!.split("/").pop()!;
      const respuesta = await page.goto(vivo!, { waitUntil: "domcontentloaded" });
      expect(respuesta?.status()).toBeLessThan(400);
      // Un single es fila de `tracks` Y cabecera de release con el mismo id, así
      // que el shim tiene que acabar en `/releases/` conservando ese id. Este es
      // el invariante de P8, que el spec viejo miraba al revés.
      await expect(page).toHaveURL(new RegExp(`/releases/${idTrack}$`), { timeout: ESPERA_CATALOGO });
      await expect(page.locator("h1")).toBeVisible({ timeout: ESPERA_CATALOGO });
    } finally {
      await cerrar();
    }
  });

  test("la ficha ofrece las tres descargas", async ({ browser }) => {
    const { page, cerrar } = await paginaAutenticada(browser);
    try {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      const enlace = page.locator("a[href^='/releases/']").first();
      await expect(enlace).toBeVisible({ timeout: ESPERA_CATALOGO });
      await page.goto((await enlace.getAttribute("href"))!, { waitUntil: "domcontentloaded" });

      // El nombre accesible de estos botones es el `aria-label`
      // ("Descargar Dossier de prensa de X en HTML"), no el texto "HTML". Y hay
      // nueve: dossier, rider y catálogo, cada uno en tres formatos.
      for (const formato of ["HTML", "JSON", "PDF"]) {
        const botones = page.getByRole("button", { name: new RegExp(`en ${formato}$`) });
        expect(await botones.count()).toBeGreaterThan(0);
      }
    } finally {
      await cerrar();
    }
  });
});