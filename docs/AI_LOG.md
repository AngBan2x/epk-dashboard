# AI_LOG — índice

> Antes eran 7.000+ líneas en un solo fichero, ilegibles por inspección humana.
> C7 (2026-10-05) lo troceó por época en `docs/ai-log/`. **No se borró nada:**
> el texto de cada sección está íntegro en el fichero de su época.

> Las entradas de un mismo bloque se leen en orden. Las que no llevan fecha en
> el título (continuaciones como "Verificación" o "Pendientes") se quedaron
> con la entrega a la que pertenecen en lugar de abrir un bloque propio.

## La cabecera del fichero antiguo

Lo único que no está en los ficheros de época es la cabecera del `AI_LOG.md`
original. Era esto, literal:

```markdown
# AI_LOG.md — Bitácora de Desarrollo con IA

Registro de la orquestación técnica con herramientas de IA generativa para el
proyecto EPK Dashboard Musical.
```

Se conserva aquí para que la comprobacion de "no se perdió nada" incluya también
esas dos líneas, y no solo las 125 secciones.

## `docs/ai-log/01-f0-f9.md`

**F0–F9 · la construcción, de la base al dossier** — 10 entradas.

- Fase F0: Setup & Auditoría Inicial
- Fase F1: Capa de Datos & Tipado
- Fase F2: Componente EPK Core
- Fase F3: Dashboard & Vistas
- Fase F4: Integración Turso & Sync
- Fase F5: Testing E2E & Accesibilidad
- Fase F6: Despliegue & Entrega
- Fase F7: Engine Multimedia, iTunes API & Assets
- Fase F8: Pipeline Audiovisual & Multi-Track Stems
- Fase F9: Animaciones Pitch Deck & Exportación Dossier EPK

## `docs/ai-log/02-refactor-fases-a-l.md`

**Refactor integral, fases A–L y v3.10** — 19 entradas.

- Refactorización Integral UI/UX & Nuevos Módulos Profesionales
- Resumen Técnico del Proyecto
- Reorganización Documental + Plan Extendido Fases A-G
- Fase A: Cimientos (Corregir lo roto)
- Fase B: Auth + Usuarios
- Comando /fase + Diversificación de Modelos
- Fase C: Upload de Artistas + Autocomplete
- Fase D: Likes + Notificaciones
- Fase E: Métricas + Webhooks
- Fase F: UI/UX Final
- Fase G: Fix Crítico + Branding PressPlay
- Fase H: Verificación Final
- Resumen Final del Proyecto PressPlay
- Fase I: Skills + Agents para Fixes Críticos
- Fase J: Fixes Críticos
- Fase K — Fixes UI/UX + BioSection Per-Artist
- Fase L: Fixes Auth + UI + RBAC + Shows & Booking (v3.5.0)
- Fix: Vercel Deploy Error — better-sqlite3 bundled for client
- Fix: Vercel Prerender Error — useAuth SSR-safe

## `docs/ai-log/03-hotfixes-y-sesiones.md`

**v3.10–v3.11 · hotfixes, sesiones y auditoría de P3** — 5 entradas.

- Fix: Dark Mode Consistency + iTunes→Apple Music Branding (v3.10.0)
- v3.10.1 — Track Page: SVG + Spacing + Icon Colors
- v3.10.2 — Visual Tester: Proactive Detection + Cross-Page Consistency
- v3.10.3 — Auth Fixes: Session Cookies + Likes Counting
- v3.11.0 — Fase P1.8: Setup para Fase P Profesional

## `docs/ai-log/04-v4-alpha-beta.md`

**v4.0.0 alpha/beta · E2E, CORS y correcciones** — 36 entradas.

