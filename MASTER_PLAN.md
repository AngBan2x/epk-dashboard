# MASTER PLAN — EPK Dashboard Musical
**Versión 1.0 | Aprobado para ejecución | Modo Build**

---

## 1. DESGLOSE DE FASES DE DESARROLLO

| Fase | Nombre | Objetivo Principal | Entregables Clave | Duración Estimada | Modelo Asignado |
|------|--------|-------------------|-------------------|-------------------|-----------------|
| **F0** | **Setup & Auditoría Inicial** | Inicializar repo, validar MCP, crear estructura base | `git init`, `.mcp.json` verificado, `package.json` raíz, `tsconfig.json`, estructura carpetas | 1 sesión | **Nemotron 3 Ultra (opencode)** |
| **F1** | **Capa de Datos & Tipado** | Esquema TypeScript desde SQLite/JSON, helpers null-safe | `types/music.ts`, `lib/db.ts`, `lib/null-safe.ts`, tests unitarios | 1-2 sesiones | **Nemotron 3 Ultra (opencode)** |
| **F2** | **Componente EPK Core** | Tarjeta responsiva por track (cobertura `/renderizar_epk`) | `components/EPKCard.tsx`, `components/AudioPlayer.tsx`, `components/ProductionDetails.tsx` | 2 sesiones | **North Mini Code (OpenRouter)** |
| **F3** | **Dashboard & Vistas** | Vista lista, detalle, filtros, métricas agregadas | `app/dashboard/page.tsx`, `app/track/[id]/page.tsx`, `components/MetricsCharts.tsx` | 2 sesiones | **Nemotron 3.5 Lightning (OpenRouter)** |
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
  typeof v === 'string' && v.length > 0 ? v : '—';

export const hasValue = <T,>(obj: T, key: keyof T): boolean => 
  obj && key in obj && obj[key] != null && obj[key] !== '';

export const safeNumber = (v: unknown, fallback = 0): number => 
  typeof v === 'number' && !isNaN(v) ? v : fallback;

export const safeArray = <T,>(v: unknown): T[] => 
  Array.isArray(v) ? v : [];

export const safeDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(v as string | number);
  return isNaN(d.getTime()) ? null : d;
};
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

## 6. ARQUITECTURA TÉCNICA DEFINITIVA

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
├── HANDOFF.md                # switch-context output
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

## 7. GENERACIÓN DE DATOS SINTÉTICOS (REQUISITO CONFIRMADO)

**Objetivo:** Poblar `music_catalog.db` con ≥ 20 tracks de ≥ 5 artistas diversos antes de F4 (migración Turso).

**Estructura `data/seed/artists.json`:**
```json
[
  { "name": "Angel Bandres", "genre": "Alternative Rock / Grunge / Pop Ballad", "location": "Valencia, Venezuela", "monthly_listeners": 14250, "listeners_growth_pct": 18.5 },
  { "name": "Luna Roja", "genre": "Indie Pop / Dream Pop", "location": "Buenos Aires, Argentina", "monthly_listeners": 8900, "listeners_growth_pct": 32.1 },
  { "name": "Kairo Beats", "genre": "Hip Hop / Trap Latino", "location": "Ciudad de México, México", "monthly_listeners": 45600, "listeners_growth_pct": 55.3 },
  { "name": "Solar Winds", "genre": "Electronic / Synthwave", "location": "Madrid, España", "monthly_listeners": 22100, "listeners_growth_pct": 24.7 },
  { "name": "Andes Echo", "genre": "Folk / World Fusion", "location": "Bogotá, Colombia", "monthly_listeners": 11300, "listeners_growth_pct": 15.2 }
]
```

**Script `scripts/generate-more-data.ts`:**
- Usa `faker` + plantillas realistas (títulos, fechas, duraciones, métricas)
- Genera 4-5 tracks por artista (20-25 total)
- Inserta directo a SQLite via `better-sqlite3`
- Respeta schema: `id`, `title`, `release_type`, `release_date`, `duration`, `cover_image`, `audio_preview_url`, `spotify_url`, `youtube_video_id` (nullable), `metrics` (JSON), `production_details` (JSON), `lyrics` (nullable)

---

## 8. DESPLIEGUE VERCEL (CONFIRMADO)

| Configuración | Valor |
|---------------|-------|
| **Framework** | Next.js 14 (App Router) |
| **Build Command** | `pnpm build` |
| **Output Directory** | `.next` |
| **Install Command** | `pnpm install` |
| **Node Version** | 20.x (Vercel default) |
| **Env Vars** | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NEXT_PUBLIC_APP_URL` |
| **Domains** | `epk-dashboard.vercel.app` (auto) + custom opcional |

---

## 9. COMANDOS DE EJECUCIÓN LOCAL (POST-F0)

```bash
# Desarrollo
pnpm dev              # Next.js en localhost:3000

# Calidad
pnpm lint             # ESLint + Prettier
pnpm typecheck        # tsc --noEmit
pnpm test:unit        # Vitest/Jest
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

## 10. PRÓXIMO PASO INMEDIATO: F0

**Ejecutar ahora en Modo Build con Nemotron 3 Ultra:**

1. `git init` + `gh repo create epk-dashboard --public --source=. --remote=origin`
2. Crear `package.json` raíz con dependencias:
   - `next@14`, `react@18`, `react-dom@18`, `typescript@5`
   - `tailwindcss@3`, `postcss`, `autoprefixer`
   - `recharts@2`, `framer-motion@11`
   - `better-sqlite3`, `@libsql/client` (Turso)
   - `@playwright/test`, `vitest`, `@testing-library/react`
   - `zod` (validación), `date-fns` (fechas)
   - `@modelcontextprotocol/sdk` (MCP clients)
3. `tsconfig.json` strict + `"paths": { "@/*": ["./*"] }`
4. Estructura carpetas completa (ver sección 6)
5. **Skill `auditar-mcp`** → valida 4 servidores
6. Commit `chore: bootstrap project structure` + push
7. **Skill `switch-context`** → genera `HANDOFF_F0_F1.md` para F1

---

**Documento generado: `MASTER_PLAN.md` | Listo para iniciar F0**