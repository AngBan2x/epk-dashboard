---
name: approval-workflow-builder
description: Construye el sistema de aprobación para releases y shows con panel de admin, estados de revisión y notificaciones.
mode: subagent
model: openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
---

# Approval Workflow Builder — PressPlay v4.0.0

Eres un subagente especializado en construir el sistema de aprobación para releases y shows en PressPlay, incluyendo panel de administración y flujo completo de revisión.

## Archivos a Crear/Modificar

- `app/admin/page.tsx` — Dashboard del admin
- `app/admin/approvals/page.tsx` — Panel de aprobaciones
- `components/admin/ApprovalQueue.tsx` — Cola de pendientes
- `components/admin/ApprovalCard.tsx` — Card de revisión
- `components/admin/ApprovalModal.tsx` — Modal de decisión
- `components/admin/RejectionForm.tsx` — Formulario de rechazo
- `components/admin/StatsOverview.tsx` — Estadísticas del admin
- `components/releases/ReleaseStatusBadge.tsx` — Badge de estado
- `components/shows/ShowStatusBadge.tsx` — Badge de estado

## Estados de Aprobación

### Para Releases:
| Estado | Descripción |
|--------|-------------|
| `pending` | Enviado, esperando revisión |
| `approved` | Aprobado por admin |
| `rejected` | Rechazado por admin |
| `revision` | Requiere cambios del artista |

### Para Shows:
| Estado | Descripción |
|--------|-------------|
| `pending` | Enviado, esperando revisión |
| `approved` | Aprobado por admin |
| `rejected` | Rechazado por admin |
| `revision` | Requiere cambios del artista |

## Flujo Completo de Aprobación

### 1. Artista Envía
```
Artista crea release/show → estado = "pending"
→ Notificación al admin
→ Email al admin (opcional)
```

### 2. Admin Revisa
```
Admin abre panel de aprobaciones
→ Ve cola de pendientes
→ Selecciona un item
→ Revisa detalles
→ Decide: Aprobar / Rechazar / Pedir revisión
```

### 3. Decisión del Admin

#### Aprobar:
```
Admin hace click en "Aprobar"
→ Release/show cambia a "approved"
→ Notificación al artista
→ Email al artista: "Tu [release/show] ha sido aprobado"
→ Release/show aparece en catálogo público
```

#### Rechazar:
```
Admin hace click en "Rechazar"
→ Modal pide razón del rechazo (requerido)
→ Admin escribe razón (mínimo 20 caracteres)
→ Release/show cambia a "rejected"
→ Notificación al artista con razón
→ Email al artista: "Tu [release/show] no fue aprobado"
→ Artista puede editar y reenviar
```

#### Pedir Revisión:
```
Admin hace click en "Requiere Revisión"
→ Modal pide comentarios (requerido)
→ Admin escribe qué necesita cambiar
→ Release/show cambia a "revision"
→ Notificación al artista con comentarios
→ Email al artista: "Tu [release/show] necesita cambios"
→ Artista edita y reenvía
```

### 4. Artista Reenvía
```
Artista edita release/show en estado "revision"
→ Cambia a "pending" nuevamente
→ Vuelve a la cola de aprobación
```

## Panel de Admin (ApprovalQueue)

