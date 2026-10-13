import { test, expect } from "@playwright/test";

/**
 * RC.37 — La pagina de callback del login de Meta.
 *
 * Existe porque recibe un **secreto** por la URL. Y hasta ahora no se habia
 * ejecutado nunca: se escribio, compilo, y los tests unitarios cubrian
 * `leerFragmento`, pero nadie la habia mirado en un navegador. Si estuviera rota
 * —por el init script de tema, por la hidratacion, por lo que fuera— el
 * usuario llegaria desde el login de Meta, veria un error, y el token se
 * perderia, porque la barra de direcciones ya se ha limpiado.
 *
 * ## Que prueba y que no
 *
 * **No hay red ni sesion de Facebook.** Todo lo que se comprueba es lo que la
 * pagina hace con un fragmento **inventado**. Es suficiente porque la pagina solo
 * lee `window.location.hash` y pinta lo que encuentra: no valida el token
 * contra Meta ni aqui ni en produccion.
 *
 * ## El token de mentira
 *
 * `TOKEN-FALSO` no es una credencial ni lo pretende. Se comprueba que aparece en
 * pantalla, pero lo que se protege de verdad es lo de abajo.
 */

const RUTA = "/auth/meta/callback";

const TOKEN_FALSO = "TOKEN-FALSO-NO-ES-CREDENCIAL";

test.describe("callback de Meta", () => {
  test("muestra el token de larga duración y dice cuál usar", async ({ page }) => {
    await page.goto(
      `${RUTA}#access_token=EAAH-corto&long_lived_token=${TOKEN_FALSO}&expires_in=4815`
    );

    await expect(page.getByText("Token de larga duración")).toBeVisible();
    await expect(page.getByText(TOKEN_FALSO)).toBeVisible();
    await expect(page.getByRole("button", { name: /copiar/i })).toBeVisible();
    await expect(page.getByText(/Caduca en \d+ minutos/)).toBeVisible();
  });

  test("sin token de larga duración, lo dice y no finge que hay uno largo", async ({ page }) => {
    await page.goto(`${RUTA}#access_token=EAAH-corto`);

    await expect(page.getByText("Token de corta duración")).toBeVisible();
    await expect(page.getByText("Token de larga duración")).toHaveCount(0);
  });

  test("BORRA el token de la URL nada más leerlo", async ({ page }) => {
    // Esta es la aserción que justifica la página. Un token en la barra de
    // direcciones se queda en el historial del navegador y de ahí en el
    // `Referer` de lo que se cargue despues.
    await page.goto(`${RUTA}#access_token=EAAH-corto&long_lived_token=${TOKEN_FALSO}`);

    await expect(page.getByText(TOKEN_FALSO)).toBeVisible();

    expect(page.url()).not.toContain("access_token");
    expect(page.url()).not.toContain(TOKEN_FALSO);
    expect(page.url()).not.toContain("#");
  });

  test("el token NO vuelve al pulsar 'atrás'", async ({ page }) => {
    // El test anterior mira la URL **actual**, y ahí no basta para distinguir
    // `replaceState` de `pushState`: los dos limpian el hash, porque el hash no
    // forma parte del `pathname`. Se comprobó revirtiendo a `pushState` y el
    // test pasaba igual.
    //
    // Lo que los separa es el historial. `pushState` **añade** una entrada, así
    // que la anterior —la que tenía el token— sigue ahí y vuelve con "atrás".
    // `replaceState` la sustituye. Ese es el invariante real, y este test lo
    // comprueba saliendo de la página con el botón del navegador, que es
    // exactamente lo que haría alguien que acaba de llegar del login.
    await page.goto(`${RUTA}#access_token=EAAH-corto&long_lived_token=${TOKEN_FALSO}`);
    await expect(page.getByText(TOKEN_FALSO)).toBeVisible();

    await page.goBack();
    await page.waitForTimeout(800);

    expect(page.url()).not.toContain("access_token");
    expect(page.url()).not.toContain(TOKEN_FALSO);
  });

  test("sin fragmento explica que hay que venir del login", async ({ page }) => {
    await page.goto(RUTA);

    // Abrirla a mano es el caso mas probable: se copia la ruta, se pega en una
    // pestana nueva. Decir "no hay ningun token" es mucho mejor que una pagina
    // en blanco que parece que no carga.
    await expect(page.getByText("No hay ningún token en la URL")).toBeVisible();
    await expect(page.getByRole("button", { name: /copiar/i })).toHaveCount(0);
  });

  test("un error de Meta se muestra con su código", async ({ page }) => {
    await page.goto(`${RUTA}#error=access_denied&error_description=Cancelado`);

    await expect(page.getByText("El login devolvió un error")).toBeVisible();
    await expect(page.getByText("access_denied")).toBeVisible();
    await expect(page.getByText("Cancelado")).toBeVisible();
  });

  test("avisa de que es una ruta de desarrollo", async ({ page }) => {
    await page.goto(`${RUTA}#long_lived_token=${TOKEN_FALSO}`);

    // La unica proteccion de esta pagina es el aviso: si alguien la publica, lo
    // que evita un accidente es que se lea que no debe estar ahi.
    await expect(page.getByText(/Solo para desarrollo/i)).toBeVisible();
  });
});