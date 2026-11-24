# FASE P21 — El pipeline: un gate, dos destinos, deploy por tags

**Período:** 2026-11-12 → (en curso)  **Estado:** en curso
**Rama:** main  **Issue:** (se crea al abrir la fase)  **Commits:** (se completa al cerrar)

> **Qué es esta fase.** El repo tiene un workflow obligatorio en `AGENTS.md` que dice, en su
> primera línea, que *"ningún cambio se considera terminado hasta completar el ciclo entero"*. Y el
> ciclo entero tiene un gate: typecheck, lint, tests, build, E2E y despliegue.
>
> **El gate no existía.** No es que fallara: no se ejecutaba. Y eso no se ve mirando el código, ni
> mirando los tests, ni mirando el build: se ve mirando el historial de GitHub Actions.

## El hallazgo

Al hacer el push de P17 (2026-11-12) la CI falló en **13 segundos**. No era mi cambio: los 100
runs anteriores del workflow también fallaban, todos en el mismo sitio y todos en 9-14 s.

```
ERROR  packages field missing or empty
For help, run: pnpm help store
```

**Cero ejecuciones verdes en todo el historial de GitHub Actions** — ni el deploy ni el cleanup
de shows. El más antiguo de los 100 runs es del **2026-09-30**, y no hay ni uno anterior en verde.

### La causa

`actions/setup-node@v4` con `cache: pnpm` llama a `pnpm store path` para decidir dónde está la
caché. El workflow pedía **pnpm 9**:

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 9
```

Y el repo usa **pnpm 12.5.1**, con un `pnpm-workspace.yaml` que tiene campos de **pnpm 10+**
(`allowBuilds`, `minimumReleaseAgeExclude`).

En pnpm 9, la existencia de un `pnpm-workspace.yaml` **exige** el campo `packages`. En pnpm 10+ es
opcional (y si se omite, solo entra el paquete raíz — que es exactamente este repo). Con pnpm 9,
`pnpm store path` moría antes de instalar nada.

**Dos cosas se habían desalineado sin que nada lo dijera:**

1. El workflow usaba una versión de pnpm escrita a mano, que dejó de ser la del repo.
2. El `pnpm-workspace.yaml` se había actualizado a campos de pnpm 10+ sin que el workflow se
   actualizara.

### Por qué nadie lo notó

Porque **el otro camino de despliegue sí funciona**: Vercel tiene la integración de GitHub y
despliega solo con cada push a `main`. O sea, el código llegaba a producción, el sitio respondía,
los tests en local pasaban, y el gate —que era lo único que faltaba— no se ejecutaba.

Eso es exactamente la clase de fallo que el repo ya sabe nombrar: **una comprobación que siempre
pasa**. El gate no era un gate; era un paso que nadie miraba porque siempre salía verde… de no
existir.

Y tiene una consecuencia que se ve en el historial: **28 commits sin tag** desde `v4.0.0-rc.36`.
Un release sin CI verde detrás es un release sin gate, y por eso no se han hecho.

## El arreglo

La versión de pnpm se declara en **un sitio**, el `engines.pnpm` de `package.json`:

```json
"engines": {
  "node": ">=24",
  "pnpm": ">=12 <13"
}
```

Y el workflow pide **la major**, no un número escrito a mano:

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 12
```

pnpm **avisa** si la versión no cumple el rango, así que una desalineación se ve en el install, en
vez de descubrirse tres semanas después.

### ⚠️ El camino obvious, y por qué no era el bueno

Lo primero que se piensa es `packageManager: "pnpm@12.5.1"` en `package.json` —el "pin" de
corepack— y **es lo que se hizo primero**. En pnpm 12 ese campo **no** es un pin: es el gestor de
dependencias del gestor. Añadirlo:

1. Convierte el lockfile en un **doble documento YAML**, con 157 líneas de binarios de pnpm para
   todas las plataformas (`@pnpm/exe.android-arm64`, `@pnpm/exe.win32-x64`…). El lockfile de este
   repo es de un solo documento (`lockfileVersion 9.0`) y así se queda.
2. Rompe la CI con `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE`: el lockfile del repo no
   estaba al día, y regenerarlo exige un `pnpm install` — que este repo **no puede ejecutar**
   sin destruir el binario de `better-sqlite3` (ver AGENTS.md).

La lección es la de siempre en este repo: **el camino que parece correcto porque es el
documentado en otro sitio no es el que funciona aquí.** El "pin" de corepack es una cosa y el
`packageManager` de pnpm 12 es otra, con el mismo nombre.

