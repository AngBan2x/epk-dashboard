# PHASE P6 — Fixes UI + Roles + Seguridad + A11y (SPEC, pendiente de ejecución)

**Estado:** planificada (espec aprobada por el usuario el 2026-09-27, pendiente de ejecución por oleadas).
**Origen:** 13 problemas reportados por el usuario con capturas + 2 barridos de evidencia (accesibilidad/responsive, integridad/seguridad). Todo verificado con archivo:linea antes de planificar.
**Subagentes:** show-form-builder, header-builder, carousel-builder, dashboard-builder, api-builder, approval-workflow-builder, auth-builder, db-migrator, security-auditor, quality-auditor, visual-tester, api-tester.

## Resultado por bloque

| Bloque | Estado | Nota |
|---|---|---|
| 1 Issues 1-10 | Hecho | animacion, cards, filtros, header, SortSelect |
| 2 Carrusel | Hecho | solo catalogo dashboard, Embla |
| 3 Descargas | Hecho | exportador unificado server-side, stale corregido |
| 4 Roles | Hecho | suscriptor por defecto + hook de promocion |
| 5 Admin split | Hecho | submissions portal / approvals consola |
| 6 Visualizador | Hecho | FFT 1024, bandas 30 Hz-18 kHz, peak-hold |
| 7 Seguridad S1-S8 | Hecho | 8/8 aplicados y auditados |
| 8 a11y AX1-AX7 | Hecho | 7/7 aplicados |

## Decisiones del usuario (registradas, no reabrir sin motivo)
1. Descargas: **opción B** (exportador unificado server-side).
2. Modelo **suscriptor-por-defecto confirmado**; (2a) registro directo de artista **cerrado**; (2b) la promoción la dispara aprobar su primer release **o** show.
3. Aprobaciones: **opción B** (`submissions` = portal del artista, `approvals` = consola admin).
4. Carrusel: **solo catálogo** del dashboard.
5. Shows: **tarjetas ricas**, sin página de detalle ni modal.
6. Menú avatar: clic-fuera + Escape bastan, **sin botón X**.
7. Visualizador: alcance **M** (peak-hold, ventana 30Hz–18kHz, calibración).
8. Se suman **ambos grupos** del barrido (seguridad + accesibilidad); rate limit **solo en las más abusables**.

## Bloque 1 — Issues 1–10 (UI directa)

| # | Problema | Causa raíz (archivo:linea) | Fix | Esfuerzo | Agente |
|---|---|---|---|---|---|
| 1 | Expansión de shows sin animación | `ShowsBooking.tsx:203-245` render condicional seco; solo la flecha anima (`:164`) | `AnimatePresence` + `motion.div` (patrón `BioSection.tsx:98-129`) | S | show-form-builder |
| 3 | Página `/shows` pobre | Grid anidado duplicado (`page.tsx:161`+`177`); checkbox con label vacío (`:144-152`); `truncate` sin `title` (`:226`); flyer con esquinas raras (`:213-222`); colores duplicados (`page.tsx:19-33` vs `lib/show-status.ts`, unificar al lib); tarjetas ricas (flyer completo, fecha, precio, tickets, descripción expandible) | Rework cards + filtros | S | show-form-builder |
| 4 | Opciones del select ilegibles | `<select>` nativo sin `color-scheme` ni estilos `option` (`shows/page.tsx:129-140`); sin `text-*`; labels crudos | `dark:[color-scheme:dark]` + estilos opción + `showStatusLabel` | S | show-form-builder |
| 5 | Espaciado header | `mx-2` residual solo en `Catálogo` (`Header.tsx:82`); const `navLink` muerta (`:33`) | Quitar `mx-2`, usar `navLink` | S | header-builder |
| 8 | "Ordenar por" apretado | `SortSelect.tsx:71-82` rompe el patrón (label inline + sin `w-full`) | Label superior + campo full-width | S | show-form-builder |
| 9 | Menú avatar no cierra fuera | Sin `useEffect` de cierre (`Header.tsx:99-157`); patrón a replicar en `NotificationBell.tsx:225-243` | Escape + clic-fuera + foco | S | header-builder |
| 10 | Artista no ve otros artistas | No es auth (sin guardas en `/artists*`): el header oculta `Artistas` a logueados (`Header.tsx:51-87`) y el dashboard muestra vista personal | Mostrar link también logueado (+ móvil) | S | header-builder |

