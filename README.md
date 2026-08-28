# EPK Dashboard Musical

Electronic Press Kit (EPK) Dashboard para artistas musicales. Interfaz web interactiva que muestra catálogo de tracks, métricas de streaming, fichas de producción y reproductor de audio.

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

- **EPKCard** — Tarjeta responsiva con portada, título, duración, streams, saves
- **AudioPlayer** — Controles play/pause con estado visual
- **ProductionDetails** — Grid con DAW, guitarras, efectos, afinación, tonalidad (null-safe)
- **LyricsModal** — Modal animado con null-check para letras opcionales
- **MetricsCharts** — Gráfico de barras (top países) + pie chart (streams/saves/playlists)
- **TrackFilters** — Búsqueda por texto + filtro por tipo de release
- **Header** — Navegación sticky con blur backdrop

## Null-Safety

Campos protegidos contra `TypeError: Cannot read properties of undefined`:
- `youtube_video_id` — Renderizado condicional
- `effects_chain` — Fallback "—" via `safeString()`
- `lyrics` — Botón deshabilitado si null
- `metrics.top_countries` — `safeArray()` con fallback []
- `production_details.*` — `hasValue()` por propiedad

## Ejecución Local

```bash
# Instalar dependencias
pnpm install

# Desarrollo
pnpm dev

# Tests
pnpm test:unit      # Vitest
pnpm test:e2e       # Playwright

# Typecheck
pnpm typecheck

# Build
pnpm build
pnpm start
```

## Datos

- `data/music_catalog.db` — SQLite con tracks
- `data/catalog.json` — Backup JSON
- `scripts/generate-more-data.ts` — Genera tracks sintéticos
- `scripts/sync-to-turso.ts` — Sync SQLite → Turso

## Despliegue

Automático via GitHub Actions al hacer push a `main`:
- Typecheck + Lint + Unit Tests + Build
- Deploy a Vercel
- Sync data a Turso (cron cada 6h)

## Licencia

Proyecto privado — Angel Bandres
