# PLAN rc.29 → rc.31 — Seguridad de Blob, descargas de prensa, UI y datos

**Estado:** Fase A **completada y verificada en producción** (rc.28). Fases B, M0, C, D y E planificadas, nada ejecutado.
**Origen:** 4 decisiones del usuario sobre Vercel Blob / Last.fm / semilla / cuentas, más 15 problemas de UI, accesibilidad y datos reportados con capturas. Todo verificado con `archivo:línea` antes de planificar.
**Decisiones tomadas por el usuario:**
- Blob: **Plan A (OIDC)**, eliminar el token explícito en vez de rotarlo.
- Last.fm: conservar las métricas de los artistas que tengan música ahí.
- Semilla P5.2: solo artistas **reales y de renombre**, sin sufijo `-seed` en el nombre visible.
- Cuentas: crear las 6 que faltan, emails `@pressplay.app` y contraseña aleatoria **desconocida**.
- PDF de prensa: **real en servidor con `pdfkit`** (Chromium headless descartado).
- Lanzamientos: **agrupar por release (opción B)**, no por tipo. EPKCard del álbum + filas con play.
- `track_number`: **opcional con auto-numeración**, numeración por disco.
- Pestañas del admin: patrón de **subrayado** + `aria-current`.
- Iconos: **logotipos oficiales de marca**, no geometría inventada.
- Catálogo: **quitar** el bloque de redes sociales.
- YouTube: **incluir** el arreglo del N+1.

**Alcance:** 5 bloques + la migración M0, ~35 archivos, 3 prereleases. No incluye release final ni trabajo de Resend.

**Estado de la Fase A:**

| Item | Estado |
|---|---|
| A1 Blob por OIDC | **Hecho.** Commit `8f22b25`. Verificado en producción: el usuario subió imagen de perfil y banner, y el token se revocó después |
| A1 limpieza de variables | **Hecho.** 5 `R2_*` + `LASTFM_API_SECRET` fuera de `.env.local`; en Vercel las quitó el usuario |
| A2 copy del botón | **Hecho.** Commit `7c25d1e` |
| A2 `safeString` (`lib/null-safe.ts:1`) | Pendiente, va con la Fase C |
| A3 menú de perfil | Pendiente, va con la Fase C |
| **C8** logotipos oficiales | **Hecho** y verificado a 16/20/24 px en claro y oscuro |
| **C9** Webflow → BandLab | **Hecho** y verificado en el editor de `/profile` (16 inputs, 16 iconos) |
| **C10** azul falso de "Envíos" | **Hecho** y verificado |
| **C11** "Aprobaciones" duplicada | **Hecho** y verificado |
| **C12** estilo de pestañas | **Hecho** y verificado 23/23 |
| **D1** 6 cuentas de artistas | **Hecho** y verificado por SQL directo. 7 de 7 artistas con dueño, 0 huérfanos, 0 duplicados, admin intacto |
| `SESSION_SECRET` en `.env.local` | **Hecho.** Bloqueaba `pnpm start` local (ver §1) |
| `WEBHOOK_SECRET` | Pendiente, lo define el usuario (§8) |

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

- Quitar `token: token()` de `put()` y `del()`. — **HECHO** (`8f22b25`)
- Eliminar `token()` y `cleanEnv()` quedan muertos.
- Mantener `access: "public"` y el saneado de nombres.
- Verificar subida real en local y en producción.
- **Solo después** el usuario borra `BLOB_READ_WRITE_TOKEN`.
- Quitar la línea 100 de `tests/unit/security-sweep.test.ts` (solo impedía el throw de `token()`). — **HECHO**
- Documentar `BLOB_STORE_ID` en `.env.example` en lugar de `BLOB_READ_WRITE_TOKEN`. — **HECHO**
- Corregir `MASTER_PLAN.md:692` y `docs/AI_LOG.md:5675` con la verdad del punto 0. — **HECHO**

**Orden obligatorio:** conectar OIDC → verificar → borrar token. Al revés, las subidas caen. **Cumplido**: el store quedó conectado, la subida se verificó en producción y después se revocó el token.

