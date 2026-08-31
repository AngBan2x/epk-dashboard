# HANDOFF: Fase D → Fase E

**Fecha:** 2026-08-30
**Fase Completada:** D — Likes + Notificaciones (Resend)
**Próxima Fase:** E — Métricas + Webhooks
**Modelo Actual:** MiMo V2.5 Free (orchestrator)
**Modelo Sugerido Siguiente:** MiMo V2.5 Free

---

## 📋 Estado del Proyecto

### ✅ Completado en Fase D

| Tarea | Archivos | Estado |
|-------|----------|--------|
| D1: Schema DB `likes` + `notifications` | `types/music.ts`, `lib/db.ts` | ✅ |
| D2: API `/api/likes` toggle + count | `app/api/likes/route.ts` | ✅ |
| D3: Botón like animado EPKCard | `components/EPKCard.tsx` | ✅ |
| D4: Configurar Resend | `lib/resend.ts` | ✅ |
| D5: API `/api/notifications/send` | `app/api/notifications/send/route.ts` | ✅ |
| D6: Templates email | `lib/email-templates.ts` | ✅ |
| D7: Toast system | `components/Toast.tsx` | ✅ |
| D8: Notificaciones en admin | `app/admin/page.tsx` | ✅ |
| D9: Badge "Nuevo Lanzamiento" | `components/EPKCard.tsx` | ✅ |

### 🔑 Credenciales y Configuración
- **Admin**: admin@epk.local / admin123 (role: admin)
- **DB**: `data/music_catalog.db` — 6 tracks + users + track_submissions + likes + notifications
- **Resend**: `RESEND_API_KEY` en `.env.local` (opcional para desarrollo)

### 🧪 Quality Gates — Todos PASS
```
TypeScript: 0 errores
Unit Tests: 41/41 passing
E2E Tests: 13/13 passing
Build: ✅
```

---

## 🎯 Próxima Fase: E — Métricas + Webhooks

### Tareas (MASTER_PLAN.md sección 13.6)

| # | Tarea | Archivos | Modelo |
|---|-------|----------|--------|
| E1 | Schema DB: tabla `metrics_history` | `lib/db.ts` | MiMo V2.5 |
| E2 | API `/api/webhooks/metrics` | `app/api/webhooks/metrics/route.ts` | Nemotron 3 Ultra |
| E3 | Dashboard con métricas en tiempo real | `components/MetricsCharts.tsx` | MiMo V2.5 |
| E4 | Badge "Stems Disponibles" | `components/EPKCard.tsx` | trivial |
| E5 | Mostrar artist_name en todas las cards | `components/EPKCard.tsx` | trivial |
| **Cierre** | quality gates + AI_LOG + commit + **release v2.4.0** | — | crear-release |

---

## 🔧 Contexto Técnico Clave

### Nuevos Tipos (types/music.ts)
```typescript
type NotificationType = "submission_approved" | "submission_rejected" | "new_release" | "track_liked" | "system";

interface Like {
  id: string;
  user_id: string;
  track_id: string;
  created_at: string;
}

interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: string | null; // JSON
  read: boolean;
  created_at: string;
}
```

### Nuevas Funciones DB (lib/db.ts)
- `toggleLike(userId, trackId)` → `{ liked: boolean; count: number }`
- `getLikeCount(trackId)` → number
- `getUserLikes(userId)` → Like[]
- `hasUserLikedTrack(userId, trackId)` → boolean
- `createNotification()` / `getUserNotifications()` / `markNotificationAsRead()` / `markAllNotificationsAsRead()` / `getUnreadNotificationCount()`

### Endpoints Nuevos
- `GET /api/likes?track_id=...&user_id=...` — Count + liked status
- `POST /api/likes` (body: `{ track_id }`) — Toggle like
- `POST /api/notifications/send` — Enviar notificación + email
- `POST /api/notifications/read?id=...` — Marcar leída
- `POST /api/notifications/read-all` — Marcar todas leídas

### Components Nuevos
- `Toast.tsx` — ToastProvider + useToast() + useToastHelpers()
- `EPKCard.tsx` — Like button + badge "✨ Nuevo" (< 7 días)

---

## ⚠️ Riesgos / Notas para Fase E

1. **MetricsCharts** — Ya existe un componente base en `components/MetricsCharts.tsx`, necesita extensión
2. **Webhook API** — Endpoint para recibir métricas externas (Spotify, Apple Music)
3. **Stems badge** — Requiere verificar `track.stems_urls !== null`
4. **artist_name** — Ya existe en tipo Track, solo mostrar en cards donde no aparezca
5. **Resend API Key** — Para producción configurar `RESEND_API_KEY` y `FROM_EMAIL`

---

## 🚀 Comando para Ejecutar Fase E
```
/fase E
```

---

**Preparado por:** fase-orchestrator (MiMo V2.5 Free)
**Para:** Próximo agente (MiMo V2.5 Free sugerido)