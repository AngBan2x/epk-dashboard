# EPK Dashboard Musical — PressPlay

> "Donde la música se presenta" — Electronic Press Kit platform

## Comandos del Proyecto

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | **NO usar npm run dev** (styled-jsx se resuelve mal via .pnpm) |
| `npx tsc --noEmit` | Typecheck |
| `pnpm build` | Build producción |
| `npx vitest run --no-file-parallelism` | **1146 tests** (Vitest, 61 archivos). Correr con **Node 24**: el binario de `better-sqlite3` quedó compilado para ABI 137, así que el Node 22 portable ya NO sirve. `testTimeout` está a 30 s porque contra Turso hay queries de 1,5-2 s y con 5 s daba falsos negativos. **No ejecutar `pnpm rebuild` ni `pnpm install`** (destruye el binario y no hay prebuild para Node 24) |
| ⚠️ `--no-file-parallelism` no es opcional | Sin él, el reciclado de workers dispara una asertación nativa de teardown de V8 (`node::RemoveEnvironmentCleanupHook`, `(env) != nullptr`) y el run muere con `ERR_IPC_CHANNEL_CLOSED`. **No es un test rojo**: los 1146 pasan. Se dispara desde que los ficheros superpower cargan un módulo nativo (`better-sqlite3`, vía `@/libsql/client`) a través de un route handler, y el hook de limpieza nativo se ejecuta con el isolate ya destruido. Verificado: excluyendo solo `tests/unit/official-videos.test.ts` el run en paralelo vuelve a ser verde; bajando concurrencia a 2 workers también crashea. Secuencial: 1146/1146, ~65 s. Aislado es un problema de **infraestructura de test**, no de producto |
| `npx playwright test` | E2E (Playwright). Suites por fase: subscriber, subscriptions, notifications, approvals, shows-transitions, fanout, search, broadcast. Usa `PLAYWRIGHT_BASE_URL=https://epk-dashboard.vercel.app` para correr contra producción |
| `npx tsx scripts/turso-check.ts` | Verifica la higiene de datos en Turso por SQL directo (tracks, shows, usuarios QA, huerfanos). Es la fuente de verdad, no las lecturas de API (la réplica va retrasada) |
| `npx tsx scripts/qa-cleanup.ts --apply` | Limpia datos de QA de producción. **Dry-run por defecto**: siempre revisa el dry-run antes de aplicar |
| `npx next lint` | ESLint. Debe salir sin warnings (P7) |
| `npx tsx scripts/a11y-check.ts` | Controles sin etiqueta, anillo de foco y áreas táctiles |
| `npx tsx scripts/axe-check.ts` | Barrido WCAG AA con axe sobre las rutas públicas |

## Stack

- **Framework**: Next.js 14 (App Router), TypeScript 5 strict
- **Styling**: Tailwind CSS, Framer Motion
- **Charts**: Recharts
- **DB**: better-sqlite3 + @libsql/client (Turso dual-mode)
- **Auth**: bcryptjs 3.x, httpOnly session cookie
- **Email**: Resend
- **Testing**: Vitest + Playwright
- **Package manager**: **pnpm** (no npm)

## Arquitectura

```
app/
├── api/           # Route Handlers (REST)
│   ├── artists/me/    # GET/PATCH perfil artista
│   ├── releases/      # CRUD releases
│   ├── shows/         # CRUD shows
│   ├── auth/          # Login
│   └── admin/         # Admin routes
├── dashboard/     # Artist dashboard
├── profile/       # Profile management
├── account/       # Account settings
├── releases/new/  # Create release
└── admin/         # Admin panel
components/        # UI components
context/           # React Context (AudioPlayer, Theme)
lib/               # Utilities (db.ts, turso.ts, web-audio.ts)
tests/             # Vitest + Playwright
```

## Branding

