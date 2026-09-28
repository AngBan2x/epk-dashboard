# Security Audit Report — EPK Dashboard (PressPlay) — Post P5/P6

**Scope**: Full audit of auth, middleware, API routes, upload, rate limiting, SQL injection, XSS, secrets.  
**Environment**: Dev server on localhost:3000 with `.env.local` pointing to **production Turso** (read-only audit, no writes).  
**Date**: 2026-09-27

---

## Executive Summary

| Severity | Count |
|----------|-------|
| **Crítica** | 1 |
| **Alta** | 0 |
| **Media** | 3 |
| **Baja** | 2 |
| **Informativa** | 2 |

**Veredicto general**: La fase P5/P6 **no dejó riesgos críticos o altos abiertos** en la lógica de autorización, validación de ownership, rate limiting, upload o inyección. El único hallazgo **Crítico** es la presencia de secretos de producción en `.env.local` (archivo ignorado por git pero presente en disco). Los hallazgos Medios/Bajos son endurecimiento defensivo, no explotables en práctica.

---

## Hallazgos Críticos

| # | Archivo:Línea | Escenario de explotación | Explotable |
|---|---------------|--------------------------|------------|
| **C-1** | `.env.local:1-24` | El archivo contiene credenciales **reales de producción**: Turso DB URL + auth token, Resend API key, Unsplash, YouTube, LastFM, Cloudflare R2 (account ID, access key, secret key, bucket). Si el repositorio se clona en una máquina no confiable o se sube por error (p. ej. `git add .` forzado), un atacante obtiene acceso total a la BD, envío de emails, storage y APIs de terceros. | **Sí** — credenciales válidas en disco. Mitigado por `.gitignore` (líneas 26, 46), pero sigue en FS local. |

---

## Hallazgos Medios

| # | Archivo:Línea | Escenario de explotación | Explotable |
|---|---------------|--------------------------|------------|
| **M-1** | `lib/rate-limit.ts:3` (store en memoria) | Rate limit usa `Map` en memoria del proceso. En despliegue serverless (Vercel) cada invocación tiene su propio store → **bypass trivial** enviando requests a instancias distintas. Un atacante distribuido puede superar el límite sin 429. | **Teórico en prod (Vercel)** — en dev (single process) funciona. Requiere store externo (Redis/Upstash/KV) para ser efectivo en serverless. |
| **M-2** | `app/api/releases/route.ts:64-75` (GET `?user_id=`) | El endpoint permite `?user_id=` arbitrario. Si `session.role !== "admin" && session.userId !== userId` → `publicOnly = true` (solo `status='approved'`). **No filtra por ownership real** si el attacker conoce/guinea `user_id` ajeno: ve releases *aprobados* de ese usuario (datos públicos de catálogo). No expone borradores ni `user_id` interno, pero permite enumeración de catálogo ajeno. | **Parcial** — solo datos ya públicos (`approved`). No es fuga de datos sensibles, pero rompe principio de menor privilegio. |
| **M-3** | `app/api/admin/shows/[id]/route.ts:91-96` (revision sin reason en `approved` boolean) | El endpoint acepta `approved: boolean` **y** `action: "approve"|"reject"|"revision"`. Si se envía `approved: true` sin `action` ni `reason`, **aprueba sin motivo**. El schema exige `reason` solo para `action: "revision"` (línea 91). Un admin descuidado o script mal escrito podría aprobar sin dejar trazabilidad. | **Bajo** — requiere credenciales de admin. Es fallo de UX/validación, no escalada. |

---

## Hallazgos Bajos

| # | Archivo:Línea | Escenario de explotación | Explotable |
|---|---------------|--------------------------|------------|
| **L-1** | `middleware.ts:58` (`/releases/:id/edit` en `protectedPaths`) | El matcher del middleware **no incluye** `/releases/:id/edit` (solo `/releases/new`). La ruta `/releases/[id]/edit` existe en `app/releases/[id]/edit/` pero **no está protegida server-side**. El guard client-side en `page.tsx` redirige a login, pero un request directo a la API (`PUT /api/releases`) **sí valida ownership** (línea 218-222), así que no hay escritura indebida. Solo expone la UI de edición a usuarios sin sesión (ven página vacía/error). | **No** — API protege la escritura. Solo fuga de UI. |
| **L-2** | `app/api/auth/login/route.ts:16-22` (rate limit por IP only) | Login usa `checkRateLimit(\`login:${ip}\`, 5, 60s)` **sin userId**. Un atacante puede hacer 5 intentos desde una IP, rotar IP (VPN/proxy) y seguir probando credenciales. No hay bloqueo por cuenta (email). | **Teórico** — requiere rotación de IP. Mitigado por bcrypt 10 rounds (lento) y credenciales fuertes. |

