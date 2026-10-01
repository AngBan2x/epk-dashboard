import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import { resolveSubmitStatus } from "@/lib/db";
import { PRODUCTION_FIELDS } from "@/lib/production-fields";

/**
 * RC.32 — Agente A, Ola 1. Contrato del FORMULARIO de edición.
 *
 * `tests/unit/release-ownership.test.ts` cubre el servidor. Este cubre el otro
 * lado de la cadena del 403, que es donde estaba la CAUSA: el formulario
 * reenviaba el estado vigente dentro del payload.
 *
 * ## Por qué hay tests de fuente y no solo de comportamiento
 * El formulario es un componente de cliente y este repo corre Vitest con
 * `environment: "node"` (sin jsdom). Montarlo exigiría un entorno de render que
 * la suite no tiene. La alternativa —reimplementar el payload en el test y
 * probar eso— no probaría NADA del código real: un check que siempre pasa no
 * protege de nada.
 *
 * Así que se leen las dos fuentes y se afirma sobre ellas lo que de verdad
 * importa: que el `status` de origen no exista en el estado del formulario ni en
 * el cuerpo del PUT, que `artist_name` sea de solo lectura, que quede UN input de
 * género, y que el texto del botón corresponda a lo que hace.
 *
 * Y para el texto del botón, en vez de leerlo con `toContain` (que solo
 * comprueba que la cadena existe en algún sitio), se EXTRAE la función del
 * fichero y se ejecuta: la tabla de estados se comprueba de verdad. Revertir el
 * arreglo la hace caer igual que un test de comportamiento.
 */

const EDIT_PAGE = readFileSync(
  resolve(process.cwd(), "app/releases/[id]/edit/page.tsx"),
  "utf8"
);
const NEW_PAGE = readFileSync(resolve(process.cwd(), "app/releases/new/page.tsx"), "utf8");
const ROUTE = readFileSync(resolve(process.cwd(), "app/api/releases/route.ts"), "utf8");
const PRODUCTION_FIELDS_SRC = readFileSync(resolve(process.cwd(), "lib/production-fields.ts"), "utf8");

/**
 * Extrae `function <name>(...)` del fuente, la compila y devuelve una función
 * real. Se usa con las helpers puras de la página (`primarySaveLabel`,
 * `canRequestReview`), que son la tabla de textos de los botones.
 */
function loadPageHelper<T>(source: string, name: string): T {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`No se encuentra ${name}() en la página de edición`);

  // Llama a la llave que cierra su cuerpo: primera llave a nivel 0.
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let i = bodyStart;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const snippet = source.slice(start, i + 1);

  const js = ts.transpileModule(snippet, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`"use strict"; ${js}; return ${name};`)() as T;
}

const primarySaveLabel = loadPageHelper<(status: string) => string>(EDIT_PAGE, "primarySaveLabel");
const canRequestReview = loadPageHelper<(status: string) => boolean>(EDIT_PAGE, "canRequestReview");

describe("RC.32 Tarea 1 — el payload del form NO lleva el status de origen", () => {
  it("el estado del formulario no tiene campo `status` (era la causa del 403)", () => {
    // El `useState` inicial del formulario: sin `status`.
    const formState = EDIT_PAGE.slice(
      EDIT_PAGE.indexOf("const [form, setForm] = useState({"),
      EDIT_PAGE.indexOf("const [tracks, setTracks]")
    );
    expect(formState).not.toMatch(/\bstatus\b/);
    expect(formState).toContain("title:");
    expect(formState).toContain("description:");
  });

  it("`status` vive en su propio state de solo lectura, no en el que se envía", () => {
    expect(EDIT_PAGE).toContain("const [currentStatus, setCurrentStatus] = useState<ReleaseStatus>");
    // Y no se usa para construir el cuerpo del PUT.
    expect(EDIT_PAGE).not.toMatch(/form\.status/);
  });

  it("el cuerpo del PUT no se construye con `...form`", () => {
    // El spread era el vector: `form` llevaba `status` dentro, así que la clave
    // viajaba dos veces en el JSON (una por el spread, otra explícita).
    const buildPayload = EDIT_PAGE.slice(
      EDIT_PAGE.indexOf("const buildPayload"),
      EDIT_PAGE.indexOf("const handleSubmit")
    );
    expect(buildPayload).toContain("id: releaseId");
    expect(buildPayload).not.toContain("...form");
    expect(buildPayload).not.toContain("artist_id");
    // Y el fetch sí serializa esa función, no un objeto literal suelto.
    expect(EDIT_PAGE).toContain("JSON.stringify(buildPayload(submitState))");
  });

  it("el `status` que sale es una INTENCIÓN (`pending`/`draft`), nunca el vigente", () => {
    const buildPayload = EDIT_PAGE.slice(
      EDIT_PAGE.indexOf("const buildPayload"),
      EDIT_PAGE.indexOf("const handleSubmit")
    );
    expect(buildPayload).toContain(
      'submitState === "request" || currentStatus === "rejected" ? "pending" : "draft"'
    );
  });
});

