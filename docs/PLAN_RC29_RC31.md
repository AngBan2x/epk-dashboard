# PLAN rc.29 → rc.31 — Seguridad de Blob, descargas de prensa, UI y datos

**Estado:** planificado. Nada ejecutado todavía.
**Origen:** 4 decisiones del usuario sobre Vercel Blob / Last.fm / semilla / cuentas, más 9 problemas de UI y accesibilidad reportados con capturas. Todo verificado con `archivo:línea` antes de planificar.
**Decisiones tomadas por el usuario:** Plan A (OIDC) para Blob · conservar Last.fm · semilla solo con artistas reales y de renombre · crear las cuentas de los 6 artistas sin dueño · PDF real en servidor con pdfkit · lanzamientos agrupados por tipo y colapsados a 6 · `/shows` con consistencia visual completa · **incluir** el N+1 de YouTube.
**Alcance:** 5 bloques, ~30 archivos, 3 prereleases. No incluye release final ni trabajo de Resend.

---

## 0. Correcciones a Diagnósticos Previos

Estas afirmaciones circulaban en la documentación y **son falsas**. Se corrigen aquí para que nadie las ejecute.

| Afirmación | Realidad verificada |
|---|---|
| "Subir imágenes da 500 en producción" (`MASTER_PLAN.md:692`, `docs/AI_LOG.md:5675`) | **Falso.** `BLOB_READ_WRITE_TOKEN` falta en `.env.local`, así que falla **en local**. En producción existe y las subidas funcionan. |
| "La app usa Cloudflare R2, `lib/blob.ts` es código muerto" | **Falso.** R2 tiene **0 referencias** en `lib/`, `app/`, `components/` y `scripts/`. El commit `8688f4b` migró de R2 a Vercel Blob. `lib/blob.ts` lo importa `app/api/upload/image/route.ts:5`. **No borrar `lib/blob.ts` ni `@vercel/blob`.** |
| `components/ArtistsCatalog.tsx` usa `useState` sin importar, rompe `/artists` | **Falso.** El archivo no usa `useState`. `/artists` funciona. |

---

## 1. Fase A — OIDC de Blob + bugs críticos de una línea

### A1. OIDC de Vercel Blob (requiere acción del usuario, es bloqueante)

Causa raíz: `lib/blob.ts:32` y `:41` pasan `token: token()` de forma explícita. En el SDK instalado (`@vercel/blob` 2.8.0) el orden de resolución es:

```
chunk-YYMLUMXS.js:169  if (options?.token)  → readWrite   ← gana SIEMPRE
chunk-YYMLUMXS.js:173  oidcToken = manualOidc || await getVercelOidcToken()
chunk-YYMLUMXS.js:184  BLOB_STORE_ID → kind: "oidc"
chunk-YYMLUMXS.js:198  BLOB_READ_WRITE_TOKEN (fallback)
```

El token explícito **desactiva el OIDC hoy** y obliga al secreto estático de larga duración.

- Quitar `token: token()` de `put()` y `del()`.
- Eliminar `token()` y `cleanEnv()` quedan muertos.
- Mantener `access: "public"` y el saneado de nombres.
- Verificar subida real en local y en producción.
- **Solo después** el usuario borra `BLOB_READ_WRITE_TOKEN`.
- Quitar la línea 100 de `tests/unit/security-sweep.test.ts` (solo impedía el throw de `token()`).
- Documentar `BLOB_STORE_ID` en `.env.example` en lugar de `BLOB_READ_WRITE_TOKEN`.
- Corregir `MASTER_PLAN.md:692` y `docs/AI_LOG.md:5675` con la verdad del punto 0.

**Orden obligatorio:** conectar OIDC → verificar → borrar token. Al revés, las subidas caen.

### A2. `safeString` con fallback truthy — bug de una línea, 4 síntomas

`lib/null-safe.ts:1` → `safeString(v, fallback = "—")`. El em dash es **truthy**, así que el operador `||` nunca evalúa su alternativa.

| Archivo:línea | Síntoma |
|---|---|
| `app/shows/page.tsx:202` | `ticket_url` es `null` → `"—"` → `<a href="—">` → **404** (URL relativa contra `/shows`) |
| `app/shows/page.tsx:200` | La tarjeta imprime `"—"` como descripción |
| `app/shows/page.tsx:201` | La tarjeta imprime `"📍 —, —"` como ubicación |
| `app/artists/[id]/page.tsx:67-68` | JSON-LD emite `"genre": "—"`, `"description": "—"` |

