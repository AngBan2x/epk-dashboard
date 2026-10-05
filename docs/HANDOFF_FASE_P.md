# HANDOFF — sesión del 2026-10-03

**Estado al cerrar esta sesión:** `main` en `a451b4d` + los 3 commits de este
handoff. **1146/1146 tests** (hoy: **1170/1170**), `tsc` limpio, lint sin avisos, `pnpm build`
correcto. Producción desplegada y verificada.

> **Actualizado el 2026-10-04.** `main` está ahora en `5ed5354` (+ lo que se
> añada después): **C1 y C1-bis están hechas** y los tests son **1170/1170**. El
> resto del documento sigue valiendo; los números que se contaban a mano se
> refrescan con el comando al lado, porque se desfasan solos.

Este es **el** documento de arranque. Si solo vas a leer uno, lee este.

---

## 1. Arranque en 6 comandos

Copia-pega literal. **Node 24** (`v24.19.0`): el binario de `better-sqlite3`
está compilado para ABI 137 y el Node 22 ya no sirve.

```bash
node -v                                  # debe decir v24
pnpm dev                                 # servidor en :3000
npx tsc --noEmit                         # debe salir limpio
npx next lint                            # debe salir sin avisos
npx vitest run --no-file-parallelism     # 1170/1170, ~70-180 s
```

**`--no-file-parallelism` NO es opcional.** Sin él el reciclado de workers
dispara una aserción nativa de teardown de V8
(`node::RemoveEnvironmentCleanupHook`, `(env) != nullptr`) y el run muere con
`ERR_IPC_CHANNEL_CLOSED`. **No es un test rojo**: los 1146 pasan. Es un problema
de infraestructura de test, no de producto.

**No ejecutes `pnpm install` ni `pnpm rebuild`**: destruyen el binario y no hay
prebuild para Node 24.

Después de arrancar: `docs/PHASES.md` para el índice de fases.

---

## 2. Las 3 invariantes que se rompen en silencio

Estas cuestan un día cada una si alguien las toca sin saber qué son. Están
detalladas en `AGENTS.md`; aquí van por si solo llegaste a este fichero.

### 2.1 `vitest.config.ts:7-8` — los dos `delete`

```ts
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
```

**NO los borres.** Parecen higiene de test y no lo son. Bajo vitest el env está
ausente, así que `isTursoEnabled()` es falso y los **83 guards
`if (isTursoConfigured()) return;` nunca saltan**: están muertos. Si se restaura
el env, cualquier import mal resuelto pasa de latente a destructivo, y el fallo
sería **verde**. Si alguna vez hay que tocar ese fichero, verifica los conteos con
`scripts/turso-check.ts` antes y después.

### 2.2 Una sola fuente de verdad para decidir el backend

Ramificar sobre **`getTursoClientSync() !== null`**, nunca sobre
`isTursoConfigured()`. El primero lee `process.env` en tiempo de llamada; el
segundo captura un snapshot al importar el módulo. Con el env llegando tarde, el
primero decía "turso" y el segundo `null`, la ruta lanzaba y respondía **500**.

El handle local (`getLocalDb()` para leer, `getLocalDbWrite()` para escribir) se
abre **solo en el brazo sin cliente**, nunca antes.

### 2.3 `/track/[id]` es un shim de 301

Un single es fila de `tracks` **y** cabecera de release con el **mismo id**. Las
dos rutas eran la misma página con dos plantillas. Ya solo queda una.

**`"00:00"` es el relleno del seed, no un disco de cero segundos.**
`sumDurations` lo parsea bien y devuelve `{seconds: 0}`, así que **ningún
`isNaN` salta**: el filtro compara contra el relleno.

---

## 3. Los 10 puntos de trabajo abiertos

Ordenados por dependencia, no por número. **C1 y C2 son independientes de C3.**

### C1 · Revertir el diseño de la página de release ← HECHA 2026-10-04

Commit `6baefc2`. **Lo que pidió el usuario, hecho**: el diseño acordado es el
anterior, con sus **cuatro** secciones a la vista.

