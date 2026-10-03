# PHASE P8 — Una página por release

**Estado:** COMPLETADA CON RESERVA (2026-10-03) — commit `cebc700`
**Reserva abierta:** el usuario pidió (2026-10-03) **revertir el diseño nuevo**
y volver al anterior. Ver "Lo pendiente" abajo.
**Gate:** 1146/1146 tests · `tsc` limpio · lint sin avisos · a11y y axe sin
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

## Lo pendiente — el usuario pidió revertir el diseño

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

## Verificación

- `tsc` limpio, lint sin avisos, **1146/1146** en 61 ficheros.
- a11y y axe extendidos a las rutas de P8: **0 violaciones nuevas**. Los dos
  `color-contrast` de `/track/[id]` son preexistentes.
- Comportamiento contra `next start`: hija → 307 al padre; `orphan` → 200 sin
  redirección; `sitemap.xml` con 0 URLs de `/track/`.
- **5 reversiones de arreglo, 5 tests rojos.** Los de `resolveTrackRoute` leen el
  **SQLite local de verdad**, no un doble: prueban que `parseTrack` expone
  `release_id`. Si esa columna deja de mapearse, el redirect se apaga en
  silencio y los tests lo detectan solos.