- Pasar `""` como fallback explícito en los 4 sitios.
- **No** cambiar el default global de `lib/null-safe.ts:1`: hay ~67 usos y cambiarlo arriesga regresiones en otras páginas.
- Añadir `z.string().url()` en `app/api/shows/route.ts:29,48` para impedir que un valor relativo vuelva a producir 404.

### A3. Menú de perfil que no se cierra

`components/Header.tsx:145` coloca el `containerRef` en el `<div role="menu">` en vez de en el wrapper `relative` de la línea 130. Secuencia del fallo:

1. Menú abierto → el ref apunta al panel, que **no contiene** el botón del avatar.
2. `mousedown` (`:43-46`) → `container.contains(avatar) === false` → `setAccountOpen(false)`.
3. `click` (`:133`) → `setAccountOpen(v => !v)` con `v === false` → **`true`**. Reabre.

En notificaciones (`NotificationBell.tsx:295`) el ref envuelve botón + panel, por eso funciona.

- Mover el ref al wrapper de la línea 130.
- Adoptar el patrón de `NotificationBell.tsx:225-243`: listener de teclado en `document`, `if (!open) return`, quitar el `if (button)` que impide registrar el listener cuando el ref es `null`.
- Cerrar con `Escape` desde cualquier punto del menú, no solo con el avatar enfocado.

**Gate:** `tsc`, `vitest`, `build`, `lint`, verificación visual de los 4 síntomas de A2 y del toggle de A3. → **rc.29**

---

## 2. Fase B — Descargas de prensa

Estado real verificado: **no hay caché, ni archivo pregenerado, ni columna de versión.** `POST /api/export` lee fresco de Turso en cada clic (`lib/export-bundle.ts:92-102`) con `Cache-Control: no-store` y `export const dynamic = "force-dynamic"`. El flujo "guardar y se actualiza solo" **ya funciona**.

| # | Cambio | Archivos | Esfuerzo |
|---|---|---|---|
| B1 | Exponer `DownloadCenter` en la página pública del artista, entre `BioSection` y `ArtistTracksSection`. Es plug-and-play: ya es client y solo recibe props planas. Añadir rate limit a `POST /api/export`, hoy **público y sin límite** | `app/artists/[id]/page.tsx:120-122`, `app/api/export/route.ts` | S |
| B2 | Eliminar el botón "Actualizar datos del dossier": es **código muerto**. `refreshDossier` (`:87-95`) descarta la respuesta y solo incrementa `dossierRevision`, cuyo atributo `data-dossier-revision` no lee nadie en el repo. Borrar también el prop `onSaved` y su `useEffect` vacío | `components/DownloadCenter.tsx:87-95, 149, 196-207, 25, 41, 83-85` | S |
| B3 | Igualar la altura de la tarjeta "Dossier / Rider". Causa: `align-items: stretch` de CSS Grid en `app/dashboard/page.tsx:414`; la tarjeta derecha (~300px) estira a la izquierda dejando ~190px de vacío | `app/dashboard/page.tsx:414` (`items-start`) | S |
| B4 | Catálogo en HTML. El backend **ya está listo**: `format: "html"` en `app/api/export/route.ts:9` y `buildCatalogHtml` en `lib/downloadable-assets.ts:547`. Clonar `CatalogDownloadButton` reutilizando `filenameFromDisposition` de `DownloadCenter.tsx:124-127`. Corregir dos bugs que se activarían: el catálogo público se nombra `EPK_Dossier_*.html` (`lib/export-bundle.ts:63`) y se titula "EPK Dossier de Prensa" (`lib/downloadable-assets.ts:548`) | `components/CatalogDownloadButton.tsx`, `lib/export-bundle.ts:63`, `lib/downloadable-assets.ts:548` | S |
| B5 | **PDF real con pdfkit.** Añadir `"pdf"` al enum de Zod (`:9`) y a `ExportFormat` (`DownloadCenter.tsx:8-9`). Crear `lib/pdf/` con 3 plantillas maquetadas a mano y una fuente TTF Unicode registrada para los acentos. Subir el grid de opciones a `sm:grid-cols-2 lg:grid-cols-4` porque pasa de 4 a 8 botones | `package.json`, `app/api/export/route.ts:9`, `lib/pdf/*`, `components/DownloadCenter.tsx` | M |

