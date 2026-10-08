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