- v4.0.0-alpha.1 — P2: Foundation (DB + Landing + Header)
- v4.0.0-alpha.2 — P3: Artist Self-Management
- Bugfix: Landing Page — Rediseño Visual (Planeado, no ejecutado)
- Bugfix: 5 Fixes Post-P3
- Bugfix: Profile Save 500 + Audio Player + Visualizer
- Sesión: Configuración del Ecosistema OpenCode + Análisis de Bugs
- Sesión: Migración de Agentes a opencode.json
- Sesión: Fix MCP Servers + visual-tester Vision
- Sesión: Fix SQLite MCP Argument
- Sesión: Fix 5 Bugs Activos
- Sesión: Testing Visual + Fix Double Header Global
- Bug Fixes: Visualizer, Releases Auth, Turso Schema
- Cambio de Modelo Principal + Sistema Automático de Análisis de Imágenes
- Fixes de Producción: Cover Image + Release Type + Dark Mode + Auto YouTube Thumbnail
- Sesion: Audio Player Stress Testing + EPKCard Bug Fix
- Sesión: 19-Issue Comprehensive Fix + Stress Test Verification
- Verificación de P3 Tasks (6 tasks sin status original)
- v4.0.0-beta.1 — Critical Fixes + YouTube API + Visualizer
- Sesión: E2E Test Fixes — YouTube-Only Track Compatibility
- Sesión: CORS Fix — Real Audio Frequency Data for Visualizer
- Session: 14 User-Reported Fixes
- Session: 12 New User-Reported Fixes (Batches 1-3)
- Fase: Mega-fix + Features — 16 Tareas
- Fase: P3 Batch 2 — Multi-track + YouTube + Audio Player (7 Issues)
- P3 Batch 2 Hotfix — Plan de Cambios (2026-09-13)
- P3 Batch 2 Hotfix — Production Verification
- P3 Hotfix: 11 Bugs de Producción
- P3.3 + P3.6: Shows CRUD Completo + iTunes Auto-Complete
- Fix: Test Releases visibles en producción — SQLite local en git
- Fix: Turso stale data — USE_TURSO const evaluated at build time
- Auditoría Total — Functional + Visual + Code Quality
- Fix: POST /api/shows 500 — Debug + Fix (P3)
- Fix: MCP Servers not loading in opencode Desktop
- Exhaustive Audit + Security Hardening (P3)
- Exhaustive Audit Round 2 + Critical Fixes
- Final Audit + Infrastructure Fixes

## `docs/ai-log/05-rc10-rc28.md`

**rc.10–rc.28 · releases candidate sobre producción** — 13 entradas.

- v4.0.0-rc.10 — Critical Build Fix + Production Cleanup
- v4.0.0-rc.11 — Middleware Expansion + Dark Mode Fixes
- v4.0.0-rc.12 — Dark Mode Consistency Fix
- v4.0.0-rc.13 — Login Fix + Dashboard Público
- v4.0.0-rc.14→rc.18 — P3 Batch 3: Fixes + Rediseño + Features
- rc.19 — Auth Edge Runtime Fix (CRITICAL)
- rc.20 — Bug Fixes + Fase P Verification
- rc.21 — Exhaustive Testing + Player Empty State Fix
- rc.22 — Progress Bar Fix + Seek Clamping + 42/42 Tests Pass
- RC.23 — Player YouTube Fixes
- RC.23 Final — YouTube Player Fixes (Complete)
- Batch Fixes — 8 Issues (Iniciado)
- Batch Fixes — 8 Issues (Completado)

## `docs/ai-log/06-tranches-a-hoy.md`

**Tranches, rc.29–rc.33 y los puntos C1–C6** — 42 entradas.