Volvieron a `cebc700~1` `app/releases/[id]/page.tsx` (464 → 431) y
`components/ReleaseTracklistSection.tsx` (524 → 130). No se tocaron
`lib/releases.ts`, `app/track/[id]/page.tsx`, `lib/release-page.ts`,
`app/sitemap.ts` ni `NotificationBell.tsx`.

**No se revirtió nada que no sea maquetación**, y eso era lo difícil: el diseño
anterior usaba `getTrackById`, `childTracks.length` y `release.duration` en
crudo, o sea que un revert a pelo deshacía cuatro arreglos de P2. Se conservan
`getReleaseWithTracks`, `ownDurationLabel`, `trackCount`, la sección de pistas
para el single sin hijas, `getReleaseNeighbours` y el `—` de las métricas. La
tabla de los seis, con el porqué, está en el commit y en `AI_LOG.md`.

Del diseño nuevo se trasplantó lo que es a11y y no diseño: los botones de 44 px,
el anillo de foco y el `aria-label` con número y título de
`ReleaseTrackList.tsx` (**no** se revirtió ese fichero). Y dos cosas que el
revert dejó al descubierto en ese mismo componente: `aria-hidden` en los cuatro
iconos, y el filtro del relleno `"00:00"` en la columna de duración.

**El test de las 4 secciones** es el bloque 6 de `tests/unit/release-page.test.ts`:
las cuatro, **en su orden**, con su `aria-labelledby`, y sin inventar la que no
tiene dato. Mira los `<h2>`, no el `textContent`: `Descripción` es subcadena de
`Descripción del álbum`. **Mutado tres veces** para comprobar que puede fallar
(3 / 2 / 5 rojos).

#### Tres cosas que el revert destapó y que quedan abiertas

1. ~~**`/track/[id]` es 301 para toda fila**~~ → **CERRADO en C1-bis** (abajo).
   La ficha solo se renderizaba para las huérfanas y sus bloques no estaban en la
   página de release: el videoclip, la ficha de producción, la galería y **la
   descarga de dossier y rider** no tenían ninguna página donde estar.
2. **Las métricas de los 5 álbumes son un 0 curado** en Turso
   (`{"streams":0,...}` en la cabecera), así que la página dice "0 reproducciones
   del lanzamiento". `EPKCard` dice lo mismo. **Es un bug de datos**, no de
   código: limpiar la columna de los álbumes que solo tienen ceros, con dry-run y
   aprobación.
3. **`components/ReleaseActions.tsx`**: sus tres enlaces sin anillo de foco.
   Preexistente en los dos diseños; no se mezcló en el commit del revert.

### C1-bis · La ficha de una pista vuelve a la página ← HECHA 2026-10-04

Commit `5ed5354`. Cierra el punto 1 de arriba, y de paso un agujero que era mayor
de lo que parecía: **la sección de Enlaces no se montaba para 7 de los 9 singles**
(la condición era `Object.keys(external_links).length > 0` y sus enlaces viven en
`spotify_url`, `itunes_track_id` y `youtube_video_id`), y **no había ninguna forma
de bajar el dossier o el rider** desde una ficha, porque la única página que lo
montaba con `artist_id` era el 301.

Vuelve, **solo cuando la fila es una pista** (`!isMultiTrack`): Videoclip Oficial,
Ficha de Producción y Galería de prensa. La **Ficha técnica para prensa** se
monta en los dos casos, porque es del **artista**. Y los enlaces son ahora la
unión de `external_links` + las columnas de la fila, con `""` y `"—"` tratados
como ausencia y un enlace por plataforma.

**Ojo con dos cosas si se toca ese test:**

- **`tests/unit/release-page.test.ts` tiene que mockear `@/lib/db` entero.** La
  página ahora importa `getArtistByName` de ahí, y eso carga `better-sqlite3`: un
  módulo nativo. Al descargar el worker el run muere con la aserción
  `node::RemoveEnvironmentCleanupHook` y `ERR_IPC_CHANNEL_CLOSED` — el proceso,
  no un test. Es el escenario que describe AGENTS.md para el paralelismo, aquí
  disparado por una ruta.
