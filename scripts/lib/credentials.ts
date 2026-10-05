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
 *
 * ── Por que este modulo carga el entorno ───────────────────────────────────
 *
 * Este fichero hace `config()` el mismo, y no por comodidad. En ES modules
 * **todos los imports se evaluan antes que cualquier sentencia del cuerpo del
 * modulo**: si el consumidor pone
 *
 *     import { config } from "dotenv";
 *     config({ path: ".env.local" });
 *     import { ADMIN_PASSWORD } from "./lib/credentials";
 *
 * la segunda linea sigue ejecutandose DESPUES de que este modulo ya capturo
 * `process.env`, y las constas exportadas salen vacias. El `config()` del
 * consumidor no sirve de nada aqui.
 *
 * Es el mismo patron que RC.32 rompio en `lib/turso.ts` (const a nivel de modulo
 * con snapshot del env) y por el que dos rutas respondian 500. Por eso el
 * modulo que LEE el entorno es el que lo CARGA, y por eso `current()` relee en
 * tiempo de llamada y no se apoya solo en las constas.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

export type TestRole = "artist" | "admin" | "subscriber";

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

/**
 * Lee una variable tratando **la cadena vacia como "no definida"**.
 *
 * `process.env.X ?? DEF` no hace eso: `??` solo cae en el default cuando el valor
 * es `null` o `undefined`, no cuando es `""`. Y una variable presente pero
 * vacia es justo lo que se encuentra quien exporta mal un secreto en CI, o quien
 * escribe `TEST_ADMIN_EMAIL=` en un `.env.local`.
 *
 * Con `??` a secas, ese caso dejaba `ADMIN_EMAIL === ""`: el default del admin
 * desaparecia justo cuando el entorno estaba mal configurado, y los scripts de
 * QA del panel intentaban autenticarse con una cadena vacia en vez de con
 * `admin@epk.local`.
 *
 * Aqui se distingue a proposito entre las dos situacones:
 * - **Con default** (el email del admin): "" cae al default, porque el default
 *   no es un secreto y no queremos que un entorno mal configurado rompa los
 *   scripts de solo lectura.
 * - **Sin default** (las contrasenas): "" se queda "", que es justo lo que hace
 *   que `requireCredentials` falle en vez de autenticarse con nada.
 */
function readEnv(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return fallback;
  const trimmed = raw.trim();
  return trimmed === "" ? fallback : trimmed;
}

/** Igual que `readEnv` pero sin default: devuelve "" si no esta o esta vacia. */
function readEnvStrict(name: string): string {
  return readEnv(name, "");
}

export const ARTIST_EMAIL = readEnvStrict("TEST_ARTIST_EMAIL");
export const ARTIST_PASSWORD = readEnvStrict("TEST_ARTIST_PASSWORD");
export const ADMIN_EMAIL = readEnv("TEST_ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL);
export const ADMIN_PASSWORD = readEnvStrict("TEST_ADMIN_PASSWORD");

/**
 * C6 — el suscriptor de pruebas.
 *
 * El correo **sí** lleva default, y por el mismo motivo que el del admin: es un
 * dominio inventado, no PII de nadie. La contrasena no, como ninguna: sin ella el
 * seed falla visible en vez de crear una cuenta con una clave que esté en el
 * repositorio.
 *
 * `DEFAULT_SUBSCRIBER_EMAIL` es lo que permite que
 * `scripts/create-test-subscriber.ts` se pueda ejecutar en modo dry-run sin
 * configurar nada, que es justo cuando no hay que escribir nada.
 */
export const DEFAULT_SUBSCRIBER_EMAIL = "subscriber@epk.local";
export const SUBSCRIBER_EMAIL = readEnv("TEST_SUBSCRIBER_EMAIL", DEFAULT_SUBSCRIBER_EMAIL);
export const SUBSCRIBER_PASSWORD = readEnvStrict("TEST_SUBSCRIBER_PASSWORD");

/** Variable de entorno que hay que definir para un rol, para el mensaje de error. */
const ENV_NAME: Record<TestRole, { email: string; password: string }> = {
  artist: { email: "TEST_ARTIST_EMAIL", password: "TEST_ARTIST_PASSWORD" },
  admin: { email: "TEST_ADMIN_EMAIL", password: "TEST_ADMIN_PASSWORD" },
  subscriber: { email: "TEST_SUBSCRIBER_EMAIL", password: "TEST_SUBSCRIBER_PASSWORD" },
};

/**
 * Relee `process.env` en tiempo de llamada en vez de usar las constas de arriba.
 *
 * Las constas se snapshotan al evaluar este modulo. Si un consumidor importa
 * este fichero antes de que su propio `dotenv.config()` corra, las constas estan
 * vacias para siempre; releer aqui es lo que hace que `requireCredentials` —la
 * via que usan los seeds— siga siendo correcta en ese caso.
 */
function current(role: TestRole): TestCredential {
  if (role === "artist") {
    return {
      email: readEnvStrict("TEST_ARTIST_EMAIL"),
      password: readEnvStrict("TEST_ARTIST_PASSWORD"),
    };
  }
  if (role === "subscriber") {
    return {
      email: readEnv("TEST_SUBSCRIBER_EMAIL", DEFAULT_SUBSCRIBER_EMAIL),
      password: readEnvStrict("TEST_SUBSCRIBER_PASSWORD"),
    };
  }
  return {
    email: readEnv("TEST_ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL),
    password: readEnvStrict("TEST_ADMIN_PASSWORD"),
  };
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
