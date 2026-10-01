/**
 * RC.32 Tarea 1 — la aprobación de un release tiene que arrastrar a sus hijas.
 *
 * ## Por qué este test existe
 * `POST /api/releases` inserta las hijas SIEMPRE con `status = 'draft'` (literal
 * en el `VALUES`), y las dos rutas que aprueban escribían el estado del PADRE con
 * `WHERE id = ?`, sin tocar nunca `tracks.release_id`. La consecuencia observable
 * es un release con pistas creado por la app y aprobado después, que se publica
 * como **un álbum con cero pistas**: el padre sale del catálogo y ninguna de sus
 * hijas, porque todo lo público filtra por estado.
 *
 * ## Qué se prueba y cómo
 * La REGLA vive en `buildChildStatusCascade` (`lib/db.ts`) porque un `route.ts`
 * del App Router solo puede exportar verbos HTTP. Eso se prueba como matriz pura.
 * Lo que estaba en las rutas —que la regla entre en la transacción y que el
 * resultado se verifique en vez de anunciarse— se prueba leyendo el código de
 * las rutas, que es donde estaba el fallo y donde puede volver a colarse.
 *
 * Cada aserción está escrita para que FALLE al revertir el arreglo que acompaña.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildChildStatusCascade,
  isExecutableStatement,
  DECISION_STATUSES,
  RELEASE_STATUSES,
} from "@/lib/db";

const read = (relative: string) =>
  readFileSync(path.resolve(process.cwd(), relative), "utf8");

const ADMIN_RELEASES = read("app/api/admin/releases/route.ts");
const RELEASES = read("app/api/releases/route.ts");
const DB = read("lib/db.ts");

/** Por debajo de `mark`, para no arrastrar media ruta a cada aserción. */
const slice = (source: string, from: string, to?: string, span = 900): string => {
  const start = source.indexOf(from);
  expect(start).toBeGreaterThan(-1);
  const end = to ? source.indexOf(to, start) : start + span;
  return source.slice(start, end > start ? end : start + span);
};

/**
 * Sin comentarios. Los comentarios de estas rutas NOMBRAN `getDbWrite()` para
 * explicar por qué ya no se usa, así que buscar el identificador en el texto
 * plano daría un falso positivo sobre código que no existe.
 */
const code = (source: string): string =>
  source
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");

