# HANDOFF: Fase E → Fase F

**Fecha:** 2026-08-30
**Fase Completada:** E — Métricas + Webhooks
**Próxima Fase:** F — UI/UX Final
**Modelo Actual:** Nemotron 3 Ultra Free (orchestrator)
**Modelo Sugerido Siguiente:** MiMo V2.5 Free

---

## 📋 Estado del Proyecto

### ✅ Completado en Fase E

| Tarea | Archivos | Estado |
|-------|----------|--------|
| E1: Schema DB `metrics_history` | `types/music.ts`, `lib/db.ts` | ✅ |
| E2: API `/api/webhooks/metrics` | `app/api/webhooks/metrics/route.ts` | ✅ |
| E3: Dashboard métricas tiempo real | `components/MetricsCharts.tsx` | ✅ |
| E4: Badge "Stems Disponibles" | `components/EPKCard.tsx` | ✅ |
| E5: Mostrar artist_name en cards | `components/EPKCard.tsx` | ✅ |

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

## 🎯 Próxima Fase: F — UI/UX Final

### Tareas (MASTER_PLAN.md sección 13.7)

| # | Tarea | Archivos | Modelo |
|---|-------|----------|--------|
| F1 | Header responsive con menú hamburguesa | `components/Header.tsx` | MiMo V2.5 |
| F2 | Footer info + redes + copyright | `components/Footer.tsx` (NUEVO) | MiMo V2.5 |
| F3 | GlobalAudioPlayer auto-hide 5s | `components/GlobalAudioPlayer.tsx` | MiMo V2.5 |
| F4 | Logo SVG + metadata/title | `public/logo.svg` (NUEVO) | MiMo V2.5 |
| F5 | Renombrar plataforma en todos los componentes | Múltiples archivos | MiMo V2.5 |
| **Cierre** | quality gates + AI_LOG + commit + **release v2.5.0** | — | crear-release |

---

## 🔧 Contexto Técnico Clave

### Nuevos Tipos (types/music.ts)
```typescript
interface MetricsHistory {
  id: string;
  track_id: string;
  date: string; // ISO date string
  streams: number;
  saves: number;
  playlist_additions: number;
  top_countries: TopCountry[];
  source: string; // e.g., "spotify", "apple_music", "webhook"
  created_at: string;
}
```

### Nuevas Funciones DB (lib/db.ts)
- `createMetricsHistory()`
- `getMetricsHistoryById()`
- `getMetricsHistoryByTrack()`
- `getMetricsHistoryByTrackAndDate()`
- `upsertMetricsHistory()` — UPSERT para webhooks

### Endpoints Nuevos
- `POST /api/webhooks/metrics` — Recibir métricas externas (auth HMAC futuro)
- `GET /api/webhooks/metrics?track_id=...` — Consultar historial
- `GET /api/metrics/history?track_id=...&limit=...` — Historial para charts

### Components Actualizados
- `MetricsCharts.tsx` — LineChart histórico + PieChart + BarChart + MetricCards
- `EPKCard.tsx` — Badge "🎚️ Stems" + artist_name visible

---

## ⚠️ Riesgos / Notas para Fase F

1. **Header** — Ya existe `Header.tsx`, necesita hamburger menu responsive
2. **Footer** — Componente nuevo, usar design system existente
3. **GlobalAudioPlayer** — Modificar auto-hide a 5s (actualmente puede estar fijo)
4. **Logo** — Crear `public/logo.svg` + actualizar `metadata.ts` / `layout.tsx`
5. **Renombrar** — Buscar "EPK Dashboard" y reemplazar con nombre final de marca

---

## 🚀 Comando para Ejecutar Fase F
```
/fase F
```

---

**Preparado por:** fase-orchestrator (Nemotron 3 Ultra Free)
**Para:** Próximo agente (MiMo V2.5 Free sugerido)