- **El guard de las 4 secciones mira `section[aria-labelledby]`, no todos los
  `<h2>`.** Los bloques de ficha traen su propio `<h2>` dentro, y un guard que
  cuenta cabeceras de terceros se rompe solo un día sin avisar.

### C1-ter · Los vídeos de las hijas ← HECHA 2026-10-04, y con una corrección

**La cifra que yo di estaba mal y hay que leerla antes que el resto.** Dije "65
hijas con ficha técnica". **Falso**, y era un error de filtro: conté
`production_details NOT IN ('','{}')`, que responde "¿la columna está rellena?",
no "¿tiene información?". Las 65 tienen `{"daw":null,"guitars":null,…}`: **todos
los campos a `null`**, comprobado campo a campo con `json_extract`. **No hay
ninguna hoja de créditos que enseñar.** La sección que iba a diseñar era diseño
para un conjunto vacío.

Lo que sí tienen es vídeo: **28 hijas con `youtube_video_id`**, y el dato que lo
gira todo:

| `video_kind` | Qué es | Catálogo |
|---|---|---|
| `videoclip` | canal humano verificado del artista | **0** |
| `live` | directo: no es la pista del lanzamiento | 11 |
| `topic_audio` | canal `- Topic` autogenerado | 17 + 1 cabecera |
| `null` | no se sabe | 9 cabeceras (los singles) |

**`video_kind` no lo leía nadie**: `grep video_kind app components` salía vacío.
La columna se escribió, se migró y se documentó con su tabla de tres valores, y
ninguna regla de render la consultaba. Nada impedía enseñar un `- Topic` de Pink
Floyd como "Videoclip Oficial".

**Lo hecho:** `showableVideo()` en `lib/release-page.ts` (una sola fuente para las
dos ramas) y `components/ReleaseVideoList.tsx`, un Server Component con miniatura
y enlace. **La sección no se monta en producción y es lo correcto**: con 0
`videoclip`, `showableVideo` devuelve `null` para las 28.

**El camino para que se vea, y la respuesta es que NO se ve.** Dry-run hecho
(2026-10-04):

```bash
npx tsx scripts/fetch-official-videos.ts --channels --trust-allowlist        # 5 u
npx tsx scripts/fetch-official-videos.ts --trust-allowlist --pages=30        # 86 u
```

**La puerta funciona: 5 de 5 canales verificados.** Pero los kinds que salen son
**21 `live`, 35 `topic_audio` y 0 `videoclip`** — igual que antes. Las 18 pistas
"sin kind" son las de los 7 artistas que no están en la allowlist, que el script
ni toca.

Y el motivo del no: **21 escrituras serían `live`, y el vídeo elegido para
varias es un directo de concierto.** Para "Eclipse" (trk-09f2889b) sale
*"Eclipse (Live At The Deutschlandhalle, Berlin 18 May 1972)"*. Como
`lib/audio-priority.ts` usa `youtube_video_id` para la línea de tiempo del
tracklist, eso **no es una etiqueta: es cambiar lo que se escucha al recorrer el
disco**. `--route=playback` deja 34 escrituras, todas `topic_audio`, y también
cero `videoclip`: no hay ruta que compense.

**Conclusión: estos cinco artistas no tienen videoclip oficial en su canal
verificado.** Hay directos y audios de `- Topic`. `ReleaseVideoList` se queda
vacía y no es un bug. **No reintentar sin un dato nuevo que revisar a mano.**

## C2 · Un solo patrón para reproducir — HECHA 2026-10-05

**Decisión:** `Reproducir • <fuente>`, en las tarjetas y en el reproductor.

El álbum decía `Escuchar N pistas`; la pista suelta decía
`Reproducir • Preview (30s)`. Dos nombres para la misma acción en la misma
tarjeta, y el visitante no sabía si eran el mismo control.

Ahora el álbum dice `Reproducir • N pistas` — el mismo patrón que ya escribía
`AudioPlayer.tsx:260`, donde `<fuente>` son las N hijas. **"Escuchar"
desaparece.**

El `aria-label` del botón NO cambia (`Reproducir N pistas de <título>`): ahí sí
cuenta quién reproduce y qué, y lo localizan los tests E2E.

