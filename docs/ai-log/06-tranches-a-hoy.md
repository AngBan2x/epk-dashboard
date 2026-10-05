# Tranches, rc.29–rc.33 y los puntos C1–C6

> Extraído de `docs/AI_LOG.md` por C7 (2026-10-05): un fichero por época,
> **moviendo** el texto, sin reescribirlo. Para buscar algo, empieza por
> `docs/AI_LOG.md`, que es el índice.

## Tranche 0 - Bugs que estaban rotos en produccion (S/M)

- **T0.1 Ajustes de cuenta rotos:** `app/api/user/settings/route.ts` usaba `getDbWrite()`, que es el writer SQLite local y efimero: en Vercel (Turso) el cambio de email, el de contrasena y el borrado de cuenta devolvian **500**, y ningun E2E lo detectaba porque todos borran via `DELETE /api/auth/me`. Reescrito sobre funciones Turso-aware nuevas en `lib/db.ts` (`getPasswordHash`, `isEmailTaken`, `updateUserEmail`, `updateUserPassword`, `softDeleteUser`, `restoreUser`, `getSoftDeletedUserByEmail`, `purgeExpiredDeletedUsers`).
- **T0.2 La UI moria sobre el borrado de cuenta:** decia "30 dias de gracia" sin restauracion, sin purga, y `deleted_at` no bloqueaba ni el login ni la sesion; ademas las cuentas suspendidas **seguian recibiendo notificaciones y emails**. Ahora: login responde 403 `ACCOUNT_SUSPENDED`, `/api/auth/me` responde 403 y borra la cookie, el fan-out filtra por `deleted_at`, existe `PUT /api/user/settings` para recuperar la cuenta con email y contrasena, y hay un formulario de recuperacion en `/account` con los dias restantes.
- **T0.3 Contrasena minima unificada a 8** con validacion real en backend (antes `/account` pedia 6 y el endpoint de cambio no validaba longitud, aceptando `"a"`).
- **T0.4 Paginacion real** en la consola de aprobaciones: los botones Anterior/Siguiente eran no-op con `// TODO` mientras mostraban "Pagina X de Y" al admin.
- **Higiene:** en una tanda previa de esta sesion se eliminaron **13 usuarios de prueba** que llevaban semanas en produccion.

## Tranche 1 - Seguridad (S/M)

- **Cuatro endpoints sin autenticacion cerrados:** `POST /api/sync` (ademas ejecutaba DDL), `DELETE /api/shows/cleanup` (disparaba fan-out), `POST /api/tracks/:id/streams` (cualquiera inflaba metricas) y `POST /api/webhooks/metrics` (cualquiera inyectaba streams/likes).
- **Firma HMAC** nueva en `lib/webhook-auth.ts` con `WEBHOOK_SECRET`: los webhooks aceptan `x-webhook-signature` y, si no hay firma valida, exigen sesion de admin. El webhook de metricas ya no hace un `fetch` HTTP para comprobar que el track existe, consulta la base directamente.
- **Notificaciones que se perdian en silencio:** con 6 de 7 artistas sin `user_id` vinculado, aprobar o rechazar no avisaba a nadie y el admin recibia un "Release aprobado" como si todo estuviera bien. Ahora `PUT /api/admin/releases` y `PATCH /api/admin/shows/[id]` devuelven `notification {artistNotified, artistFound, subscribersNotified, reason}`, el admin muestra un aviso rojo cuando el artista **no** fue notificado, y la consola de aprobaciones trae un contador de envíos sin cuenta vinculada mas un chip "Sin cuenta vinculada" por fila.
- Verificado en local: los cuatro endpoints devuelven **401** a visitantes anonimos.

## Tranche 2 - Rendimiento (S/M)

- **N+1 eliminado en `/api/dashboard`:** hacia un `await getLikeCount(track.id)` **por track, en serie**, mas cuatro consultas secuenciales independientes. Ahora las tres lecturas principales van en `Promise.all` y los likes en una sola consulta (`getTotalLikesForTracks`). **Dashboard autenticado: ~150 ms** (con 9 tracks; antes eran 9 round-trips encadenados a Turso). Esto era la causa del `testTimeout: 30 s` que documentaba AGENTS.md.
- **Optimizacion de imagenes activada:** los 22 `unoptimized` remotos eran un *workaround* porque `next.config.js` no declaraba `remotePatterns`. Se anaden los hosts (mzstatic, i.scdn, ytimg, YouTube, Unsplash, Blob, R2), AVIF/WebP, y `lib/image-config.ts` decide por URL si una imagen se puede optimizar: las de host desconocido o `blob:` siguen con `unoptimized` para no romper nada. Verificado: 9 imagenes ya pasan por `/_next/image` con `srcset` y **0 rotas**.
- **Dependencias muertas eliminadas:** `googleapis` (**203 MB**, sustituido por `fetch` contra la misma API y verificado con datos reales), `date-fns` (10 MB), `@aws-sdk/client-s3` (3,2 MB + 22 paquetes), `@types/bcryptjs`, `@eslint/js` y el archivo muerto `lib/youtube-stats.ts`.
- **`AudioVisualizer` diferido** con `next/dynamic` (ya no entra en el bundle de todas las rutas) y waterfall del servidor de `/track/[id]` a `Promise.all`.

## Tranche 3 - Accesibilidad y calidad (S/M)

- **23 controles de `DossierEditor` associates** a su label (`htmlFor`/`id`), el unico incumplimiento duro de a11y que quedaba (WCAG 1.3.1/4.1.2). Verificado: **0 controles sin etiqueta** en `/shows`.
- **Red de seguridad global de foco** en `globals.css`: `:focus-visible` con anillo de 2px en todo control interactivo, con excepcion de los que ya pintan su propio anillo. Cubre los ~125 botones que no declaraban `focus-visible` (30 solo en el panel admin). Verificado en navegador: `outline=2px solid`.
- **`ui/Button` deja de incumplir el area tactil:** `md` pasa a `h-11` (44px).
- **0 warnings de ESLint** (los dos restantes de `exhaustive-deps` documentados con motivo, porque anadir las funciones de fetch provocaria bucles de peticiones).
- **Bug latente corregido en `AudioPlayer`:** `currentSource` nunca se reseteaba al cambiar de track, dejando una fuente obsoleta.
- **Placeholders y copys:** "Proximamente" en metricas y video pasa a "Sin datos aun" / "Sin video" / "Material audiovisual en preparacion"; "Saves"/"Playlists" a "Guardados"/"Listas".
- **Preferencias que se guardaban pero nunca se leian:** `new_release_alerts` y `show_alerts` ahora se respetan de verdad en el fan-out, con 2 tests que lo demuestran.

## Tranche 4 - Verificacion, CI y SEO

- **CI arreglado:** el workflow usaba **Node 20** (el binario de `better-sqlite3` exige el ABI de Node 24, asi que los tests unitarios fallarian) y **no ejecutaba Playwright**, con lo que los 23 specs E2E no bloqueaban nada. Ahora Node 24 + paso de E2E con secretos.
- **SEO completo:** `app/sitemap.ts` (22 URLs: estaticas + artistas + tracks aprobados), `app/robots.ts` (excluye paneles y `/api`), `public/manifest.webmanifest`, `metadataBase`, OpenGraph y Twitter globales, y **`generateMetadata` + JSON-LD `MusicGroup` en la pagina de artista**, que antes heredaba el titulo generico. Verificado: sitemap.xml 200 con 22 URLs, robots 200, manifest 200, pagina de artista con JSON-LD y og:title.
- **Contraste AA:** axe detectaba blanco sobre `emerald-600` (3.4:1) y texto de pie a `slate-400`. Con `emerald-700` y `slate-600` en claro, el barrido de axe da **0 violaciones criticas/serias** en `/dashboard`, `/shows` y `/artists`.
- **Lighthouse contra el build de produccion (no dev, que no es representativo):** `/shows` **95** de performance, 98 de accesibilidad, 96 de buenas practicas, **100** de SEO, LCP 2.3 s, CLS 0. `/dashboard` 60 de performance, 94 de accesibilidad, 96 de buenas practicas, **100** de SEO, LCP 4.6 s, CLS 0. El LCP del dashboard es la portada del primer card, que se cargaba con `lazy`; se marco como `priority` y se anadieron preconnect, lo que lo bajo de 5.1 s a 4.6 s. **Queda pendiente**: el dashboard sigue siendo la ruta mas pesada (TBT ~1.1 s) porque es casi todo cliente; partirlo en Server Components es un refactor mayor, asi que se deja documentado en vez de hacerlo a medias.
- **E2E en produccion, las 5 suites que faltaban:** `subscriptions` 5/5, `notifications` 3/3, `fanout` 1/1, `search` 2/2, `broadcast` 1/1. La de suscripciones fallaba por buscar el selector de rol que P6 elimino; se actualizo al contrato nuevo.
- **Gates finales:** 249/249 unit, `tsc` 0, `next lint` sin warnings, build OK, **matriz de produccion 50/50**.
- **Higiene de datos tras toda la tanda:** 9 tracks, 2 shows, 2 usuarios reales, 0 filas QA, 0 suscripciones y 0 notificaciones huerfanas.

**Leciones de la tanda:**
1. **Los scripts de PowerShell con regex son peligrosos**: un `-replace` que no casa devolvio `$null` y escribio 5 archivos a 0 bytes (`EPKCard`, `SearchBar`, `ITunesSearch`, `VideoShowcase`, `GlobalAudioPlayer`). Se recuperaron con `git checkout` y se rehizo con ediciones puntuales. Regla: nunca escribir archivos con regex en PowerShell sobre codigo fuente.
2. Una regla CSS dentro de `@layer base` **no llegaba al CSS servido**; el anillo de foco global no aparecia. Al sacarla del layer funciono. Antes de dar por buena una regla global, comprobar en el navegador que la regla existe en `document.styleSheets`.
3. `vi.clearAllMocks()` limpia las llamadas, pero un mock tipado sin parametros (`vi.fn(async () => ...)`) hace fallar el `tsc` al leer `.mock.calls[0][0]`. Tipar el parametro del mock.
4. Los E2E que verifican UI de registro fallan de forma Expected al cambiar el modelo de roles: hay que actualizar el contrato del test, no relajar la asercion.

**Pendiente por decision del usuario (no bloquea, ninguno requiere Resend):**
1. ~~`BLOB_READ_WRITE_TOKEN` ausente: **subir imagenes da 500 en produccion**.~~ **CORREGIDO: era falso.** El token faltaba en `.env.local`, no en produccion, asi que el fallo era **local**. En produccion existia y las subidas funcionaban. Resuelto de raiz con OIDC (ver seccion rc.29 mas abajo). `SESSION_SECRET` tampoco estaba en `.env.local` ni en `.env.example` (en dev usa un valor fijo): ya documentado en `.env.example`.
2. Aplicar el seed P5.2 del catalogo influyente en produccion (script listo e idempotente, no aplicado).
3. Backfill de `artists.user_id`: 6 de 7 artistas siguen sin dueno, asi que sus aprobaciones no les llegan. El script existe y no adivina.
4. Rate limit distribuido (Upstash/KV): hoy es un `Map` en memoria, evitable en serverless.
5. `/dashboard` como ruta critica de performance (TBT ~1.1 s) si se quiere el siguiente paso.
6. Export de datos personales / RGPD y recuperacion de contrasena: la segunda **si depende de correo**, asi que sigue fuera de alcance.

---

## Plan rc.29 → rc.31 — Blob OIDC, descargas de prensa, UI y datos (2026-09-28)

**Estado:** documentado, **nada ejecutado**. Plan completo en `docs/PLAN_RC29_RC31.md`.
**Origen:** 4 decisiones del usuario (Blob / Last.fm / semilla / cuentas) + 9 problemas de UI reportados con capturas. Todo verificado con `archivo:línea` antes de planificar.

### Decisiones del usuario

| Tema | Decisión |
|---|---|
| Vercel Blob | **Plan A (OIDC)**: eliminar el token explícito, no rotarlo |
| Last.fm | Conservar las métricas de los artistas que tengan música ahí |
| Semilla P5.2 | Solo artistas **reales y de renombre**, sin sufijo `-seed` en el nombre visible |
| Cuentas de artistas | Crear las 6 que faltan, emails `@pressplay.app` y contraseña aleatoria **desconocida** |
| PDF de prensa | **PDF real en servidor con `pdfkit`** (Chromium headless descartado) |
| Lanzamientos | Agrupar por tipo y colapsar cada grupo a 6 con "ver todos" |
| `/shows` | Consistencia visual completa con el resto del sitio |

### Tres afirmaciones previas que eran FALSAS (corregidas)

1. **"Subir imágenes da 500 en producción"** (`MASTER_PLAN.md:692` y este log) → **falso**. `BLOB_READ_WRITE_TOKEN` falta en `.env.local`, así que falla **en local**. En producción existe y las subidas funcionan.
2. **"La app usa Cloudflare R2 y `lib/blob.ts` es código muerto"** (informado por un subagente) → **falso**. R2 tiene **0 referencias** en `lib/`, `app/`, `components/` y `scripts/`; el commit `8688f4b` migró de R2 a Blob y `app/api/upload/image/route.ts:5` importa `lib/blob.ts`. **No borrar `lib/blob.ts` ni `@vercel/blob`.**
3. **"`components/ArtistsCatalog.tsx` usa `useState` sin importar y rompe `/artists`"** (informado por un subagente) → **falso**. El archivo no usa `useState`; los imports están completos.

### Diagnóstico raíz del OIDC

`lib/blob.ts:32` y `:41` pasan `token: token()` de forma explícita. En `@vercel/blob` 2.8.0 el orden de resolución (`chunk-YYMLUMXS.js`) es: `:169` token explícito **gana siempre** → `:173` OIDC → `:198` `BLOB_READ_WRITE_TOKEN`. El token explícito **desactiva el OIDC hoy** y obliga al secreto estático. Por eso Vercel avisa de que "parece un secreto pero su valor es visible".

### Bugs de una línea con 4 síntomas

`lib/null-safe.ts:1` → `safeString(v, fallback = "—")`. El em dash es **truthy**, así que el `||` nunca evalúa su alternativa:

| Archivo:línea | Síntoma |
|---|---|
| `app/shows/page.tsx:202` | `ticket_url` null → `"—"` → `<a href="—">` → **404** (URL relativa) |
| `app/shows/page.tsx:200` | La tarjeta imprime `"—"` como descripción |
| `app/shows/page.tsx:201` | La tarjeta imprime `"📍 —, —"` como ubicación |
| `app/artists/[id]/page.tsx:67-68` | JSON-LD emite `"genre": "—"` |

**No** cambiar el default global: hay ~67 usos y cambiarlo arriesga regresiones.

### Otros diagnósticos medidos

