# Plan RC.33 - catalogo real, una pagina por lanzamiento y metricas con fuente

> Documento de fase y **contrato entre subagentes**. Cada agente recibe de aqui
> la lista exacta de ficheros que posee.

## Regla de oro

**Ningun fichero puede estar en dos agentes.** Lo que necesites de otro stream se
consume por la API que ese agente publica aqui. Si el contrato no esta escrito,
primero se escribe.

Los commits los hace el orquestador. Y **stagear con rutas explicitas, nunca por
directorio**: en RC.31 un `git add app components lib.` se trago
`middleware.ts` (que esta en la raiz) y dejo el S0 a medias en produccion media
hora.

## Regla de modelos

`space-bunny-free` para todo subagente que lea codigo. `mimo-v2.6-flash-free`
**no** se usa como subagente de implementacion: en RC.31 compacto en bucle
(99% -> 1% -> 99%) sin avanzar. Solo para lecturas de un solo comando.

## Origen de la fase

El encargo fueron 14 peticiones y 4 problemas reportados con capturas. **Cinco de
las catorce no eran features ausentes**: eran bugs de contrato, bugs de datos o
decisiones documentadas que se habían reversesin querer. El resto del plan sale
de verificar cada punto contra el codigo y no de aceptarlo.

La propia investigacion cambio el diseno dos veces: el criterio de verificacion de
canales de YouTube se demostro incorrecto (fallaba 5/5 sobre canales oficiales) y
la fuente de metricas paso de ser "no hay dato" a "tenemos 20 veces mas dato del
que inventamos".

---

# Veredictos de la investigacion

| # | Peticion | Veredicto | Evidencia |
|---|----------|-----------|-----------|
| 1 | Quitar "Enviar musica" | Sin razon valida: enlaza a `/submissions`, tu portal, sin relacion con el release que miras | `components/ReleaseActions.tsx:114` |
| 2 | Play de multipista + quitar aviso | **Bug autoinfligido**: un boton tachado *desactivado* mas el aviso, y debajo el boton que si funciona | `components/EPKCard.tsx:400-411`, `:414`, `:425` |
| 3 | Quitar "Catalogo de artistas" | Duplicado del header. Lo anadio RC.32 al quitar "Enviar musica" | `app/dashboard/page.tsx:523-528` |
| 4 | Rellenar datos de artistas | El bloqueo real es que **el admin no tiene los campos de imagen** en su formulario | `app/admin/page.tsx:1252-1412` |
| 5 | Admin edita seed? | Si, pero partido: la API si, la UI no. **Y hay un agujero de autorizacion** | `app/api/tracks/[id]/route.ts:65` |
| 6 | Quitar badge "Multipista" | Sin etiqueta accesible y redundante con "Escuchar 12 pistas" | `components/EPKCard.tsx:300-304` |
| 7 | Quitar Dossier/Rider al invitado | Correcto: hoy son 6 celdas muertas deshabilitadas | `components/CatalogDownloadButton.tsx:185` |
| 8 | Verificar como suscriptor | Tarea de QA, la rama ya existe | `app/dashboard/page.tsx:325-433` |
| 9+10 | Migrar lanzamientos / quitar fichas | **Un solo trabajo.** El esquema no distingue single de album | ver seccion siguiente |
| 11 | Tarjetas de artista nombre+foto | Hoy **no tienen foto**: 5 campos de texto | `components/ArtistsCatalog.tsx:39-61` |
| 12 | Texto sobre redes | No existe, solo un `ariaLabel` | `app/artists/[id]/page.tsx:136-145` |
| 13 | Vercel MCP | Resuelto: `teams: []` -> 2 proyectos visibles | `vercel_list_teams` |
| 14 | Rotar contrasena | **~35 ficheros la tienen hardcodeada**; el orden es obligatorio | ver Ola 9 |
| P1 | Shows con dos badges | Causa exacta: la funcion existe pero el dashboard no la invoca | `app/api/shows/route.ts:70-80` |
| P2 | Carrusel de 4 releases | **Nunca existio** y se borro a proposito | `lib/carousel.ts:1-17` |
| P3 | Metricas inventadas | Dos semillas distintas; y "0" no se distingue de "sin dato" | `scripts/seed-influential-catalog.ts:655,708` |
| P4 | Espaciado vertical | 32px exactos entre la descripcion y "Ordenar por" | `app/dashboard/page.tsx:810` |

