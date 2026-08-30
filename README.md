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
| F7 | Multimedia Core (iTunes, Stems, Video) | ✅ Completada | (actual) |
| F8 | Catálogo Expandido & Assets HD | ✅ Completada | (actual) |
| F9 | Animaciones Pitch Deck & Exportación | ✅ Completada | (actual) |

## Arquitectura

```
epk-dashboard/
├── app/                    # Next.js App Router
│   ├── dashboard/          # Vista principal con lista de tracks
│   ├── track/[id]/         # Detalle completo por track
│   └── api/
│       ├── sync/           # Endpoint sync Turso
│       └── export/         # Endpoint export EPK dossier
├── components/             # UI components React
│   ├── ui/                 # Primitivas: Button, Card, Modal, Skeleton
│   ├── EPKCard.tsx         # Tarjeta principal por track
│   ├── AudioPlayer.tsx     # Reproductor de audio
│   ├── AudioVisualizer.tsx # Visualizador de forma de onda
│   ├── GlobalAudioPlayer.tsx # Reproductor global persistente
│   ├── ProductionDetails.tsx # Ficha técnica de producción
│   ├── LyricsModal.tsx     # Modal null-safe para letra
│   ├── MetricsCharts.tsx   # Gráficos Recharts (países, métricas)
│   ├── TrackFilters.tsx    # Filtros de búsqueda
│   ├── Header.tsx          # Navegación sticky
│   ├── ThemeToggle.tsx     # Toggle Dark/Light mode
│   ├── MotionWrappers.tsx  # Animaciones Pitch Deck (SlideIn, PageTransition, LiftCard, PitchHeading)
│   ├── EPKExporter.tsx     # Exportador de dossier EPK (JSON/HTML)
│   ├── DownloadCenter.tsx  # Centro de descargas
│   ├── ImageGallery.tsx    # Galería de imágenes responsive
│   ├── VideoShowcase.tsx   # Fachada de videoclip con modal
│   ├── VideoPlayerModal.tsx # Modal reproductor video
│   ├── StemsPlayer.tsx     # Mezclador multicanal Web Audio API
│   └── VideoPlayer.tsx     # Reproductor video
├── context/                # React Context providers
│   └── GlobalAudioContext.tsx # Estado global de audio
├── lib/                    # Utilidades y acceso a datos
│   ├── null-safe.ts        # Helpers tipados para null-safety
│   ├── db.ts               # Cliente SQLite (better-sqlite3)
│   ├── turso.ts            # Cliente Turso remoto
│   ├── validations.ts      # Esquemas Zod
│   ├── utils.ts            # cn(), formatDate()
│   └── web-audio.ts        # Web Audio API context
├── types/                  # TypeScript interfaces
│   └── music.ts            # Track, Artist, Metrics, ProductionDetails, StemsUrls
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
| Audio | Web Audio API |

## Componentes UI

- **EPKCard** — Tarjeta responsiva con portada, título, duración, streams, saves, AudioPlayer integrado
- **AudioPlayer** — Controles play/pause con estado visual y null-safety en `src`
- **AudioVisualizer** — Visualizador de forma de onda en tiempo real (Canvas + Web Audio API)
- **GlobalAudioPlayer** — Reproductor persistente en header con estado global
- **ProductionDetails** — Grid con DAW, guitarras, efectos, afinación, tonalidad (null-safe via `hasValue`/`safeString`)
- **LyricsModal** — Modal animado Framer Motion con null-check para letras opcionales
- **MetricsCharts** — Gráfico de barras (top países) + pie chart (streams/saves/playlists)
- **TrackFilters** — Búsqueda por texto + filtro por tipo de release
- **Header** — Navegación sticky con blur backdrop + ThemeToggle + GlobalAudioPlayer
- **ThemeToggle** — Toggle Dark/Light mode sin dependencias externas (evita hydration mismatch)
- **MotionWrappers** — Animaciones Pitch Deck: SlideIn (stagger), PageTransition, LiftCard (hover), PitchHeading
- **EPKExporter** — Exportador dossier EPK en JSON/HTML con preview y animaciones Framer Motion
- **DownloadCenter** — Centro de descargas con stems, assets, PDF
- **ImageGallery** — Galería responsive con lightbox, lazy load
- **VideoShowcase** — Fachada ligera de videoclip con thumbnail YouTube + modal
- **VideoPlayerModal** — Modal reproductor YouTube/embed iframe
- **StemsPlayer** — Mezclador multicanal 4 canales (Voz, Guitarras, Bajo, Batería) con Mute/Solo/Volume sync
- **VideoPlayer** — Reproductor video embebido

## Null-Safety

Campos protegidos contra `TypeError: Cannot read properties of undefined` (auditados con skill `validar-null-safety`):

| Campo | Tipo | Protección | Componente |
|-------|------|------------|------------|
| `youtube_video_id` | `string \| null` | Renderizado condicional | EPKCard, TrackDetail, VideoShowcase |
| `effects_chain` | `string \| null` | Fallback "—" via `safeString()` | ProductionDetails |
| `lyrics` | `string \| null` | Botón deshabilitado si null | LyricsModal |
| `metrics.top_countries` | `Array<{country, pct}>` | `safeArray()` con fallback [] | MetricsCharts |
| `production_details.*` | `string \| null` | `hasValue()` por propiedad | ProductionDetails |
| `audio_preview_url` | `string` | Validación Zod + fallback silencioso | AudioPlayer, StemsPlayer |
| `itunes_track_id` | `string \| null` | Optional chaining | TrackDetail, EPKExporter |
| `stems_urls` | `StemsUrls \| null` | Null-check + fallback a main audio | StemsPlayer |
| `video_embed_url` | `string \| null` | Renderizado condicional | VideoShowcase |
| `gallery_images` | `string[] \| null` | `safeArray()` + fallback a cover | ImageGallery, EPKExporter |

## Quality Gates (cumplidos)

| Check | Herramienta | Umbral | Resultado |
|-------|-------------|--------|-----------|
| TypeScript Strict | `tsc --noEmit` | 0 errores | ✅ |
| Null-Safety UI | `validar-null-safety` skill | 100% campos opcionales | ✅ |
| MCP Health | `auditar-mcp` skill | 4/4 servidores | ✅ |
| E2E Pass Rate | Playwright | 13/13 passing | ✅ |
| Bundle Size | `next build` | < 250 KB JS | ✅ (208 KB) |
| Unit Tests | Vitest | 41/41 passing | ✅ |

## Ejecución Local

```bash
# Instalar dependencias
pnpm install

# Desarrollo
pnpm dev

# Tests
pnpm test:unit      # Vitest (41 tests passing)
pnpm test:e2e       # Playwright (13 tests passing)

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

- `data/music_catalog.db` — SQLite con tracks (fuente de verdad F0-F3, expandido F8-F9)
- `data/catalog.json` — Backup JSON
- `scripts/generate-more-data.ts` — Genera 16-20 tracks sintéticos de 4 artistas
- `scripts/seed-f9-catalog.ts` — F9 seed: 10 tracks con metadatos multimedia completos (iTunes covers HD, stems, video embed, gallery)
- `scripts/sync-to-turso.ts` — Sync bidireccional SQLite ↔ Turso

## Despliegue

Automático via GitHub Actions al hacer push a `main`:
- **CI Pipeline**: Typecheck + Lint + Unit Tests + Build
- **Deploy**: Vercel (preview en PRs, producción en main)
- **Data Sync**: Turso cron `0 */6 * * *` (cada 6 horas)
- **Export API**: `/api/export` genera dossier EPK en JSON/HTML

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