describe("RC.32 Tarea 1B — la puerta trasera: un status inyectado se ignora", () => {
  // Esta es la matriz completa. Con ella se ve por qué "ignorar" y "rechazar"
  // son policies distintas: la misma columna que el form mandaba por descuido
  // ahora no puede cambiar nada.
  it("un no-admin NO puede salir de `approved` con un `draft` reenviado", () => {
    expect(resolveSubmitStatus({ role: "artist", requested: "draft", previous: "approved" })).toEqual({
      nextStatus: "approved",
      ignored: true,
    });
  });

  it("un no-admin NO puede decidir ningún estado de decisión", () => {
    for (const asked of ["approved", "rejected", "revision"]) {
      expect(resolveSubmitStatus({ role: "artist", requested: asked, previous: "draft" })).toEqual({
        nextStatus: "draft",
        ignored: true,
      });
    }
  });

  it("`pending` es la única transición que el autor puede pedir, y en cualquier estado", () => {
    for (const previous of ["draft", "rejected", "pending", "approved"]) {
      expect(resolveSubmitStatus({ role: "artist", requested: "pending", previous })).toEqual({
        nextStatus: "pending",
        ignored: false,
      });
    }
  });

  it("sin `status` en el body no cambia nada (un guardado normal)", () => {
    for (const previous of ["draft", "pending", "approved", "rejected"]) {
      expect(resolveSubmitStatus({ role: "artist", previous })).toEqual({
        nextStatus: previous,
        ignored: false,
      });
    }
  });

  it("un estado inexistente sigue siendo 400: el gate no se aflojó, el ruido se ignoró", () => {
    expect(resolveSubmitStatus({ role: "artist", requested: "publicado", previous: "draft" })).toBeNull();
    expect(resolveSubmitStatus({ role: "admin", requested: "publicado", previous: "draft" })).toBeNull();
  });

  it("el admin conserva el poder de decidir, en ambos sentidos", () => {
    expect(resolveSubmitStatus({ role: "admin", requested: "approved", previous: "pending" })).toEqual({
      nextStatus: "approved",
      ignored: false,
    });
    expect(resolveSubmitStatus({ role: "admin", requested: "rejected", previous: "approved" })).toEqual({
      nextStatus: "rejected",
      ignored: false,
    });
    // Y omitirlo tampoco cambia nada.
    expect(resolveSubmitStatus({ role: "admin", previous: "approved" })).toEqual({
      nextStatus: "approved",
      ignored: false,
    });
  });
});

