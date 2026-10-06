# Rotación de credenciales y reescritura de `main`

Guía paso a paso para las tres cosas que quedan de la Fase P. En este orden,
porque **rotar antes de reescribir rompe los tests**, y reescribir antes de rotar
deja el secreto vivo en un solo sitio.

Estado actual: la credencial **ya no está en el código** (P1), pero sigue en el
historial de git en **33 commits**.

---

## Por qué este orden

| Paso | Qué pasa si lo saltas |
|---|---|
| 1. Rotar la contraseña **en la app** | El secreto nuevo no existe en ningún sitio |
| 2. Ponerla en `.env.local` y en el secret store | Los 12 specs de Playwright y los scripts de QA dejan de autenticar |
| 3. Decidir el futuro de `seed-admin.ts` | Si el seed se queda con `CONTRASENA_ADMIN_ROTADA`, el **volverá a escribir una contraseña conocida** en cada ejecución |
| 4. Reescribir el historial | El secreto sigue legible con `git log` |
| 5. Forzar el push | Los clones de otras personas siguen teniendo el secreto |

El paso 3 va antes del 4 a propósito: si reescribes el historial y luego cambias
el seed, hay que reescribir otra vez.

---

## Paso 1 — Rotar las contraseñas en la aplicación

Hay dos cuentas de test. La cuenta de **artista** es de una persona real: es la
que urge.

**Desde la app** (lo más limpio, porque pasa por el mismo código de producción):

- **Artista**: `https://epk-dashboard.vercel.app/account` → cambiar contraseña.
  Ojo: si la cuenta está suspendida (`users.deleted_at`), hay que recuperarla
  con email + contraseña desde `PUT /api/user/settings` dentro de los 30 días, y
  **después** cambiar la contraseña.
- **Admin**: entra con el admin actual → `/account` → cambiar contraseña.

**Desde SQL**, si quieres hacerlo sin pasar por la UI:

```bash
node -e "console.log(require('bcryptjs').hashSync('NUEVA_CLAVE', 10))"
```

```sql
UPDATE users SET password_hash = '<hash>' WHERE email = '<correo>';
```

Hazlo por SQL solo si la UI te da problemas: la UI además invalida la sesión
(`invalidateSessionBefore`), y si cambias la contraseña por SQL **las sesiones
abiertas siguen vivas**.

## Paso 2 — Propagar a `.env.local` y al secret store

`.env.local` **ya tiene las cuatro variables** (P1 las defini con los valores
antiguos). Cambia solo los valores:

```
TEST_ARTIST_PASSWORD=<la nueva>
TEST_ADMIN_PASSWORD=<la nueva>
```

`.gitignore` cubre `.env*`, así que esto no se commitea. Compruébalo:

```bash
git check-ignore .env.local    # debe imprimir la ruta
git status --short .env.local  # no debe aparecer
```

En producción **no hay nada que cambiar**: `TEST_*` solo se usan en local y en CI.
Si Corcel o GitHub Actions ejecutan los E2E, define las cuatro variables ahí como
secretos del secret store, nunca en un `.env` commiteado.

## Paso 3 — Decidir qué hace `scripts/seed-admin.ts`

**Este es el paso que se salta todo el mundo y es el que reintroduce el
secreto.** `scripts/seed-admin.ts` sigue con `hashSync("CONTRASENA_ADMIN_ROTADA")`, y
`scripts/create-test-artist.ts` con un hash equivalente. Son **seeds**: crean la
cuenta con esa contraseña. Si alguien los corre después de rotar, el admin de
producción vuelve a tener una contraseña conocida.

Dos salidas, y es decisión tuya:

| Opción | Qué implica |
|---|---|
| **A. El seed lee del entorno** | `hashSync(requireCredentials("admin").password, 10)`, y falla sin `TEST_ADMIN_PASSWORD`. Si rotas, el seed no puede reintroducir el secreto. |
| **B. El seed fija la contraseña a propósito** | Es un default conocido de una cuenta admin: quien sepa `admin@epk.local` entra. Solo aceptable si es un entorno efímero, nunca producción. |

La recomendada es **A**, y ya está preparada: `scripts/lib/credentials.ts` exporta
`requireCredentials()`, y el cambio son 3 líneas por fichero. Dime cuál y lo
aplico.

## Paso 4 — Reescribir el historial

> ⚠️ **Este paso ya se intentó el 2026-10-03 y falló.** No por culpa de
> `git filter-repo`, sino porque **el repositorio tiene un fichero con un path
> inválido que rompe las dos herramientas de reescritura**. Está resuelto en el
> paso 4.0. Léelo antes de tocar nada.