**Bloqueador encontrado al verificar en local:** `lib/auth.ts:18-19` lanza si `NODE_ENV=production` y no hay `SESSION_SECRET`, y `.env.local` no lo tenía → `POST /api/auth/login` devolvía 500 y **`pnpm start` no permitía iniciar sesión**, justo el modo que exige el workflow para Lighthouse y headed. Resuelto generando el secret en local (gitignored). En Vercel ya estaba, por eso producción nunca lo sufrió.

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
| C2 | **Agrupar por release** (opción B, rediseño) | La página pública renderiza **una EPKCard por track**, no por release. Aplicar la semilla (D2) genera **74 tarjetas**, con la portada **repetida** porque los hijos heredan `cover_image` del padre (`seed:515`). Sin agrupación, Pink Floyd serían 32 tarjetas indistinguibles. Diseño aprobado: EPKCard del álbum (conserva play, like y métricas) + `ReleaseTrackList` debajo con play por fila, numeración por disco y cabecera enlazada a `/releases/${id}`. Ver §3.1 | M |
| C3 | Carrusel del catálogo: 1 artista por página, bio a la izquierda y shows a la derecha | Tres fallos encadenados: (a) `BioSection.tsx:71` usa `md:grid-cols-4` por **viewport**, no por contenedor → dentro de una slide de 300px deja **17px de ancho de texto** por celda; (b) `useCarousel.ts:21` fija `slidesToScroll: 1` mientras `lib/carousel.ts:11-30` ya declara la config 1/2/4 por breakpoint con **0 imports**; (c) el contador compara un índice de *snap* contra `artists.length` en vez de páginas | M |
| C4 | `/shows` con consistencia visual completa | Cero gradientes de marca, sin `max-w` (se estira a pantalla completa), sin `framer-motion`, sin usar el design system, y los 2 shows de producción están en `proximamente` (mismo badge ámbar) y **sin flyer**, así que las tarjetas quedan como rectángulos grises. Añadir gradiente, `max-w-7xl`, `ui/Card` / `ui/Badge` / `EmptyState`, `framer-motion` y **flyer de fallback** | S |
| C5 | ~~Copy del botón de subida~~ **HECHO (opción B)** | `components/ImageUploader.tsx`. Hoy el flujo tiene **dos pasos**: el botón sube el archivo a Blob y devuelve la URL a `setProfileImage`, y después hay que pulsar **"Guardar Perfil"** para que el PATCH la vincule al artista. "Subir imagen" describía la mecánica interna en vez de la acción del usuario. Cambiado a **"Confirmar"** + **"Confirmando..."** + **"Cambiar"** (antes "Quitar"), para que la secuencia se lea coherente. Actualizados los 2 selectores de `scripts/verify-upload-headed.ts` | S |
| C6 | Quitar el bloque de redes del catálogo | `app/dashboard/page.tsx:582-597` lista cada artista con `social_links` y muestra sus botones **sin encabezado**, justo debajo de "Catálogo completo". No es fuga de privacidad (ya son públicos en `/artists/[id]`), es duplicación. Decisión del usuario: quitar. Revisar si el import de `app/dashboard/page.tsx:7` queda sin uso | S |
| C7 | Margen inferior en los links de la página de artista | `app/artists/[id]/page.tsx:101-110`: el wrapper tiene `pt-6` pero **ningún margen abajo**, así que los botones quedan pegados a `BioSection`. Coordinar con C1 (misma línea de código) | S |
| C8 | ~~Logotipos oficiales para 7 plataformas~~ **HECHO** | `lib/social-platforms.ts` mezclaba logotipos reales (`:29, :41, :53, :65, :77, :89, :137, :149, :161`) con **7 aproximaciones geométricas inventadas** (threads, apple-music, soundcloud, amazon-music, audiomack, mixcloud, webflow). Paths de **simple-icons (CC0)**, descargados por `scripts/apply-brand-icons.cjs`, que valida `viewBox 0 0 24 24` antes de escribir. Los 16 quedan con `fillRule: "nonzero"`. **Verificado a 16/20/24 px en claro y oscuro** | M |
| C9 | ~~Webflow → BandLab~~ **HECHO** | `:201-212`; no existía `bandlab` pese a estar especificada en `.opencode/agents/social-links-builder.md:149-154`. **0 filas con `webflow`** en Turso, no se pierde nada. El sitio web ya lo cubre `dossiers.website` | S |
| C10 | ~~Quitar el azul falso de la pestaña "Envíos"~~ **HECHO** | `:580` tenía `text-blue-600 dark:text-blue-400` **hardcodeado**, el mismo azul de la activa (`:561`). Ahora el enlace usa el token inactivo | S |
| C11 | ~~Unificar "Envíos" y "Aprobaciones"~~ **HECHO** | `:577-584` y `:615-620` apuntaban ambas a `/admin/approvals`. **Eliminada "Aprobaciones"**; se conserva "Envíos" por su contador. El header no enlaza ahí, así que el duplicado estaba solo en el admin | S |
| C12 | ~~Unificar el estilo de las pestañas~~ **HECHO** | Tracks `:560` / Releases `:570` / Notificaciones `:587` con subrayado; Artistas `:598` y Shows `:607` con `bg-emerald-500` sólido. Unificado al **subrayado** con `TAB_ACCENT` + `adminTabClass()` a nivel de módulo, conservando el color por dominio. Añadido `aria-current="page"`. **Verificado 23/23** en claro y oscuro | S |