- **"Actualizar datos del dossier" es código muerto.** No hay caché, ni archivo pregenerado, ni columna de versión: `POST /api/export` lee fresco de Turso en cada clic (`lib/export-bundle.ts:92-102`). `refreshDossier` descarta la respuesta y solo incrementa un contador (`data-dossier-revision`) que nadie lee. El flujo "guardar y se actualiza solo" **ya funciona**.
- **Desbalance de la tarjeta Dossier/Rider**: `align-items: stretch` de CSS Grid en `app/dashboard/page.tsx:414`; la tarjeta derecha (~300px) estira a la izquierda dejando ~190px de vacío.
- **EPKCards comprimidas**: `app/artists/[id]/page.tsx:100` usa `max-w-4xl` (896px) con `xl:grid-cols-4` → **198px por card**, contra 294px en el catálogo. `EPKCard.tsx:173` trunca el título **sin atributo `title`** (bug de a11y). No hay `slice`: es puramente layout.
- **Carrusel**: `BioSection.tsx:71` usa `md:grid-cols-4` por **viewport**, no por contenedor → dentro de una slide de 300px deja **17px de ancho de texto** por celda. `useCarousel.ts:21` fija `slidesToScroll: 1` mientras `lib/carousel.ts:11-30` ya declara la config 1/2/4 por breakpoint con **0 imports**. El contador compara un índice de *snap* contra `artists.length`.
- **`/api/export` es público y sin rate limit** (bug preexistente). `/api/lastfm` también: proxy público sin límite que además desperdicia 1 de cada 3 unidades de cuota en `getTopAlbums`, cuya datos la UI nunca lee.
- **N+1 de YouTube**: `EPKCard.tsx:44-56` pide stats por track, así que N releases = N llamadas upstream por visitante. `UnifiedMetrics.tsx:40,48` sustituye el fallo por el valor local y `app/track/[id]/page.tsx:154` muestra un `0` de likes hardcodeado.
- **No existe ruta `/catalogo`**: el enlace "Catálogo" del header apunta a `/dashboard` (`components/Header.tsx:115`).

### Orden de ejecución

`A` (OIDC + bugs de una línea) → `B` (descargas: públicas, sin botón, HTML, PDF) → `C` (tarjetas, carrusel, `/shows`) → `D` (6 cuentas + semilla con nombres reales) → `E` (métricas honestas + N+1 de YouTube). Un commit y un push por fase, con prerelease `rc.29` → `rc.31`.

**Único gate del usuario:** conectar el OIDC en Vercel **antes** de borrar `BLOB_READ_WRITE_TOKEN`, nunca al revés.

### A1 — Blob pasa a OIDC (2026-09-28) · S

**Causa raiz confirmada leyendo el SDK instalado.** `lib/blob.ts` pasaba `token: token()` de forma explicita, y en `@vercel/blob` 2.8.0 ese caso gana **siempre**: `chunk-YYMLUMXS.js:169` devuelve `readWrite` antes de que se evalue el bloque OIDC de `:173-197`. O sea, el store ya estaba conectado a OIDC en Vercel y el codigo lo estaba puenteando por encima para forzar el secreto estatico. De ahi el aviso de "parece un secreto pero su valor es visible".

**Cadena real de autenticacion** (verificada, no supuesta):
- `lib/blob.ts:1` es el **unico** archivo que importa de `@vercel/blob`.
- El SDK no lee `VERCEL_OIDC_TOKEN` del entorno: delega en `@vercel/oidc`, y ahi esta el mecanismo (`get-vercel-oidc-token-sync.js:26`): `getContext().headers?.["x-vercel-oidc-token"] ?? process.env.VERCEL_OIDC_TOKEN`. En produccion lo inyecta la propia plataforma por request, asi que **no es una variable que se gestione en el panel de Vercel** (por eso el dialogo de conexion solo crea `BLOB_STORE_ID` y `BLOB_WEBHOOK_PUBLIC_KEY`).
- Orden final: token explicito (`:169`) → OIDC (`:173`) → `BLOB_STORE_ID` (`:184`) → `BLOB_READ_WRITE_TOKEN` (`:198`).

**El token estatico y el OIDC apuntan al mismo store.** `parseStoreIdFromReadWriteToken` parte el token por `_` y toma el cuarto segmento (`1KJI0SvTDCm0FYOc`), y `BLOB_STORE_ID` normaliza quitando el prefijo `store_` al mismo valor. Por tanto **no hay migracion**: mismas URLs, mismos blobs, y revocar el token no invalida lo ya subido.

**Cambios:**
- `lib/blob.ts`: fuera el `token: token()` de `put()` y `del()`, y eliminadas `token()` y `cleanEnv()` que quedaban muertas. Comentario de cabecera actualizado con el porqué, para que nadie reintroduzca el token explícito.
- `tests/unit/security-sweep.test.ts`: fuera el `process.env.BLOB_READ_WRITE_TOKEN` del `beforeAll`/`afterAll`; solo existia para evitar el throw de `token()`.
- `.env.example`: documenta `BLOB_STORE_ID` y `SESSION_SECRET` (este ultimo no estaba, y `lib/auth.ts` lanza sin el en produccion), con aviso explicito de **no** definir `BLOB_READ_WRITE_TOKEN`.
- `MASTER_PLAN.md` y este log: corregida la afirmacion falsa de "subidas fallan en produccion".

**Blast radius:** 1 archivo de produccion + 2 lineas de test. `uploadImage` y `deleteImage` son internas de `lib/blob.ts` y solo se usan en `app/api/upload/image/route.ts:166,281`, asi que ninguna firma cambia.

**Gates:** `tsc` 0 errores, `vitest` **249/249** (21 archivos), `next lint` sin warnings, `pnpm build` OK.

**Verificado en produccion por el usuario:** subio una imagen de perfil y agrego enlaces de redes sociales en `/profile` -> "funciona perfectamente". Como el codigo desplegado ya no pasa ningun token, la subida **solo puede haber funcionado por OIDC**. **Paso 2 confirmado**, el usuario ya puede pulsar **Revoke Token**.

### A2 - Copy del boton de subida + limpieza de variables (2026-09-28) · S

**Copy (opcion B, elegida por el usuario tras ver las tres opciones).** El flujo de subida tiene **dos pasos**: el boton sube el archivo a Blob y devuelve la URL a `setProfileImage`, y despues hay que pulsar "Guardar Perfil" para que el `PATCH` la vincule al artista. "Subir imagen" describia la mecanica interna, no la accion del usuario.

| Antes | Ahora | Linea |
|---|---|---|
| "Subir imagen" | **"Confirmar"** | `components/ImageUploader.tsx:222` |
| "Subiendo..." | **"Confirmando..."** | `:201` |
| "Quitar" | **"Cambiar"** | `:193` |

"Cambiar" y no "Quitar" porque junto a un boton "Confirmar", "Quitar" se leia como deshacer algo ya guardado, cuando en realidad descarta la seleccion pendiente.

**Tests:** los 2 selectores de `scripts/verify-upload-headed.ts:45,69` buscaban `"Subir imagen"`; se actualizaron a `"Confirmar"` con `exact: true`. `git grep` confirma **0 referencias** restantes a "Subir imagen" / "Subiendo" en `app/`, `components/`, `tests/` y `scripts/`.

**Limpieza de variables muertas en `.env.local`** (verificadas sin exposicion de valores: 0 usos en `lib/`, `app/`, `components/`, `context/`, `middleware.ts`, `next.config.js`):

| Variable | Por que estaba muerta |
|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | 0 referencias en codigo. El commit `8688f4b` migro de R2 a Blob y las dejo inertes |
| `LASTFM_API_SECRET` | 0 usos. `lib/lastfm.ts:4` solo lee `LASTFM_API_KEY`; la API 2.0 de Last.fm solo necesita la key para lectura, el secret es para firmar `track.scrobble` |

**Se conservan:** `LASTFM_API_KEY` (es la que funciona), `VERCEL_OIDC_TOKEN` (parte de OIDC), `UNSPLASH_*` (las usa `scripts/seed-artist-images.ts:27`).

**Comprobado antes de borrar:** contra Turso, **0 URLs de R2** en `tracks.cover_image`, `tracks.gallery_images`, `artists.profile_image` y `artists.banner_image`, y **1 imagen en Blob** (el perfil). Ninguna imagen en produccion depende ya de R2.

`.env.local` esta en `.gitignore:46` (`.env*`), asi que la limpieza no toca el repo.

**Gates:** `tsc` 0, `vitest` **249/249**, `lint` sin warnings, `build` OK.

**Cierre verificado por el usuario:** subio una **foto de banner** despues de la revocacion -> "funciona perfectamente". Como el codigo desplegado ya no pasa ningun token y la variable fue eliminada del proyecto, la subida **solo pudo funcionar por OIDC**. La **Fase A queda cerrada**.

### Cierre de la Fase A + 15 problemas de UI (2026-09-28) · Documentacion

**Estado de la revocacion:** el usuario pulso **Revoke Token** y confirmo que `BLOB_READ_WRITE_TOKEN` ya no aparece en las variables del proyecto de Vercel. El proyecto **ya no tiene ningun secreto de larga vida para almacenamiento**, que era el objetivo del Plan A.

**Variables que el usuario quito de Vercel:** `BLOB_READ_WRITE_TOKEN`, las 5 `R2_*`, `UNSPLASH_SECRET_KEY` y las demas. `.env.local` conserva las tres `UNSPLASH_*` porque `scripts/seed-artist-images.ts:27` usa `ACCESS_KEY`; verificado con `git grep` que `UNSPLASH` no aparece en `app/`, `components/`, `lib/`, `context/`, `middleware.ts` ni `next.config.js`, asi que en produccion no las lee nadie.

**Commits de la Fase A:** `8f22b25` (Blob a OIDC) y `7c25d1e` (copy del boton). Gates de ambos: `tsc` 0, `vitest` 249/249, `lint` sin warnings, `build` OK.

**15 problemas verificados con `archivo:linea` y anadidos al plan** (`docs/PLAN_RC29_RC31.md`):

| # | Problema | Diagnostico real |
|---|---|---|
| 1 | Redes en el catalogo | `app/dashboard/page.tsx:582-597`, bloque sin encabezado. No es fuga de privacidad, es duplicacion |
| 2 | Espaciado vertical de los links | `app/artists/[id]/page.tsx:101-110`: `pt-6` sin margen inferior |
| 3 | SVGs irreconocibles | `lib/social-platforms.ts` mezcla 9 logotipos reales con **7 aproximaciones geometricas inventadas** (threads, apple-music, soundcloud, amazon-music, audiomack, mixcloud, webflow) |
| 4 | Webflow sin sentido | `:201-212`; no existe `bandlab` pese a estar especificada en `.opencode/agents/social-links-builder.md:149-154`. **0 filas con webflow** en Turso |
| 5.1 | Pestana Envios en azul | `app/admin/page.tsx:580` tiene `text-blue-600` hardcodeado, el mismo azul de la activa (`:561`) |
| 5.2 | Pestanas duplicadas | `:577-584` y `:615-620` apuntan ambas a `/admin/approvals` |
| 5.3 | Estilos de pestana inconsistentes | Tracks/Releases/Notificaciones con subrayado, Artistas/Shows con `bg-emerald-500` solido |

**Decisiones tomadas por el usuario sobre esos problemas:** quitar el bloque del catalogo · logotipos oficiales · agrupar lanzamientos **por release (opcion B)** · numeracion por disco · `track_number` **opcional con auto-numeracion** · pestanas con **subrayado** + `aria-current`.

**Hallazgo de seguridad (latente, no activo).** `app/artists/[id]/page.tsx:58` llama a `getTracksByArtist` (`lib/db.ts:2016`), que **no filtra por estado**. En cuanto un suscriptor cree un release (queda `pending`), se vera publico en la pagina del artista. Verificado contra Turso que hoy **no se esta viendo nada oculto**: 9 tracks, todos `approved`, 0 con `release_id`. Se cierra con el `status = 'approved'` de la nueva `getArtistCatalog`.

**Hallazgo de modelo de datos que condiciona C2.** Un release y un single suelto son **indistinguibles**: ambos son filas de `tracks` con `release_id IS NULL`. `getParentReleases()` (`lib/db.ts:2048`) y `getApprovedReleases()` (`:2063`) filtran solo por eso, asi que devuelven ambos, y **no existe ningun `EXISTS`** que detecte si un track tiene hijos. Ademas **no hay columna `track_number`**: los hijos se ordenan por `start_time ASC` (`:2035`), y los hijos heredan `cover_image` del padre (`seed:515`), asi que un album de 10 pistas son 11 tarjetas con la imagen identica.

**Volumen real de la semilla D2 (contado sobre el script):** 9 releases → **74 tarjetas EPKCard**. Por eso D2 va al final del orden: entrar antes de C1/C2 dejaría la pagina de Pink Floyd con 32 tarjetas planas de 198px.

**Se reutiliza, no se reescribe:** `components/ReleaseTrackList.tsx` (133 lineas) ya tiene reproductor global con `startTimestamp`/`endTimestamp` (`:29-39`), boton de play con estados (`:68-93`), resaltado de pista activa (`:57-61`) y duracion o rango (`:110-120`). `app/releases/[id]/page.tsx:36` ya carga padre + hijos y detecta `isMultiTrack`. Falta en `ReleaseTrackList`: numeracion por disco (hoy `:65` usa `index + 1` plano), titulo enlazado a `/track/${id}` (hoy `:102` es texto plano) y colapso a 6. Ademas el prop `releaseTitle` (`:9`) esta declarado y **nunca se usa**.

**Paralelismo documentado** (`docs/PLAN_RC29_RC31.md` §6): solo la Fase D se paraleliza. Las fases colisionan en 3 archivos: `app/artists/[id]/page.tsx` (B1 + C1 + C7 + E), `components/EPKCard.tsx` (C1 + E, y E es **estructural**) y `app/dashboard/page.tsx` (B3 + C6). **E tiene que ir antes que C1** porque reescribe como llega el dato a la tarjeta.

**Pendiente del usuario:** `WEBHOOK_SECRET` sin definir en Vercel. Se genera en local con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y se pega en Vercel como Secret **sin pasar por el chat** (leccion del token de Blob, que quedo expuesto en texto plano y hubo que revocarlo).

**Fuera de alcance:** Resend (`FROM_EMAIL` ausente, `pressplay.eu.org` pendiente, cuota agotada), rate limit distribuido, refactor de `/dashboard` a Server Components, export RGPD y recuperacion de contrasena, y store de Blob privado (el acceso se fija al crear el store y las imagenes del EPK son publicas por diseno).

---

## Track 1 + D1 — Iconos, pestanas del admin y cuentas de artistas (2026-09-28)

**Estado:** C8, C9, C10, C11, C12 y D1 completados y verificados. Commits en `main`.

### C8 + C9 — Logotipos oficiales y Webflow -> BandLab

`lib/social-platforms.ts` mezclaba 9 logotipos reales con **7 aproximaciones geometricas dibujadas a mano**. Los paths hoy salen de **simple-icons (CC0)** y se descargan por script (`scripts/apply-brand-icons.cjs`), no se transcriben: el bug original fue exactamente escribirlos a ojo.

| Plataforma | Antes | Path |
|---|---|---|
| threads | donut con una barra | `1176` |
| apple-music | 2 rectangulos + 2 circulos | `1620` |
| soundcloud | circulo con barras | `1064` |
| amazon-music | nota + sonrisa | `6777` |
| audiomack | triangulo con muescas | `2116` |
| mixcloud | circulos + barras | `287` |
| **webflow -> bandlab** | "W" de palos | `505` |

