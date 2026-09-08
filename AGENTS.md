# EPK Dashboard Musical — PressPlay

> "Donde la música se presenta" — Electronic Press Kit platform

## Comandos del Proyecto

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | **NO usar npm run dev** (styled-jsx se resuelve mal via .pnpm) |
| `npx tsc --noEmit` | Typecheck |
| `pnpm build` | Build producción |
| `pnpm test:unit` | 41 tests (Vitest) |
| `npx playwright test` | Tests E2E |

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

- bcryptjs 10 rounds, httpOnly session cookie (base64 JSON)
- **Roles**: artist, admin, subscriber
- **Admin credentials**: admin@epk.local / admin123
- Token: `{ userId, role, iat, exp }` (exp = 24h si no rememberMe)

## Base de Datos

- **Dual-mode**: Turso (producción) o SQLite local (dev)
- **9 tablas**: users, artists, tracks, releases, shows, submissions, metrics_history, notifications, subscribers
- `lib/db.ts` — Funciones de negocio
- `lib/turso.ts` — Client Turso + schema migrations
- **REGLA**: Usar funciones de `lib/db.ts` en vez de `getDbWrite()` directo en API routes

## Reglas de Delegación (CRÍTICO)

Cuando el usuario reporte un bug o pida un fix:

1. **Evaluar complejidad**: ¿Es un cambio de 1-5 líneas o una feature nueva?
2. **Si es simple** (1-5 líneas, 1-3 archivos): Ejecutar directamente
3. **Si es complejo** (>5 líneas, >3 archivos): Delegar a subagente especializado
4. **Siempre en paralelo**: Usar `task()` con múltiples subagentes cuando los fixes son independientes
5. **NUNCA** hacer fixes directos sin considerar si un subagente es más adecuado

## Subagentes Disponibles (29)

### Builders (14)
| Subagente | Uso |
|-----------|-----|
| `api-builder` | Endpoints REST |
| `auth-builder` | Autenticación |
| `dashboard-builder` | UI/Components |
| `db-builder` | Schema DB |
| `landing-page-builder` | Landing page |
| `header-builder` | Header |
| `epk-card-builder` | EPK Cards |
| `carousel-builder` | Carousels |
| `approval-workflow-builder` | Aprobaciones |
| `show-form-builder` | Shows |
| `notification-builder` | Notificaciones |
| `search-builder` | Búsqueda |
| `subscriber-builder` | Suscriptores |
| `social-links-builder` | Links sociales |
| `account-settings-builder` | Configuración cuenta |
| `release-form-builder` | Formularios releases |
| `artist-dashboard-builder` | Dashboard artista |

### QA & Security (3)
| Subagente | Uso |
|-----------|-----|
| `quality-auditor` | Tests E2E |
| `visual-tester` | Screenshots/DOM |
| `security-auditor` | Seguridad |

### DevOps & Docs (3)
| Subagente | Uso |
|-----------|-----|
| `release-manager` | Releases |
| `vercel-deployer` | Deploy Vercel |
| `doc-writer` | Documentación |

### Orchestration (2)
| Subagente | Uso |
|-----------|-----|
| `orchestrator` | Coordinación general |
| `fase-orchestrator` | Orquestación por fases |

### Testing (2)
| Subagente | Uso |
|-----------|-----|
| `playwright-tester` | Tests E2E |
| `api-tester` | Testear endpoints |

### Database (1)
| Subagente | Uso |
|-----------|-----|
| `db-migrator` | Migraciones DB |

### Branding (1)
| Subagente | Uso |
|-----------|-----|
| `brand-fixer` | Branding |

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

## MCP Servers (14)

### Habilitados (8)
| Server | Tipo | Utilidad |
|--------|------|----------|
| filesystem | Local | Operaciones de archivos |
| sqlite | Local | Consultas SQLite |
| github | Local | GitHub API |
| playwright | Local | Automatización navegador |
| context7 | Remoto | Docs de frameworks |
| gh_grep | Remoto | Buscar código en GitHub |
| git | Local | Operaciones git |
| fetch | Local | Fetch de contenido web |

### Deshabilitados (6)
| Server | Tipo | Utilidad |
|--------|------|----------|
| sentry | Remoto | Error tracking |
| memory | Local | Memoria persistente |
| sequential-thinking | Local | Resolución problemas |
| plur | Remoto | Memoria persistente |
| novu | Remoto | Notificaciones |
| strac-dlp | Local | Detección PII |
| ctxfile | Local | Context snapshots |

## Custom Tools (6)

| Tool | Función |
|------|---------|
| `database-query` | Consultar SQLite/Turso |
| `check-types` | Ejecutar `tsc --noEmit` |
| `quality-gates` | typecheck + test + build |
| `seed-data` | Poblar DB con datos de prueba |
| `deploy-vercel` | Deploy a Vercel |
| `test-visual` | Screenshot con Playwright |

## Flujo de Trabajo

1. Investigar bugs con `explore` agent
2. Ejecutar fixes (directo o delegado según complejidad)
3. Verificar: `npx tsc --noEmit` + `pnpm build` + `pnpm test:unit`
4. Documentar en `docs/AI_LOG.md`
5. Commit con mensaje descriptivo
6. Push a main
7. Crear release si es fase completa

## Convenciones

- **Branch**: main
- **Commit**: conventional commits (feat:, fix:, docs:)
- **Releases**: `gh release create vX.Y.Z`
- **Docs**: actualizar AI_LOG.md con cada cambio significativo
- **Nunca remover TODOs** del MASTER_PLAN.md
- **Cover image priority**: uploaded > Spotify/Apple Music > YouTube thumbnail > default placeholder
