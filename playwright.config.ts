import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

// Playwright NO hereda la carga de `.env.local` que hace Next. Sin esto, los
// `process.env.TEST_*` de `scripts/lib/credentials.ts` serian `undefined` en
// todos los specs y las credenciales saldrian vacias. En CI las variables
// llegan del secret store y esta llamada no encuentra fichero: es inocua.
dotenv.config({ path: ".env.local" });

// Correr contra producción: `PLAYWRIGHT_BASE_URL=https://epk-dashboard.vercel.app`.
//
// Sin esto, `baseURL` estaba fijo a `localhost:3000` y el bloque `webServer`
// levantaba `next dev` SIEMPRE. Documentar "usa PLAYWRIGHT_BASE_URL para correr
// contra producción" sin leerlo era una forma de perder una hora: la variable se
// ignoraba en silencio, los 138 tests iban contra el dev server local —que
// además es la configuración que no funciona bien (ABI de better-sqlite3 y el
// aserto nativo de teardown de V8)— y el resultado no era de producción sino
// de local, con el nombre de producción.
//
// Cuando hay URL base, `webServer` se anula: levantar un dev server mientras se
// prueba contra un despliegue solo gasta RAM y añade ruido a los logs.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const contraProduccion = !!process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: contraProduccion
    ? undefined
    : {
        command: "pnpm dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
  timeout: 60000,
});
