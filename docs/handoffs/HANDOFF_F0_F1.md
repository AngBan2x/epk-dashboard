# HANDOFF F0 → F1
**Fecha:** 2026-08-28
**Modelo que ejecutó F0:** MiMo v2.5 Free (opencode)
**Modelo asignado para F1:** Nemotron 3 Ultra (opencode)

---

## 1. Estado Actual — Archivos Creados/Modificados

### Configuración del Proyecto
- `package.json` — Next.js 14, React 18, Tailwind, Recharts, Framer Motion, better-sqlite3, @libsql/client, Zod, Playwright, Vitest
- `tsconfig.json` — Strict mode, alias `@/*` configurado
- `next.config.js` — serverComponentsExternalPackages: better-sqlite3
- `tailwind.config.ts` — Colores primary + dark theme
- `postcss.config.js` — Tailwind + Autoprefixer
- `.eslintrc.json` — next/core-web-vitals
- `.prettierrc` — Semi, double quotes, 100 width
- `.gitignore` — node_modules, .next, .env*.local, test-results
- `.env.example` — TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, NEXT_PUBLIC_APP_URL

### Estructura App (App Router)
- `app/layout.tsx` — Root layout + Inter font + globals.css
- `app/globals.css` — Tailwind base + dark mode variables
- `app/page.tsx` — Redirect a /dashboard
- `app/dashboard/page.tsx` — Placeholder dashboard
- `app/dashboard/loading.tsx` — Suspense skeleton
- `app/track/[id]/page.tsx` — Placeholder track detail
- `app/track/[id]/not-found.tsx` — 404 con Link a dashboard
- `app/api/sync/route.ts` — POST endpoint placeholder

### Componentes UI
- `components/ui/Button.tsx` — Primary/secondary/ghost, sm/md/lg
- `components/ui/Card.tsx` — Card + CardHeader + CardContent
- `components/ui/Modal.tsx` — Dialog con backdrop + close
- `components/ui/Skeleton.tsx` — Animated pulse skeleton
- `components/EPKCard.tsx` — Tarjeta track con null-safe
- `components/AudioPlayer.tsx` — Audio con play/pause
- `components/ProductionDetails.tsx` — Acordeón ficha técnica
- `components/LyricsModal.tsx` — Modal null-safe para letra
- `components/MetricsCharts.tsx` — Recharts: barras (países) + pie (métricas)
- `components/TrackFilters.tsx` — Búsqueda + filtro release type
- `components/Header.tsx` — Nav sticky con logo

### Lib
- `lib/null-safe.ts` — safeString, hasValue, safeNumber, safeArray, safeDate, formatDuration, formatNumber
- `lib/db.ts` — getAllTracks, getTrackById (better-sqlite3, readonly)
- `lib/utils.ts` — cn (clsx+twMerge), formatDate

### Types
- `types/music.ts` — Track, Artist, Metrics, ProductionDetails, TopCountry, CatalogData

### Tests
- `tests/unit/null-safe.test.ts` — 15 tests cubriendo todos los helpers
- `tests/unit/db.test.ts` — 5 tests de conexión y parseo de DB
- `tests/e2e/dashboard.spec.ts` — Load dashboard + redirect
- `tests/e2e/track-detail.spec.ts` — Load detail + 404
- `tests/e2e/audio-playback.spec.ts` — Play button visible
- `tests/e2e/null-safety.spec.ts` — No console errors + null youtube_video_id

### Scripts
- `scripts/generate-more-data.ts` — Genera 16-20 tracks de 4 artistas sintéticos
- `scripts/sync-to-turso.ts` — Sync SQLite → Turso con better-sqlite3 + @libsql/client

### CI/CD
- `.github/workflows/deploy.yml` — Build + typecheck + lint + test + build
- `.github/workflows/sync-data.yml` — Cron cada 6h + manual dispatch

### Data
- `data/music_catalog.db` — SQLite con 2 tracks existentes
- `data/catalog.json` — Backup JSON

### Skills & Agents
- `.opencode/skills/auditar-mcp/SKILL.md`
- `.opencode/skills/documentar-proyecto/SKILL.md`
- `.opencode/skills/git-workflow/SKILL.md`
- `.opencode/skills/switch-context/SKILL.md`
- `.opencode/skills/validar-null-safety/SKILL.md`
- `.opencode/agents/epk-card-builder.md`
- `.opencode/commands/renderizar_epk.md`

---

## 2. Servidores MCP Utilizados en F0

| Servidor | Uso | Estado |
|----------|-----|--------|
| **SQLite** | `SELECT` test + `PRAGMA table_info` | ✅ OK (2 registros) |
| **GitHub** | `gh auth status` + `gh repo create` | ✅ OK (AngBan2x) |
| **Playwright** | `npx playwright --version` | ✅ OK (v1.62.1) |
| **Turso** | `turso auth whoami` | ✅ OK (angban2x) |

---

## 3. Siguiente Modelo Asignado

**F1: Capa de Datos & Tipado**
- **Modelo:** Nemotron 3 Ultra (opencode)
- **Rol:** Tipado estricto, inferencia de schemas JSON→TS, diseño de helpers type-safe, validación Zod

---

## 4. Instrucción de Continuidad (Prompt para F1)

```
Eres Nemotron 3 Ultra ejecutando la Fase F1 del proyecto EPK Dashboard Musical.

CONTEXTO: F0 completada. Ver HEADOFF_F0_F1.md para archivos creados.
REPOSITORIO: https://github.com/AngBan2x/epk-dashboard
BASE DE DATOS: data/music_catalog.db (tabla tracks, 2 registros)

TAREA F1 — Capa de Datos & Tipado:
1. Auditar types/music.ts existente vs schema real de SQLite
2. Refinar lib/db.ts con tipos exactos (evitar cast `as` innecesarios)
3. Crear lib/turso.ts con cliente Turso remoto + sync bidireccional
4. Agregar validación Zod para Track en lib/validations.ts
5. Actualizar lib/null-safe.ts con helpers adicionales si needed
6. Ejecutar tests unitarios: pnpm test:unit
7. Ejecutar typecheck: pnpm typecheck
8. Commit: "feat: add type-safe data layer with Zod validation"
9. Push a main

RESTRICCIONES:
- TypeScript strict: 0 errores, 0 warnings
- Todo campo nullable debe tener protección null-safe
- No usar `any` explícito
- Seguir convenciones existentes en lib/null-safe.ts
- Ejecutar validar-null-safety al finalizar
```

---

## 5. Registro en AI_LOG.md

*Entrada generada por switch-context skill — F0 completada 2026-08-28*