---

# El problema estructural: dos niveles de pagina al reves

| | `/releases/[id]` | `/track/[id]` |
|---|---|---|
| Lineas | 199 | 535 |
| Reproductor | **ninguno** | si |
| Metricas, letra, video | no | si |
| Ficha de produccion, prensa | no | si |
| Lista de pistas | solo si tiene hijas | - |

La peticion 9 ("poner el mismo diseno de detalle de pista en la de lanzamiento") es
**copiar el diseno de la buena a la pobre**.

**La trampa del esquema.** No hay tabla `releases`: un release es una fila de
`tracks` con `release_id IS NULL`. Eso hace que **un single y un album sean
indistinguibles**: la unica senal es si tiene hijas (`app/track/[id]/page.tsx:90`).
De las 18 cabeceras, **6 son singles sin hijas** (`trk-001`..`trk-006`, `Heroes`,
`Ashes to Ashes`, `The Model`). La pagina de release tiene que cubrir los dos
casos: con hijas -> tracklist + cola; sin hijas -> la fila **es** la pista.

**Bug verificado en produccion** (es la captura de "In the Flesh?"): la ficha de
una pista hija enlaza a `/releases/<su propio id>` en vez del padre
(`app/track/[id]/page.tsx:195` usa `track.id` donde deberia usar `track.release_id`).
Esa pagina no tiene lista de pistas ni boton.

---

# Hallazgo de datos que reordena el plan

## Last.fm: hay mas dato real del que inventamos

`lib/lastfm.ts:148` (`track.getInfo`) ya devuelve `playcount` y `listeners`. Nunca
se uso para metricas; `getTopAlbums` se desconecto en Fase E *porque la UI nunca
leyo el resultado*.

| Pista | Last.fm real | Listeners |
|---|---|---|
| Radiohead - Karma Police | **44.258.884** | 3.375.499 |
| Radiohead - Paranoid Android | **28.419.960** | 2.512.865 |
| Pink Floyd - Money | **15.740.854** | 1.859.315 |
| Bjork - Army of Me | **10.048.458** | 1.234.764 |

Comparacion: **Queen esta en 2.100.000 inventados** (`seed-f9-catalog.ts:68`). Los
datos reales son **5 a 20 veces mayores** que la cifra inventada.

**Dos correcciones a la cadena pedida:**

1. El ultimo escalon **no es `0`, es "sin dato"**. Mostrar 0 *afirma* "nadie ha
   escuchado esto", que es falso, y es exactamente el bug reportado. El precedente
   ya existe en `app/track/[id]/page.tsx:230-231`, que muestra "—".
2. **Las fuentes no se suman en la misma columna.** 44M de scrobbles y 2,1M de
   streams son magnitudes distintas. Etiquetar por fuente y agregar hijas solo
   dentro de la misma fuente.

```
1. tracks.metrics   (JSON curado; se conserva aunque sea inventado)
2. YouTube viewCount (ya integrado)
3. Last.fm playcount (NUEVO, real, por pista, con etiqueta)
4. "—"               (omitir, nunca 0)
+ albumes = suma de las hijas DENTRO de la misma fuente
```

## YouTube: el criterio de verificacion estaba mal

`verifyOfficialChannel` (`lib/youtube.ts:659`) exige que el canal enlace a su
sitio oficial **en la descripcion**. Fallo **5/5** sobre canales oficialmente
oficiales: `dominiosEnDesc=[]` en Pink Floyd, Radiohead, Bjork, Bowie y
Kraftwerk. Radiohead tiene la descripcion **vacia (0 caracteres)**.

