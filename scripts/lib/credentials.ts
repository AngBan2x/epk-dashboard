/**
 * Credenciales de test — fuente unica de verdad.
 *
 * Este modulo es el que contiene la logica. `tests/e2e/credentials.ts` solo lo
 * re-exporta, de modo que un cambio aqui se propaga a los ~35 ficheros que
 * consumen credenciales sin que haya dos copias que puedan divergir en silencio.
 *
 * REGLA (no negociable): **ninguna contrasena tiene default**. Un entorno sin
 * configurar devuelve `""` y falla visible al autenticar, en vez de pasar con
 * la credencial real de produccion metida en el repo. Si alguna vez se
 * reintroduce un default con un secreto, `tests/unit/credentials.test.ts` se
 * pone rojo.
 *
 * De donde salen:
 * - local: `.env.local` (ver `.env.example`). Playwright carga ese fichero en
 *   `playwright.config.ts` porque no hereda la carga de Next.
 * - CI: secret store del proveedor. Nunca en el repositorio.
 */

export type TestRole = "artist" | "admin";

export type TestCredential = { email: string; password: string };

/**
 * `admin@epk.local` es una direccion local y no un secreto, asi que puede
 * tener default: los scripts que verifican el panel de admin siguen siendo
 * ejecutables sin configurar nada.
 *
 * El email del artista **no** tiene default a proposito: la unica cuenta de
 * artista conocida es la de una persona real, asi que su direccion es PII y
 * tambien sale del repo.
 */
export const DEFAULT_ADMIN_EMAIL = "admin@epk.local";

export const ARTIST_EMAIL = process.env.TEST_ARTIST_EMAIL ?? "";
export const ARTIST_PASSWORD = process.env.TEST_ARTIST_PASSWORD ?? "";
export const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? "";

/** Variable de entorno que hay que definir para un rol, para el mensaje de error. */
const ENV_NAME: Record<TestRole, { email: string; password: string }> = {
  artist: { email: "TEST_ARTIST_EMAIL", password: "TEST_ARTIST_PASSWORD" },
  admin: { email: "TEST_ADMIN_EMAIL", password: "TEST_ADMIN_PASSWORD" },
};

function current(role: TestRole): TestCredential {
  return role === "artist"
    ? { email: ARTIST_EMAIL, password: ARTIST_PASSWORD }
    : { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
}

/** Que falta para poder autenticarse, sin imprimir ningun valor. */
export function missingCredentialEnvVars(role: TestRole): string[] {
  const { email, password } = current(role);
  const names = ENV_NAME[role];
  const missing: string[] = [];
  if (!email) missing.push(names.email);
  if (!password) missing.push(names.password);
  return missing;
}

/**
 * Falla pronto y con un mensaje util en vez de dejar que un `fill("")` acabe
 * en un 401 dificil de diagnosticar.
 *
 * @param role  que credenciales se requieren
 * @param motivo por que se piden, para que el mensaje diga donde mirar
 */
export function requireCredentials(role: TestRole, motivo?: string): TestCredential {
  const cred = current(role);
  const missing = missingCredentialEnvVars(role);
  if (missing.length > 0) {
    const donde = motivo ? `\n  Se ha pedido para: ${motivo}` : "";
    throw new Error(
      `Faltan variables de entorno para las credenciales de ${role}: ${missing.join(", ")}.` +
        `\n  Definelas en .env.local (plantilla en .env.example) o en el secret store de CI.${donde}` +
        `\n  Los valores no se imprimen a proposito y los scripts no llevan contrasena por defecto:`
    );
  }
  return cred;
}
