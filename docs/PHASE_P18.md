# FASE P18 — La sesión caduca, se suspende y se degrada

**Período:** 2026-11-28 → 2026-11-28  **Estado:** completada  
**Rama:** main  **Issue:** — (auditoría sobre `main`, sin issue asociada)  **Commits:** (se completa al cerrar)

## Qué es esta fase

P18 es una fase de **revisión y documentación** del ciclo de vida de las sesiones de autenticación de PressPlay. No añade funcionalidad nueva: confirma que cada puerta del ciclo de vida está cubierta por código existente, identifica la deuda real y la declara.

Las cuatro preguntas que responde:

1. **¿La sesión expira?** Sí. El token lleva `exp` siempre (24 h, o 30 días con `rememberMe`), `isSessionValid()` lo rechaza pasado el plazo, `validateRequest()` lo exige en cada ruta y el middleware limpia la cookie cuando el token está expirado.
2. **¿Se invalida tras un cambio de rol?** Parcialmente. Existen `invalidateSessionBefore`, `reissueSessionToken` y `needsReissue()`; el login pone `invalidateSessionBefore: now` para matar sesiones previas al re-logueo; pero cuando `promoteUserToArtist()` sube a un suscriptor a `artist`, **no se reemite su token**, así que su sesión activa sigue con `role: subscriber` hasta que expira o vuelve a loguearse. Declarado como deuda (ver P18.6).
3. **¿Las cuentas suspendidas bloquean?** Sí. `users.deleted_at` devuelve 403 `ACCOUNT_SUSPENDED` en el login, `GET /api/auth/me` devuelve 403 y borra la cookie, y `PUT /api/user/settings` restaura dentro de los 30 días de gracia verificando email + contraseña.
4. **¿Se purgan los usuarios eliminados?** Sí. `purgeExpiredDeletedUsers(graceDays = 30)` borra físicamente (con cascada de dependencias vía `deleteUser`) las cuentas con `deleted_at` más viejo de 30 días.

## Mapa del ciclo de vida (código vivo)

| Momento | Qué ocurre | Dónde |
|---------|-----------|-------|
| Login válido | bcrypt 10 rounds, `invalidateSessionBefore: now` (mata sesiones previas), cookie `auth_session` httpOnly + `maxAge` (24 h / 30 d) | `app/api/auth/login/route.ts:57-94` |
| Token creado | `{ userId, email, role, iat, exp, invalidateSessionBefore? }`, firmado HMAC-SHA256 | `lib/auth.ts:74-90` (`createSessionToken`) |
| Cada petición | `validateRequest()` lee la cookie, verifica firma, comprueba `exp` y `invalidateSessionBefore` | `lib/auth.ts:145-152` |
| Token expirado | `isSessionValid()` → `false` → middleware redirige a `/login` y borra la cookie | `lib/auth.ts:134-139`, `middleware.ts:37-39` |
| Cambio de rol (promoción) | `users.role = 'artist'` vía `updateUserRole()`; **no reemite el token del usuario promovido** | `lib/artist-promotion.ts:192-202`, `app/api/admin/approvals/[id]/route.ts:119-120` |
| Cuenta suspendida (`deleted_at`) | Login: 403 `ACCOUNT_SUSPENDED`. `/api/auth/me`: 403 + cookie borrada. Recuperación: `PUT /api/user/settings` (email + contraseña, ≤ 30 días) | `login/route.ts:45-55`, `me/route.ts:32-45`, `app/api/user/settings/route.ts:138-178` |
| Purga | `purgeExpiredDeletedUsers(graceDays = 30)` → `deleteUser()` (cascada: likes, notificaciones, envíos, suscripciones, artista, shows, tracks, user) | `lib/db.ts:923-935`, `:986-1024` |
| Logout | Borra la cookie `auth_session` | `app/api/auth/logout/route.ts` |
| Rutas protegidas | `/admin` exige rol `admin`; `/releases/:id/edit` exige `admin` o `artist`; `/profile`, `/account`, `/releases/new`, `/submissions` exigen solo autenticación | `middleware.ts` |

## Decisiones documentadas

| Decisión | Valor | Por qué |
|----------|-------|---------|
| Duración de sesión | 24 h por defecto, 30 días con `rememberMe` | `SESSION_MAX_AGE` / `SESSION_MAX_AGE_REMEMBER` en `lib/auth.ts:12-13` |
| Cookie | `auth_session`, `httpOnly`, `sameSite: lax`, `secure` solo en producción | `login/route.ts:88-94`, `logout/route.ts`, `middleware.ts:13-19` |
| Firma | HMAC-SHA256 con `SESSION_SECRET` (default solo en desarrollo) | `lib/auth.ts:15-24, 50-72` |
| Rol por defecto en registro | `subscriber` (desde P6; no hay selector de artista público) | `register/route.ts:58` |
| Promoción a artista | Solo tras aprobar el primer release/show, vía `lib/artist-promotion.ts` (idempotente) | AGENTS.md §Auth |
| Suspensión | Soft delete con `deleted_at`; 30 días de gracia para restaurar; luego purga física | `db.ts:887-935`, `settings/route.ts:138-178` |