Ademas los 16platformas quedan con `fillRule: "nonzero"` (threads y audiomack usaban `evenodd`, incompatible con los paths de simple-icons). El script valida que el `viewBox` descargado sea `0 0 24 24` antes de escribir, que es el que usa `SocialPlatformIcon`.

**Webflow -> BandLab:** `.opencode/agents/social-links-builder.md:149-154` ya especificaba BandLab, pero nunca se implemento y salio Webflow en su lugar. Verificado contra Turso que no hay **0 filas con `webflow`**, asi que no se pierde nada. El sitio web personal ya lo cubre `dossiers.website`.

**Verificacion visual:** `scripts/verify-social-icons.cjs` renderiza los 16 iconos a 16/20/24 px en claro y oscuro (`tests/screenshots/social-icons/icons-16-20-24.png`). **Los 7 antes irreconocibles ahora se identifican de un vistazo** a 16 px. `scripts/verify-social-editor.cjs` confirma en `/profile` (con la cuenta de artista) que el editor desplegado tiene 16 inputs y 16 iconos, BandLab presente y Webflow ausente.

### C10 + C11 + C12 — Pestañas del admin

- **C10:** `app/admin/page.tsx` tenia `text-blue-600 dark:text-blue-400` **hardcodeado** en el enlace "Envíos", el mismo azul de la pestaña activa, de ahi la sensacion de "estoy en Envíos". Ahora el enlace usa el token inactivo.
- **C11:** "Envíos" y "Aprobaciones" apuntaban ambos a `/admin/approvals`. Se **elimina "Aprobaciones"** y se conserva "Envíos", que ademas aporta el contador de pendientes. Verificado que el header no enlaza ahi, asi que el duplicado estaba solo en el admin.
- **C12:** coexistian dos familias visuales — Tracks/Releases/Notificaciones con `border-b-2` y Artistas/Shows con `bg-emerald-500 text-white` solido. Se unifica al **subrayado** (mayoritario, 3 de 5) conservando el color de marca por dominio, mediante `TAB_ACCENT` + `adminTabClass()` a nivel de modulo para que las 6 entradas no puedan divergir. Se anade `aria-current="page"`, que faltaba.

**Verificacion visual:** `scripts/verify-tabs-icons.cjs` -> **23/23 PASS** en claro y oscuro. Comprueba que queda **1 sola pestaña con `border-b-2` y 1 solo `aria-current`**, que "Envíos" no lleva azul, que "Aprobaciones" desaparecio y que las 5 pestañas activan correctamente.

### D1 — Las 6 cuentas de artistas

Nuevo `scripts/seed-artist-owners.ts`, dry-run por defecto. Reutiliza `createUser` de `lib/db` en vez de duplicar el INSERT.

**Un error mio que se salvo solo:** la primera version hacia `INSERT ... created_at, updated_at`, pero la tabla `users` **no tiene `updated_at`** (`PRAGMA table_info` → `id, name, email, password_hash, role, created_at, preferences, avatar, email_verified, deleted_at, last_login`). Fallo en los 6 y creo **0** cuentas, sin estado parcial. Corregido delegando en `createUser`.

**Aplicado y verificado por SQL directo contra Turso:**

| Comprobacion | Resultado |
|---|---|
| Artistas con `user_id` | **7 de 7** (antes 1 de 7) |
| Artistas sin `user_id` | **0** |
| Huerfanos (`user_id` sin fila en `users`) | **0** |
| Emails duplicados | **0** |
| `password_hash` vacios o sin bcrypt | **0** |
| Admin intacto | `admin@epk.local` / Admin EPK / admin |

Cuentas creadas: `eagles@`, `ed-sheeran@`, `kate-bush@`, `nirvana@`, `queen@`, `the-weeknd@` (todas `@pressplay.app`, `role=artist`).

**Idempotencia probada:** la tercera corrida consecutive dice "Con dueno: 7 / Sin dueno: 0 / No hay artistas sin dueno" y no escribe nada. Las contrasenas son aleatorias de 32 bytes, no se muestran y no se guardan en ningun sitio, asi que **nadie puede entrar con esas cuentas**.

### Bloqueador encontrado y resuelto: SESSION_SECRET

`lib/auth.ts:18-19` lanza si `NODE_ENV=production` y no hay `SESSION_SECRET`, y `.env.local` no lo tenia. Efecto: **`pnpm start` no permitia iniciar sesion localmente**, que es justamente el modo que exige el workflow para medir Lighthouse y hacer headed. Se manifesto como `login failed` -> 500 en `POST /api/auth/login`.

Resuelto generando un `SESSION_SECRET` en `.env.local` (gitignored). Es el item que carried pendiente desde la auditoria; el de Vercel ya estaba puesto y por eso produccion nunca lo suffrio.

### Lecciones

1. **Los paths de icono no se escriben a mano.** El bug original (7 de 16 irreconocibles) nacio de dibujar geometria a ojo. Descargarlos de simple-icons con un script que valida el `viewBox` elimina la clase de error.
2. **Verificar a 16 px, no "que compile".** Un path mal copiado compila y se ve igual de mal; la unica forma de detectarlo es renderizarlo al tamano real de uso (`size="sm"` usa `w-4`).
3. **Delegar los INSERT en la capa de `lib/db`.** La tabla `users` tiene menos columnas de las que asumi, y duplicar el INSERT en un script es lo que provoco el fallo. `createUser` ya sabe el esquema.
4. **`pnpm build` en Windows exige parar el servidor antes**: el `prebuild` borra `data/music_catalog.db` y da EPERM si esta abierto. Ocurrio en esta tanda.
5. **El admin no tiene perfil de artista**, asi que `/profile` con esa cuenta **no monta el editor de redes**. Un test de UI que use la cuenta equivocada da falsos negativos: paso en la primera pasada de C8/C9.

---

## Rediseño del carrusel de artistas del catálogo — 1 artista por página

**Fecha:** 2026-09-29
**Modelo:** MiMo v2.6 Flash Free (subagente `carousel-builder`)
**Alcance:** componente (`components/`, `lib/carousel.ts`) — sin cambios de API ni de esquema

### Problema
Tres fallos encadenados en el carrusel "Artistas" de `/dashboard`:
1. `BioSection` usaba `md:grid-cols-4` (breakpoint de **viewport**) dentro de una slide de ~300px → 17px de texto por celda.
2. `useCarousel` fijaba `slidesToScroll: 1` mientras `lib/carousel.ts` declaraba una config responsive 1/2/4 con `getSlidesForWidth()` que **nadie importaba** (código muerto).
3. El contador comparaba el índice de snap contra `artists.length` en vez de contra el número de páginas.

### Decisiones
- **`md:grid-cols-4` → container query.** `grid-cols-2` + `[@container(min-width:40rem)]:grid-cols-4` sobre un wrapper `[container-type:inline-size]`. El número de columnas depende del **ancho del propio componente**, no del viewport: dentro de la columna de Bio del carrusel (~520px) se queda en 2×2 (celdas de 250px, sin truncar) y en la página de artista (grid de 814px) sigue en 4 columnas (celdas de 192px), que es como estaba. **No hizo falta instalar `@tailwindcss/container-queries`**: Tailwind 3.4 genera la variante arbitraria `[@container(...)]:...` sin plugin (verificado con la CLI). Si el navegador no soporta container queries, queda el fallback 2×2. Añadido `min-w-0` + `truncate` + `title` en los 4 valores (helper local `MetricCell`).
- **`lib/carousel.ts`: borrar, no cablear.** `slidesConfig`/`getSlidesForWidth`/`autoplayDefaults` decían 1/2/4 slides, que contradice el diseño aprobado (1 artista por página en cualquier breakpoint): cablearlos habría hecho avanzar el carrusel 2-4 slides cuando solo se ve 1. Se eliminan; quedan `defaultEmblaOptions.slidesToScroll = 1` y `autoplayDefaults.delay`, los dos ahora **cableados** en `useCarousel` como defaults → una sola fuente de verdad.
- **Contador:** `Página {selectedIndex + 1} de {scrollSnaps.length}` (fallback a `artists.length` solo en el primer render, antes de que Embla mida).
- **Slide:** `basis-full` en `CarouselItem` (antes `sm:basis-1/2 xl:basis-1/3 2xl:basis-1/4`) y la slide pasa a `grid grid-cols-1 gap-6 lg:grid-cols-2` → Bio izquierda, Shows derecha en desktop, apilado en móvil.
- **Shows vacíos:** `ShowsBooking` ahora usa el design system `components/ui/EmptyState` en su rama vacía (antes un `div` ad-hoc), así la columna derecha nunca deja un hueco.

### Verificación
- `npx tsc --noEmit` ✅ · `npx next lint` ✅ (0 warnings) · `npx vitest run` ✅ **257/257**.
- Visual con Playwright (`scripts/carousel-visual-check.ts`, claro + oscuro × desktop 1440 + móvil 390) → `screenshots/carousel-redesign/`. Medido en DOM: 1 slide = 100% del track (1198px desktop / 308px móvil), métricas 2×2 de 250px sin truncar en el carrusel y 4×1 de 192px en `/artists/[id]`, contador `Página 1 de 7` → `Página 2 de 7` al avanzar, columna de Shows con contenido (slide 1) y con `EmptyState` (slide 2).


---

## C1 + C7 + C2 - pagina publica del artista (ancho, margen social y catalogo agrupado)

**Fecha:** 2026-09-29
**Modelo:** MiMo v2.6 Flash Free (subagente `dashboard-builder`)
**Alcance:** `app/artists/[id]/page.tsx`, `components/ArtistTracksSection.tsx`, `components/EPKCard.tsx`, `lib/db.ts`, mas `scripts/rc29-artist-shots.ts` y `tests/unit/artist-catalog.test.ts`

### Que se hizo

- **C1 (ancho + a11y):** `max-w-4xl` -> `max-w-7xl` en `app/artists/[id]/page.tsx`. La tarjeta pasa de **198px a 294px** (medido en DOM, el mismo ancho del catalogo). En `EPKCard.tsx` el `h3` con `truncate` gana `title={title}`, asi el texto completo es accesible con hover/lector de pantalla.
- **C7 (margen social):** el wrapper de los links pasa de `pt-6` a `pt-6 mb-6` -> hueco medido de **24px** entre las redes y `BioSection` en claro y en oscuro.
- **C2 (agrupar por release):** `getArtistCatalog(artistId)` en `lib/db.ts` con **una sola consulta** (sin N+1): `status = 'approved'` (cierra la fuga de borradores/pendientes) + `EXISTS` sobre `c.release_id = t.id` para distinguir album de single suelto (ambos son `release_id IS NULL`). Devuelve `ArtistCatalogGroup[]` como **array plano** para que no se pierda al cruzar Server -> Client. `ArtistTracksSection` renderiza EPKCard del padre (play, like, metricas) + panel con cabecera enlazada a `/releases/[id]`, `ReleaseTrackList` con 6 filas y boton `Ver los N restantes` con estado por release.

### Datos de prueba y capturas

- `scripts/rc29-artist-shots.ts` con modos `seed` / `clean` / `shots`: siembra un artista con album de 8 hijas + 2 singles, redes y bio, y comprueba 15 invariantes antes de capturar.
- **No se pudo usar `pnpm start -p 3100`:** `pnpm build` esta prohibido en esta fase y `.next` lo comparten los agentes en paralelo. Solucion: copia temporal del repo **sin `.env.local`** (así Turso queda desactivado y se usa SQLite local) con `node_modules` via junction, servidor `next dev` aislado en el puerto 3210 y capturas en `tests/screenshots/rc29/` (`artist-light`, `artist-dark`, `artist-dark-expanded`, `release-detail-dark`, `artist-mobile-390-light/dark`). Al terminar: servidor parado, copia borrada y `clean` aplicado sobre `data/music_catalog.db` (11 tracks + 1 artista rc29-*).

### Hallazgos

1. **`next dev` (Node 24 + Next 14.2) se cae con `Assertion failed: (env) != nullptr`** en el worker al cerrar un contexto de Playwright y abrir otro -> `ERR_CONNECTION_REFUSED` a mitad del guion. Reproducido 4 veces. Se esquivó con **un solo contexto**: tema cambiando la clase `dark` en `<html>` y viewport con `setViewportSize(390)`. El guion ya no mata el proceso si algo falla (try/finally sobre `browser.close()`).
2. **`ReleaseTrackList` trunca el titulo de la fila sin `title`** (p. ej. "Todo vue..."): mismo bug de a11y que el de C1. Esta en el archivo que lleva otro agente en paralelo, asi que queda como **follow-up** en vez de editarlo a ciegas.
3. Con 3 releases el `xl:grid-cols-4` deja una celda vacia; es el mismo patron del catalogo, no es una regresion de C1.
4. La pagina sigue incluyendo **11 tracks** en "Descargas para prensa" (1 album + 8 hijas + 2 singles): el dossier no esta agrupado, solo la rejilla visual.

### Verificacion final

- `npx tsc --noEmit` -> 0 errores · `npx next lint` -> 0 warnings · `npx vitest run` -> **342/342 (27 archivos)**.
- Visual local: **15/15 comprobaciones** en claro, oscuro y movil 390 (ancho de tarjeta, `title`, hueco 24px, 3 EPKCards en vez de 11, 6 filas + `Ver los 2 restantes` -> 8, y navegacion a `/releases/rc29-album` con las pistas visibles).
---
title: "AI_LOG — 2026-09-30 — Ola 3 cerrada: C1/C7/C2/C4, B5 (PDF) y D2 (semilla)"
date: 2026-09-30
tags: [ai-log, rc29, pdf, seed, ui]
---

# 2026-09-30 — Cierre de la Ola 3 (C1/C7/C2/C4), B5 y D2

Continuación de la Ola 2 (`195ff4f`). Todo lo de abajo está **verificado en producción**, no solo en local.

## Qué se entregó

| Item | Commit | Estado |
|---|---|---|
| C1 + C7 + C2 + C4 | `d21ab28` | Hecho, verificado en prod |
| Regresión del header (inset 194px) | `304a9c8` | Hecho, verificado |
| D2: quitar sufijo + `--cleanup` | `143cf27` | Hecho |
| B5: PDF con pdfkit | `06062b6` | Hecho (3 correcciones después) |
| Fuentes incrustadas | `7629b9d` | Hecho |
| `font: null` y fin del tracing | `dcf5c16` | Hecho, **PDF 200 en prod** |
| `createTrack` no escribía `status` | `35c01bb` | Hecho, D2 visible |
| Catálogo a 3 columnas | `bfdda30` | Hecho |

Gates finales: `tsc` 0, `lint` 0, `vitest` **378/378** (32 ficheros), `build` OK.

---

## Los cuatro fallos que hicieron falta de más

Ninguno de los cuatro se veía en local. Es la clase de fallo que más caro sale en este proyecto, así que queda escrito.

### 1. Regresión de C1 que introduje yo