describe("RC.32 Tarea 3 — artist_name es de solo lectura en el form", () => {
  it("el input de nombre de artista lleva `readOnly` y no `onChange`", () => {
    const block = EDIT_PAGE.slice(
      EDIT_PAGE.indexOf('id="artist-name"') - 400,
      EDIT_PAGE.indexOf('id="artist-name"') + 400
    );
    expect(block).toContain("readOnly");
    expect(block).not.toMatch(/onChange=\{\(e\) => setForm\(\{ \.\.\.form, artist_name/);
  });

  it("explica por qué no se puede cambiar", () => {
    expect(EDIT_PAGE).toContain("no se puede cambiar desde aquí");
  });
});

describe("RC.32 Tarea 4 — las hijas viajan solo si hay algo que enviar", () => {
  it("`tracks` es condicional en el payload", () => {
    const buildPayload = EDIT_PAGE.slice(
      EDIT_PAGE.indexOf("const buildPayload"),
      EDIT_PAGE.indexOf("const handleSubmit")
    );
    expect(buildPayload).toContain("const children = tracks.filter((t) => t.title.trim().length > 0);");
    expect(buildPayload).toContain("...(children.length > 0 ? { tracks: children } : {})");
  });

  it("el backend persiste las hijas en vez de ignorarlas", () => {
    expect(ROUTE).not.toMatch(/^ {6}"tracks",$/m);
    expect(ROUTE).toContain("planChildren");
    expect(ROUTE).toContain("UPDATE tracks SET title = ?, duration = ?, isrc = ?");
    expect(ROUTE).toContain("DELETE FROM tracks WHERE id = ? AND release_id = ?");
  });

  it("el GET del propietario adjunta las hijas (si no, el tracklist se guardaría en blanco)", () => {
    expect(ROUTE).toContain("SELECT * FROM tracks WHERE release_id = ?");
    expect(ROUTE).toContain("return NextResponse.json({ ...row, tracks: children });");
    // Y el form las lee de verdad.
    expect(EDIT_PAGE).toContain("if (Array.isArray(data.tracks) && data.tracks.length > 0)");
  });
});

describe("RC.32 Tarea 5 — el género muerto desaparece del form", () => {
  it("el formulario de edición no tiene ningún input literal llamado «Género»", () => {
    // El que queda lo genera el bucle de PRODUCTION_FIELDS, que es la fuente
    // viva (`production_details.genre`). Antes había dos.
    expect(EDIT_PAGE).not.toMatch(/label[^>]*>\s*Género/);
    expect(EDIT_PAGE).not.toMatch(/form\.genre/);
  });

  it("el de creación tampoco: su género va a `production_details`", () => {
    expect(NEW_PAGE).not.toMatch(/form\.genre/);
    expect(NEW_PAGE).toContain("production_details: JSON.stringify(productionDetails)");
    expect(NEW_PAGE).toContain("setProductionDetails({ ...productionDetails, genre: e.target.value })");
  });

  it("la API ya no acepta ni escribe `tracks.genre`", () => {
    // Allowlist del PUT y schema+INSERT del POST.
    expect(ROUTE).not.toMatch(/^ {6}"genre",$/m);
    expect(ROUTE).not.toMatch(/cover_image, genre, description/);
    // Y la columna sigue existiendo: no se dropea (fuera de alcance).
    expect(ROUTE).not.toMatch(/ALTER TABLE tracks DROP COLUMN genre/);
  });

  it("`production_details.genre` es la fuente viva y está documentada como tal", () => {
    expect(PRODUCTION_FIELDS.some((f) => f.key === "genre")).toBe(true);
    expect(PRODUCTION_FIELDS.some((f) => f.key === "sub_genre")).toBe(true);
    expect(PRODUCTION_FIELDS_SRC).toContain("ÚNICA fuente de");
    expect(PRODUCTION_FIELDS_SRC).toContain("tracks.genre");
  });
});

describe("RC.32 Tarea 6 — el texto del botón dice lo que hace", () => {
  // La tabla que adoptó el usuario. Se EJECUTA la función de la página, no se
  // busca su texto: revertir el arreglo la hace fallar.
  it("pending → «Guardar actualización»", () => {
    expect(primarySaveLabel("pending")).toBe("Guardar actualización");
  });

  it("approved → «Actualizar publicación»", () => {
    expect(primarySaveLabel("approved")).toBe("Actualizar publicación");
  });

  it("rejected → «Guardar y solicitar revisión»", () => {
    expect(primarySaveLabel("rejected")).toBe("Guardar y solicitar revisión");
  });

  it("draft u otro → «Guardar cambios»", () => {
    expect(primarySaveLabel("draft")).toBe("Guardar cambios");
    expect(primarySaveLabel("revision")).toBe("Guardar cambios");
    expect(primarySaveLabel("")).toBe("Guardar cambios");
  });

  it("el texto viejo, que prometía guardar un borrador, ya no está", () => {
    expect(EDIT_PAGE).not.toContain("Guardar como Borrador");
  });

  it("«Guardar y solicitar revisión» NO aparece como botón de CREAR (ahí sí guarda un borrador)", () => {
    // El rótulo es correcto en el formulario de creación porque ahí el POST sí
    // escribe `status: "draft"`. Reutilizarlo en el de edición era la
    // contradicción.
    expect(NEW_PAGE).toContain('"Guardar como borrador"');
    expect(NEW_PAGE).toContain('status: submitForReview ? "pending" : "draft"');
  });

  it("el botón secundario aparece donde aporta y se oculta donde el principal ya la hace", () => {
    // En `rejected` la acción principal ES pedir revisión, así que un segundo
    // botón igual sería ruido.
    expect(canRequestReview("draft")).toBe(true);
    expect(canRequestReview("approved")).toBe(true);
    expect(canRequestReview("rejected")).toBe(false);
    expect(canRequestReview("pending")).toBe(false);
  });

  it("volver a la cola desde `approved` pide confirmación (saca el release del catálogo)", () => {
    expect(EDIT_PAGE).toContain('submitState === "request" && currentStatus === "approved"');
    expect(EDIT_PAGE).toContain("dejará de aparecer en el catálogo");
  });

  it("la ayuda de estado ya no contradice al botón", () => {
    expect(EDIT_PAGE).not.toContain("Guarda cambios sin enviar.");
    expect(EDIT_PAGE).toContain("Guarda los cambios. Cuando estés listo, usa 'Enviar para revisión'.");
  });
});

describe("RC.32 Tarea 7 — el extractor de YouTube sombreado", () => {
  it("no hay una copia local que tape al import de `@/lib/youtube`", () => {
    expect(EDIT_PAGE).not.toContain("const extractYouTubeId");
    expect(EDIT_PAGE).not.toContain("function extractYouTubeId");
    // El import sigue, y es el que se usa.
    expect(EDIT_PAGE).toMatch(
      /import \{ extractYouTubeId, getYouTubeThumbnail, fetchYouTubeVideo \} from "@\/lib\/youtube";/
    );
  });

  it("las tres llamadas que lo usaban siguen ahí", () => {
    const uses = EDIT_PAGE.match(/extractYouTubeId\(/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });
});