**El cuarto rótulo se queda:** `Ninguna de sus pistas tiene audio disponible`
("Heroes" y "Vulnicura Strings"). No es una etiqueta de control, es información.

**Verificado en producción:** David Bowie → `Reproducir • 2 pistas`. Cero
`Escuchar N pistas` en las 6 fichas de artista revisadas. Björk y Bowie muestran
además la frase honesta.

**Tres tests nuevos, porque ninguno de los dos patrones estaba atado:**
`AudioPlayer` no tenía ni un test sobre su etiqueta, y el del álbum miraba la
palabra que C2 retira. Revertido el label: 3 de 10 se ponen rojos.

## C3 · Un solo botón en el formulario de edición — HECHA 2026-10-05

**Decisión:** un botón principal cuya etiqueta **es** la consecuencia. El
secundario desaparece.

| Estado | Etiqueta | Efecto |
|---|---|---|
| `borrador` | **Publicar** | entra en revisión |
| `aprobado` | **Actualizar publicación** | sigue publicado |
| `pendiente` / `rechazado` | **Enviar para revisión** | entra en revisión |

`primaryLabel` y `primaryIntent` son la misma tabla partida en dos, y un test ata
que no se contradigan. Con dos botones eran dos tablas: podía salir "Actualizar
publicación" con una intención `request`, o sea **despublicar con un botón que
dice lo contrario**.

El botón sigue siendo `type="submit"` a propósito: los cuatro `required` del
formulario dependen de la validación nativa, que un `type="button"` se saltaría.

**Lo que se pierde, escrito para que no se lea como descuido:** el secundario era
el **único** camino del artista para retirar del catálogo un release aprobado. Ya
no existe desde aquí; queda el del admin (`POST /api/admin/approvals/[id]` →
`rejected`), más lento y con motivo escrito. Con él se cae también el
`window.confirm` que lo protegía: no se eliminó un cuidado, es que la combinación
que lo disparaba ya no es alcanzable.

**Verificado en producción:** `approved → ["Actualizar publicación"]`. Un solo
submit, cero rastro de "retira del catálogo", y la ayuda de estado coherente.

## C4 · Vocabulario de show: 6 elegibles + 2 derivados — HECHA 2026-10-05

**Decisión:** el vocabulario se cierra.

| | Estados |
|---|---|
| **Elegibles (6)** | `proximamente` · `confirmado` · `activo` · `pospuesto` · `cancelado` · `suspendido` |
| **Derivados (2)** | `hoy` · `pasado` — los pone `computeDynamicStatus` |

**Lo que estaba:** el estado estaba declarado **cuatro veces** y nadie lo
comprobaba.

| Dónde | Qué declaraba |
|---|---|
| `types/music.ts` | 13 literales |
| `lib/show-status.ts` | los 13 + 7 alias legacy **+ `\| string`** |
| `components/BookingModule.tsx` | 10, que no coincidían con ninguna |
| `app/api/shows/route.ts` | `z.enum` de 13, en POST y en PUT |

El `| string` era lo que lo hacía inútil: `ShowStatus` no restringía nada, así que
un estado inventado pasaba por TypeScript. Y el `z.enum` —que sí restringía, a
13— era la única defensa real: **el backend aceptaba `finalizado` y `en_venta`
mientras el compilador decía que no podían existir.**

**Retirados por redundantes:** `finalizado` (= `pasado`), `en_venta` /
`disponible` (= `activo`, tres nombres para un estado), `agotado` (inventario de
entradas, no ciclo de vida: con `ticket_url` null no hay entradas y con
`approved` false no hay venta — los dos datos ya existen) y `reprogramado` (=
`pospuesto` + nueva fecha).

**Comprobado contra Turso antes de tocar nada (2026-10-05):** `shows` tiene **1
fila** y su estado es `proximamente`. Ningún retirado tenía un solo registro, así
que la poda no mueve nada de la base.

**Lo que cambia de verdad:**
- `lib/show-status.ts` ya no **redeclara** `ShowStatus`: importa el de
  `types/music`, y su `| string` desaparece.
- `computeDynamicStatus` devuelve `ShowStatus` de verdad. Se fueron los **5**
  `as ShowStatus` que quedaban (4 en `/api/shows`, 1 en `withDynamicStatus`).
