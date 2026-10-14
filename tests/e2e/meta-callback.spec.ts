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
    //
    // El texto ahora menciona los dos porque la misma pagina sirve a Facebook y
    // a Threads, y el code de Threads no es un token. Decir solo "token"
    // dejaria a alguien con un code en la URL pensando que se ha equivocado de
    // plataforma.
    await expect(page.getByText("No hay ni token ni code en la URL")).toBeVisible();
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
// ── El code de Threads ─────────────────────────────────────────────────────

test.describe("callback de Threads", () => {
  // El caso que falla es el que la pagina lleva siete RC sin cubrir: Threads
  // devuelve el code en la QUERY y no en el fragmento. `leerFragmento` no lo ve,
  // asi que la pagina decia "No hay ningun token en la URL" con el code a tres
  // caracteres de la barra de direcciones, y el code se perdia porque la URL ya
  // se habia limpiado.

  const CODE = "AQBx-hBsH3codigoDePrueba";

  test("muestra el code de la query y dice como usarlo", async ({ page }) => {
    // Esta es la URL que devuelve Threads de verdad, con el #_ incluido.
    await page.goto(`/auth/meta/callback/?code=${CODE}#_`);

    await expect(page.getByText("Authorization code de Threads")).toBeVisible();
    await expect(page.locator("code", { hasText: CODE })).toBeVisible();
    await expect(page.getByText("1 hora")).toBeVisible();
  });

  test("el code NO se confunde con un token de Meta", async ({ page }) => {
    // El texto de la pagina no puede hablar de tokens: el que se pasa a
    // `threads-token.ts` es un code, y quien lo lea tiene que saber cual de los
    // dos es.
    await page.goto(`/auth/meta/callback/?code=${CODE}#_`);

    await expect(page.getByText("Token de Meta", { exact: true })).toHaveCount(0);
    await expect(page.getByText("threads-token.ts")).toBeVisible();
  });

  test("BORRA el code de la URL nada mas leerlo", async ({ page }) => {
    await page.goto(`/auth/meta/callback/?code=${CODE}#_`);
    await expect(page.getByText("Authorization code de Threads")).toBeVisible();

    // El code es de un solo uso y una hora, pero eso no lo hace seguro de
    // dejar en la barra de direcciones: se queda en el historial y sale en
    // cualquier `Referer` posterior.
    await expect(page).not.toHaveURL(new RegExp(CODE));
    expect(page.url()).toBe(page.url().split("?")[0]);
  });

  test("el code NO vuelve al pulsar 'atras'", async ({ page }) => {
    await page.goto("/auth/meta/callback/");
    await page.goto(`/auth/meta/callback/?code=${CODE}#_`);
    await expect(page.getByText("Authorization code de Threads")).toBeVisible();

    await page.goBack();

    // `replaceState` no deja entrada: al volver se ve la pagina sin code, no el
    // code. Con `pushState` el code seguiria ahi, que es el bug.
    await expect(page.locator("code", { hasText: CODE })).toHaveCount(0);
  });

  test("el #_ de Threads no aparece como si fuera el code", async ({ page }) => {
    await page.goto(`/auth/meta/callback/?code=${CODE}#_`);

    // El code va en la query. Si alguien leyera el #_ como valor, lo que se
    // copiaria seria un "_" y el canje fallaria en el script con un error que
    // no menciona la URL.
    const bloqueado = page.locator("code").first();
    await expect(bloqueado).toHaveText(CODE);
    await expect(bloqueado).not.toHaveText("_");
  });

  test("una cancelacion de Threads se explica, no se traga", async ({ page }) => {
    await page.goto(
      "/auth/meta/callback/?error=access_denied&error_reason=user_denied&error_description=The+user+denied+your+request"
    );

    await expect(page.getByText("El login devolvi")).toBeVisible();
    await expect(page.getByText("access_denied")).toBeVisible();
    await expect(page.getByText("user_denied")).toBeVisible();
    // Y no dice "no hay nada": son cosas distintas.
    await expect(page.getByText("No hay ni token ni code")).toHaveCount(0);
  });

  test("sin code ni token sigue explicando que hay que venir del login", async ({ page }) => {
    await page.goto("/auth/meta/callback/");

    await expect(page.getByText("No hay ni token ni code")).toBeVisible();
  });
});