## Deuda declarada (no bloquea el cierre de la fase)

| # | Deuda | Dónde | Impacto |
|---|-------|-------|---------|
| P18-D1 | Tras `promoteUserToArtist()`, la sesión activa del usuario promovido sigue con el rol viejo (`subscriber`) hasta que expira o hace login de nuevo. No hay llamada a `reissueSessionToken()` ni mecanismo para notificar al cliente que debe re-autenticarse. | `lib/artist-promotion.ts`, `app/api/admin/approvals/[id]/route.ts:119-120` | Un artista recién promovido no puede entrar a `/releases/:id/edit` (el middleware lee `session.role` del token) hasta que inicie sesión de nuevo. |
| P18-D2 | `needsReissue()` (detecta tokens viejos sin `exp` o sin `invalidateSessionBefore`) no se llama desde ninguna ruta ni del middleware. | `lib/auth.ts:141-143` | Tokens emitidos antes de esta fase siguen circulando hasta expirar por su `exp` original. |
| P18-D3 | Cambiar email o contraseña en `PUT/PATCH /api/user/settings` no invalida las sesiones activas en otros dispositivos. | `app/api/user/settings/route.ts` | Una sesión robada sobrevive al cambio de contraseña. |
| P18-D4 | `last_login` de `users` nunca se actualiza en el login. | `login/route.ts` | La columna existe pero está vacía; no afecta a la seguridad, solo a auditoría. |

## Checklist (Regla A)

| # | Tarea | Estado | Commit | Evidencia |
|---|-------|--------|--------|-----------|
| P18.1 | Revisar `lib/auth.ts`: creación, expiración (`exp`), validación (`isSessionValid`, `validateRequest`) y reissue de tokens | ✅ hecha | — | `createSessionToken`, `reissueSessionToken`, `decodeSessionToken`, `isSessionValid`, `validateRequest`, `needsReissue` |
| P18.2 | Revisar `app/api/auth/login/route.ts`: rate limit por IP, cuenta suspendida → 403 `ACCOUNT_SUSPENDED`, bcrypt 10 rounds, `invalidateSessionBefore: now` | ✅ hecha | — | `login/route.ts:18-77` |
| P18.3 | Revisar `app/api/auth/me/route.ts`: 403 + borrado de cookie cuando `user.deleted_at` | ✅ hecha | — | `me/route.ts:32-45` |
| P18.4 | Revisar `app/api/auth/logout/route.ts`: borrado de cookie `auth_session` | ✅ hecha | — | `logout/route.ts:3-13` |
| P18.5 | Revisar `middleware.ts`: `/admin` rol admin; `/releases/:id/edit` rol admin/artist; `/submissions`, `/profile`, `/account`, `/releases/new` requieren auth; limpieza de sesión expirada | ✅ hecha | — | `middleware.ts:89-147` |
| P18.6 | Revisar `lib/artist-promotion.ts`: cambio de rol `subscriber`→`artist`, `updateUserRole()` dual-mode (Turso/local) | ✅ hecha (con deuda) | — | P18-D1: no reemite el token del usuario promovido |
| P18.7 | Revisar `lib/db.ts`: `users.deleted_at`, `softDeleteUser`, `restoreUser`, `purgeExpiredDeletedUsers(graceDays=30)`, `deleteUser` con cascada | ✅ hecha | — | `db.ts:887-1024` |
| P18.8 | Revisar `app/api/user/settings/route.ts`: restauración de cuenta suspendida `PUT`, 30 días de gracia, verificación email + contraseña | ✅ hecha | — | `settings/route.ts:138-178` |
| P18.9 | Documentar el ciclo de vida completo en `docs/PHASE_P18.md` | ✅ hecha | — | este documento |
| P18.10 | Indexar P18 en `docs/PHASES.md` (Regla C) | ✅ hecha | — | `docs/PHASES.md` fila P18 |

## Criterio de cierre

Ninguna de las cuatro puertas del ciclo de vida está sin código: expiración (`exp` + `isSessionValid`), invalidación tras cambio de rol (`invalidateSessionBefore` + `reissueSessionToken` + `login` lo usa), cuentas suspendidas (`deleted_at` en login y `/me`, restauración en `PUT /api/user/settings`) y purga (`purgeExpiredDeletedUsers` con 30 días de gracia). Cada puerta tiene su fichero y sus líneas citadas arriba. La deuda P18-D1..D4 está declarada y no oculta.

## Lo que se hizo

_(se rellena con commit y salida literal de puerta al cerrar la fase)_
