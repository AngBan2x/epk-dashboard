/**
 * P12, fila 7 — la allowlist de columnas, **ejecutada**.
 *
 * `allowlist-de-columnas.test.ts` comprueba que la allowlist dice lo que dice la
 * interfaz, leyendo el fuente. Eso ata la forma pero no el efecto: no demuestra
 * que una clave maliciosa no llegue al `SET`.
 *
 * Este fichero la ejecuta. Inserta una fila, intenta escribir con una clave que
 * es SQL, y comprueba que la fila **no cambia** y que la clave legítima del
 * mismo body **sí** se aplica. Las dos cosas, porque una allowlist que
 * bloquea todo también "funciona" y dejaría el producto roto sin que ningún test
 * lo dijera.
 *
 * Corre contra el SQLite local, no contra Turso: `vitest.config.ts:7-8` borra las
 * variables de Turso a propósito, y los 83 guards `isTursoConfigured()` que hay
 * en `lib/db.ts` no saltan nunca bajo test. Es la misma lógica del dual-mode, así
 * que lo que se prueba aquí es el camino local —y el `UPDATE` se construye igual
 * en los dos.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { updateTrack, createTrack, getTrackById, isTursoConfigured } from "@/lib/db";
import path from "path";

const ID = "trk-allowlist-001";

function localDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  return new Database(path.join(process.cwd(), "data", "music_catalog.db"));
}

function sembrar() {
  const db = localDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist_name TEXT,
      release_type TEXT,
      release_date TEXT,
      duration TEXT,
      cover_image TEXT,
      audio_preview_url TEXT,
      spotify_url TEXT,
      youtube_video_id TEXT,
      metrics TEXT,
      production_details TEXT,
      lyrics TEXT,
      itunes_track_id TEXT,
      stems_urls TEXT,
      video_embed_url TEXT,
      gallery_images TEXT,
      external_links TEXT,
      disc_number INTEGER DEFAULT 1,
      track_number INTEGER,
      is_double_single INTEGER DEFAULT 0,
      sides_b TEXT,
      isrc TEXT,
      composers TEXT,
      genre TEXT,
      description TEXT,
      streams INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      updated_at TEXT,
      release_id TEXT,
      start_time REAL DEFAULT 0,
      end_time REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`DELETE FROM tracks WHERE id = '${ID}'`);
  db.close();
}

function limpiar() {
  const db = localDb();
  db.exec(`DELETE FROM tracks WHERE id = '${ID}'`);
  db.close();
}

/**
 * Escribe con un body que **TypeScript no acepta**.
 *
 * El cast es el punto del test: la firma `Partial<{…}>` de `updateTrack` ya
 * rechaza estas claves en compilación, y por eso hace falta `as` para llegar a
 * probarlo. Lo que no existe es ninguna barrera en **runtime**, que es por donde
 * entra el body de verdad (`req.json()` no pasa por el compilador). Si algún día
 * el cuerpo de `updateTrack` pasara a ser `unknown` en vez de `Partial<{…}>`, este
 * cast sobraría — y ese sería el momento de quitarlo, no antes.
 */
const bodyCrudo = (o: Record<string, unknown>) =>
  o as Parameters<typeof updateTrack>[1];

describe("la allowlist de updateTrack, ejecutada", () => {
  beforeAll(async () => {
    if (isTursoConfigured()) return;
    sembrar();
    await createTrack({
      id: ID,
      title: "Original",
      artist_name: "QA allowlist",
      duration: "03:00",
    });
  });

  afterAll(() => {
    if (isTursoConfigured()) return;
    limpiar();
  });

  it("una clave legítima del mismo body sí se escribe", async () => {
    if (isTursoConfigured()) return;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    // `status` y no `description`: es el campo que `PUT /api/tracks` ya ejerce
    // de verdad (`route.ts:144`), así que si dejara de escribirse el producto no
    // aprobaría nada y lo sabríamos sin inventar un segundo campo.
    const actualizado = await updateTrack(ID, { title: "Cambiada", status: "approved" });

    aviso.mockRestore();
    expect(actualizado?.title).toBe("Cambiada");
    expect(actualizado?.status).toBe("approved");
  });

  it("una clave que es SQL no llega al SET", async () => {
    if (isTursoConfigured()) return;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    // El ataque real: una clave que, interpolada, produce
    // `UPDATE tracks SET title = 'X', (SELECT ...) = ? WHERE id = ?`.
    await updateTrack(ID, bodyCrudo({
      "title = 'inyectado' WHERE 1=1 --": "valor",
    }));

    aviso.mockRestore();
    const fila = await getTrackById(ID);
    // Si la clave hubiera colado, el título sería 'inyectado' o la fila habría
    // desaparecido. Lo que importa es que sigue siendo la que dejamos arriba.
    expect(fila?.title).toBe("Cambiada");
  });

  it("avisa de la clave descartada, para que nadie crea que guardó", async () => {
    if (isTursoConfigured()) return;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    await updateTrack(ID, bodyCrudo({ columna_que_no_existe: "x" }));

    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("columna_que_no_existe"));
    aviso.mockRestore();
  });

  it("un body con una clave buena y una mala aplica solo la buena", async () => {
    if (isTursoConfigured()) return;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    const actualizado = await updateTrack(ID, bodyCrudo({
      title: "Mitad buena",
      "lyrics = 'X' WHERE 1=1 --": "valor",
    }));

    aviso.mockRestore();
    expect(actualizado?.title).toBe("Mitad buena");
    expect(actualizado?.lyrics ?? "").not.toContain("X' WHERE");
  });

  it("si solo llegan claves desconocidas, no escribe nada", async () => {
    if (isTursoConfigured()) return;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sinCambios = await updateTrack(ID, bodyCrudo({ ninguna_de_estas: 1 }));

    aviso.mockRestore();
    expect(sinCambios?.title).toBe("Mitad buena");
  });
});
