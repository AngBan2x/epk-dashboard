/**
 * P13, paso 4 — las capturas que se van a publicar están bien antes de que nadie
 * las publique.
 *
 * ## Por qué un test sobre ficheros binarios
 *
 * Porque el modo de fallo que importa aquí **no rompe nada**: no hay excepción,
 * no hay build roto, no hay test rojo. Una captura en blanco, o una demasiado
 * estrecha para la plataforma que la va a consumir, se descubre cuando ya está
 * publicada. Y una imagen publicada no se quita sin alcance.
 *
 * Por eso el generador (`scripts/capture-social.ts`) avisa en el momento, y esto
 * lo ata para que el aviso no se pueda desactivar sin que alguien lo note.
 *
 * ## Los 320 px
 *
 * Es el mínimo de ancho que exige la API de Threads, verificado el 2026-10-11:
 * *"The media type must be JPEG, PNG, or WEBP... minimum 320 pixels wide"*. Los
 * 390 px del móvil cumplen; los 1440 del escritorio de sobra.
 *
 * ## Cómo se leen las dimensiones sin dependencias
 *
 * Los JPEG guardan tamaño y altura en un marcador `SOFn` del flujo. Se leen a
 * mano para no meter `sharp` ni `image-size` por leer dos números, y el parser
 * va con su control: si algún día el JFIF que genera Playwright cambia, el test
 * falla diciendo que el parser se quedó viejo, en vez de devolver 0 y fingir que
 * todo va bien.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(process.cwd(), "public/pressplay");

/** Las páginas que deben salir en el set, según `scripts/capture-social.ts`. */
const PAGINAS = ["landing", "release", "artista", "shows", "dashboard"];
const VIEWPORTS = ["desktop", "mobile"];
const TEMAS = ["light", "dark"];

/** Ancho mínimo que acepta Threads. */
const MIN_ANCHO = 320;

/**
 * Dimensiones de un JPEG leyendo el marcador `SOFn`.
 *
 * Devuelve `null` si no encuentra uno, que es distinto de devolver 0: 0 sería
 * un número y el test compararía con 0 y podría pasar por alto el caso real.
 */
function dimensionesJpeg(buf: Buffer): { ancho: number; alto: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null; // sin cabecera JPEG

  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marcador = buf[i + 1]!;
    // SOF0..SOF15 salvo los que no son "start of frame": C4 (DHT), C8 (JPG) y CC (DAC).
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      const alto = buf.readUInt16BE(i + 5)!;
      const ancho = buf.readUInt16BE(i + 7)!;
      return { ancho, alto };
    }
    const longitudSegmento = buf.readUInt16BE(i + 2)!;
    if (longitudSegmento < 2) return null;
    i += 2 + longitudSegmento;
  }
  return null;
}

const ficheros = (): string[] =>
  existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".jpg")).sort() : [];

const esperados = PAGINAS.flatMap((p) =>
  VIEWPORTS.flatMap((v) => TEMAS.map((t) => `${p}-${v}-${t}.jpg`)),
);

describe("el set de capturas está completo", () => {
  it("existe el directorio", () => {
    expect(existsSync(DIR), "falta public/pressplay/; ejecuta scripts/capture-social.ts").toBe(true);
  });

  it("son exactamente los 20 ficheros previstos", () => {
    // Exacto en las dos direcciones. Sobrantes y ausentes por igual: un
    // `landing-desktop-light.jpg.bak` no es un extra inocuo, es una captura que
    // alguien publicará por error algún día.
    expect(ficheros()).toEqual(esperados.sort());
  });

  it("ninguno pesa menos de 20 KB", () => {
    // Suelo holgado a propósito. Los ficheros en blanco históricos del repo
    // (`screenshots/prod-dark-home.png`) pesaban 1,5 KB; las capturas reales
    // van de 68 KB a 362 KB. 20 KB deja margen sin dejar pasar un vacío.
    for (const f of ficheros()) {
      const bytes = statSync(path.join(DIR, f)).size;
      expect(bytes, `${f} pesa ${bytes} bytes`).toBeGreaterThan(20_000);
    }
  });
});

