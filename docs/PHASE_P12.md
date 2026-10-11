# FASE P12 — Las puertas que no fallan

**Período:** 2026-10-10 → · **Estado:** en curso · **Ronda:** auditoría posterior a rc.35

> **Este documento se escribió antes de tocar código.** Es el paso 1 del
> Flujo de Trabajo Obligatorio (`AGENTS.md:450`): *"Documentar lo que se va a
> hacer (plan + alcance)"*. La sección **Lo que se hizo** está vacía a
> propósito — se rellena con commit y salida literal de puerta a medida que
> avanza. Si alguien lee esto a mitad de fase, ve lo prometido separado de lo
> hecho sin tener que confiar en nadie.

## Qué es

Auditoría del estado del proyecto tras `v4.0.0-rc.35`, sobre cuatro ejes:
reproductor de audio, API de admin, scripts de datos y CI, y documentación.
Se encontraron ~60 hallazgos en total. **Esta fase ejecuta solo los que
rompen algo observable o dejan una puerta abierta**; el resto se entrega
priorizado y marcado como no verificado.

Las cuatro auditorias se hicieron en paralelo por área, y **dos de sus
afirmaciones más graves resultaron incorrectas** al verificarlas contra el
código:

- *"Toda pista de YouTube se corta a los 30 s"* — **es intencionado**.
  `context/AudioPlayerContext.tsx:236` pasa `mediaDuration: 0` con un
  comentario que justifica exactamente ese fallback. No es un bug; lo que sí
  necesitaba decisión era que `buildReleaseQueue` heredase el `youtube_video_id`
  de la cabecera para las hijas sin audio (resuelto en la fila 7).
- Una auditoría situó `capitalizeReleaseType` en un fichero que no lo tenía.
  Estaba en `lib/null-safe.ts`, y el problema era peor de lo reportado.

**Por qué se documenta ese detalle:** porque es la razón de que este documento
exista. Un hallazgo sin verificar, citado por cuatro ojos, es más peligroso
que ningún hallazgo.

## Lo que estaba roto, y por qué esta fase existe

### Las puertas no podían fallar

Es el defecto de fondo. No es un bug entre otros: es el motivo por el que los
otros llegaron a producción.

| Puerta | Por qué no protegía |
|---|---|
| `scripts/turso-check.ts` | Imprime los números (las expectativas son prosa en `:64-70`) y sale con código 0. **Ningún check puede fallar el proceso.** Los guards añadidos en `a35fa6f` no protegían nada. |
| `tests/unit/admin-catalog.test.ts` | 4 tests tautológicos; uno es literalmente `expect(true).toBe(true)` (`:29`). Ninguno lee un fichero ni ejecuta un handler. Revertir el commit entero los deja verdes. |
| La puerta que se corría a mano | Después del commit de admin (`268b573`) se ejecutó **un solo test aislado** en vez de la suite completa. |

**El fallo concreto que lo demuestra:** `tests/unit/release-approval-cascade.test.ts:137`
espera el literal `UPDATE tracks SET status = ?`, y `app/api/admin/releases/route.ts:218`
construye esa sentencia dinámicamente desde `268b573`. **El test falla, y está
en `main` y en producción.** Se introdujo al pushear el commit de admin sin
volver a correr la suite completa.

Es exactamente el modo de fallo que `AGENTS.md:83` ya describía — *"un check que
siempre pasa no protege de nada"* — pasó la tercera vez en una sola sesión,
dos de ellas nuestras.

### La normalización de `release_type` era reversible

`a35fa6f` normalizó 75 filas de Turso a minúsculas (`album` / `ep` / `single`).
Ese trabajo se deshace con el uso normal de la aplicación:

- `lib/null-safe.ts:161` devuelve `"Álbum"` **con tilde**, un valor que no está
  en el vocabulario canónico (`lib/release-type.ts:28`). No lo detecta ningún
  check.
- `app/releases/[id]/edit/page.tsx:377` lo escribe en cada guardado del artista.
- `lib/db.ts:3127` tiene `"Single"` por defecto.
- `app/admin/page.tsx:178` inicializa el formulario en `"Single"`.

Y `lib/release-type.ts` se creó como vocabulario canónico **y no tiene un solo
consumidor en producción**: `lib/db.ts` no lo importa. Un módulo que declara
ser la fuente de verdad y no se consulta hace que la invariante parezca
cubierta cuando no lo está.

### SQL con nombres de columna tomados del body

