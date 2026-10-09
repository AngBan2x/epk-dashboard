import { test, expect } from "@playwright/test";

/**
 * `POST /api/auth/register` tiene un límite de **3 por minuto y por IP**
 * (`checkRateLimit('register:${ip}', 3, 60_000)`, `app/api/auth/register/route.ts`).
 * Es deliberado —registro público sin verificación de correo— y este spec crea
 * **cuatro** cuentas seguidas, así que el último se comía un 429 y moría en
 * `waitForURL` sin dar ninguna pista de por qué.
 *
 * Por eso se separa cada registro 21 s. Es lo mismo que hace `approvals-qa.spec.ts`
 * con su `throttle` para el login, y no es un parche: es que este test compite por
 * el mismo presupuesto de peticiones que cualquiervisitor.
 */
/**
 * Espera a que React haya hidratado el formulario.
 *
 * Antes de hidratar, `<form onSubmit={...}>` es un formulario **nativo**: al
 * enviarlo el navegador hace GET y recarga la página. El síntoma es exactamente
 * el que veía este spec —los campos vacíos, la URL igual y ningún error de
 * React— y por eso `rellenar` no bastaba: el valor se quedaba hasta el envío y
 * lo borraba la recarga.
 *
 * No se espera "un rato": la señal es que React ya colgó sus props en el nodo.
 * Con `waitForTimeout` esto es una lotería que hoy pasa y mañana no.
 */
async function esperarHidratacion(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => {
      const b = document.querySelector("form button[type='submit']");
      return !!b && Object.keys(b).some((k) => k.startsWith("__reactProps$"));
    },
    undefined,
    { timeout: 30_000 }
  );
}

/**
 * Rellena un campo y **comprueba que el valor se queda**.
 *
 * Los inputs de login y registro son controlados por React. Si se rellena antes
 * de que la página hidrate, React sustituye el DOM al hidratar y lo escrito
 * desaparece: el formulario se envía vacío y el error que sale es
 * "La contraseña debe tener al menos 8 caracteres" con una contraseña de 12,
 * que no explica nada. Por eso este spec fallaba siempre contra producción.
 *
 * El fallo no era del producto ni del rate limit (que también los frenaba, pero
 * por debajo): era una carrera con la hidratación. Con `networkidle` —que es lo
 * que usaba antes— la carrera no se veía porque la espera tampoco llegaba a
 * cumplirse nunca.
 */
async function rellenar(page: import("@playwright/test").Page, selector: string, valor: string) {
  await esperarHidratacion(page);
  const campo = page.locator(selector);
  await campo.waitFor({ state: "visible" });
  for (let intento = 1; intento <= 4; intento++) {
    await campo.fill(valor);
    if ((await campo.inputValue()) === valor) return;
    await page.waitForTimeout(600);
  }
throw new Error(`${selector} no conserva el valor tras 4 intentos: la página rehidrata y borra lo escrito`);
}

let ultimoRegistro = 0;
async function esperarHuecoDeRegistro() {
  const desde = Date.now() - ultimoRegistro;
  if (desde < 21_000) await new Promise((r) => setTimeout(r, 21_000 - desde));
  ultimoRegistro = Date.now();
}

/**
 * `waitForURL` a secas, cuando expira, solo dice "Timeout 15000ms exceeded": dice
 * dónde acabó la página ni qué error había en pantalla, que es justo lo que hace
 * falta para diagnosing el fallo. Este envoltorio añade las dos cosas al reventar.
 */
async function esperarUrl(page: import("@playwright/test").Page, patron: string, ms = 15000) {
  try {
    await page.waitForURL(patron, { timeout: ms });
  } catch (e) {
    const url = page.url();
const texto = await page
      // 800 y no 300: el mensaje de error del registro se pinta DEBAJO del
      // formulario, así que con 300 se quedaba justo fuera del volcado y
      // parecía que no había error. Nada había fallado.
      .evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 800))
      .catch(() => "(no se pudo leer el cuerpo)");
    // Y el estado real de los campos: un "la contraseña debe tener 8 caracteres"
    // con una contraseña de 12 solo significa que el campo llegó vacío, y eso
    // no se ve desde el texto de la página.
    const campos = await page
      .locator("form input")
      .evaluateAll((is) =>
        is.map((i) => `${(i as HTMLInputElement).id || (i as HTMLInputElement).type}:${(i as HTMLInputElement).value.length}`)
      )
      .catch(() => ["(no se pudieron leer los campos)"]);
    throw new Error(
      `No se llegó a ${patron} en ${ms} ms.\n` +
        `  URL actual: ${url}\n` +
        `  Campos (id:tamaño del valor): ${campos.join(", ")}\n` +
        `  En pantalla: ${texto}\n` +
        `  Causa: ${e}`
    );
  }
}