## Bloque 2 — Carrusel (issue 2)

No existe ninguno (ni dependencia). Alcance: **solo catálogo del dashboard** (`dashboard/page.tsx:522-535`, guest).
Crear con Embla (`embla-carousel-react` + autoplay): `components/carousel/` (`useCarousel`, `CarouselCard`, `CarouselNavigation`, `CarouselDots`, `ArtistCarousel`, `ReleaseCarousel`), `lib/carousel.ts`. Criterio: scroll fluido desktop+móvil, sin layout shift, a11y (`aria-roledescription`, teclado). Esfuerzo M. Agente: `carousel-builder`.

## Bloque 3 — Dossier y descargas (issues 6–7, opción B)

- **Issue 6 (stale):** `DownloadCenter.tsx:70-82` usa estado viejo por closure (el `setTimeout` 600ms no lo corrige). Fix S: `loadDossier` retorna el JSON fresco y se usa ese valor.
- **Opción B (M):** `POST /api/export` acepta `artist_id` y compone bundle único (dossier + rider + tracks del artista, HTML + JSON); `DownloadCenter` invoca el endpoint; `EPKExporter` se absorbe en la sección única (formatos: Rider HTML, Dossier HTML, Catálogo JSON, Catálogo HTML).
- No solapa con bloques 1–2 en archivos salvo región de descargas de `dashboard/page.tsx` (propiedad de este bloque).
- Agentes: `api-builder` (endpoint + `lib/downloadable-assets.ts`) ∥ `dashboard-builder` (componentes + sección). Esfuerzo M.

## Bloque 4 — Roles: suscriptor por defecto + promoción (issue 11, L)

Contrato fijo:
- Registro solo `subscriber` (cerrar `artist` del enum público; `AuthContext` y UI con default `subscriber`).
- `POST` releases/shows abierto a suscriptor **forzando** `pending` / `approved=false`; ownership con **perfil lazy** (se crea al primer upload, pero el rol sigue `subscriber`).
- Escritor único de aprobación: `POST /api/admin/approvals/[id]`; el hook de promoción vive ahí (crear/asegurar perfil + `users.role=artist` + notificar).
- La promoción se materializa **solo en `users.role`**, nunca solo con crear el perfil.
- Sesión: el rol vive en el token firmado → la aprobación exige re-login (notificado al usuario); sin revalidación por request.
- Endpoint nuevo solo-admin de cambio de rol (`admin/users/[id]/role`, idempotente, auditable).
- Backfill de artistas sin perfil + verificación.
- Archivos: `register/*`, `AuthContext.tsx`, `middleware.ts` (+`matcher`), `lib/auth.ts` (`auth-builder`) ∥ `releases/route.ts`, `shows/route.ts`, `submissions/route.ts`, `artists/me`, nuevo endpoint (`api-builder`) ∥ región de vista de `dashboard/page.tsx` (`dashboard-builder`, tras carrusel) ∥ `scripts/` backfill (`db-migrator`).

## Bloque 5 — Admin split (issue 12, opción B, M)

- `GET/PATCH /api/submissions` = portal del artista (ver/crear lo propio); `/admin/approvals*` = consola admin (stats, filtros, modales, auditoría `admin_id`/`reviewed_at`).
- Tab Envíos de `/admin` pasa a atajo hacia la consola (se elimina la doble escritura); se conserva el endpoint para uso del artista.
- Alinear: tipo `Submission` con `revision`, mínimo min-10 de motivo en backend, mensaje honesto (aprobar submission ≠ publicar en catálogo hasta que el hook de promoción exista).
- Agente: `approval-workflow-builder` (+ hook de promoción del bloque 4 en el mismo endpoint).

## Bloque 6 — Visualizador (issue 13, M)

Causa confirmada (`AudioVisualizer.tsx:62,84-101`, `lib/web-audio.ts:44-64`): `fftSize=128` → 64 bins (~344 Hz/bin), promedio lineal que diluye agudos, sin ganancia por banda ni curva.
Fix: `fftSize` 1024/2048 + bandas logarítmicas reales en Hz (ventana 30Hz–18kHz, calibrado por `sampleRate`/Nyquist) + ganancia por banda + curva sqrt/dB + decay por barra + peak-hold. Agente: `dashboard-builder` (tras carrusel si comparte región; archivos disjuntos de todos modos).