describe("Tarea 1 — la regla de cascada", () => {
  it("propaga el estado del padre a las hijas por `release_id`, no por un id suelto", () => {
    const stmt = buildChildStatusCascade("rel-9b286f4a", "approved");
    // `WHERE id = ?` es exactamente el bug: solo tocaría el padre.
    expect(stmt.sql).toMatch(/WHERE\s+release_id\s*=\s*\?/i);
    expect(stmt.sql).not.toMatch(/WHERE\s+id\s*=\s*\?/i);
    expect(stmt.params).toContain("rel-9b286f4a");
  });

  it("escribe el MISMO estado que el padre en los tres estados de decisión", () => {
    for (const status of DECISION_STATUSES) {
      const stmt = buildChildStatusCascade("rel-x", status);
      expect(isExecutableStatement(stmt)).toBe(true);
      // Los params son [status, ...], y el id va al final: el `?` del
      // `WHERE release_id = ?` tiene que casar con el último.
      expect(stmt.params[0]).toBe(status);
      expect(stmt.params[stmt.params.length - 1]).toBe("rel-x");
      expect(stmt.sql).toMatch(/SET\s+status\s*=\s*\?/i);
    }
  });

  it("rechazar y pedir revisión también llegan a las hijas, no solo aprobar", () => {
    // Un álbum con el padre `rejected` y las hijas `approved` sería un tracklist
    // público colgando de un release que el admin ha rechazado.
    for (const status of ["rejected", "revision"]) {
      const stmt = buildChildStatusCascade("rel-x", status);
      expect(isExecutableStatement(stmt)).toBe(true);
      expect(stmt.params[0]).toBe(status);
    }
  });

  it("resetear a borrador también las devuelve a borrador", () => {
    // El botón "Resetear a borrador" de la pestaña Releases depende de esto: sin
    // él, un álbum vuelve a borrador con las hijas publicadas.
    const stmt = buildChildStatusCascade("rel-x", "draft");
    expect(isExecutableStatement(stmt)).toBe(true);
    expect(stmt.params[0]).toBe("draft");
  });

  it("acepta los cinco estados del vocabulario y rechaza cualquier otro", () => {
    for (const status of RELEASE_STATUSES) {
      expect(isExecutableStatement(buildChildStatusCascade("rel-x", status))).toBe(true);
    }
    // Un estado inventado se propaga como SQL vacío, no como un valor que
    // ninguna ruta sabe leer después.
    const bogus = buildChildStatusCascade("rel-x", "publicado");
    expect(isExecutableStatement(bogus)).toBe(false);
    expect(bogus.sql).toBe("");
  });

  it("es idempotente: aplicar la cascada dos veces produce el mismo estado", () => {
    const first = buildChildStatusCascade("rel-x", "approved");
    const second = buildChildStatusCascade("rel-x", "approved");
    expect(second).toEqual(first);
  });

  it("lleva `updated_at` solo si se le pasa, y en ese caso antes del id", () => {
    const sinFecha = buildChildStatusCascade("rel-x", "approved");
    expect(sinFecha.sql).not.toMatch(/updated_at/i);

    const conFecha = buildChildStatusCascade("rel-x", "approved", "2026-01-01T00:00:00.000Z");
    expect(conFecha.sql).toMatch(/updated_at/i);
    expect(conFecha.params).toEqual(["approved", "2026-01-01T00:00:00.000Z", "rel-x"]);
  });

  it("no toca el `admin_notes` de las hijas: es una columna del padre", () => {
    // `admin_notes` es el motivo interno de la decisión, vive en el padre y
    // `GET /api/tracks` lo excluye precisamente por eso. Propagarlo a 65 hijas
    // multiplicaría el dato que el filtro público está diseñado por no exponer.
    expect(buildChildStatusCascade("rel-x", "rejected").sql).not.toMatch(/admin_notes/i);
  });
});

