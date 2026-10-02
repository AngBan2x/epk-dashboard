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
├── db.ts                   # CRUD functions (2850 lines)
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

**Dual-mode**: Turso (producción) o SQLite local (dev). **10 tablas**:

| Tabla | Descripción |
|-------|-------------|
| `users` | Usuarios con roles (`artist`, `admin`, `subscriber`) y `deleted_at` para suspensión |
| `artists` | Perfiles de artistas. Se relacionan con `users` por `user_id`; **`tracks` se relaciona con `artists` por nombre, no por FK** |
| `tracks` | Catálogo musical **y** releases. No hay tabla `releases`: un release es una fila con `release_id IS NULL` y `track_number`/`disc_number` nulos |
| `shows` | Shows & Events (13 estados) |
| `track_submissions` | Envíos de un artista a la cola de revisión. **Es la tabla que `lib/artist-promotion.ts` lee para decidir si promueve** |
| `metrics_history` | Historial de métricas de streaming |
| `notifications` | Notificaciones in-app |
| `likes` | Likes de usuarios a pistas |
| `subscriptions` | Suscripciones de usuarios a artistas, con preferencias de aviso |
| `dossiers` | Dossiers EPK, rider técnico y datos de contacto por artista |

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
- **Middleware** — 8 rutas en el matcher, con `requireRole()` además del redirect: `/admin`, `/login`, `/register`, `/profile`, `/account`, `/releases/new`, `/releases/:id/edit`, `/submissions`. **Ojo: `/dashboard` no está en el matcher**; se protege por rama propia, igual que las dos últimas
- **Alcance de lectura** — los endpoints públicos nunca devuelven la fila cruda: pasan por `parseTrack`, que es una *whitelist* y no expone `admin_notes` (motivo interno de rechazo), `description` ni `genre`. El brazo privilegiado comprueba sesión y rol/propiedad **antes** de caer al público, no al revés

### Cuentas suspendidas
- `users.deleted_at` bloquea el login (403 `ACCOUNT_SUSPENDED`), invalida la sesión en `/api/auth/me` y saca al usuario del fan-out
- Recuperación con email + contraseña vía `PUT /api/user/settings` dentro de 30 días; `purgeExpiredDeletedUsers()` hace la purga

### Los tres roles
- `admin`, `artist`, `subscriber`. El registro público crea **solo `subscriber`**
- Un suscriptor entra a `/submissions` y envía releases/shows, que quedan siempre en `pending` y así aparecen en `/admin/approvals`
- Al aprobar su primer envío, `lib/artist-promotion.ts` cambia `users.role` a `artist` **y crea el perfil en `artists`**. Es idempotente
- `submissions` es el portal del artista; `approvals` es la consola del admin, con escritor único en `POST /api/admin/approvals/[id]` y motivo mínimo de 10 caracteres

### Multimedia
- **Reproductor con cola** — `playQueue()` + `next()`/`prev()` y avance automático al terminar, en modo YouTube (IFrame API) y HTML5. La cola vive en el contexto, no en la tarjeta
- **Precedencia de fuentes** — `preview` (100) > `spotify`/`apple_music` (90, no reproducibles) > `youtube` (50). Un padre multipista no es una fuente: monta la cola de sus hijas
- **`start_time`/`end_time` son offsets dentro de un vídeo**, no la duración de un preview. El reproductor distingue los dos espacios de coordenadas; sin esa distinción, un preview de 30 s hereda el final de capítulo del álbum y el scrubber salta de pista
- **Visualizador Web Audio** — bandas log-espaciadas, matemática en dBFS con suelo de ruido, y `crossOrigin` **condicional por origen**. `createMediaElementSource` sustituye la salida nativa del `<audio>`, así que el visualizador se niega a engancharse si el medio no es CORS-safe: perder barras es degradable, perder el audio no

### Descargas de prensa
- `POST /api/export` acepta `format: html|json|pdf` e `include: dossier|rider|catalog` → **9 combinaciones**, servidas desde un único grid de 3 filas × 3 botones
- `dossier` y `rider` exigen `artistId`; `catalog` funciona sin él como catálogo público de aprobados
- El PDF requiere `runtime = "nodejs"` y una fuente Noto Serif incrustada; `font: null` evita la carga dinámica de `standard-fonts/Helvetica`, que rompía el build en Vercel

### Modelo multi-pista
- Un release es una fila de `tracks` con `release_id IS NULL`; sus pistas la referencian con `release_id`. **No hay tabla `releases`**
- `disc_number` + `track_number` numeran; `start_time` es el *fallback* de orden y no puede eliminarse
- La duración de un padre es la suma de sus hijas, calculada con `sumDurations()`. Los `duration` en BD son texto (`"M:SS"`, `"H:MM:SS"`), y el parser tiene que(sumarlos) bien: destruir solo `[m, s]` hacía que `"1:02:03"` sumara 62 s
- Aprobar un release **cascadea a sus hijas** en la misma transacción