- `lib/db.ts` estrecha con `toShowStatus()` en vez de castear, y **avisa por
  consola** si el valor no está en el vocabulario. Un dato raro visible en el log
  es mejor que uno tipado como si fuera bueno.
- El **filtro** de `/shows` ofrece los 8, no los 6: un show del pasado se
  muestra como "Pasado", y sin la opción sería visible pero imposible de buscar.
  El formulario son 6 porque no se eligen; el filtro son 8 porque se buscan.
- `ShowCover`: 20 gradientes → 8. Los 12 sobrantes no los generaba nadie.

**Verificado en producción:** el filtro devuelve `["Todos","Próximamente",
"Confirmado","Activo","Pospuesto","Cancelado","Suspendido","Hoy","Pasado"]`, y
**cero avisos de `show-status`** en consola (que es la prueba de que ninguna fila
traía un valor raro).

## El helper que hizo falta: `sinComentarios()`

Apareció **tres veces** en este lote, y por eso quedó en
`tests/unit/show-status-vocabulary.test.ts` en vez de copiado test a test.

Un `expect(src).not.toContain("en_venta")` cuenta **cualquier cadena** del
fichero, y los comentarios que *documentan* lo que se retiró citan exactamente lo
que se retiró — que es lo que tienen que hacer para que el cambio se entienda.
Los dos primeros casosFallaron en C3 (mi comentario citaba `type="submit"`), el
tercero en C4 (el de `lib/db.ts` citaba `as ShowStatus`).

Un comentario no es código. La comparación va sobre el código sin comentarios, y
el que no se pueda comprobar con una aserción textual se comprueba estructural:
la clase CSS del botón que se eliminó, el JSX desde `<form`, no el fichero.

## Lo que NO se hizo

- **C9** (reescritura del historial con `filter-repo`): queda fuera, y no por
  descuido. Es destructiva, hace `force-push`, y tú la marcaste como "la última y
  no urgente". Con el fichero de path inválido (`P7bis`) sigue en la historia,
  así que además no funcionaría en Windows hasta quitarlo con
  `node scripts/git/rewrite-invalid-path.js`.
- **Las 5 métricas de los 5 álbumes** (siguen a 0 curado, y `lib/metrics-source.ts`
  dice "hay dato" porque el objeto existe): es una **escritura en producción** y
  va con su propio dry-run y tu OK, no colada aquí.
### C5 · Fotos de perfil — HECHA 2026-10-05 (el no era el que creías)

**Lo que encontré al ejecutar el dry-run:** 10 escrituras, y **4 de ellas eran
precisamente las que la ficha de C5 decía que no se quería** — el perfil de Björk,
el de Bowie y el banner de Bowie. Las candidatas seguían en la tabla `CURATED`
después de que se decidiera dejarlas fuera, así que un `--apply` cualquiera las
habría escrito sin preguntar.

Un dry-run que propone lo que no se quiere es peor que no tener dry-run, porque
enseña a no leerlo. Las entradas salen de la tabla; el motivo y las URLs quedan
en un comentario, con el código de 4 líneas para recuperarlas.

### Las dos fotos, miradas una a una

**David Bowie — confirmado que no funciona.** 1280×1280, Bowie en el tercio
derecho y el **40 % izquierdo negro puro**. El recorte circular centrado —que es
como se pinta el avatar— sale negro con una franja de traje blanco. Como banner
tampoco: es cuadrada. Ni perfil ni banner, y no es una pena.

**Björk — sí funcionaría.** 1000×1416, portrait, **centrada y ocupando el
encuadre**: en círculo funciona, con la cara y el tocado naranja. Es una foto de
escenario con grano, pero el contraste es real. Se queda fuera por decisión del
usuario, **no por calidad**, y ahora se sabe por escrito para que la decisión no
se pierda. Si cambias de idea, es una entrada de 4 líneas y un dry-run.

**Los otros tres sí están en la tabla y siguen sin avatar, a propósito:** Pink
Floyd, Radiohead y Kraftwerk no tienen retrato de grupo utilizable en Commons,
solo fotos de escenario. El degradado de `ArtistHero` hace de avatar, que es
mejor que un recorte malo.