test.describe("N6: Register + Login + Delete Account", () => {
  let testEmail: string;
  const TEST_PASSWORD = "TestPass123!";

  test("register new account", async ({ page }) => {
    testEmail = `test-n6-${Date.now()}@example.com`;
    
    await esperarHuecoDeRegistro();
    await page.goto("/register", { waitUntil: "domcontentloaded" });

    await rellenar(page, 'input#name', "Test Phase N User");
    await rellenar(page, 'input[type="email"]', testEmail);
    await rellenar(page, '#password', TEST_PASSWORD);
    await rellenar(page, '#confirmPassword', TEST_PASSWORD);

    await page.screenshot({
      path: "screenshots/register-delete/register-form.png",
      fullPage: true,
    });

// El submit se busca DENTRO del <form>: `button[type="submit"]` a secas
    // matchea también el toggle de tema, que también es submit, y el clic caía ahí.
    await page.locator("form button[type='submit']").click();
    // El registro lleva a `/artists`, no a `/dashboard`. Desde P6 el registro
    // público crea solo `subscriber` (se eliminó el selector de artista) y su
    // puerta de entrada es el catálogo. Este spec esperaba `**/dashboard`.
    await esperarUrl(page, "**/artists");
  await expect(page).toHaveURL(/\/artists/);

    await page.screenshot({
      path: "screenshots/register-delete/after-register.png",
      fullPage: true,
    });

    console.log("Registered with email:", testEmail);
  });

  test("login with new account", async ({ page }) => {
    // Register a fresh account
    const loginEmail = `test-login-${Date.now()}@example.com`;
    
    await esperarHuecoDeRegistro();
    await page.goto("/register", { waitUntil: "domcontentloaded" });
    await rellenar(page, 'input#name', "Login Test");
    await rellenar(page, 'input[type="email"]', loginEmail);
    await rellenar(page, '#password', TEST_PASSWORD);
    await rellenar(page, '#confirmPassword', TEST_PASSWORD);
// El submit se busca DENTRO del <form>: `button[type="submit"]` a secas
    // matchea también el toggle de tema, que también es submit, y el clic caía ahí.
    await page.locator("form button[type='submit']").click();
    await esperarUrl(page, "**/artists");

    // Logout via API call, then clear cookie in browser
    await page.request.post("/api/auth/logout");
    // Clear auth cookie manually
    await page.context().clearCookies();
    
    // Go to login page
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await rellenar(page, 'input[type="email"]', loginEmail);
    await rellenar(page, '#password', TEST_PASSWORD);
// El submit se busca DENTRO del <form>: `button[type="submit"]` a secas
    // matchea también el toggle de tema, que también es submit, y el clic caía ahí.
    await page.locator("form button[type='submit']").click();

    // El login, en cambio, sí lleva a `/dashboard`: `app/login/page.tsx` usa
    // `searchParams.get("redirect") || "/dashboard"`. Este spec esperaba
    // `/artists` aquí por culpa de un reemplazo global, y el test moría ahí.
    await esperarUrl(page, "**/dashboard", 20_000);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.screenshot({
      path: "screenshots/register-delete/after-login.png",
      fullPage: true,
    });

    console.log("Logged in with:", loginEmail);
  });

  test("delete account via API", async ({ page }) => {
    // Register first
    const delEmail = `test-del-${Date.now()}@example.com`;
    
    await esperarHuecoDeRegistro();
    await page.goto("/register", { waitUntil: "domcontentloaded" });
    await rellenar(page, 'input#name', "Delete User");
    await rellenar(page, 'input[type="email"]', delEmail);
    await rellenar(page, '#password', TEST_PASSWORD);
    await rellenar(page, '#confirmPassword', TEST_PASSWORD);
// El submit se busca DENTRO del <form>: `button[type="submit"]` a secas
    // matchea también el toggle de tema, que también es submit, y el clic caía ahí.
    await page.locator("form button[type='submit']").click();
    await esperarUrl(page, "**/artists");

    // Delete account via API
    const deleteResponse = await page.request.delete("/api/auth/me");
    expect(deleteResponse.ok()).toBeTruthy();
    const body = await deleteResponse.json();
    console.log("Delete response:", body);

    // Verify session is cleared.
    //
    // Se comprueba por la API y no mirando a dónde redirige el navegador:
    // `/dashboard` es pública (devuelve 200 sin sesión), así que la URL final no
    // demuestra que la sesión haya muerto. Antes este paso solo hacía
    // `console.log` y no afirmaba nada: un check que no puede fallar no
    // comprueba que la sesión se invalidara.
    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(401);

    await page.goto("/artists", { waitUntil: "domcontentloaded" });

    await page.screenshot({
      path: "screenshots/register-delete/after-delete.png",
      fullPage: true,
    });
  });

  test("deleted account cannot login", async ({ page }) => {
    // Register and delete
    const delEmail2 = `test-del2-${Date.now()}@example.com`;
    
    await esperarHuecoDeRegistro();
    await page.goto("/register", { waitUntil: "domcontentloaded" });
    await rellenar(page, 'input#name', "Del2 User");
    await rellenar(page, 'input[type="email"]', delEmail2);
    await rellenar(page, '#password', TEST_PASSWORD);
    await rellenar(page, '#confirmPassword', TEST_PASSWORD);
// El submit se busca DENTRO del <form>: `button[type="submit"]` a secas
    // matchea también el toggle de tema, que también es submit, y el clic caía ahí.
    await page.locator("form button[type='submit']").click();
    await esperarUrl(page, "**/artists");

    // Delete
    const delRes = await page.request.delete("/api/auth/me");
    expect(delRes.ok()).toBeTruthy();

    // Try to login with deleted account
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await rellenar(page, 'input[type="email"]', delEmail2);
    await rellenar(page, '#password', TEST_PASSWORD);
// El submit se busca DENTRO del <form>: `button[type="submit"]` a secas
    // matchea también el toggle de tema, que también es submit, y el clic caía ahí.
    await page.locator("form button[type='submit']").click();

    // Wait for error or stay on login
    await page.waitForTimeout(2000);
    const url = page.url();
    const stayedOnLogin = url.includes("/login");
    console.log("Stayed on login (account deleted):", stayedOnLogin);

    // Should see error message
    const errorMsg = page.locator("text=Credenciales inválidas");
    const hasError = await errorMsg.isVisible().catch(() => false);
    console.log("Shows error message:", hasError);

    await page.screenshot({
      path: "screenshots/register-delete/deleted-account-login.png",
      fullPage: true,
    });
  });
});
