# FASE P3 — Retro-resumen (completada)

**Período:** 2026-09-04 → 2026-09-23 · **Releases:** v4.0.0-alpha.2 → v4.0.0-rc.26+

## Lo construido
- Dashboard artista (stats, quick actions, actividad, tracks, dossier/rider, bio, shows, Last.fm, export).
- CRUD releases (single/EP/album) + edit page + iTunes/YouTube autofill + multi-track + timestamps + capítulos.
- CRUD shows + estados (13 valores unificados en `lib/show-status.ts`) + pagos + flyer + invitados + notas.
- Perfil artista + imágenes (upload R2→Blob) + hero público + lightbox + galería prensa CRUD.
- Approval workflow (draft/pending/approved/rejected) + admin panel + approvals page.
- Cuenta (email/pass/delete), dossier sync→artists, fechas UTC deterministas, updates optimistas anti-lag.
- Testing: 110 unit + matriz prod 50/50 + funcionales + headed + screenshots (gitignored).

## Decisiones arquitectónicas
- `artists` = canónico bio/press (sync desde dossiers, nunca al revés).
- Fechas SSR con `timeZone: UTC` pineado (anti-hidratación #425).
- Updates optimistas + re-fetch respaldo (Turso replica lag severo).
- Custom tools > MCP para DB (`database-query`); `gh` CLI > github MCP; Blob > R2 (sin tarjeta).
- Screenshots y `.env.local` nunca al repo; `download-center-fixed` y binarios sueltos eliminados.

## Las fotos de los artistas del catálogo (P3.1, 2026-10-06)

El usuario señaló que faltaban fotos de perfil y de banner. Lo que había era un
`scripts/apply-artist-images.ts` con una tabla curada a mano y un dry-run que
verificaba cada URL con `HEAD` + `content-type: image/*`.

### Lo que se aplicó

**Siete URLs con el host alias.** `thumb.wikimedia.org` es un alias de
`upload.wikimedia.org`: funciona, pero nadie lo había comprobado nunca, porque los
verificadores antiguos solo probaban `images.unsplash.com`. Las siete son **la
misma imagen con otro host**, ninguna cambia de fotografía, y quedan 0 alias en
producción.

**Cinco artistas con las dos imágenes.** Björk y David Bowie entraron con perfil
y banner; Pink Floyd, Radiohead y Kraftwerk, con perfil. Los **doce** artistas del
catálogo tienen ya las dos: la consulta de control devuelve `ok`/`ok` en las doce
filas.

- **Björk** — perfil 1000×1416 vertical, centrado y ocupando el encuadre, así que
  en el recorte circular se ven la cara y el tocado naranja. Banner panorámico de
  Verona (2538×1692) en el que ella es la figura blanca del centro.
- **David Bowie** — perfil de estudio en B/N, 1043×1033, cuadrado y con el sujeto
  centrado. Banner de 1280×720, la proporción exacta de la franja del hero.
- **Radiohead** — Thom Yorke de frente y con la cara visible en el Uber Arena
  (2025), con dos compañeros a los lados.
- **Kraftwerk** — las cuatro figuras con mono rojo y el "MACHINE" blanco sobre
  negro, en Genoa (2023). Al recortar a cuadrado el centro cae sobre la
  tipografía, que es lo único legible a 80 px.
- **Pink Floyd** — Live 8 (Londres, 2005), panorámica de 2048×896.

Los tres perfiles de banda se eligieron **mirando las fotos una a una**, no por la
puntuación del verificador —que ya había aceptado candidatas inservibles con 75—.
Las tres bandas entran con una foto de escenario y no con un retrato, porque en
Commons no hay retrato de grupo de una banda. Es una decisión documentada, y está
escrita en el script para que nadie la reabra creyendo que es un descuido.

### Los descartes que siguen en pie

| Descartado | Por qué |
|---|---|
| Las dos fotos de 2048×1536 de Pink Floyd y la de 1753×890 | Dejan a la banda diminuta en una franja baja, con la proyección del fondo ocupando el encuadre: en un círculo de 80 px sale luz morada y ningún cuerpo. |
| `Kraftwerk on stage.jpg` | Los dos músicos están en los extremos y el centro del encuadre es pared teal vacía, que es justo lo que ocupa el círculo. |
| `Stefan Pfaffe Kraftwerk live.jpg` y `Kraftwerk live.jpg` (Roskilde) | Son retratos de **una persona concreta** (Pfaffe, Ralf Hütter) por mucho que el título diga "Kraftwerk". Poner a un miembro suelto para representar a la banda es el mismo error que se documentó con Bowie. |
| La candidata de Bowie de 1974 | 1280×1280 con Bowie en el tercio derecho y el 40% izquierdo **negro puro**; el recorte circular centrado sale negro. Sigue siendo la razón por la que Bowie necesitó otra foto. |
| Los logotipos SVG de las bandas | Un wordmark al lado de los otros nueve artistas, que sí tienen fotografía, rompe la serie visual del catálogo. |

### Los tres fallos que casi se cuelan

**1. Una URL inventada.** La primera entrada de Björk daba **404**. El motivo: el
comentario del script que documentaba la URL estaba **truncado**, y al completarlo
desde memoria se inventó el final del nombre de fichero
(`..._1_electrum_%28Unsplash%29.jpg`). El fichero real es `..._1_edit.jpg`, y la
URL buena se volvió a sacar de `scripts/artist-image-candidates.ts`, que es la
herramienta que las busca. Lo detectó el **dry-run**, que es exactamente para lo que
está: ningún byte llegó a Turso.

**2. Dos nombres de fichero que no existen.** Al redactar el comentario que explica
por qué se elegía la toma `01` de Radiohead se citaron "Game_The_Orchestra" y
"Awkward" como candidatas descartadas. **No existen**: el informe numera las tomas
`01`, `02`, `09`, `13`, `26` y `32`. Un comentario no lo detecta ningún
verificador —solo se ve leyendo el diff— y deja escrito que se miraron fotos que
nadie miró.

**3. Un OK falso en la propia comprobación.** `naturalWidth > 0` parece suficiente
y no lo es: el tamaño intrínseco se conoce **tras la cabecera**, pero `complete`
solo lo es cuando el fichero entero ha descargado. Con solo `naturalWidth`, el
thumb de Kraftwerk (360 KB) salía en la captura como un **círculo gris** —el
`bg-slate-700` del contenedor, sin imagen— y la comprobación daba `OK` igualmente.
La condición correcta es `complete && naturalWidth > 0`, que es la que ya usan
`scripts/image-check.ts` y `scripts/rc30-track-regression.ts`, y que
`docs/ai-log/06-tranches-a-hoy.md` ya había documentado como falsa alarma
invertida.

El tercero es el más barato de los tres y el que más cuesta después: un `OK` en
verde es justo lo que hace que nadie mire la captura.

## Ficha de release (`app/releases/[id]/page.tsx`) — Parte A, B, C

### Qué se hizo
- **A**: `getReleaseNeighbours` eliminado (`lib/releases.ts` limpio); sin bloque `prev`/`next` en `app/releases/[id]/page.tsx`; test `tests/unit/release-page.test.ts` cubre la ausencia.
- **B**: `ProductionDetails` montado una sola vez en `aside`, debajo de `Enlaces Externos` (`page.tsx:602-615`), no en la columna principal.
- **C**: letra interactiva con `LyricsSection` (no `LyricsModal`, borrado en `0b5efa5`). Multipista: cada fila de `ReleaseTrackList` (`withLyrics`) lleva `TrackLyrics` (`aria-expanded`/`aria-controls`). Single: `LyricsSectionWrapper` debajo del listado (`isTrackRow`). Sin letra (`lyrics` es `null`/`""`/`"—"`) no se monta botón (`hasTrackLyrics` filtra).

### Por qué la etiqueta del tipo dice lo que dice la columna
`releaseTypeLabel` (`lib/release-page.ts`) devuelve lo que dice `release.release_type` (`album`/`ep`/`single` en minúsculas); no inventa `"EP"` sobre singles con hijas (`_hasChildren` ignorado a propósito). El badge coincide con la columna y con `generateMetadata`, evitando la contradicción de `2376240`.

### Letra interactiva usa `LyricsSection`
`LyricsModal` está muerto; el control real es `LyricsSection` (`components/LyricsSection.tsx`) montado por `LyricsSectionWrapper`. El estado `isOpen` es real (`useState` en `LyricsSection` y `TrackLyrics`); `aria-expanded` y `aria-controls` reflejan el mismo `isOpen`, y el panel usa `hidden={!isOpen}`. No hay estado paralelo.

---
## Deudas conocidas (origen de P4/P5)
- Approval con doble sistema (tracks.status vs submissions) sin unificar.
- `ITunesSearch` invisible al inicio; ownership releases por nombre; `PUT` pierde `type`; POST siempre `draft`.
- `computeDynamicStatus` volátil; `ShowStatus | string` anula tipos; `BookingModule.ShowDate` muerto.
- `searchTracks`/`TrackFilters` muertos; sin search global ni sort.
- Social: solo 4 plataformas, sin UI de gestión.
- Suscriptor: solo tabla; register fuerza artist; prefs sin UI; borrado deja FKs; `deleted_at` no bloquea login.
- Notifs: sin bell/panel/polling; email solo manual; sin fan-out ni broadcast.
- Seed demo insuficiente (4 singles + 2 albums, 0 EP/B-sides).
- Sin carruseles; header sin search/bell/avatar; portada mejorable.
- **Fotos de artistas**: los 12 tienen perfil y banner; no queda ningún `NULL`.
  Queda una deuda de **licencia, no de imagen**: las fotos son CC BY / CC BY-SA y
  la atribución vive solo en el campo `creditos` de
  `scripts/apply-artist-images.ts`. La app no muestra crédito ni en la ficha ni en
  el lightbox, que es lo que piden esas licencias. Y los tres avatares de banda son
  fotos de escenario, no retratos: es una decisión documentada, pero es lo primero
  que conviene revisar si mañana entran bandas nuevas.

---

## RC.35 · Consolidar el reproductor en `AudioPlayer` (y por qué el commit se rompió)

El commit `4592bd3` quitó `StemsPlayer` y `LyricsModal` y dejó **un solo**
reproductor. La decisión era correcta; la implementación no. Este es el
registro de lo que estaba roto y de las dos decisiones que no son obvias.

### Qué se consolidó

`StemsPlayer` y `LyricsModal` se borraron, y las filas de `ReleaseTrackList` y
la tarjeta de `EPKCard` pasan a hablar con el mismo `AudioPlayer` y el mismo
`AudioPlayerContext`. La cola de un lanzamiento se construye con
`buildReleaseQueue` (`components/ReleaseTrackList.tsx:75-113`) en los dos sitios:
una sola fuente de verdad, porque dos copias de esa construcción acaban
divergiendo y la tarjeta dice "4 pistas" mientras la lista pone 3.

### Por qué el álbum sin audio no lleva botón

**Un álbum cuyas hijas no tienen fuente no pinta NINGÚN control**, solo la
frase *"Ninguna de sus pistas tiene audio disponible"*.

La asimetría con la fila suelta no es capricho: son dos problemas que se
arreglan en sitios distintos.

| Caso | Qué se pinta | Por qué |
|------|--------------|---------|
| Fila suelta sin preview ni vídeo | Botón **apagado** con altavoz + "No hay audio disponible" | El problema es **esta fila**; el control explica qué le pasa |
| Lanzamiento con hijas, ninguna reproducible | **Ningún botón** + "Ninguna de sus pistas tiene audio disponible" | No hay fila que explicar: hay pistas que subir |

Un botón apagado en el segundo caso diría "no hay audio" sobre un disco que sí
tiene pistas, y además daría a entender que arreglarlo es cosa del botón. El
dato que separa los dos casos es `hasChildren`, y se pasa como prop en vez de
ramificar en `EPKCard`: el markup del control es uno solo, y duplicarlo en la
tarjeta es exactamente cómo dos copias del mismo icono acabaron divergiendo
antes (ver el comentario de `MutedSpeakerIcon`).

### El bug de fondo: `canPlay` ignoraba la cola

`canPlay` se preguntaba **solo** sobre `track`. Para un álbum, `track` es la
fila **cabecera**, que por definición no tiene audio propio —su
`audio_preview_url` es el `"—"` truthy que deja `lib/db.ts`—, así que salía
`false` con la cola llena de pistas reproducibles. Resultado: la tarjeta de
*OK Computer* pintaba "No hay audio disponible" sobre un disco que sí suena.
Tumbó 6 tests que ya existían.

La regla que sale de ahí: **lo que va a sonar es la cola o la fila, y hay que
preguntarlo a la cola**. Ahora es
`playsQueue || (track ? hasPlayableSource(track) : isUsableAudioUrl(src))`, y el
orden importa: la cola manda cuando viene informada, y `track`/`src` siguen
mandando cuando no — que es el caso single, y el que localizan los 20 specs E2E
con el selector exacto `button[aria-label="Reproducir"]`. Por eso el
`aria-label` largo ("Reproducir 2 pistas de OK Computer") **solo** se usa en el
caso de la cola.

### Dos bugs más que salieron al arreglar el primero

**Pausa que reiniciaba el disco.** La fila cabecera no aparece nunca en su
propia cola: lo que suena es una hija, con otro `id`. Comparando solo ids, la
tarjeta del álbum se quedaba en "Reproducir" mientras su cola sonaba, y el
segundo clic no pausaba: volvía a llamar a `playQueue` y **reiniciaba el álbum
desde la pista 1**. Ahora, con cola, basta con que la pista en curso sea *una*
de las de la cola.

**Etiqueta de fuente que mentía.** Una pista con Spotify (prioridad 90) +
`youtube_video_id` (50) y sin preview se anunciaba como "Spotify" mientras
sonaba el vídeo — Spotify no suena nunca. `resolvePlayingLabel` sale de
`getPlayableAudioSource`, o sea de la **misma predicate** que decide si hay
botón, para que la etiqueta y el botón no puedan discrepar. Vive en
`lib/audio-priority.ts` y no en el componente porque ese módulo es puro a
propósito: así se testea sin DOM.

### Por qué los tests verifican el fallo al revertir

Los tres ficheros que este commit añadió —
`release-player-unified`, `epk-card-unified` y `stems-dead-code` — tenían **9
tests que eran literalmente `expect(true).toBe(true)`**. No comprobaban nada.
Son exactamente la razón por la que el commit parecía verde mientras seis tests
de verdad estaban en rojo, y por la que un reintroducir `StemsPlayer` con un
import y sin montarlo en ninguna vista no habría roto la build.

Un test que no falla al revertir su arreglo no protege de nada. Por eso los 25
que hay ahora se escribieron mirando lo que rompen, y se comprobaron uno a uno
revirtiendo el arreglo:

| Se revierte | Se ponen rojos |
|------------|---------------|
| `canPlay` vuelve a ignorar la cola | 12 tests (4 de cada fichero) |
| Se vuelve a pintar el botón con la cola muda | 2 (los dos "ningún botón") |
| `resolvePlayingLabel` vuelve a `primarySource.label` | 2 (los dos de Spotify) |
| Se quita la detección de "la pista en curso es de mi cola" | 1 (el de pausa) |
| `EPKCard` deja de construir la cola y solo reenvía `queue` | 4 (los que no le pasan `queue`) |
| Se recrea `components/StemsPlayer.tsx` | 1 (`stems-dead-code`) |
| Alguien importa `LyricsModal` en cualquier sitio | 1 (`stems-dead-code`) |

Ese `4` de la cuarta fila del reproductor es el que más cuesta de ver a ojo:
`buildReleaseQueue` filtrando las hijas mudas y el contador "2 pistas" sobre una
cola de 3. Los tests lo pasan **sin** la prop `queue` a propósito, para que no
puedan pasar igual con la construcción rota.