### Lo que este arreglo NO arregla

Siguen rotos, y son las tareas de esta fase:

- Los **E2E de la CI corren contra Turso de producción** (el step les pasa `TURSO_DATABASE_URL` y
  `TURSO_AUTH_TOKEN`, y `webServer` levanta `pnpm dev` con esas credenciales). La suite **escribe
  en la base de datos de producción**.
- Los E2E levantan `next dev`, no `next start`: **no prueban el bundle** que se acaba de construir.
- `main` despliega a **producción** en cada push, sin ventana de aprobación.
- El gate está en **cuatro sitios** (skill `run-quality-gates`, tool `quality-gates`,
  `package.json` y la CI) y ya han divergido.
- El cron de limpieza de shows **no corre**: falta el secreto `TEST_ADMIN_PASSWORD`, y el
  `NEXT_PUBLIC_APP_URL` que el workflow exige no está puesto.

## Checklist

| # | Tarea | Estado | Commit | Evidencia |
|---|-------|--------|--------|-----------|
| P21.0 | **La CI arranca**: alinear la versión de pnpm con la del repo y dejar de escribirla a mano | ✅ hecha | — | `engines.pnpm` en `package.json` + `pnpm/action-setup` con `version: 12`. Install ✓ typecheck ✓ lint ✓ en el run `43258873008` |
| P21.0b | **Los dos tests que mataban el worker**: `scripts/meta-long-lived-token.ts` y `scripts/threads-token.ts` ejecutaban su `main()` al importarse, y sin credenciales (que la CI no tiene) el `process.exit(1)` mataba vitest | ✅ hecha | — | El patrón `invokedDirectly` que ya tenían 7 scripts. Verificado **simulando la CI** (sin `.env.local`): 31/31 verdes, antes moría |
| P21.0c | **El gate dice la verdad**: check previo que falla en el segundo 2 si falta `TEST_ADMIN_PASSWORD`, y un `globalSetup` que informa de las credenciales que faltan | ✅ hecha | — | Antes: 45 tests con "login -> 400" y luego 429, tras 53 min. El rate limit de login es de 5/min **por IP** y la CI comparte IP, así que los reintentos se bloquean a sí mismos |
| P21.1 | **Un solo gate**: `pnpm gate` = typecheck + lint + `vitest run --no-file-parallelism` + build, y que la skill, el tool, `package.json` y la CI llamen al mismo script | ⬜ pendiente | — | — |
| P21.2 | **E2E completos en local y en producción**: local con SQLite + `next start` (el build real); producción contra Turso, con la limpieza automática al final | ⬜ pendiente | — | — |
| P21.3 | **La limpieza al final de la corrida**: `qa-cleanup.ts --apply` en el mismo job. Sus patrones casan con lo que los specs producen (`@example.com`, `"QA …"`, `[QA]`/`[E2E]`/`[TEST]`) | ⬜ pendiente | — | — |
| P21.4 | **Deploy por tags**: `push` a `main` → preview; tag `v*` → producción | ⬜ pendiente | — | — |
| P21.5 | `scripts/danger/` para los 10 scripts que escriben sin dry-run, todos con `--apply` obligatorio | ⬜ pendiente | — | — |
| P21.6 | **Crear el secreto `TEST_ADMIN_PASSWORD`** (sin él el cron no corre **y** los E2E de la CI fallan) + alinear `docs/CONFIG_TODO.md` C12 | ⬜ pendiente | — | **Es de la persona**: un secreto del secret store. El workflow ya lo comprueba y dice qué falta |
| P21.7 | Verificar `tracks.created_at` en Turso real (`scripts/turso-check.ts`): no está en el schema de `lib/turso.ts` y 3 consultas ordenan por ella | ✅ hecha | `042e6c4` | **Confirmado y arreglado.** Via MCP turso: la columna **existe** en `epk-dashboard` (vino de un origen anterior al schema) pero **no** estaba en el `CREATE TABLE` de `lib/turso.ts` → una DB nueva habría reventado con `no such column` en `lib/db.ts:2463`, `:2471` y `:2579`. 74 de 83 tracks con `created_at` en `NULL`. Añadida al `CREATE TABLE` + `ALTER` idempotente |
| P21.8 | Migrar `app/api/admin/users/[id]/role/route.ts:58-63` al patrón único (`getTursoClientSync()`) | ⬜ pendiente | — | — |
| P21.9 | **El modelo por defecto de `build` ya no existe**: `opencode/minimax-m3.1-flash-free` → `Error: Model unavailable`. Bajar los **33 ids de modelo** copiados a mano a **uno** (los 32 agentes heredan; solo `visual-tester` lleva el suyo) | ✅ hecha | — | `opencode run --model opencode/minimax-m3.1-flash-free` → `Error: Model unavailable`. `opencode run` con el nuevo → `> build · nemotron-3.5-super-vl-free` → `OK`. `opencode debug config`: 31 agentes heredan, 1 con model propio |
| P21.10 | **MCP `git` no conectaba**: el servidor habla `2026-07-28` y OpenCode mandaba el `initialize` de `legacy` | ✅ hecha | — | Log: *"connection is serving the 2026-07-28 protocol; the initialize handshake is not accepted"*. El campo `protocol` **no se aplicaba** hasta migrar `mcp` a la forma V2 (`mcp.servers`): la doc dice *"V2 does not place server names directly under `mcp`"*. Ahora `opencode mcp list` → `✓ git connected` (14 tools) |
| P21.11 | **MCP `turso` no completaba el OAuth**: rechazaba el `redirect_uri` | ✅ hecha | `4bbc80a` | El `client.json` de OpenCode solo lista 3 redirect **sin puerto**; OpenCode manda uno **con** puerto y Turso responde *"not permitted for this client"*. Arreglo: `oauth.callback_port` + `oauth.redirect_uri` fijos. **El log lo prueba**: antes `registration=cimd` → `401`, después `registration=dcr` → `authorization completed` → `mcp connected tools=18`. `opencode mcp list` → **7/7 connected**, y query real contra `epk-dashboard` (11 tablas, 20 usuarios, 83 tracks) |
| P21.12 | **El preflight solo mira 1 de 3 roles**: ampliar `deploy.yml` a `TEST_ARTIST_EMAIL` + `TEST_ARTIST_PASSWORD` (6 specs las necesitan y `TEST_ARTIST_EMAIL` no tiene default: es PII) | ✅ hecha | `042e6c4` | Medido 2026-11-24: solo comprobaba `TEST_ADMIN_PASSWORD`. Ahora comprueban los **tres a la vez** y listan **todos** los que falten en un solo run (fallar de uno en uno costaría 3 corridas para decir lo mismo). Las dos variables añadidas también al `env` del step de E2E |
| P21.13 | **`CONFIG_TODO.md` C12 contradice al workflow**: dice que `NEXT_PUBLIC_APP_URL` es opcional y `cleanup-shows.yml` lleva 12 días fallando por no tenerla | ✅ hecha | `042e6c4` | `C12` decía *"Opcional; si falta usa la URL por defecto"*; el workflow la **exige a propósito** porque hace un `DELETE` real en producción. Corregido con la advertencia de por qué el default se quitó |
| P21.14 | **La CI escribe en Turso de producción**: paso de `qa-cleanup.ts --apply` al final del job de E2E | ✅ hecha | `042e6c4` | Dry-run del 2026-11-24 contra `epk-dashboard`: **10 usuarios QA** acumulados (0 tracks, 0 shows). Paso con `if: always()`: la corrida **roja** es la que más basura deja, así que limpiar solo en verde no sirve |
| P21.15 | **Rate limit de login: contar intentos fallidos**, no todos (hoy 5 intentos fallidos desde una IP bloquean a un usuario legítimo detrás de la misma NAT — el límite se aplica antes de validar la contraseña) | ✅ hecha | `042e6c4` | `checkRateLimit` gana `options.count` (**default `true`**, para no tocar al resto de llamantes) y `registerFailedAttempt` castiga el fallo del cliente (400/401/403), **no** el 500. `tests/unit/login-rate-limit.test.ts` (7 tests). **Validado por mutación**: quitando `{count:false}` de la ruta, **4 de 7** se ponen rojos |

