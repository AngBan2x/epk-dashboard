# EPK Dashboard Musical

Electronic Press Kit (EPK) Dashboard para artistas musicales. Interfaz web interactiva que muestra catálogo de tracks, métricas de streaming, fichas de producción y reproductor de audio.

## Estado del Proyecto

| Fase | Nombre | Estado | Commit |
|------|--------|--------|--------|
| F0 | Setup & Auditoría Inicial | ✅ Completada | `f92d377` |
| F1 | Capa de Datos & Tipado | ✅ Completada | `112a191` |
| F2 | Componente EPK Core | ✅ Completada | `1840402` |
| F3 | Dashboard & Vistas | ✅ Completada | `a8ca789` |
| F4 | Integración Turso & Sync | ✅ Completada | `500c866` |
| F5 | Testing E2E & Accesibilidad | ✅ Completada | `500c866` |
| F6 | Despliegue & Entrega | ✅ Completada | (actual) |

## Arquitectura

```
epk-dashboard/
├── app/                    # Next.js App Router
│   ├── dashboard/          # Vista principal con lista de tracks
│   ├── track/[id]/         # Detalle completo por track
│   └── api/sync/           # Endpoint sync Turso
├── components/             # UI components React
│   ├── ui/                 # Primitivas: Button, Card, Modal, Skeleton
│   ├── EPKCard.tsx         # Tarjeta principal por track
│   ├── AudioPlayer.tsx     # Reproductor de audio
│   ├── ProductionDetails.tsx # Ficha técnica de producción
│   ├── LyricsModal.tsx     # Modal null-safe para letra
│   ├── MetricsCharts.tsx   # Gráficos Recharts (países, métricas)
│   ├── TrackFilters.tsx    # Filtros de búsqueda
│   └── Header.tsx          # Navegación sticky
├── lib/                    # Utilidades y acceso a datos
│   ├── null-safe.ts        # Helpers tipados para null-safety
│   ├── db.ts               # Cliente SQLite (better-sqlite3)
│   ├── turso.ts            # Cliente Turso remoto
│   └── utils.ts            # cn(), formatDate()
├── types/                  # TypeScript interfaces
│   └── music.ts            # Track, Artist, Metrics, ProductionDetails
├── tests/                  # Unit + E2E tests
├── scripts/                # Seed data, sync Turso
├── data/                   # SQLite DB + JSON backup
└── .opencode/              # Skills, agents, commands
```

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 3 |
| Charts | Recharts 2 |
| Animation | Framer Motion 11 |
| DB Local | better-sqlite3 |
| DB Remoto | Turso (@libsql/client) |
| Validation | Zod 3 |
| Testing | Vitest + Playwright |
| Deploy | Vercel |
| CI/CD | GitHub Actions |

## Componentes UI

- **EPKCard** — Tarjeta responsiva con portada, título, duración, streams, saves, AudioPlayer integrado
- **AudioPlayer** — Controles play/pause con estado visual y null-safety en `src`
- **ProductionDetails** — Grid con DAW, guitarras, efectos, afinación, tonalidad (null-safe via `hasValue`/`safeString`)
- **LyricsModal** — Modal animado Framer Motion con null-check para letras opcionales
- **MetricsCharts** — Gráfico de barras (top países) + pie chart (streams/saves/playlists)
- **TrackFilters** — Búsqueda por texto + filtro por tipo de release
- **Header** — Navegación sticky con blur backdrop

## Null-Safety

Campos protegidos contra `TypeError: Cannot read properties of undefined` (auditados con skill `validar-null-safety`):

| Campo | Tipo | Protección | Componente |
|-------|------|------------|------------|
| `youtube_video_id` | `string \| null` | Renderizado condicional | EPKCard, TrackDetail |
| `effects_chain` | `string \| null` | Fallback "—" via `safeString()` | ProductionDetails |
| `lyrics` | `string \| null` | Botón deshabilitado si null | LyricsModal |
| `metrics.top_countries` | `Array<{country, pct}>` | `safeArray()` con fallback [] | MetricsCharts |
| `production_details.*` | `string \| null` | `hasValue()` por propiedad | ProductionDetails |
| `audio_preview_url` | `string` | Validación Zod + fallback silencioso | AudioPlayer |

## Quality Gates (cumplidos)

| Check | Herramienta | Umbral | Resultado |
|-------|-------------|--------|-----------|
| TypeScript Strict | `tsc --noEmit` | 0 errores | ✅ |
| Null-Safety UI | `validar-null-safety` skill | 100% campos opcionales | ✅ |
| MCP Health | `auditar-mcp` skill | 4/4 servidores | ✅ |
| E2E Pass Rate | Playwright | ≥ 95% (7/7) | ✅ |
| Bundle Size | `next build` | < 250 KB JS | ✅ (208 KB) |

## Ejecución Local

```bash
# Instalar dependencias
pnpm install

# Desarrollo
pnpm dev

# Tests
pnpm test:unit      # Vitest (29/29 passing)
pnpm test:e2e       # Playwright (7/7 passing)

# Typecheck
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build
pnpm start

# DB & Sync
pnpm db:seed        # Genera datos sintéticos (16-20 tracks)
pnpm db:sync        # Sync SQLite → Turso
```

## Datos

- `data/music_catalog.db` — SQLite con tracks (fuente de verdad F0-F3)
- `data/catalog.json` — Backup JSON
- `scripts/generate-more-data.ts` — Genera 16-20 tracks sintéticos de 4 artistas
- `scripts/sync-to-turso.ts` — Sync bidireccional SQLite ↔ Turso

## Despliegue

Automático via GitHub Actions al hacer push a `main`:
- **CI Pipeline**: Typecheck + Lint + Unit Tests + Build
- **Deploy**: Vercel (preview en PRs, producción en main)
- **Data Sync**: Turso cron `0 */6 * * *` (cada 6 horas)

Variables de entorno requeridas:
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (para deploy)

## Handoffs Técnicos

- `HANDOFF_F0_F1.md` — Setup → Data Layer
- `HANDOFF_F1_F2.md` — Data Layer → EPK Components
- `HANDOFF_F2_F3.md` — EPK Components → Dashboard/Views
- `HANDOFF_F3_F4.md` — Views → Turso Integration
- `HANDOFF_F4_F5.md` — Turso → E2E Testing
- `HANDOFF_F5_F6.md` — E2E → Deployment

## Bitácora IA

Ver `AI_LOG.md` para registro completo de prompts, skills, errores corregidos y decisiones por fase.

## Licencia

Proyecto privado — Angel Bandres