- Tranche 0 - Bugs que estaban rotos en produccion (S/M)
- Tranche 1 - Seguridad (S/M)
- Tranche 2 - Rendimiento (S/M)
- Tranche 3 - Accesibilidad y calidad (S/M)
- Tranche 4 - Verificacion, CI y SEO
- Plan rc.29 → rc.31 — Blob OIDC, descargas de prensa, UI y datos (2026-09-28)
- Track 1 + D1 — Iconos, pestanas del admin y cuentas de artistas (2026-09-28)
- Rediseño del carrusel de artistas del catálogo — 1 artista por página
- C1 + C7 + C2 - pagina publica del artista (ancho, margen social y catalogo agrupado)
- Qué se entregó
- Los cuatro fallos que hicieron falta de más
- Cómo se comprueba un PDF sin mirarlo a ojo
- Un error mío que casi se cuela
- Rejilla del catálogo: de 4 columnas a 3
- Estado de los datos
- Advertencia sobre Turso en producción
- Pendientes que siguen abiertos
- 1. Las 9 portadas de la semilla estaban rotas
- 2. Un album se renderizaba con la plantilla de una pista
- 3. La ficha técnica estaba rota, y no por su cuenta
- De paso
- Verificación
- Los MCP de Vercel y Turso
- RC.31 — 15 problemas, 2 huecos y el flujo de promoción
- Pendientes que siguen abiertos
- RC.32: contrato de edicion, audio, aprobaciones y catalogo real
- Pendientes que siguen abiertos
- RC.33: catalogo real, credenciales fuera del codigo, buzon y una pagina por release
- C1 - el diseño de la página de release vuelve al acordado
- C1-bis · la ficha de una pista vuelve a la página de release
- C1-ter · Un `- Topic` no es el videoclip de la pista
- C2 — un solo patrón para reproducir
- C3 — un solo botón en el formulario de edición
- C4 — el vocabulario de show, cerrado
- Tres veces el mismo tropiezo: `not.toContain` cuenta comentarios
- Puertas
- Lo que sigue abierto, y por qué
- C5 — el dry-run de fotos proponía lo que se había rechazado
- C6 — por fin hay un suscriptor que probar
- El fallo que casi es el de P7
- C4 de la documentación: la cuarta vez con `not.toContain`
- Puertas

---

# C7 — la documentación, troceada por época

`docs/AI_LOG.md` eran **7.248 líneas, 406 KB, 125 H2 y 594 H3**. Ahora son 7 KB de
índice, y el texto está en `docs/ai-log/` con un fichero por época.

**Nada se borró.** De todas las líneas del original, las únicas que no aparecen en
los ficheros de época son las **dos de la cabecera del propio fichero**, y están
copiadas literales en el índice para que la comprobación las incluya también.

| Fichero | Líneas |
|---|---|
| `ai-log/01-f0-f9.md` | 526 |
| `ai-log/02-refactor-fases-a-l.md` | 1.128 |
| `ai-log/03-hotfixes-y-sesiones.md` | 202 |
| `ai-log/04-v4-alpha-beta.md` | 2.331 |
| `ai-log/05-rc10-rc28.md` | 1.433 |
| `ai-log/06-tranches-a-hoy.md` | 1.622 |

**El reparto es por corte posicional, no por patrón.** El primer intento usó regex
sobre el título y salió mal: 69 secciones en un fichero y otro vacío. `^(rc\.)` se
come también rc.31–rc.33, y las secciones sin fecha necesitan heredar la época
anterior — y heredar por regex reparta mal. Con seis marcadores reales
(`## Fase F0`, `## Refactorizaci`, `## Fix: Dark Mode Consistency`,
`## v4.0.0-alpha.1`, `## v4.0.0-rc.10`, `## Tranche 0`) es determinista.

Más `docs/README.md`: el índice de los 27 ficheros de `docs/`, con los enlaces
comprobados uno a uno.

## Dos veces que casi borro el handoff, y por qué

Las dos por lo mismo: un `IndexOf` que devolvió `-1` y un `Substring` que **no
lanza** antes de escribir.

1. Al insertar C7 calculé el rango con `IndexOf('### C7')` → `IndexOf('### C8')`.
   El primero devolvió `-1` porque el patrón no cuadraba, y el resultado fue que
   **`docs/HANDOFF_FASE_P.md` quedó en 0 bytes**. Salió con `git checkout` —no
   había nada sin commitear— pero por un momento el handoff no existía.
