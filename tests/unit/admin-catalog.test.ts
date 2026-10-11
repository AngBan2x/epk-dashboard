/**
 * P12 fila 2 — el catálogo del admin y sus dos campos editables.
 *
 * ## Por qué este fichero se reescribió entero
 *
 * La versión anterior de estos cuatro tests era esto:
 *
 * ```ts
 * const handlerIncludesReleaseType = "release_type"; // verificado en edicion manual
 * expect(handlerIncludesReleaseType).toBeTruthy();
 * ```
 *
 * Afirmaba que un literal de cadena es *truthy*, y el cuarto era
 * `expect(true).toBe(true)` con el comentario *"Confirmación explícita: la regla
 * actual protege los datos"*. Ninguno leía un fichero. Revertir el commit
 * entero que los.justificó —`268b573`, la ronda P11— los dejaba verdes.
 *
 * La auditoría de P12 encontró que la puerta que sí existe
 * (`security-sweep.test.ts`) importa `releasesPUT` de `@/app/api/releases/route`
 * y **nunca** de `@/app/api/admin/releases`: la ruta que el commit modificó no
 * tenía cobertura unitaria. Estos tests la cubren ahora, leyendo el código real
 * —que es donde estaba el fallo y donde puede volver a colarse— con el mismo
 * criterio que `release-approval-cascade.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

const ADMIN_PAGE = read("app/admin/page.tsx");
const ADMIN_ROUTE = read("app/api/admin/releases/route.ts");
const UPLOAD_ROUTE = read("app/api/upload/image/route.ts");

describe("(a) la pestaña Catálogo existe y se llega a ella", () => {
  it("está en el tipo de pestaña", () => {
    expect(ADMIN_PAGE).toMatch(/type AdminTab\s*=\s*[^;]*"catalog"/);
  });

  it("tiene su entrada en el diccionario de acentos", () => {
    // Sin esta entrada, `TAB_ACCENT[activeTab]` es `undefined` en runtime y la
    // pestaña revienta el render al pulsarla. El tipo no lo detecta: es un
    // `Record<AdminTab, …>` y TypeScript sí lo detecta, pero solo si alguien
    // añade la clave; borrarla deja el tipo happy.
    expect(ADMIN_PAGE).toMatch(/TAB_ACCENT[\s\S]{0,1200}?catalog:\s*\{/);
  });

  it("tiene botón que la activa", () => {
    expect(ADMIN_PAGE).toMatch(/onClick=\{\(\)\s*=>\s*setActiveTab\("catalog"\)\}/);
    expect(ADMIN_PAGE).toMatch(/adminTabClass\(activeTab,\s*"catalog"\)/);
  });

  it("tiene su bloque de render", () => {
    expect(ADMIN_PAGE).toMatch(/\{activeTab === "catalog" && \(/);
  });
});

describe("(b) release_type se puede editar desde el admin", () => {
  it("se lee del body", () => {
    // Si el PUT deja de leerlo, el campo se ignora en silencio: la UI manda el
    // valor, la respuesta es 200 y el artista cree que se guardó.
    expect(ADMIN_ROUTE).toMatch(
      /const\s*\{[^}]*\brelease_type\b[^}]*\}\s*=\s*body/
    );
  });

  it("se añade a la sentencia con parámetro, no interpolado", () => {
    // La construcción del SET es dinámica porque el *nombre* de la columna se
    // decide en el código (268b573). El *valor* tiene que ir con `?`: si alguien
    // lo interpola, esto deja de ser una comodidad y pasa a ser una inyección.
    expect(ADMIN_ROUTE).toMatch(
      /if \(release_type !== undefined\)\s*\{\s*updates\.push\("release_type = \?"\);\s*paramsBatch\.push\(release_type\);/
    );
  });

  it("no se filtra contra un vocabulario, todavía", () => {
    // **Este test documenta una deuda, no un logro.** `status` sí se valida
    // contra cinco valores (route.ts:179) y `release_type` no: un admin puede
    // escribir cualquier cadena, y `capitalizeReleaseType` la capitaliza sin
    // quejarse. Es la fila 5 de PHASE_P12.md. Cuando se arregle, este test
    // tiene que cambiar — y por eso está escrito como una aserción negativa
    // explícita y no como "aún no está": que se vea la deuda en el sitio donde
    // se decide el código.
    const validaStatus = ADMIN_ROUTE.match(
      /if \(!status \|\| !\[[^\]]+\]\.includes\(status\)\)/
    );
    expect(validaStatus, "status sigue validándose contra su vocabulario").not.toBeNull();
    expect(ADMIN_ROUTE).not.toMatch(/RELEASE_TYPE_VALUES|\["single",\s*"ep",\s*"album"\]/);
  });
});

describe("(c) external_links se puede editar desde el admin", () => {
  it("se lee del body y se añade a la sentencia", () => {
    expect(ADMIN_ROUTE).toMatch(
      /if \(external_links !== undefined\)\s*\{[\s\S]{0,200}?updates\.push\("external_links = \?"\)/
    );
  });

  it("serializa objeto y acepta string", () => {
    // El admin manda un objeto desde el formulario y una fila ya guardada
    // devuelve un string. Sin esta bifurcación, editar una release con links
    // guardados los.double-codifica en JSON.
    expect(ADMIN_ROUTE).toMatch(
      /typeof external_links === "string"\s*\?\s*external_links\s*:\s*JSON\.stringify/
    );
  });
});

describe("(d) un artista sin user_id no puede subir imagen sin ser admin", () => {
  // Los 5 artistas del catálogo sin dueño (Björk, Bowie, Kraftwerk, Pink Floyd,
  // Radiohead) caen en este caso: `artists.user_id` es NULL, así que
  // `artistRow[0].user_id === session.userId` es falso para cualquiera que no sea
  // admin, y la única vía es el rol.

  it("la guarda compara el dueño con el usuario de la sesión", () => {
    expect(UPLOAD_ROUTE).toMatch(
      /const ownsTrack = artistRow\.length > 0 && artistRow\[0\]\.user_id === session\.userId/
    );
  });

  it("y devuelve 403 cuando no se cumple ninguna de las dos condiciones", () => {
    expect(UPLOAD_ROUTE).toMatch(
      /if \(!ownsTrack && session\.role !== "admin"\)\s*\{\s*return NextResponse\.json\([^)]*status:\s*403/
    );
  });

  it("la segunda rama, por id de artista, tiene la misma forma", () => {
    // Hay dos caminos de subida (por nombre en la fila del track, y por
    // `artistId` explícito). Blindar solo uno deja el otro abierto.
    expect(UPLOAD_ROUTE).toMatch(
      /if \(artistRow\[0\]\.user_id !== session\.userId && session\.role !== "admin"\)\s*\{\s*return NextResponse\.json\([^)]*status:\s*403/
    );
  });
});