- **Nombre**: PressPlay (NO EPK Dashboard)
- **Logo**: `components/icons/PressPlayLogo.tsx`
- **Paleta**: Indigo (#4f46e5), Violet (#8b5cf6), Pink (#ec4899), Emerald (#10b981)

## Auth

- bcryptjs 10 rounds, httpOnly session cookie (HMAC-SHA256 signed via `lib/auth.ts`, backward-compatible con tokens viejos)
- **Roles**: artist, admin, subscriber. **Desde P6 el registro público crea solo `subscriber`** (se eliminó el selector de artista); la promoción a `artist` ocurre al aprobar su primer release o show, en `POST /api/admin/approvals/[id]` vía `lib/artist-promotion.ts` (idempotente). Un suscriptor SÍ puede entrar a crear releases/shows: siempre quedan `pending`/`approved=false`.
- **Admin credentials**: admin@epk.local / <CONTRASENA_ROTADA>
- Token: `{ userId, role, iat, exp, invalidateSessionBefore? }` — **`exp` siempre presente** (24 h, o 30 días con rememberMe); `invalidateSessionBefore` + `reissueSessionToken` permiten invalidar sesiones tras un cambio de rol, con compatibilidad hacia atrás con tokens antiguos.
- **Cuentas suspendidas (P7)**: `users.deleted_at` bloquea el login (403 `ACCOUNT_SUSPENDED`), invalida la sesión en `/api/auth/me` y saca al usuario del fan-out. Se recupera con `PUT /api/user/settings` (email + contraseña) dentro de 30 días; `purgeExpiredDeletedUsers()` hace la purga.
- **Aprobaciones (P6)**: `submissions` es el portal del artista (solo lo propio, sin escritura de decisiones) y `approvals` es la consola admin (escritor único `POST /api/admin/approvals/[id]`, motivo mínimo de 10 caracteres validado en backend, `revision` y auditoría).

## Base de Datos

- **Dual-mode**: Turso (producción) o SQLite local (dev)
  - **11 tablas**: users, artists, tracks, releases, shows, submissions, metrics_history, notifications, subscriptions, likes, suggestions (`tracks.admin_notes` y `track_submissions` con `admin_id`/`reviewed_at` añadidos en P4.5; `suggestions` en Fase P — buzón anónimo, ver abajo)
  - **Cascadas (P6)**: `deleteArtist` y `deleteUser` borran dependencias (suscripciones, dossiers, shows, tracks por `artist_name` y sus `metrics_history`/`likes`). `tracks` se relaciona por nombre, no por FK: por eso el borrado va por `artist_name`. ⚠️ `deleteUser` **no** borra las sugerencias de ese usuario: es deliberado (el buzón es anónimo, `user_id` es nullable sin FK) pero está pendiente de decisión de privacidad.
  - **Scripts de datos**: `scripts/seed-influential-catalog.ts` (P5.2, **NO aplicado en prod**), `scripts/backfill-artist-owners.ts` (6 de 7 artistas siguen con `user_id` NULL) y `scripts/qa-cleanup.ts`. Los tres con dry-run por defecto y `--apply` para escribir. **RC.33 withdrawing**: `scripts/fetch-official-videos.ts` y `scripts/apply-artist-images.ts` (Wikimedia, dry-run + `--apply`) — ya aplicados solo sobre allowlist.
- `lib/db.ts` — Funciones de negocio
- `lib/turso.ts` — Client Turso + schema migrations
- ⚠️ **`vitest.config.ts:7-8` (los dos `delete process.env.TURSO_*`) es lo que protege Turso en los tests. NO los borres.** Parecen higiene de test y no lo son: bajo vitest el env está ausente, así que `isTursoEnabled()` es falso y los **83 guards `if (isTursoConfigured()) return;` nunca saltan** — están muertos. Si se restaura el env, cualquier import mal resuelto pasa de latente a destructivo: `createUser()` (que sí usa el predicado de tiempo de llamada) escribiría filas de QA en producción, y el fallo sería **verde**. Si alguna vez hay que tocar ese fichero, verifica los conteos con `scripts/turso-check.ts` antes y después.
- **REGLA (corregida en RC.31)**: usar funciones de `lib/db.ts` en vez de SQL suelto en API routes. Y cuando una ruta necesite SQL propio, la decisión de backend se toma con **UNA sola fuente de verdad**: ramificar sobre `getTursoClientSync() !== null`, que devuelve `null` si y solo si `isTursoEnabled()` es falso y lee `process.env` en **tiempo de llamada**. El handle local (`getLocalDb()` para leer, `getLocalDbWrite()` para escribir) se abre **solo en el brazo sin cliente**, nunca antes.
  - **Por qué cambió**: la regla anterior ("nunca `getDbWrite()` en una ruta API") era inejecutable. Sin Turso no hay handle de escritura, así que prohibirlos a todos dejaba las rutas de escritura sin forma de degradar. Lo que estaba mal no era el handle, era **la forma de decidir quién lo abre**.
  - **El patrón roto que sustituye** (GAP-B): ramificar con `isTursoConfigured()` de `@/lib/db` (lee `process.env` al llamar) y ejecutar con `getTursoClient()` de `@/lib/turso` (lee el env al **importar**, `lib/turso.ts:31-32`). Con el env cargando tarde —el caso normal en un bundle de Vercel— la primera decía "turso" y la segunda `null`, se lanzaba y la ruta respondía **500**. Ya no queda ninguna ruta con este patrón.
  - **`getDbWrite()` / `getLocalDbWrite()` siguen siendo legítimos** en un **script** (`scripts/*`, que necesita escribir sí o sí) y en el camino local de una ruta, siempre detrás del `getTursoClientSync() === null`. Lo prohibido es usarlos como fuente de decisión.
  - **Deuda conocida**: `lib/artist-promotion.ts:139` sigue llamando `getDbWrite()` en el camino de aprobación de releases y shows. Funciona porque lo protege un `isTursoEnabled()`, pero es el patrón anterior y merece su propia ola.

## Fase P — invariantes que no se pueden romper

Las cuatro subfases estan en `docs/PHASE_P7.md` … `docs/PHASE_P10.md`, y el
indice de todas las fases en `docs/PHASES.md`. **La numeracion P1-P6 ya estaba
ocupada** por otros documentos (`PHASE_P3.md`, `PHASE_P4.md`, `PHASE_P5.md`,
`PHASE_P6.md`), asi que estas empiezan en P7: no las renumeres. Lo que sigue son
las decisiones que, si alguien las revierte sin saber por que, rompe algo en silencio.

### P7 - las credenciales de test no tienen default

`scripts/lib/credentials.ts` es la **única** definición; `tests/e2e/credentials.ts`
es un reexport puro (un test ata la identidad de la función: si alguien copia la
lógica, se rompe).

**Contraseñas con default `""`, correos con default solo si no son PII ni secreto.**
`TEST_ADMIN_EMAIL` default `admin@epk.local` (dominio inventado); `TEST_ARTIST_EMAIL`
**sin** default, porque la única cuenta de artista conocida es de una persona real.
Un default con la credencial real sería un cambio cosmético: el secreto sigue en el
repo.

`playwright.config.ts` **debe** hacer `dotenv.config({ path: ".env.local" })` antes de
`defineConfig`: Playwright no hereda la carga de Next, y sin eso los 12 specs E2E
leen `undefined`.

⚠️ **`scripts/seed-admin.ts` sigue con `hashSync("CONTRASENA_ADMIN_ROTADA")` y es una decisión
pendiente, no un olvido.** Si el admin de producción se rota, el seed debe leer del
entorno y fallar sin `TEST_ADMIN_PASSWORD` en vez de crear una cuenta con una
contraseña que nadie conoce.

### P8 - `/track/[id]` es un shim de 301, no una segunda puerta

Un single es fila de `tracks` **y** cabecera de release con el **mismo id**
(`getReleaseWithTracks` = `getTrackById` + `getTracksByReleaseId`, sin tabla
aparte). Por eso `/track/<id>` y `/releases/<id>` son la misma página y solo queda
una: la de release. Las cuatro salidas de `resolveTrackRoute` son `missing`,
`release`, `orphan` (hija sin padre: se renderiza **con aviso**, no 404) y `track`,
que es rama de seguridad inalcanzable hoy.

**`"00:00"` es el relleno del seed, no un disco de cero segundos.** `sumDurations`
lo parsea bien y devuelve `{seconds: 0}`, así que ningún `isNaN` salta: el filtro
compara contra el relleno.

**`parseTrack` sigue sin exportar a propósito.** `lib/releases.ts` compone
`getTrackById` + `getTracksByReleaseId`: 2 consultas donde bastaría 1, pero **una
sola fuente de parseo**. Un `SELECT *` reconstruido a mano divergiría del original
— y divergiría el nuevo, que es el que se ve en producción.

### P9 - el correo tiene tres estados, no dos

`sent` / `failed` / **`not_attempted`**. "No se intentó" ≠ "falló": sin `FROM_EMAIL`
no hay llamada, y contarlo como fallo haría que el panel dijera que se perdieron
correos que nadie iba a mandar.

`RESEND_SMOKE=1` es la **única** puerta al envío real, y sin dominio verificado solo
funciona `onboarding@resend.dev` → **solo** `RESEND_SMOKE_TO` (a otra dirección es un
403 garantizado). Hay un test que ata `RESEND_SMOKE !== "1"` a "desactivado". El
smoke es **script, no spec**, porque gasta cuota real de Resend.

⚠️ **`lib/resend.ts` está huérfano** y conserva el patrón de env en ámbito de módulo
(`resend.ts:3-4`), el mismo que RC.32 rompió en `lib/turso.ts`.

### P10 - el buzon no distingue cual capa rechazo

Las cinco capas viven en el **servidor**: honeypot `empresa`, tiempo de formulario
(≥2 s), rate limit por IP (10/h), **1 por correo cada 24 h** y topes de longitud.
Las cuatro de descarte devuelven **exactamente el mismo 201 `{ok:true}`**: si
distinguieran, un bot solo tendría que recorrerlas en orden. La única excepción es
el **429**, porque quien comparte IP con media oficina y se bloquea sin explicación
no tiene forma de saber que tiene que esperar.

`ip_hash` es un **HMAC con `SESSION_SECRET`**, no un SHA: el espacio IPv4 son 2³²
valores y un SHA suelto *es* la IP con tres pasos de más.

El límite duro es el de **correo**, no el de IP: castiga más al spam y no castiga a
quien comparte NAT. `scripts/turso-check.ts` tiene un check de
`suggestions_email_duplicado_en_24h` **porque los tests corren contra SQLite, no
contra Turso** — si esa capa falla en producción, los tests no lo ven.

El aviso al admin es **best-effort**: se escribe primero y se avisa después. Un 502
de Resend no puede llevarse por delante el mensaje de alguien que solo quería
reportar un problema.

## Reglas de Delegación (CRÍTICO)

Cuando el usuario reporte un bug o pida un fix:

1. **Evaluar complejidad**: ¿Es un cambio de 1-5 líneas o una feature nueva?
2. **Si es simple** (1-5 líneas, 1-3 archivos): Ejecutar directamente
3. **Si es complejo** (>5 líneas, >3 archivos): Delegar a subagente especializado
4. **Siempre en paralelo**: Usar `task()` con múltiples subagentes cuando los fixes son independientes
5. **NUNCA** hacer fixes directos sin considerar si un subagente es más adecuado

## Subagentes Disponibles (29)

> **Configuración centralizada en `opencode.json`** — Los markdown files en `.opencode/agents/` son referencia de documentación.

### Modelos Utilizados

> Investigación 2026-09-28 (models.dev API + `opencode models`). Tiers gratuitos recogen datos para mejora salvo indicación — **nunca poner secretos (tokens, keys, PII) en prompts**.

**Nemotron retirado de los subagentes por decisión del usuario (2026-09-28): son demasiado lentos.** Solo quedan 3 modelos:

| Modelo | Contexto | Input | Cantidad | Uso principal |
|--------|----------|-------|----------|---------------|
| `opencode/space-bunny-free` | 1M | text, image, video | 18 | Orquestación, reasoning, APIs, DB, auth, security, testing, y el agente interno `compaction` |
| `opencode/mimo-v2.6-flash-free` | 200K | text, image, audio, video | 8 | Builders UI, y `small_model` para títulos |
| `opencode/muse-spark-1.3` | 1M | text, image, video, pdf, audio | 4 | `visual-tester` (ver screenshots), deploy, releases y documentación |

**Los 3 aceptan imágenes**, así que `visual-tester` ya no necesita el modelo vision de Nemotron. `opencode/nemotron-3-ultra-free` además era **solo texto** (sin imagen), por lo que nunca servía para análisis visual.

### Compaction

Configurado en `opencode.json`: `auto: true`, `prune: true`, `reserved: 20000`.

**No existe un umbral en porcentaje.** El esquema (`https://opencode.ai/config.json`) solo admite `auto`, `prune`, `tail_turns`, `preserve_recent_tokens` y `reserved`; y es **global**, no por agente (`AgentConfig` no acepta `compaction`). `reserved` son **tokens absolutos**, no porcentaje.

Con `reserved: 20000` la compactación salta al **90% del modelo de 200K** (mimo, el que más se usa) y al **98% de los de 1M**. Para 90% en los de 1M haría falta `reserved: 100000`, pero eso dejaría a mimo compactando al 50% y lo volvería inusable.

### Banco de pruebas (NO asignar sin evaluar con evidencia)
`qwen3-coder-30b-a3b`, `devstral-2512`, `qwen3.8-27b`, `gemini-2.5-flash` (todos $0 OpenRouter, code-capables).

### No asignar
`ling-3.0-flash-fin` (dominio financiero), `jev-*` (no es chat, decisiones estructuradas), nada pago (`kimi-k2.7-code`, `deepseek-v4-flash`, `muse-spark-1.2`, `kimi-k2.7-code-highspeed` son de pago).

### Builders (17)
| Subagente | Modelo | Uso |
|-----------|--------|-----|
| `api-builder` | space-bunny-free | Endpoints REST |
| `auth-builder` | space-bunny-free | Autenticación |
| `dashboard-builder` | mimo-v2.6-flash-free | UI/Components |
| `db-builder` | space-bunny-free | Schema DB |
| `landing-page-builder` | mimo-v2.6-flash-free | Landing page |
| `header-builder` | mimo-v2.6-flash-free | Header |
| `epk-card-builder` | mimo-v2.6-flash-free | EPK Cards |
| `carousel-builder` | mimo-v2.6-flash-free | Carousels |
| `approval-workflow-builder` | space-bunny-free | Aprobaciones |
| `show-form-builder` | space-bunny-free | Shows |
| `notification-builder` | space-bunny-free | Notificaciones |
| `search-builder` | space-bunny-free | Búsqueda |
| `subscriber-builder` | space-bunny-free | Suscriptores |
| `social-links-builder` | mimo-v2.6-flash-free | Links sociales |
| `account-settings-builder` | space-bunny-free | Configuración cuenta |
| `release-form-builder` | space-bunny-free | Formularios releases |
| `artist-dashboard-builder` | mimo-v2.6-flash-free | Dashboard artista |

### QA & Security (3)
| Subagente | Modelo | Uso |
|-----------|--------|-----|
| `quality-auditor` | space-bunny-free | Tests E2E |
| `visual-tester` | muse-spark-1.3 | Screenshots/DOM |
| `security-auditor` | space-bunny-free | Seguridad |

### DevOps & Docs (3)
| Subagente | Modelo | Uso |
|-----------|--------|-----|
| `release-manager` | muse-spark-1.3 | Releases |
| `vercel-deployer` | muse-spark-1.3 | Deploy Vercel |
| `doc-writer` | muse-spark-1.3 | Documentación |

### Orchestration (2)
| Subagente | Modelo | Uso |
|-----------|--------|-----|
| `orchestrator` | space-bunny-free | Coordinación general |
| `fase-orchestrator` | space-bunny-free | Orquestación por fases |

### Testing (2)
| Subagente | Modelo | Uso |
|-----------|--------|-----|
| `playwright-tester` | space-bunny-free | Tests E2E |
| `api-tester` | space-bunny-free | Testear endpoints |

### Database (1)
| Subagente | Modelo | Uso |
|-----------|--------|-----|
| `db-migrator` | space-bunny-free | Migraciones DB |

### Branding (1)
| Subagente | Modelo | Uso |
|-----------|--------|-----|
| `brand-fixer` | mimo-v2.6-flash-free | Branding |

## Comandos Personalizados (7)

| Comando | Descripción |
|---------|-------------|
| `/fase` | Ejecuta una fase completa del MASTER_PLAN.md |
| `/renderizar_epk` | Genera componente EPKCard |
| `/fix-bug` | Investigar y arreglar bug |
| `/quality-gates` | Verificación completa de calidad |
| `/release` | Crear release con changelog |
| `/deploy` | Deploy a Vercel |
| `/audit-security` | Auditoría de seguridad |

## Skills Disponibles (20)

### Existentes (14)
| Skill | Descripción |
|-------|-------------|
| `auditar-mcp` | Verificar servidores MCP |
| `crear-release` | Crear releases |
| `db-migration` | Migraciones de DB |
| `documentar-proyecto` | Documentación |
| `fase-completa` | Ejecutar fase completa |
| `fix-branding` | Corregir branding |
| `fix-security` | Corregir seguridad |
| `git-workflow` | Flujo de trabajo git |
| `handoff-automatico` | Handoff entre fases |
| `optimizar-lighthouse` | Optimizar performance |
| `qa-visual` | Testing visual |
| `run-quality-gates` | Ejecutar quality gates |
| `switch-context` | Cambiar de contexto |
| `validar-null-safety` | Validar null safety |

### Nuevos (6)
| Skill | Origen | Descripción |
|-------|--------|-------------|
| `frontend-design` | Anthropic | Diseño UI/visual |
| `vercel-react-best-practices` | Vercel | Performance React/Next.js |
| `tdd` | Matt Pocock | Test-driven development |
| `agent-browser` | Vercel | Automatización navegador |
| `web-design-guidelines` | Vercel | Revisión UI/accessibility |
| `improve-codebase-architecture` | Matt Pocock | Mejorar arquitectura |

## MCP Servers (7)

> **RC.32 — la configuración se limpió.** Antes había 17 entradas y 2 de ellas
> estaban rotas o no servían. Ver «Qué se quitó y por qué» más abajo.

### Habilitados (7)
| Server | Tipo | Utilidad |
|--------|------|----------|
| filesystem | Local | Operaciones de archivos |
| playwright | Local | Automatización navegador — **necesita Chrome real**: busca `chrome.exe` en `%LOCALAPPDATA%\Google\Chrome\Application/`, que aquí no está. Con `npx playwright install chrome` funciona. Mientras tanto, usar `chromium.launch()` del paquete de Playwright, que sí está instalado. Para **renderizar** un PDF hace falta `headless: false` (en headless descarga el PDF en vez de pintarlo) |
| context7 | Remoto | Docs de frameworks |
| gh_grep | Remoto | Buscar código en GitHub |
| git | Local | Operaciones git |
| **vercel** | Remoto (OAuth) | **Deploys y logs de Vercel.** Ver nota 1 |
| **turso** | Remoto (OAuth) | **SQL directo y estado de la DB.** Ver nota 2 |

**Para fetching de contenido web no hace falta un servidor MCP**: está la tool
built-in `webfetch` (y `websearch`). No reañadas un MCP `fetch` para eso.

Autenticación: `opencode mcp auth vercel` / `opencode mcp auth turso` (OAuth en el navegador, sin copiar tokens).

> **PASO MANUAL DEL USUARIO — `vercel` aparece conectado pero con el scope vacío.**
> `opencode mcp list` dice `✓ vercel connected` y, aun así, **todas las tools
> devuelven cero proyectos y cero teams**. Eso **no es un problema de
> configuración**: la OAuth se autorizó sin seleccionar equipo, así que el token
> es válido y no tiene sobre qué actuar. Ninguna clave ni variable lo arregla, y
> **no hay `VERCEL_TOKEN` en `.env.local`** como plan B (comprobado).
>
> Pasos exactos:
> 1. Vercel → **Account Settings → Integrations** → revoca la conexión de
>    Vercel MCP.
> 2. `opencode mcp auth vercel`
> 3. **En el navegador, seleccionar el equipo.** Este paso es el que falta siempre
>    y el que no se puede saltar: si no se elige equipo, el token vuelve a salir
>    sin scope y `mcp list` volverá a decir `connected` mintiendo.
> 4. Reiniciar opencode y comprobar que las tools devuelven proyectos.

> **Nota 1 — por qué Vercel.** El 500 del PDF costó **tres despliegues** porque no había forma de ver el log. La causa estaba en una línea que el build sí imprimía:
> `The framework produced an invalid deployment package for a Serverless Function. Typically this means that the framework produces files in symlinked directories.`
> Con `vercel inspect --logs` eso se lee en segundos. Antes hubo que pedirle al usuario que pegara los logs a mano, dos veces.
>
> **Nota 2 — por qué Turso.** Dos funciones chamadas `isTursoConfigured` discrepaban: la de `lib/turso.ts` leía un snapshot del `process.env` capturado **al importar el módulo** y la de `lib/db.ts` leía el env **en tiempo de llamada**, así que la primera decía «hay Turso» mientras la segunda decía que no, y la ruta respondía 500. RC.32 lo arregló convirtiendo las dos `const` de `lib/turso.ts` en getters y **eliminando** el alias de `lib/turso.ts` en vez de renombrarlo: un nombre menos que colisiona. Tener además SQL directo quita la indirección, y `scripts/turso-check.ts` sigue siendo la fuente de verdad de la réplica local.

### Lo que los MCP **no** reemplazan (leído de la Ola 3)
Estos cuatro hallazgos resuelieron los fallos más caros de la tanda y **ninguno** vino de un servidor:

| Técnica | Para qué sirve |
|---|---|
| Leer `.next/server/app/api/<ruta>/route.js.nft.json` | Es el **mismo manifiesto que usa Vercel** para decidir qué viaja en la lambda. Saying exactamente qué se empaqueta y qué no |
| Interceptar `Module._load` para capturar la pila de un `require` | Demostró que pedía Helvetica **el constructor de PDFKit**, no nuestro código |
| Extraer texto de PDF con el CMap `ToUnicode` (`tests/helpers/pdf-text.ts`) | Un PDF con la maquetación rota es un PDF **válido**: solo se ve leyendo su contenido |
| **Comprobar que un test falla al revertir el arreglo** | Disciplina, no herramienta. Un check que siempre pasa no protege de nada, y por eso el 500 del PDF costó tres deploys |

### Qué se quitó y por qué (RC.32)

Las 9 entradas `enabled: false` **se han borrado de `opencode.json`**. No costaban
nada en ejecución —un servidor con `enabled: false` nunca se lanza—, pero dejaban
una lista en la que reaktivar uno era un clic. Se guardan aquí las tres razones
por las que no conviene volver:

| Server | Por qué no vuelve |
|---|---|
| **sqlite** | **Irrecuperable vía npx en Windows**: caché corrupto de `ajv` sin `package.json`, `EPERM` en el cleanup y build nativo lentísimo. Para consultar la DB está el custom tool **`database-query`**, y para el estado real de Turso, **`scripts/turso-check.ts`**. No lo reintroduzcas. |
| github | Se usa el CLI `gh` (además `git` MCP ya cubre lo local). El MCP de GitHub consumía demasiado contexto. |
| sentry · memory · sequential-thinking · plur · novu · strac-dlp · ctxfile | Nunca se usaron en este proyecto. Si alguna vez hacen falta, se añaden de nuevo con su bloque completo. |

**`fetch` se eliminó porque estaba roto, no porque sobrara.** Parecía sano
(`enabled: true`) y por eso era el caro: se lanzaba en cada arranque, resolvía
por `npx -y`, y ahí se caía. El diagnóstico:

```
npx -y @smokei/mcp-fetch
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@smokei%2fmcp-fetch
```

El paquete **no existe en npm**. Y no es un problema de versión: no hay
sustituto directo. `mcp-server-fetch` resuelve a `0.0.1-security`, que es el
marcador de npm para un paquete retirado (no es un servidor funcional), y
`@modelcontextprotocol/server-fetch` da 404. Lo que lo cubría es la tool
built-in `webfetch`.

## Custom Tools (6)

| Tool | Función |
|------|---------|
| `database-query` | Consultar SQLite/Turso |
| `check-types` | Ejecutar `tsc --noEmit` |
| `quality-gates` | typecheck + test + build |
| `seed-data` | Poblar DB con datos de prueba |
| `deploy-vercel` | Deploy a Vercel |
| `test-visual` | Screenshot con Playwright |

> Nota: `analyze-image` / plugin `image-detector` documentados antes **no existen** en `.opencode/` (eliminados de esta doc hasta implementarse).

## Agentes opencode

### Modelo Principal
- **Modelo**: `opencode/space-bunny-free`
- **Razón**: 1M de contexto, mejor reasoning para orquestación, y acepta imágenes
- **Visión**: Sí (`text, image, video`) — ya no hace falta `test-visual` para leer un screenshot
- **`small_model`**: `opencode/mimo-v2.6-flash-free` (títulos y tareas cortas)

### Subagentes Principales
| Subagente | Modelo | Uso |
|-----------|--------|-----|
| `visual-tester` | `muse-spark-1.3` | Análisis de imágenes (1M ctx + image, video, pdf, audio) |
| `orchestrator` | `space-bunny-free` | Coordinación general |
| `api-builder` | `space-bunny-free` | APIs y endpoints |
| `db-builder` | `space-bunny-free` | Base de datos |
| `quality-auditor` | `space-bunny-free` | Testing y QA |
| `dashboard-builder` | `mimo-v2.6-flash-free` | Builders UI (el más rápido) |

> La fuente de verdad de los modelos es **`opencode.json`**. Los `.md` de `.opencode/agents/` **no declaran `model:`** a propósito, para que no haya dos sitios que mantener sincronizados. Este archivo es documentación legible, no configuración.

## Flujo de Trabajo (OBLIGATORIO)

> Regla estricta: ningún cambio se considera terminado hasta completar el ciclo entero.

1. Documentar lo que se va a hacer (plan + alcance en `docs/AI_LOG.md` o doc de fase)
2. Implementar (directo o delegado según Reglas de Delegación)
3. Pruebas visuales y funcionales en **local**; corregir y **reiterar hasta que todo pase**
4. Commit con mensaje descriptivo + push a main
5. Mismas pruebas en **producción** (matriz + funcional + headed + screenshots); corregir y **reiterar hasta que todo pase**
6. Documentar lo hecho, lo corregido y resultados finales (`docs/AI_LOG.md` + doc de fase)
7. Crear release si es fase completa

## Convenciones

- **Branch**: main
- **Commit**: conventional commits (feat:, fix:, docs:)
- **Releases**: `gh release create vX.Y.Z`
- **Docs**: actualizar AI_LOG.md con cada cambio significativo
- **Nunca remover TODOs** del MASTER_PLAN.md
- **Lighthouse**: medir siempre contra el build de producción (`pnpm build` y luego `pnpm start -p 3100`), nunca contra `pnpm dev`: los números de dev no son representativos
- **Cover image priority**: uploaded > Spotify/Apple Music > YouTube thumbnail > default placeholder

