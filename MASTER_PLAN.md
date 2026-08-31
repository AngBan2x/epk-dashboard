# MASTER PLAN — EPK Dashboard Musical
**Versión 2.0 | Aprobado para ejecución | Modo Build**

---

## 1. DESGLOSE DE FASES DE DESARROLLO

| Fase | Nombre | Objetivo Principal | Entregables Clave | Duración Estimada | Modelo Asignado |
|------|--------|-------------------|-------------------|-------------------|-----------------|
| **F0** | **Setup & Auditoría Inicial** | Inicializar repo, validar MCP, crear estructura base | `git init`, `.mcp.json` verificado, `package.json` raíz, `tsconfig.json`, estructura carpetas | 1 sesión | **Nemotron 3 Ultra (opencode)** |
| **F1** | **Capa de Datos & Tipado** | Esquema TypeScript desde SQLite/JSON, helpers null-safe | `types/music.ts`, `lib/db.ts`, `lib/null-safe.ts`, tests unitarios | 1-2 sesiones | **Nemotron 3 Ultra (opencode)** |
| **F2** | **Componente EPK Core** | Tarjeta responsiva por track (cobertura `/renderizar_epk`) | `components/EPKCard.tsx`, `components/AudioPlayer.tsx`, `components/ProductionDetails.tsx`, `components/LyricsModal.tsx` | 2 sesiones | **North Mini Code (OpenRouter)** |
| **F3** | **Dashboard & Vistas** | Vista lista, detalle, filtros, métricas agregadas | `app/dashboard/page.tsx`, `app/track/[id]/page.tsx`, `components/MetricsCharts.tsx`, `components/TrackFilters.tsx` | 2 sesiones | **Nemotron 3.5 Lightning (OpenRouter)** |
| **F4** | **Integración Turso & Sync** | Replicación remota, migración schema, CI/CD data | `turso` vinculado, script `sync-data.ts`, GitHub Action `sync-data.yml` | 1 sesión | **Nemotron 3 Ultra (opencode)** |
| **F5** | **Testing E2E & Accesibilidad** | Playwright flows, null-safety audit, Lighthouse | `tests/e2e/*.spec.ts`, reporte `auditar-mcp`, `validar-null-safety` | 1-2 sesiones | **Nemotron 3.5 Lightning (opencode)** + **Playwright MCP** |
| **F6** | **Despliegue & Entrega** | Build producción, deploy (Vercel), docs finales | URL pública, `README.md`, `AI_LOG.md`, handoff final | 1 sesión | **Nemotron 3 Ultra (opencode)** |

> **Regla de Oro (Directrices):** Cada fase se ejecuta en **Modo Build** con agente especializado; **nada de código manual**.

---

## 2. MATRIZ DE ASIGNACIÓN DE MODELOS LLM (DETALLADA)

| Fase | Modelo Principal | Proveedor | Rol Específico | Fallback |
|------|------------------|-----------|----------------|----------|
| **F0** | Nemotron 3 Ultra | opencode (BYOK) | Razonamiento arquitectónico, decisiones de stack, configuración inicial compleja, git init, auditoría MCP | Nemotron 3 Ultra |
| **F1** | Nemotron 3 Ultra | opencode (BYOK) | Tipado estricto, inferencia de schemas JSON→TS, diseño de helpers type-safe, validación tipos | Nemotron 3 Ultra |
| **F2** | North Mini Code | OpenRouter (gratuito) | Generación especializada de componentes React/Tailwind, UI repetitiva, consumo comando `/renderizar_epk` | Nemotron 3 Ultra |
| **F3** | Nemotron 3.5 Lightning | OpenRouter (gratuito) | Velocidad para vistas completas, gráficos (Recharts), routing Next.js App Router, filtros interactivos | Nemotron 3 Ultra |
| **F4** | Nemotron 3 Ultra | opencode (BYOK) | Operaciones MCP (Turso, GitHub), scripts de migración, CI/CD YAML, gestión tokens/secrets | Nemotron 3 Ultra |
| **F5** | Nemotron 3.5 Lightning | opencode (BYOK) | Ejecución paralela de tests E2E via Playwright MCP, auditoría automatizada, performance | Nemotron 3 Ultra |
| **F6** | Nemotron 3 Ultra | opencode (BYOK) | Orquestación final, deploy Vercel, documentación técnica, handoff humano, release GitHub | Nemotron 3 Ultra |

> **Estrategia de Fallback Unificada:** Si cualquier modelo falla en su fase asignada → **Nemotron 3 Ultra (opencode)** asume control inmediato como modelo "arquitecto" siempre disponible.

---

## 3. ESTRATEGIA DE INTEGRACIÓN MCP (POR FASE Y TAREA)

