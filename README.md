# PressPlay

**Donde la música se presenta.**

Electronic Press Kit (EPK) para artistas musicales. Interfaz web interactiva que muestra catálogo de tracks, métricas de streaming, fichas de producción y reproductor de audio.

## Estado del Proyecto

| Versión | Fase | Estado |
|---------|------|--------|
| v1.0.0 | Setup inicial | ✅ Completado |
| v2.0.0 | Refactoring UI/UX | ✅ Completado |
| v2.0.1 - v2.5.0 | Fases A-F | ✅ Completado |
| v3.0.0 | Branding PressPlay + Fix Crítico | ✅ Completado |
| v3.1.0 | Verificación Final | ✅ Completado |

## Arquitectura

```
pressplay/
├── app/                    # Next.js App Router
│   ├── dashboard/          # Vista principal con lista de tracks
│   ├── track/[id]/         # Detalle completo por track
│   ├── upload/             # Subida de tracks por artistas
│   ├── admin/              # Panel de administración
│   ├── login/              # Inicio de sesión
│   ├── register/           # Registro de usuarios
│   └── api/
│       ├── tracks/         # CRUD tracks
│       ├── auth/           # Autenticación (register, login, me, logout)
│       ├── submissions/    # Gestión de submissions
│       ├── likes/          # Sistema de likes
│       ├── notifications/  # Notificaciones + email
│       ├── webhooks/       # Webhooks métricas externas
│       ├── metrics/        # Historial métricas
│       ├── itunes-search/  # Proxy iTunes API
│       └── export/         # Export EPK dossier
├── components/             # UI components React
│   ├── ui/                 # Primitivas: Button, Card, Modal, Skeleton
│   ├── EPKCard.tsx         # Tarjeta principal por track
│   ├── AudioPlayer.tsx     # Reproductor de audio
│   ├── AudioVisualizer.tsx # Visualizador de forma de onda
│   ├── GlobalAudioPlayer.tsx # Reproductor global con auto-hide
│   ├── ProductionDetails.tsx # Ficha técnica de producción
│   ├── LyricsModal.tsx     # Modal null-safe para letra
│   ├── MetricsCharts.tsx   # Gráficos Recharts (tiempo real)
│   ├── TrackFilters.tsx    # Filtros de búsqueda
│   ├── Header.tsx          # Navegación sticky con logo PressPlay
│   ├── Footer.tsx          # Footer con info + redes
│   ├── ThemeToggle.tsx     # Toggle Dark/Light mode
│   ├── LoginModal.tsx      # Modal de login/registro
│   ├── UploadTrackForm.tsx # Formulario de subida
│   ├── MotionWrappers.tsx  # Animaciones Framer Motion
│   ├── EPKExporter.tsx     # Exportador dossier EPK
│   ├── DownloadCenter.tsx  # Centro de descargas
│   ├── ImageGallery.tsx    # Galería de imágenes
│   ├── VideoShowcase.tsx   # Fachada de videoclip
│   ├── VideoPlayerModal.tsx # Modal reproductor video
│   ├── StemsPlayer.tsx     # Mezclador multicanal
│   ├── Toast.tsx           # Sistema de notificaciones
│   └── Providers.tsx       # Providers globales
├── context/                # React Context providers
│   ├── AudioPlayerContext.tsx # Estado global de audio
│   └── AuthContext.tsx     # Estado de autenticación
├── lib/                    # Utilidades y acceso a datos
│   ├── null-safe.ts        # Helpers tipados para null-safety
│   ├── db.ts               # Cliente SQLite (better-sqlite3)
│   ├── itunes.ts           # API de iTunes Search
│   ├── resend.ts           # Cliente Resend (email)
│   ├── email-templates.ts  # Templates HTML email
│   ├── validations.ts      # Esquemas Zod
│   ├── utils.ts            # cn(), formatDate()
│   └── web-audio.ts        # Web Audio API context
├── types/                  # TypeScript interfaces
│   └── music.ts            # Track, User, Metrics, etc.
├── middleware.ts            # Protección de rutas
├── tests/                  # Unit + E2E tests
├── scripts/                # Seed data, sync, screenshots
├── data/                   # SQLite DB
└── .opencode/              # Skills, agents, commands
```

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 3 |
| Charts | Recharts 2 |
| Animation | Framer Motion 12 |
| DB Local | better-sqlite3 |
| DB Remoto | Turso (@libsql/client) |
| Auth | bcryptjs + httpOnly cookies |
| Email | Resend |
| Validation | Zod 3 |
| Testing | Vitest + Playwright |
| Deploy | Vercel |