**Opción de PDF descartada:** Chromium headless (`@sparticuz/chromium` + `puppeteer-core`, ~50-60 MB). El cold start de 2-6 s contra el `maxDuration` de 10-15 s de Vercel haría fallar la descarga constantemente, sobre todo con visitantes anónimos. `pdfkit` es JS puro (~1-3 MB, sin binarios) y cabe de sobra en el bundle. Se acepta que no hay CSS grid ni flex: hay que maquetar a mano y mantener el diseño en paralelo al HTML.

**Gate:** `tsc`, `vitest`, `build`, E2E de descargas, y **apertura visual del PDF generado**. → **rc.30**

---

## 3. Fase C — UI de tarjetas, carrusel y `/shows`

| # | Cambio | Diagnóstico verificado | Esfuerzo |
|---|---|---|---|
| C1 | EPKCards legibles en la página del artista | `app/artists/[id]/page.tsx:100` usa `max-w-4xl` (896px) con `xl:grid-cols-4` → **198px por card**, contra 294px del mismo componente en el catálogo. `EPKCard.tsx:173` trunca el título **sin atributo `title`** (bug de a11y: el texto completo es inaccesible). No hay `slice`: es puramente layout | S/M |
| C2 | Lanzamientos organizados por tipo + colapsar a 6 | Aprobado: secciones Álbumes / EPs / Singles, orden descendente por fecha, cada grupo colapsado a 6 con "Ver los N restantes". Sin estado global | M |
| C3 | Carrusel del catálogo: 1 artista por página, bio a la izquierda y shows a la derecha | Tres fallos encadenados: (a) `BioSection.tsx:71` usa `md:grid-cols-4` por **viewport**, no por contenedor → dentro de una slide de 300px deja **17px de ancho de texto** por celda; (b) `useCarousel.ts:21` fija `slidesToScroll: 1` mientras `lib/carousel.ts:11-30` ya declara la config 1/2/4 por breakpoint con **0 imports**; (c) el contador compara un índice de *snap* contra `artists.length` en vez de páginas | M |
| C4 | `/shows` con consistencia visual completa | Cero gradientes de marca, sin `max-w` (se estira a pantalla completa), sin `framer-motion`, sin usar el design system, y los 2 shows de producción están en `proximamente` (mismo badge ámbar) y **sin flyer**, así que las tarjetas quedan como rectángulos grises. Añadir gradiente, `max-w-7xl`, `ui/Card` / `ui/Badge` / `EmptyState`, `framer-motion` y **flyer de fallback** | M |

Colores a reutilizar: `ArtistHero.tsx:47` (`from-indigo-600 via-violet-600 to-pink-500`), `app/dashboard/page.tsx:264-282` (stat cards amber/emerald/blue/pink), `app/dashboard/page.tsx:298-310` (quick actions con tinte).

**Gate:** `tsc`, `vitest`, `build`, revisión headed con capturas de las 4 vistas en móvil y desktop. Riesgo principal: la suite `shows-transitions`. → **rc.30 o rc.31**

---

## 4. Fase D — Datos de producción

### D1. Las 6 cuentas de artistas

Estado real: 6 de 7 artistas sin `user_id`, todos con 1 track y 0 shows.

| Artista | Tracks | Oyentes (dato inventado) |
|---|---|---|
| Eagles | 1 | 25.000.000 |
| Ed Sheeran | 1 | 95.000.000 |
| Kate Bush | 1 | 18.000.000 |
| Nirvana | 1 | 38.000.000 |
| Queen | 1 | 45.000.000 |
| The Weeknd | 1 | 110.000.000 |

`scripts/backfill-artist-owners.ts:160` enlaza por **nombre exacto**, así que crear las cuentas con `name` igual al del artista produce una coincidencia inequívoca e idempotente.

- Nuevo `scripts/seed-artist-owners.ts`, dry-run por defecto, `--apply` para escribir.
- Por cada artista: `users` con `role='artist'`, `name` exacto, email `<slug>@pressplay.app`, `password_hash` = bcrypt de 32 caracteres aleatorios **no documentados**.
- Guardas: nunca toca a Angel Bandres ni al admin; salta si ya existe un usuario con ese nombre; una sola transacción.
- Después correr `backfill-artist-owners.ts --apply` para confirmar idempotencia.
- Documentar en `AGENTS.md` + `docs/AI_LOG.md` que son fixtures sin acceso real, para que nadie los borre ni intente usarlos.

**Riesgo aceptado:** son cuentas de artistas reales con capacidad de login. Mitigado con contraseña aleatoria desconocida; ningún correo se envía porque no hay `FROM_EMAIL`.