| Servidor MCP | Fases | Tareas Concretas por Fase |
|--------------|-------|---------------------------|
| **sqlite** | F0, F1, F2, F3 | F0: `SELECT * FROM tracks` test conexión; F1: `PRAGMA table_info(tracks)` para generar types; F2: `SELECT * FROM tracks WHERE id = ?` hidratar EPKCard; F3: queries agregadas `metrics` para dashboard |
| **turso** | F4 | `turso db create epk-dashboard`; `turso db shell` push schema; `turso tokens create` para CI; `sync-data.ts` bidireccional SQLite↔Turso |
| **github** | F0, F4, F6 | F0: `gh repo create epk-dashboard --public --source=.`; F4: GitHub Action `sync-data.yml` (cron + push); F6: `gh release create`, deploy preview URLs |
| **playwright** | F5 | `navigate` + `screenshot` visual regression; `click`/`fill` flows: reproducción audio, expansión letra, filtro país, responsive breakpoints |
| **dbhub** | F4 (opcional) | Explorar/validar schema remoto Turso via UI si hay discrepancias entre local/remoto |

> **Regla Obligatoria:** Skill `auditar-mcp` **se ejecuta al cierre de F0, F4, F5, F6** — imprime estado de respuesta de cada herramienta MCP probada.

---

## 4. USO DE SKILLS Y COMANDOS PERSONALIZADOS (CRONOGRAMA)

| Skill / Comando | Fases de Activación | Trigger Exacto / Momento de Ejecución |
|-----------------|---------------------|----------------------------------------|
| **`git-workflow`** | F0 (init), F1-F6 (cada commit) | Automático: `git status` muestra cambios → auto-commit Conventional (`feat:`, `fix:`, `docs:`, `chore:`) + `git push origin main` |
| **`documentar-proyecto`** | F1 (types), F2 (componentes), F3 (vistas), F6 (final) | Al cerrar cada fase → actualiza `README.md` (arquitectura, componentes, métricas, instrucciones) + apéndice a `AI_LOG.md` (prompts, modos, skills, errores corregidos) |
| **`validar-null-safety`** | F2, F3, F5 | Post-build de componentes UI → ejecuta `npx tsc --noEmit` + checklist campos opcionales (`youtube_video_id`, `effects_chain`, `lyrics`, `metrics.top_countries`) |
| **`auditar-mcp`** | F0, F4, F5, F6 | Cierre de fase → consola imprime estado SQLite/Turso/Playwright/GitHub (4/4 servidores respondiendo) |
| **`switch-context`** | Transiciones F0→F1, F2→F3, F4→F5, F5→F6 | Genera `HANDOFF.md` + prompt listo para siguiente modelo (estado actual, MCP usados, siguiente modelo, restricciones TS/null-safety) |
| **`/renderizar_epk`** | F2 (core) | Invocado por agente **"epk-card-builder"** (subagente) para cada track (`trk-001`, `trk-002`, nuevos generados) en bucle |

> **Agente Personalizado Requerido (Regla 4 Directrices):** Crear **`epk-card-builder`** (subagente en `.opencode/agents/epk-card-builder.md`) que consuma `/renderizar_epk` y `validar-null-safety` en bucle por track.

---

## 5. REGLAS DE CALIDAD Y NULL-SAFETY (CRITERIOS TÉCNICOS)

### 5.1 Campos Críticos Auditados (desde `catalog.json` + SQLite `music_catalog.db`)

| Campo | Tipo | Nullable | Protección Requerida | Componente Afectado |
|-------|------|----------|---------------------|---------------------|
| `youtube_video_id` | `string \| null` | ✅ | `videoId && <YouTubeEmbed />` | `EPKCard`, `TrackDetail` |
| `effects_chain` | `string \| null` | ✅ | `safeString(effects_chain)` + fallback "—" | `ProductionDetails` |
| `lyrics` | `string \| null` | ✅ | Conditional render + botón "Ver letra" deshabilitado si null | `LyricsModal` |
| `metrics.top_countries` | `Array<{country, pct}>` | ❌ (array vacío) | `top_countries?.length ? map : <EmptyState />` | `MetricsCharts` |
| `production_details.*` | `string \| null` | Parcial | Helper `hasValue(obj, key)` por propiedad (daw, guitars, tuning, key) | `ProductionDetails` |
| `audio_preview_url` | `string` | ❌ (requerido) | Validación Zod en schema + fallback silencioso | `AudioPlayer` |
| `cover_image` | `string` | ❌ (requerido) | `Image` con `onError` fallback placeholder | `EPKCard`, `TrackDetail` |

### 5.2 Helpers Obligatorios (`lib/null-safe.ts`)

