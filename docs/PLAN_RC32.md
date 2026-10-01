# Plan RC.32 — auditoría de reproducción, ownership de releases y_web-audio

> Documento de fase y **contrato entre subagentes**. Cada agente recibe de aquí
> la lista exacta de ficheros que posee.

## Regla de oro

**Ningún fichero puede estar en dos agentes.** Lo que necesites de otro stream
se consume por la API que ese agente publica aquí. Si el contrato no está
escrito, primero se escribe.

Los commits los hace el orquestador. Y **stagear con rutas explícitas, nunca
por directorio**: en RC.31 un `git add app components lib…` se tragó
`middleware.ts` (que está en la raíz) y dejó el S0 a medias en producción una
media hora.

## Regla de modelos

`space-bunny-free` para todo subagente que lea código. `mimo-v2.6-flash-free`
**no** se usa como subagente de implementación: en RC.31 compactó en bucle
(99% → 1% → 99%) sin avanzar. Solo para lecturas de un solo comando.

## Diagnóstico verificado del defecto #1 (el más grave)

El formulario de edición **reenvía el `status` actual dentro del payload**:

| # | Fichero:línea | Qué pasa |
|---|---|---|
| 1 | `app/releases/[id]/edit/page.tsx:99` | `status: data.status \|\| "draft"` → carga el estado **actual** al state |
| 2 | `app/releases/[id]/edit/page.tsx:278` | `const status = submitForReview ? "pending" : form.status` |
| 3 | `app/api/releases/route.ts:274` | `const { id, status, ...updates } = body` |
| 4 | `app/api/releases/route.ts:302` | `["approved","rejected","revision"].includes(status) && !admin` → **403** |

**Las 83 filas están en `approved`** (las puso `scripts/fix-release-status.ts:53`),
así que ningún artista puede editar ningún release. Nunca.

La comprobación de propiedad **ya existe y ya pasa** (Turso: Angel Bandres
`con_dueno`):
```
app/api/releases/route.ts:284-285
  const artistRow = await dbQuery("SELECT id, user_id FROM artists WHERE name = ?", [existing[0].artist_name])
  const ownsTrack = artistRow.length > 0 && artistRow[0].user_id === session.userId
```
El mensaje **largo** de la captura ("solo un admin puede aprobar…") es el gate de
estado. El corto ("No autorizado") sería el de propiedad. No se confunden.

### Los tres bugs que están detrás del 403

No se ven porque el 403 los tapa. **Arreglar el 403 sin estos tres activa pérdida
de datos silenciosa.** Van en el mismo agente, obligatoriamente.

| # | Gravedad | Qué pasa |
|---|---|---|
| **A-1** | S0 | `GET /api/releases?id=X` (el que usa el form, **sin** `user_id`) para una fila `approved` sale por `route.ts:132-133` → `getApprovedTrackById` → `parseTrack`, que **no expone `description`, `genre` ni `admin_notes`**. La rama privilegiada que sí devuelve la cruda es **inalcanzable para las 83**. El form carga la descripción vacía y el siguiente guardado **la borra** |
| **A-2** | S0 | `artist_name` está en `ALLOWED_COLUMNS` y es input de texto libre. La propiedad se verifica contra la fila **existente**, no contra el valor nuevo → un artista reasigna el release o lo deja huérfano. Y `tracks` se relaciona con `artists` **por nombre**, no por FK |
| **A-3** | S0 | `tracks` (las hijas) **no está** en `ALLOWED_COLUMNS` → se descartan en silencio. Y `track_number`, `start_time`, `end_time` **sí** están, así que los inputs de las hijas se escriben sobre la fila del **padre** |

## Contratos ya publicados (RC.31, no reimplementar)

```ts
// lib/null-safe.ts
parseDurationToSeconds(v: string|null|undefined): number | null
sumDurations(v: Array<string|null|undefined>): { seconds: number; label: string } | null
// acepta M:SS · MM:SS · H:MM:SS · HH:MM:SS; rechaza placeholders y componentes >= 60
// salida en M:SS (no MM:SS)

// lib/db.ts
getApprovedTrackById(id)               // approved O hija de approved, parseado
isArtistOwnerOfTrackName(name, uid)
getApprovedShows() / getApprovedShowsByArtist(id) / getApprovedShowsByArtists(ids)
getApprovedTracks()                    // status approved + parseTrack
getTursoClientSync()                   // null si y solo si isTursoEnabled() es falso

// lib/audio-priority.ts + context/AudioPlayerContext.tsx
hasPlayableSource(track) · getPlayableAudioSource(track) · isUsableAudioUrl(v)
shouldUseCrossOrigin(url) · CORS_VERIFIED_AUDIO_HOSTS
playTrack(t) · playQueue(items, startIndex?) · next() · prev() · hasNext · hasPrev
queue · queueIndex · queuePosition

// components/AudioPlayer.tsx
<AudioPlayer {...} queue={ActiveTrack[]} queueStartIndex={n} />

// components/CatalogDownloadButton.tsx
<CatalogDownloadButton artistId={...} artistName={...} />
```