Colores a reutilizar: `ArtistHero.tsx:47` (`from-indigo-600 via-violet-600 to-pink-500`), `app/dashboard/page.tsx:264-282` (stat cards amber/emerald/blue/pink), `app/dashboard/page.tsx:298-310` (quick actions con tinte).

### C5 aplicado (opción B)

El usuario eligió la opción B tras ver las tres. Copy final en `components/ImageUploader.tsx`:

| Antes | Ahora | Dónde |
|---|---|---|
| "Subir imagen" | **"Confirmar"** | `:222` |
| "Subiendo..." | **"Confirmando..."** | `:201` |
| "Quitar" | **"Cambiar"** | `:193` |

"Cambiar" en vez de "Quitar" porque con un botón que dice "Confirmar", "Quitar" se leía como deshacer la imagen ya guardada; en realidad descarta la selección pendiente y permite elegir otra.

Actualizados los 2 selectores de `scripts/verify-upload-headed.ts:45,69` (`"Subir imagen"` → `"Confirmar"` con `exact: true`), que se habrían roto con el rename. Búsqueda confirma **0 referencias** restantes a "Subir imagen" / "Subiendo" en `app`, `components`, `tests` y `scripts`.

**Opción C sigue sobre la mesa** (upload inmediato y un solo botón) como posible mejora futura: elimina la doble confirmación de raíz, pero cambia el comportamiento y el usuario perdería el "deshacer" antes de guardar.

### 3.1 Diseño detallado de C2 (opción B)

El modelo de datos tiene un problema que condiciona todo el diseño: **un release y un single suelto son indistinguibles**. Ambos son filas de `tracks` con `release_id IS NULL`.

| Hecho verificado | Ubicación |
|---|---|
| `getParentReleases()` y `getApprovedReleases()` filtran solo por `release_id IS NULL`, así que devuelven padres **y** singles | `lib/db.ts:2048`, `:2063` |
| **No existe ningún `EXISTS`** en el repo que detecte si un track tiene hijos | — |
| **No hay columna `track_number`.** Los hijos se ordenan por `start_time ASC` | `lib/db.ts:2035` |
| Los hijos heredan `cover_image` del padre, así que un álbum de 10 pistas son 11 tarjetas con la imagen idéntica | `seed-influential-catalog.ts:515` |
| `getTracksByArtist` **no filtra por estado** | `lib/db.ts:2016` |
| `app/artists/[id]/page.tsx:58` no filtra por estado → **borradores y pendientes son públicos** | fuga **latente**: hoy los 9 tracks en Turso están `approved`, 0 con `release_id` |

**Lo que ya existe y se reutiliza** (por eso el esfuerzo es M, no L):
- `components/ReleaseTrackList.tsx` (133 líneas) ya tiene reproductor global con `startTimestamp`/`endTimestamp` (`:29-39`), botón de play con estados de carga/pulso/error (`:68-93`), resaltado de pista activa (`:57-61`), duración o rango (`:110-120`) y aviso de error (`:123-127`).
- `app/releases/[id]/page.tsx:36` ya carga padre + `childTracks` y detecta `isMultiTrack`. Es el molde.

**Qué falta y hay que ampliar en `ReleaseTrackList`:**
- Numeración por disco: hoy `:65` usa `index + 1`, un índice **plano** que ignora el disco.
- Título enlazado a `/track/${id}`: hoy `:102` es texto plano.
- Colapso a 6 con "Ver los N restantes" (estado en el componente).
- El prop `releaseTitle` (`:9`) está declarado y **nunca se usa**.

**Nueva función `getArtistCatalog(artistId)` en `lib/db.ts`**, una consulta sin N+1:

```sql
SELECT t.* FROM tracks t
WHERE t.artist_name = (SELECT name FROM artists WHERE id = ?)
  AND t.status = 'approved'
  AND (t.release_id IS NULL
       OR EXISTS (SELECT 1 FROM tracks c WHERE c.release_id = t.id))
ORDER BY t.release_date DESC, t.disc_number ASC, t.start_time ASC
```

