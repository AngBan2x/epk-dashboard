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
