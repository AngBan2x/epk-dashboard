import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Tests del helper de credenciales.
 *
 * El punto de este fichero no es "que el helper lea el env" (eso lo hace el
 * lenguaje), sino **que las contrasenas no vuelvan a tener un default en el
 * repo**. Por eso se importa el modulo de forma dinamica con el env manipulado:
 * las constantes se evaluan al importar, y sin reimportar no se veria el
 * cambio.
 *
 * No se toca `.env.local` real ni se hace red: el env se guarda y se restaura.
 */

const ENV_KEYS = [
  "TEST_ARTIST_EMAIL",
  "TEST_ARTIST_PASSWORD",
  "TEST_ADMIN_EMAIL",
  "TEST_ADMIN_PASSWORD",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

let saved: Partial<Record<EnvKey, string | undefined>> = {};

/** Credenciales que estaban en el repo antes de esta subfase. */
const CRED_A_EMAIL = "test-artist@example.invalid";
const CRED_A_PASSWORD = "12345678";
const CRED_B_PASSWORD = "CONTRASENA_ADMIN_ROTADA";

async function loadHelper() {
  vi.resetModules();
  return await import("@/scripts/lib/credentials");
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
});

describe("scripts/lib/credentials", () => {
  it("devuelve las 4 credenciales cuando las variables estan definidas", async () => {
    process.env.TEST_ARTIST_EMAIL = "artista@example.test";
    process.env.TEST_ARTIST_PASSWORD = "pw-artista";
    process.env.TEST_ADMIN_EMAIL = "admin@example.test";
    process.env.TEST_ADMIN_PASSWORD = "pw-admin";

    const c = await loadHelper();

    expect(c.ARTIST_EMAIL).toBe("artista@example.test");
    expect(c.ARTIST_PASSWORD).toBe("pw-artista");
    expect(c.ADMIN_EMAIL).toBe("admin@example.test");
    expect(c.ADMIN_PASSWORD).toBe("pw-admin");
  });

  it("SIN variables devuelve string vacio para toda contrasena", async () => {
    const c = await loadHelper();

    expect(c.ARTIST_PASSWORD).toBe("");
    expect(c.ADMIN_PASSWORD).toBe("");
    expect(c.ARTIST_EMAIL).toBe("");
  });

  it("SIN variables NO devuelve ninguna credencial real (protege el default)", async () => {
    const c = await loadHelper();

    expect(c.ARTIST_EMAIL).not.toBe(CRED_A_EMAIL);
    expect(c.ARTIST_PASSWORD).not.toBe(CRED_A_PASSWORD);
    expect(c.ADMIN_PASSWORD).not.toBe(CRED_B_PASSWORD);
    for (const value of [c.ARTIST_EMAIL, c.ARTIST_PASSWORD, c.ADMIN_EMAIL, c.ADMIN_PASSWORD]) {
      expect(value).not.toContain("gmail.com");
    }
  });

  it("el email del admin tiene default local porque no es un secreto", async () => {
    const c = await loadHelper();

    expect(c.ADMIN_EMAIL).toBe(c.DEFAULT_ADMIN_EMAIL);
    expect(c.ADMIN_EMAIL).toBeTruthy();
    // y sigue siendo sobreescribible
    process.env.TEST_ADMIN_EMAIL = "otro@example.test";
    const c2 = await loadHelper();
    expect(c2.ADMIN_EMAIL).toBe("otro@example.test");
  });

  it("requireCredentials devuelve las credenciales cuando estan completas", async () => {
    process.env.TEST_ARTIST_EMAIL = "artista@example.test";
    process.env.TEST_ARTIST_PASSWORD = "pw-artista";
    process.env.TEST_ADMIN_EMAIL = "admin@example.test";
    process.env.TEST_ADMIN_PASSWORD = "pw-admin";

    const c = await loadHelper();

    expect(c.requireCredentials("artist", "login del artista")).toEqual({
      email: "artista@example.test",
      password: "pw-artista",
    });
    expect(c.requireCredentials("admin")).toEqual({
      email: "admin@example.test",
      password: "pw-admin",
    });
  });

  it("requireCredentials lanza un error util, sin imprimir ningun valor", async () => {
    const c = await loadHelper();

    expect(() => c.requireCredentials("artist", "QA de aprobaciones")).toThrowError(
      /TEST_ARTIST_EMAIL, TEST_ARTIST_PASSWORD/
    );
    try {
      c.requireCredentials("admin");
      throw new Error("deberia haber lanzado");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("TEST_ADMIN_PASSWORD");
      expect(msg).toContain(".env.local");
      // el mensaje nombra variables, nunca muestra valores
      expect(msg).not.toContain(CRED_B_PASSWORD);
      expect(msg).not.toContain("123456");
    }
  });

  it("missingCredentialEnvVars lista solo lo que falta de verdad", async () => {
    process.env.TEST_ARTIST_EMAIL = "artista@example.test";

    const c = await loadHelper();

    expect(c.missingCredentialEnvVars("artist")).toEqual(["TEST_ARTIST_PASSWORD"]);
    // al admin solo le falta la contrasena: el email tiene default
    expect(c.missingCredentialEnvVars("admin")).toEqual(["TEST_ADMIN_PASSWORD"]);
  });
});

describe("tests/e2e/credentials.ts (reexport)", () => {
  it("no duplica la logica: comparte estado con scripts/lib/credentials", async () => {
    process.env.TEST_ARTIST_PASSWORD = "pw-compartida";

    vi.resetModules();
    const canonica = await import("@/scripts/lib/credentials");
    const reexport = await import("@/tests/e2e/credentials");

    expect(reexport.ARTIST_PASSWORD).toBe(canonica.ARTIST_PASSWORD);
    expect(reexport.requireCredentials).toBe(canonica.requireCredentials);
  });
});