**Lo que NO se ha escrito:** las 7 canonicalizaciones de host
(`thumb.wikimedia.org` → `upload.wikimedia.org`) que propone el dry-run. Son **la
misma imagen** y el alias funciona, así que es cosmético y no se ha tocado la
base.

### C6 · Cuenta de suscriptor de pruebas — HECHA 2026-10-05

**Lo que faltaba:** 0 cuentas suscriptor en producción. Seven artistas, un admin,
nadie que pueda ejercitar suscripciones, notificaciones, preferencias de email ni
el broadcast — que es la parte más grande de la superficie sin cubrir.

**Lo hecho:**

1. `scripts/lib/credentials.ts` admite el rol `subscriber`
   (`TEST_SUBSCRIBER_EMAIL` / `TEST_SUBSCRIBER_PASSWORD`), con la regla de P7
   intacta: **la contraseña no tiene default**, el correo sí (`subscriber@epk.local`
   es un dominio inventado, como `admin@epk.local`).
2. `.env.example` documenta las dos variables **sin valor**.
3. `.env.local` (que está en `.gitignore`) tiene la contraseña: 32 caracteres
   aleatorios, **nunca impresa, nunca commiteada**.
4. `scripts/create-test-subscriber.ts`: dry-run por defecto, `--apply` para
   escribir, y **comprueba si el correo ya existe antes** — con `INSERT OR
   REPLACE` y un id nuevo, un segundo seed crearía un duplicado.
5. **Una fila en `users`** en Turso, rol `subscriber`.

**Verificado en producción:** login 200, `rol: subscriber`, la cabecera muestra
"Suscriptor de pruebas (subscriber)", y el ciclo de suscripción funciona de
punta a punta: `Suscribirse` → `Suscrito`, y al abrir la baja aparece la
confirmación con `Confirmar baja` / `Mantener suscripción`.

**La suscripción se queda** (1 fila, al primer artista del catálogo): un suscriptor
sin suscripciones no puede probar el fan-out, que es justo lo que la cuenta existe
para cubrir. `/api/subscriptions` devuelve 1, `/api/notifications` 0.

### El fallo que cometí aquí, y que casi es el de P7

La primera ejecución de los tests **imprimió la contraseña real** en el fallo de
una aserción: `ENV_KEYS` en `tests/unit/credentials.test.ts` limpia
`TEST_ARTIST_*` y `TEST_ADMIN_*` antes de importar el helper, y no conocía el rol
nuevo. Como `credentials.ts` hace `dotenv.config()` en su propio cuerpo, la
variable se repoblaba desde `.env.local` y el test comparaba contra la clave de
verdad.

Arreglado, y el comentario del `ENV_KEYS` dice ahora que **el rol nuevo tiene que
entrar ahí el mismo día que se crea**, con el motivo. Era la contraseña: ahí
sugerida: `expected 'eBCFf7pa4V6…' to be ''` — o sea, el test cuya misión es que
"ninguna contraseña tiene default" estaba leyendo una contraseña real.

## La cuarta vez con lo mismo, y por eso el helper es compartido

`tests/helpers/strip-comments.ts` sustituye a la copia local que tenía
`show-status-vocabulary.test.ts`. Documenta los cuatro casos (C3 ×2, C4, C5) y
su **límite exacto**: en `apply-artist-images.ts` hay un `console.log` con el
texto `content-type image/*`, y ese `/*` no es un comentario, así que el stripper
se come un trozo. Por eso los tests **recortan** lo que comparan en vez de mirar
el fichero entero: un recorte acota el daño de un stripper que no entiende
strings.

### C8 · Renumeración de fases ← ya hecho, no repetir

Las subfases de RC.33 se renumeraron a **P7–P10**. La numeración P1–P6 **ya
estaba ocupada**. Ver `docs/PHASES.md`. **No las renumeres otra vez.**

### C9 · Reescritura del historial ← a medias, y no es lo más urgente

Los pasos 1 a 3 **ya están hechos**: contraseñas rotadas en la app y
propagadas a `.env.local`, y los seeds leen del entorno (P7). Falta el paso 4.

