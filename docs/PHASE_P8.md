# FASE P8 — Una página por release

**Estado:** COMPLETADA (2026-10-04) — commits `cebc700` y `6baefc2`
**Reserva cerrada:** el diseño nuevo se revirtió en C1 (2026-10-04). Ver
"Lo pendiente — el usuario pidió revertir el diseño" abajo, que ahora es el
registro de lo que se hizo.
**Gate:** 1153/1153 tests · `tsc` limpio · lint sin avisos · a11y sin
violaciones nuevas

> **Por qué P8 y no P2.** Mismo criterío que P7: P1–P6 de la Fase P ya tenían
> otro significado. Ver `docs/PHASES.md`.

## El problema

Los dos niveles de página estaban al revés:

- `/releases/[id]` — **199 líneas**: sin reproductor ni métricas.
- `/track/[id]` — **535 líneas**: con todo.

Y `/track/[id]` y `/releases/[id]` eran **la misma página con dos plantillas**:
un single es fila de `tracks` **y** cabecera de release con el **mismo id**
(`getReleaseWithTracks` = `getTrackById` + `getTracksByReleaseId`, sin tabla
aparte). Dos URLs para un mismo contenido duplica el SEO, parte las métricas y
dejaba 535 líneas sin nada que las enlazara.

## La trampa del esquema

Un release es una fila de `tracks` con `release_id IS NULL`. **No hay forma de
distinguir un single de un álbum por el esquema**: la única señal es si tiene
hijas. De las 18 cabeceras, **6 son singles sin hijas**, así que la página tiene
que cubrir los dos casos o 6 quedan igual de vacías.

## El bug de la duración

`totalDuration` se calculaba como `sumDurations(childTracks.map(...))` sobre las
hijas. Con cero hijas eso da **0**: un release de un solo tema mostrando `0:00`
y "0 pistas" es exactamente lo que esta fase vino a cerrar.

Y el filtro de "no hay dato" **no puede ser un `isNaN`**: `sumDurations(["00:00"])`
parsea bien y devuelve `{seconds: 0, label: "0:00"}`. **`"00:00"` es el relleno
del seed, no un disco de cero segundos.** Se filtra el relleno, no el número.

## Las cuatro salidas de `/track/[id]`

| Caso | Qué hace |
|---|---|
| hija, padre existe | 301 al release del padre |
| fila sin padre | 301 a su **propio** release |
| hija cuyo padre **no** existe | `orphan`: ficha + aviso |
| el id no existe | 404 |

`release_id` **no es foreign key** (`lib/db.ts:218`, `release_id TEXT` pelado) y
la cascada que borra las hijas no siempre corre, así que el caso `orphan` es
alcanzable de verdad. Se renderiza **con aviso** en vez de 404 porque el
contenido existe y es reproducible: un 404 no distingue "no existe" de "me lo
borraron".

**Comprobar antes de redirigir**, no al revés: con `redirect()` en un Server
Component no hay query extra, y da un 404 que señala el recurso que el visitante
pidió, no el padre de otro.

## Un solo punto de play

Un componente, dos ramas, el mismo `data-testid`. Con hijas, la lista. Sin hijas,
la fila del single con el reproductor grande. **Misma precedencia de fuentes en
los dos casos**: los dos salen de `buildReleaseQueue`, que se **importa, no se
copia** — su comentario explica por qué: el contador "2/8" del reproductor
dejaría de decir la verdad.

Hay un test que cuenta que la página **no tiene ningún enlace a `/track/`**.

## Las hijas fuera de sitemap, prev/next y notificaciones

1. `app/sitemap.ts` — fuera las hijas, URLs a `/releases/`
2. prev/next — **el que más se resistió**, porque no estaba donde se suponía:
   `/releases/[id]` no tenía anterior/siguiente, estaba en `/track/[id]` sobre
   `getAllTracks()`, que mezcla cabeceras con hijas. Y `currentIndex` se calculaba
   sobre el array **sin filtrar**: quitar hijas después de indexar habría movido
   el vecino dos veces. Orden correcto: filtrar, indexar sobre la lista filtrada.