---

## Hallazgos Informativos (Defensa en profundidad)

| # | Archivo:Línea | Observación |
|---|---------------|-------------|
| **I-1** | `lib/downloadable-assets.ts` (todo el archivo) | **XSS bien mitigado**: usa `escapeHtml` (de `lib/email-templates.ts:30-37`) en **todas** las interpolaciones de datos de usuario en HTML (`artistName`, `biography`, `pressText`, `website`, `lyrics`, `track.title`, `production_details`, etc.). `safeHref` valida `^https?://` antes de renderizar enlaces. No hay vectores `<script>`, `javascript:`, `onerror=`, etc. |
| **I-2** | `lib/db.ts` + todas las API routes | **SQLi inexistente**: todas las queries usan placeholders `?` (better-sqlite3 / @libsql/client). No hay concatenación de strings en SQL. Parámetros pasados como array separado. |

---

## Verificaciones de los Fixes P5/P6 (Confirmados ✅)

| Fix | Verificación | Estado |
|-----|--------------|--------|
| **S1** `/api/dashboard` y `/api/artists` filtran `status='approved'` para no-admin y ocultan `artists.user_id` | `app/api/dashboard/route.ts:24-31`, `app/api/artists/route.ts:22-40` | ✅ |
| **S2** `lib/auth.ts` siempre firma `exp`; `rememberMe` → 30 días | `lib/auth.ts:74-90`, `SESSION_MAX_AGE_REMEMBER` (línea 13) | ✅ |
| **S3** Rate limit (60s) en 5 endpoints + `429` con `Retry-After` | `lib/rate-limit.ts:40-68`, endpoints citados arriba | ✅ (salvo M-1 store en memoria) |
| **S4** `GET /api/releases?user_id=` ya no da 500 | `app/api/releases/route.ts:64-105` maneja `userId` vacío | ✅ |
| **S7** Fan-out en `PUT /api/tracks`, `PUT /api/releases`, `PUT /api/shows` | `app/api/tracks/route.ts:166-168`, `app/api/releases/route.ts:273-339`, `app/api/shows/route.ts:215-240` | ✅ |
| **S8** Upload valida extensión + magic bytes + MIME + fuerza `contentType` | `app/api/upload/image/route.ts:92-121, 166` | ✅ |
| **Roles** Registro público → solo `subscriber`; promoción en `POST /api/admin/approvals/[id]` | `app/api/auth/register/route.ts:58`, `app/api/admin/approvals/[id]/route.ts:136-146` | ✅ |
| **Split aprobaciones** `submissions` (artista, solo GET/POST propio) vs `approvals` (admin, writer único, reason ≥10) | `app/api/submissions/route.ts:101-102, 142-143`, `app/api/admin/approvals/[id]/route.ts:16-19, 91-96` | ✅ |
| **Cascadas** `deleteArtist`/`deleteUser` borran dependientes | `lib/db.ts:795-833` (cascada completa) | ✅ |

---

## Checklist de Auditoría (Resumen)

### Middleware
- [x] Rutas admin en matcher (`/admin/:path*`)
- [x] Rutas protegidas (`/profile`, `/account`, `/releases/new`, `/releases/:id/edit` — **falta `/releases/:id/edit` en matcher**, ver L-1)
- [x] Validación cookie `auth_session`
- [x] Verificación expiración `session.exp > Date.now()`
- [x] Verificación rol `session.role === "admin"`
- [x] Limpieza cookie expirada (`clearExpiredSession`)

### API Routes
- [x] POST/PUT/DELETE validan sesión (`validateRequest`)
- [x] Operaciones sensibles verifican rol (admin/artist)
- [x] Session viene de cookie httpOnly (no headers spoofable)
- [x] Errores retornan JSON (no HTML)