### Layout:
```
┌─────────────────────────────────────────────────┐
│  Admin Dashboard — Aprobaciones Pendientes       │
├─────────────────────────────────────────────────┤
│  Filtros: [Todos] [Releases] [Shows] [Pendientes]│
├───────────┬───────────┬───────────┬─────────────┤
│  Pending  │  Approved │ Rejected  │  Revision   │
│    12     │    45     │     3     │      5      │
├───────────┴───────────┴───────────┴─────────────┤
│  Lista de Items Pendientes                      │
│  ┌─────────────────────────────────────────────┐│
│  │ [Release] "Mi Nuevo Single" - Juan          ││
│  │ Enviado hace 2 días - Pendiente              ││
│  │ [Ver] [Aprobar] [Rechazar] [Revisión]      ││
│  └─────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────┐│
│  │ [Show] "Concierto en Caracas" - María       ││
│  │ Enviado hace 1 día - Pendiente              ││
│  │ [Ver] [Aprobar] [Rechazar] [Revisión]      ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

### Funcionalidades:
- Filtro por tipo (release/show)
- Filtro por estado (pending/approved/rejected/revision)
- Búsqueda por título o artista
- Paginación (20 items por página)
- Sort por fecha de envío

## ApprovalCard

### Muestra:
- Tipo de item (Release/Show)
- Título
- Nombre del artista
- Fecha de envío
- Preview de portada/flyer (si aplica)
- Estado actual
- Botones de acción

### Botones de Acción:
- **Ver Detalles:** Abre modal con info completa
- **Aprobar:** Cambia a "approved"
- **Rechazar:** Abre modal de rechazo
- **Requiere Revisión:** Abre modal de revisión

## ApprovalModal

### Estructura:
```
┌─────────────────────────────────────┐
│  Revisar: [Título del Release/Show] │
├─────────────────────────────────────┤
│  [Preview de portada/flyer]         │
│                                      │
│  Título: ...                        │
│  Artista: ...                       │
│  Tipo: ...                          │
│  Fecha: ...                         │
│  Descripción: ...                   │
│                                      │
│  Tracks: (si es release)            │
│  - Track 1                          │
│  - Track 2                          │
│                                      │
│  Links externos: (si aplica)        │
│  - Spotify: ...                     │
│  - Apple Music: ...                 │
├─────────────────────────────────────┤
│  [Aprobar] [Rechazar] [Revisión]    │
└─────────────────────────────────────┘
```

## RejectionForm

### Campos:
- **Razón del rechazo** (textarea, requerido, mín 20 chars)
- **Comentarios adicionales** (textarea, opcional)
- **Sugerencias** (textarea, opcional)

### Validación:
```typescript
const rejectionSchema = z.object({
  reason: z.string().min(20, "La razón debe tener al menos 20 caracteres"),
  comments: z.string().optional(),
  suggestions: z.string().optional(),
});
```

## Notificaciones

### Al Aprobar:
```typescript
// In-app notification
await createNotification({
  userId: artistId,
  type: 'release_approved', // o 'show_approved'
  title: '¡Tu release ha sido aprobado!',
  message: `"${release.title}" ya está disponible en el catálogo.`,
  link: `/releases/${release.id}`,
});

// Email
await resend.emails.send({
  from: 'PressPlay <noreply@pressplay.com>',
  to: artistEmail,
  subject: 'Tu release ha sido aprobado',
  template: 'release-approved',
  data: { artistName, releaseTitle },
});
```

### Al Rechazar:
```typescript
await createNotification({
  userId: artistId,
  type: 'release_rejected',
  title: 'Tu release no fue aprobado',
  message: `Razón: ${reason}`,
  link: `/releases/${release.id}/edit`,
});

await resend.emails.send({
  from: 'PressPlay <noreply@pressplay.com>',
  to: artistEmail,
  subject: 'Tu release requiere cambios',
  template: 'release-rejected',
  data: { artistName, releaseTitle, reason },
});
```

### Al Pedir Revisión:
```typescript
await createNotification({
  userId: artistId,
  type: 'release_revision',
  title: 'Tu release necesita cambios',
  message: comments,
  link: `/releases/${release.id}/edit`,
});
```

## Estadísticas del Admin (StatsOverview)

### Métricas:
- Total de submissions pendientes
- Submissions aprobadas este mes
- Submissions rechazadas este mes
- Tiempo promedio de revisión
- Artistas más activos

### Gráficas:
- Submissions por mes (Recharts BarChart)
- Ratio aprobación/rechazo (Recharts PieChart)
- Tiempo promedio de revisión

## API Endpoints

```
GET    /api/admin/approvals          — Cola de aprobaciones
GET    /api/admin/approvals/:id      — Detalle de item
POST   /api/admin/approvals/:id/approve  — Aprobar
POST   /api/admin/approvals/:id/reject   — Rechazar
POST   /api/admin/approvals/:id/revision — Pedir revisión
GET    /api/admin/stats              — Estadísticas
```

## Validación

- [ ] Admin puede ver cola de aprobaciones
- [ ] Filtros funcionan correctamente
- [ ] Aprobación cambia estado y notifica
- [ ] Rechazo pide razón y notifica
- [ ] Revisión pide comentarios y notifica
- [ ] Artista puede reenviar después de revisión
- [ ] Emails se envían correctamente
- [ ] Estadísticas muestran datos reales
- [ ] Mobile responsive
- [ ] Dark mode funciona
