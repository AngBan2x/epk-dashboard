/**
 * ## Qué protege este fichero
 *
 * El commit `4592bd3` ("consolidar el reproductor en `AudioPlayer`") borró dos
 * componentes: `StemsPlayer` (un reproductor de *stems* que se solapaba con el
 * global) y `LyricsModal`. Borrar un componente es la clase de cambio que no
 * rompe nada **al compilar**: si alguien lo reintroduce con un `import` y no lo
 * monta en ninguna vista, el build pasa, los 1146 tests pasan y el repo tiene
 * otra vez 400 líneas muertas. El repositorio entero no se entera.
 *
 * Por eso este test mira el **disco** y el **código**, no el DOM: son las dos
 * cosas que sobreviven a una reintroducción silenciosa.
 *
 * Ojo con lo que este fichero **no** comprueba: que los componentes harían lo
 * que hicieron. No se puede, están borrados. Lo que ata es que *no vuelvan a
 * existir*, que es la mitad del contrato que se puede verificar de verdad.
 *
 * Disciplina: los dos `it` se ponen rojos si alguien vuelve a crear cualquiera
 * de los dos ficheros. Se comprobó revirtiendo el arreglo.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const raiz = process.cwd();

/** Componentes que `4592bd3` consolidó dentro de `AudioPlayer`. */
const CONSOLIDADOS = ["StemsPlayer", "LyricsModal"] as const;

/** Todos los `.ts`/`.tsx` de un árbol, recursivamente. */
function fuentes(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completa = path.join(dir, entrada);
    if (statSync(completa).isDirectory()) {
      encontrados.push(...fuentes(completa));
      continue;
    }
    if (/\.tsx?$/.test(entrada)) encontrados.push(completa);
  }
  return encontrados;
}

describe("código muerto: los componentes que AudioPlayer consolidó", () => {
  it("los ficheros no existen en disco", () => {
    // Si alguien los reintroduce, este test se pone rojo antes de que lleguen a
    // importarse: es el aviso más barato que existe.
    for (const nombre of CONSOLIDADOS) {
      const candidatos = [
        `components/${nombre}.tsx`,
        `components/${nombre}.ts`,
        `components/audio/${nombre}.tsx`,
      ];
      for (const relativo of candidatos) {
        expect(
          existsSync(path.join(raiz, relativo)),
          `${relativo} volvió a existir: el reproductor quedó consolidado en AudioPlayer, no en dos componentes`
        ).toBe(false);
      }
    }
  });

  it("nadie los importa desde components/ ni desde app/", () => {
    // El test anterior mira dos rutas concretas; este es el que de verdad
    // importa. Un `import { StemsPlayer } from "@/components/StemsPlayer"`
    // puede vivir en cualquier subcarpeta, y un fichero que se crea con el
    // import dentro ya no lo caza nadie a ojo.
    const arboles = ["components", "app"].filter((d) => existsSync(path.join(raiz, d)));
    expect(arboles.length).toBeGreaterThan(0);

    const ofensores: string[] = [];
    let ficherosMirados = 0;

    for (const arbol of arboles) {
      for (const fichero of fuentes(path.join(raiz, arbol))) {
        ficherosMirados++;
        const src = readFileSync(fichero, "utf8");
        const relativo = path.relative(raiz, fichero).split(path.sep).join("/");
        for (const nombre of CONSOLIDADOS) {
          // Import o uso en JSX. El `require` no se usa en este repo, pero
          // entra gratis en la misma regex.
          const patron = new RegExp(
            `(import\\s[^;]*\\b${nombre}\\b)|(<${nombre}\\b)|(require\\s*\\([^)]*${nombre})`
          );
          if (patron.test(src)) ofensores.push(`${relativo} → ${nombre}`);
        }
      }
    }

    // El propio recuento se asserta: si el recorrido no encontrara ficheros,
    // `ofensores` estaría vacío y el test pasaría sin comprobar nada.
    expect(ficherosMirados).toBeGreaterThan(50);
    expect(ofensores, `importaciones prohibidas: ${ofensores.join(", ")}`).toEqual([]);
  });

  it("y el reproductor consolidado es el único que queda montado", () => {
    // La otra mitad del contrato de `4592bd3`: no se sustituyó un reproductor
    // por otro, sino que se quitaron. Se ata al fichero que sí debe seguir
    // existiendo y al nombre del componente.
    const player = path.join(raiz, "components/AudioPlayer.tsx");
    expect(existsSync(player)).toBe(true);

    const src = readFileSync(player, "utf8");
    expect(src).toContain("export function AudioPlayer(");
    // La etiqueta honesta de fuente vive en la capa pura, que es donde se
    // puede testear sin DOM. Si vuelve al componente, se pierde el test.
    expect(src).toContain("resolvePlayingLabel");
  });
});