El heuristico funciona para un artista indie que escribe su web en la bio y falla
para una majors que no la escribe. Se optimizo para el seed y fallo contra el
mundo real.

**Diseno nuevo: allowlist curada + verificacion estructural.** El ID viene de una
lista versionada y auditable, y el script verifica lo que la API si puede
verificar. Es mas honesto: no fingimos que la API prueba la oficialidad;
registramos que alguien la afirno y que la maquina confirmo el resto.

### Los 5 canales, verificados

| Artista | ID | Videos |
|---|---|---|
| Pink Floyd | `UCY2qt3dw2TQJxvBrDiYGHdQ` | 1337 |
| David Bowie | `UC8YgWcDKi1rLbQ1OtrOHeDw` | 417 |
| Radiohead | `UCq19-LqvG35A-30oyAiPiqA` | 203 |
| Bjork | `UCFbRdRGijPR4oBjQ0fVCSmw` | 151 |
| Kraftwerk | `UCkVewSfjK_M059iV88kYgiw` | 11 |

4 de 5 se resolvieron por `forHandle` al mismo ID que dio el usuario. Bowie no
resuelve por handle pero su ID existe.

### El canal `- Topic`: donde esta realmente el audio

`/releases` **no es una playlist**: no tiene ID publico. Es un shelf que YouTube
puebla con videos de **otro canal**:

| Canal | ID | Videos | Subs |
|---|---|---|---|
| `Radiohead - Topic` | `UCr_iyUANcn9OX_yy9piYoLw` | 352 | - |
| `PINK FLOYD - Topic` | `UCO6LS_5W7vqG9mALDNzSFug` | 772 | - |
| `Kraftwerk - Topic` | `UCNUkEFnPvPsWtzftcd45t1A` | 359 | 7.380 |

El canal humano que dio el usuario (165.000 subs, 11 videos) es correcto y esta
bien. Pero **el audio de su catalogo esta en el canal `- Topic`**, y ahi hay
material que el proyecto llevaba semanas buscando:

```
Tour de France (Etape 1) (2009 Remaster)   <- dado por imposible desde RC.30
Computerwelt (2009 Remaster) - Techno Pop (2009 Remaster)
Boing Boom Tschak (2009 Remaster) - Autobahn - Prologue
```

89 videos en el shelf frente a 11 en `uploads`. Todos `embeddable=True`,
`madeForKids=False`.

Un canal `- Topic` **no es un candidato de buscador**: lo genera el sistema de
derechos de YouTube, lo nombra `<artista> - Topic`, y aparece en el `/releases` del
canal oficial del propio artista. **Tres evidencias estructurales** donde mi
criterio de descripcion fallaba.

Emparejamiento por titulo verificado (muestras): `Paranoid Android`, `Time`,
`Money`, `Comfortably Numb`, `Another Brick in the Wall, Pt. 2` — **todos exactos**.

**Ningun MCP hace falta.** `forHandle` resuelve handle -> channelId con la API
oficial (demostrado). `search.list` esta topado a 100 llamadas/dia y sus
candidatos no son atribuibles: un MCP envuelve la misma API y hereda esos limites,
metiendo el canal que el buscador estima relevante con su catalogo y sus
suscriptores, y nada en el resultado pareceria un error.

### Tres trampas del muestreo

1. El playlist trae **duplicados** ("You And Whose Army?" aparece dos veces) ->
   dedupe por `videoId`.
2. El nombre del canal cambia de caja ("PINK FLOYD - Topic" vs "Radiohead - Topic")
   -> busqueda case-insensitive.
3. Sufijos que contaminan ("Fake Plastic Trees (Acoustic Version)", "(2009
   Remaster)", "(Etape 1)") -> normalizar parentesis antes de comparar.