### 4.0 — Purgar primero el path inválido (OBLIGATORIO)

Alguien commiteó un **flujo de datos alternativo de NTFS** como si fuera un
fichero: `Directrices del Proyecto Final.md:Zone.Identifier`. `:Zone.Identifier`
es la marca que Windows pone a lo descargado de internet, y en NTFS el `:` no es
un carácter válido.

Consecuencia: **`git filter-repo` y `git filter-branch` no pueden con este
repositorio**, cada una a su manera:

| Herramienta | Cómo muere |
|---|---|
| `git filter-repo` | `fatal: invalid path ...` dentro de **`fast-import`**, al leer el path del flujo — antes de que el filtro pueda verlo |
| `git filter-branch` | `Could not initialize the index`, porque hace checkout y no puede escribir ese nombre |

Por eso `--path '*Zone.Identifier' --invert-paths` **no sirve**: el fichero ya
está dentro del flujo cuando el filtro de Python llega a mirarlo.

Afecta a **16 de los 342 commits** — de los cuales solo **2 lo tocan**: el
bootstrap `f92d377` que lo añadió y `6952683` que lo borró. Los otros 14 lo tienen
en el árbol heredado. En HEAD **no está**.

```bash
# 1. Backup (esto reescribe hashes, no es reversible sin el backup)
git clone --mirror . ../epk-dashboard-respaldo.git

# 2. Purgar el path
node scripts/git/rewrite-invalid-path.js

# 3. Verificar que ya no está en ninguna parte
git log --all --oneline -- '*Zone.Identifier*'   # debe dar 0 líneas
```

**La verificación buena no es "los tests pasan"** — eso no distingue una
reescritura correcta de una que perdió medio repositorio. Es que **cada commit
viejo y su reescrito difieran SOLO en ese fichero**:

```bash
node -e "const m=require('./mapa.json');for(const [o,n] of Object.entries(m)){
  if(o===n)continue;
  const d=require('child_process').execFileSync('git',
    ['diff','--name-status',o+'^{tree}',n+'^{tree}'],{encoding:'utf8'})
    .trim().split('\n').filter(Boolean).map(l=>l.split('\t').pop())
    .filter(f=>f!=='Directrices del Proyecto Final.md:Zone.Identifier');
  if(d.length)console.log('CAMBIO INESPERADO en',o,d.join(', '))}"
```

Si no imprime nada, los 342 commits difieren únicamente en la eliminación del
fichero basura.

**A partir de aquí `git filter-repo` ya funciona** y se puede usar la
herramienta estándar. Y si prefieres seguir con plumbing (más lento pero
verificable commit a commit):

```bash
node scripts/git/purge-history.js main
```

### 4.1 — Purgar la credencial

**`git filter-repo` ya está instalado** en esta máquina (`2.47.0`, en el Python
del usuario, no en el PATH de git). Verifica:

```bash
git filter-repo --version   # imprime un hash; si dice "not a git command", reinstálalo
```

Dos vías:

**A. `filter-repo`, la estándar:**

```bash
git filter-repo --replace-text replacements.txt --force
```

**B. Plumbing con `scripts/git/purge-history.js`**, que es binary-safe (no
corrompe los png/jpg/woff2 del historial), no deja refs de respaldo en
`refs/original/`, y **no reemplaza el `12345678` suelto** porque en
`tests/unit/account-settings.test.ts:91` ese número va sin comillas: es un
`number` en un test de validación de tipo.

> **Sobre el `replacements.txt`:** el patrón `12345678==>...` que aparece en
> versiones anteriores de esta guía **rompería ese test**. Sustituye la pareja
> entera, no el número suelto.

### 4.2 — Los TAGS son una puerta trasera

Hay **61 tags** en el momento de escribir esto — `git tag | wc -l`; 33 son de la
serie `v4.0.0-rc.*` y 28 de versiones anteriores — y cada uno apunta a un commit
concreto. **Aunque limpies `main`, un tag devuelve el historial viejo con la
credencial dentro.** Hay que reescribirlos también:

```bash
# Vía recomendada para los tags: de una vez, con filter-repo.
git filter-repo --replace-text replacements.txt --force --refs refs/tags/*

# O con plumbing, uno por tag.
node scripts/git/purge-history.js refs/tags/v4.0.0-rc.33
```