## Minas de producción verificadas

- **`POST /api/sync` revierte todo el catálogo a `draft`.** `syncLocalToTurso`
  (`lib/turso.ts:329`) es `INSERT OR REPLACE` de 24 columnas que **omiten**
  `release_id`, `start_time`, `end_time`, `track_number` y **`admin_notes`**; y
  `app/api/sync/route.ts:27-41` no mapea `status`, así que el `?? 'draft'` de
  `turso.ts:360` aplica a todo. Ejecutarlo **despublica el catálogo entero y
  borra el audit trail**. Sin dry-run ni backup. **Deshabilitar primero.**
- **Lo que protege Turso en los tests no son los 83 guards `isTursoConfigured()`**,
  es `vitest.config.ts:7-8` (dos `delete process.env.TURSO_*`). Bajo vitest el env
  está ausente → `isTursoEnabled()` falso → **los guards nunca saltan**. Están
  muertos. **No tocar `vitest.config.ts`** y documentar por qué.
- **La promoción falla en silencio**: `app/api/admin/approvals/[id]/route.ts:138-145`
  envuelve la promoción en try/catch y devuelve **200** igual. Solo hay un
  `console.error`. El admin aprueba y el usuario no se promueve.

## Ola 1 — cuatro agentes en paralelo

**A y B y C y D no comparten ni un fichero.**

| Agente | Ficheros exclusivos |
|---|---|
| **A** | `app/api/releases/route.ts` · `app/releases/[id]/edit/page.tsx` · `app/releases/new/page.tsx` · `lib/db.ts` · `lib/production-fields.ts` · tests nuevos de A |
| **B** | `lib/audio-priority.ts` · `context/AudioPlayerContext.tsx` · `components/GlobalAudioPlayer.tsx` · `components/AudioPlayer.tsx` · `components/ReleaseTrackList.tsx` · `components/ReleaseTracklistSection.tsx` · tests de audio |
| **C** | `app/api/dashboard/route.ts` · `app/dashboard/page.tsx` · `components/EPKCard.tsx` |
| **D** | `lib/web-audio.ts` · `components/AudioVisualizer.tsx` · `tests/unit/audio-visualizer.test.ts` |

## Ola 2 — tres agentes

| Agente | Ficheros |
|---|---|
| **E** | `app/api/admin/releases/route.ts` · `app/admin/page.tsx` · `app/admin/approvals/page.tsx` · `scripts/fix-seed-data.ts` · `scripts/turso-check.ts` |
| **F** | `lib/turso.ts` · `lib/artist-promotion.ts` · `app/api/sync/route.ts` · `opencode.json` |
| **G** | `scripts/fetch-deezer-previews.ts` (nuevo) · `scripts/fetch-cover-art.ts` (nuevo) |

## Ola 3 — un agente + orquestador

| Agente | Ficheros |
|---|---|
| **H** | `lib/turso.ts` · `scripts/fetch-official-videos.ts` (nuevo) · `app/api/youtube/route.ts` · `types/music.ts` |

**Ordenador**: `README.md` (las 5 afirmaciones falsas + **la credencial de la
línea 167**) · `AGENTS.md` · gates · revertir-cada-fix · producción · prerelease.

### Secuencia obligatoria dentro de F

`lib/turso.ts:31-32` (`const` → getters) **antes** que cualquier renombrada de
`isTursoConfigured`. Arreglar las consts **desarma la colisión por sí solo**
(ambas funciones pasan a ser de tiempo de llamada). Renombrar mientras el
snapshot sigue vivo abre la ventana de escritura en producción, y el fallo sería
**verde**: los tests seguirían pasando mientras escriben QA en Turso.

## Restricciones

- **No** `pnpm install` / `pnpm rebuild` / `pnpm build` en subagentes. **No** lances
  ni pares servidores. Node 24.
- `getDbWrite()` está roto en producción. Nunca en una ruta API. El criterio
  válido es `getTursoClientSync() !== null`, y el handle local solo sin cliente.
- `vitest.config.ts` no se toca (ver minas).
- Cada fix con un test que **cambia al revertirlo**.
- `npx tsc --noEmit` y `npx next lint` sin errores ni avisos.

## Decisiones del usuario, ya cerradas

| Decisión | Respuesta |
|---|---|
| Reproducción en release multipista | Cola completa con avance automático (ya implementado en RC.31) |
| Vídeos de YouTube | **Solo canal oficial verificado** del propio artista |
| Audio para las 17 pistas sin fuente | **Deezer** (con proxy por CORS) |
| Carátulas de los 3 releases sin artwork real | **Cover Art Archive** |
| Skill Ponytail | Sí, como skill **on-demand**, no como plugin |
| Skill Caveman | **No** — su propio benchmark dice +7% tokens y tiene niveles `wenyan` |
| Credencial de `README.md:167` | Se limpia el README; el usuario rota la contraseña. **Rotar no basta: el secreto sigue en el historial de git** |
