# FASE P17 — El catálogo público es un catálogo público

**Período:** 2026-11-12 → 2026-11-12  **Estado:** en curso
**Rama:** main  **Issue:** #2  **Commits:** (se completa al cerrar)

> **Qué es esta fase.** Un EPK es un documento público. Todo lo que la web enseña a un desconocido
> tiene que ser, por definición, público: la biografía, la portada, los shows, el rider. Y nada
> más. En este repo, tres rutas públicas enseñaban de más — y una de ellas era el **buscador**.
>
> No es un bug de estilo. Es una fuga: un anónimo podía enumerar el catálogo entero, incluidos los
> releases que están en `draft` y `pending` —o sea, lo que un artista ha enviado y **todavía no ha
> aprobado nadie**— y además la FK interna que liga un artista con su cuenta de usuario.

## Las tres fugas, confirmadas en producción (2026-11-12)

| # | Fuga | Evidencia |
|---|------|-----------|
| 1 | **XSS almacenado** en el JSON-LD de la ficha de artista | `app/artists/[id]/page.tsx:199` — `JSON.stringify` **no escapa `<`, `>` ni `/`**. La biografía la controla el propio artista (`PATCH /api/artists/me` → `updateArtist`, sin saneo). Con `biography = "x</script><img src=y onerror=…>"` el SSR emite el HTML crudo y se ejecuta en el navegador de **cualquier visitante, incluido un admin**. Verificado en prod: el JSON-LD se emite **sin escapar** |
| 2 | **`GET /api/search` público y sin filtro de estado** | `app/api/search/route.ts:22` → `lib/db.ts:2810` (`FROM tracks WHERE release_id IS NULL`, **sin `status='approved'`**) y `lib/db.ts:2835` (`FROM shows`, **sin `approved=1` ni `deleted_at IS NULL`**). Verificado en prod: **HTTP 200** con el catálogo completo, sin sesión y sin rate limit. **No hay ningún test que lo cubra** |
| 3 | **`GET /api/artists/[id]` filtra `user_id`** | `app/api/artists/[id]/route.ts:18-22` → `getArtistById` devuelve la fila cruda. Verificado en prod: `{"id":"demo-artista-001","user_id":"demo-user-001","deleted_at":null,…}`. El **listado** sí lo quita (`stripUserId`), así que la fuga es la asimetría entre las dos rutas |

Y de paso, el mismo motivo que las traía:

| # | Hallazgo | Ubicación |
|---|----------|-----------|
| 4 | La web **no** filtra `is_active` y la API **sí** | `lib/db.ts:2101` (`getAllArtists`) lo usan `app/artists/page.tsx` y `app/sitemap.ts` → artistas desactivados públicos e indexables |
| 5 | `/releases/[id]` sirve borradores con 200 e indexable | `lib/releases.ts:62` usa `getTrackById` (sin filtro) mientras `GET /api/tracks/[id]` usa `getApprovedTrackById` → **la web y la API no comparten criterio de visibilidad**. Verificado en prod: `<meta name="robots" content="index, follow"/>` |
| 6 | IDOR en likes | `app/api/likes/route.ts:20,39` — `?user_id=` ajeno sin sesión devuelve los likes de otra persona |
| 7 | El dossier anónimo lleva el email en el JSON | `lib/downloadable-assets.ts:585-587` |

## Decisiones

| Decisión | Valor |
|----------|-------|
| `is_active = 0` | **Oculto del público.** La web debe filtrarlo igual que la API |
| El buscador | **No** debe mostrar borradores ni pendientes |
| El dossier anónimo | El **HTML** y el **PDF** llevan `contact_email`/`management` (es el producto: la prensa necesita a quién escribir). El **JSON no** (es lo que se rasca en bloque) |

## El patrón: una lectura pública con whitelist

El repo ya tenía la idea y un ejemplo: `parseTrack` es una **whitelist** y no expone
`admin_notes` (el motivo interno del rechazo), ni `description`, ni `genre`. Lo que faltaba era
aplicarlo al otro lado: **qué se puede ver sin sesión**.

Por eso la fase no añade un filtro suelto en cada ruta, sino una capa: `getPublicArtists()` y
`getPublicArtistById()` en `lib/db.ts`, que filtran `is_active = 1` **y** `deleted_at IS NULL`, y
que **no** devuelven `user_id`, `deleted_at`, `admin_notes`, `description` ni `genre`.

Las usan la web, el sitemap, la API pública y el buscador. Un solo sitio donde decidir qué es
público, en vez de cuatro sitios donde recordar que hay que filtrar.

## Checklist

| # | Tarea | Estado | Commit | Evidencia |
|---|-------|--------|--------|-----------|
| P17.1 | Escapar `<` en el JSON-LD de la ficha de artista | ✅ hecha | — | `lib/safe-json-ld.ts` + test "una biografía con `</script>` no rompe el JSON-LD" |
| P17.2 | Lectura pública con whitelist en `lib/db.ts` | ✅ hecha | — | `getPublicArtists()` / `getPublicArtistById()`, con las columnas escritas a mano |
| P17.3 | Usarla en web, sitemap y API (que la web y la API dejen de discrepar) | ✅ hecha | — | `app/artists/page.tsx`, `app/sitemap.ts`, `app/api/artists/route.ts`, `app/api/artists/[id]/route.ts` |
| P17.4 | `/api/search` filtra por estado | ✅ hecha | — | test "no devuelve releases en draft, pending ni rejected" |
| P17.5 | Cerrar el IDOR de likes | ✅ hecha | — | test "sin sesión, pedir los likes de un usuario es 401" |
| P17.6 | `/releases/[id]` y `/track/[id]` solo si `status = 'approved'` | ✅ hecha | — | `getVisibleReleaseWithTracks()` en `lib/releases.ts` + test "el draft no lo ve ni el público ni un suscriptor" |
| P17.7 | El dossier JSON no lleva el email; el HTML y el PDF sí | ✅ hecha | — | test "el JSON no lleva contact_email, booking_email ni management" |
| P17.8 | Un test por fuga | ✅ hecha | — | `tests/unit/p17-catalogo-publico.test.ts`, 19 tests. **Mutados los 4 arreglos: 4 rojos** |

## Criterio de cierre

Ningún endpoint público devuelve datos no aprobados, datos internos (`user_id`, `deleted_at`,
`admin_notes`) ni datos de otro usuario. **Cada fuga tiene su test**, y el test falla si se
revierte el arreglo.

## Lo que se hizo

_(se rellena con commit y salida literal de puerta a medida que avanza)_