> **Vuelve a mirar el número antes de empezar.** Las cifras de este documento son
> una foto del momento de escribirlo y **se desfasan solas con cada commit**: en
> una tarde pasaron de 58 a 61 sin que nadie las tocara. Los comandos van al lado
> de cada cifra justamente por eso.

### 4.3 — Limpiar los objetos sueltos

```bash
git reflog expire --expire=now --all
git gc --prune=now --force
```

Sin esto, `git fsck --lost-found` todavía encuentra los blobs viejos, y con
ellos la credencial.

Comprueba que ya no está en **ninguna** parte, con dos condiciones que se olvidan
siempre:

1. **La aguja no puede estar escrita en el repo.** Si el fichero que documenta el
   check contiene el término que el check busca, el pickaxe encuentra al propio
   documento y el resultado no significa nada. Montada en runtime, sí sirve.
2. **La aguja tiene que ser el dato, no el dominio.** `@gmail.com` da **falsos
   positivos**: los fixtures de test usan direcciones de gmail reales
   (`user@`, `duenio@`, `otro@`). Verificar el dominio no verifica a nadie.

```powershell
# Metadata: donde mas se filtra, y el contenido del doc no la toca.
git log --all --format='%ae|%ce' | Sort-Object -Unique
# -> solo test-artist@example.invalid | test-artist@example.invalid

# Residuo acotado: el local-part es la aguja de este repo, asi que se espera
# EXACTAMENTE lo que introduce la aguja (este doc + scripts/git/purge-history.js).
# Si aparece en otro sitio, algo se coló.
git log --all --oneline -S ('angab' + '06')
git grep -n ('angab' + '06') -- .            # debe dar solo lineas de busqueda

# El path invalido, por si alguien repite el 4.0 mas adelante.
git log --all --oneline -- '*Zone.Identifier*'   # debe dar 0 lineas

git fsck --lost-found                      # no debe listar blobs con la cadena
git worktree list                          # <- ver 4.4: puede quedar uno vivo
```

> La contrasena de administrador no se nombra aqui en ningun sitio, y no es
> descuido: **escribirla seria volver a meterla**. El correo entero tampoco, por
> el mismo motivo. Lo que se puede afirmar sin reintroducir nada es lo de arriba:
> la metadata es una sola direccion placeholder, y del correo personal solo
> sobrevive el local-part, en las dos lineas que lo buscan.

GitHub mantiene los commits viejos en su caché aunque reescribas, y puede
indexarlos de nuevo. Si el repositorio fuera público, lo normal sería pedir a
que lo pusieran en cola de gc; siendo privado y con las contraseñas ya
rotadas, el valor que queda es **muros** y el riesgo real es el **correo** (PII).

### 4.4 — Un WORKTREE ENLAZADO también es una puerta trasera

`git log --all` limpio **no basta** para dar la reescritura por buena. Antes del
`gc` seguían apareciendo 293 commits viejos con `main` y los 61 tags ya limpios.

La causa no era el repositorio: había un **worktree enlazado** de una sesión
anterior en `%TEMP%/opencode/fase-e-before`, con su `HEAD` en un commit viejo.
Vive en `.git/worktrees/`, comparte el mismo object store, y `--all` lo recorre
igual que si fuera una rama.

Es el mismo fallo que los 61 tags y casi el mismo que `refs/original/`: la
reescritura no consiste en "llegar a 0", sino en **llegar a 0 en todos los sitios
que la alcanzan**. Un worktree enlazado es uno más, y `prune` **no lo quita si el
directorio sigue existiendo** en disco.

```bash
git worktree list                 # <- antes de declarar la historia limpia

# Si el directorio ya no existe, prune solo lo recoge:
git worktree prune

# Si sigue ahí y no tiene trabajo pendiente, se reapunta en vez de borrarlo:
# cero borrados, y el commit viejo se queda sin alcance.
git --git-dir=.git/worktrees/<nombre> \
    --work-tree=<ruta> update-ref HEAD <commit-nuevo> <commit-viejo>

git log --all --oneline | wc -l   # debe igualar git rev-list --count main
```

La comparación de la última línea es la que de verdad ata el resultado: si
`--all` da más commits que `main`, **queda algo alcanzable que nadie ha mirado**.

### 4.5 — Lo que NO mira `git log -S`: mensajes, tagger e índices

`git log --all -S 'needle'` es el check que todo el mundo escribe, y **por
estructura no puede ver tres cosas**. Cada una de las tres se CUENTÓ como
resuelta mientras no lo estaba:

| Hueco | Qué lo guarda vivo | Cómo se ve |
|---|---|---|
| **Mensaje del commit** | 249 con el correo, 5 con la contrasena | `-S` cuenta ocurrencias en el **diff**, no en el mensaje |
| **`tagger` del tag anotado** | los 17 lo tenían en su propio objeto | `%ae\|%ce` solo mira commits, no la línea `tagger` de un tag |
| **Índice de un worktree** | 88 blobs que el `gc` no podaba | `--all` no lo recorre y `fsck` no los lista: **están alcanzables** |

```bash
# El mensaje: -S no lo ve, --grep sí.
git log --all --oneline --grep="$TU_AGUJA"          # debe dar 0

# El tagger de los tags anotados: hay que abrir el objeto, no el commit.
git for-each-ref refs/tags --format='%(objecttype) %(refname:short)' |
  while read tipo tag; do
    [ "$tipo" = tag ] && git cat-file tag "refs/tags/$tag"
  done | grep -c "$TU_AGUJA"                      # debe dar 0

# Y el indice de CADA worktree, que es una raiz de alcanzabilidad mas.
git worktree list
```

Al reescribir un tag anotado, **no preserves el tagger a ciegas**: preserva el
nombre y la fecha, y sanea el email. Y tras re-apuntar el `HEAD` de un worktree
enlazado, haz `reset --hard` **dentro** de él: si no, su índice sigue pidiendo
los blobs viejos y el `gc` no puede podarlos.

### 4.6 — El barrido que sí no miente

Por encima de cualquier check puntual, barre **todos** los objetos del store, con
un control al lado que demuestre que el instrumento funciona:

```powershell
git cat-file --batch-all-objects --batch | Select-String -SimpleMatch -Pattern $TU_AGUJA
git cat-file --batch-all-objects --batch | Select-String -SimpleMatch -Pattern 'PressPlay'   # control: >0
```

El **0 del needle** solo vale si el control da >0. Un check que no se puede ver
fallar no protege de nada, y un needle escrito en el propio fichero que documenta
el check se encuentra a sí mismo: móntalo en runtime (`'angab' + '06@...'`).

### Nota sobre `git filter-branch`

No se usa, y por dos motivos: rompe con el path inválido, y **deja un backup en
`refs/original/`** con la historia antigua. Ese backup es una puerta trasera:
aunque limpies `main`, el secreto sigue accesible con `git log refs/original/...`.
`scripts/git/*.js` no crea refs de respaldo.

## Paso 5 — Forzar el push

**Primero `main`, y verifica antes de tocar los tags:**

```bash
git push --force-with-lease origin main
```

`--force-with-lease` y **no** `--force`: si alguien ha subido algo entre tu
último `fetch` y el push, aborta en vez de pisarlo.

**Luego los tags**, que son 58 y apuntan a commits reescritos. Las releases de
GitHub cuelgan de ellos:

```bash
git push --force origin 'refs/tags/*'
```

**Y borrar los tags antiguos del remoto**, que siguen apuntando al historial con
la credencial:

```bash
# Ver cuáles siguen apuntando a commits que ya no existen en la rama
git ls-remote --tags origin | while read sha ref; do
  git cat-file -e "$sha^{commit}" 2>/dev/null || echo "obsoleto: $ref"
done

git push origin --delete v1.0.0 v2.1.0 ...   # los que salgan en la lista
```

> **Orden importante.** Si borras los tags del remoto **antes** de subirlos
> reescritos, las releases de GitHub se quedan apuntando a commits que ya no
> existen en ninguna rama y se rompen. Primero sube los nuevos, luego borra los
> viejos.

## Por qué esto es necesario y no Inbound

Borrar la cadena del **fichero** no la borra del **historial**: sigue en 30
commits, y cualquiera con un clon puede hacer `git log -p` y leerla. Por eso la
rotación y la reescritura son las dos mitades del mismo arreglo: la rotación
invalida el valor, la reescritura quita el texto.

**Y por qué la reescritura es la parte menos urgente.** Las contraseñas
**ya están rotadas** (2026-10-03), así que lo que queda en la historia es un valor
**muerto**: no permite autenticarse. El riesgo residual es el **correo**, que es
PII, y el hecho de que un tag o el caché de GitHub lo hagan legible. Por eso el
orden correcto es: rotar primero, y luego, si hay tiempo, la reescritura.
---

# Rotación de claves API de redes sociales

## Arquitectura, antes de las claves