Al subir `main` de `max-w-4xl` a `max-w-7xl` para que las EPKCard dejaran de estar comprimidas, el `max-w-4xl` **interno de `ArtistHero`** pasó a recortar el header: el nombre del artista quedó inset **194px** respecto a las tarjetas de abajo. Visible en una captura de producción; invisible para 342 tests.

El primer arreglo **fue incorrecto**: quité el `max-w-4xl` creyendo que era un `no-op` redundante. No lo era, porque `ArtistHero` se renderiza **fuera** de `<main>` (`app/artists/[id]/page.tsx:108` vs `:133`), así que ese contenedor es el único que lo recorta. quitarlo dejó el header a 1440px pegado al borde de la ventana. Lo detectó la misma comprobación que iba a validar el arreglo.

`scripts/rc29-header-align.ts` mide los bordes de `main`, el `h1`, el contenedor del header y la primera tarjeta, y falla si la desalineación pasa de 8px. **Comprobé que detecta el fallo contra producción (208px, exit 1) antes de arreglar**, porque un check que siempre pasa no protege de nada.

### 2. Ficha de pista partida entre páginas en el PDF

`drawTrackRow` reservaba espacio con `ensureSpace` para la cabecera y nada más, así que las métricas, los metadatos y la letra se dibujaban con reservas locales. Resultado: la cabecera de "Se Va" al pie de una página y sus `DAW`/`TONALIDAD`/`LETRA` huérfanos en la siguiente, **sin nada que dijera a qué pista pertenecían**. En un dossier de prensa eso es directamente inútil.

El PDF era perfectamente válido: `%PDF-` correcto, fuentes incrustadas, tamaño esperado. Por eso los tests de bytes no lo cazaron.

`measureTrackEntry` reserva ahora la ficha entera, y las líneas de metadatos salen de la **misma** función que las dibuja para que medir y dibujar no puedan divergir. El documento pasó de 5 a 6 páginas: es el intercambio correcto.

### 3. El PDF daba 500 en producción, y la causa no era donde yo miré

Secuencia real: tres deploys deploying theories equivocadas.

| Teoría | Resultado |
|---|---|
| Las TTF en `public/` no se leen en la lambda | Falsa. También fallaba en `lib/pdf/fonts/` |
| Los `.nft.json` no traían las TTF | Falsa. Sí venían |
| El build de Vercel estaba fallando | Falsa. `Build Completed in 40s` |

La causa era doble, y ninguna de las dos la hubiera encontrado leyendo el código:

1. `new PDFDocument()` llama a `initFonts(options.font)`, que carga Helvetica con un `require('#standard-fonts/Helvetica')` **dinámico**, antes de que exista nuestro código. El tracer de Next no lo ve, el directorio no llega a la función, y:
   ```
   Cannot find module '/var/task/.../pdfkit/js/standard-fonts/Helvetica.cjs'
   ```
   Se evita con `font: null`, que hace que `initFonts` se salte la fuente por defecto.

2. Vercel rechazaba el despliegue completo con:
   ```
   The framework produced an invalid deployment package for a Serverless
   Function. Typically this means that the framework produces files in
   symlinked directories.
   ```
   Cualquier glob de `outputFileTracingIncludes` a `node_modules` con pnpm lo dispara. Por eso **ahora no hay ninguna regla de tracing**: la fuente va incrustada en el bundle y las estándar no se necesitan.

Cómo se averiguó sin acceso a los logs de Vercel: `html` y `json` a 200 con `pdf` a 500 en la misma llamada acota el fallo; un commit con el mensaje de error en la respuesta dio la causa exacta (y se revirtió después, porque filtrar internos en un endpoint público no es aceptable); y la pila en local, interceptando `Module._load`, señaló al constructor y no a nuestro código.

### 4. `createTrack` no escribía `status`

`status` estaba declarado en la firma y **no aparecía en ninguno de los dos INSERT**. La columna se quedaba en el default del esquema (`draft`) y como todo lo público filtra `status = 'approved'`, **las 74 filas de D2 eran invisibles**: `turso-check` daba `tracks: 83` y la página del artista no mostraba ni un álbum. Sin un solo error en ningún sitio, y con 375 tests en verde porque la base estaba vacía.

Es el argumento definitivo de por qué D2, aunque sea el último item y "solo datos", valía como prueba: los datos de verdad son los que destapan los fallos de lógica.

De paso, el `--cleanup` que escribí antes **estaba roto**: borraba por `(artist_name, title)`, que solo encuentra al padre, así que dejaba 63 hijas huérfanas y las reportaba como "tracks ajenos". Un cleanup que deja restos es peor que no tenerlo, porque hay quien lo dará por bueno creyendo que la base está limpia. Ahora borra por estructura y limpia huérfanos con `release_id` colgante.

---

## Cómo se comprueba un PDF sin mirarlo a ojo

`tests/helpers/pdf-text.ts` extrae el texto de cada página. No es trivial, y las trampas son suyas:

- PDFKit incrusta las fuentes como **subset** y escribe el texto como IDs de glifo en hex dentro de arrays `TJ` (`[<0013> 20 <0014>] TJ`). Hay que leer el CMap `ToUnicode` de cada fuente.
- Ese CMap usa la forma **array** de `bfrange` (`<lo> <hi> [<d0> <d1> ...]`), no la escalar. Sin esa rama todos los glifos salen como basura.
- Un objeto `/Page` **no tiene stream**: su contenido está en `/Contents`. Buscar "páginas con stream" no encuentra ninguna.
- El regex `/stream\r?\n/` **también matchea el "stream" de "endstream"**, desalinea los offsets y pierde páginas sin dar ningún error. Lleva lookbehind.
- Cortar el stream en `"endstream"` es frágil: esa palabra puede salir por azar en datos binarios. Se usa `/Length`.
- Los números dentro de un `TJ` son ajustes de **kerning**, no espacios. Contarlos como separador deforma `"2 / 7"` a `"2/7"` y hace fallar las aserciones del pie de página.

`tests/unit/pdf-layout.test.ts` bloquea las dos regresiones, y `tests/unit/pdf-standard-fonts.test.ts` intercepta `Module._load` para fallar si algo pide `standard-fonts`. **Ambos se comprobaron revirtiendo el arreglo**: sin `font: null` falla, y sin `measureTrackEntry` falla.

## Un error mío que casi se cuela

Leí **"3 / 5"** en el pie de la página 5 de una captura y diagnostiqué la numeración como rota. El extractor de texto dijo 2/5, 3/5, 4/5, **5/5**: estaba bien, era un 5. Un píxel pequeño a tamaño completo engaña; el texto extraído no.

## Rejilla del catálogo: de 4 columnas a 3

Con albums reales en la base (The Wall tiene 20 pistas) los títulos se leían `"Another ..."`. C1 subió la rejilla a 4 columnas porque la EPKCard **suelta** quedaba en 198px, pero desde C2 cada celda es un grupo con la tarjeta **y** la lista de pistas, y en la fila de la pista compiten número, play, título y `"0:00 – 3:19"`. El título se quedaba en ~120px.

A 3 columnas: 40 títulos medidos, 6 truncados y solo por 17-31px. La calibración de C1 no estaba mal; cambió el supuesto en que se apoyaba (celda = tarjeta).

---

## Estado de los datos

Turso: **12 artistas, 83 pistas, las 83 `approved`, 0 huérfanos**.

| Artista | Grupos | Pistas hijas |
|---|---|---|
| Pink Floyd | 2 | 30 |
| Radiohead | 2 | 22 |
| Björk | 1 | 5 |
| David Bowie | 2 | 4 |
| Kraftwerk | 2 | 4 |

`artists_sin_dueno` pasa de 0 a 5 **a propósito**: los artistas del seed son material de referencia, no perfiles de gente real, a diferencia de los 7 con dueño que creó D1.

## Advertencia sobre Turso en producción

`/api/artists` en producción sirvió datos obsoletos durante ~20 minutos tras la resiembra (devolvió un id de artista ya borrado, y `X-Vercel-Cache: MISS`, `Age: 0`, o sea no era caché). El mismo host, el mismo token, y la ruta de detalle sí estaba al día. **La réplica va retrasada**: para leer el estado real hay que usar `npx tsx scripts/turso-check.ts`, no las lecturas de la API. Merece la pena confirmarlo cuando se pueda.

## Pendientes que siguen abiertos

- **`WEBHOOK_SECRET`**: lo define el usuario. Generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y pegarlo en Vercel como Secret, sin pasarlo por el chat.
- **Resend**: fuera de alcance. Falta `FROM_EMAIL`, el dominio está pendiente y la cuota está agotada.
- **`syncLocalToTurso`** conserva deuda previa: omite `track_number` y otras columnas de P3/P5.
- `app/shows/page.tsx` conserva `<h1>Shows & Events</h1>` en inglés porque el E2E lo exige; si se fuerza el copy español, hay que actualizar el test.

---
title: "AI_LOG — 2026-09-30 — La ficha de un album estaba maquetada como si fuera una pista"
date: 2026-09-30
tags: [ai-log, rc30, releases, seed, container-queries]
---

# 2026-09-30 — Releases: la ficha de un album vacía y la ficha técnica rota

Reportado con capturas de `/track/rel-5878039e` (Kid A). Tres síntomas visibles y **una sola causa de fondo: la página de `/track/[id]` solo se había mirado con pistas sueltas.** Es la tercera vez que sale el mismo patrón (C2 con los albums, `createTrack` sin `status`, y ahora esto): la lógica funciona con el caso de siempre y nadie la mira con el otro.

## 1. Las 9 portadas de la semilla estaban rotas

Los 9 releases apuntaban a `https://example.com/covers/*.jpg`. `example.com` es el dominio de ejemplo reservado por la RFC: nunca resuelve. Salía el icono de imagen rota sobre un fondo vacío.

74 filas correctas y 9 portadas rotas, y ningún test lo vio porque **los tests no miran la red**.

Sustituidas por fotos de Unsplash, que es el único dominio genérico que ya estaba en `images.remotePatterns` y el mismo que usa la galería. De 19 candidatas, **18 resuelven y 1 da 404**: `scripts/check-image-urls.ts` las comprueba con HEAD y descarta las que no devuelven 200 + `image/*`. Se verifican dos veces: antes de sembrar y después, leyendo `cover_image` de la propia base.

Además, `CoverImage` (nuevo) hace lo que el anterior no podía. Antes la decisión era `getCoverImage(track) ? <img> : <marcador>`, que **solo cubre la URL vacía**: una URL muerta se aceptaba igual. Ahora hay `onError` de verdad con estado, y cualquier portada rota cae al marcador con la inicial.

## 2. Un album se renderizaba con la plantilla de una pista

La ficha de Kid A era seis tarjetas vacías: "Letra no disponible" con un botón *Expandir* que no expandía nada, "Videoclip Oficial - Sin video" sobre una imagen gigante, "Sin datos de producción", "No hay enlaces externos disponibles", unas métricas de Last.fm que eran de **otra canción**, y un reproductor con "No hay audio disponible" y un play que no hacía nada.

Y sin la **lista de pistas**, que es justo lo que viene a buscar un periodista a un álbum.

Ahora se detecta si el elemento tiene hijas y cambia la plantilla:

- **Nueva `ReleaseTracklistSection`**: pistas por disco y número (orden M0), duración, enlace a la ficha de cada una.
- Se ocultan letra, videoclip, enlaces y detalle de producción. Cada tarjeta se oculta además **solo si no tiene nada que mostrar**, no por ser un álbum: un padre con un enlace real lo seguiría viendo.
- Se omite Last.fm, que mide canciones.
- Se oculta el reproductor: la fila padre existe solo para agrupar y no tiene audio.
- Las métricas de streams/likes/guardados/listas se sustituyen por **pistas, discos y duración total**, que en un álbum sí significan algo. Antes ponía "0 Streams / Sin video de YouTube" en Kid A, que suena a que el álbum no se ha escuchado nunca.
- El SEO decía "Álbum - 00:00 - 0 streams" en buscadores y previews de enlaces.

## 3. La ficha técnica estaba rota, y no por su cuenta

`CatalogDownloadButton` usa `sm:grid-cols-2`, que responde al **viewport**. En la barra lateral de `/track/[id]` el componente mide 304-347px aunque el viewport sea de 1440px, y se partía en 2 celdas de 146px. Dentro, la fila se come el ancho con badge (32) + hueco (12) + hueco (12) + botón (80) = 136px, dejando **0px** para el texto: cada palabra en su propia línea.

Medido con `scripts/rc30-measure-ficha.ts`:

```
  390px   card=358  celda=316  texto=154   OK
  768px   card=720  celda=333  texto=171   OK
 1024px   card=304  celda=125  texto=  0   ROTO
 1280px   card=347  celda=146  texto=  0   ROTO
 1440px   card=347  celda=146  texto=  0   ROTO
```

Ahora decide columnas por **container query** con umbral de 30rem, siguiendo la convención que ya estableció `BioSection.tsx` y por el mismo motivo: un breakpoint de viewport no sabe cuánto mide el componente. Es el problema que C3 encontró en el carrusel, en otro sitio.

`DownloadCenter` tiene markup **idéntico** y no lo sufría solo porque su contenedor es de 1248px. Si se reutiliza en un sitio estrecho, ahora está protegido.

## De paso

`BioSection` pasa a `line-clamp-3`. Las celdas miden ~180px y a 2 líneas caben ~28 caracteres: "Alternative Rock / Experimental / Art Pop" (42) salía como "... / Ar..." con la segunda línea casi vacía, que se lee como dato roto.

## Verificación

`scripts/rc30-track-regression.ts` recorre un álbum y una pista suelta en 1440/1280/1024/768/390px y comprueba portada cargada, ficha técnica legible, que el álbum tenga tracklist y **sin** tarjetas vacías, y que la pista suelta **no** tenga nada de eso.

- Local: 10/10
- Producción: 10/10
- **Comprobado que falla al revertir** el arreglo: 7 fallos, exactamente en 1024-1440px, que es donde la barra lateral es estrecha.

Un detalle: la comprobación de portada daba falsos negativos por mirar `naturalWidth` a los 1200ms sin esperar. En una corrida de reversión reportó "portada rota" a 1440px cuando lo único roto era la ficha técnica, y eso manda a mirar al sitio equivocado. Ahora espera a que la imagen resuelva.

## Los MCP de Vercel y Turso

Añadidos los dos, con los endpoints confirmados en la documentación oficial (no inventados): `https://mcp.vercel.com` y `https://mcp.turso.ai/mcp`, ambos remotos con OAuth. OpenCode está en la lista de clientes soportados de Vercel.

**Requieren reiniciar opencode** y luego `opencode mcp auth vercel` / `opencode mcp auth turso`.

En `AGENTS.md` queda escrito, con los cuatro hallazgos de Ola 3 que **no** salieron de un servidor, para que no se piense que un MCP los sustituye:

| Técnica | Para qué |
|---|---|
| Leer `.next/server/app/api/<ruta>/route.js.nft.json` | Es el mismo manifiesto que usa Vercel para decidir qué viaja en la lambda |
| Interceptar `Module._load` | Demostró que pedía Helvetica el constructor de PDFKit, no nuestro código |
| Extraer texto de PDF con el CMap `ToUnicode` | Un PDF mal maquetado es un PDF válido: solo se ve leyendo su contenido |
| Comprobar que un test falla al revertir | Disciplina, no herramienta |

