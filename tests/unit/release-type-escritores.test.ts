/**
 * P12, filas 5 y 6 — que `release_type` no se pueda volver a ensuciar.
 *
 * ## Por qué este bloque existe
 *
 * `a35fa6f` normalizó 75 filas de Turso a minúsculas y el trabajo **era
 * reversible**: el formulario de edición del artista llamaba a
 * `capitalizeReleaseType()` —un helper **de presentación**— antes de escribir,
 * así que cada guardado volvía a meter mayúsculas. Y esa función devolvía
 * `"Álbum"` **con tilde**, que no está en el vocabulario canónico y que ningún
 * check detectaba: `tracks_release_type_con_mayusculas` compara contra `lower()`,
 * y el `lower()` de SQLite es ASCII, así que una tilde lo atraviesa.
 *
 * El resultado silencioso: `WHERE release_type = 'album'` dejaba de encontrar la
 * fila, y el catálogo se deshacía sin que ninguna puerta dijera nada.
 *
 * ## Qué protege
 *
 * No el script (eso lo cubre `release-type-normalization.test.ts`), sino **los
 * escritores**: que ninguno vuelva a emitir un valor fuera de
 * `RELEASE_TYPE_VALUES`, y que la capitalización se aplique al mostrar y no al
 * guardar.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { capitalizeReleaseType } from "@/lib/null-safe";
import { RELEASE_TYPE_VALUES, DEFAULT_RELEASE_TYPE } from "@/lib/release-type";

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** Todo el código de app/, lib/ y components/, para no missar un escritor nuevo. */
function codigoDe(producto: string): Array<{ fichero: string; src: string }> {
  const salida: Array<{ fichero: string; src: string }> = [];
  const recorrer = (dir: string) => {
    for (const entrada of readdirSync(dir)) {
      const completa = path.join(dir, entrada);
      if (statSync(completa).isDirectory()) recorrer(completa);
      else if (/\.tsx?$/.test(entrada)) {
        salida.push({
          fichero: path.relative(process.cwd(), completa).replace(/\\/g, "/"),
          src: readFileSync(completa, "utf8"),
        });
      }
    }
  };
  recorrer(path.resolve(process.cwd(), producto));
  return salida;
}

const CODIGO = [...codigoDe("app"), ...codigoDe("lib"), ...codigoDe("components")];

