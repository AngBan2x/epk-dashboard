# HANDOFF: Fase F → Fase G

**Fecha:** 2026-08-31
**Fase Completada:** F — UI/UX Final
**Próxima Fase:** G — Verificación Final
**Modelo Actual:** MiMo V2.5 Free (orchestrator)
**Modelo Sugerido Siguiente:** quality-auditor (Gemma 4 31B)

---

## 📋 Estado del Proyecto

### ✅ Completado en Fase F

| Tarea | Archivos | Estado |
|-------|----------|--------|
| F1: Header responsive | `components/Header.tsx` | ✅ Pre-existente |
| F2: Footer info + redes | `components/Footer.tsx` (NUEVO) | ✅ |
| F3: GlobalAudioPlayer auto-hide 5s | `components/GlobalAudioPlayer.tsx` | ✅ |
| F4: Logo SVG + metadata | `public/logo.svg`, `app/layout.tsx` | ✅ |
| F5: Renombrar plataforma | 14 archivos (24 ocurrencias) | ✅ Consistente |

### 🔑 Credenciales y Configuración
- **Admin**: admin@epk.local / admin123 (role: admin)
- **DB**: `data/music_catalog.db` — 6 tracks + users + track_submissions + likes + notifications + metrics_history
- **Resend**: `RESEND_API_KEY` en `.env.local` (opcional para desarrollo)

### 🧪 Quality Gates — Todos PASS
```
TypeScript: 0 errores
Unit Tests: 41/41 passing
E2E Tests: 13/13 passing
Build: ✅
```

---

## 🎯 Próxima Fase: G — Verificación Final

### Tareas (MASTER_PLAN.md sección 13.8)

| # | Tarea | Archivos | Modelo |
|---|-------|----------|--------|
| G1 | `pnpm typecheck` — 0 errores | — | bash |
| G2 | `pnpm test:unit` — todos passing | — | bash |
| G3 | `pnpm test:e2e` — todos passing | — | bash |
| G4 | Playwright MCP — screenshot de cada ruta | — | quality-auditor |
| G5 | Null-safety audit en componentes nuevos | — | validar-null-safety |
| G6 | MCP servers audit (4/4 activos) | — | auditar-mcp |
| G7 | README.md final | `README.md` | documentar-proyecto |
| G8 | AI_LOG.md final | `AI_LOG.md` | documentar-proyecto |
| G9 | **Release FINAL v3.0.0 (STABLE)** | — | crear-release |
| **Cierre** | handoff final + commit + push | — | git-workflow |

---

## 🔧 Contexto Técnico Clave

### Componentes Nuevos en Fase F
- `Footer.tsx` — Footer con info, links (dashboard, upload, admin), redes (Spotify, Apple Music, Instagram), copyright
- `public/logo.svg` — Logo SVG musical (doble nota en círculo verde #10b981)

### Componentes Modificados
- `GlobalAudioPlayer.tsx` — Auto-hide 5s → thin progress bar minimizado → expand on hover
- `layout.tsx` — +Footer, metadata template, favicon

### Endpoints (Acumulado)
- `/api/tracks` — CRUD tracks
- `/api/auth/*` — register, login, me, logout
- `/api/submissions` — CRUD submissions
- `/api/likes` — toggle like
- `/api/notifications/*` — send, read, read-all
- `/api/webhooks/metrics` — webhook métricas externas
- `/api/metrics/history` — historial para charts
- `/api/itunes-search` — proxy iTunes
- `/api/export` — export HTML EPK

---

## ⚠️ Riesgos / Notas para Fase G

1. **G4 Playwright screenshots** — Necesita servidor dev corriendo
2. **G5 Null-safety** — Revisar componentes nuevos: Footer, GlobalAudioPlayer auto-hide
3. **G6 MCP audit** — Verificar sqlite, filesystem, github, playwright
4. **G7-G8 README/AI_LOG** — Actualizar estado final del proyecto
5. **G9 Release v3.0.0** — STABLE release (todos tests deben pasar)

---

## 🚀 Comando para Ejecutar Fase G
```
/fase G
```

---

**Preparado por:** fase-orchestrator (MiMo V2.5 Free)
**Para:** Próximo agente (quality-auditor Gemma 4 31B sugerido)