## El discernimiento de "Live": clasificar, no recortar

Las palabras clave del usuario ("Video oficial", "Video", "Official Video",
"Official Music Video") **ya estan implementadas**: `VIDEO_DECORATION_WORDS`
(`lib/youtube.ts:760-770`) ya contiene `official`, `video`, `music`, `audio`,
`lyrics`, `visualizer`, `hd`, `hq`, y `stripVideoDecorations` (`:784`) recorta
`"Song (Official Video)"`, `"Song | Official Music Video"`, `"Official Video -
Song"`.

Falta **`live`** (0 coincidencias). Y metido en la misma lista seria un error: si se
recorta como el resto, un directo de 12 minutos pasaria por el tema de estudio de
8:20 y **la duracion declarada por la ficha seria una mentira silenciosa**.

Dos tratamientos opuestos:

| Palabra | Tratamiento | Razon |
|---|---|---|
| `official`, `video`, `music`, `audio` | **recortar** | No aportan nada con el canal ya verificado |
| `live` + variantes | **clasificar** (`video_kind='live'`) | Es carga semantica: significa que **no** es el tema del disco |

```
SHOWCASE:    videoclip -> live -> topic_audio
REPRODUCCION: videoclip -> topic_audio
               (live excluido: no es el tema del lanzamiento)
```

Riesgo de falso positivo medido: **0 de 83 pistas** contienen "live" o "video" como
palabra. Y estructuralmente esta contenido: el recorte solo actua dentro de
segmentos delimitados por `|`, `()`, `[]` o una cabeza decorada antes de un guion.
Un tema llamado "Video Games" nunca entra por esa puerta.

## Bug de autorizacion encontrado (no pedido)

`PATCH /api/tracks/[id]` (`app/api/tracks/[id]/route.ts:65`) acepta `admin` **o**
`artist` y **no comprueba ownership**: cualquier artista autenticado puede
reescribir letra, ficha de produccion, galeria o `track_number` de **cualquier**
pista por id. El comentario del propio fichero (`:20-25`) dice que el ownership es
"la unica fuente fiable" y luego no lo usa.

---

# Olas de ejecucion

## Ola 0 - Seguridad (PRIMERO, no depende de nada)

**Fichero**: `app/api/tracks/[id]/route.ts`, `tests/unit/*`

Cerrar el agujero: `artist` debe aportar prueba de propiedad de la pista, igual que
hace `PUT /api/releases` (`app/api/releases/route.ts:679-683`). `tracks` se
relaciona con `artists` **por nombre**, no por FK, asi que la comprobacion va por
`sameArtistName` (`lib/db.ts:2139`).

## Ola 1 - EPKCard y limpieza del dashboard

**Fichero**: `components/EPKCard.tsx`, `components/ReleaseActions.tsx`,
`app/dashboard/page.tsx`

- Sustituir el bloque `isReleaseParent` (`:398-448`) por **un solo control**: el
  boton de cola, que ya funciona. Fuera el boton tachado (`:400-411`) y el aviso
  "Este lanzamiento no tiene audio propio" (`:414`).
- Fuera el badge "Multipista" (`:300-304`).
- Fuera "Enviar musica" (`ReleaseActions.tsx:114`).
- Fuera "Catalogo de artistas" del dashboard (`:523-528`).
- Espaciado P4: el unico margen entre la descripcion del catalogo y "Ordenar por" es
  el `mb-8` del `<section>` (`:810`).
- **Test que falla al revertir**: una tarjeta de album con hijas debe tener exactamente
  un control de audio y ningun texto de "no tiene audio".

## Ola 2 - Admin: campos de imagen y redes

**Fichero**: `app/admin/page.tsx`, `app/api/artists/[id]/route.ts`

Anadir `profile_image`, `banner_image` y `social_links` al formulario de artista.
`PUT /api/artists/[id]` ya los acepta (`lib/db.ts:1585-1588`); lo que falta es que
el body del admin los mande (`app/admin/page.tsx:1263-1272`).