### Base de datos
- Dual-mode Turso (producción) / SQLite (local). La regla de AGENTS.md: **ramificar sobre `getTursoClientSync() !== null`**, nunca con dos fuentes de verdad, y abrir el handle local solo si no hay cliente
- `lib/turso.ts` lee `process.env` en tiempo de llamada. Con `const` al importar, el env que llega tarde (lo normal en Vercel) devolvía `null` y las rutas respondían 500
- `POST /api/sync` está **deshabilitado (410)**: era un `INSERT OR REPLACE` que omitía 7 columnas, incluida `admin_notes`, y su mapeo no incluía `status`, así que ejecutarlo revertía el catálogo aprobado entero a `draft`

### Branding
- **PressPlay** — "Donde la música se presenta"
- **Logo** — `components/icons/PressPlayLogo.tsx`
- **Paleta** — Indigo (#4f46e5), Violet (#8b5cf6), Pink (#ec4899), Emerald (#10b981). Solo `primary` (rosa) es token propio en `tailwind.config.ts`; las otras tres son la paleta por defecto de Tailwind

## Credenciales

> **No se versionan credenciales reales en este repositorio.** Para development, definiendo en tu `.env.local` y creándolas con los scripts de seed.

| Rol | Cómo obtenerla |
|-----|----------------|
| Admin | `pnpm db:seed:admin` (crea `admin@epk.local` con la contraseña que definas en el entorno) |
| Artista | `POST /api/auth/register` + una aprobación desde `/admin/approvals` |

⚠️ Si alguna vez hubo una credencial real en este fichero, **borrarla no basta**: sigue en el historial de git. Hay que rotar la contraseña en la app **y** rehacer el historial con `git filter-repo`.

## Ejecución Local

> Requiere **Node 24**. `better-sqlite3` está compilado para ABI 137; no ejecutar `pnpm rebuild` ni `pnpm install` sin revisar el binario.

```powershell
# Instalar dependencias
pnpm install

# Desarrollo (IMPORTANTE: usar pnpm, NO npm)
pnpm dev

# Tests (--no-file-parallelism es obligatorio: ver AGENTS.md)
npx vitest run --no-file-parallelism
npx playwright test      # Playwright E2E, requiere servidor en :3100

# Typecheck y lint
npx tsc --noEmit
npx next lint

# Build (PowerShell: la sintaxis de env var POSIX no funciona)
$env:NODE_OPTIONS="--max-old-space-size=4096"; pnpm build

# DB
pnpm db:seed             # Seed con URLs frescas de iTunes
pnpm db:seed:fresh       # Re-obtener URLs de iTunes API
pnpm db:seed:admin       # Crear usuario admin
```

### Scripts de datos

Todos con **dry-run por defecto**; escriben solo con `--apply`.

| Script | Qué hace |
|--------|----------|
| `scripts/turso-check.ts` | Higiene de datos por SQL directo. **Es la fuente de verdad**, no las lecturas de API (la réplica va retrasada) |
| `scripts/fetch-itunes-covers.ts` | Carátulas reales vía iTunes `entity=album`, con revisión visual antes de aplicar |
| `scripts/fetch-itunes-previews.ts` | Previews de 30 s de iTunes. **Verifica HTTP cada URL antes de escribir**: las del seed eran URLs muertas (404) |
| `scripts/fetch-cover-art.ts` | Artwork real vía Cover Art Archive, para los releases que iTunes no resuelve |
| `scripts/fetch-deezer-previews.ts` | Deezer. **No persiste los previews**: la URL va firmada por Akamai y caduca a los 900 s, así que hay que resolverla en tiempo de ejecución |
| `scripts/fetch-official-videos.ts` | Vídeos del canal oficial verificado del artista |
| `scripts/fix-seed-data.ts` | Corrige erratas y drifts de timestamps ya sembrados |
| `scripts/qa-cleanup.ts` | Limpia datos de QA de producción |

## Quality Gates

| Check | Resultado |
|-------|-----------|
| TypeScript Strict | ✅ 0 errores |
| Unit Tests | ✅ 1146/1146 en 61 archivos (secuencial) |
| Lint | ✅ 0 errores, 0 warnings |
| Build | ✅ Success |
| Dark Mode | ✅ Consistente en todos los modos |

## Release History

| Versión | Descripción |
|---------|-------------|
| v4.0.0-rc.31 | Cierre de fugas S0, cola de audio, descargas por artista, catálogo real con artwork de iTunes y Cover Art Archive |
| v4.0.0-rc.30 | Ficha de álbum con tracklist, ficha técnica legible, PDF de prensa con fuente incrustada |
| v4.0.0-rc.29 | Catálogo multi-track, rejilla de releases, aprobaciones y shows con identidad de marca |
| v4.0.0-rc.28 | Tranches 0-4: cuentas, seguridad, rendimiento, a11y, CI y SEO |
| v4.0.0-rc.27 | P5/P6: UI, roles, flujo suscriptor→artista, seguridad y a11y |
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
