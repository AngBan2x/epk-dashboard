import { defineConfig } from "vitest/config";
import path from "path";

// Force-clear Turso env vars BEFORE any module is loaded.
// vitest's env config is applied after Vite loads .env files, so we must
// delete them here at config-evaluation time (before imports).
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

export default defineConfig({
  // RC.33: los `.tsx` se compilan con el runtime JSX **automático**, como hace
  // Next. Sin esto, esbuild usa el clásico y los componentes lancan
  // `ReferenceError: React is not defined` al renderizar en un test.
  //
  // Es aditivo: hasta ahora ningún test renderizaba un componente, así que no
  // cambia el comportamiento de los que ya existían. NO tocar los dos `delete`
  // de arriba — son lo que impide que los tests escriban en Turso.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
