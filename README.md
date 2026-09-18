# PressPlay

**Donde la música se presenta.**

Electronic Press Kit (EPK) para artistas musicales independientes. Plataforma completa con catálogo de tracks, métricas de streaming, shows, reproductor de audio y gestión de perfiles.

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 3 + Framer Motion 12 |
| Charts | Recharts 2 |
| DB Local | better-sqlite3 |
| DB Remoto | Turso (@libsql/client) dual-mode |
| Auth | bcryptjs + HMAC-SHA256 httpOnly cookies |
| Email | Resend |
| Validation | Zod 3 |
| Testing | Vitest + Playwright |
| Deploy | Vercel |
| Package Manager | pnpm |

## Arquitectura

```
app/
├── api/                    # Route Handlers (REST)
│   ├── artists/me/         # GET/PATCH perfil artista
│   ├── releases/           # CRUD releases
│   ├── shows/              # CRUD shows
│   ├── auth/               # Login, register, logout, me
│   ├── admin/              # Admin routes (approvals, releases)
│   ├── notifications/      # Notificaciones in-app
│   ├── submissions/        # Gestión de submissions
│   ├── likes/              # Sistema de likes
│   ├── metrics/            # Historial métricas
│   ├── itunes-search/      # Proxy iTunes API
│   ├── dossiers/           # Dossiers EPK
│   └── export/             # Export EPK dossier
├── dashboard/              # Artist dashboard
├── profile/                # Profile management
├── account/                # Account settings
├── releases/               # CRUD releases
│   └── new/                # Create release
├── shows/                  # Shows & Events listing
├── artists/                # Public artist catalog
│   └── [id]/               # Artist detail + EPK
├── track/[id]/             # Track detail
├── admin/                  # Admin panel
│   └── approvals/          # Submission approvals
├── login/                  # Login
├── register/               # Register
└── not-found.tsx           # 404 PressPlay branded
components/                 # UI components React
├── ui/                     # Primitivas: Button, Card, Modal, Skeleton
├── Header.tsx              # Navegación sticky con logo PressPlay
├── Footer.tsx              # Footer con info + redes
├── ThemeToggle.tsx         # Toggle Dark/Light mode
├── GlobalAudioPlayer.tsx   # Reproductor global con auto-hide
├── AudioPlayer.tsx         # Reproductor de audio
├── AudioVisualizer.tsx     # Visualizador de forma de onda
├── EPKCard.tsx             # Tarjeta principal por track
├── ShowForm.tsx            # Formulario CRUD shows (13 estados)
├── ShowsBooking.tsx        # Lista de shows con filtros
├── ImageGallery.tsx        # Galería de imágenes
├── VideoShowcase.tsx       # Fachada de videoclip
├── MetricsCharts.tsx       # Gráficos Recharts
├── TrackFilters.tsx        # Filtros de búsqueda
├── UploadTrackForm.tsx     # Formulario de subida
├── DossierEditor.tsx       # Editor de dossiers
├── ITunesSearch.tsx        # Búsqueda iTunes
├── StemsPlayer.tsx         # Mezclador multicanal
├── LoginModal.tsx          # Modal de login/registro
├── Toast.tsx               # Sistema de notificaciones
└── Providers.tsx           # Providers globales
context/                    # React Context providers
├── AudioPlayerContext.tsx  # Estado global de audio
└── AuthContext.tsx         # Estado de autenticación
lib/                        # Utilidades y acceso a datos
├── auth.ts                 # HMAC-SHA256 tokens, validateRequest()
├── db.ts                   # CRUD functions (2085 lines)
├── turso.ts                # Client Turso + schema migrations
├── rate-limit.ts           # In-memory rate limiter
├── null-safe.ts            # Helpers tipados para null-safety
├── itunes.ts               # API de iTunes Search
├── resend.ts               # Cliente Resend (email)
├── email-templates.ts      # Templates HTML email
├── validations.ts          # Esquemas Zod
├── utils.ts                # cn(), formatDate()
└── web-audio.ts            # Web Audio API context
types/
└── music.ts                # Track, User, Show, Release, etc.
middleware.ts                # Auth middleware (5 protected routes)
tests/                       # Unit + E2E tests
```

## Base de Datos

**Dual-mode**: Turso (producción) o SQLite local (dev). 10 tablas:

| Tabla | Descripción |
|-------|-------------|
| `users` | Usuarios con roles (artist, admin, subscriber) |
| `artists` | Perfiles de artistas |
| `tracks` | Catálogo musical con portadas y audio |
| `releases` | Singles, EPs, albums |
| `shows` | Shows & Events (13 estados, 21 columnas) |
| `submissions` | Envíos de tracks para aprobación |
| `metrics_history` | Historial de métricas de streaming |
| `notifications` | Notificaciones in-app |
| `subscribers` | Suscriptores a artistas |
| `dossiers` | Dossiers EPK personalizados |

