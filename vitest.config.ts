import { defineConfig } from "vitest/config";
import path from "path";

// Force-clear Turso env vars BEFORE any module is loaded.
// vitest's env config is applied after Vite loads .env files, so we must
// delete them here at config-evaluation time (before imports).
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