## Funcionalidades

### Core
- **Catálogo de Tracks** — 6 tracks reales con portadas y audio de iTunes
- **Reproductor de Audio** — Preview 30s con auto-hide 5s
- **Dark/Light Mode** — Toggle con persistencia
- **Responsive** — Mobile-first con menú hamburguesa

### Artistas
- **Upload de Tracks** — Formulario con autocomplete iTunes
- **Dashboard del Artista** — Métricas y gestión de tracks
- **Sistema de Likes** — Toggle like con animación

### Admin
- **Panel de Administración** — Gestión de tracks y submissions
- **Aprobar/Rechazar** — Workflow de submissions
- **Notificaciones** — Email transaccional via Resend

### EPK
- **Ficha de Producción** — DAW, guitarras, efectos, tonalidad
- **Letras** — Modal animado con null-safety
- **Métricas** — Gráficos en tiempo real (streams, países)
- **Video** — Embed de YouTube con modal
- **Galería** — Imágenes responsive con lightbox
- **Descargas** — Rider Técnico + Dossier de Prensa (HTML)
- **Exportación** — Dossier EPK en JSON/HTML

### Branding
- **PressPlay** — "Donde la música se presenta"
- **Logo** — Documento con play button + esquina doblada (#10b981)

## Credenciales

| Rol | Email | Password |
|-----|-------|----------|
| Admin | admin@epk.local | admin123 |

## Ejecución Local

```bash
# Instalar dependencias
pnpm install

# Desarrollo
pnpm dev

# Tests
pnpm test:unit      # Vitest (41 tests)
pnpm test:e2e       # Playwright (13 tests)

# Typecheck
pnpm typecheck

# Build
pnpm build && pnpm start

# DB
pnpm db:seed        # Seed con URLs frescas de iTunes
pnpm db:seed:fresh  # Re-obtener URLs de iTunes API
pnpm db:seed:admin  # Crear usuario admin
```

## Quality Gates

| Check | Resultado |
|-------|-----------|
| TypeScript Strict | ✅ 0 errores |
| Unit Tests | ✅ 41/41 passing |
| E2E Tests | ✅ 13/13 passing |
| Null-Safety | ✅ Todos los campos opcionales protegidos |

## Documentación

| Archivo | Descripción |
|---------|-------------|
| `docs/AI_LOG.md` | Bitácora técnica completa |
| `docs/handoffs/` | Handoffs entre fases |
| `MASTER_PLAN.md` | Plan maestro del proyecto |

## Agentes y Skills

### Agentes (7)
- **fase-orchestrator** — Orquestador de fases (MiMo V2.5)
- **api-builder** — Endpoints REST (MiMo V2.5)
- **dashboard-builder** — UI/Components (Nemotron 3.5 Lightning)
- **auth-builder** — Autenticación (Nemotron 3 Ultra)
- **quality-auditor** — Tests E2E (Gemma 4 31B)
- **release-manager** — Git tags + releases (Nemotron 3.5 Lightning)

### Skills (10)
- `git-workflow`, `documentar-proyecto`, `validar-null-safety`, `auditar-mcp`
- `switch-context`, `optimizar-lighthouse`, `run-quality-gates`
- `fase-completa`, `crear-release`, `handoff-automatico`

### Commands
- `/fase <letra>` — Ejecuta una fase completa
- `/renderizar_epk` — Genera EPKCard para un track

## Licencia

Proyecto privado — Angel Bandres