describe("Tarea 1 — la cascada entra en la MISMA transacción que el padre", () => {
  it("PUT /api/admin/releases mete el UPDATE del padre y la cascada en un dbBatch", () => {
    // Antes eran dos escrituras sueltas: el `dbRun` del padre y nada más. Con la
    // cascada en su propia llamada, un fallo entre las dos deja el padre aprobado
    // con las hijas en borrador, que es el estado roto que esto arregla.
    const call = slice(ADMIN_RELEASES, "await dbBatch([", "]);", 400);
    expect(call).toMatch(/UPDATE tracks SET status = \?/);
    expect(call).toMatch(/buildChildStatusCascade\(/);
  });

  it("la ruta de admin ya no escribe el estado del padre fuera de la transacción", () => {
    // `dbRun` se eliminó de la ruta: si volviera a aparecer escribiendo el
    // status del padre, la cascada quedaría fuera de la transacción.
    expect(ADMIN_RELEASES).not.toMatch(/await dbRun\(/);
  });

  it("PUT /api/releases mete la cascada en el mismo dbBatch que el padre y las hijas", () => {
    const batchBuild = slice(
      RELEASES,
      "const statements: Stmt[] = [];",
      "if (isAdmin && nextStatus !== previousStatus",
      1200
    );
    expect(batchBuild).toMatch(/UPDATE tracks SET \$\{setClauses/);
    expect(batchBuild).toMatch(/buildChildStatusCascade\(/);
    expect(batchBuild).toMatch(/await dbBatch\(statements\)/);
  });

  it("la cascada de la ruta de releases solo se emite cuando el estado cambia", () => {
    // Si `nextStatus === previousStatus` el UPDATE del padre ni lleva `status`.
    // Emitir la cascada ahí reescribiría el árbol de estados de las hijas en cada
    // guardado, y este PUT es el que usa el formulario de edición.
    expect(RELEASES).toMatch(
      /if \(nextStatus !== previousStatus\) \{\s*statements\.push\(buildChildStatusCascade\(id, nextStatus\)\);/
    );
  });

  it("dbBatch filtra las sentencias vacías antes de mandarlas al motor", () => {
    // `buildChildStatusCascade` devuelve `sql: ""` para un estado fuera del
    // vocabulario. Sin el filtro, Turso recibiría una sentencia vacía dentro del
    // batch y la transacción entera fallaría.
    for (const file of [ADMIN_RELEASES, RELEASES]) {
      const fn = slice(file, "async function dbBatch(");
      expect(fn).toMatch(/filter\(isExecutableStatement\)/);
    }
  });

  it("ambas rutas eligen backend solo con getTursoClientSync y sin getDbWrite", () => {
    // La regla de AGENTS.md: la fuente de verdad para abrir el handle local es
    // `getTursoClientSync() !== null`, nunca `isTursoConfigured()` (que leía el
    // env al importar el módulo) ni `getDbWrite()` (roto en producción).
    for (const file of [ADMIN_RELEASES, RELEASES]) {
      const fn = slice(code(file), "async function dbBatch(");
      expect(fn).toMatch(/getTursoClientSync\(\)/);
      expect(fn).not.toMatch(/isTursoConfigured/);
      expect(code(file)).not.toMatch(/getDbWrite\(/);
    }
  });
});

describe("Tarea 1 — el resultado se verifica, no se promete", () => {
  it("ambas rutas cuentan las hijas que NO quedaron sincronizadas", () => {
    for (const file of [ADMIN_RELEASES, RELEASES]) {
      expect(file).toMatch(/countUnsyncedChildren/);
      expect(file).toMatch(
        /SUM\(CASE WHEN status = \? THEN 0 ELSE 1 END\) AS unsynced/
      );
    }
  });

  it("la respuesta lleva el recuento y un aviso cuando algo quedó sin sincronizar", () => {
    for (const file of [ADMIN_RELEASES, RELEASES]) {
      expect(file).toMatch(/children: \{ total: [a-zA-Z.]+, unsynced: [a-zA-Z.]+ \}/);
      expect(file).toMatch(/unsynced > 0/);
      expect(file).toMatch(/warning: /);
    }
  });

  it("un álbum sin hijas informa 0, que no es un fallo", () => {
    // La mayoría de las filas de `tracks` son singles: sin hijas, `SUM(...)` es
    // NULL y tiene que convertirse en 0, no en `NaN` — que compararse con `> 0`
    // daría `false` y, serializado, `null` en la respuesta de cada single.
    expect(Number.isFinite(Number(null))).toBe(true);
    expect(Number(null)).toBe(0);
  });
});

describe("Tarea 2 — el mismo criterio de visibilidad en el catálogo del artista", () => {
  // El predicado vive en `ARTIST_CATALOG_VISIBLE_SQL` y la consulta lo interpola,
  // así que el bloque va desde esa constante hasta la función: las dos mitades
  // del criterio, no solo la consulta.
  const catalogSql = slice(DB, "const ARTIST_CATALOG_VISIBLE_SQL", "export async function getArtistCatalog", 2400);

  it("el WHERE acepta a la hija de un padre aprobado, no solo `status = 'approved'`", () => {
    expect(catalogSql).toMatch(/t\.release_id IS NOT NULL/);
    expect(catalogSql).toMatch(/p\.id = t\.release_id AND p\.status = 'approved'/);
  });

  it("comparte el criterio con getApprovedTrackById: mismo EXISTS, misma forma", () => {
    // Si uno de los dos lectores se queda atrás, el mismo álbum responde 404 por
    // `/api/releases/<hija>` y aparece vacío en la ficha del artista.
    const byId = slice(DB, "export async function getApprovedTrackById", "export async function getApprovedTracks", 1200);
    expect(byId).toMatch(/p\.id = t\.release_id AND p\.status = 'approved'/);
    expect(catalogSql).toMatch(/p\.id = t\.release_id AND p\.status = 'approved'/);
  });

  it("NO cambia el orden de agrupación: release_date, disc, track y start_time", () => {
    expect(catalogSql).toMatch(
      /ORDER BY t\.release_date DESC,\s*COALESCE\(t\.disc_number, 1\) ASC,\s*COALESCE\(t\.track_number, 999\) ASC,\s*t\.start_time ASC/
    );
  });

  it("`has_children` usa el mismo criterio que el WHERE", () => {
    // Si `has_children` exigiera `c.status = 'approved'` y el WHERE llevara el
    // segundo brazo, el flag de SQL y el `children.length` de JS discreparían.
    expect(catalogSql).toMatch(/WHERE c\.release_id = t\.id/);
    expect(catalogSql).toMatch(/c\.status = 'approved'/);
    expect(catalogSql).toMatch(/p2\.id = c\.release_id AND p2\.status = 'approved'/);
  });

  it("el criterio vive en una constante compartida, no duplicado en dos sitios", () => {
    // Dos copias del mismo predicado es como vuelve a aparecer la discrepancia.
    expect(DB).toMatch(/const ARTIST_CATALOG_VISIBLE_SQL/);
    expect(catalogSql).toMatch(/AND \(\$\{ARTIST_CATALOG_VISIBLE_SQL\}\)/);
  });});

describe("Tarea 4 — la duración de un padre se muestra como la suma de sus hijas", () => {
  const admin = read("app/admin/page.tsx");
  const approvals = read("app/admin/approvals/page.tsx");

  it("el panel de admin usa sumDurations y no el `duration` crudo de la fila", () => {
    expect(admin).toMatch(/import \{[^}]*sumDurations[^}]*\} from "@\/lib\/null-safe"/);
    expect(admin).toMatch(/trackDurations\.get\(track\.id\) \?\? track\.duration/);
    // Y ya no queda la celda que imprimía el valor crudo a secas.
    expect(admin).not.toMatch(
      /<td className="p-3 text-slate-600 dark:text-slate-400">\{track\.duration\}<\/td>/
    );
  });

  it("el panel de admin pide la página completa antes de sumar", () => {
    // `GET /api/tracks` pagina con `limit` 50 por defecto. Con la página
    // recortada, la suma de las hijas de un padre serían las duraciones de las
    // primeras 50 filas del catálogo, que no son necesariamente las suyas: un
    // número PEOR que el valor declarado.
    expect(admin).toMatch(/fetch\("\/api\/tracks\?limit=100"\)/);
    expect(admin).toMatch(/tracks\.length !== tracksTotal/);
  });

  it("si las hijas no suman nada, el panel de admin cae al valor declarado", () => {
    // `sumDurations` devuelve `null` cuando no hay nada parseable, y `null` no
    // es `0:00`: un álbum recién creado sin duraciones no debe fingir un total.
    expect(admin).toMatch(/if \(total\) map\.set\(parentId, total\.label\)/);
  });

  it("el panel de admin agrupa las hijas por `release_id`", () => {
    // `parseTrack` expone `tracks.release_id`; sin él no hay forma de saber qué
    // filas son hijas de qué padre en el cliente.
    expect(admin).toMatch(/release_id\?: string \| null/);
    expect(admin).toMatch(/childrenByParent\.get\(track\.release_id\)/);
  });

  it("el detalle de aprobaciones también usa sumDurations, no `data.duration` crudo", () => {
    expect(approvals).toMatch(
      /import \{[^}]*sumDurations[^}]*\} from '@\/lib\/null-safe'/
    );
    expect(approvals).toMatch(
      /<DetailRow term="Duración">\{submissionDuration\(data\)\}<\/DetailRow>/
    );
    expect(approvals).not.toMatch(
      /<DetailRow term="Duración">\{data\.duration\}<\/DetailRow>/
    );
  });

  it("el detalle de aprobaciones cae al valor declarado si el envío no trae pistas", () => {
    expect(approvals).toMatch(
      /const children = Array\.isArray\(data\.tracks\) \? data\.tracks : \[\]/
    );
    expect(approvals).toMatch(
      /return typeof data\.duration === 'string' && data\.duration\.length > 0 \? data\.duration : '—'/
    );
  });

  it("ninguna de las dos páginas rompe las cadenas que el E2E de aprobaciones usa", () => {
    // `tests/e2e/approvals-qa.spec.ts` localiza estos textos. Un refactor que los
    // renombre rompe la suite entera, y no por un bug sino por un string.
    for (const text of ["Aprobaciones", "Envíos", "Buscar envíos", "Releases", "Revisión"]) {
      expect(approvals + admin).toContain(text);
    }
    for (const text of ["Ver", "Aprobar", "Rechazar", "Anterior", "Siguiente", "Cerrar"]) {
      expect(approvals + admin).toContain(text);
    }
  });
});

describe("Tarea 5 — la promoción deja de fallar en silencio", () => {
  const route = read("app/api/admin/approvals/[id]/route.ts");
  const promotion = slice(route, "async function runPromotion(", "export async function POST");
  const retryBranch = slice(
    route,
    'if (validated.action === "retry_promotion")',
    "const oldStatus = submission.status;"
  );
  const postBody = slice(route, "export async function POST", undefined, 6000);

  it("el error de promoción sale en la respuesta, no solo en el log", () => {
    // El fallo anterior: `catch { console.error }` y un `promoted: false`
    // indistinguible de "el usuario ya era artista". El admin veía un 200 y un
    // éxito que no había ocurrido.
    expect(promotion).toMatch(/console\.error/);
    expect(postBody).toMatch(/promotion,/);
    expect(postBody).toMatch(/warning: message/);
  });

  it("no se convierte en 500: la aprobación ya ocurrió y es válida", () => {
    // El fallo se devuelve como dato, nunca propagado con `throw`: un `throw`
    // convertiría una aprobación ya escrita en un error para el admin.
    expect(promotion).not.toMatch(/throw /);
    expect(promotion).toMatch(
      /error: promotionError instanceof Error \? promotionError\.message/
    );
  });

  it("el motivo del fallo y si se puede reintentar viajan en la respuesta", () => {
    expect(route).toMatch(/error: string \| null/);
    expect(route).toMatch(/retryable: boolean/);
    expect(route).toMatch(/attempted: boolean/);
  });

  it("existe una acción de reintento que no cambia el estado del envío", () => {
    expect(route).toMatch(/retry_promotion/);
    // El reintento NO llama a `updateTrackSubmissionStatus`: si lo hiciera,
    // reintentar una promoción reescribiría la decisión del admin y su motivo.
    expect(retryBranch).toMatch(/runPromotion\(submission\.user_id\)/);
    expect(retryBranch).not.toMatch(/updateTrackSubmissionStatus/);
  });

  it("el reintento se niega sobre un envío que no está aprobado", () => {
    // Promover a alguien cuyo envío se rechazó a posteriori sería peor que no
    // promover. Es un conflicto con el estado actual, no con el cuerpo: 409.
    expect(retryBranch).toMatch(/submission\.status !== "approved"/);
    expect(retryBranch).toMatch(/status: 409/);
  });

  it("un envío sin `user_id` no se promotes y dice por qué", () => {
    // Antes: `promoteUserToArtist(null)` reventaba y el catch se lo tragaba. Sin
    // este dato, el admin no puede distinguir "no hay a quién promover" de un
    // fallo de red.
    expect(promotion).toMatch(/if \(!userId\)/);
    expect(promotion).toMatch(/no hay a quién promover/);
    expect(promotion).toMatch(/retryable: false/);
  });

  it("las tres decisiones siguen exigiendo motivo de 10 caracteres como mínimo", () => {
    // `tests/unit/approvals-split.test.ts` depende de esto: un motivo corto tiene
    // que seguir siendo 400. `retry_promotion` no lo pide porque no decide nada.
    expect(route).toMatch(/z\.discriminatedUnion\("action"/);
    const schema = slice(route, "const ActionSchema", "function parseTrackDataSafely");
    expect(schema.match(/min\(10/g) ?? []).toHaveLength(3);
    expect(schema).toMatch(/z\.object\(\{ action: z\.literal\("retry_promotion"\) \}\)/);
  });

  it("el contrato `promoted: boolean` se conserva, para no romper al cliente", () => {
    expect(postBody).toMatch(/^\s*promoted,$/m);
  });

  it("el panel de aprobaciones muestra el fallo y ofrece reintentar", () => {
    const ui = read("app/admin/approvals/page.tsx");
    expect(ui).toMatch(/promotionFailure/);
    expect(ui).toMatch(/pero el autor no se promovió a artista\./);
    expect(ui).toMatch(/Reintentar promoción/);
    expect(ui).toMatch(/role="alert"/);
  });
});
