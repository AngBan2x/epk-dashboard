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
| P21.1 | **Un solo gate**: `pnpm gate` = typecheck + lint + `vitest run --no-file-parallelism` + build, y que la skill, el tool, `package.json` y la CI llamen al mismo script | ⬜ pendiente | — | — |
| P21.2 | **E2E completos en local y en producción**: local con SQLite + `next start` (el build real); producción contra Turso, con la limpieza automática al final | ⬜ pendiente | — | — |
| P21.3 | **La limpieza al final de la corrida**: `qa-cleanup.ts --apply` en el mismo job. Sus patrones casan con lo que los specs producen (`@example.com`, `"QA …"`, `[QA]`/`[E2E]`/`[TEST]`) | ⬜ pendiente | — | — |
| P21.4 | **Deploy por tags**: `push` a `main` → preview; tag `v*` → producción | ⬜ pendiente | — | — |
| P21.5 | `scripts/danger/` para los 10 scripts que escriben sin dry-run, todos con `--apply` obligatorio | ⬜ pendiente | — | — |
| P21.6 | Crear el secreto `TEST_ADMIN_PASSWORD` (sin él el cron no corre) + alinear `docs/CONFIG_TODO.md` C12 | ⬜ pendiente | — | — |
| P21.7 | Verificar `tracks.created_at` en Turso real (`scripts/turso-check.ts`): no está en el schema de `lib/turso.ts` y 3 consultas ordenan por ella | ⬜ pendiente | — | — |
| P21.8 | Migrar `app/api/admin/users/[id]/role/route.ts:58-63` al patrón único (`getTursoClientSync()`) | ⬜ pendiente | — | — |

## Criterio de cierre

Un push a `main` ejecuta typecheck, lint, los tests y el build **en verde**, sin escribir nada en
Turso, y **no** despliega a producción. Un tag `v*` despliega a producción. Y existe un solo
comando que hace lo mismo que la CI, en local.

## Lo que se hizo

_(se rellena con commit y salida literal de puerta a medida que avanza)_
