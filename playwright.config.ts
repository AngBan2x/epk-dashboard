import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

// Playwright NO hereda la carga de `.env.local` que hace Next. Sin esto, los
// `process.env.TEST_*` de `scripts/lib/credentials.ts` serian `undefined` en
// todos los specs y las credenciales saldrian vacias. En CI las variables
// llegan del secret store y esta llamada no encuentra fichero: es inocua.
dotenv.config({ path: ".env.local" });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  timeout: 60000,
});