```typescript
export const safeString = (v: unknown): string =>
  typeof v === "string" && v.length > 0 ? v : "—";

export const hasValue = (obj: unknown, key: string): boolean => {
  if (obj == null || typeof obj !== "object") return false;
  return key in obj && (obj as Record<string, unknown>)[key] != null && (obj as Record<string, unknown>)[key] !== "";
};

export const safeNumber = (v: unknown, fallback = 0): number =>
  typeof v === "number" && !isNaN(v) ? v : fallback;

export const safeArray = <T,>(v: unknown): T[] =>
  Array.isArray(v) ? (v as T[]) : [];

export const safeDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(v as string | number);
  return isNaN(d.getTime()) ? null : d;
};

export const safeParseJSON = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const formatDuration = (duration: string): string => {
  const parts = duration.split(":");
  if (parts.length !== 2) return duration;
  const [min, sec] = parts;
  return `${min}:${sec.padStart(2, "0")}`;
};

export const formatNumber = (n: number): string =>
  new Intl.NumberFormat("es-VE").format(n);

export const formatPercent = (n: number): string =>
  `${n.toFixed(1)}%`;

export const isDefined = <T>(v: T | null | undefined): v is T =>
  v != null;

export const coalesce = <T>(...values: (T | null | undefined)[]): T | undefined =>
  values.find(isDefined);
```

### 5.3 Criterios de Aprobación por Fase (Quality Gates)

| Check | Herramienta | Umbral Mínimo | Fase de Aplicación |
|-------|-------------|---------------|-------------------|
| **TypeScript Strict** | `npx tsc --noEmit` | 0 errores, 0 warnings | F1, F2, F3, F4, F5, F6 |
| **Null-Safety UI** | `validar-null-safety` skill | 100% campos opcionales cubiertos | F2, F3, F5 |
| **MCP Health** | `auditar-mcp` skill | 4/4 servidores respondiendo | F0, F4, F5, F6 |
| **E2E Pass Rate** | Playwright MCP | ≥ 95% tests verdes | F5 |
| **Lighthouse CI** | GitHub Action + Vercel | Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 90 | F6 |
| **Bundle Size** | `next build` analyze | < 250 KB JS first load | F6 |

---

## 6. ARQUITECTURA TÉCNICA PROPUESTA (Resumen)

```
epk-dashboard-v2/
├── .github/
│   └── workflows/
│       ├── sync-data.yml      # Turso push programado (cron 6h)
│       └── deploy.yml         # Vercel deploy preview + production
├── .opencode/
│   ├── agents/
│   │   └── epk-card-builder.md    # Subagente personalizado (Regla 4)
│   ├── commands/
│   │   └── renderizar_epk.md      # Comando personalizado (Regla 3)
│   ├── skills/                    # 5 skills instaladas
│   └── package.json               # Plugin opencode
├── data/
│   ├── music_catalog.db      # SQLite local (fuente verdad F0-F3)
│   ├── catalog.json          # Fuente alternativa / backup
│   └── seed/                 # Scripts generación datos sintéticos
│       ├── generate-tracks.ts
│       └── artists.json
├── lib/
│   ├── db.ts                 # Cliente SQLite (better-sqlite3) + Turso (libsql)
│   ├── null-safe.ts          # Helpers tipados (ver 5.2)
│   ├── turso.ts              # Cliente Turso remoto + sync
│   └── utils.ts              # Formateo fechas, duración, números
├── types/
│   └── music.ts              # Interfaces: Track, Artist, Metrics, ProductionDetails
├── components/
│   ├── ui/                   # Primitivas: Button, Card, Modal, Skeleton
│   ├── EPKCard.tsx           # /renderizar_epk output principal
│   ├── AudioPlayer.tsx       # <audio> + controles custom + waveform
│   ├── ProductionDetails.tsx # Acordeón fichas técnicas (null-safe)
│   ├── LyricsModal.tsx       # Null-safe + animación Framer Motion
│   ├── MetricsCharts.tsx     # Recharts: barras (países), línea (streams), doughnut
│   ├── TrackFilters.tsx      # Filtros: género, fecha, país, búsqueda
│   └── Header.tsx            # Nav + logo + stats globales
├── app/
│   ├── layout.tsx            # Root layout + providers + fonts
│   ├── page.tsx              # Landing → redirect /dashboard
│   ├── dashboard/
│   │   ├── page.tsx          # Lista tracks + filtros + paginación
│   │   └── loading.tsx       # Suspense boundary
│   ├── track/
│   │   └── [id]/
│   │       ├── page.tsx      # Detalle completo (EPKCard + extras)
│   │       └── not-found.tsx
│   ├── api/
│   │   └── sync/
│   │       └── route.ts      # Endpoint manual sync Turso
│   └── globals.css           # Tailwind + variables CSS
├── tests/
│   ├── unit/
│   │   ├── null-safe.test.ts
│   │   └── db.test.ts
│   └── e2e/
│       ├── dashboard.spec.ts
│       ├── track-detail.spec.ts
│       ├── audio-playback.spec.ts
│       └── null-safety.spec.ts
├── scripts/
│   ├── generate-more-data.ts # Genera tracks/artistas sintéticos (F0/F4)
│   └── sync-to-turso.ts      # Bidireccional SQLite ↔ Turso
├── public/
│   ├── images/covers/        # Portadas (placeholder + reales)
│   └── audio/                # Previews MP3
├── README.md                 # documentar-proyecto output
├── AI_LOG.md                 # Bitácora IA (documentar-proyecto)
├── HANDOFF_F0_F1.md          # switch-context output
├── HANDOFF_F1_F2.md           # switch-context output
├── HANDOFF_F2_F3.md           # switch-context output
├── MASTER_PLAN.md            # Este archivo
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── .eslintrc.json
├── .prettierrc
├── .env.example
└── .env.local                # No commiteado (TURSO_TOKEN, etc.)
```