## RC.31 — 15 problemas, 2 huecos y el flujo de promoción

Documento de fase: `docs/PLAN_RC31.md`. Ocho agentes en cuatro olas, con
propiedad exclusiva de ficheros para que nadie editara lo que otro tenía.
Los commits los hizo el orquestador: cinco agentes en paralelo sobre un mismo
índice git se pisan.

### La fuga que no era una fuga

El error en pantalla era *"Error al iniciar reproducción — archivo no disponible"*.
La causa documentada en `AI_LOG.md:1268` era CORS: *"removido crossOrigin para
evitar CORS con CDN Apple"*.

Medido con `curl -I` y `Origin: https://epk-dashboard.vercel.app`:

```
audio-ssl.itunes.apple.com -> 200 OK
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Headers: range
  Accept-Ranges: bytes
```

**El CDN sí manda ACAO.** El arreglo de 1268 resolvía un problema que no
existía. Lo que fallaba eran las 6 URLs de preview de `scripts/seed-f9-catalog.ts`,
**caducadas: 404**. Una URL fresca de la Search API da 200.

Es el mismo patrón que el `standard-fonts/Helvetica` del PDF: un arreglo
plausible que se llevaba el mérito de un síntoma que tenía otra causa. La
herramienta que lo desmontó fue un `curl` de una línea, no un MCP.

### El parser que duraba mal

`tracks.duration` es texto, y coexistían cinco convenciones: `"3:45"`,
`"05:55"`, `"00:00"`, `""` y `"—"`. El parser de suma estaba **duplicado** en
`ReleaseTracklistSection.tsx:35-37` y `app/track/[id]:96-98`, y destruía solo
`[m, s]`:

```ts
const [m, s] = "1:02:03".split(":").map(Number);  // m=1, s=2 -> 62 s
```

`"1:02:03"` son 3723 segundos. El guard `isNaN` **no salta**, porque
`[1, 2, 3]` no contiene `NaN`. Y no era hipotético: `lib/youtube.ts:366-374`
emite `H:MM:SS` y `app/releases/new/page.tsx:207` lo escribe en `duration`.

Un test de una hora valía más que tres code reviews.

### El suscriptor no podía llegar a ser artista

`AGENTS.md` decía *"un suscriptor SÍ puede entrar a crear releases/shows"*. El
código hacía lo contrario: `app/api/shows/route.ts:123` y
`app/api/releases/route.ts:116` devolvían 403 a `subscriber`.

Lo importante es por qué eso no se arregla aflojando el rol. Desde P6 el
registro público solo crea `subscriber`, y un suscriptor **no tiene fila en
`artists`**. Encima, `userHasApprovedContent` (`lib/artist-promotion.ts:112-116`)
solo mira `track_submissions`; para shows exige `getArtistByUserId(userId)`, que
un suscriptor no tiene. Así que **aflojar el rol habría puesto filas `pending`
en `tracks`/`shows`, donde la maquinaria de promoción no las ve** — la
promoción seguiría sin dispararse, y habríamos ensanchado dos endpoints de
escritura.

El camino correcto ya existía en el servidor: `POST /api/submissions` no pide
rol, toma el `userId` de la sesión en vez de un header falsificable y fuerza
`pending`. Lo que faltaba era la UI. El portal `/submissions` es la solución.

De paso: **la promoción vía show es estructuralmente imposible**, no difícil.

### Lo que se cerró

| | Antes | Después |
|---|---|---|
| `GET /api/releases?id=X` anónimo | `SELECT *` crudo, con `admin_notes` y borradores | whitelist de `parseTrack` |
| `GET /api/tracks` anónimo | `SELECT *`, con `admin_notes` incluido | `getApprovedTracks()` |
| `GET /api/dossiers` | sin sesión ni propiedad | 401 |
| `/api/dashboard` shows | sin filtrar, a anónimos | aprobados para no-admin |
| `ReleaseActions` | 33 líneas, sin chequeo de rol | `useAuth` + propiedad |
| `/releases/:id/edit` | cualquier cuenta autenticada | `requireRole` en middleware |
| `/api/artists` | dos fuentes de verdad, 500 si discrepaban | un lector |
| Pistas con audio | 6 | **63** |
| Filas con carátula real | 0 | **71** |
| Duración de los 9 padres | `00:00` | suma de las hijas |
| `release_id` en el JSON | ausente | presente, con test de forma |
| Anillos de foco en aprobaciones | 16 con doble contorno rosa | uno solo |

### Verificado en producción, no en local

`GET /api/releases?id=rel-3b6a6c89` → `duration: "8:21"`, `admin_notes` ausente,
28 claves que son exactamente la whitelist de `parseTrack`. `/api/artists` → 12.
`/releases/rel-3b6a6c89` anónimo → sin "Editar Release" y sin "Aprobado".
`/api/dossiers` → 401.

Rejilla de releases, columnas computadas:

| Viewport | Columnas | Ancho | Títulos truncados | Anidados |
|---|---|---|---|---|
| 1440 | 4 | 294px | 0 | 0 |
| 1280 | 4 | 294px | 0 | 0 |
| 1024 | 3 | 315px | 0 | 0 |
| 768 | 2 | 356px | 0 | 0 |
| 390 | 1 | 358px | 0 | 0 |

El requisito era 4 por página **sin** volver al truncamiento que motivó
`bfdda30`. Los 0 truncados son el dato importante; el 4 es el fácil.

### Una lección sobre las herramientas

El MCP de Vercel quedó autenticado pero con **scope vacío**: `list_teams`
devuelve `[]`. Sirve para nada todavía. La verificación se hizo contra
producción con `curl`/`Invoke-RestMethod` y con `chromium` de Playwright,
que además prueba el comportamiento en vez de los logs.

Un detalle del harness que se comió tiempo: `Invoke-RestMethod` sobre
`{"artists":[...]}` devuelve un objeto, y `.Count` sobre un PSCustomObject da
1, no el número de elementos. Parecía una API rota y era el test. Lo mismo con
`/api/dossiers`: el primer intento leyó 200 y el segundo 401, porque el deploy
se había promovido entre medias.

### Gates

`tsc` limpio · lint sin avisos · **542/542 en 39 ficheros** · build sin ejecutar
local (el prebuild borra la SQLite local; el MCP de Vercel no tiene scope para
leer el log del build). Regresión rc30 de la ficha técnica limpia en los 5
anchos contra producción, en las dos ramas.

## Pendientes que siguen abiertos

- **3 releases sin carátula real**: *Ashes to Ashes*, *Tour de France*, *The Model / Computer Love*. El single no está en iTunes y poner la carátula del álbum del que sale la pista habría repetido el fallo de Unsplash. 9 filas quedan con la foto genérica.
- **20 pistas sin audio**, con motivo: iTunes titula "Stonemilker" a secas y el seed dice "(Strings)"; *Tour de France* de 2003 (20 años después); *Heroes* de 1977 solo aparece el remaster; *Speak to Me* solo existe como Roger Waters (Redux); y 7 releases que son álbumes, no canciones. Necesitan otra fuente o upload propio.
- **`lib/artist-promotion.ts:139` usa `getDbWrite()`** en el camino de aprobación. Funciona por el `isTursoEnabled()` que lo precede, pero es el patrón que AGENTS.md ya no prohíbe: la regla corregida es *nunca decidir el backend con dos fuentes de verdad, y nunca abrir el handle local si hay cliente*. Merece su propia ola.
- **`lib/turso.ts` sigue capturando `process.env` al importar** (`getTurso()`). Convertirlo en getter es lo correcto y está recomendado, pero cambia el comportamiento de las 8 rutas del patrón a la vez, así que quedó para una ola con verificación propia. Y conviene renombrar su `isTursoConfigured()`: colisiona con el de `@/lib/db`, con semántica distinta, y esa colisión costó el diagnóstico entero de GAP-B.
- **`scripts/rc29-artist-shots.ts:277-284` está roto desde antes de RC.31**: `querySelector('a[href="/releases/{id}"]').parentElement` coge el primer enlace de ese href, que es el del título de la `EPKCard`, así que `visibleRows` cuenta 0. Arreglarlo requiere buscar el panel por clase.
- **El catálogo de la vista de invitado del dashboard sigue siendo global**: sin `artist_id` no hay forma de acotarlo, así que el copy lo dice ("los N lanzamientos aprobados de PressPlay") en vez de prometer un catálogo de artista.
- `WEBHOOK_SECRET`: lo define el usuario.
- Resend: falta `FROM_EMAIL` y hay cuota agotada.
- `syncLocalToTurso` omite `track_number` y otras columnas.


---

## RC.32: contrato de edicion, audio, aprobaciones y catalogo real

**Fecha:** 2026-10-01
**Modelo:** `opencode/space-bunny-free` (orquestacion), subagentes por ownership disjunto
**Modo:** Build + auditoria

El encargo no era una lista de features: era "revisar esto y arreglar lo que
este roto". Eso cambio el resultado. De los siete problemas de la lista, cuatro
resultaron ser bugs de datos o de contrato, no features ausentes.

### Como se decidio querometer

El plan externo de MiMo proponia 12 tareas. Se auditaron una a una contra el
codigo y **cinco no tenian soporte en el repo**:

| Propuesta | Veredicto |
|-----------|-----------|
| B-8 quitar "Enviar musica" y enlazar al catalogo | **Adoptada**. Era un no-op: el dashboard se obtenia de la API, no de los props del server component |
| B-5 labels de boton dinamicos por estado | **Adoptada**, pero el boton de nuevo release no cambia: la ruta es la misma |
| B-EXTRA-1 quitar `extractYouTubeId` | **Adoptada**. Estaba *declarado dos veces*; la segunda definicion ganaba y ESLint no lo senalaba |
| T-12 aviso de segmento > 30 s | **Adoptada**, con matiz: los offsets de capitulo no son duracion de preview |
| B-4 buscar `user_id = NULL` | **Descartada**. Era una busqueda, no un bug. La mayoria son artistas que nunca se registraron |
| T-6 `POST /api/releases` abierto a subscriber | **Descartada**. El portal `/submissions` ya cubre ese caso sin quitar moderacion |
| T-11 MCP de YouTube | **Descartada**. Es un servidor de terceros que devuelve el canalbuscador como si fuera el oficial. No se anade |
| T-8 playbook de subagentes | **Adoptada como el metodo de este trabajo**, no como fichero |

### El fallo de test que era un bug de produccion

`tracks-public-shape.test.ts` empezo a fallar con la Ola 3: 3 filas esperadas,
31 devueltas. No era flakiness —fallaba tambien en aislado.

La causa no estaba en el test. `getAllTracks()` era `SELECT * FROM tracks`
**sin `ORDER BY`**, y encima pagina (`?page`/`?limit`, 50 por defecto). SQLite
no garantiza orden sin `ORDER BY`, asi que la pagina 2 podia repetir filas de la
1 o saltarlas, y una fila recien creada caia fuera del corte.

Anadido `ORDER BY created_at DESC, id DESC` en las dos ramas. En produccion
verificado: pagina 1 repetida es identica, cero solape entre paginas, y el
orden es de mas reciente a mas antiguo.

Lo que hacia el fallo visible era el estado de la SQLite local: 565 artistas,
207 usuarios y 55 filas `sweep-track-*` acumulados de pruebas. Cuanto mas
crece el fichero, mas lejos cae la fila nueva del primer corte, y el test pasa
por casualidad. Turso estaba limpio (83/12/8). **Un fixture contaminado produce
tests que mienten.**

### Que se rompio al arreglar la edicion de releases

Cinco bugs, y uno de ellos solo aparecio al arreglar el anterior:

1. El editor reenviaba `status` en el body. Un no-admin podia auto-aprobarse
   poniendolo a `approved`, y el backend lo aceptaba. Ahora el estado de
   decision **se ignora siempre** en la rama no-admin.
2. El GET exigia sesion antes que rol, y el rol antes que propiedad. Tres
   redirects por un owner legitimo: 403. Ahora el brazo privilegiado comprueba
   sesion + rol/propiedad y **solo despues** cae al publico.
3. El `PUT` reescribia la fila con los defaults del formulario. `admin_notes` no
   estaba en el cuerpo, asi que cada guardado borraba el motivo de rechazo.
4. **Las hijas no se persistian al anadir una nueva al editar.** El formulario
   las anadia a un array en memoria y el backend, que resolvia el mismo
   `release_id` para todas, no conocia las nuevas. Se perdian en silencio.
5. Al arreglar 4 con una reconciliacion transaccional, aparecio 6: `duration` del
   padre se quedaba en el valor guardado en BD mientras las hijas cambiaban, asi
   que la ficha tecnica mostraba duraciones que no cuadraban con el tracklist.

`admin_notes` ahora no se toca: vive en la BD, no en el formulario. Publicarlo
por GET habria sido el arreglo comodo y el equivocado.

### Audio: dos espacios de coordenadas

`start_time` y `end_time` significan cosas distintas segun el estado de la
pista. En un **preview** son milisegundos dentro del preview. En un capitulo de
album son offsets dentro del **video**. El reproductor arrastraba los dos a un
solo par, con lo que un preview de 30 s heredaba el final de capitulo del album:
el scrubber saltaba de pista a mitad y el `max` era incorrecto.

- `resolvePlaybackTimeline()` normaliza cada caso. El fallback es buscar
  `start_time` por `album_id` en la tabla de capitulos.
- La duracion de un padre es la suma de las hijas, con `sumDurations()`. Los
  `duration` en BD son texto (`"M:SS"`, `"H:MM:SS"`), y el parser tenia un
  `destruir solo [m, s]` que hacia que `"1:02:03"` sumara 62 s.
- El visualizador se niega a engancharse a un medio no CORS-safe.
  `createMediaElementSource` **sustituye** la salida nativa del `<audio>`: sin
  CORS se pierde el audio, no solo las barras. Perder barras es degradable.
- La banda de graves se duplicaba por la transformada de la senal; se corrigio
  la deduplicacion y se paso de media a maximo por banda.

### YouTube: 0 de 5 canales, y ese era el resultado

Regla del usuario: solo canal oficial verificado. La verificacion exige que la
descripcion del canal enlace al sitio oficial del artista, con el nombre
coincidente.

Los 5 handles existen y los 5 nombres coinciden. **Ninguna descripcion enlaza al
sitio oficial**: Radiohead viene vacia (0 caracteres), Bjork dice solo "This is
the official Bjork channel on YouTube", y Pink Floyd, David Bowie y Kraftwerk
traen prosa sin un dominio. Motivo `sin-dominio-oficial` en los 5. Se
escribieron **0 videos y 0 canales**, que es lo correcto: la regla existe para
eso, y llenarla habria reproducido exactamente el problema que se queria evitar.

Anadido `part=status` a la ruta. Sin el no hay forma de leer `embeddable` ni
`privacyStatus`, y el proyecto embede en un iframe 1x1 con `opacity:0`. Las
Developer Policies exigen comprobar Made For Kids en cada video embebido y no
habia ni una coincidencia de ese flag en el repo. Verificado en produccion:
`madeForKids: False`, `embeddable: True`.

