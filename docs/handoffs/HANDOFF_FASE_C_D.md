# HANDOFF: Fase C → Fase D

**Fecha:** 2026-08-30
**Fase Completada:** C — Upload de Artistas + Autocomplete
**Próxima Fase:** D — Likes + Notificaciones (Resend)
**Modelo Actual:** MiMo V2.5 Free
**Modelo Sugerido Siguiente:** MiMo V2.5 Free

---

## 📋 Estado del Proyecto

### ✅ Completado en Fase C

| Tarea | Archivos | Estado |
|-------|----------|--------|
| C1: Schema DB `track_submissions` | `types/music.ts`, `lib/db.ts` | ✅ |
| C2: API `/api/itunes-search` | `app/api/itunes-search/route.ts` | ✅ |
| C3: API `/api/submissions` CRUD | `app/api/submissions/route.ts` | ✅ |
| C4: UploadTrackForm autocomplete | `components/UploadTrackForm.tsx` | ✅ |
| C5: Página `/upload` | `app/upload/page.tsx` | ✅ |
| C6: Admin panel aprobar/rechazar | `app/admin/page.tsx` | ✅ |

### 🔑 Credenciales y Configuración
- **Admin**: admin@epk.local / admin123 (role: admin)
- **DB**: `data/music_catalog.db` — 6 tracks reales + tabla `track_submissions` vacía + tabla `users`
- **Auth**: bcryptjs 10 rounds, cookie httpOnly 7 días
- **Resend API Key**: Requerida para Fase D (configurar en `.env.local`)

### 🧪 Quality Gates — Todos PASS
```
TypeScript: 0 errores
Unit Tests: 41/41 passing
E2E Tests: 13/13 passing
Build: ✅
```

---

## 🎯 Próxima Fase: D — Likes + Notificaciones

### Tareas (MASTER_PLAN.md sección 13.5)

| # | Tarea | Archivos | Modelo |
|---|-------|----------|--------|
| D1 | Schema DB: tabla `likes` | `lib/db.ts` | MiMo V2.5 |
| D2 | API `/api/likes` — toggle + count | `app/api/likes/route.ts` | MiMo V2.5 |
| D3 | Botón like en EPKCard | `components/EPKCard.tsx` | MiMo V2.5 |
| D4 | Configurar Resend: `lib/resend.ts` | `lib/resend.ts` | MiMo V2.5 |
| D5 | API `/api/notifications/send` | `app/api/notifications/send/route.ts` | MiMo V2.5 |
| D6 | Templates email | `lib/email-templates.ts` | MiMo V2.5 |
| D7 | Toast system | `components/Toast.tsx` | MiMo V2.5 |
| D8 | Integrar notificaciones en admin | `app/admin/page.tsx` | MiMo V2.5 |
| D9 | Badge "Nuevo Lanzamiento" | `components/EPKCard.tsx` | trivial |
| **Cierre** | quality gates + AI_LOG + commit + **release v2.3.0** | — | crear-release |

---

## 🔧 Contexto Técnico Clave

### Nuevos Tipos (types/music.ts)
```typescript
type SubmissionStatus = "pending" | "approved" | "rejected";

interface TrackSubmission {
  id: string;
  user_id: string;
  track_data: string; // JSON
  status: SubmissionStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}
```

### Nuevas Funciones DB (lib/db.ts)
- `createTrackSubmission()`
- `getTrackSubmissionById()`
- `getTrackSubmissionsByUser()`
- `getAllTrackSubmissions()`
- `getTrackSubmissionsByStatus()`
- `updateTrackSubmissionStatus()`

### Endpoints Nuevos
- `GET /api/itunes-search?term=...` — Proxy iTunes
- `GET /api/submissions?user_id=...|status=...|id=...` — Listar
- `POST /api/submissions` (header `x-user-id`) — Crear
- `PATCH /api/submissions?id=...` — Update status (admin)

---

## ⚠️ Riesgos / Notas para Fase D

1. **Resend API Key** — Configurar `RESEND_API_KEY` en `.env.local` y GitHub Secrets
2. **Like toggle** — Requiere auth context (usar `useAuth()` hook)
3. **Email templates** — Usar Resend React Email o HTML simple
4. **Toast** — Considerar `sonner` o implementación propia con portal
5. **Admin notifications** — Extender panel admin con pestaña "Notificaciones"

---

## 🚀 Comando para Ejecutar Fase D
```
/fase D
```

---

**Preparado por:** fase-orchestrator (MiMo V2.5 Free)
**Para:** Próximo agente (MiMo V2.5 Free sugerido)