---

## 7. PROCESO DE GENERACIÓN DE DATOS (F4)

**Script:** `scripts/generate-more-data.ts`
- Genera 16-20 tracks de 4 artistas sintéticos
- Inserta directo a SQLite via `better-sqlite3`
- Respeta schema completo de tracks
- `pnpm run db:seed` ejecuta seed

**Migración a Turso:** `scripts/sync-to-turso.ts`
- Sincroniza SQLite → Turso remoto
- Usado por CI/CD `sync-data.yml` cada 6h

---

## 8. DESPLIEGUE VERCEL (F6)

**GitHub Actions:** `.github/workflows/deploy.yml`
- Typecheck + Lint + Unit Tests + Build + Vercel deploy
- Variables de entorno: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`

---

## 9. COMANDOS DE EJECUCIÓN LOCAL

```bash
# Desarrollo
pnpm dev              # Next.js en localhost:3000

# Calidad
pnpm lint             # ESLint + Prettier
pnpm typecheck        # tsc --noEmit
pnpm test:unit        # Vitest
pnpm test:e2e         # Playwright

# Build & Preview
pnpm build            # Producción
pnpm start            # Sirve build local

# DB & Sync
pnpm db:studio        # SQLite viewer (opcional)
pnpm db:sync          # scripts/sync-to-turso.ts
pnpm db:seed          # scripts/generate-more-data.ts
```

---

## 10. AGENTE PERSONALIZADO (Regla 4 Directrices)

**`epk-card-builder`** (`.opencode/agents/epk-card-builder.md`)
- Consumir `/renderizar_epk` y `validar-null-safety`
- Generar componentes EPKCard en bucle por tracks
- Garantiza null-safety en campos opcionales
- Uso de lib/db.ts y lib/validations.ts

---

## 11. ESCENARIOS DE EJECUCIÓN (Open Code)

**F0:** `pnpm dev` (Next.js) → `npm run lint/typecheck/test:unit/e2e`

**F1:** `pnpm db:seed` (generar datos) → `pnpm db:sync` (Turso) → `pnpm typecheck/test:unit`

**F2:** `pnpm db:seed` (generar más tracks) → `pnpm build` → `pnpm start` → `/renderizar_epk` → `validar-null-safety`

**F3:** `pnpm dev` + `pnpm build` + `pnpm test:e2e`

**F4:** `pnpm db:sync` (después de F3) + `pnpm build` + `pnpm test:unit/e2e`

**F5:** `pnpm test:e2e` (full suite) + `auditar-mcp` + `validar-null-safety`

**F6:** `pnpm build` + `pnpm start` + `vercel deploy` + docs finales

---

## 12. FASES MULTIMEDIA F7-F9 (Completadas)

### 12.1 Desglose de Fases Multimedia

| Fase | Nombre | Objetivo Principal | Entregables Clave |
|------|--------|-------------------|-------------------|
| **F7** | **Engine Multimedia, iTunes API & Assets** | Integración con iTunes Search API, Web Audio API y reproductor global persistente | `lib/itunes.ts`, `lib/web-audio.ts`, `context/AudioPlayerContext.tsx`, `components/GlobalAudioPlayer.tsx`, `components/AudioVisualizer.tsx`, `components/ImageGallery.tsx`, `components/DownloadCenter.tsx` |
| **F8** | **Pipeline Audiovisual & Multi-Track Stems** | Extensión de tipos de datos, reproductor de stems multicanal y showcase de video ultraligero | Actualización `types/music.ts`, `components/StemsPlayer.tsx`, `components/VideoShowcase.tsx`, `components/VideoPlayerModal.tsx` |
| **F9** | **Pitch Deck Animado, Exportación & QA** | Experiencia inmersiva estilo Pitch Deck, exportador de ficha técnica y tests E2E | `components/EPKExporter.tsx`, `app/api/export/route.ts`, transiciones Framer Motion, suite E2E Playwright |

### 12.2 Arquitectura F7: Engine Multimedia

1. **Cliente iTunes Search API (`lib/itunes.ts`)**: Conexión a `https://itunes.apple.com/search`, transformación de portadas a Ultra HD (600x600), extracción de `previewUrl` (M4A/AAC 30s), cache en memoria.
2. **Motor Web Audio API (`lib/web-audio.ts`)**: Abstracción de `AudioContext`, `AnalyserNode`, `MediaElementAudioSourceNode`, `GainNode`. Manejo de restricciones de autoplay.
3. **Reproductor Global (`components/GlobalAudioPlayer.tsx`)**: `AudioPlayerContext` en `app/layout.tsx` para audio persistente entre rutas.
4. **Assets de Prensa**: Galería responsiva mosaico/lightbox (`ImageGallery.tsx`), Centro de descargas (`DownloadCenter.tsx`).