El `EXISTS` es lo que hoy no existe. Se agrupa en JS por `release_id ?? id`. El `status = 'approved'` **cierra la fuga de borradores** de paso.

**Ningún test toca estos archivos** (`git grep` de `ArtistTracksSection`, `artists/[id]`, `getTracksByArtist` en `tests/` → 0), así que los 249 tests no se rompen. Sí se añaden tests del agrupamiento.

---

## 3 bis. Fase M0 — columna `track_number`

**Va antes de la Fase E y antes de D2**, en commit propio y aislado. Si D2 corre sin la columna, la semilla crea pistas sin numerar y la numeración por disco no tiene nada que leer.

Decisión del usuario: **opcional con auto-numeración**. El formulario muestra "Nº" pero no lo exige; si viene `NULL`, el orden cae a `start_time` y luego al orden de inserción. Nadie rellena 20 campos a mano para crear un álbum.

| Capa | Cambio |
|---|---|
| `lib/turso.ts` (tras `:98`) | `ALTER TABLE tracks ADD COLUMN track_number INTEGER` |
| `lib/db.ts` CREATE TABLE local | `track_number INTEGER,` junto a `end_time` |
| `lib/db.ts` (tras `:239`) | El mismo `ALTER` idempotente, para DBs locales ya creadas |
| `types/music.ts` | `track_number?: number` junto a `disc_number` (`:66`) |
| `lib/db.ts` `parseTrack` (`:680`) | Mapear la columna |
| `lib/db.ts` `createTrack` (`:2104`) | Tipo del parámetro |
| `lib/db.ts` **los dos INSERT** | Turso `:2145` y local `INSERT OR REPLACE` `:2174`: 27 → 28 columnas, 27 → 28 `?`, +1 valor |
| `lib/db.ts` `getTracksByReleaseId` (`:2035`) | `ORDER BY disc_number, COALESCE(track_number, 999), start_time` |
| `app/api/tracks/[id]/route.ts:52` | Añadir a `allowedFields` **con validación de entero ≥ 0** en el Zod de la ruta |
| `app/api/releases/route.ts:245` | Añadir a `ALLOWED_COLUMNS`, también validado |
| `app/releases/[id]/edit/page.tsx` | Input "Nº" en `TrackInput`, opcional |
| `components/ReleaseTrackList.tsx` | Numeración por disco |
| `scripts/seed-influential-catalog.ts:508-533` | Pasar `trackNumber` (ya existe en `SeedTrack` `:55`, nunca se envió) |

**Dos trampas documentadas:**

1. **Los INSERT están duplicados** (Turso y local) y tienen **27 columnas con 27 placeholders**. Hay que subir lista de columnas, cuenta de `?` y cuenta de valores a la vez, en las dos ramas. Si solo se toca una, better-sqlite3 y Turso lanzan al ejecutar. Por eso el test de round-trip es obligatorio.
2. **El `COALESCE` no es opcional.** En SQLite los `NULL` salen primero en el `ORDER BY`, así que un track sin numerar se iría a la cabecera del disco en lugar de al final.

**La columna va nullable y sin `DEFAULT` a propósito:** los 9 tracks actuales quedan en `NULL` y no tienen hijos, así que **no hace falta backfill**.

**Tests:** round-trip de `createTrack`/`updateTrack` con la columna (caza el desajuste de placeholders al instante) y orden en `getTracksByReleaseId` con mezcla de numerados y no numerados. Mantener ≥249.

**Gate:** `tsc`, `vitest`, `build`, `npx tsx scripts/turso-check.ts` para confirmar la columna, dry-run de la semilla, y revisión visual de `/releases/[id]` y del nuevo catálogo del artista con "Disco 1".

---

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

## 6. Paralelismo: qué se puede hacer a la vez

**Solo la Fase D se paraleliza. El resto es obligadamente secuencial**, y no por prudencia sino por colisiones concretas de archivo.

| Archivo | B | C | E | Conflicto |
|---|---|---|---|---|
| `app/artists/[id]/page.tsx` | B1 (`:120-122` monta `DownloadCenter`) | C1 (`:100` ancho), C7 (`:101-110` margen) | E (stats server-side) | **3 fases, líneas contiguas** |
| `components/EPKCard.tsx` | — | C1 (`:173` `title`, ancho) | E (`:44-56` quita `useEffect`, prop `stats`) | **E es estructural, no cosmético** |
| `app/dashboard/page.tsx` | B3 (`:414` `items-start`) | C6 (`:582-597` quita bloque) | — | mismo archivo, zonas distintas |

