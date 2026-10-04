#!/usr/bin/env node
/**
 * Reescribe la historia de una rama para quitar la credencial de un fichero.
 *
 * ============================================================
 * POR QUE EXISTE ESTE SCRIPT Y NO SE USA `git filter-repo`
 * ============================================================
 *
 * En este repo `git filter-repo` muere con:
 *
 *     OSError: [Errno 22] Invalid argument
 *     fatal: could not write blob '433798099bab...'  (pnpm-lock.yaml, 193 KB)
 *
 * Y `git filter-branch` tampoco puede, por otra causa distinta. Dos problemas
 * distintos que conviene no confundir:
 *
 * 1. **`fast-import` rechaza un path invalido.** Alguien commiteo un flujo de
 *    datos alternativo de NTFS como si fuera un fichero:
 * `Directrices del Proyecto Final.md:Zone.Identifier`. En NTFS el `:` no es un
 *    caracter valido, y `fast-import` lo rechaza al LEERLO del flujo de
 *    fast-export: `fatal: invalid path`. `filter-branch` falla tambien, pero en
 *    `Could not initialize the index`, porque hace checkout y no puede escribir
 *    ese nombre.
 *
 *    Por eso el filtro de rutas de filter-repo (`--path --invert-paths`) **no
 *    sirve**: el fichero ya esta dentro del flujo cuando el filtro de Python
 *    llega a verlo.
 *
 * 2. **`OSError: [Errno 22]`.** Se descarto que fuera el blob (un probe con ese
 *    blob exacto de 199 KB pasa), que fuera el tamano del repo (un probe de
 *    78 MB pasa) y que fueran los espacios en el path (un clon en ruta sin
 *    espacios falla igual). Sin diagnostico util, se hace con plumbing.
 *
 * ============================================================
 * USO
 * ============================================================
 *
 *   0. Instalar git-filter-repo (NO viene con git):
 *        pip install git-filter-repo
 *        git filter-repo --version      # debe imprimir un hash, no un error
 *
 *   1. CLON DE SEGURIDAD, obligatorio. Esto reescribe hashes:
 *        git clone --mirror . ../epk-respaldo.git
 *
 *   2. Purgar primero el path invalido, que es lo que bloquea todo lo demas:
 *        node scripts/git/rewrite-invalid-path.js
 *      A partir de aqui `git filter-repo` ya funciona (por fin se puede usar).
 *
 *   3. Purgar la credencial:
 *        node scripts/git/purge-history.js main
 *
 *      Asi cada rama por separado, porque este script reescribe commits, no
 *      borra objetos: `main` y cada tag necesitan su pasada.
 *
 *   4. Actualizar los tags. **OJO: un tag es una puerta trasera.** Un tag sigue
 *      apuntando al commit viejo, asi que aunque `main` este limpio, el tag
 *      devuelve el historial con la credencial. Hay que reescribirlos:
 *        node scripts/git/purge-history.js refs/tags/v4.0.0-rc.33
 *        # ...uno por tag. Hay 58.
 *
 *   5. Verificar (los dos tienen que dar 0):
 *        git log --all --oneline -S 'test-artist@example.invalid'
 *        git grep -n 'angab06' $(git rev-list --all)
 *
 *   6. Push:
 *        git push --force-with-lease origin main
 *        git push --force origin 'refs/tags/*'
 *
 *   `--force-with-lease` y no `--force`: si alguien subio algo entre tu ultimo
 *   fetch y el push, aborta en vez de pisarlo.
 *
 * ============================================================
 * POR QUE ESTE SCRIPT ES "MÁS SEGURO" QUE filter-branch
 * ============================================================
 *
 * `filter-branch` deja un backup en `refs/original/` con la historia ANTIGUA.
 * Ese backup es una puerta trasera: aunque limpies `main`, el secreto sigue
 * accesible con `git log refs/original/...`.
 *
 * Este script NO crea refs de respaldo. Ademas:
 *
 * - **BINARY-SAFE.** Trabaja con `Buffer`, no con `utf8`: los binarios del
 *   historico (png, jpg, woff2) se devuelven byte a byte sin tocar. Leer un
 *   png como utf8 y reescribirlo lo corrompe en silencio y no avisa.
 * - **El numero suelto `12345678` NO se reemplaza nunca.** En
 *   `tests/unit/account-settings.test.ts:91` ese numero va SIN comillas: es un
 *   NUMBER en un test de validacion de tipo. Sustituirlo lo convierte en texto y
 *   el test deja de probar lo que prueba.
 * - **Conserva autor, fecha y mensaje exactos** de cada commit.
 *
 * ============================================================
 * LO QUE NO HACE, Y HAY QUE HACER A MANO
 * ============================================================
 *
 * - **No purga `.git`**: los objetos sueltos se limpian con
 *   `git reflog expire --expire=now --all && git gc --prune=now --force`.
 * - **No borra el backup de GitHub**: aunque reescribas, el repositorio remoto
 *   mantiene los commits viejos hasta que expire la cache de refs.
 * - **No toca los tags**: hay que pasarle cada uno (ver paso 4).
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/** Sustituciones, en orden. La pareja va antes que el patron suelto. */
const REGLAS = [
  ["test-artist@example.invalid / <CONTRASENA_ROTADA>", "test-artist@example.invalid / <CONTRASENA_ROTADA>"],
  ["admin@epk.local / <CONTRASENA_ROTADA>", "admin@epk.local / <CONTRASENA_ROTADA>"],
  ["test-artist@example.invalid", "test-artist@example.invalid"],
  ["CONTRASENA_ADMIN_ROTADA", "CONTRASENA_ADMIN_ROTADA"],
];