## Criterio de cierre

Un push a `main` ejecuta typecheck, lint, los tests y el build **en verde**, sin escribir nada en
Turso, y **no** despliega a producción. Un tag `v*` despliega a producción. Y existe un solo
comando que hace lo mismo que la CI, en local.

## Dónde está la CI ahora mismo

### Medición 2026-11-12 (al abrir la fase)

| Step | Estado |
|------|--------|
| `pnpm install --frozen-lockfile` | ✅ |
| `pnpm typecheck` | ✅ 0 errores |
| `pnpm lint` | ✅ 0 avisos |
| `pnpm test:unit` | ✅ **1856 tests / 93 ficheros** |
| `pnpm build` | ✅ |
| Instalar el navegador de Playwright | ✅ (el step no existía) |
| **Comprobar las credenciales de los E2E** | ❌ **Falta `TEST_ADMIN_PASSWORD`** — y ahora lo dice en el segundo 2, en vez de 45 tests con "login -> 400" tras 53 minutos |
| E2E (Playwright) | ⛔ No se llega: 102 pasaron y 45 fallaron en la corrida anterior, todos por el mismo secreto ausente |
| Deploy a producción | ⛔ No se llega |

**Antes de esta fase, la CI no se ejecutaba: 0 ejecuciones verdes en todo el historial.** Ahora
ejecuta, y su único punto rojo es **un secreto que solo la persona puede crear** (P21.6).

