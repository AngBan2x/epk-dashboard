#!/usr/bin/env node
/**
 * Quita del historial un fichero con un PATH INVALIDO para el sistema de
 * ficheros, encadenando los descendientes.
 *
 * ============================================================
 * EL PROBLEMA
 * ============================================================
 *
 * Alguien commiteo un flujo de datos alternativo de NTFS como si fuera un
 * fichero:
 *
 *     Directrices del Proyecto Final.md:Zone.Identifier
 *
 * `:Zone.Identifier` es la marca que Windows pone a los ficheros descargados de
 * internet. Commiteada, es un **path con dos puntos**, y en NTFS el `:` no es un
 * caracter valido. Consecuencia: **dos herramientas de reescritura se rompen**,
 * y cada una de una manera distinta:
 *
 * | Herramienta | Como muere |
 * |---|---|
 * | `git filter-repo` | `fatal: invalid path ...` dentro de **`fast-import`**, al LEER el path del flujo de fast-export, antes de que el filtro de Python lo vea |
 * | `git filter-branch` | `Could not initialize the index`, porque hace checkout y no puede escribir ese nombre |
 *
 * Por eso `filter-repo --path '*Zone.Identifier' --invert-paths` **no sirve**:
 * el fichero ya esta dentro del flujo cuando el filtro podria quitarlo.
 *
 * Solo afecta a **16 de los 341 commits** (del bootstrap `f92d377`, que es el
 * commit raiz, hasta `6952683`, que lo borra). En HEAD **no esta**.
 *
 * ============================================================
 * POR QUE PLUMBING Y NO LAS HERRAMIENTAS
 * ============================================================
 *
 * `git ls-tree` + `git mktree` reconstruyen un arbol sin esa entrada, y
 * `git commit-tree` reconstruye el commit. Ninguna de las dos pasa por
 * `fast-import` ni hace checkout, asi que ninguna tropieza con el path invalido.
 *
 * Ademas `filter-branch` deja un backup en `refs/original/` con la historia
 * ANTIGUA, que es una puerta trasera: aunque limpies `main`, el secreto sigue
 * accesible con `git log refs/original/...`. Este script no crea refs de
 * respaldo.
 *
 * ============================================================
 * USO
 * ============================================================
 *
 *   1. Backup:
 *        git clone --mirror . ../epk-respaldo.git
 *
 *   2. Ejecutar:
 *        node scripts/git/rewrite-invalid-path.js
 *
 *   3. Verificar que el path ya no esta en ninguna parte:
 *        git log --all --oneline -- '*Zone.Identifier*'   # debe dar 0 lineas
 *
 *   4. Comprobar que NO se ha roto nada. La prueba buena no es "los tests
 *      pasan" (que no distingue un reescritura correcta de una que perdio medio
 *      repositorio) sino esta: **cada commit viejo y su reescrito deben diferir
 *      SOLO en ese fichero.**
 *
 *        node -e "const m=require('./mapa.json');for(const [o,n] of
 *          Object.entries(m)){if(o===n)continue;const d=require('child_process')
 *          .execFileSync('git',['diff','--name-status',o+'^{tree}',n+'^{tree}'],
 *          {encoding:'utf8'}).trim().split('\n').filter(Boolean)
 *          .map(l=>l.split('\t').pop())
 *          .filter(f=>f!=='Directrices del Proyecto Final.md:Zone.Identifier');
 *          if(d.length)console.log('CAMBIO INESPERADO en',o,d.join(', '))}"
 *
 *        Si no imprime nada, los 341 commits difieren unicamente en la
 *        eliminacion del fichero basura.
 *
 *   5. A partir de aqui **`git filter-repo` ya funciona**, y se puede purgar la
 *      credencial con la herramienta estandar:
 *        git filter-repo --replace-text replacements.txt --force
 *
 *   6. Si se prefiere seguir con plumbing:
 *        node scripts/git/purge-history.js main
 *
 * ============================================================
 * POR QUE HAY QUE ENCADENAR LOS DESCENDIENTES
 * ============================================================
 *
 * Cambiar el arbol de un commit cambia su hash, y **el hash del padre es parte
 * del contenido de sus hijos**. Por eso se recorre de mas antiguo a mas
 * reciente: cuando toca un commit, su padre ya esta resuelto en el mapa.
 *
 * Los commits que no cambian ni arbol ni padre **se reutilizan tal cual** (mismo
 * sha), y por eso solo se reescriben los que de verdad lo necesitan.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");

const MALO = "Directrices del Proyecto Final.md:Zone.Identifier";
const REF = process.argv[2] || "main";

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  }).trim();
}

/**
 * Quita la entrada MALO del arbol, recursivamente.
 * @returns {{ sha: string, cambio: boolean }}
 */