**Desbloquea la peticion 4 de raiz**: sin esto, las fotos solo se pueden poner con
scripts.

## Ola 3 - Last.fm como fuente de metricas

**Ficheros**: `types/music.ts`, `lib/db.ts`, `components/EPKCard.tsx`,
`components/UnifiedMetrics.tsx` (o el equivalente), `lib/aggregate-metrics.ts` (nuevo)

- `Metrics` pasa a distinguir `null` (sin dato) de `0`. Hoy `parseMetrics`
  (`lib/db.ts:585-586`) colapsa `NULL` a ceros, y por eso la API nunca puede
  distinguir "no hay dato" de "el dato es 0".
- Fuente de metricas con etiqueta: `iTunes` / `YouTube` / `Last.fm`.
- Agregacion de hijas **dentro de la misma fuente**, reutilizando la logica que ya
  existe en `app/api/artist-catalog/route.ts:152`.
- Los inventados **se conservan** (peticion explicita del usuario). Si no se pueden
  reemplazar por datos reales, no se borran.
- Sin dato -> "—", nunca 0.

## Ola 4 - Videos oficiales

**Ficheros**: `lib/youtube.ts`, `types/music.ts`, `lib/turso.ts`, `lib/db.ts`,
`scripts/fetch-official-videos.ts`, `tests/unit/official-videos.test.ts`

- Nueva columna `tracks.video_kind` con tres valores: `videoclip` | `live` |
  `topic_audio`.
- Allowlist curada de los 5 canales humanos, en version control y auditable.
- Autodescubrimiento del canal `<artista> - Topic` por patron, case-insensitive.
- Verificacion estructural: el ID resuelve, el titulo coincide, el canal es publico
  y el video embebible.
- `live` se **clasifica**, no se recorta.
- Dedupe por `videoId`; normalizacion de parentesis y mayusculas.
- Dos rutas: play (videoclip -> topic_audio) y showcase (los tres).
- **Dry-run por defecto con informe de revision** antes de `--apply`.

## Ola 5 - Estados de show

**Ficheros**: `lib/show-status.ts` (nuevo `lib/show-dynamic-status.ts`),
`app/api/shows/route.ts`, `app/api/dashboard/route.ts`, `components/ShowsBooking.tsx`

- `computeDynamicStatus` (`app/api/shows/route.ts:70-80`) pasa a lib compartida y
  se aplica **también** en `/api/dashboard`, que hoy devuelve el `status` crudo
  (`:224-237`).
- Los dos badges contradictores se concilian en un solo lugar.
- El badge "se elimina en 48h" es una **mentira**: `app/api/shows/cleanup/route.ts:83`
  hace un `DELETE` real pero **nadie lo llama** (no hay `vercel.json`, ni cron, ni
  invocacion). Decision: cablear un cron o quitar el badge. Su corte ademas es por
  dia completo, no 48h.

## Ola 6 - Artistas, redes y descargas

**Ficheros**: `components/ArtistsCatalog.tsx`, `app/artists/[id]/page.tsx`,
`components/ArtistSocialLinks.tsx`, `components/CatalogDownloadButton.tsx`

- Tarjeta de artista: solo nombre + `profile_image`. Hoy no tiene foto.
- Anadir texto visible encima del grupo de redes (hoy solo hay `ariaLabel`).
- Descargas: sin `artistId`, **solo la fila Catálogo**. Hoy son 6 celdas muertas.
- Arreglar la fuga de la ficha de artista: `app/artists/[id]/page.tsx:161-165` pasa
  `artist.id` a `DownloadCenter` aunque el visitante sea anonimo, asi que las 9
  celdas salen habilitadas para cualquiera.

## Ola 7 - Carrusel de releases

**Ficheros**: `lib/carousel.ts`, `components/carousel/*`, nuevo consumidor,
`app/dashboard/page.tsx`