La evidencia que `channels.list` no da **no se inventa con `search`**: esta
topado a 100 llamadas/dia y sus candidatos no son verificables.

### Un borrado de canal verificado que estaba a punto de existir

`artists.youtube_channel_id` se anadio a `CREATE TABLE`, al `ALTER` de
migraciones y a `syncArtistsToTurso`. Ahi `INSERT OR REPLACE` borra la fila y
reinserta, asi que anadir la columna al `INSERT` con `?? null` habria hecho que
**cada sync borrase el canal verificado de todos los artistas**. Preservada de
forma explicita.

### Aprobaciones: la cascada y el fallo que se escondia

- Aprobar un release **cascadea a sus hijas** en la misma transaccion. Sin eso,
  un padre aprobado dejaba hijas en `draft` y el contador del dashboard no
  cuadraba con las tarjetas.
- `getArtistCatalog` reconocia hijas de padres aprobados, asi que el catalogo
  del artista ya no sale vacio con releases multipista.
- **5 filas de timestamps de album se corrigieron en Turso.** Tenian minutos
  de desviacion sembrados. `fix-seed-data.ts` corrige el origen y
  `turso-check.ts` verifica que no vuelvan: `db_seed_timeline_desalineada: 0` y
  `db_seed_padres_duracion_vs_recorrido: 0`.
- El fallo de promocion ya no se tragaba: antes un error de red en
  `artist-promotion.ts` devolvia 200 y el usuario se quedaba en `subscriber`
  sin saber por que. Ahora se reporta y hay reintento.

### `artist-promotion.ts`: la deuda que el propio AGENTS.md senalaba

`lib/artist-promotion.ts:139` usaba `getDbWrite()`, el patron que la regla de
AGENTS.md prohibia. Corregido al criterio de una sola fuente de verdad:
`getTursoClientSync() !== null`, y handle local solo en la rama sin cliente.
Ademas, la llamada a `createProfile` no existia, con un default que hacia que el
metodo lanzara siempre. Verificado en Turso: los 7 artistas tienen perfil y el
admin no, que es lo correcto.

La promocion **via show** sigue siendo estructuralmente imposible:
`userHasApprovedContent` exige un perfil de artista previo, asi que un
suscriptor que solo envia shows nunca se promueve. Es una asimetria de diseno,
no un bug, y queda documentada.

### `/api/sync` deshabilitado en vez de arreglado a medias

Era un `INSERT OR REPLACE` que omitia 7 columnas, incluida `admin_notes`, y su
mapeo **no includia `status`**. Ejecutarlo revertia el catalogo aprobado entero
a `draft`. Se deshabilito con `410` antes de la autenticacion.

Un 410 en un endpoint de sync **rompe la portabilidad local a Turso**, que es el
motivo por el que existe. Queda como pendiente construir el sustituto seguro;
prefers eso a un endpoint que ya estaba arreglado y borre el trabajo del admin.

### `lib/turso.ts`: el diagnostico que costaba tres despliegues

Dos funciones llamadas `isTursoConfigured` discrepaban: la de `lib/turso.ts`
leia un snapshot de `process.env` capturado **al importar**, y la de `lib/db.ts`
leia el env **en tiempo de llamada**. Con el env cargando tarde —lo normal en un
bundle de Vercel— la primera decia "hay Turso" y la segunda devolvia `null`, se
lanzaba y la ruta respondia 500. Convertidas las dos en getters y eliminada la
colision de nombres.

### Catalogo: 9 caratulas de Unsplash fuera

9 filas tenian la foto generica. Menudo al ser revisadas a ojo: eran
*Holger Bonse* con un hombre, *Greatest Hits* con un hombre mayor, *Brothers in
Arms* con un hombre mayor. Ese es el fallo de usar Unsplash como relleno: genera
retratos creibles de bandas que no tienen nada que ver.

Aplicadas 9 caratulas reales de **Cover Art Archive** para los 3 releases y 6
hijas, con revision visual antes de escribir. `seed_portadas_unsplash: 0`.

**Deezer se descarto a proposito.** `cdnt-preview.dzcdn.net` devuelve
`Access-Control-Allow-Origin: *`, asi que no hace falta proxy, pero la URL va
firmada por Akamai y **caduca a los 900 s**: persistirla es escribir una URL
muerta. Se comprobo empíricamente que una guardada y consultada a la hora ya
devolvia 403. 0 previews de Deezer escritos.

### La suite necesita `--no-file-parallelism`

`npx vitest run` en paralelo muere con `ERR_IPC_CHANNEL_CLOSED` y una asertacion
nativa `node::RemoveEnvironmentCleanupHook` `(env) != nullptr`. **No es un test
rojo: los 800 pasan.** Aislado a `tests/unit/official-videos.test.ts`, que carga
un modulo nativo (`better-sqlite3` via `@/libsql/client`) a traves de un route
handler; el hook de limpieza nativo se ejecuta con el isolate ya destruido.

Verificado por exclusion: sin ese unico fichero, 768/768 en paralelo y cero
crash. Bajar concurrencia a 2 workers **no** lo evita. Secuencial: 800/800 en
~42 s. Documentado en AGENTS.md con el hallazgo, porque el comando de gates del
repo tiene que seguir siendo el que de verdad verifica.

### Diagostico de MiMo: no era `opencode.db`

El bucle de Compactacion (99% -> 1% -> 99%...) se atribuyo a la base de datos de
opencode. Es falso: `.opencode/` **no** esta en `.gitignore` a proposito, porque
contiene los skills y subagentes. Con base vacia, el bucle se reproduce igual.

La causa real es el **`small_model` de mimo (200K) alimentando un `big_model` de
1M**: el router recalcula el porcentaje sobre el modelo grande con un contexto
que en realidad lo produjo el pequeño. Al 99% de 1M solo faltan 20 000 tokens,
as que un `tail_turns` pequeno produce un resumen enorme que vuelve a disparar
la Compactacion. `compaction.auto=false` es **global y peligroso**, asi que no
se toco; la solucion fue acotar los prompts, reiniciar subagentes y usar
`space-bunny-free` para el codigo.

### README: cinco afirmaciones que eran falsas

- "110 tests" -> **800 en 47 ficheros**
- "10 tablas" incluyendo `releases` y `subscribers` -> las reales. **No hay tabla
  `releases`**: un release es una fila de `tracks` con `release_id IS NULL`
- "submissions" -> la cola vive en `track_submissions`, que no estaba en la lista
- "5 rutas protegidas (dashboard, profile, account, releases/new, admin)" -> 8
  en el matcher, con `requireRole`, y **`/dashboard` no esta** (se protege por
  rama propia)
- "Access Control 5/5 rutas -> 307 redirect" -> ahora hay comprobacion de rol

Anadidas las secciones que faltaban: cuentas suspendidas, los tres roles y la
promocion, multimedia y cola, descargas de prensa, modelo multi-pista y la regla
dual-mode. Corregida la sintaxis POSIX de `NODE_OPTIONS` (este repo es
PowerShell) y el historial de releases, que se detenia en rc.12.

### La credencial

`README.md:167` versionaba `test-artist@example.invalid / <CONTRASENA_ROTADA>`. Sustituida por
instrucciones. **Borrarla no basta: el secreto sigue en 24 commits del
historial** (verificado con `git log -S`), asi que hace falta rotar la
contrasena en la app *y* rehacer el historial con `git filter-repo`.

### Gates

`tsc` limpio · lint sin avisos · **800/800 en 47 ficheros** (secuencial) · Turso
`tracks:83 artists:12 users:8 shows:2 qa_*:0 huerfanos:0 unsplash:0
timeline_desalineada:0`.

Produccion: `/api/sync` 410 · `/api/tracks` 200 con paginacion determinista y sin
solape · `/api/youtube` 200 con `madeForKids` y `embeddable` · catalogo de
`OK Computer` montando cola de 12 pistas · scrubber 0-30 · glifos prev/next
correctos.

Commits: `ff5baea` (Ola 1), `8a45edd` (Ola 2), `4109794` (Ola 3 + README).

## Pendientes que siguen abiertos

- **0 de 5 canales oficiales verificados.** Ninguna descripcion enlaza al sitio
  oficial del artista. Hacen falta 5 descripciones reales de los canales, o la
  lista de sitios oficiales de los 5 artistas, y entonces la evidencia existe.
- **8 pistas sin audio y 3 releases sin caratula real.** Los motivos concretos
  estan en `scripts/fetch-official-videos.ts` y en el informe de Covers. Dicen
  "el single no esta en iTunes" y "Deezer no lo tiene", que son hechos
  verificados, no pereza: falta otra fuente o upload propio.
- **`/api/sync` deshabilitado (410).** La portabilidad local a Turso sigue sin
  sustituto. El que existia era destructivo.
- **Promocion via show imposible** por diseno: `userHasApprovedContent` exige un
  perfil de artista previo. Requiere una decision de producto.
- **`POST /api/export` PDF**: la fuente esta incrustada y la build de Vercel pasa,
  pero falta verificar que el texto del PDF sea legible y no solo que el endpoint
  devuelva 200.
- **Catalogo global en la vista de invitado del dashboard.** Sin `artist_id` no
  hay forma de acotarlo, asi que el copy lo declara en vez de prometer un
  catalogo de artista.
- **`vitest` en paralelo no es viable** con un route handler que carga modulo
  nativo en el worker. Es deuda de infraestructura de test.
- **Vercel MCP sin scope**: `opencode mcp list` dice `connected` y las tools
  devuelven cero proyectos. La OAuth se autorizo sin seleccionar equipo.
- `WEBHOOK_SECRET`: lo define el usuario. Resend: falta `FROM_EMAIL` y hay cuota
  agotada.
- `scripts/rc29-artist-shots.ts:277-284` roto desde antes de RC.31.

---

## RC.33: catalogo real, credenciales fuera del codigo, buzon y una pagina por release

Cierra las diez olas de RC.33 y las cuatro subfases de la Fase P. Commit final
`cebc700`. **1146/1146 tests** en 61 ficheros, tsc y lint limpios.

### Las diez olas

| Ola | Commit | Que resolvio |
|---|---|---|
| 0 | `11bd7a2` | `PATCH /api/tracks/[id]` no comprobaba ownership: cualquiera autenticado reescribia la pista de otro. |
| 1+2 | `8b03954` | Un solo play de cola en `EPKCard`; fuera el aviso de "sin audio" para el álbum; badge Multipista y accion de envio. |
| 3 | `9c370b8` | `Metrics \| null`: sin dato es `—`, nunca `0`. Cadena de fuentes. |
| 5 | `e2374aa` | Estados dinamicos de shows tambien en el dashboard. |
| 3bis | `2cc77fa` | Last.fm real como fallback; un album hereda playcounts de sus hijas. |
| 4 | `98312d7` | `video_kind` y canales `- Topic`; `live` frente a `videoclip`. |
| 6 | `d52451c` | Tarjetas de artista con nombre y foto; invitado ve solo el catalogo. |
| 7 | `d90ca44` | Carrusel responsive 1/2/3/4, sustituida la rejilla global. |
| 8 | `c8b4ca9` | Candidatos de Wikimedia, sin aplicar. |
| 9 | `40327a2` | Datos: 29 de 74 videos, 5 canales, `video_kind` migrada, 3 banners. |
| 10 | `cebc700` | Una pagina por release. |

### Los cinco hallazgos que costaron tiempo

**1. El dominio oficial no basta para YouTube.** El patron `UC...` sobre la
descripcion del canal no dio **ni uno de los 5**: las descripciones estan en
espanol o vacias. Lo que funciono fue la allowlist explicita
(`lib/official-channels.ts`). Con `--trust-allowlist` se escribieron 29 IDs
exactos; **las 14 coincidencias aproximadas se quedaron sin escribir** a proposito.

**2. `FROM_EMAIL` no es lo que bloqueaba el correo, es el dominio.** Sin dominio
verificado, Resend si envia, pero solo desde `onboarding@resend.dev` y **solo al
titular**: a cualquier otra direccion, 403 garantizado. Esocersiono las tres
estados en vez de dos.

**3. `/track/[id]` y `/releases/[id]` eran la misma pagina con dos plantillas.** Un
single es fila de `tracks` **y** cabecera con el mismo id. Dos URLs para un
contenido: SEO partido, metricas partidas, y 535 lineas de ficha sin nada que la
enlace. Ahora `/track/[id]` es un shim de 301 y solo queda una pagina.

**4. La duracion de un single salia en 0, no "en blanco".** Se calculaba como
`sumDurations(TracksByReleaseId(...))` sobre las hijas: cero hijas, cero
segundos. Y el filtro de "no hay dato" **no puede ser un `isNaN`**, porque
`sumDurations(["00:00"])` parsea bien y devuelve `{seconds: 0}`: `"00:00"` es el
relleno del seed, no un disco de cero segundos.

**5. "Reproducir" Once veces no informa a nadie.** `ReleaseTrackList.tsx` tenia el
mismo `aria-label` en todas las filas, botones de 32 px (por debajo del minimo
tactil de 36 px) y sin anillo de foco. Ahora: 44 px, anillo, y etiqueta con numero
y titulo.

### P1 — la credencial era de 41 ficheros

`test-artist@example.invalid` y su contrasena estaban en 16 scripts, 12 specs de Playwright
y helpers. La regla que lo resuelve es mas fina de lo que parece:

> **Contrasena sin default, correo con default solo si no es PII ni secreto.**

Contrasenas a `""`. `TEST_ADMIN_EMAIL` conserva `admin@epk.local` (dominio
inventado, no existe, no autentica nada). `TEST_ARTIST_EMAIL` **tampoco**: la
unica cuenta de artista conocida es de una persona real, y el correo **es PII**.

Si el helper hubiera sido `process.env.TEST_ARTIST_PASSWORD ?? "12345678"`,
funcionaria y dejaria el secreto en el repo. Es un cambio cosmetico con forma de
arreglo.

Tambien: `playwright.config.ts` no cargaba `.env.local`, porque **Playwright no
hereda la carga de Next**. Sin eso los 12 specs leian `undefined`.

Y un bug que casi se introduce: al migrar `verify-wave2.cjs:178` al helper, la
credencial hardcodeada era la de **artista** y se cambio a la de admin siguiendo
el patron. El admin no tiene perfil de artista. Un refactorizacion mecanica de
credenciales es justo donde un cambio de cuenta rompe un test en silencio.

### Verificacion: los tests tienen que ponerse rojos

Cinco reversiones, cinco rojos. La tabla esta en el commit de P2. Lo que mas
importa: los tests de `resolveTrackRoute` leen el **SQLite local de verdad**, no un
doble, asi que prueban que `parseTrack` expone `release_id`. Si manana esa columna
deja de mapearse, el redirect se apaga en silencio y los tests lo detectan solos.

Igual en P4: quitar `honeypotTriggered` -> 2 rojos; quitar el `if (recent) return
accepted()` -> 2 rojos. **Un check que siempre pasa no protege de nada.**

### Un fallo de la propia orquestacion

