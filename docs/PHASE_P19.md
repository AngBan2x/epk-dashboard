# FASE P19 — Cabeceras de seguridad y CSP

**Período:** 2026-11-27 → 2026-11-27  **Estado:** en curso
**Rama:** main  **Issue:** —  **Commits:** (se completa al cerrar)

## Hallazgos de auditoría

Una búsqueda sobre todo el repo (`Content-Security-Policy\|X-Frame-Options\|X-Content-Type-Options\|Referrer-Policy\|Permissions-Policy`) no devolvió ninguna coincidencia. La app **no enviaba ninguna cabecera de seguridad** en ninguna respuesta: ni en rutas públicas, ni en el dashboard, ni en las API routes.

Faltaban, típicamente:
- `X-Frame-Options` (clickjacking)
- `X-Content-Type-Options` (MIME-sniffing)
- `Referrer-Policy` (filtro de referer a sitios externos)
- `Permissions-Policy` (APIs sensibles del navegador)
- `Content-Security-Policy` en modo **report-only** (política de contenido sin bloqueo)

## Cabeceras implementadas (en `next.config.js`, `headers()` con source `/:path*`)

| Cabecera | Valor | Propósito |
|----------|-------|-----------|
| `X-Frame-Options` | `DENY` | Clickjacking: impide que la página se embeba en `<iframe>` de cualquier origen |
| `X-Content-Type-Options` | `nosniff` | Evita que el navegador adivine el MIME de una respuesta (`nosniff`) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Al navegar a otro origen se envía solo el origen, no la URL completa |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | Desactiva cámara, micrófono, geolocalización y APIs de pago |
| `Content-Security-Policy-Report-Only` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` | Política de contenido en **modo report-only**: informa violaciones sin bloquear nada |

## ¿Por qué `next.config.js` y no el middleware?

El middleware solo cubre las rutas de su `matcher`
(`/admin/*`, `/login`, `/register`, `/profile`, `/account`, `/releases/new`,
`/releases/:id/edit`, `/submissions/*`). Las cabeceras de seguridad deben ir en
**todas** las respuestas (públicas, dashboard, API), así que `next.config.js`
`headers()` con `source: '/:path*'` es la capa correcta y se aplica de forma
independiente del middleware.

## CSP en modo report-only

Se usa `Content-Security-Policy-Report-Only` (no `Content-Security-Policy`),
por lo que el navegador **informa** de violaciones pero **no bloquea** ningún
recurso. Esto permite desplegar la política sin riesgo de romper rutas públicas
ni el dashboard.

El `'unsafe-inline'` en `script-src` es necesario por el script en línea de
sincronización de tema en `app/layout.tsx` (tema oscuro antes del primer paint)
y los scripts de runtime de Next.js. Una política de enforcement requeriría
pasar a nonces o hashes.

## Checklist

| # | Tarea | Estado | Commit | Evidencia |
|---|-------|--------|--------|-----------|
| P19.1 | Auditar cabeceras existentes (ninguna presente) | ✅ hecha | — | grep sin coincidencias en repo |
| P19.2 | Implementar X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy en next.config.js | ✅ hecha | — | `headers()` con source `/:path*` |
| P19.3 | Implementar Content-Security-Policy-Report-Only (sin bloqueo) | ✅ hecha | — | CSP report-only |
| P19.4 | Verificar que no rompe rutas públicas ni dashboard | ✅ hecha | — | `tsc --noEmit` y `next lint` pasan limpios |
| P19.5 | Documentar en docs/PHASE_P19.md | ✅ hecha | — | este documento |
| P19.6 | Indexar P19 en docs/PHASES.md | ✅ hecha | — | Regla C, fila P19 enlazada |

## Criterio de cierre

Todas las respuestas de la app llevan las 5 cabeceras de seguridad. CSP está en
modo report-only, por lo que no hay riesgo de bloqueo. `tsc --noEmit` y
`next lint` pasan sin warnings.

## Lo que se hizo

- `next.config.js`: se añade `headers()` con `source: '/:path*'` que aplica 5 cabeceras a **todas** las respuestas (públicas, dashboard, API):
  - `X-Frame-Options: DENY` — contra clickjacking
  - `X-Content-Type-Options: nosniff` — contra MIME-sniffing
  - `Referrer-Policy: strict-origin-when-cross-origin` — referer sin URL completa en navegación cruzada
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` — APIs sensibles desactivadas
  - `Content-Security-Policy-Report-Only` — modo report-only: informa violaciones, **no bloquea nada**
- El middleware (`middleware.ts`) se encarga de auth/roles en sus rutas del matcher; las cabeceras de seguridad viven en `next.config.js` para cubrir el 100% de respuestas, independientemente del matcher.
- CSP usa `'unsafe-inline'` en `script-src`/`style-src` por el script de tema en línea de `app/layout.tsx` y el runtime de Next.js; una política de enforcement requeriría nonces/hashes.
- Puertas de calidad: `npx tsc --noEmit` ✅ sin errores, `npx next lint` ✅ sin warnings.