2. **Antes ya había borrado esa misma sección C7**, en el commit `2fcd4f3`: al
   reemplazar el bloque C5+C6 usé `IndexOf('### C5')` → `IndexOf('### C8')` como
   rango a sustituir, y C7 estaba en medio. Recoverido de `fe6b575`.

Lo que faltaba era un `if ($i -lt 0) { throw }` antes de escribir. Lo puse
después de que pasara, que es la parte que no ayuda.

**El arreglo que sí es reutilizable:** cuando la evidencia del fichero contradice
al script (`bytes: 0`), `git checkout -- <fichero>` y seguir. Todo lo que no
estuviera commiteado se habría perdido, así que la regla de "commit antes de
experimentar" es la que salvó esto, no la precaución.

## Los dos que casi se van: el mensaje del commit y el tagger del tag

Los dos ultimos hallazgos llegaron **tarde**, y los dos porque un check que
daba 0 **no era verdad**: era 0 por una razon distinta a la que creia.

**El mensaje del commit.** El purge tocaba blobs y metadata de autor, y no los
mensajes. Y `git log --all -S 'needle'` da 0 sobre los mensajes **siempre**,
porque `-S` cuenta ocurrencias en el **diff** entre commits, no en el texto del
mensaje. Los dos checks de la guia pasaban mientras habia **249 mensajes** con el
correo viejo y **5** con la contrasena.

Lo que si los ve es `git log --all --grep`, que busca en el mensaje. O el barrido
de objetos, que no distinctions.

**El tagger del tag.** Al rehacer los 17 tags anotados "preservando la
anotacion" preserve tambien el `tagger`, y su email. Los 17 lo tenían. Y
`--format='%ae|%ce'` solo mira commits: la metadata de un tag es la linea
`tagger` de su propio objeto. Otra vez 0, otra vez mentira.

Y el **indice del worktree**: con `main` y los 61 tags ya limpios, el `gc`
seguia sin podar 88 blobs con la credencial. Venian del **`.git/worktrees/*/index`**
del worktree enlazado, que `git log --all` no recorre y `fsck` no lista porque no
estan colgantes: estan **alcanzables por el indice**. Hay que hacer
`reset --hard` **ahi tambien**, no solo re-apuntar el HEAD.

## Como se comprueba de verdad

Un barrido de **todos** los blobs del object store, con un control al lado:

```powershell
git cat-file --batch-all-objects --batch | Select-String -SimpleMatch -Pattern $correoViejo
git cat-file --batch-all-objects --batch | Select-String -SimpleMatch -Pattern 'PressPlay'   # control: >0
```

El control es lo que convierte el 0 en informacion. **Y el needle se monta en
runtime** (`'angab' + '06@gmail.com'`), porque un needle escrito en el propio
fichero que documenta el check se encuentra a si mismo.

Resultado: 0 con el correo viejo, 0 con la contrasena vieja, **6090 con
`PressPlay`**. Y las cuatro vias de git, a 0:

| Comprobacion | Que mira | Resultado |
|---|---|---|
| `git log --all -S` | diffs entre commits | 0 |
| `git log --all --grep` | **mensajes** | 0 |
| `git log --all --format=%ae\|%ce` | autor y committer | solo el placeholder |
| barrido de objetos | blobs, commits y tags | 0 (control: 6090) |

Las cuatro hacen falta: cada una tapa un agujero que las otras no ven.

## Puertas

`1200/1200` en 62 ficheros, `tsc` limpio, `next lint` sin warnings. C7 no toca
código: el troceo es de Markdown y el índice son enlaces.
---

# Métricas de ceros: 74 filas a NULL, y una predicción que era falsa

## Qué era

74 filas de `tracks` (9 cabeceras de álbum + 65 hijas) llevaban exactamente

    {"streams":0,"saves":0,"playlist_additions":0,"top_countries":[]}