El commit de P4 dejo `app/api/suggestions/[id]/route.ts` **sin trackear**, y con
ella el PATCH que el propio panel necesita. Salio verde con la mitad de la API sin
publicar. Se cerro con un commit aparte y explicito, porque es una correccion del
commit anterior y no funcionalidad nueva: si no, se habria mezclado.

Y: dos "fallos" que no lo eran. `Test-Path` fallo con `app\api\suggestions\[id\]`
porque los corchetes son wildcards en PowerShell — el fichero existia de verdad. Y
un caracter de reemplazo (U+FFFD) en un Select-String era la consola, no el fichero: no hay U+FFFD en el
disco. Se comprobo antes de "arreglar" nada.

### Estado de produccion

83 tracks, 12 artistas, 2 shows. 29 videos con `video_kind`, 5 canales oficiales,
3 banners (Pink Floyd, Radiohead, Kraftwerk). 65 portadas iTunes, cero Unsplash,
cero huerfanas, cero datos de QA. Duraciones padre 9/9, timeline sin deriva.

**Bowie y Bjork sin avatar ni banner**: su composicion no funciona en circulo ni
en wide. La inicial con degradado es mejor que un recorte malo, y el usuario lo
confirmo mirando la pagina.

---

## C1 - el diseño de la página de release vuelve al acordado

**Petición del usuario (2026-10-03, repetida al abrir la sesión del 2026-10-04):**
el diseño acordado era el anterior, no el de P2. El nuevo ponía la descripción,
la letra y los enlaces por debajo de un hero con degradado y una caja de pistas,
y los demás datos quedaban a un pliegue de distancia.

### Lo que vuelve

`app/releases/[id]/page.tsx` (464 -> 431) y
`components/ReleaseTracklistSection.tsx` (524 -> 130) vuelven a `cebc700~1`:
cabecera sobria con la portada a un lado y la ficha al otro, y las **cuatro**
secciones en planas y a la vista — Descripción, Pistas, Enlaces, Letra. La lista
de pistas vuelve a ser `ReleaseTrackList`, sin la caja con encabezado propio.

### Lo que NO vuelve, porque no es diseño

Un revert de maquetación es el sitio donde se pierden arreglos sin que nadie lo
note. Estos se conservan, y cada uno tiene su test:

| Arreglo | Por qué no es diseño |
|---|---|
| `getReleaseWithTracks` en vez de `getTrackById` | es la misma lectura más la FORMA del lanzamiento, y es lo que da `metrics` en una sola fuente (RC.33) |
| `ownDurationLabel` | un single sin hijas de 3:45 real ya no cae al `"00:00"` del seed |
| `trackCount` | un single suelto tiene **una** pista, no cero |
| sección de pistas con `[release]` | un single conserva su control de play (bug nº 1 de P2) |
| `getReleaseNeighbours` | anterior/siguiente **sobre lanzamientos**, el arreglo que más se resistió en P2 |
| `NO_VALUE` en métricas | `—` en vez de `0`: `0` afirma que nadie escuchó |

### El test que pedía el handoff

Bloque 6 de `tests/unit/release-page.test.ts`: las cuatro secciones, **en su
orden**, con su `aria-labelledby`, y sin inventar la que no tiene dato. El test
mira los `<h2>`, no el `textContent` de la página: `Descripción` es subcadena de
`Descripción del álbum`, y un `includes` sobre el texto completo daría verde con
la sección equivocada.

**Mutado tres veces para comprobar que puede fallar** (RC.32 gastó una release
entera por no hacerlo):

| Mutación | Rojos |
|---|---|
| quitar la sección de letra | 3 |
| quitar el filtro del relleno `"00:00"` de `ReleaseTrackList` | 2 |
| condicionar la sección de pistas a `isMultiTrack` | 5 |

### Lo que sí se trasplantó del diseño nuevo

Los arreglos de a11y de `ReleaseTrackList.tsx` (fichero que **no** se revierte):
botones de 44 px, anillo de foco y `aria-label` con número y título. Y dos cosas
que ese componente tenía pendientes y que el revert dejaba al descubierto:

- `aria-hidden` en los cuatro iconos de las filas.
- El **filtro del relleno `"00:00"`** en la columna de duración. Sin él la fila
  pintaba `"00:00"` mientras la cabecera decía `—`: dos números distintos para
  la misma canción en la misma pantalla. El filtro vive en
  `releaseRowDurationLabel`, no reimplementado.

### Tres hallazgos que el revert destapó

**1. `/track/[id]` es un 301 para TODA fila, así que su ficha está
inaccessible.** `resolveTrackRoute` devuelve `release` tanto si la fila es hija
como si es cabecera de su propio release. La ficha de 597 líneas —videoclip,
galería de prensa, detalles de producción, bio, descarga de catálogo para prensa,
Last.fm— **solo se renderiza para las huérfanas**. El diseño de P2 ya no
mostraba nada de eso, así que **no es una pérdida de este revert**: ya estaba
perdida desde P8. No se toca aquí (P8 es territorio del 301, y el handoff lo
marca como intocable), pero queda escrito porque es el mismo síntoma que motivó
la petición del usuario: "el nuevo hace los demás datos inaccesibles".

**2. Las métricas de los álbumes son un 0 curado, y se pintan como 0.** En Turso,
las 5 cabeceras de álbum tienen `{"streams":0,"saves":0,...}` en la columna
`metrics`. `parseMetrics` devuelve `null` en ese caso, así que el objeto existe:
es un cero escrito a propósito, y `lib/metrics-source.ts` lo trata como dato
(hay un test que lo fija). Resultado: **"0 reproducciones del lanzamiento"** en
Kid A, OK Computer, The Wall, The Dark Side of the Moon y Vulnicura Strings.

No es un bug de esta página: `EPKCard` usa el mismo `resolveAlbumMetrics` y pinta
lo mismo. **Es un bug de datos**, y arreglarlo es limpiar la columna de los
álbumes que solo tienen ceros — con dry-run y aprobación, no de paso. Apuntado,
no ejecutado.

**3. `components/ReleaseActions.tsx` tiene sus tres enlaces sin anillo de foco**
("Explorar el catálogo", "Ver fechas"). Preexistente en los dos diseños, así que
no es una violación *nueva*; no se mezcla en un commit de revert. Candidato a su
propia ola.

### Gates

tsc limpio, lint sin avisos, **1153/1153 en 61 ficheros**, build correcto.

Visual en local a 375/768/1440, claro y oscuro: 0 targets táctiles <36 px dentro
de `main`, 0 botones con etiqueta genérica, 0 iconos sin `aria-hidden`, 0 enlaces
a `/track/`, 12 botones de play en el álbum de 12 pistas y 1 en los singles.

Producción verificada tras el push (despliegue automático): 200 en las tres
rutas, `section[data-testid="release-play-section"]` presente y `div` ausente (la
marca del diseño nuevo), `blur-3xl` y el gradiente del hero a 0, y las mismas
cifras de a11y. **Ningún spec E2E navega a `/releases/[id]`** (los 12 usan
endpoints de API y `/releases/new`), así que la corrida completa de E2E no
aporta nada para este cambio.

---

## C1-bis · la ficha de una pista vuelve a la página de release

**Cierra el hallazgo 1 de C1**, que era el que el usuario eligió primero.

### Lo que estaba perdido, medido en Turso

`resolveTrackRoute` devuelve `release` para **toda** fila: si es hija va al
release de su padre, y si es cabecera va a su propio release. La ficha de
`/track/[id]` —597 líneas— solo se renderiza para las huérfanas, y el diseño de
P2 no mostraba nada de eso. O sea: los bloques **no tenían ninguna página donde
estar**. Y no era solo el vacio:

| Dato | Dónde está | En singles |
|---|---|---|
| Videoclip oficial | `youtube_video_id` / `video_embed_url` | 9 de 9 |
| Ficha de producción | `production_details` | 8 de 9 |
| Enlaces a plataformas | `spotify_url`, `itunes_track_id`, `youtube_video_id` | 7 de 9 **sin sección** |
| Descarga de dossier y rider | `CatalogDownloadButton` con `artist_id` | **0 con página** |
| Galería de prensa | `gallery_images` | 0 de 83 filas (no hay datos) |

Lo del dossier es lo más grave: `dossier` y `rider` exigen `artist_id` en
servidor (`lib/export-bundle.ts` responde 400 sin él) y la **única** página que
lo montaba con alcance de artista era el 301. Es decir que desde una ficha de
lanzamiento no había forma de bajar nada, en un producto que es un EPK.

### Lo que se hizo

Todo lo que es de **pista** se monta solo cuando la fila **es** una pista
(`!isMultiTrack`, que es la única señal que hay: en el esquema no se puede
distinguir un single de un álbum por otra cosa):

| Bloque | Condición |
|---|---|
| Videoclip Oficial | hay `youtube_video_id` o `video_embed_url` |
| Ficha de Producción | `hasProductionDetails(...)` |
| Galería de prensa | `gallery_images` con elementos |
| **Ficha técnica para prensa** | **siempre**, y en los dos casos |

El cuarto es **del artista**, no de la pista, y por eso se monta también en un
álbum: es la mitad del motivo por el que existe un EPK.

Que un álbum no monte los tres primeros es la decisión que ya estaba escrita en
`/track/[id]` (su rama `isRelease`, que sigue intacta para las huérfanas): un
disco no tiene un videoclip oficial propio ni una única afinación, y enseñárselas
al visitante sería afirmar algo que no es cierto. Kid A tiene `youtube_video_id`
en su cabecera, y con la regla de "si tiene dato, se muestra" se le habría
atribuido un videoclip al álbum entero.

### Los enlaces: la unión que faltaba

La condición era `Object.keys(external_links).length > 0`. Para 7 de los 9
singles esa columna está **vacía**: su Spotify está en `spotify_url`, su Apple en
`itunes_track_id` y su vídeo en `youtube_video_id`. La sección entera no se
montaba, con el single lleno de enlaces en la base de datos.

`buildReleaseLinks()` hace ahora la unión, con tres reglas que las tres importan:

1. **Primero `external_links`, después la columna de la fila.** La que escribe una
   persona gana sobre la que rellena un proceso.
2. **`""` y `"—"` son ausencia.** `lib/db.ts` pasa las columnas por `safeString`,
   que convierte `""` en el string **truthy** `"—"`. Un `!= null` pintaba un botón
   que llevaba a una página que no existe.
3. **Un enlace por plataforma.** Con un `??` por plataforma sale solo.

Deezer y Bandcamp, que no se leían, también salen. Hay test de las tres.

### Una sola fuente para "¿hay ficha?"

`hasProductionDetails()` estaba copiada en `app/track/[id]/page.tsx`. Pasa a
`lib/production-fields.ts`, junto a la especificación de los campos, y las dos
vistas la importan. El detalle que hace que sirva: un objeto con **todos** los
campos a `null` —lo que escribe el seed en las cabeceras de álbum— **no** cuenta.
Sin ese filtro salía "Sin datos de producción" debajo del título, que es la
tarjeta vacía que el propio proyecto ya describe en su propio código.

### Dos violaciones de área táctil que introduce el commit

Montar estos bloques trajo 10 controles por debajo de 36 px: los nueve botones
HTML/JSON/PDF de la rejilla de descargas (28 px) y el desplegable de la ficha
(32 px). Corregidos con `min-h-[36px]`, lo que **también** arregla `/dashboard` y
`/artists/[id]`, que montan los mismos componentes. Y de paso, `aria-label` en los
dos botones de icono de `ProductionDetails`, que solo tenían `title`.

Un test **verde** no significa "sin violaciones nuevas": la primera versión de
esta ola pasó los 1162 con 10 controles de área táctil en pantalla. Los cuenta un
`getBoundingClientRect` en el navegador, no un aserto.

### Un aviso que hay que volver a decir

**`tests/unit/release-page.test.ts` tiene que mockear `@/lib/db` entero**, no solo
`@/lib/releases`. La página ahora importa `getArtistByName` de `lib/db`, y eso
carga **`better-sqlite3`**: un módulo nativo. Al descargar el worker, el hook de
limpieza nativo se ejecuta con el isolate ya destruido y el run muere con la
aserción `node::RemoveEnvironmentCleanupHook (env) != nullptr` y
`ERR_IPC_CHANNEL_CLOSED` que documenta AGENTS.md. No es un test rojo: es el
**proceso** muriendo, y por eso no sale un "3 failed" sino una traza nativa.

El mock va en el fichero porque la página es una ruta que llega a la base de
datos, que es exactamente el escenario que dispara el fallo.

### Gates

tsc limpio, lint sin avisos, **1162/1162 en 61 ficheros**, build correcto.
Visual local a 375/1440 y producción a 375/1440: el single con la ficha entera,
el álbum sin los bloques de pista pero con las descargas, 0 targets táctiles
<36 px dentro de `main`, 0 errores de página.

**Mutado tres veces**: quitar el bloque de vídeo → 1 rojo; dejar de respetar
`isTrackRow` → 2; `hasProductionDetails` que siempre dice que sí → 1.

### Lo que sigue abierto: las 65 hijas

Las **hijas de álbum** son el agujero que queda, y es mayor que el que se cerró:

| Dato de las 65 hijas | Con dato |
|---|---|
| Ficha de producción | **65** |
| Videoclip oficial | 28 |
| Letra | 0 |
| Galería | 0 |

Redirigen a su padre, y el padre no enseña sus datos. Es un problema de **diseño
distinto**: dónde metes una hoja de créditos por pista sin ensuciar el tracklist
que el usuario acaba de aprobar. No se ha decidido, y no se decide aquí.

---

## C1-ter · Un `- Topic` no es el videoclip de la pista

### ⚠️ La cifra de arriba era falsa, y hay que decirlo primero

La tabla anterior dice "Ficha de producción | **65**". **Es mentira, y era un
error de filtro mío.** Conté con

```sql
production_details NOT IN ('', '{}')
```

que es cierto para las 65 —el JSON **existe**— pero no dice que tenga nada
dentro. La columna real es `{"daw":null,"guitars":null,"effects_chain":null,
"tuning":null,"key":null}`: **65 de 65 con todos los campos a `null`**. Comprobado
campo a campo con `json_extract`: `daw` 0, `guitars` 0, `effects_chain` 0,
`tuning` 0, `key` 0, `genre` 0, `bpm` 0, `mood` 0, `production_credits` 0.

**No hay ninguna ficha técnica que enseñar en las hijas.** La hoja de créditos por
pista que se iba a diseñar no tenía detrás ningún dato: era diseño para un
conjunto vacío. Un filtro `NOT IN ('', '{}')` contesta "¿la columna está
rellena?", y la pregunta era "¿la columna tiene información?".

Lo único que las hijas tienen de más es vídeo: **28 con `youtube_video_id`**.

### Y el dato que sí importa: ninguno de esos 28 es un videoclip

`tracks.video_kind` (RC.33, Ola 4) tiene tres valores, y solo uno es "el vídeo que
la ficha quiere mostrar":