**El subagente genera borradores; el admin aprueba. Nada se publica solo.**

Un bot que publica solo en la cuenta oficial es un bot que puede borrarla. La
regla es que ninguna credencial de publicacion viva en el repo ni en el prompt de
un modelo: el modelo **redacta**, y la llamada de publicacion la hace el
admin tras leer.

Dónde viven las claves:

| Entorno | Dónde |
|---|---|
| Local | `.env.local` (gitignored) |
| Vercel | Variables de entorno del proyecto, marcadas como **secret** |
| El agente | **Ninguna**. Solo lee el borrador |

## Los tres MCP de terceros: por qué no

Se evaluaron `content-distribution-mcp` (mcpservers.org) y
`onepostly-com-docs-mcp`. **No recomendados**: son intermediarios que se quedan
con el token de publicacion de la cuenta oficial, y pone a un tercero en el camino
de algo que no se puede recuperar si sale mal. Se usan las APIs oficiales.

## Rotación por plataforma

Los nombres exactos de los menús cambian; la estructura no. **La clave es
"revocar y emitir", no "buscar y copiar".**

| Plataforma | Dónde se rota | Qué invalidar además |
|---|---|---|
| **X** | developer.x.com → proyecto → *Regenerate* en Consumer Key/Secret y en el Bearer Token | Contraseña de la cuenta y 2FA |
| **Facebook Page** | developers.facebook.com → app → *Configuración* → *General* → **Generar nueva clave secreta** | El Page Access Token se deriva de ella: revócalo también |
| **Instagram** | Meta for Developers → app de Instagram → regenerar token | Si usas Basic Display, pasa a **Instagram Graph API** |
| **Threads** | Meta for Developers → Threads API → regenerar token | |
| **TikTok** | developers.tiktok.com → My App → *Client Secret* → regenerar | **Revoca el refresh token**: sin eso, los tokens de acceso sobreviven |
| **LinkedIn** | developers.linkedin.com → App → *Settings* → regenerar client secret | |
| **YouTube / Google** | console.cloud.google.com → APIs y servicios → Credenciales → cliente OAuth → regenerar secreto | Cambia la contraseña de la cuenta de Google y el 2FA |
| **Discord** | Portal de desarrolladores → App → Bot → *Reset Token* | |
| **Telegram** | @BotFather → `/revoke` | El token antiguo deja de funcionar al instante |
| **Slack** | api.slack.com/apps → *Basic Information* → *Reset* | Cada token del workspace que cuelgue de él |
| **Reddit** | reddit.com/prefs/apps → editar app → nuevo secreto | |
| **Pinterest** | Business → *Settings* → generar nuevo secreto | |
| **Bluesky** | Ajustes → *App Passwords* → revocar y crear nueva | Cambia la contraseña maestra |
| **Spotify** | developer.spotify.com → dashboard → app → client secret | |
| **Twitch** | Consola de desarrollo → *OAuth Secret* | |

**El orden importa en las plataformas derivadas.** Facebook, Instagram, Threads y
Spotify derivan sus tokens de una clave raíz: **rota la raíz primero, revoca los
derivados después**. Si los revoques antes, se re-emiten con la raíz vieja.

## Después de rotar

1. Verifica que **solo** quedan las variables nuevas en el secret store, y borra
   las viejas de las variables de Vercel (si no, siguen visibles en la consola
   aunque no se usen).
2. Confirma que el agente **sigue sin tener acceso**: las claves no van en
   `.env.local` del repo, ni en el prompt, ni en `.opencode/`.
3. Una publicacion de prueba por plataforma, **hecha a mano** por el admin, para
   confirmar que el flujo funciona con la clave nueva.

---

# Lo que sigue pendiente de la Fase P

Nada de esto bloquea el arranque, pero está escrito para que no se pierda:

- Los **14 vídeos "parecidos"** y los canales `- Topic` de Bowie y Björk esperan
  revisión manual. Se dejaron sin escribir a propósito: 14 IDs aproximados
a mano son peores que ninguno.
- **Cuentas oficiales y subagente de redes**: solo análisis. La implementación es
  la fase siguiente, y depende de que crees las cuentas.
- `deleteUser` **no** borra las sugerencias de ese usuario: decisión de privacidad
  pendiente.
- `POST /api/export` sigue siendo público aunque la UI oculte dossier y rider.
- `lib/resend.ts` quedó huérfano tras P3.
- `formatDuration()` en `lib/null-safe.ts` hace `duration.split()` sin guarda
  contra `undefined`.