3. `NotificationBell.tsx` — dos arreglos: `release_id` gana a `track_id` (su
   `track_id` es el id del **padre**), y `track_liked`, que solo trae `trackId`,
   se resuelve con `resolveChildHref` + una consulta cacheada en un `ref`,
   **incluido el negativo**.
4. `ArtistTracksSection.tsx` ya apuntaba al release correcto.

## Por qué `parseTrack` sigue sin exportar

`lib/releases.ts` **compone** `getTrackById` + `getTracksByReleaseId`: 2
consultas donde bastaría 1, pero **una sola fuente de parseo**. Un `SELECT *`
reconstruido a mano para ~30 columnas divergiría del original — y divergiría el
nuevo, que es el que se ve en producción. El patrón roto de GAP-B era tener
*dos* fuentes: una decidía, otra ejecutaba.

## Accesibilidad

`ReleaseTrackList.tsx` tenía el mismo `aria-label="Reproducir"` en todas las
filas, botones de 32 px (por debajo del mínimo táctil de 36 px) y **sin anillo de
foco**. Corregido: 44 px, anillo visible, etiqueta con número y título. Un lector
de pantalla anunciaba once botones idénticos.

## Lo pendiente — el usuario pidió revertir el diseño → HECHO (C1)

> "el diseño de las páginas de release habíamos acordado que iba a ser basado en
> el diseño anterior, no este diseño nuevo; hace los demás datos inaccesibles"

**Decisión tomada (2026-10-03):** volver al diseño anterior, conservando solo las
mejoras de accesibilidad.

| Revierte | `app/releases/[id]/page.tsx`, `components/ReleaseTracklistSection.tsx` |
|---|---|
| **NO se toca** | `lib/releases.ts`, `app/track/[id]/page.tsx` — el 301 vive ahí |
| **NO se toca** | `lib/release-page.ts` — vive el fix de duración |
| **NO se toca** | `app/sitemap.ts`, `NotificationBell.tsx` |
| **A trasplantar** | anillos de foco, `aria-label` con número y título, 44 px |

El diseño anterior tiene **4 secciones** (Descripción, Pistas, Enlaces, Letra) y
el nuevo tiene **3**: un revert de layout es donde se cuela una sección sin
avisar, así que hace falta un test que compruebe las 4.

### Lo que se hizo (2026-10-04, commit `6baefc2`)

Todo el plan de la tabla se cumplió, y el test existe: bloque 6 de
`tests/unit/release-page.test.ts`, con las cuatro secciones, **en su orden**, con
su `aria-labelledby`, y sin inventar la que no tiene dato. Mutado tres veces
para comprobar que puede fallar.

Lo que **no** estaba en el plan y salió al hacerlo: el diseño anterior usaba
`getTrackById`, `childTracks.length` y `release.duration` en crudo, o sea que un
revert a pelo deshacía **cuatro arreglos de P2**. Se conservaron los seis
(`getReleaseWithTracks`, `ownDurationLabel`, `trackCount`, sección de pistas del
single sin hijas, `getReleaseNeighbours` y el `—` de las métricas). La tabla con
el porqué de cada uno está en el commit y en `docs/AI_LOG.md`.

**Y una consecuencia de P8 que el revert dejó a la vista**, escrita aquí porque es
de esta fase y no del revert: `/track/[id]` es 301 para **toda** fila (hija o
cabecera), así que su ficha —videoclip, galería, detalles de producción, bio,
descarga para prensa, Last.fm— **solo se renderiza para las huérfanas**. El
diseño de P2 tampoco mostraba nada de eso, así que no se perdió con el revert,
pero estaba perdido desde P8 y **es el mismo síntoma** que motivó la petición del
usuario.