`lib/db.ts:3290` construye el `SET` con `Object.keys(updates)`, y
`app/api/tracks/route.ts:175` le pasa el body sin validar. Un body con una clave
como `"title = (SELECT …) --"` produce SQL arbitrario. Es una ruta admin-only, y
`lax` bloquea el CSRF cross-site, así que la severidad está acotada — pero es el
único sitio del repo donde el **nombre de columna** viene de entrada de usuario.
`lib/db.ts:3505` (dossiers) repite el patrón.

Hay ya dos rutas con allowlist de columnas (`app/api/releases/route.ts:724` y
`app/api/tracks/[id]/route.ts:97`) y una sin ella. La divergencia existe.

### Escrituras que borran o fallan en silencio

- `app/api/admin/releases/route.ts:212` hace
  `paramsBatch.push(admin_notes ?? null)` **incondicionalmente**, y la UI manda
  la clave ausente al pulsar "Aprobar". Cada aprobación borra el motivo de un
  rechazo anterior, que `app/releases/[id]/edit/page.tsx:741` le muestra al
  artista.
- Cinco handlers de escritura en `app/admin/page.tsx` (`:521`, `:1491`,
  `:1697`, `:1167`, y el botón de borrar notificación en `:1176`, con cuerpo
  vacío) no tienen rama de error: un 403 o un 500 no muestran nada.
- `app/admin/page.tsx:1146` hace `notif.user_id.slice(0, 8)` sin guarda: un
  `user_id` nulo revienta el render del panel entero.

### CI con dos workflows rotos

- `.github/workflows/sync-data.yml:26` llama a `pnpm db:sync`, que **no existe**
  en `package.json` (solo hay `db:seed`, `db:seed:fresh`, `db:seed:admin`,
  `db:seed:artists`). Ese cron falla cada 6 horas desde hace tiempo.
- `.github/workflows/cleanup-shows.yml:67` cae a
  `https://epk-dashboard.vercel.app` por defecto si falta
  `vars.NEXT_PUBLIC_APP_URL`. La asimetría es el punto: la credencial faltante
  falla ruidosamente a propósito (`:54-57`), **la URL faltante falla
  destructivamente en silencio**, en una operación que es un `DELETE` real.

### La documentación affirmationa cosas falsas

14 bugs de contenido, todos verificados. Los dos más dañinos:

- `AGENTS.md:12` dice *"1146 tests (Vitest, 61 archivos)"*. La cifra real es
  **~1334 tests en 73 ficheros**. Aparece **tres veces** en las dos primeras
  filas de la tabla de comandos, que es lo primero que se lee.
- `AGENTS.md:76` dice *"los 83 guards `if (isTursoConfigured()) return;`"*.
  Ese patrón tiene **0 ocurrencias**. Lo que existe son **93**
  `if (isTursoEnabled())` en `lib/db.ts`. El mismo error está duplicado en
  `lib/turso.ts:1000`. Quien quiera verificar el invariante abre el patrón que
  el doc le da, no encuentra nada, y no sabe si caducó el invariante o mintió
  el doc.

Y el **método**, que es lo quequiry la ronda corrige de verdad:

- `docs/PHASE_P3.md:239` dice que `docs/modelos gratuitos disponibles.txt`
  está *"intacto; verificado con git show"*, y `:242` lo lista bajo
  *"NO tocado"*. **Cuatro líneas de distancia.** El commit `384b48f` sí lo
  tocó.
- `docs/PHASE_P3.md:241` cita al propio `PHASE_P3.md` como evidencia de un
  hecho del código. Un cambio no queda verificado por estar escrito dos veces
  en el mismo fichero.
- `docs/PHASE_P3.md:238` afirma *"Cada test tiene referencia al archivo que
  protege"*. Los comentarios `// REVERSIBLE:` estaban en el **código editado**,
  no en los tests — y uno de esos tests era `expect(true).toBe(true)`.
- `docs/AI_LOG.md:192-199` tiene una tabla de seis recuentos de líneas mal en
  **los seis por exactamente +5**: un error de método de medición congelado en
  una tabla presentada como prueba.

**El diagnóstico de fondo:** los documentos de fase están muy bien escritos
—razonan el porqué, citan el commit— pero **no están mantenidos**, y la
documentación de esta sesión es **peor** que la de P7/P8/P10. La deriva
coincidió con que el trabajo se acelerara y se delegara.

## Lo pendiente