> **Lo que queda en la historia es un valor MUERTO.** Las contraseñas ya no
> sirven para nada, así que la reescritura no es urgente por seguridad de
> acceso: es defensa en profundidad y, sobre todo, **PII** (el correo). El orden
> correcto es seguir con los 8 puntos de trabajo y hacer esto cuando haya sitio.

**Tres cosas que la sesión anterior descubrió probándolas, no suponiéndolas:**

**1. El repo tiene un path INVÁLIDO que rompe las dos herramientas.**
`Directrices del Proyecto Final.md:Zone.Identifier` — un **flujo de datos
alternativo de NTFS** (la marca que Windows pone a lo descargado de internet)
commiteado como fichero. En NTFS el `:` no es válido, y:
- `filter-repo` → `fatal: invalid path` dentro de **`fast-import`**, al leer el
  flujo, antes de que el filtro pueda verlo (por eso `--path --invert-paths` no
  sirve)
- `filter-branch` → `Could not initialize the index` (hace checkout)

Afecta a **16 de los 342 commits** (de los cuales solo **2 lo tocan**: el bootstrap
que lo añadió y `6952683` que lo borró); en HEAD no está. **Mientras siga ahí,
ninguna reescritura funciona en Windows.** Los scripts para quitarlo están en el
repo.

**2. El `OSError: [Errno 22]` de `filter-repo` NO es el blob, ni el tamaño, ni
los espacios.** Se descartó cada hipótesis con un probe:
- probe con el blob exacto de `pnpm-lock.yaml` (199 KB) → **pasa**
- probe con un repo de 78 MB → **pasa**
- clon en una ruta **sin espacios** → **falla igual**

Sin diagnóstico útil, se hizo con plumbing.

**3. Los TAGS son una puerta trasera.** Hay 61 en el momento de escribir esto
(`git tag | wc -l`), y cada uno apunta a un commit concreto. **Aunque limpies
`main`, un tag devuelve el historial viejo con la credencial.** Hay que
reescribirlos uno a uno.

> **Vuelve a mirar el número, no lo des por bueno.** Estas cifras se
> desfasaron solas dos veces en una tarde: al añadir commits, el conteo de
> commits y el de tags cambian. Los números de este documento son una foto del
> momento de escribirlo, y por eso los que importan llevan el comando al lado.

**El orden correcto:**

```bash
git clone --mirror . ../epk-respaldo.git          # backup PRIMERO
node scripts/git/rewrite-invalid-path.js          # quita el path inválido
node scripts/git/purge-history.js main            # purga la credencial
node scripts/git/purge-history.js refs/tags/v4.0.0-rc.33   # x58
git reflog expire --expire=now --all && git gc --prune=now --force
git push --force-with-lease origin main
git push --force origin 'refs/tags/*'
```

**La verificación buena NO es "los tests pasan".** Eso no distingue una
reescritura correcta de una que perdió medio repositorio. Es comprobar que **cada
commit viejo y su reescrito difieran SOLO en lo esperado**; el comando está
escrito en `docs/ROTACION_CREDENCIALES.md` §4.0.

Guía completa: `docs/ROTACION_CREDENCIALES.md`. Ya tiene el orden de los tags y
el aviso de no borrar los tags del remoto antes de subir los reescritos (las
releases se rompen).

### C10 · Un fallo propio que dejó el working tree sucio ← ya corregido

`git filter-branch` **falló a medias** y dejó el `working tree` del repo
principal con un `pnpm-lock.yaml` **viejo** (bajaba `@libsql/client` a ^0.14 y
eliminaba `bcryptjs` y `@vercel/blob`). No se detectó por `git status` hasta
después, y un `git commit -a` lo habría subido.

**La lección:** una herramienta de reescritura que falla **no es inocua** aunque
diga que no ha escrito nada. Después de usarla, `git checkout -- .` sobre los
ficheros que no deben haber cambiado, y comprobar las dependencias
críticas del lockfile. Está corregido en esta sesión.

---

## 4. Estado real de producción

Consultado por SQL directo (MCP de Turso), que es la fuente de verdad.