## El diseño vuelve, pero el esqueleto de la ficha de pista (P8.1, 2026-10-06)

> "Las releases no se ven como antes, que se veían bien antes. Te paso capturas."

### Lo que se decidió, y lo que NO

La petición era recuperar el aspecto, y hay dos formas de confundirse aquí. La
primera es copiarse las capturas. La segunda es copiar **el diseño nuevo que se
revirtió en C1**, que ya se probó mal: era una sola columna, y por eso los datos
secundarios quedaban debajo de veinte pistas y había que scrollar para llegar a
ellos.

Lo que se hizo es **el esqueleto de `app/track/[id]/page.tsx`**, que es el que las
capturas muestran y el que nunca se toquesó:

- `max-w-6xl`, no `max-w-4xl`.
- Migas de pan arriba.
- Una **carta** con la portada a un lado (`lg:w-72`) y la ficha al otro, con
  `PageTransition` y `SlideIn`.
- Una **barra de hechos** al pie de la carta: Pistas, Discos, Duración.
- **Dos columnas**: contenido en `lg:col-span-2`, barra lateral en el otro tercio.

Y con el mismo criterio de antes, aplicado de forma simétrica:

- La portada a **tamaño de disco**, no de miniatura. La ficha de pista usa
  `sm:w-56` porque su protagonista es la canción; aquí el protagonista es el
  disco.
- Un álbum **no monta reproductor** en la carta. Su fila existe para agrupar y no
  tiene audio: montarlo era el botón de play que no hace nada.
- La barra lateral solo monta lo que **hay**: `Discos` no sale si hay uno, y
  `Enlaces Externos` no sale si no hay ninguno.

### La lógica no se tocó

Cada corrección de P2 sigue donde estaba, y ahora vive en otro sitio del árbol:

| Corrección | Dónde está ahora |
|---|---|
| `getReleaseWithTracks` | sigue siendo la fuente |
| `ownDurationLabel` con el filtro del `"00:00"` | idem, y además en la carta |
| `trackCount` (un single = 1 pista, no 0) | en la carta y en la barra de hechos |
| Sección de pistas del single sin hijas | idem, la `listedTracks` no cambió |
| `getReleaseNeighbours` | idem, ahora en la barra lateral |
| `—` de las métricas (`value === null`) | idem, con su `sr-only` |
| `showableVideo` para el `- Topic` | idem |
| Vídeo/ficha/galería solo si `isTrackRow` | idem |

El reproductor **no es una decisión de la página**: se monta `AudioPlayer` con la
fila y el componente ya resuelve preview → YouTube → altavoz apagado, porque su
`canPlay` pregunta "¿suena algo?" y no "¿tiene enlaces?".

### Los dos tests que hubo que tocar, y por qué

1. **`C1 · las cuatro secciones`**: el orden cambia porque enlaces y prensa pasan
   a la barra lateral, que en el DOM va después de la columna de contenido. Lo
   que **no** cambió y sigue fijando lo mismo: sección sin dato no se inventa,
   `aria-labelledby` presente, sección ausente sin pasar por presente.
2. **`itunes-previews.test.ts`, el check de la duración**: buscaba el literal
   `⏱️ {durationLabel}` en el fuente. Con el rediseño la duración vive en la línea
   de metadatos de la carta, junto a la fecha y al número de pistas. El check
   pedía un emoji, no una invariante; ahora exige lo que protege: que se pinte
   `durationLabel` y nunca `release.duration`.

Y uno nuevo: hubo que stubejar `IntersectionObserver` en
`tests/unit/release-page.test.ts`. `SlideIn` anima con `whileInView`, que es
framer-motion, y framer-motion construye ese observer al montar: sin el stub, los
**50** tests del fichero salían rojos por una API que jsdom no trae. Va en el
fichero y no en `setupFiles` global, porque tocar `vitest.config.ts` cambia el
comportamiento de los otros 66 ficheros.

### Verificado