function limpiarArbol(treeSha) {
  const lineas = git("ls-tree", treeSha).split("\n").filter(Boolean);
  const conservadas = [];
  let cambio = false;

  for (const linea of lineas) {
    const corte = linea.indexOf("\t");
    const meta = linea.slice(0, corte);
    const nombre = linea.slice(corte + 1);
    const tipo = meta.split(" ")[1];

    if (nombre === MALO) {
      cambio = true;
      continue;
    }

    if (tipo === "tree") {
      const shaViejo = meta.split(" ").pop();
      const sub = limpiarArbol(shaViejo);
      if (sub.cambio) {
        cambio = true;
        conservadas.push(`${meta.slice(0, meta.lastIndexOf(" ") + 1)}${sub.sha}\t${nombre}`);
        continue;
      }
    }
    conservadas.push(linea);
  }

  if (!cambio) return { sha: treeSha, cambio: false };

  // `mktree` lee el arbol por STDIN. Pasarselo como argumento de la linea de
  // ordenes hace que reciba la cadena vacia y devuelva SIEMPRE el arbol vacio
  // (4b825dc), sin error y sin avisar. Por eso va en `input`.
  const nuevo = execFileSync("git", ["mktree"], {
    input: conservadas.join("\n") + "\n",
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  }).trim();
  return { sha: nuevo, cambio: true };
}

const commits = git("rev-list", "--reverse", REF).split("\n").filter(Boolean);
console.error(`commits en ${REF}: ${commits.length}`);

const mapa = new Map();
let conArbolLimpio = 0;
let propagados = 0;

for (const c of commits) {
  const info = git("rev-list", "--parents", "-n", "1", c).split(" ");
  const padresViejos = info.slice(1);
  const padresNuevos = padresViejos.map((p) => mapa.get(p) ?? p);
  const padreCambiado = padresNuevos.some((n, i) => n !== padresViejos[i]);

  const arbolViejo = git("rev-parse", `${c}^{tree}`);
  const { sha: arbolNuevo, cambio: arbolCambiado } = limpiarArbol(arbolViejo);

  if (!arbolCambiado && !padreCambiado) {
    mapa.set(c, c);
    continue;
  }

  if (arbolCambiado) conArbolLimpio++;
  else propagados++;

  const mensaje = execFileSync("git", ["cat-file", "commit", c], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  const cabecera = mensaje.split("\n\n")[0];
  const cuerpo = mensaje.slice(mensaje.indexOf("\n\n") + 2);

  const autor = /^author (.*) (\d+) ([+-]\d{4})$/m.exec(cabecera);
  const committer = /^committer (.*) (\d+) ([+-]\d{4})$/m.exec(cabecera);
  if (!autor || !committer) {
    console.error(`  ${c.slice(0, 7)} sin cabecera de autor: se salta`);
    mapa.set(c, c);
    continue;
  }

  // Sin esto, `commit-tree` pondria la identidad de quien corre el script y la
  // fecha de ahora, y los commits perderian su autoria original en silencio.
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: autor[1],
    GIT_AUTHOR_EMAIL: autor[1].match(/<(.*)>/)?.[1] ?? autor[1],
    GIT_AUTHOR_DATE: `${autor[2]} ${autor[3]}`,
    GIT_COMMITTER_NAME: committer[1].match(/<(.*)>/)?.[1] ?? committer[1],
    GIT_COMMITTER_EMAIL: committer[1].match(/<(.*)>/)?.[1] ?? committer[1],
    GIT_COMMITTER_DATE: `${committer[2]} ${committer[3]}`,
  };

  const args = ["commit-tree", arbolNuevo, ...padresNuevos.flatMap((p) => ["-p", p])];
  const nuevo = execFileSync("git", args, {
    input: cuerpo,
    encoding: "utf8",
    env,
    maxBuffer: 512 * 1024 * 1024,
  }).trim();

  mapa.set(c, nuevo);
  if (conArbolLimpio + propagados <= 20) {
    console.error(`  ${c.slice(0, 7)} -> ${nuevo.slice(0, 7)}${arbolCambiado ? "  (arbol)" : "  (propagado)"}`);
  }
}

const cabezaVieja = git("rev-parse", REF);
const cabezaNueva = mapa.get(cabezaVieja) ?? cabezaVieja;

console.error(`\narboles limpiados: ${conArbolLimpio}`);
console.error(`hash propagados:  ${propagados}`);
console.error(`commits reescritos: ${mapa.size}`);

fs.writeFileSync("mapa.json", JSON.stringify(Object.fromEntries(mapa)));
console.error("mapa guardado en mapa.json (para la verificacion del paso 4)");

if (cabezaVieja !== cabezaNueva) {
  console.error("\nAUN NO ESTA APLICADO. Falta:");
  console.error(`  git update-ref refs/heads/${REF} ${cabezaNueva} ${cabezaVieja}`);
  console.error("\nY revisar los TAGS: cada uno sigue apuntando al commit viejo.");
}