| Dato | Valor |
|---|---|
| tracks / artistas / shows | **83 / 12 / 2** |
| usuarios por rol | 7 artist · 1 admin · **0 subscriber** |
| vídeos con `video_kind` | **29 de 74** (14 "parecidos" retenidos) |
| canales oficiales | 5 |
| banners / fotos de perfil | 3 / **0** |
| portadas iTunes / Unsplash | 65 / 0 |
| huérfanas / datos de QA | 0 / 0 |
| `suggestions` | tabla creada, 0 filas |

**`npx tsx scripts/turso-check.ts`** es el script que verifica todo esto. Corre
como fuente de verdad, no las lecturas de API: la réplica va retrasada.

---

## 5. Los cinco fallos propios de esta sesión

Se escriben porque son el tipo de cosa que se repite si no queda constancia.

**1. Un commit salió verde con la mitad de la API sin publicar.** El commit de
P10 dejó `app/api/suggestions/[id]/route.ts` **sin trackear**, y con ella el
PATCH que el propio panel de admin necesita. Se cerró con un commit aparte y
explícito. **Un commit no se da por bueno porque los tests pasen**: hay que
mirar `git status` después.

**2. El test que protegía las credenciales las metía de vuelta en el repo.**
Usaba las cadenas reales como centinela. **El guard que protege del secreto lo
metía en el repo para poder comprobarlo.** Corregido, y después **mutado el
código para verificar que el test se pone rojo**: con un default colado salen 3
rojos.

**3. La consola de PowerShell muestra `?` por CJK y por U+FFFD.** Dos veces
"vi" ficheros rotos que estaban perfectamente, y casi los "arreglé".
Verificar **contra los codepoints**, no contra la consola:

```powershell
[regex]::Matches([System.IO.File]::ReadAllText($f), "[\u4E00-\u9FFF\uFFFD]")
```

Y ojo: `Select-String` con el patrón `[\u4E00-\u9FFF]` **no encuentra nada en
silencio**, porque `\uXXXX` no existe en el regex de PowerShell. Un patrón de
búsqueda que no busca es peor que uno que falla.

**4. Una herramienta que falla no es inocua.** `git filter-branch` falló con
`Could not initialize the index` y **dejó el working tree a medias**, con un
`pnpm-lock.yaml` viejo que bajaba dependencias. No lo detectó `git status` hasta
después, y un `git commit -a` lo habría subido. **Detalle en C10.**

**5. Descarta hipotesis con probes, no con suposiciones.** Se perdio casi una hora
creyendo que el fallo de ilter-repo era el blob, luego el tamano del repo,
luego los espacios en el path. **Las tres eran falsas**, y cada una se comprobó
con un repo mínimo que pasaba sin problema. Un probe que demuestra que algo **no**
es la causa vale tanto como uno que lo demuestra.

---

## 6. Convenciones que no se deducen del código

- **Stagear con rutas explícitas.** `git add app components lib` una vez se tragó
  `middleware.ts` en RC.31.
- **Ningún fichero en dos agentes a la vez.** Los commits los hace el orquestador.
- **Ninguna escritura en producción sin dry-run revisado**, y con la lista de
  descartes a la vista. Es lo que se aplicó con las fotos: se autorizaron 13 y se
  aplicaron 3.
- **Nada de secretos en logs, en errores ni en prompts.** PII tampoco: correos y
  mensajes de usuario no salen.
- **Conventional commits**: `feat:`, `fix:`, `docs:`.
- **Nunca quitar los TODO** de los documentos de fase.
- **Verificar que un test falla al revertir el arreglo.** Un check que siempre
  pasa no protege de nada, y RC.32–33 gastaron una release entera por eso.

---

## 7. Los otros handoffs

`docs/handoffs/` tiene 14 ficheros, escritos en momentos distintos del proyecto.
**Este los sustituye a efectos de arranque.** Los demás siguen siendo el registro
de lo que se decidió en su momento; no los borres.

Si necesitas el historial de una iteración concreta, está en `docs/AI_LOG.md` y
en los tags de Git (`v4.0.0-rc.33` es el estado de este handoff).
