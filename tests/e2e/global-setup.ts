/**
 * Lo que se dice **antes** de empezar, no después de fallar.
 *
 * ## Por qué
 *
 * Los specs de E2E hacen login contra `/api/auth/login`. Si la contraseña no
 * está en el entorno, el servidor responde **400**, y el error que ve quien
 * lee el log es "login -> 400" — que no dice nada del problema real. Y como el
 * login tiene un rate limit de 5/min **por IP**, los reintentos se bloquean a
 * sí mismos y el error pasa a ser "login falló con 429", que es aún menos
 * claro.
 *
 * En la CI eso fueron 45 tests fallando durante 53 minutos, con dos errores
 * que no mencionaban la causa. El paso previo del workflow lo resuelve allí
 * (falla en el segundo 2 y nombra el secreto que falta), pero **esto** lo
 * resuelve en local, y de paso enseña qué credenciales están puestas sin
 * imprimir ningún valor.
 *
 * ## Lo que NO hace
 *
 * **No falla.** A propósito: hay specs que no necesitan credenciales
 * (los de navegación, los de catálogo, los de null-safety), y abortar toda la
 * suite porque falta la del artista los impediría correr. Falta lo que falta;
 * quien necesite una credencial lo va a notar en su propio spec, y este aviso
 * le dice por qué.
 */
import { missingCredentialEnvVars } from "./credentials";

export default function globalSetup(): void {
  const faltan = new Set<string>();

  for (const rol of ["admin", "artist", "subscriber"] as const) {
    for (const variable of missingCredentialEnvVars(rol)) {
      faltan.add(variable);
    }
  }

  if (faltan.size === 0) {
    console.log("[E2E] Credenciales de test: todas presentes.");
    return;
  }

  console.warn(
    [
      "",
      "[E2E] ⚠️  Faltan credenciales de test: " + [...faltan].join(", "),
      "[E2E]     Los specs que las necesiten fallarán al hacer login.",
      "[E2E]     Definelas en .env.local (plantilla en .env.example) o en el secret store de CI.",
      "[E2E]     Sin valores impresos: a propósito.",
      "",
    ].join("\n")
  );
}