### 12.3 Arquitectura F8: Pipeline Audiovisual

1. **Tipos extendidos**: `itunes_track_id`, `stems_urls`, `video_embed_url`, `gallery_images`.
2. **Video ultraligero (`VideoShowcase.tsx`)**: Fachada ligera (facade pattern) para YouTube/Vimeo sin scripts pesados hasta interacción.
3. **Stems multicanal (`StemsPlayer.tsx`)**: Hasta 4 pistas simultáneas con Solo/Mute independiente.

### 12.4 Arquitectura F9: Pitch Deck & Exportación

1. **Exportación (`EPKExporter.tsx`)**: Dossier en JSON y HTML descargable para prensa.
2. **Pitch Deck interactivo**: Vista cinemática 21:9 con navegación por diapositivas y Framer Motion.
3. **Quality Gates**: Tests E2E para iTunes API, reproducción global y null-safety.

---

## 13. PLAN EXTENDIDO — Fases A-G (Post-Refactoring)

> **Objetivo:** Corregir errores críticos, implementar auth, upload de artistas, likes, notificaciones, métricas reales y UI/UX final.

### 13.1 Resumen de Fases

| Fase | Nombre | Días | Release | Modelo principal |
|------|--------|------|---------|-----------------|
| **A** | **Cimientos** | 1 | patch | MiMo V2.5 Free |
| **B** | **Auth + Usuarios** | 1-2 | v2.1.0 | Nemotron 3 Ultra Free |
| **C** | **Upload + Autocomplete** | 2-3 | v2.2.0 | Nemotron 3 Ultra Free |
| **D** | **Likes + Notificaciones** | 3 | v2.3.0 | MiMo V2.5 Free |
| **E** | **Métricas + Webhooks** | 3-4 | v2.4.0 | MiMo V2.5 Free |
| **F** | **UI/UX Final** | 4 | v2.5.0 | MiMo V2.5 Free |
| **G** | **Verificación Final** | 5 | v3.0.0 | quality-auditor |

### 13.2 Fase A — Cimientos (Corregir lo roto)

| # | Tarea | Archivos | Modelo |
|---|-------|----------|--------|
| A1 | Fix MCP SQLite path `./db/local.db` → `./data/music_catalog.db` | `.opencode/mcp.json` | bash |
| A2 | Fix script seed en package.json | `package.json` | bash |
| A3 | Re-ejecutar seed (6 tracks reales) | `data/music_catalog.db` | bash |
| A4 | Agregar campo `artist_name` al tipo Track | `types/music.ts` | MiMo V2.5 |
| A5 | Agregar columna `artist_name` al schema DB + seed | `lib/db.ts`, seed script | MiMo V2.5 |
| A6 | Crear `/api/tracks/route.ts` — CRUD GET/POST/PUT/DELETE | `app/api/tracks/route.ts` (NUEVO) | MiMo V2.5 |
| A7 | Fix play button `e.preventDefault() + e.stopPropagation()` | `components/AudioPlayer.tsx` | trivial |
| A8 | Migrar `bg-dark-*` a `dark:` en 14 archivos | 14 archivos | MiMo V2.5 |
| **Cierre** | typecheck + test:unit + test:e2e + AI_LOG + commit | — | quality gates |

### 13.3 Fase B — Auth + Usuarios