### Componentes Client-Side
- [x] `useAuth()` verificado antes de renderizar contenido sensible (`app/dashboard/page.tsx:94`, `app/releases/new/page.tsx:134-138`, `app/admin/page.tsx:152-156`)
- [x] Redirect si no hay sesión
- [x] Redirect si rol incorrecto (admin page)

### Escalada de Privilegios
- [x] Subscriber **no puede** crear releases/shows (403 en `/api/releases` POST línea 115, `/api/shows` POST línea 111)
- [x] Subscriber **no puede** aprobar/rechazar (endpoints admin requieren `role === "admin"`)
- [x] Artist **no puede** editar releases/shows de otro (ownership check en PUT/DELETE)
- [x] Upload de imágenes valida ownership del track/artist

### IDOR
- [x] Todas las rutas con `[id]` y `?id=`/`?artist_id=` validan ownership o son de solo lectura pública
- [x] `/api/submissions?id=` valida `submission.user_id === session.userId` (línea 101)
- [x] `/api/notifications/read?id=` valida `notification.user_id === session.userId` (línea 41)

### Fuga de Datos
- [x] `/api/dashboard` oculta `user_id` para no-admin (línea 9-10)
- [x] `/api/artists` oculta `user_id` para no-admin (línea 14-17)
- [x] `/api/tracks` GET filtra `status='approved'` para no-admin (línea 74-80)
- [x] `/api/releases` GET filtra por `visibilityClause` (línea 77)
- [x] `/api/search` solo devuelve campos públicos
- [x] No emails, `password_hash`, `admin_notes`, borradores en respuestas públicas

### Sesión
- [x] Middleware y APIs usan misma validación (`validateRequest` / `decodeSessionToken` / `isSessionValid`)
- [x] Token incluye `exp` e `invalidateSessionBefore`
- [x] No hay camino donde rol no se revalide (cada request valida cookie)

### Rate Limit
- [x] 5 endpoints devuelven 429 con `Retry-After`
- [x] Key incluye `userId` + `IP` (previene bypass por IP compartida)
- ⚠️ Store en memoria (M-1) — no efectivo en serverless multi-instancia

### Upload
- [x] Rechaza extensión no permitida (415)
- [x] Rechaza magic bytes inválidos (415)
- [x] Rechaza MIME declarado ≠ real (415)
- [x] Fuerza `contentType` en blob upload (línea 33)
- [x] Límite 5MB

### Inyección
- [x] SQL parametrizado en todos los cambios recientes
- [x] XSS mitigado en `downloadable-assets.ts` con `escapeHtml` + `safeHref`

### Secretos
- ❌ `.env.local` con secretos de producción en disco (C-1)
- [x] `.gitignore` ignora `.env*.local` y `.env*`
- [x] No secretos en código fuente ni logs de server (revisados `console.error` — solo mensajes genéricos)

---

## Recomendaciones Priorizadas

1. **Crítica**: Rotar **todas** las credenciales en `.env.local` (Turso, Resend, Unsplash, YouTube, LastFM, R2) y usar variables de entorno de Vercel / gestor de secretos en producción. No commitear nunca `.env.local`.
2. **Media**: Migrar rate limit a store externo (Upstash Redis / Vercel KV) para que funcione en serverless multi-instancia.
3. **Media**: En `GET /api/releases?user_id=`, requerir ownership o admin para ver *cualquier* release (incluyendo aprobados) de otro usuario, o documentar que es catálogo público intencional.
4. **Media**: En `PATCH /api/admin/shows/[id]`, exigir `reason` (mín 10 chars) también para `approved: true` cuando venga sin `action`, o deprecate `approved` boolean en favor de `action` obligatorio.
5. **Baja**: Añadir `/releases/:id/edit` al `matcher` del middleware (línea 89).
6. **Baja**: Añadir rate limit por email/cuenta en login (además de IP).
7. **Informativa**: Considerar CSP header para mitigar XSS residual en HTML generado (aunque `escapeHtml` cubre todo).

---

## Conclusión

**La fase P5/P6 cerró correctamente los vectores de escalada, IDOR, fuga de datos, rate limit, upload e inyección.**  
El único riesgo **Crítico** es operativo (secretos en disco local), no de código.  
**No hay hallazgos Altos abiertos.** Los Medios son limitaciones de arquitectura serverless (rate limit en memoria) y diseño de API pública (enumeración de catálogo ajeno), no vulnerabilidades explotables para acceso no autorizado o escritura indebida.