describe("el valor canónico y el de pantalla son dos cosas", () => {
  it("el vocabulario es minúscula", () => {
    expect([...RELEASE_TYPE_VALUES]).toEqual(["album", "ep", "single"]);
    expect(DEFAULT_RELEASE_TYPE).toBe("single");
  });

  it("capitalizar es de presentación, y no inventa otra cadena", () => {
    // El fallo concreto: `"Álbum"` con tilde. No era una variante de `album`,
    // era OTRO valor, y como `edit/page.tsx` escribía con este helper, cada
    // guardado del artista metía una cadena que `WHERE release_type = 'album'`
    // no iba a encontrar nunca.
    expect(capitalizeReleaseType("album")).toBe("Album");
    expect(capitalizeReleaseType("ep")).toBe("EP");
    expect(capitalizeReleaseType("single")).toBe("Single");
    expect(capitalizeReleaseType("album")).not.toMatch(/[^\x00-\x7F]/);
  });

  it("ningún escritor emite un literal fuera del vocabulario", () => {
    // Un `release_type: "Single"` en cualquier parte de app/, lib/ o components/
    // vuelve a ensuciar la columna. Se busca el literal con su capitalización
    // exacta, porque el valor canónico es minúscula y una mayúscula aquí es
    // siempre un error.
    const literalesMayusculas = /\brelease_type\s*[:=]\s*"(Single|Album|EP)"/;
    const ofensores = CODIGO.filter((f) => literalesMayusculas.test(sinComentarios(f.src))).map(
      (f) => f.fichero
    );
    expect(ofensores).toEqual([]);
  });

  it("el valor por defecto de createTrack es el canónico", () => {
    // `lib/db.ts` usaba `"Single"` en mayúscula, y `createTrack` es lo que
    // corren los scripts de seed. Era la vía por la que la mezcla volvía sin
    // que nadie escribiera nada.
    expect(read("lib/db.ts")).toMatch(/release_type:\s*data\.release_type\s*\|\|\s*DEFAULT_RELEASE_TYPE/);
  });

  it("lib/release-type.ts tiene un consumidor de verdad, no decorativo", () => {
    // Un módulo que se declara fuente de verdad y no se consulta hace que la
    // invariante parezca cubierta cuando no lo está. Fue exactamente el caso:
    // `a35fa6f` creó el módulo y `lib/db.ts` no lo importaba.
    expect(read("lib/db.ts")).toMatch(/from "@\/lib\/release-type"/);
  });

  it("el formulario de edición guarda lo que el selector dice, sin transformar", () => {
    const EDIT = read("app/releases/[id]/edit/page.tsx");
    // El selector manda `single | ep | album`, ya en minúscula: guardarlo tal
    // cual es lo correcto. Si vuelve a pasar por `capitalizeReleaseType`, cada
    // guardado deshace la normalización.
    expect(EDIT).toMatch(/release_type:\s*form\.type/);
    expect(sinComentarios(EDIT)).not.toMatch(/release_type:[^,\n]*capitalizeReleaseType/);
  });

  it("el estado inicial del formulario del admin está en minúscula", () => {
    const ADMIN = read("app/admin/page.tsx");
    expect(ADMIN).toMatch(/release_type:\s*"single"/);
    expect(sinComentarios(ADMIN)).not.toMatch(/release_type:\s*"Single"/);
  });

  it("los ficheros que nombran release_type siguen siendo los de la lista", () => {
    // Si aparece un escritor nuevo en otra parte, esta lista hay que ampliarla.
    // No es una puerta que detecte el error: es una que obliga a mirar la lista
    // cuando la búsqueda de arriba encuentre algo.
    //
    // La lista se construyó revisando los seis que aparecieron la primera vez:
    // cuatro son **proyecciones de lectura** (copian lo que hay en la columna, así
    // que propagan lo que haya —incluido un `Single` si alguien lo metiera—) y
    // dos son **esquemas Zod** que aceptan cualquier cadena. Ninguno escribe.
    const conocidos = [
      // escritores de verdad
      "app/admin/page.tsx",
      "app/submissions/page.tsx",
      "app/releases/[id]/edit/page.tsx",
      "lib/db.ts",
      // proyecciones de lectura
      "app/api/artist-catalog/route.ts",
      "app/api/sync/route.ts",
      "lib/downloadable-assets.ts",
      // esquemas de validación
      "app/api/submissions/route.ts",
      "lib/validations.ts",
      "app/api/tracks/route.ts",
      // el módulo canónico y su consumidor
      "lib/release-type.ts",
    ];
    const nombran = CODIGO.filter((f) => /release_type\s*:/.test(sinComentarios(f.src))).map(
      (f) => f.fichero
    );
    const nuevos = nombran.filter((f) => !conocidos.includes(f));
    expect(nuevos, `ficheros con release_type sin revisar: ${nuevos.join(", ")}`).toEqual([]);
  });

  it("los esquemas de validación aceptan cualquier cadena, todavía", () => {
    // **Documenta una deuda, no un logro.** `status` se valida contra cinco
    // valores (`app/api/admin/releases/route.ts:179`) y `release_type` contra
    // ninguno, ni en el PUT del admin ni en el portal de envíos: `z.string()`
    // deja pasar `"Single"` igual que `"cualquier cosa"`. Quien lo escriba desde
    // la UI no lo va a hacer —el selector manda minúsculas—, pero una llamada
    // directa sí.
    //
    // Está como aserción negativa explícita para que la deuda se vea en el sitio
    // donde se decide el código. Cuando se añada el vocabulario, este test tiene
    // que cambiar a propósito.
    expect(read("lib/validations.ts")).toMatch(/release_type:\s*z\.string\(\)/);
    expect(read("app/api/submissions/route.ts")).toMatch(
      /release_type:\s*z\.string\(\)\.min\(1,[^)]*\)/
    );
  });
});
