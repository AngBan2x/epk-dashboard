# AI_LOG.md — Bitácora de Orquestación con IA

## Fase M: Turso Dual-Mode para Vercel (v3.6.0)

**Fecha:** 2026-09-01
**Modelo:** opencode/mimo-v2.5-free
**Agente:** fase-orchestrator

---

### Resumen Ejecutivo

Implementación del modo dual de base de datos para permitir deployment en Vercel:
- **Local:** better-sqlite3 con archivo `data/music_catalog.db`
- **Producción (Vercel):** @libsql/client conectando a Turso remoto

### Tareas Completadas

| # | Tarea | Estado | Archivos |
|---|-------|--------|----------|
| M1 | Fix next.config.js (Next.js 14) | ✅ | `next.config.js` |
| M2 | Turso Schema completo (8 tablas) | ✅ | `lib/turso.ts` |
| M3 | lib/db.ts Dual-Mode | ✅ | `lib/db.ts` |
| M4 | Seed Admin en Turso | ✅ | `scripts/seed-admin.ts` |
| M5 | Sync Todas las Tablas | ✅ | `scripts/sync-to-turso.ts` |
| M6 | Await en API routes y pages | ✅ | 19 archivos |
| M7 | Tests async | ✅ | `tests/unit/db.test.ts` |
| M8 | Fix seed-artists.ts | ✅ | `scripts/seed-artists.ts` |

### Cambios Técnicos Clave

1. **`next.config.js`**: `experimental.serverComponentsExternalPackages` → `serverExternalPackages` (requerido por Next.js 14)

2. **`lib/db.ts`**: Arquitectura dual-mode
   - Detecta `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`
   - Si existen: usa `@libsql/client` (async)
   - Si no: usa `better-sqlite3` (sync, wrapper en async)
   - Todas las funciones exportadas son `async` para uniformidad

3. **`lib/turso.ts`**: Schema completo 8 tablas
   - tracks (17 columnas, incluye campos multimedia F8)
   - artists (10 columnas, con user_id FK)
   - users, track_submissions, likes, notifications, metrics_history, shows
   - Sync functions para cada tabla

4. **API Routes**: Todas las llamadas a db.ts ahora usan `await`
   - 19 archivos modificados
   - Tipos corregidos (e.g., `ReturnType<typeof fn>` → tipos explícitos)

5. **Scripts**: seed-admin, sync-to-turso, seed-artists actualizados con async/await

### Errores Encontrados y Corregidos

1. `isTursoConfigured` no estaba exportado como función → corregido
2. `seed-artists.ts` no usaba await → corregido
3. `ReturnType<typeof getShowsByArtist>` causaba error TS → reemplazado con `Show[]`
4. Tests unitarios no usaban await → corregido

### Quality Gates

| Check | Resultado |
|-------|-----------|
| `pnpm typecheck` | ✅ 0 errores |
| `pnpm test:unit` | ✅ 41/41 passing (6 archivos) |
| Archivos modificados | 22 |
| Líneas añadidas | ~1200 |
| Líneas eliminadas | ~400 |

### Variables de Entorno Requeridas (Producción)

```env
TURSO_DATABASE_URL=libsql://epk-dashboard-[org].turso.io
TURSO_AUTH_TOKEN=eyJ...
```

### Instrucciones para Deploy en Vercel

1. Configurar `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` en Vercel Dashboard
2. Ejecutar `pnpm db:sync` para sincronizar datos locales a Turso
3. Push a main → Vercel deploy automático

---

## Fase N: QA Visual + E2E Flows (v3.7.0)

**Fecha:** 2026-09-01
**Modelo:** opencode/mimo-v2.5-free
**Agente:** fase-orchestrator

---

### Resumen Ejecutivo

QA visual completo de la aplicación PressPlay con:
- Exploración de todas las páginas (light/dark/mobile)
- Flujos E2E: admin, artista, registro/login/eliminar
- Fix de Turso schema (recreación completa de 8 tablas)
- Nueva feature: DELETE /api/auth/me para eliminar cuenta

### Tareas Completadas

| # | Tarea | Estado | Archivos |
|---|-------|--------|----------|
| N1 | Agente visual-tester | ✅ | `.opencode/agents/visual-tester.md` |
| N2 | Skill qa-visual | ✅ | `.opencode/skills/qa-visual/SKILL.md` |
| N3 | E2E: Explorar páginas | ✅ | `tests/e2e/phase-n-explore.spec.ts` (26 tests) |
| N4 | E2E: Flujo admin | ✅ | `tests/e2e/phase-n-admin.spec.ts` (7 tests) |
| N5 | E2E: Flujo artista | ✅ | `tests/e2e/phase-n-artist.spec.ts` (6 tests) |
| N6 | E2E: Register/Delete | ✅ | `tests/e2e/phase-n-register-delete.spec.ts` (4 tests) |
| N7-N8 | Análisis visual + fixes | ✅ | Correcciones aplicadas |
| N9 | Re-test | ✅ | Todos los tests passing |
| N10 | Documentación | ✅ | MASTER_PLAN.md + AI_LOG.md |

### Features Nuevas

1. **DELETE /api/auth/me**: Endpoint para eliminar cuenta de usuario
   - Limpia likes, notifications, track_submissions
   - Elimina artist profile y shows asociados
   - Limpia cookie de sesión

2. **deleteUser() en lib/db.ts**: Función dual-mode (SQLite + Turso)
   - Elimina datos relacionados en orden correcto (FK constraints)
   - Soporta ambos backends

3. **Turso Schema Recompleto**: 8 tablas recreadas con schema correcto
   - Fix: artists table tenía UNIQUE constraint en name
   - Fix: tracks table faltaba columna artist_name
   - Fix: shows table no existía

### Errores Encontrados y Corregidos

1. **Turso schema incompleto**: Las tablas se crearon originalmente sin columnas correctas → Recreación completa
2. **Register UNIQUE constraint**: createArtist fallaba si el nombre ya existía → try/catch graceful
3. **Admin login falla**: Users no existían en Turso → Sync manual de users + artists + tracks
4. **Dashboard h1**: Test fallaba porque el h1 se renderiza después de cargar datos → Wait function added

### Quality Gates

| Check | Resultado |
|-------|-----------|
| `pnpm typecheck` | ✅ 0 errores |
| `pnpm test:unit` | ✅ 41/41 passing |
| E2E N3: Explore pages | ✅ 26/26 passing |
| E2E N4: Admin flow | ✅ 7/7 passing |
| E2E N5: Artist flow | ✅ 6/6 passing |
| E2E N6: Register/Delete | ✅ 4/4 passing |
| E2E existing tests | ✅ 2/2 passing |
| Total E2E tests | ✅ 45/45 passing |

### Screenshots Capturados

| Directorio | Contenido |
|------------|-----------|
| `screenshots/light/` | home, dashboard, login, register, artists, track-detail |
| `screenshots/dark/` | home, dashboard, login, register, artists, track-detail |
| `screenshots/mobile/` | home, dashboard, login, register, artists, track-detail |
| `screenshots/admin/` | dashboard-admin, admin-panel, admin-tracks, admin-artists, admin-shows, admin-notifications, admin-dark |
| `screenshots/artist/` | artist-dashboard, artist-tracks, artist-bio, artist-shows, artist-dark, artist-mobile |
| `screenshots/register-delete/` | register-form, after-register, after-login, after-delete, deleted-account-login |
