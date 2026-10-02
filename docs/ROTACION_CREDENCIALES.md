# Rotación de credenciales y reescritura de `main`

Guía paso a paso para las tres cosas que quedan de la Fase P. En este orden,
porque **rotar antes de reescribir rompe los tests**, y reescribir antes de rotar
deja el secreto vivo en un solo sitio.

Estado actual: la credencial **ya no está en el código** (P1), pero sigue en el
historial de git en **29 commits**.

---

## Por qué este orden

| Paso | Qué pasa si lo saltas |
|---|---|
| 1. Rotar la contraseña **en la app** | El secreto nuevo no existe en ningún sitio |
| 2. Ponerla en `.env.local` y en el secret store | Los 12 specs de Playwright y los scripts de QA dejan de autenticar |
| 3. Decidir el futuro de `seed-admin.ts` | Si el seed se queda con `admin123`, el **volverá a escribir una contraseña conocida** en cada ejecución |
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
secreto.** `scripts/seed-admin.ts` sigue con `hashSync("admin123")`, y
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

**`git filter-repo` NO está instalado** en esta máquina. Instálalo primero:

```bash
pip install git-filter-repo
# o, sin Python:
#   descarga el .exe de https://github.com/newren/git-filter-repo/releases
#   y ponlo en el PATH
```

Verifica antes de seguir:

```bash
git filter-repo --version   # debe imprimir un número, no "not a git command"
```

Haz **antes** un clon limpio de repuesto, por si algo sale mal:

```bash
git clone --mirror . ../epk-dashboard-respaldo.git
```

**Solo tú tienes el repo abierto**, así que no hay ramas ni clones de otras
personas que se rompan. Aun así, esto reescribe **todos** los hashes.

### Dos opciones

**A. Reescribir el texto (lo recomendado para este caso).** Sustituye la
credencial literal por un marcador en todo el historial:

```bash
git filter-repo --replace-text replacements.txt
```

donde `replacements.txt` contiene:

```
angab06@gmail.com==>TEST_ARTIST_EMAIL@example.invalid
12345678==>TEST_ARTIST_PASSWORD_REDACTED
```

**B. Borrar los ficheros de una vez.** Si solo quieres que el secreto desaparezca
y no te importa conservar cada commit:

```bash
git filter-repo --path scripts/create-test-artist.ts --invert-paths
```

Menos quirúrgico: se pierde el historial de esos ficheros entero. **A** deja la
historia intacta y quita solo la cadena.

Comprueba que ya no está:

```bash
git log --all --oneline -S 'angab06@gmail.com'   # debe dar 0 líneas
git grep -n 'angab06' $(git rev-list --all)      # debe dar 0 líneas
```

## Paso 5 — Forzar el push

```bash
git push --force-with-lease origin main
```

`--force-with-lease` y **no** `--force`: si alguien ha subido algo entre tu
último `fetch` y el push, aborta en vez de pisarlo.

Y en el remoto:

```bash
git tag -l | xargs git push --force --delete origin   # solo si hay tags
```

porque las releases de GitHub apuntan a commits reescritos.

## Por qué esto es necesario y no Inbound

Borrar la cadena del **fichero** no la borra del **historial**: sigue en 29
commits, y cualquiera con un clon puede hacer `git log -p` y leerla. Por eso la
rotación y la reescritura son las dos mitades del mismo arreglo: la rotación
invalida el valor, la reescritura quita el texto.

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