### D2. Semilla con nombres reales

`scripts/seed-influential-catalog.ts` ya usa artistas y discos reales (Pink Floyd con *The Dark Side of the Moon* y *The Wall* con tracklist y duraciones reales, Radiohead, Björk, David Bowie, Kraftwerk). El único obstáculo es `SEED_SUFFIX = "-seed"` en la línea 65, que ensucia el nombre visible y **rompe el match de Last.fm** (`app/dashboard/page.tsx:487` pasa `artistProfile.name` a Last.fm, o sea el match es por nombre de display).

- Quitar `SEED_SUFFIX` de los 5 artistas y sus 5 slugs, y actualizar la cabecera (líneas 3-16).
- **Colisión verificada: ninguna.** Ninguno de los 5 existe en el catálogo actual.
- Añadir modo `--cleanup` que borra por `(artist_name, title)` contra el catálogo del propio archivo, porque los nombres ya no son únicos.
- Review del dry-run antes de `--apply`.
- Actualizar `docs/PHASE_P5.md`, que dice "no aplicado en producción".

---

## 5. Fase E — Métricas honestas y cuota protegida

Va **última** porque cambia la estructura interna de `EPKCard` y conviene tocarlo una sola vez.

**Last.fm**
- `lib/lastfm.ts:3`: `http://` → `https://` (hoy cada llamada paga un redirect 301).
- `lib/lastfm.ts:39-51`: `lastfmFetch` devuelve un motivo discriminado (`no_key` / `not_found` / `quota` / `network` / `upstream`) con `console.error` en vez de `null` mudo. Hoy 5 escenarios distintos colapsan en el mismo píxel.
- **Eliminar la llamada a `getTopAlbums`** (`app/api/lastfm/route.ts:39`): la UI nunca la lee (`LastfmData` ni la declara) → **1 de cada 3 unidades de cuota se desperdicia**.
- `Promise.all` en las 2 que quedan, caché `revalidate: 3600` y `AbortSignal.timeout(5000)`.
- La ruta devuelve 503/502/429 en vez de 200 con payload vacío, y rate limit (hoy es un proxy público sin límite).

**YouTube (el N+1)**
- `lib/youtube.ts`: nueva `getVideosStatsBatch(ids)` con `videos?id=A,B,C` (hasta 50 por llamada) y el `if (!res.ok)` que falta en la línea 102.
- `app/api/youtube/stats/route.ts`: acepta `ids` y devuelve un mapa.
- `components/EPKCard.tsx:44-56`: eliminar el `useEffect` por track y recibir `stats` por prop. Una visita a `/artists/[id]` pasa de **N llamadas upstream a 1**, y también las 3 rejillas del dashboard (`:163`, `:392`, `:609`).

**UI honesta**
- `components/UnifiedMetrics.tsx:40,48` deja de hacer `?? streamCount` y `?? likeCount`: hoy un fallo de YouTube **muestra el valor local como si fuera el dato real**, y los likes muestran un `0` hardcodeado (`app/track/[id]/page.tsx:154`). Mostrar "—" con tooltip.
- La UI distingue "este artista no tiene datos" de "la integración está caída".

**No bajar de 249 tests.** Añadir tests del mapeo de motivos y del lote.

---

## 6. Verificación y gates

Por fase: `npx tsc --noEmit` → `npx vitest run` → `pnpm build` → `npx next lint` sin warnings → headed local con capturas → commit convencional + push → headed producción + matriz → `docs/AI_LOG.md`.

Gates finales: matriz de producción 50/50, las 6 suites E2E, `npx tsx scripts/turso-check.ts` con 0 filas QA y 0 huérfanos, `npx tsx scripts/a11y-check.ts`, `npx tsx scripts/axe-check.ts`, y Lighthouse contra `pnpm build` + `pnpm start -p 3100` (**nunca** contra `pnpm dev`).

## 7. Fuera de alcance

- Resend / correo: `FROM_EMAIL` ausente, `pressplay.eu.org` pendiente de eu.org, cuota diaria agotada.
- Rate limit distribuido (Upstash/KV): hoy es un `Map` en memoria, evitable en serverless.
- Refactor de `/dashboard` a Server Components (TBT ~1.1 s).
- Export de datos personales / RGPD y recuperación de contraseña: la segunda **sí depende de correo**.
- Store de Blob privado: no se cambia (el acceso se fija al crear el store y no hay botón para alternarlo). Las imágenes del EPK son públicas por diseño.