| `video_kind` | Qué es | En el catálogo |
|---|---|---|
| `videoclip` | canal humano verificado del artista | **0** |
| `live` | grabación en directo: no es la pista del lanzamiento | 11 hijas |
| `topic_audio` | canal `- Topic` autogenerado: el audio del tema, imagen fija, sin comentarios | 17 hijas + 1 cabecera |
| `null` | no se sabe el canal | 9 cabeceras (todas singles) |

Y el dato más incómodo de todos: **`video_kind` no lo leía nadie**. Un
`grep video_kind app components` sale vacío. La columna se escribió, se migró, se
documentó con su tabla de tres valores… y ninguna regla de render la consultaba.
O sea que nada impedía que un `- Topic` de Pink Floyd apareciera como "Videoclip
Oficial" del álbum. Hoy, con un `- Topic` de *The Dark Side of the Moon* como
"Videoclip Oficial", funcionaría.

**Por qué los 28 son `topic_audio` y no `videoclip`**, y está escrito en el propio
script (`scripts/fetch-official-videos.ts:613-640`): `verifyOfficialChannel` exige
que la descripción del canal enlace el dominio oficial del artista, y **ninguno de
los 5 canales verificados lo hace hoy** —Pink Floyd tiene 991 caracteres de
bio sin un enlace, Radiohead tiene la descripción vacía—. "Ningún vídeo" no es un
resultado, así que existe `--trust-allowlist`, que baja **solo** esa tercera
comprobación y solo si el id es el de la allowlist, el título es exactamente el
nombre del artista y el canal no es de tipo `topic`. Ese flag es el camino, y
**gasta cuota de la API de YouTube**: es una decisión del usuario, no una tarea
silenciosa.

### Lo que se hizo: la regla, no los datos

1. **`showableVideo()` en `lib/release-page.ts`.** Una sola fuente para las dos
   ramas —la del single y la del álbum—, porque dos copias divergirían en
   silencio (que es lo que pasó con `hasProductionDetails`). Devuelve `null` para
   `live` y `topic_audio`; acepta `videoclip` y `null`.
2. **`null` se acepta, y el porqué está escrito.** Los dos únicos que escriben
   `youtube_video_id` sin `video_kind` son la allowlist versionada y el seed
   curado a mano ("canciones reales verificadas", `scripts/seed-f9-catalog.ts`),
   que escribieron antes de que la columna existiera. El script automatizado
   **siempre** escribe las dos columnas, así que un `null` con id es una afirmación
   de una persona. Si `null` se excluyera, los 9 singles perderían su vídeo y el
   arreglo de C1-bis sería inútil: hay un test que lo fija.
3. **`components/ReleaseVideoList.tsx`**, un **Server Component**: N tarjetas y
   ninguna necesita estado. Nada de `<details>` —al final no hizo falta— ni de
   `ProductionDetails`, que son 277 líneas con `framer-motion` y un `useEffect`
   por instancia: 12 en una página de álbum son 12 peticiones a `/api/auth/me`.
   Un enlace y una miniatura, sin iframe: 10 iframes de YouTube son 10 cookies
   antes de que el visitante haga nada.
4. **La sección no se monta en producción, y es lo correcto.** Con 0 `videoclip`
   entre las hijas, `showableVideo` devuelve `null` para las 28 y la sección
   devuelve `null`. Está para cuando alguien curate el dato, y sobre todo para
   que la **exclusión** sea una regla con test y no un olvido.

### Un test que casi no prueba nada, y cómo se sabe

El primer test del bloque 8 ("un `- Topic` NO se enseña") pasó **antes** de que
existiera la sección, porque `ReleaseVideoList` devolvía `null` y no había nada
que mirar. Un test verde que no depende del código nuevo no protege el código
nuevo.

Lo que lo salva son los otros: el `videoclip` que **sí** tiene que montar la
sección, la miniatura, el enlace y el recuento. Y **mutado tres veces**: quitar la
exclusión de `topic_audio` → 2 rojos; excluir también `null` → 3; invertir la
condición de álbum → 2.

### Gates

tsc limpio, lint sin avisos, **1170/1170 en 61 ficheros**, build correcto.
`/releases/[id]` sigue en 1.4 kB de JS: la sección es un Server Component y no
cuesta un byte de bundle.

Sin captura de pantalla, y el motivo es el dato: **no hay ninguna fila que
dispare la sección**, así que una captura solo podría enseñar la ausencia. La
verificación son los 8 tests del bloque, que comprueban las dos ramas —con
`videoclip` y sin él— más el `alt=""` de la miniatura y el recuento honesto
("1 de las pistas tiene videoclip oficial", no "2 vídeos").

### El dry-run de `--trust-allowlist`: **no aplicar**

Era lo que faltaba para poder decidir, y la respuesta es no. Primero la sonda
barata (`--channels`, 5 unidades), luego la completa.

**La puerta funciona:** con el flag, los **5 de 5** canales pasan. Los cinco
imprimen `VERIFICADO` y la advertencia de que su descripción no enlaza el dominio
oficial, que es exactamente lo que el flag baja y lo único que baja.

**Pero el kinds que salen siguen sin ser `videoclip`:**

```
Pistas con vídeo para la ruta "showcase": 56 de 74
  por kind:
    sin kind     18
    live         21
    topic_audio  35
A escribir en tracks: 55 fila(s)
Consumo real: 86 llamadas / 86 unidades de 10 000 diarias
```

**Cero `videoclip`, igual que antes.** Los 18 "sin kind" son las pistas de los 7
artistas que **no** están en la allowlist (Queen, Nirvana, Kate Bush…), que el
script ni toca.

Y el detalle que decide el no: **21 escrituras serían `live`, y el vídeo elegido
para varias es un directo de concierto.** El más claro:

```
─ Eclipse (trk-09f2889b)
  ✓ Eclipse (Live At The Deutschlandhalle, Berlin 18 May 1972)  →  "live"
  alternativas para la misma ruta: 6
```

Un álbum de estudio con la pista "Eclipse" pasando a apuntar a un directo de 1972
en Berlín. Como `lib/audio-priority.ts` usa `youtube_video_id` para la línea de
tiempo del tracklist, **eso no es una etiqueta: es cambiar lo que el visitante
oye al recorrer el disco**. El `topic_audio` de las otras 34 es un cambio lateral
—de un vídeo `- Topic` a otro `- Topic` del mismo tema—, sin ganancia visible.

La ruta alternativa `--route=playback` (sin `live`) deja 34 escrituras, todas
`topic_audio`, y **también cero `videoclip`**. Así que no hay ruta que compense.

**Conclusión: estos cinco artistas no tienen videoclip oficial en su canal
verificado.** Lo que hay son directos y audios de `- Topic`, y el catálogo ya lo
tiene etiquetado con honestidad desde la Ola 4. La sección `ReleaseVideoList` se
queda vacía, y no es un bug: es la verdad sobre el material.

### Un contador del script que mentía

El dry-run imprimía **`Canales verificados: 0 de 5`** mientras los cinco bloques
de artista imprimían `VERIFIED`. La línea contaba `channelUpdates` —los ids **a
escribir**—, y como los 5 ya estaban correctos en `artists`, salía 0. Dos
preguntas distintas con un contador:

```
Canales verificados: 5 de 5  ·  ids a escribir en artists: 0
```

Son cinco unidades de API las que costaron descubrirlo, y un rato de duda. Es
justo el tipo de línea que hace que alguien concluya que la puerta está cerrada
cuando lo que está cerrado es el contador.




---

# C2 · C3 · C4 — 2026-10-05

Tres puntos cerrados del handoff, con la misma regla que los demás: dry-run o
SQL directo antes de tocar datos, y verificación en producción después.

## C2 — un solo patrón para reproducir

`Escuchar N pistas` (álbum) y `Reproducir • Preview (30s)` (pista suelta) eran dos
nombres de la misma acción en la misma tarjeta. Ahora el álbum dice
`Reproducir • N pistas`, que es el patrón que ya escribía `AudioPlayer.tsx:260`.
"Escuchar" desaparece; el `aria-label` no cambia.

**Producción:** David Bowie → `Reproducir • 2 pistas`, cero `Escuchar N pistas` en
las 6 fichas revisadas, y la frase honesta intacta en Heroes y Vulnicura Strings.

**3 tests nuevos, porque ninguno de los dos patrones estaba atado.** `AudioPlayer`
no tenía ni un test sobre su etiqueta. Revertido el label: 3 de 10 se ponen rojos.

## C3 — un solo botón en el formulario de edición

| Estado | Etiqueta | Efecto |
|---|---|---|
| `borrador` | Publicar | entra en revisión |
| `aprobado` | Actualizar publicación | sigue publicado |
| `pendiente` / `rechazado` | Enviar para revisión | entra en revisión |

El secundario "Enviar para revisión (retira del catálogo)" desaparece. `primaryLabel`
y `primaryIntent` son la misma tabla partida en dos, con un test que ata que no se
contradigan — que era el agujero real, porque con dos botones podían no
contradecirse: despublicar con un botón que decía "Actualizar publicación".

**Lo que se pierde, a propósito:** era el único camino del artista para retirar del
catálogo un release aprobado. Queda el del admin. Y con él se cae el
`window.confirm` que lo protegía: no se quitó un cuidado, es que ya no había
combinación que lo disparara.

**Producción:** `approved → ["Actualizar publicación"]`. Un submit, sin rastro del
rótulo retirado, ayuda de estado coherente.

## C4 — el vocabulario de show, cerrado

8 estados: 6 elegibles y 2 que pone la fecha. Antes eran 13 + 7 alias + `| string`,
declarados en cuatro ficheros sin que nadie comprobara que coincidieran.

Lo que más me gusta de este cambio es que **el compilador encontró los sitios**:
en cuanto `ShowStatus` dejó de ser `| string`, tsc señaló los cuatro comparaciones
con `agotado` y el `z.enum` de 13. Ese era el punto: el tipo no restringía nada, y
el único filtro real era un array de Zod que el compilador no vigilaba.

**Producción:** el filtro de `/shows` devuelve los 8 + "Todos", y **cero avisos de
`show-status`** en consola — que es la prueba de que ninguna fila traía un valor
raro.

## Tres veces el mismo tropiezo: `not.toContain` cuenta comentarios

Tres tests que escribí se pusieron rojos **no porque el código estuviera mal,
sino porque mis comentarios citan lo que se retiró**:

1. C3: `not.toContain('retira del catálogo')` — el comentario de C3 lo cita.
2. C3: `un solo type="submit"` — el comentario de `handleSubmit` lo cita.
3. C4: `not.toContain("as ShowStatus")` — el comentario de `lib/db.ts` lo cita.

Un comentario no es código, y una aserción textual sobre el fichero entero no
distingue. Lo que quedó:

- Las textuales van sobre `sinComentarios(src)`.
- Las que no se pueden expresar así, **estructurales**: la clase CSS
  (`bg-emerald-500`) en vez del rótulo del botón, y el JSX desde `<form` en vez de
  todo el fichero.
- El helper vive en `tests/unit/show-status-vocabulary.test.ts` para que el cuarto
  caso no lo vuelva a pagar.

## Puertas

`1195/1195` en 62 ficheros, `tsc` limpio, `next lint` sin warnings, `pnpm build`
correcto, y los tres puntos verificados contra `epk-dashboard.vercel.app` con el
deploy de `fe6b575`.

## Lo que sigue abierto, y por qué

- **C5** (fotos de perfil), **C6** (cuenta de prueba) y **C7** (trocear la
  documentación) están sin empezar.
- **C9** fuera de alcance: destructiva, con `force-push`, y marcada por el usuario
  como la última.
- **Las 5 métricas de los 5 álbumes** siguen a 0 curado: es una escritura en
  producción y va con su dry-run y su OK, no colada dentro de un lote de UI.
---

# C5 · C6 — 2026-10-05

## C5 — el dry-run de fotos proponía lo que se había rechazado

Ejecuté el dry-run buscando el delta real y propose **10 escrituras, 4 de las
cuales eran exactamente las que la ficha de C5 decía que no se querían**: el
perfil de Björk, el de Bowie y el banner de Bowie. Las candidatas seguían en la
tabla `CURATED` después de la decisión de dejarlas fuera, así que un `--apply`
cualquiera las habría escrito.

Las saqué de la tabla y dejé el motivo con las URLs. Miradas una a una:

- **Bowie: confirmado que no funciona.** 1280x1280, sujeto en el tercio derecho,
  40% izquierdo negro puro. El recorte circular centrado sale negro con una franja
  de traje. Ni perfil ni banner.
- **Björk: sí funcionaría.** 1000x1416, portrait, centrada y ocupando el
  encuadre. Se queda fuera por decisión, no por calidad, y ahora está escrito.

Lo que **no** escribí: las 7 canonicalizaciones `thumb` → `upload` que propone el
dry-run. Son la misma imagen y el alias funciona; es cosmético.

## C6 — por fin hay un suscriptor que probar

0 cuentas suscriptor en producción, que es la superficie más grande sin cubrir:
suscripciones, notificaciones, preferencias de email y broadcast.

- Rol `subscriber` en `scripts/lib/credentials.ts`, con P7 intacta: la contraseña
  **no** tiene default, el correo sí (`subscriber@epk.local`).
- Contraseña de 32 caracteres aleatorios en `.env.local` (gitignored), nunca
  impresa ni commiteada.
- `scripts/create-test-subscriber.ts` con dry-run por defecto, y **comprueba si el
  correo ya existe** antes de escribir: `INSERT OR REPLACE` con id nuevo haría un
  duplicado en un segundo seed.
- **1 fila en `users`** en Turso.
- Verificado: login 200, rol `subscriber`, y el ciclo `Suscribirse` → `Suscrito` →
  confirmación de baja. La suscripción se queda (1 fila) porque un suscriptor sin
  suscripciones no puede probar el fan-out.

## El fallo que casi es el de P7

La primera ejecución de los tests **imprimió la contraseña real**:

    expected 'eBCFf7pa4V6...' to be ''

`ENV_KEYS` en `tests/unit/credentials.test.ts` limpia `TEST_ARTIST_*` y
`TEST_ADMIN_*` antes de importar el helper, y no conocía el rol nuevo. Como
`credentials.ts` hace `dotenv.config()` en su propio cuerpo, la variable se
repoblaba desde `.env.local` y el test comparaba contra la clave de verdad.

El test cuya misión es "ninguna contraseña tiene default" estaba leyendo una
contraseña real. Arreglado, y el comentario del `ENV_KEYS` dice que el rol nuevo
tiene que entrar ahí **el mismo día que se crea**, con el motivo.

## C4 de la documentación: la cuarta vez con `not.toContain`

C5 tropieza otra vez con lo mismo y por eso `sinComentarios()` pasa a
`tests/helpers/strip-comments.ts`, compartido:

- El comentario del script de fotos incluye la entrada de Björk como ejemplo de
  "si cambias de idea", y la aserción de que no existe se ponía roja.
- El helper documenta su límite real: en ese mismo script hay un `console.log`
  con `content-type image/*`, y ese `/*` no es un comentario, así que el stripper
  se come un trozo. Por eso los tests **recortan** lo que comparan.

## Puertas

`1200/1200` en 62 ficheros, `tsc` limpio, `next lint` sin warnings.