## Bloque 7 — Seguridad y datos (barrido, S/M)

| ID | Fix | Esfuerzo | Agente |
|---|---|---|---|
| S1 | Filtro `status='approved'` en dashboard anónimo + no exponer `user_id` público | S | security-auditor (reporte) → api-builder |
| S2 | `exp` obligatorio siempre (fin del token infinito con rememberMe) + revalidación de rol/sesión | S | auth-builder |
| S3 | Rate limit en `POST` shows, releases, subscriptions, likes y upload/image (admin y transiciones de dueño excluidas) | M | api-builder |
| S4 | `GET /api/releases?user_id=` filtra por columna inexistente → 500 | S | api-builder |
| S5 | Aviso "sin dueño" en admin + backfill de `artists.user_id` NULL (6/7 seeds) | S | db-migrator |
| S6 | Cascadas en `deleteArtist` (suscripciones, dossiers) y `deleteUser` (dossiers, tracks) | S+M | db-migrator + db-builder |
| S7 | Notificar/fan-out en `POST/PUT /api/tracks`, `PUT /api/releases` por admin y `PUT /api/shows` (`show_update`) | S | api-builder |
| S8 | Upload por extensión + magic bytes + `contentType` forzado | S | api-builder |

## Bloque 8 — Accesibilidad (barrido, S salvo nota)

AX1 `LoginModal` (Escape/dialog/alert) · AX2 modales de aprobaciones (Escape/rol/label) · AX3 `ShowTransitionModal` Escape · AX4 labels/`htmlFor` en filtros de shows · AX5 imágenes con `onError`+`alt` · AX6 `VideoPlayerModal` en modo claro · AX7 `focus-visible` + contraste. Los ítems AX1–AX7 se reparten en los agentes dueños de cada archivo según la tabla de la Oleada 1. No se incluye: sustitución de `window.confirm` (M, diferido) ni pasada 44px global (M, diferida).

## Oleadas y paralelismo

- **Oleada 1** (paralelo total, archivos disjuntos): show-form-builder (A1–A2 del bloque 1 + A4-labels) ∥ header-builder (A3+9+10) ∥ carousel-builder (bloque 2) ∥ dashboard-builder (bloque 6 visualizador, luego B-UI) ∥ api-builder (B-API) ∥ approval-workflow-builder (bloque 5).
- **Oleada 2** (tras contrato del hook): auth-builder ∥ api-builder (C-api+S3+S4+S7+S8) ∥ dashboard-builder (C-ui) ∥ db-migrator (C-datos+S5+S6).
- **Oleada 3** (seguridad S1+S2 con auth-builder/api-builder si no cupo en Oleada 2; si cupo, solo verificación).
- **Oleada 4 (verificación global)**: security-auditor (auditoría authZ de C+S, reporta sin auto-fixear) + quality-auditor (unit Node 22 + E2E por bloque, headed) + visual-tester (capturas/DOM, checklist teclado y contraste). Cierre por bloque: commit/push → matriz + funcional + headed + capturas en prod → AI_LOG → release si se completa la fase.

## Supuestos verificados

- Re-login tras promocion: verificado (el login lee el rol de la BD y el token siempre lleva xp).
- marketing_emails no bloquea avisos oficiales: sin cambios en P6.
- Limpieza de tests en fterAll: los E2E de aprobaciones y suscriptores se corrigieron y limpian.
- DDL DEFAULT 'artist' se deja como esta; la API manda y fuerza subscriber.
- FROM_EMAIL/dominio y cuota Resend: siguen pendientes, ninguna prueba de correo ejecutada.

- Re-login obligatorio tras promoción (notificado al usuario).
- `marketing_emails` no bloquea avisos oficiales (criterio P4.8).
- Limpieza de tests en `afterAll` (lección P4.6b).
- DDL `DEFAULT 'artist'` se deja como está (la API manda); solo se documenta.
- `FROM_EMAIL`/dominio y cuota Resend siguen pendientes por el usuario; los E2E de correo se programan con cuota disponible.

## No-objetivos de esta fase

Sustitución de `window.confirm`, pasada táctil 44px global, dominio propio de pago, página de detalle `/shows/[id]`.

