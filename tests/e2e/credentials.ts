/**
 * Credenciales de test para los specs de Playwright.
 *
 * Reexporta `scripts/lib/credentials.ts`, que es la fuente unica de verdad. Este
 * fichero existe para que los specs tengan un import corto y con nombre de
 * dominio (`./credentials`), no una segunda copia de la logica: si alguien
 * edita aqui, el cambio se pierde en el siguiente build.
 */
export {
  ARTIST_EMAIL,
  ARTIST_PASSWORD,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  DEFAULT_ADMIN_EMAIL,
  missingCredentialEnvVars,
  requireCredentials,
} from "../../scripts/lib/credentials";

export type { TestCredential, TestRole } from "../../scripts/lib/credentials";