| # | Tarea | Archivos | Modelo |
|---|-------|----------|--------|
| B1 | Instalar dependencias: `resend`, `bcryptjs` | `package.json` | bash |
| B2 | Schema DB: tabla `users` | `lib/db.ts` | Nemotron 3 Ultra |
| B3 | API `/api/auth/register` | `app/api/auth/register/route.ts` (NUEVO) | Nemotron 3 Ultra |
| B4 | API `/api/auth/login` | `app/api/auth/login/route.ts` (NUEVO) | Nemotron 3 Ultra |
| B5 | API `/api/auth/me` | `app/api/auth/me/route.ts` (NUEVO) | MiMo V2.5 |
| B6 | AuthContext + provider | `context/AuthContext.tsx` (NUEVO) | MiMo V2.5 |
| B7 | Login page | `app/login/page.tsx` (NUEVO) | MiMo V2.5 |
| B8 | Register page | `app/register/page.tsx` (NUEVO) | MiMo V2.5 |
| B9 | LoginModal en Header | `components/LoginModal.tsx` (NUEVO) | MiMo V2.5 |
| B10 | Middleware protegiendo `/admin` | `middleware.ts` (NUEVO) | MiMo V2.5 |
| B11 | Seed admin user | `scripts/seed-admin.ts` (NUEVO) | bash |
| **Cierre** | quality gates + AI_LOG + commit + **release v2.1.0** | — | crear-release |

### 13.4 Fase C — Upload de Artistas + Autocomplete

| # | Tarea | Archivos | Modelo |
|---|-------|----------|--------|
| C1 | Schema DB: tabla `track_submissions` | `lib/db.ts` | Nemotron 3 Ultra |
| C2 | API `/api/itunes-search` (proxy CORS) | `app/api/itunes-search/route.ts` (NUEVO) | MiMo V2.5 |
| C3 | API `/api/submissions` — CRUD submits | `app/api/submissions/route.ts` (NUEVO) | MiMo V2.5 |
| C4 | UploadTrackForm con autocomplete | `components/UploadTrackForm.tsx` (NUEVO) | Nemotron 3.5 Lightning |
| C5 | Página `/upload` | `app/upload/page.tsx` (NUEVO) | MiMo V2.5 |
| C6 | Admin panel: aceptar/rechazar | `app/admin/page.tsx` (MODIFICADO) | MiMo V2.5 |
| **Cierre** | quality gates + AI_LOG + commit + **release v2.2.0** | — | crear-release |

> **Ejecutar Fase C:** `/fase C` — alterna entre MiMo V2.5, Nemotron 3.5 Lightning y Nemotron 3 Ultra según tipo de tarea (ver estrategia de alternancia en sección 15.2).

### 13.5 Fase D — Likes + Notificaciones (Resend)

| # | Tarea | Archivos | Modelo |
|---|-------|----------|--------|
| D1 | Schema DB: tabla `likes` | `lib/db.ts` | MiMo V2.5 |
| D2 | API `/api/likes` — toggle like + count | `app/api/likes/route.ts` (NUEVO) | MiMo V2.5 |
| D3 | Botón like en EPKCard (corazón animado) | `components/EPKCard.tsx` | MiMo V2.5 |
| D4 | Configurar Resend: `lib/resend.ts` | `lib/resend.ts` (NUEVO) | MiMo V2.5 |
| D5 | API `/api/notifications/send` | `app/api/notifications/send/route.ts` (NUEVO) | MiMo V2.5 |
| D6 | Templates email: aprobación, rechazo, lanzamiento | `lib/email-templates.ts` (NUEVO) | MiMo V2.5 |
| D7 | Toast system (notificaciones visuales) | `components/Toast.tsx` (NUEVO) | MiMo V2.5 |
| D8 | Integrar notificaciones en admin | `app/admin/page.tsx` | MiMo V2.5 |
| D9 | Badge "Nuevo Lanzamiento" en EPKCard | `components/EPKCard.tsx` | trivial |
| **Cierre** | quality gates + AI_LOG + commit + **release v2.3.0** | — | crear-release |

### 13.6 Fase E — Métricas + Webhooks

| # | Tarea | Archivos | Modelo |
|---|-------|----------|--------|
| E1 | Schema DB: tabla `metrics_history` | `lib/db.ts` | MiMo V2.5 |
| E2 | API `/api/webhooks/metrics` | `app/api/webhooks/metrics/route.ts` (NUEVO) | Nemotron 3 Ultra |
| E3 | Dashboard con métricas en tiempo real | `components/MetricsCharts.tsx` | MiMo V2.5 |
| E4 | Badge "Stems Disponibles" | `components/EPKCard.tsx` | trivial |
| E5 | Mostrar artist_name en todas las cards | `components/EPKCard.tsx` | trivial |
| **Cierre** | quality gates + AI_LOG + commit + **release v2.4.0** | — | crear-release |

