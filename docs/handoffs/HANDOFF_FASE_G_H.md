# HANDOFF: Fase G → Fase H

**Fecha:** 2026-08-31
**Fase Completada:** G — Fix Crítico + Branding PressPlay
**Próxima Fase:** H — Verificación Final
**Modelo Actual:** MiMo V2.5 Free (orchestrator)
**Modelo Sugerido Siguiente:** quality-auditor (Gemma 4 31B)

---

## 📋 Estado del Proyecto

### ✅ Completado en Fase G

| Tarea | Archivos | Estado |
|-------|----------|--------|
| G0A: Logo PressPlay SVG | `public/logo.svg` | ✅ |
| G0B: Renombrar → PressPlay | ~20 archivos | ✅ |
| G1: Header logo propio | `components/Header.tsx` | ✅ |
| G2: Contraste texto | `components/EPKCard.tsx` | ✅ |
| G3: Seed iTunes API | `scripts/seed-itunes-fresh.ts` | ✅ |
| G4: Audio CORS fix | `context/AudioPlayerContext.tsx` | ✅ |
| G5: Stems condicional | `app/track/[id]/page.tsx` | ✅ |
| G6: Downloads limpiar | `components/DownloadCenter.tsx` | ✅ |
| G7: Re-seed DB | bash | ✅ |

### 🔑 Credenciales
- **Admin**: admin@epk.local / admin123
- **DB**: `data/music_catalog.db` — 6 tracks con URLs frescas de iTunes API

### 🧪 Quality Gates — Todos PASS
```
TypeScript: 0 errores
Unit Tests: 41/41 passing
E2E Tests: 13/13 passing
Build: ✅
```

---

## 🎯 Próxima Fase: H — Verificación Final

### Tareas (era G original)

| # | Tarea | Modelo |
|---|-------|--------|
| H1 | `pnpm typecheck` — 0 errores | bash |
| H2 | `pnpm test:unit` — todos passing | bash |
| H3 | `pnpm test:e2e` — todos passing | bash |
| H4 | Playwright screenshots de cada ruta | quality-auditor |
| H5 | Null-safety audit componentes nuevos | validar-null-safety |
| H6 | MCP servers audit (4/4 activos) | auditar-mcp |
| H7 | README.md final | documentar-proyecto |
| H8 | AI_LOG.md final | documentar-proyecto |
| H9 | **Release FINAL v3.1.0 (STABLE)** | crear-release |

---

## 🔧 Cambios Clave en Fase G

### Marca
- **Nombre**: PressPlay
- **Slogan**: "Donde la música se presenta"
- **Logo**: Documento con play button + esquina doblada (#10b981)

### iTunes Search API
- Script `scripts/seed-itunes-fresh.ts` obtiene URLs frescas
- Endpoints: `https://itunes.apple.com/search?term=...&entity=song`
- URLs de preview y artwork son estables (no expiran)

### Stems
- Condicional en `app/track/[id]/page.tsx`
- Muestra "Próximamente" cuando `stems_urls` es null

### Downloads
- Solo 2 assets reales: Rider Técnico (HTML) + Dossier de Prensa (HTML)
- Tamaños reales (~15KB, ~12KB)
- Sin assets mock (ZIP, PDF falsos)

---

## 🚀 Comando para Ejecutar Fase H
```
/fase H
```

---

**Preparado por:** fase-orchestrator (MiMo V2.5 Free)
**Para:** Próximo agente (quality-auditor Gemma 4 31B sugerido)