Carrusel horizontal de **4 releases por pagina**, revirtiendo la decision escrita en
`lib/carousel.ts:1-17` y `components/ArtistTracksSection.tsx:107-111`. Los 5
primitivos Embla ya existen y son reutilizables tal cual.

## Ola 8 - Fotos de perfil y banners

**Ficheros**: `scripts/artist-image-candidates.ts`, `scripts/apply-artist-images.ts`

Wikimedia Commons, **sin Unsplash** (Unsplash generaba retratos creibles de bandas
que no tienen nada que ver, que es como se colaron las 9 caratulas falsas). Arreglar
el host `thumb.wikimedia.org` de Nirvana, alias historico que nadie ha verificado.

## Ola 9 - Credenciales (AL FINAL DE TODO, menos la ultima ola)

**Ficheros**: ~35 (10 scripts + 12 specs E2E + helpers)

1. Anadir `TEST_ARTIST_EMAIL` / `TEST_ARTIST_PASSWORD` / `TEST_ADMIN_EMAIL` /
   `TEST_ADMIN_PASSWORD` a `.env.example` y `.env.local`.
2. `playwright.config.ts` **no carga `.env.local`** hoy: cargar `dotenv` (ya es
   dependencia, `package.json`).
3. Helper compartido `tests/e2e/credentials.ts` y `scripts/lib/credentials.ts`.
   Precedente ya existente: `scripts/verify-tabs-icons.cjs:15-16` usa
   `process.env.ADMIN_EMAIL || "admin@epk.local"`.
4. **Verificar 800/800 verdes** antes de tocar la contraseña.
5. Rotar las 3 credenciales.
6. `git filter-repo` + `push --force`. Solo el usuario tiene el repo abierto.

## Ola 10 - Una pagina por release (LA GRANDE, AL FINAL)

**Ficheros**: `app/releases/[id]/page.tsx`, `app/track/[id]/page.tsx`,
`components/ReleaseTracklistSection.tsx`, `components/ArtistTracksSection.tsx`,
`components/NotificationBell.tsx`, `app/sitemap.ts`, `app/api/artist-catalog/route.ts`,
`app/dashboard/page.tsx`, tests

- Una pagina por release con el diseno de `app/track/[id]/page.tsx`.
- Los **6 singles sin hijas** reproducen su propia pista.
- Corregir el enlace roto (`app/track/[id]/page.tsx:195`): usar `release_id`.
- `/track/<hija>` -> redirigir a `/releases/<padre>`.
- Sacar las hijas del sitemap (`app/sitemap.ts:37` no filtra por `release_id` y las
  indexa), del prev/next (`:502,518`) y de las notificaciones
  (`NotificationBell.tsx:113`).
- Regresion visual en **5 breakpoints**.

---

# QA manual

Verificar la rama de suscriptor creando una cuenta (**autorizado por el usuario,
escribe filas en produccion**). Ramas: `app/dashboard/page.tsx:325-433` y
`/submissions`. **Borrar la cuenta al terminar.**

---

# Gates

- `npx tsc --noEmit`
- `npx next lint` sin avisos
- `npx vitest run --no-file-parallelism` (800 tests)
- `npx tsx scripts/turso-check.ts`
- Regresion visual en 5 breakpoints contra produccion
- Dry-run de los scripts de datos revisado antes de cada `--apply`

---

# Deuda que esta fase NO cierra

- `/api/sync` sigue deshabilitado (410). La portabilidad local a Turso sigue sin
  sustituto.
- `vitest` en paralelo no es viable con un route handler que carga modulo nativo.
- La discrepancia de ano de *Tour de France* (2003 en el seed vs remaster 2009) es
  **dato, no codigo**.
- `PATCH /api/tracks/[id]` se arregla, pero la relacion `tracks` <-> `artists` por
  nombre en vez de FK sigue siendo la fragilidad de fondo.