### 13.7 Fase F — UI/UX Final

| # | Tarea | Archivos | Modelo |
|---|-------|----------|--------|
| F1 | Header responsive con menú hamburguesa | `components/Header.tsx` | MiMo V2.5 |
| F2 | Footer con info + redes + copyright | `components/Footer.tsx` (NUEVO) | MiMo V2.5 |
| F3 | GlobalAudioPlayer auto-hide 5s | `components/GlobalAudioPlayer.tsx` | MiMo V2.5 |
| F4 | Logo SVG + metadata/title | `public/logo.svg` (NUEVO) | MiMo V2.5 |
| F5 | Renombrar plataforma en todos los componentes | Múltiples archivos | MiMo V2.5 |
| **Cierre** | quality gates + AI_LOG + commit + **release v2.5.0** | — | crear-release |

### 13.8 Fase G — Verificación Final

| # | Tarea | Archivos | Modelo |
|---|-------|----------|--------|
| G1 | `pnpm typecheck` — 0 errores | — | bash |
| G2 | `pnpm test:unit` — todos passing | — | bash |
| G3 | `pnpm test:e2e` — todos passing | — | bash |
| G4 | Playwright MCP — screenshot de cada ruta | — | quality-auditor |
| G5 | Null-safety audit en componentes nuevos | — | validar-null-safety |
| G6 | MCP servers audit (4/4 activos) | — | auditar-mcp |
| G7 | README.md final | `README.md` | documentar-proyecto |
| G8 | AI_LOG.md final | `AI_LOG.md` | documentar-proyecto |
| G9 | **Release FINAL v3.0.0 (STABLE)** | — | crear-release |
| **Cierre** | handoff final + commit + push | — | git-workflow |

---

## 14. AGENTES PERSONALIZADOS

| Agente | Modelo | Modo | Descripción |
|--------|--------|------|-------------|
| **dashboard-builder** | Nemotron 3.5 Lightning | subagent | Server/Client Components, Recharts, vistas dashboard |
| **epk-card-builder** | Nemotron 3 Ultra | agent | Genera EPKCard por track con null-safety |
| **quality-auditor** | Gemma 4 31B | subagent | Playwright E2E, a11y, verificación visual |
| **fase-orchestrator** (NUEVO) | MiMo V2.5 Free | agent | Orquestador: ejecuta fases completas automáticamente |
| **api-builder** (NUEVO) | MiMo V2.5 Free | subagent | Endpoints REST + Zod validation + better-sqlite3 |
| **auth-builder** (NUEVO) | Nemotron 3 Ultra | subagent | Auth: register, login, middleware, context, bcryptjs |
| **release-manager** (NUEVO) | Nemotron 3.5 Lightning | subagent | Git tags + GitHub releases + changelogs via `gh` |

> **Fallback universal:** Si cualquier modelo falla → Nemotron 3 Ultra asume control.

---

## 15. SKILLS Y COMANDOS

### 15.1 Skills (10)

| Skill | Fases | Descripción |
|-------|-------|-------------|
| `git-workflow` | Todas | Commit + push automático con Conventional Commits |
| `documentar-proyecto` | F1, F2, F3, F6, G | Actualiza README.md + AI_LOG.md |
| `validar-null-safety` | F2, F3, F5, G | Checklist campos opcionales + `tsc --noEmit` |
| `auditar-mcp` | F0, F4, F5, F6, G | Verifica 4/4 MCP servers respondiendo |
| `switch-context` | Transiciones | Genera HANDOFF.md para siguiente modelo |
| `optimizar-lighthouse` | F6 | Bundle < 250KB, lazy loading, facade pattern |
| `run-quality-gates` | Cierre de fase | typecheck + test:unit + test:e2e |
| **`fase-completa`** (NUEVO) | A-G | Ejecuta ciclo completo: code → test → docs → commit → release |
| **`crear-release`** (NUEVO) | Cierre de fase | Crea git tag + GitHub Release con changelog |
| **`handoff-automatico`** (NUEVO) | Transiciones | Genera HANDOFF + actualiza AI_LOG + prepara siguiente fase |

### 15.2 Commands (2)

| Command | Descripción |
|---------|-------------|
| `/renderizar_epk` | Genera componente EPKCard para un track específico |
| **`/fase`** (NUEVO) | Ejecuta una fase completa con el modelo asignado. Alterna entre MiMo V2.5, Nemotron 3.5 Lightning y Nemotron 3 Ultra según tipo de tarea |

---

## 16. VARIABLES DE ENTORNO