**Por qué E tiene que ir antes que C1:** C1 ajusta ancho y `title`; E **reescribe** cómo llega el dato (borra el `useEffect` por track, pasa `stats` por prop y añade un lote server-side). Si se hace C1 primero, E vuelve a abrir la tarjeta y deshace parte del trabajo.

**Lo que sí es paralelo:**

| Track | Contenido | Por qué no choca |
|---|---|---|
| 1 | C8, C9, C10, C11, C12 | Solo abre `lib/social-platforms.ts` y `app/admin/page.tsx`. Ninguna otra fase los toca |
| 2 | D1 (las 6 cuentas) | Scripts contra Turso, no edita código |

**Lo que impide un tercer track:** rama única con auto-deploy en cada merge; base de datos compartida en producción (los E2E crean y borran filas QA y `turso-check.ts` mide sobre lo que hay); y gates globales (`tsc`, `vitest`, `build` miden el árbol entero, así que un fallo de un track bloquea al otro).

## 7. Orden de ejecución definitivo

```
✅ rc.28   Blob OIDC + copy "Confirmar" + limpieza de variables

  Track 1 ─┬─ C8+C9   iconos oficiales + Webflow→BandLab
           └─ C10+C11+C12  pestañas admin (subrayado, sin azul falso, sin duplicado)
  Track 2 ─── D1  las 6 cuentas de artistas
  rc.29

  M0   Migración track_number        ← commit propio y aislado
  E    Métricas: Last.fm + N+1 de YouTube   ← antes de C1, por EPKCard
  C1+C7+B1+C2   una sola pasada: ancho de página, margen social,
                DownloadCenter público y agrupación por release
  B2+B3+B4+B5 + C6   botón muerto, items-start, catálogo HTML, PDF
  C3+C4   carrusel + /shows
  D2  Semilla con nombres reales     ← última, con C1/C2 ya en producción
```

Con este orden C1, C7 y B1 caen en **una sola pasada** sobre `app/artists/[id]/page.tsx` en vez de tres, y B3 y C6 en otra sobre `app/dashboard/page.tsx`.

**D2 va última a propósito:** la semilla genera 74 tarjetas, así que entrar antes de que C1 y C2 estén en producción dejaría la página de Pink Floyd con 32 tarjetas planas de 198px.

## 8. Housekeeping pendiente del usuario

- **`WEBHOOK_SECRET`** sin definir en Vercel. Hasta que exista, los webhooks caen al fallback de sesión admin y la firma HMAC de P7 no se usa. Generar en local y pegar en Vercel como Secret, **sin pasar por el chat** (lección del token de Blob): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Luego añadir a `.env.local`.
- **Unsplash:** `.env.local` conserva las tres y `scripts/seed-artist-images.ts:27` usa `ACCESS_KEY`, así que el requisito de seguir seedeando está cubierto. `git grep` confirma que `UNSPLASH` no aparece en `app/`, `components/`, `lib/`, `context/`, `middleware.ts` ni `next.config.js`: las que quedan en Vercel son inertes y se pueden borrar por higiene.

## 9. Fuera de alcance

- Resend / correo: `FROM_EMAIL` ausente, `pressplay.eu.org` pendiente de eu.org, cuota diaria agotada.
- Rate limit distribuido (Upstash/KV): hoy es un `Map` en memoria, evitable en serverless.
- Refactor de `/dashboard` a Server Components (TBT ~1.1 s).
- Export de datos personales / RGPD y recuperación de contraseña: la segunda **sí depende de correo**.
- Store de Blob privado: no se cambia (el acceso se fija al crear el store y no hay botón para alternarlo). Las imágenes del EPK son públicas por diseño.

---

## Anexo. Verificación y gates (aplica a todas las fases)

Por fase: `npx tsc --noEmit` → `npx vitest run` → `pnpm build` → `npx next lint` sin warnings → headed local con capturas → commit convencional + push → headed producción + matriz → `docs/AI_LOG.md`.

Gates finales: matriz de producción 50/50, las 6 suites E2E, `npx tsx scripts/turso-check.ts` con 0 filas QA y 0 huérfanos, `npx tsx scripts/a11y-check.ts`, `npx tsx scripts/axe-check.ts`, y Lighthouse contra `pnpm build` + `pnpm start -p 3100` (**nunca** contra `pnpm dev`).
