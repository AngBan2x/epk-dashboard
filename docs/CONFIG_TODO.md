# CONFIG TODO — Pendiente (no ejecutar aún)

Decisión usuario (2026-09-23): A+B ejecutados, C queda aquí documentado.

## C8. Deduplicar agentes (opencode.json vs .opencode/agents/*.md)

- Estado: los mismos 29 agentes definidos en **ambos** sitios.
- Los `.md` **no traen `model`** (dependen del JSON); el JSON no trae `prompt`.
- Funciona por merge, pero hay que mantener description/permission en dos lugares.
- Opciones: (a) mover `model` a frontmatter MD y vaciar bloque `agent` del JSON; (b) lo contrario. La skill `customize-opencode` prefiere archivos para lo no-trivial → **(a)** es la dirección natural.

## C9. github MCP vs gh CLI (decisión tomada: gh CLI)

- `github` MCP deshabilitado en `opencode.json` (consume mucho contexto).
- GitHub se opera con `gh` CLI (auth keyring OK: AngBan2x).
- Si algún flujo futuro necesita tools MCP de GitHub, reactivar con token **solo en config global** (`mcp.github.environment`), nunca en el repo.

## C10. MCP deshabilitados en el panel — RESUELTO (RC.32, 2026-09-28)

- Las 9 entradas `enabled: false` (sentry, memory, sequential-thinking, plur,
  novu, strac-dlp, ctxfile y compañía) **se borraron de `opencode.json`**. No
  costaban nada en ejecución —un servidor con `enabled: false` nunca se
  lanza—, pero dejaban una lista en la que reactivar uno era un clic. Los
  motivos de no volver están en `AGENTS.md`, tabla «Qué se quitó y por qué».
- `fetch` se eliminó **porque estaba roto, no porque sobrara**: el paquete
  `@smokei/mcp-fetch` no existe en npm (`404 Not Found`) y no tiene sustituto
  funcional (`mcp-server-fetch` resuelve al marcador `0.0.1-security` de un
  paquete retirado). Parecía sano y por eso era el caro: se lanzaba en cada
  arranque, resolvía por `npx -y` y ahí se caía. Lo que cubría es la tool
  built-in `webfetch`.
- `sqlite` tampoco vuelve: irrecuperable vía `npx` en Windows. Para consultar la
  BD está el custom tool `database-query` y, para el estado real de Turso,
  `scripts/turso-check.ts`.

## C11. visual-tester → modelo openrouter — RESUELTO (RC.32, 2026-09-28)

- Usaba `openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`.
- Ahora usa **`opencode/muse-spark-1.3`**, que acepta imagen, vídeo, PDF y audio
  con 1M de contexto. La razón del cambio: Nemotron quedó **retirado de los
  subagentes por decisión del usuario (2026-09-28)**, por lento; y al retirarlo
  de paso desaparece la necesidad del modelo vision aparte, porque los tres
  modelos que quedan aceptan imágenes.
- La fuente de verdad de los modelos es **`opencode.json`**. Los `.md` de
  `.opencode/agents/` no declaran `model:` a propósito, para que no haya dos
  sitios que mantener sincronizados.

## C12. `cleanup-shows.yml` — PENDIENTE de configurar en GitHub

La ruta `DELETE /api/shows/cleanup` existía desde antes y **nada la invocaba**:
sin cron, los shows pasados no se limpiaban nunca. El workflow
`.github/workflows/cleanup-shows.yml` (cron diario 06:17 UTC + `workflow_dispatch`)
la llama y falla si devuelve otra cosa que `200`.

**Autenticación: no se inventó ningún mecanismo.** La ruta está detrás de
`requireAdmin`, así que el workflow hace `POST /api/auth/login` con las mismas
credenciales de test que ya usan los 12 specs de Playwright y reutiliza la cookie
`auth_session`. No hay secreto nuevo que crear más allá de los que ya existen.

Lo que hay que poner en **Settings → Secrets and variables → Actions**:

| Nombre | Tipo | Estado |
|---|---|---|
| `TEST_ADMIN_PASSWORD` | Secret | **Falta crearlo.** Sin default en el repo, a propósito (`scripts/lib/credentials.ts`) |
| `TEST_ADMIN_EMAIL` | Secret | Opcional: el default del código es `admin@epk.local` |
| `NEXT_PUBLIC_APP_URL` | **Variable** de repositorio (no secreto) | Opcional; si falta, el workflow usa `https://epk-dashboard.vercel.app` |

Mientras `TEST_ADMIN_PASSWORD` no exista, **el primer paso del workflow falla a
deliberado** con un `::error::` que dice cuál falta. Es preferible a un fallo
tarde y críptico al llamar a la API.

⚠️ **Los cron de GitHub se desactivan solos a los 60 días sin actividad** en el
repositorio. Si el workflow deja de correr solo, se reactiva desde la pestaña
*Actions*; no es un fallo del YAML.

## sqlite MCP: por qué `database-query` tampoco es una salida (2026-10-06)

El custom tool `database-query` **no funciona**: el binario de `better-sqlite3`
quedó compilado para `NODE_MODULE_VERSION` 137 y el Node 24 que se usa ahora
pide 146, así que al importar revienta. **No ejecutar `pnpm install` ni
`pnpm rebuild`**: destruyen el binario y no hay prebuild para Node 24.

Dos Workarounds, en orden de preferencia:

1. `npx tsx scripts/<algo>.ts` — lee y escribe la BD real, con los tipos.
2. El MCP de turso — SQL directo contra producción.

Efecto lateral a tener en cuenta: con SQLite local, `next start` se muere con
la asertación nativa `node::RemoveEnvironmentCleanupHook` al tercer render. La
QA visual de paneles de admin **tiene que ir contra producción**.

## Fallback sqlite — RESUELTO vía path B (2026-09-23)

**Diagnóstico con spawn real + handshake MCP:**
1. Spawn directo: `Error: Cannot find module 'ajv'` — caché npx corrupto (`ajv/` sin `package.json`), exit 1 → -32000.
2. Tras borrar caché corrupto: `npx -y mcp-server-sqlite` se atasca 4+ min en warnings EPERM de cleanup + descarga/compilación nativa de better-sqlite3. Servidor nunca arranca.
3. Conclusión: paquete irrecuperable vía npx en Windows → **sqlite MCP deshabilitado** (`enabled: false`, comando conservado para reintentar).
4. Queries locales vía custom tool `database-query` (better-sqlite3 del proyecto, probado OK).
5. Bonus: el paquete tiene bug `verbose: console.log` → corrompe stdout/stdio en la primera query. Otra razón para no usarlo.
