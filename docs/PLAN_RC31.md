# Plan RC.31 — 15 problemas + 2 huecos + P16

> Documento de fase. Es también el **contrato entre subagentes**: cada agente
> recibe de aquí la lista exacta de archivos que posee y las dependencias que
> puede consumir sin tocarlas.

## Regla de oro

**Ningún archivo puede estar en dos agentes.** Si necesitas algo de otro
stream, lo consumes por la API que ese agente publica en su sección. Si el
contrato no está escrito aquí, primero se escribe aquí.

Los commits los hace el orquestador, no los agentes: cinco agentes en paralelo
sobre un mismo índice git se pisan.

## Decisiones ya cerradas (no se reabren)

| Decisión | Respuesta |
|---|---|
| Play en release multipista | **Cola completa con avance automático** |
| Alcance de la ficha técnica | **Por artista** (nunca el catálogo global) |
| Acceso del artista al catálogo completo | **Endpoint autenticado aparte**; el export público sigue igual |
| Portadas del catálogo semilla | **Reales vía iTunes `entity=album`**, con verificación visual antes de aplicar |
| Suscriptor → artista (P16) | **Construir el portal `/submissions`**, no aflojar `/api/releases` ni `/api/shows` |

## Hallazgos que corrigen el diagnóstico inicial

### P16 no es lo que parecía

`POST /api/submissions` **ya funciona**: solo exige sesión, toma el `userId` de
la sesión en vez de un header falsificable (`app/api/submissions/route.ts:142-143`),
fuerza `status: "pending"` y escribe en `track_submissions`.
`createArtistProfileForUser` (`lib/artist-promotion.ts:148`) ya sabe crear la
fila en `artists`.

Lo que falta es la UI: **`app/submissions/page.tsx` no existe** y ningún
cliente hace POST a `/api/submissions` (el único `fetch` es un GET del admin).

Aflojar el rol en `POST /api/releases` y `POST /api/shows` sería **peor**:
pondría filas `pending` en `tracks`/`shows`, y `userHasApprovedContent`
(`lib/artist-promotion.ts:112-116`) **solo lee `track_submissions`** — la
promoción seguiría sin dispararse, y ensancharíamos dos endpoints de escritura
de la misma superficie que estamos cerrando por S0.

**La promoción vía show es estructuralmente imposible**: para shows exige
`getArtistByUserId(userId)` (`:119-126`), que un suscriptor no tiene. Solo un
track submission puede promover. Queda documentado, no arreglado (alcance aparte).

## Clasificación

| ID | Problema | Severidad |
|---|---|---|
| **P4** | `GET /api/releases?id=X` sin `user_id` → `SELECT *` crudo, expone `admin_notes` y borradores. `ReleaseActions` sin ningún chequeo de rol. Badge de estado público. | **S0** |
| **P12b** | `getAllShows()` (`lib/db.ts:1692`) sin `approved = 1` ni `deleted_at IS NULL`, y `/shows` es pública | **S0** |
| **P1** | Portadas: 9/9 con fotos genéricas que no corresponden | S1 |
| **P3** | Sin audio en el 100% del catálogo | S1 |
| **P7** | Typos y flags de seed | S1 |
| **P15** | 9/9 padres con `duration = "00:00"`, propagado a los 3 formatos de export | S1 |
| **GAP-A** | `release_id` ausente del catálogo JSON | S1 |
| **GAP-B** | `/api/artists` dual-mode; patrón repetido en 7 rutas | S1 |
| **P13** | Export sin sesión; catálogo completo inalcanzable para el dueño | S1 |
| **P5** | El copy de la ficha promete un alcance que no entrega | S1 |
| **P16** | El flujo de promoción de suscriptor a artista no tiene UI | S1 |
| **P2** | Play de multipista inerte | S1 |
| **P6/P10** | 5 opciones → 3 secciones × 3 formatos, copy correcto | S2 |
| **P8** | Portadas no clickeables | S2 |
| **P11** | 4 releases por página | S2 |
| **P12a** | Copy de `/shows` con rol asumido | S2 |
| **P9** | Rutas `/releases/[id]` vs `/track/[id]` inconsistentes | S3 |
| **P14** | Paleta de `/admin/approvals` | S3 |

Estado real verificado en Turso al abrir la fase: **83 tracks, 100% `approved`,
0 con `admin_notes`**. La fuga de P4 es *latente pero sin guarda*: en cuanto un
artista envíe un release, queda público e indexable.

## Oleadas

### Ola 1 — cinco agentes en paralelo

**A es bloqueante**: posee `lib/db.ts` y `lib/null-safe.ts`, de los que dependen B, C y D2.
Por eso sale primero y solo.

| Agente | Alcance | Archivos exclusivos |
|---|---|---|
| **A** | S0 + P16 + datos | `lib/db.ts`, `lib/null-safe.ts`, `app/api/releases/route.ts`, `app/api/tracks/[id]/route.ts`, `app/api/shows/route.ts`, `app/api/submissions/route.ts`, `components/ReleaseActions.tsx`, `app/releases/[id]/page.tsx`, `middleware.ts`, `app/submissions/page.tsx` (nuevo) |
| **B** | Portadas iTunes + seed | `scripts/fetch-itunes-covers.ts` (nuevo), `scripts/fix-seed-data.ts` (nuevo), `scripts/seed-influential-catalog.ts`, `scripts/turso-check.ts` |
| **C** | Export + 3×3 + endpoint autenticado | `app/api/export/route.ts`, `app/api/artist-catalog/route.ts` (nuevo), `lib/export-bundle.ts`, `lib/downloadable-assets.ts`, `components/DownloadCenter.tsx`, `components/CatalogDownloadButton.tsx`, `lib/pdf/*` |
| **D1** | Cola de audio | `context/AudioPlayerContext.tsx`, `components/AudioPlayer.tsx`, `components/GlobalAudioPlayer.tsx`, `lib/audio-priority.ts`, `lib/youtube.ts`, `app/api/audio-proxy/route.ts` (nuevo) |
| **D2** | Cards + carrusel + páginas | `components/EPKCard.tsx`, `components/ArtistTracksSection.tsx`, `components/ReleaseTrackList.tsx`, `components/ReleaseTracklistSection.tsx`, `components/carousel/*`, `lib/carousel.ts`, `app/track/[id]/page.tsx`, `app/dashboard/page.tsx`, `app/artists/[id]/page.tsx` |