/** Ficheros que no se tocan: no tienen la credencial y son binarios o generados. */
const SALTAR = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "package.json",
]);

const REF = process.argv[2] || "main";

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  }).trim();
}

/** Un NUL en los primeros 8000 bytes = binario. */
function esBinario(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/**
 * Sustituye sobre Buffer, no sobre string: un binario que no contiene el patron
 * se devuelve intacto, y uno que lo contiene se cambia solo en esos bytes.
 */
function sustituir(buf) {
  let salida = buf;
  let cambio = false;
  for (const [de, a] of REGLAS) {
    if (!salida.includes(Buffer.from(de, "utf8"))) continue;
    salida = Buffer.from(salida.toString("binary").split(de).join(a), "binary");
    cambio = true;
  }
  return { buf: salida, cambio };
}

function limpiarBlob(sha) {
  const buf = execFileSync("git", ["cat-file", "blob", sha], {
    maxBuffer: 512 * 1024 * 1024,
  });
  if (esBinario(buf)) return { sha, cambio: false };

  const { buf: salida, cambio } = sustituir(buf);
  if (!cambio) return { sha, cambio: false };

  // Sin `encoding` execFileSync devuelve un Buffer, y un Buffer no tiene
  // `.trim()`. El sha es ASCII, asi que no hay perdida al forzar utf8.
  const nuevo = execFileSync("git", ["hash-object", "-w", "--stdin"], {
    input: salida,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  }).trim();
  return { sha: nuevo, cambio: true };
}

function limpiarArbol(treeSha) {
  const lineas = git("ls-tree", treeSha).split("\n").filter(Boolean);
  const conservadas = [];
  let cambio = false;

  for (const linea of lineas) {
    const corte = linea.indexOf("\t");
    const meta = linea.slice(0, corte);
    const nombre = linea.slice(corte + 1);
    const tipo = meta.split(" ")[1];

    if (tipo === "tree") {
      const shaViejo = meta.split(" ").pop();
      const sub = limpiarArbol(shaViejo);
      if (sub.cambio) {
        cambio = true;
        conservadas.push(`${meta.slice(0, meta.lastIndexOf(" ") + 1)}${sub.sha}\t${nombre}`);
        continue;
      }
    } else if (tipo === "blob") {
      if (SALTAR.has(nombre)) {
        conservadas.push(linea);
        continue;
      }
      const shaViejo = meta.split(" ").pop();
      const b = limpiarBlob(shaViejo);
      if (b.cambio) {
        cambio = true;
        conservadas.push(`${meta.slice(0, meta.lastIndexOf(" ") + 1)}${b.sha}\t${nombre}`);
        continue;
      }
    }
    conservadas.push(linea);
  }

  if (!cambio) return { sha: treeSha, cambio: false };

  // `mktree` lee el arbol por STDIN. Pasarselo como argumento de la linea de
  // ordenes hace que reciba la cadena vacia y devuelva SIEMPRE el arbol vacio
  // (4b825dc), sin error y sin avisar.
  const nuevo = execFileSync("git", ["mktree"], {
    input: conservadas.join("\n") + "\n",
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  }).trim();
  return { sha: nuevo, cambio: true };
}

// Orden de mas antiguo a mas reciente: cuando toca un commit, su padre ya esta
// resuelto en el mapa. Reescribir un commit cambia su hash, y el hash del padre
// forma parte del contenido de sus hijos, por eso hay que encadenar.
const commits = git("rev-list", "--reverse", REF).split("\n").filter(Boolean);
console.error(`commits en ${REF}: ${commits.length}`);

const mapa = new Map();
let conCambio = 0;

for (const c of commits) {
  const info = git("rev-list", "--parents", "-n", "1", c).split(" ");
  const padresViejos = info.slice(1);
  const padresNuevos = padresViejos.map((p) => mapa.get(p) ?? p);
  const padreCambiado = padresNuevos.some((n, i) => n !== padresViejos[i]);

  const arbol = git("rev-parse", `${c}^{tree}`);
  const { sha: arbolNuevo, cambio: arbolCambiado } = limpiarArbol(arbol);

  if (!arbolCambiado && !padreCambiado) {
    mapa.set(c, c);
    continue;
  }

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
  conCambio++;
  if (conCambio <= 3 || conCambio % 50 === 0) {
    console.error(`  [${conCambio}/${commits.length}] ${c.slice(0, 7)} -> ${nuevo.slice(0, 7)}`);
  }
}

const cabezaVieja = git("rev-parse", REF);
const cabezaNueva = mapa.get(cabezaVieja) ?? cabezaVieja;

console.error(`\ncommits reescritos: ${conCambio}`);
console.error(`${REF}: ${cabezaVieja.slice(0, 7)} -> ${cabezaNueva.slice(0, 7)}`);

const nombreMapa = `mapa-${REF.replace(/[\\/]/g, "_")}.json`;
fs.writeFileSync(nombreMapa, JSON.stringify(Object.fromEntries(mapa)));
console.error(`mapa guardado en ${nombreMapa}`);

if (conCambio === 0) {
  console.error("\nNada que cambiar en esta ref (quiza ya estaba purgada).");
} else {
  console.error("\nAUN NO ESTA APLICADO. Falta:");
  console.error(`  git update-ref refs/heads/${REF} ${cabezaNueva} ${cabezaVieja}`);
  console.error("  (para tags, update-ref sobre refs/tags/<nombre>)");
}