describe("cada captura se puede leer y tiene tamaño", () => {
  it("el parser encuentra un marcador SOF en todas", () => {
    // Control del parser. Sin esto, un parser roto que devuelva null hace que
    // el bucle de abajo no se ejecute y el fichero "pase".
    const leidas = ficheros().map((f) => ({ f, d: dimensionesJpeg(readFileSync(path.join(DIR, f))) }));
    expect(leidas.length).toBeGreaterThan(0);
    for (const { f, d } of leidas) {
      expect(d, `${f}: no se encontró marcador SOF, o el parser está viejo`).not.toBeNull();
      expect(d!.ancho, `${f}: ancho 0`).toBeGreaterThan(0);
      expect(d!.alto, `${f}: alto 0`).toBeGreaterThan(0);
    }
  });

  it("ninguna es más estrecha que lo que acepta Threads", () => {
    for (const f of ficheros()) {
      const d = dimensionesJpeg(readFileSync(path.join(DIR, f)))!;
      expect(d.ancho, `${f} mide ${d.ancho}px, Threads exige ${MIN_ANCHO} mínimo`).toBeGreaterThanOrEqual(MIN_ANCHO);
    }
  });

  it("el móvil y el escritorio se distinguen, así que no son el mismo fichero", () => {
    const d = (f: string) => dimensionesJpeg(readFileSync(path.join(DIR, f)))!;
    expect(d("landing-desktop-light.jpg").ancho).toBe(1440);
    expect(d("landing-mobile-light.jpg").ancho).toBe(390);
  });
});

describe("la política de sesión, que es lo que evita filtrar datos", () => {
  const script = readFileSync(path.resolve(process.cwd(), "scripts/capture-social.ts"), "utf8");

  it("solo el dashboard se captura autenticado", () => {
    // La primera versión capturaba todo con sesión y salía con el navbar
    // mostrando el nombre de una persona real y su contador de notificaciones,
    // en una imagen destinada a ser pública. Una imagen publicada no se quita
    // sin alcance, así que esto se ata.
    const lineas = script.split("\n").filter((l) => l.trim().startsWith("{ nombre:"));
    expect(lineas.length).toBe(PAGINAS.length);
    const conSesion = lineas.filter((l) => l.includes("necesitaSesion: true"));
    expect(conSesion.length).toBe(1);
    expect(conSesion[0]).toContain('nombre: "dashboard"');
  });

  it("las cuatro páginas públicas se capturan sin sesión", () => {
    for (const nombre of ["landing", "release", "artista", "shows"]) {
      const linea = script.split("\n").find((l) => l.includes(`nombre: "${nombre}"`));
      expect(linea, `no se encuentra la página ${nombre}`).toBeDefined();
      expect(linea!).toContain("necesitaSesion: false");
    }
  });
});

describe("el generador se niega a entregar capturas defectuosas", () => {
  const script = readFileSync(path.resolve(process.cwd(), "scripts/capture-social.ts"), "utf8");

  it("espera a que termine de pintar, no a que pase un rato", () => {
    // Con `waitForTimeout(600)` salió una landing en oscuro con el hero vacío:
    // el logo ya había animado y el titular, con `delay: 0.2`, no. El suelo de
    // bytes no lo pilló, porque una página a medias tiene navbar y pie y pesa
    // de sobra.
    expect(script).toContain("esperarPintado");
    expect(script).toMatch(/opacity\)\s*>\s*0\.99/);
    // Y los fondos CSS, que no son <img> y el waitForFunction de imágenes no ve.
    expect(script).toMatch(/backgroundImage/);
  });

  it("comprueba el peso y sale con codigo de error", () => {
    // Sin `process.exitCode`, "aborta si está en blanco" sería solo un texto:
    // en CI el paso seguiría en verde.
    expect(script).toMatch(/MIN_BYTES/);
    expect(script).toContain("process.exitCode = 1");
  });

  it("usa un selector propio por pagina, no un `main` generico", () => {
    // El `main` común falló en las dos páginas más importantes: la landing no
    // envuelve nada y la ficha de release arranca con un `<div>`. Y la
    // comprobación es más fuerte con selectores propios.
    expect(script).not.toMatch(/selector:\s*"main"[^\n]*landing/);
    expect(script).toContain('selector: "h1"');
  });
});