### Ola 2 — tres agentes

`/shows` (copy) · `/admin/approvals` (diseño) · `/api/artists` (dual-mode + sus 47 guards de test).

### Ola 3 — orquestador, secuencial

`tsc` → lint → `vitest` (Node 24) → build → Playwright local → capturas en
1440/1280/1024/768/390 → **revertir cada fix y comprobar que su test falla** →
producción → prerelease.

## Contratos entre streams

- **A → todos**: `parseDurationToSeconds()` y `sumDurations()` en `lib/null-safe.ts`.
  Deben manejar `"1:02:03"`, `"—"`, `""` y `null`. El parser actual está duplicado
  en `ReleaseTracklistSection.tsx:35-37` y `app/track/[id]/page.tsx:96-98`, y
  destruye solo `[m, s]`: **una pista de una hora suma 62 s en vez de 3723 s** y el
  guard `isNaN` no salta. Formato de salida `M:SS`, como las hijas del seed.
- **A → D2**: `getArtistByName` ya existe (`lib/db.ts:1495`), así que `/track/[id]`
  resuelve `artistId` para el widget de C sin tocar `lib/db.ts`.
- **D1 → D2**: `playQueue(items, startIndex?)`, `next()`, `prev()`, `hasNext`, `hasPrev`,
  y `crossOrigin` **condicional por origen**. Verificar primero con `curl -I` si el
  CDN de Apple envía CORS; si no, proxy same-origin.
- **D2 → C**: pasar `artistId` y el trigger de cola.

## El conflicto del `crossOrigin` (no sortearlo, resolverlo)

`crossOrigin="anonymous"` está en el `<audio>` global
(`context/AudioPlayerContext.tsx:407`) **a propósito**: sin él,
`createMediaElementSource()` falla en silencio y el visualizador cae a frecuencias
sintéticas (`AI_LOG.md:3077-3095`). Pero **se quitó antes exactamente para evitar
CORS con el CDN de Apple** (`AI_LOG.md:1268`) y luego se volvió a poner.

Con previews de iTunes esto es camino crítico: el atributo obliga al navegador a
exigir `Access-Control-Allow-Origin` en `audio-ssl.itunes.apple.com`, y si no llega,
`play()` rechaza con el error que ya se vio en pantalla.

## Restricciones que no se tocan

- `<h1>Shows & Events</h1>` en `app/shows/page.tsx` lo exige
  `tests/e2e/p36-production.spec.ts:11`, y `AI_LOG.md:6089` lo registra como
  decisión deliberada.
- Cadenas que el E2E exige: `Aprobaciones`, `Envíos`, `Buscar envíos`,
  `Panel de Administración`, `Releases`, `Revisión`, y los botones
  `Ver`/`Aprobar`/`Rechazar`/`Revisión`/`Anterior`/`Siguiente`/`Cerrar`.
- `scripts/unit/downloads-b2.test.ts:61-68` **codifica los ids de opción**
  (`dossier`, `rider`, `catalog-json`, `catalog-html`) como aserción de texto
  fuente: hay que actualizarlo en el mismo commit que cambie las opciones.
- `scripts/rc30-track-regression.ts:81-93` es la puerta de layout de la ficha
  técnica en 5 anchos; hay que re-ejecutarlo tras tocar las descargas.
- `tailwind.config.ts` solo define `primary` (rosa). Los cuatro hexes de marca de
  AGENTS.md existen en la paleta por defecto de Tailwind.
- **`getDbWrite()` está roto en producción.** Nunca usarlo en una ruta API. Hay
  11 usos vivos, incluido `lib/artist-promotion.ts:139`, que está en el camino de
  aprobación.

## Descartado

- **Decisión 5 de un plan externo**: unificar en `/track/[id]` con 301 desde
  `/releases/[id]`. Rompe `ArtistTracksSection.tsx:86`, `app/admin/page.tsx:916` y
  `NotificationBell.tsx:113-115`. Se queda como normalización de enlaces.
- **iTunes dentro del seed**: haría el seed dependiente de red y no reproducible,
  y se saltaría la verificación visual que este repo ya aprendió a la mala
  (`AI_LOG.md:5448-5449`). Va en script aparte con dry-run.

## Riesgo de pérdida de datos en el seed

`--cleanup` localiza el padre por `(artist_name, title)` sobre un `SELECT *` sin
ordenar. En *Kid A* y *Heroes* **una hija comparte ese título**, así que `find`
puede devolver la hija, borrarla, y dejar al padre real con sus 10/1 hijas
huérfanas. Verificado en producción: `rel-4e26ff30` tiene una hija llamada
exactamente "Kid A".

**Arreglar antes de cualquier re-ejecución del seed.**