### Re-medición 2026-11-24 (12 días después)

El estado **no ha cambiado**: sigue habiendo **606 runs y 0 verdes**. Lo nuevo es que ahora se
sabe *por qué* cada uno falla, y hay tres hallazgos que esta fase no tenía:

| Hallazgo | Detalle |
|----------|---------|
| **El preflight solo mira 1 de 3 roles** | `deploy.yml` comprueba `TEST_ADMIN_PASSWORD`, pero **6 specs E2E necesitan credenciales de artista** (`TEST_ARTIST_EMAIL` no tiene default: es PII). El día que se cree el secreto de admin, los specs de artista seguirán fallando — y el preflight seguirá diciendo verde |
| **`CONFIG_TODO.md` C12 miente** | Dice que `NEXT_PUBLIC_APP_URL` es *opcional*; el workflow la exige y `cleanup-shows.yml` lleva **12 días fallando** por no tenerla. Una doc que contradice al código no es documentación, es una trampa |
| **La CI escribe en Turso de producción** | El job de E2E levanta `pnpm dev` con `TURSO_*` inyectados → los tests crean datos reales en la DB de producción y **no hay paso de `qa-cleanup --apply`** después. 12 días de runs fallidos no han llegado a ejecutarlo, así que el daño es latente, no activo |

Y un cuarto, de configuración de OpenCode (P21.9–P21.11): el **modelo por defecto del agente
`build` ya no existe**, el MCP `git` no conectaba y el `turso` no completa el OAuth. Los tres
arreglados en este mismo pase.

### Lo que falta para cerrarla

Todo lo que era **código** ya está hecho. Lo que queda es **de la persona**, y no hay atajo:
son secretos y variables de GitHub, que solo se crean desde el navegador.

1. **Crear el secreto `TEST_ADMIN_PASSWORD`** en *Settings → Secrets and variables → Actions →
   Secrets*. Es la cuenta `admin@epk.local` de producción, cuya contraseña se rotó en la rotación de
   credenciales (`docs/ROTACION_CREDENCIALES.md`).
2. **`TEST_ARTIST_EMAIL` y `TEST_ARTIST_PASSWORD`** — el preflight ya los pide (P21.12). Sin ellos
   la CI sigue en rojo **aunque el de admin exista**, porque 6 specs hacen login como artista.
   `TEST_ARTIST_EMAIL` no puede tener default en el repo: es PII de una persona real.
3. **Variable `NEXT_PUBLIC_APP_URL`** para que `cleanup-shows.yml` deje de fallar (12 corridas
   seguidas). La doc ya no dice que es opcional (P21.13); el workflow la exige a propósito.
4. ~~Paso de `qa-cleanup --apply`~~ ✅ hecho (P21.14).
5. ~~Rate limit: contar solo los fallos~~ ✅ hecho (P21.15). Con esto los E2E no deberían chocarse
   entre sí por compartir IP: un login válido ya no gasta cuota.
6. `TEST_SUBSCRIBER_*` **no hacen falta**: esos specs se auto-registran.

> **Por qué estos cuatro no se pueden hacer desde aquí.** Un agente no puede escribir en el
> secret store de GitHub: `gh secret set` pediría el valor, y el valor es una contraseña real que
> no está ni debe estar en esta conversación. Lo único que de este lado se puede es que el
> workflow **diga** qué falta — que es lo que hace desde P21.6.

## Lo que se hizo

_(se rellena con commit y salida literal de puerta a medida que avanza)_