No es una métrica curada: es relleno de semilla. Pero `lib/metrics-source.ts`
regla que "el primero es el JSON curado, y gana aunque valga 0", y el relleno se
adueñaba de ese contrato. Las 9 cabeceras salían con **0 reproducciones** y el
pie diciendo "métricas curadas del catálogo".

## Por qué 74 filas y no 9

`resolveAlbumMetrics` elige **una** fuente: la del padre si tiene, si no la
primera que tenga una hija. **Con solo las cabeceras a NULL los álbumes habrían
seguido mostrando 0**, porque las hijas también traen el objeto y la fuente
seguiría siendo "curado" con total 0. Hay que vaciar el subárbol entero.

## Aplicado y verificado

74 filas a `NULL`. En la base: 77 nulos, 6 con dato, 83 en total. Las 6 con dato
son exactamente las curadas de verdad (un single porcada uno de los 6 artistas no
influyentes).

En producción, los 9 álbumes:

| Álbum | Antes | Después | Fuente |
|---|---|---|---|
| Radiohead — OK Computer | 0 | 1.269.807 | YouTube |
| Radiohead — Kid A | 0 | 291.616.427 | Last.fm |
| Pink Floyd — Dark Side of the Moon | 0 | 109.491.157 | Last.fm |
| Pink Floyd — The Wall | 0 | 120.626.778 | Last.fm |
| David Bowie — Heroes | 0 | 7.049.734 | Last.fm |
| David Bowie — Ashes to Ashes | 0 | 7.493.122 | Last.fm |
| Kraftwerk — The Model | 0 | 1.219.878 | Last.fm |
| Kraftwerk — Tour de France | 0 | 1.752.248 | Last.fm |
| Björk — Vulnicura Strings | 0 | 5.444.855 | Last.fm |

Y el control: **Queen sigue en 2.100.000 curado**, que es lo que tenía que pasar.

Cero álbumes muestran ya un 0.

## La predicción del dry-run era falsa, y lo dice el propio script

Escribí que "4 álbumes se quedarían en sin dato → —", porque ninguna de sus hijas
tiene `youtube_video_id`. **Estaba mal: los 4 salen con dato de Last.fm.**

El error es de modelo, no de ejecución: el script solo veía `youtube_video_id` en
la base, y las dos fuentes que existen (YouTube y Last.fm) se rellenan **en
ejecución** (`/api/youtube/stats`, `/api/lastfm`). Con la base vacía de esas
señales, "no hay vídeo" no significa "no hay dato".

Lo he corregido en el resumen del script, porque un script que se queda en el repo
afirmando algo falso es peor que no tenerlo. La conclusión honesta es "sin dato **o**
una fuente que solo existe en ejecución", y la diferencia no es cosmética: "—" en
la tarjeta y 7.049.734 scrobbles no son lo mismo.

**Lo único que el dry-run sí asegurar, porque es de la base, es el "antes":** los 9
con 0 y fuente "curado". Eso estaba bien predicho.
---

# C9 - reescribir la historia entera: 361 commits, 61 tags y un worktree fantasma

## Qué era

`Directrices delProyecto Final.md:Zone.Identifier` seguia en la historia. No es
un fichero raro: es un **flujo de datos alternativo de NTFS** (la marca que
Windows pone a lo descargado de internet) commiteado como fichero. El `:` no es
valido en NTFS, y por eso `git filter-repo` moria con `fatal: invalid path` y
`git filter-branch` con `Could not initialize the index`. Afectaba a 16 commits y
**no estaba en HEAD**.

Con el path fuera de juego, C9 era lo de verdad: quitar del historico las
credenciales de antes de la rotacion. En 32 commits estaba la contrasena de
administracion, y el correo y la contrasena del antiguo usuario de prueba
aparecian como author/committer de la historia.

## Qué se hizo