## Funcionalidades

### Core
- **Catálogo de Tracks** — Tracks reales con portadas y audio de iTunes
- **Reproductor de Audio** — Preview 30s con auto-hide 5s + reproductor global
- **Dark/Light Mode** — Toggle con persistencia, anti-FOUC, CSS variables
- **Responsive** — Mobile-first con menú hamburguesa
- **Búsqueda** — Búsqueda en tiempo real

### Artistas
- **Dashboard del Artista** — Métricas, acciones rápidas, actividad reciente
- **Perfil Público** — EPK completo con bio, discografía, multimedia
- **Gestión de Shows** — CRUD shows con 13 estados automáticos
- **Upload de Tracks** — Formulario con autocomplete iTunes
- **Sistema de Likes** — Toggle like con animación

### Admin
- **Panel de Administración** — Gestión de tracks, releases, artists
- **Aprobar/Rechazar** — Workflow de submissions
- **Notificaciones** — Email transaccional via Resend + in-app

### Shows & Events
- **13 Estados** — proximamente, activo, pospuesto, hoy, pasado, cancelado, suspendido, confirmado, en_venta, agotado, reprogramado, disponible, finalizado
- **Filtros** — Por venue, ciudad, estado
- **Badges** — Colores por estado en light/dark mode

### EPK
- **Ficha de Producción** — DAW, guitarras, efectos, tonalidad
- **Letras** — Modal animado con null-safety
- **Métricas** — Gráficos en tiempo real (streams, países)
- **Video** — Embed de YouTube con modal
- **Galería** — Imágenes responsive con lightbox
- **Descargas** — Rider Técnico + Dossier de Prensa (HTML)
- **Exportación** — Dossier EPK en JSON/HTML

### Seguridad
- **HMAC-SHA256** — Tokens firmados con crypto.createHmac
- **Rate Limiting** — Login: 5/min, Register: 3/min, Notifications: 10/min
- **validateRequest()** — Helper compartido para auth en API routes
- **Zod Validation** — Validación en todos los endpoints
- **Middleware** — 5 rutas protegidas server-side (dashboard, profile, account, releases/new, admin)

### Branding
- **PressPlay** — "Donde la música se presenta"
- **Logo** — `components/icons/PressPlayLogo.tsx`
- **Paleta** — Indigo (#4f46e5), Violet (#8b5cf6), Pink (#ec4899), Emerald (#10b981)

## Credenciales

| Rol | Email | Password |
|-----|-------|----------|
| Admin | admin@epk.local | admin123 |
| Artista | angab06@gmail.com | 12345678 |

## Ejecución Local

```bash
# Instalar dependencias
pnpm install

# Desarrollo (IMPORTANTE: usar pnpm, NO npm)
pnpm dev

# Tests
pnpm test:unit           # Vitest (110 tests)
npx playwright test      # Playwright E2E

# Typecheck
npx tsc --noEmit

# Build (requiere max-old-space-size)
NODE_OPTIONS="--max-old-space-size=4096" pnpm build

# DB
pnpm db:seed             # Seed con URLs frescas de iTunes
pnpm db:seed:fresh       # Re-obtener URLs de iTunes API
pnpm db:seed:admin       # Crear usuario admin
```

## Quality Gates

| Check | Resultado |
|-------|-----------|
| TypeScript Strict | ✅ 0 errores |
| Unit Tests | ✅ 110/110 passing |
| Build | ✅ Success |
| Lint | ✅ 0 errors |
| Access Control | ✅ 5/5 rutas → 307 redirect |
| Dark Mode | ✅ Consistente en todos los modos |

## Release History

| Versión | Descripción |
|---------|-------------|
| v4.0.0-rc.12 | Dark Mode consistency — CSS vars, anti-FOUC |
| v4.0.0-rc.11 | Middleware expansion + dark mode fixes |
| v4.0.0-rc.10 | Critical build fix + production cleanup |
| v4.0.0-rc.9 | Next.js CVEs + ESLint + img→next/image |
| v4.0.0-rc.8 | Deep audit round 2 |
| v4.0.0-rc.7 | Security hardening (HMAC, rate limiting) |
| v4.0.0-rc.6 | Turso stale data fix |
| v4.0.0 | Full platform — shows, releases, subscribers |

## Documentación

| Archivo | Descripción |
|---------|-------------|
| `docs/AI_LOG.md` | Bitácora técnica completa |
| `MASTER_PLAN.md` | Plan maestro del proyecto |
| `AGENTS.md` | Configuración de agentes y subagentes |

## Environment Variables

```env
# Database (Turso production)
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...

# Auth
SESSION_SECRET=...  # HMAC-SHA256 secret

# Email
RESEND_API_KEY=re_...

# Vercel
VERCEL_ORG_ID=...
VERCEL_PROJECT_ID=...
```

## Licencia

Proyecto privado — Angel Bandres