Se va tachando conforme avanza. **Si quedan filas sin marcar, la fase no está
cerrada** — y el paso 7 del Flujo Obligatorio ("crear release si es fase
completa") no se cumple.

| # | Qué | Estado |
|---|---|---|
| 0 | Arreglar el test de cascada rojo | **hecho** |
| 1 | `turso-check.ts` con aserciones y exit code | pendiente |
| 2 | `admin-catalog.test.ts` con ejecución real | pendiente |
| 3 | Meta-test que falla ante asertaciones tautológicas | pendiente |
| 4 | `fase-naming.test.ts`: derivar la lista de ficheros | pendiente |
| 5 | `release_type`: `"Álbum"`, `edit/page.tsx:377`, `lib/db.ts:3127`, `admin/page.tsx:178` | pendiente |
| 6 | `lib/release-type.ts`: conectar de verdad o borrar | pendiente |
| 7 | Allowlist de columnas en `lib/db.ts:3290` y `:3505` | pendiente |
| 8 | `admin_notes` condicional + `admin/page.tsx:1146` con helper | pendiente |
| 9 | `buildReleaseQueue` sin `fallbackVideoId` (cada hija su vídeo) | pendiente |
| 10 | `ReleaseTracklistSection`: verificar alcanzabilidad y borrar si muerto | pendiente |
| 11 | `sync-data.yml` y `cleanup-shows.yml` | pendiente |
| 12 | 14 bugs de documentación + los 5 del método | en curso (4 de 19 cerrados) |
| 13 | Extraer P11 a `docs/PHASE_P11.md` | **hecho** |
| 14 | Filas P11/P12 y rc.34/rc.35 en `docs/PHASES.md` | **hecho** (rc.36 queda para el paso 7) |

## Las reglas que esta fase escribe para las siguientes

Se documentan aquí porque si no viven en el repositorio, las pierde la sesión
que venga. La primera es la que esta sesión está aplicando:

1. **Ninguna acción empieza sin estar documentada con su porqué en el
   repositorio.** Un commit sin el documento detrás es un commit sin
   explicación, y la sesión siguiente lo hereda sin contexto. Este fichero se
   escribió antes de arreglar el test; el arreglo va después, no antes.
2. **Toda cifra sale de un comando, y el comando va en el documento.** Si el
   número cambia cada semana, es un entero en la tabla de comandos lo que se
   queda viejo, y es lo primero que se lee.
3. **Toda afirmación del tipo "N tests protegen X" va verificada revirtiendo, o
   el documento dice explícitamente "no verificado".**
4. **Ningún documento cita a otro documento como evidencia de un hecho del
   código.**
5. **Se cita el test, no la línea de producción.** Las líneas se mueven
   (`PHASE_P3.md:102` cita `page.tsx:602-615`; el real es `:575-588`). Los tests
   se mueven menos.
6. **La salida de la puerta va literal en el documento, o no va.**

## Fuera de alcance, y por qué

| Qué | Por qué fuera |
|---|---|
| Partir `app/admin/page.tsx` (1768 líneas, 7 dominios) | Sin presión de bug inmediata. Mezclar un refactor de ese tamaño con los fixes es lo que difficultó revisar los últimos commits. Ronda propia. |
| Partir `lib/db.ts` (3558 líneas) | Es una frontera de funciones, no un problema de estructura. La inyección SQL se arregla en sitio. |
| `environment: "jsdom"` como default en `vitest.config.ts` | **Se propuso y se retiró.** Bajo jsdom la carga de `better-sqlite3` se rompe — el mismo ABI que ya da problemas — y tocarlo con tests rojos pide otra regresión. El meta-test de la fila 3 ataca la causa directa (tests que no comprueban) sin tocar la infraestructura. |
| Módulos de proveedor (`youtube` 1767, `deezer` 1017, `turso` 1008) | Cohesivos y bien=testeados. Mismo argumento que `lib/db.ts`. |
| Los 6 `fetchX` de solo lectura del admin | Deuda de ergonomía, no bug: un 403 se ve como una tabla vacía. |
| Los ~60 hallazgos restantes de las auditorías | No verificados uno a uno. Se entregan priorizados y marcados tras esta fase. |
| `package.json` dice `"version": "1.0.0"` | El campo no lleva el versionado desde hace tiempo. No se toca: cambiarlo puede afectar al build de Vercel. Anotado como inconsistencia conocida. |

## Bloqueado: dos pasos del Flujo Obligatorio

No es una decisión, es una dependencia:

| Paso | Qué bloquea |
|---|---|
| **5.** Pruebas en producción (matriz + funcional + headed + screenshots) | Las 6 variables `TEST_*`. `scripts/lib/credentials.ts` las lee con `readEnvStrict`, sin default para contraseñas. Ninguna está definida en esta sesión. |
| **7.** Crear `v4.0.0-rc.36` | Lo mismo, más que las fases 1–4 estén verdes en producción. |

Son también el secreto que necesita `.github/workflows/cleanup-shows.yml`
(`docs/CONFIG_TODO.md`, C12). Un solo secreto desbloquea las tres cosas.

**Mientras tanto, esta fase NO se declara completada**, aunque todas sus filas
estén marcadas. El paso 7 dice "release si es fase completa", y sin el paso 5
no lo está.

## Lo que se hizo

### Fase 0 — documentación (2026-10-10)

Sin tocar código, que es lo que pide el paso 1 del Flujo Obligatorio.

- **`docs/PHASE_P12.md`** nuevo: este documento.
- **`docs/PHASE_P11.md`** nuevo: P11 extraído de `PHASE_P3.md`, que llevaba una
  ronda completa sin figurar en el índice. Al moverlo se corrigió la
  contradicción que tenía a cuatro líneas de distancia sobre
  `docs/modelos gratuitos disponibles.txt` (`:239` decía "intacto", `:242` lo
  listaba bajo "NO tocado"; el commit `384b48f` sí lo tocó). Y se añadió su
  sección **"Lo que esta fase prometió y no cumplió"**, que el original no
  tenía: los cuatro tests tautológicos, el test de cascada roto, el
  `admin_notes` que se borraba en cada aprobación, y la vista de catálogo que
  enseña 20 de N.
- **`docs/PHASES.md`**: filas P11 y P12; filas rc.34, rc.35 y rc.36 en la tabla
  de RC (que terminaba en rc.33); etiqueta `F3` corregida a `P8.1/P8.2` (F3 no
  existe en ningún `PHASE_*.md`: es un tercer esquema de etiquetas en el
  índice, justo lo que el propio índice dice querer evitar); y el tamaño de
  `AI_LOG.md` corregido de "379 KB, troceado pendiente" a "20 KB, es el índice,
  el texto troceado está en `docs/ai-log/` (C7)".
- **`docs/AI_LOG.md`**: entrada de índice de esta ronda.
- **`docs/PHASE_P3.md`**: el bloque de P11 sustituido por un enlace.

**Puerta de esta fase:**

```
npx tsc --noEmit     → exit 0
npx next lint        → ✔ No ESLint warnings or errors
npx vitest run       → Test Files 1 failed | 72 passed (73)
                       Tests      1 failed | 1355 passed (1356)
```

El único fallo es `release-approval-cascade.test.ts`, que **ya estaba roto
antes de esta fase** — es la fila 0 de la tabla. La Fase 0 no añade código, así
que no lo introduce ni lo empeora.

**No se pushea todavía.** La regla 6 de este mismo documento dice que la puerta
va literal, y la regla de no pushear nada con la puerta en rojo se acaba de
escribir: hacerlo sería exactamente el fallo que motivó la fase. El push va con
la Fase 1, que arregla el test.

### Fase 1 — el test de cascada, que estaba rojo en producción

`tests/unit/release-approval-cascade.test.ts:132-139` ataba el literal
`UPDATE tracks SET status = ?`, que `268b573` dejó de producir al volver dinámica
la sentencia del padre.

**Lo que se cambió, y por qué no era solo un literal.** Ese literal era un
*proxy* de lo que el test protege: que el `UPDATE` del padre y la cascada entren
en la **misma** transacción. Ese invariante —no la lista de columnas— es el de
RC.32 Tarea 1, y sigue siendo el que se comprueba, ahora por la forma
(`UPDATE tracks SET ${updates.join`) en vez de por una cadena de columnas.

Se añadió además un segundo test: el `SET` es dinámico porque el **nombre** de la
columna se decide en el código, pero el **valor** tiene que ir con `?`. Si
alguien interpola el valor, la construcción dinámica pasa de ser una comodidad a
ser una inyección. Es el mismo riesgo de la fila 7.

**Disciplina de reversión, ejecutada y no asumida.** Se sacó la cascada fuera
del `dbBatch` —el estado roto original— y el test **se puso rojo** (1 failed /
38 passed). Restaurado: 39/39. Un test que no falla al revertir no protege de
nada, que es la razón de existir de esta fase.

```
npx tsc --noEmit     → exit 0
npx next lint        → ✔ No ESLint warnings or errors
npx vitest run       → Test Files 73 passed (73)
                       Tests      1357 passed (1357)
```

**Producción sale verde con este push.**

### Un hallazgo lateral, sin arreglar

`route.ts:179` valida `status` contra cinco valores y devuelve 400 si no es
uno de ellos. Al llegar a esa línea, `status !== undefined` en `:200` **siempre es
cierto**: el condicional está muerto y `status = ?` se empuja siempre. No es un
bug —comportamiento correcto por el camino de todos modos— pero es un condicional
que aparenta proteger algo que ya está protegido tres líneas más arriba. Se anota
para la fila 8, que toca ese mismo bloque.