Backup primero: un clon espejo bare en el temporal, 89,8 MB, 361 commits y 64
refs, con `main` en `d74a91b`. **Ese clon contiene la historia vieja a proposito.**
Si algo sale mal, la respuesta no es "no hay backup".

Despues, en orden:

1. **Path invalido fuera** de los 16 commits que lo tenian. 345 arboles quedaron
   identicos byte a byte y 16 distintos **solo** por la ruta borrada; ningun
   arbol cambio por otra cosa.
2. **61 tags reescritos**, no solo `main`. 44 lightweight con `update-ref` y los
   17 annotated reconstruidos a mano para conservar tagger, fecha y mensaje. Un
   tag annotated es un objeto aparte: reescribir el commit al que apunta y
   deixar el tag apuntando al viejo deja el viejo al alcance.
3. **Credenciales fuera** de los 4 patterns, y de los metadatos. El patron del
   par (`correo / contrasena`) va **antes** que el correo suelto y que la
   contrasena, porque en el par el correo va seguido de su contrasena en la
   misma linea: al revés, la primera pasada deja el contrasena huérfana.
4. **`data/music_catalog.db` eliminado del historico.** Era una SQLite commiteada
   por error (hoy la ignora `.gitignore`) y por dentro tenia el correo.
5. **`gc --prune=now`**, y el `main` nuevo es `e8fb8b5`.

## El worktree fantasma: la misma trampa de `refs/original`, otra vez

Despues del `gc` seguian apareciendo 293 commits viejos, y `main` y los 61 tags
ya estaban limpios. La causa **no era el repositorio**: habia un **worktree
enlazado** de una sesion anterior en
`%TEMP%/opencode/fase-e-before`, con su `HEAD` en un commit viejo. Vive en
`.git/worktrees/`, comparte el object store, y `git log --all` lo recorre igual
que una rama.

Es exactamente el fallo que ya documentan los 61 tags y que casi documenta
`refs/original/`: **reescribir la historia no es llegar a 0, es llegar a 0 en
todos los sitios que la alcanzan.** Un worktree enlazado es uno mas.

Lo **reapunte** en vez de borrarlo, porque el directorio existia y no era mio:
`update-ref HEAD` a su commit equivalente ya purgado. Cero borrados, y los 293
se quedaron sin alcance. Despues de eso `--all` da exactamente 361.

## Lo que queda, y por que esta bien

Quedan dos lineas con `angab06` a secas. **Son la aguja del propio script**:

    git grep -n 'angab06' $(git rev-list --all)      # debe dar 0 lineas

Es el comando de verificacion, en `scripts/git/purge-history.js` y en
`docs/ROTACION_CREDENCIALES.md`. Purgarlo habria roto la comprobacion: el
documento dejaria de encontrar su propia referencia. Un `angab06` suelto no es
PII ni secreto; el correo entero, que si lo es, esta en 0.

## `filter-repo` no funciona aqui, y el motivo no es mio

Dos intentos, dos fallos distintos:

- Con `--refs main refs/tags/*` el glob lo expande PowerShell y `main` quedo
  mapeado a un SHA nulo: rama borrada y working tree vaciado. Se recupera con
  `update-ref` al SHA bueno.
- A pantalla completa, `OSError: [Errno 22] Invalid argument` escribiendo un blob.
  El repositorio queda intacto.

Lo que funciona es **plumbing puro** (`hash-object`, `mktree`, `commit-tree`,
`update-ref`), porque no depende de reescribir ficheros del working tree. El
script de referencia sigue siendo `scripts/git/rewrite-invalid-path.js`, pero en
este entorno hay que ir por la via rapida.

## Puertas

`1200/1200` en 62 ficheros, `tsc` limpio, `next lint` sin warnings, `fsck` sin
quejas, y 508 ficheros en HEAD (los mismos que antes: la reescritura cambia el
contenido de 44 ficheros, nunca el numero).
