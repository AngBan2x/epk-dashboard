# PHASE P4 — Subscribers + Notifications + Search (SPEC EJECUTABLE)

**Estado:** pendiente (se ejecuta tras reinicio de opencode)
**Docs base:** auditoría fase P en `AI_LOG.md`, `MASTER_PLAN.md` P4.1–P4.7
**Regla:** Flujo Obligatorio de `AGENTS.md` en cada task.

## Alcance (P4.1–P4.8)

### P4.1 Rol suscriptor + registro
- `types/music.ts`: `role: "admin" | "artist" | "subscriber"`.
- `POST /api/auth/register`: acepta `role=subscriber` (default `artist` se mantiene).
- `app/register`: selector de tipo de cuenta (artista/suscriptor).
- `middleware.ts`: rama `subscriber` (bloquea crear releases/shows; permite leer + suscribirse).
- Criterio: registro subscriber → login → sin acceso a `/releases/new` ni `ShowForm`.

### P4.2 Sistema de suscripciones
- Botón suscribirse/darse de baja en `artists/[id]` + `app/subscriptions` (lista, prefs por artista: releases/shows/ambos).
- API: `GET/POST /api/subscriptions`, `DELETE /api/subscriptions/[id]`, `PATCH` prefs. Reusar `lib/db.ts` (ya existe CRUD).
- Promoción suscriptor→artista + artista-como-suscriptor (mismo `userId`, sin cuenta nueva).
- Borrado en cascada: `deleteUser` limpia `subscriptions` (FK huérfanas hoy).
- Criterio: suscribir → aparece en lista; prefs persisten; baja elimina; borrar usuario no deja huérfanas.

### P4.3 Notificaciones in-app
- `NotificationBell` (badge) + panel + `app/notifications` + polling 30s + prefs UI conectada a `app/account` (hoy ausentes).
- Nuevo `GET /api/notifications` (el 404 histórico de admin).
- Ownership en `read` por `id`; no castear campos vacíos.
- Criterio: bell con conteo, marcar leída, prefs guardan y filtran.

### P4.4 Email real (Resend)
- Disparo en triggers (no solo `/send` manual); `FROM_EMAIL` productivo; aviso visible si falta `RESEND_API_KEY` (hoy失败 silencioso).
- Templates para todos los tipos usados (incl. `system`).
- Criterio: evento → email real o error explícito en logs/UI admin.

### P4.5 Notificaciones aprobación/rechazo
- Unificar approval en un solo sistema (tracks.status canónico; submissions como vista o migrar).
- `approve/reject/revision` → `createNotification` + email al artista (hoy solo sistema A notifica).
- Criterio: artista recibe in-app + email al aprobar/rechazar; cola única sin duplicados.

### P4.6 Shows + transiciones + fan-out
- Endpoints mínimos `POST /api/shows/[id]/{postpone,cancel,reactivate}` + modales (motivo, reembolso, 48h).
- Reglas: pasado→`pasado` + aviso 1 semana; cancelado→aviso 48h + rehabilitar; `deleted_at` soft-delete real.
- Fan-out: posponer/cancelar/reactivar/nuevo show → notif + email a suscriptores del artista (respeta prefs) + aviso reembolso en cancelación.
- Disclaimer de pagos (P5.4 adelantado aquí por ser shows): banner en `ShowForm` — "el pago va al artista/organizador, PressPlay no responde por dinero perdido".
- Criterio: cancelar → suscriptores notificados; rehabilitar → notificados; pasado → aviso eliminación.

### P4.7 Búsqueda + orden
- `GET /api/search?q&scope&sort&order` (artists/releases/shows; LIKE + `q` min 2 chars + debounce 300ms cliente).
- `SearchBar` en header (desktop) + modal móvil; sort fecha/nombre asc/desc en artists/releases/shows (params URL).
- Revivir o eliminar `searchTracks`/`TrackFilters` (hoy muertos); fix `ITunesSearch` invisible y `venue_name` null-crash en `/shows`.
- Criterio: `q`≥2 → resultados <500ms; sort funciona y persiste en URL.

### P4.8 Broadcast plataforma (nuevo)
- `POST /api/admin/broadcast` (admin): in-app a todos + email opcional masivo (rate-limit + batch).
- Nuevo tipo `platform_release`. Respeta prefs globales.
- Criterio: publicar release plataforma → todos notificados; test con 3 usuarios.

## Matriz de notificaciones
| Trigger | Audiencia | In-app | Email |
|---|---|---|---|
| suscripción / baja | artista + suscriptor | ✅ | según prefs |
| release/show aprobado/rechazado | artista | ✅ | ✅ |
| nuevo release/show publicado | suscriptores (prefs) | ✅ | ✅ |
| show pospuesto/cancelado/reactivado | suscriptores + artista | ✅ | ✅ (+reembolso en cancel) |
| show pasado | artista (aviso 1 semana) | ✅ | ✅ |
| broadcast plataforma | todos | ✅ | opcional |

## Verificación por task
`tsc` + unit + build → local (matriz + funcional + headed + screenshots) → commit/push → prod igual → AI_LOG. Funcionales clave: suscribirse→publicar→recibir; cancelar→notificados+reembolso; broadcast→3 usuarios.