| Variable | Uso | Fase requerida | Requerida |
|----------|-----|----------------|-----------|
| `TURSO_DATABASE_URL` | Conexión Turso remoto | F4 | Sí |
| `TURSO_AUTH_TOKEN` | Auth Turso | F4 | Sí |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub API | F0, F4, F6 | Sí |
| `RESEND_API_KEY` | Email transaccional (Resend) | D | Sí (para notif.) |
| `NEXTAUTH_SECRET` | Sessions auth | B | Sí (para auth) |

---

## 17. TABLA DE RELEASES

| Versión | Fase | Tipo | Estado |
|---------|------|------|--------|
| v1.0.0 | Setup inicial | major | ✅ Completado |
| v2.0.0 | Refactoring UI/UX | minor | ✅ Completado |
| v2.0.1 | Fase A: Cimientos | patch | ✅ Completado |
| v2.1.0 | Fase B: Auth + Usuarios | minor | ✅ Completado |
| v2.2.0 | Fase C: Upload + Autocomplete | minor | ✅ Completado |
| v2.3.0 | Fase D: Likes + Notificaciones | minor | ✅ Completado |
| v2.4.0 | Fase E: Métricas + Webhooks | minor | ✅ Completado |
| v2.5.0 | Fase F: UI/UX Final | minor | ✅ Completado |
| v3.0.0 | Fase G: Branding PressPlay + Fix Crítico | **STABLE** | ✅ Completado |
| v3.1.0 | Fase H: Verificación Final | **STABLE** | ✅ Completado |
| v3.2.0 | Fase I: Skills + Agents para Fixes | minor | ⏳ En progreso |

---

## 18. FASE I — Skills + Agents para Fixes Críticos

> **Objetivo:** Crear herramientas (skills y agents) que aceleren las correcciones de 5 problemas críticos identificados en auditoría.

### 18.1 Problemas Identificados

| # | Problema | Severidad |
|---|----------|-----------|
| 1 | Logo Spotify aparece en Header, Footer, Register, SocialBar | ALTA |
| 2 | Error al crear cuenta (API retorna HTML en vez de JSON) | CRÍTICA |
| 3 | Barra blanca al fondo de la página (pb-24 en body) | MEDIA |
| 4 | Biografía & Prensa es global, no per-artist | ALTA |
| 5 | Admin/upload accesible sin auth, APIs sin protección | CRÍTICA |

### 18.2 Tareas de la Fase I

| # | Tipo | Nombre | Modelo | Archivo | Descripción |
|---|------|--------|--------|---------|-------------|
| I1 | Agent | `security-auditor` | `openrouter/nemotron-3-ultra` | `.opencode/agents/security-auditor.md` | Audita protecciones de rutas, API auth, vulnerabilidades |
| I2 | Agent | `db-builder` | `opencode/nemotron-3-ultra-free` | `.opencode/agents/db-builder.md` | Diseña tablas, crea migraciones, seed data |
| I3 | Agent | `brand-fixer` | `opencode/mimo-v2.5-free` | `.opencode/agents/brand-fixer.md` | Busca y reemplaza logos/marcas inconsistentes |
| I4 | Skill | `fix-security` | — | `.opencode/skills/fix-security/SKILL.md` | Checklist de protección de rutas y APIs |
| I5 | Skill | `fix-branding` | — | `.opencode/skills/fix-branding/SKILL.md` | Workflow de búsqueda y reemplazo de marcas |
| I6 | Skill | `db-migration` | — | `.opencode/skills/db-migration/SKILL.md` | Workflow de creación de tablas + sync Turso |

### 18.3 Criterios de Aprobación

| Check | Resultado Esperado |
|-------|-------------------|
| 3 agentes creados | `.opencode/agents/security-auditor.md`, `db-builder.md`, `brand-fixer.md` |
| 3 skills creados | `.opencode/skills/fix-security/`, `fix-branding/`, `db-migration/` |
| Agents configurados | mode: subagent, modelo asignado, descripción clara |
| Skills documentados | Workflow paso a paso, triggers, archivos relevantes |

### 18.4 Uso Post-Creación

| Fix | Agente/Skill que lo ejecuta |
|-----|------------------------------|
| FIX 5: Protección de rutas | `security-auditor` + skill `fix-security` |
| FIX 2: Error de registro | `api-builder` (existente) |
| FIX 1: Logo Spotify → PressPlay | `brand-fixer` + skill `fix-branding` |
| FIX 3: Barra blanca | `dashboard-builder` (existente) |
| FIX 4: BioSection per-artist | `db-builder` + skill `db-migration` |

**Documento actualizado: `MASTER_PLAN.md` v3.1 | Plan completo F0-I | Listo para ejecución**