`The Wall` (álbum, 20 pistas, 2 discos) y `Bohemian Rhapsody` (single) contra el
build de producción local, en claro y en oscuro, a 2048 / 1024 / 768 / 390 px:
portada cargada (600×600), reproductor real en el single ("Preview (30s)"),
métricas de verdad (`2.100.000 streams`, no un cero), `Discos` omitido cuando hay
uno, y **cero desbordamiento horizontal** en los cuatro anchos. Gates: `tsc` y
lint limpios, **1244/1244** tests.

**Cerrado en C1-bis** (`5ed5354`, 2026-10-04), que es donde se decidi: los bloques
de **pista** (videoclip, ficha de producción, galería) vuelven a la página de
release cuando la fila **es** una pista, y la descarga de dossier y rider —que es
**del artista**— se monta en los dos casos. De paso se arregló que la sección de
Enlaces no se montaba para 7 de los 9 singles: leía solo `external_links`, y sus
enlaces viven en `spotify_url`, `itunes_track_id` y `youtube_video_id`.

**Lo que queda de esta fase, sin decidir:** las **65 hijas de álbum** tienen su
vídeo (28 de ellas) pero **ninguna tiene ficha técnica** —la columna existe con
todos sus campos a `null`—, y de esos 28 vídeos **ninguno es `videoclip`**: son 11
`live` y 17 `topic_audio`. Redirigen a su padre y el padre no enseña sus datos.

Resuelto en C1-ter (2026-10-04) por el lado del código: `showableVideo()`
(`lib/release-page.ts`) decide qué vídeo puede enseñarse como el videoclip de una
pista, y `components/ReleaseVideoList.tsx` los lista en la página del álbum. Antes
**ninguna parte de la UI leía `video_kind`**.

**Y el dry-run dice que no se va a ver, y hay que decirlo porque es lo
importante.** `scripts/fetch-official-videos.ts --trust-allowlist` verifica los
**5 de 5** canales, pero de las 74 pistas que resuelve **ninguna** sale
`videoclip`: 21 `live`, 35 `topic_audio`. Y de las 55 que escribiría, 21 serían
directos de concierto —para "Eclipse", *"Eclipse (Live At The Deutschlandhalle,
Berlin 18 May 1972)"*—, lo que cambiaría la línea de tiempo del tracklist porque
`lib/audio-priority.ts` se apoya en `youtube_video_id`. **No aplicado, y no
reintentar sin un dato nuevo revisado a mano.**

## Verificación

De `cebc700` (P8):

- `tsc` limpio, lint sin avisos, **1146/1146** en 61 ficheros.
- a11y y axe extendidos a las rutas de P8: **0 violaciones nuevas**. Los dos
  `color-contrast` de `/track/[id]` son preexistentes.
- Comportamiento contra `next start`: hija → 307 al padre; `orphan` → 200 sin
  redirección; `sitemap.xml` con 0 URLs de `/track/`.
- **5 reversiones de arreglo, 5 tests rojos.** Los de `resolveTrackRoute` leen el
  **SQLite local de verdad**, no un doble: prueban que `parseTrack` expone
  `release_id`. Si esa columna deja de mapearse, el redirect se apaga en
  silencio y los tests lo detectan solos.

De `6baefc2` (C1, el revert):

- `tsc` limpio, lint sin avisos, **1153/1153** en 61 ficheros, build correcto.
- Visual a 375/768/1440, claro y oscuro: dentro de `main`, 0 targets táctiles
  <36 px, 0 botones con etiqueta genérica, 0 iconos sin `aria-hidden`, 0 enlaces
  a `/track/`, y el número de botones de play igual al número de pistas.
- Producción (despliegue automático tras el push): 200 en las tres rutas
  comprobadas, y la marca del diseño nuevo ausente (`blur-3xl` y el gradiente
  del hero a 0; el `data-testid` del sitio de play pasa de `div` a `section`).
- **3 mutaciones del test nuevo, 3/2/5 rojos.**
