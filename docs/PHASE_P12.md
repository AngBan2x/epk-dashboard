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
| 1 | `turso-check.ts` con aserciones y exit code | **hecho** |
| 2 | `admin-catalog.test.ts` con ejecución real | **hecho** |
| 3 | Meta-test que falla ante asertaciones tautológicas | **hecho** |
| 4 | `fase-naming.test.ts`: derivar la lista de ficheros | **hecho** |
| 5 | `release_type`: `"Álbum"`, `edit/page.tsx:377`, `lib/db.ts:3127`, `admin/page.tsx:178` | **hecho** |
| 6 | `lib/release-type.ts`: conectar de verdad o borrar | **hecho** |
| 7 | Allowlist de columnas en `lib/db.ts:3290` y `:3505` | **hecho** |
| 8 | `admin_notes` condicional + `admin/page.tsx:1146` con helper | **hecho** |
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

### Fase 2 — P12.1 · Las puertas que no fallan

Las cuatro van antes que las correcciones a propósito: si estas funcionaran,
la Fase 3 no habría llegado a producción.

**Fila 1 — `scripts/turso-check.ts`.** Una tabla `ESPERADO` con los siete checks
que sí tienen un valor correcto, una función `comprobar` que compara, una lista
`fallos` que acumula, y `process.exitCode = 1` al final. Dos decisiones que no
son obvias:

- **Una query que no corre cuenta como fallo.** Un `catch` que solo imprime
  convierte "no lo comprobé" en "todo bien", que es exactamente el problema que
  se arregla.
- **La prosa de expectativas se imprime desde `ESPERADO`.** Antes había tres
  `console.log("(esperado 0: …")` escritos a mano *y* ninguna lista. Ahora hay
  una sola fuente, y el bucle la recorre. No se puede distinguir una línea
  generada de una escrita a mano por su forma —son idénticas—, así que el test
  comprueba de dónde sale, no cómo se ve.

Ejecutado contra Turso: `✔ Todos los checks con valor esperado cuadran`, exit 0.
Con el umbral de Vulnicura puesto a 99 a propósito: `✖ 1 check(s) fallaron`,
exit 1.

**Fila 2 — `tests/unit/admin-catalog.test.ts`, reescrito entero.** Lo anterior
era esto:

```ts
const handlerIncludesReleaseType = "release_type"; // verificado en edicion manual
expect(handlerIncludesReleaseType).toBeTruthy();
```

Afirmaba que un literal de cadena es *truthy*. El cuarto era
`expect(true).toBe(true)`. Ninguno leía un fichero. Ahora hay nueve tests que
leen los tres ficheros reales, y cubren algo que el original no: que `catalog`
tiene entrada en `TAB_ACCENT` (sin ella, `TAB_ACCENT[activeTab]` es `undefined`
y la pestaña revienta al pulsarla), y que las **dos** ramas de subida de
imagen tienen la guarda de admin —había una blindada y la otra no.

Uno de los tests nuevos **documenta una deuda en vez de fingir**: afirma que
`release_type` **no** se valida contra su vocabulario mientras `status` sí. Es la
fila 5. Está escrita como aserción negativa explícita para que se vea la deuda
en el sitio donde se decide el código, y para que cuando se arregle haya que
cambiar el test a propósito.

**Fila 3 — `tests/unit/puertas-que-fallan.test.ts`, nuevo.** Escanea los 72
ficheros de test y falla si encuentra una aserción tautológica o un `it()` con
el cuerpo vacío.

Dos cosas que solo se descubren escribiéndolo:

- **Se excluye a sí mismo del barrido.** Contiene los patrones literales que
  escanea; sin excluirlo se detecta a sí mismo y la comprobación no vale nada.
- **Escanea el código sin comentarios.** Un test que *documenta* una tautología
  no es una tautología —este fichero nombra `expect(true).toBe(true)` al
  explicarlo, y `admin-catalog.test.ts` citaba la suya al contar qué estaba
  mal—. Marcarlos sería empujar a no escribir la explicación.

Cuando se escribió, **falló**: encontró los `expect(true).toBe(true)` de
`admin-catalog.test.ts`. La puerta hizo su trabajo en el acto.

**Fila 4 — `tests/unit/fase-naming.test.ts`.** La lista de documentos estaba
hardcodeada a `P3`–`P10`, así que P11 y P12 quedaban fuera de la única puerta
que vigila la convención. Ahora se deriva de los ficheros que existen. Y se
añade el test que faltaba en la otra dirección: `docs/PHASES.md` se define como
*"un índice, no un plan"*, y P11 estuvo fuera del índice una ronda entera sin
que nada lo dijera. Ahora toda fase con fichero tiene fila, y toda fila con
fase tiene fichero.

**Disciplina de reversión, las cuatro ejecutadas:**

| Revertido | Resultado |
|---|---|
| Cascada fuera del `dbBatch` | 1 failed / 38 passed |
| Umbral de Vulnicura a 99 | exit 1 |
| Botón de la pestaña `catalog` | 1 failed |
| `release_type` en el `UPDATE` del admin | 1 failed |
| P12 fuera del índice | 1 failed / 4 passed |

```
npx tsc --noEmit     → exit 0
npx next lint        → ✔ No ESLint warnings or errors
npx vitest run       → Test Files 73 passed (73)
                       Tests      1519 passed (1519)
```

**El número de tests subió de 1357 a 1519 y la cifra de `AGENTS.md` está
todavía más lejos de la real.** Anotado para la fila 12: cuando se corrija, la
cifra hay que medirla el día del gate, no copiarla de aquí.

### Fase 3 · P12.2-A · La normalización de `release_type` deja de ser reversible

Cuatro escritores, un solo fallo de fondo: **se usaba un helper de presentación
para escribir**. `capitalizeReleaseType()` está pensado para *mostrar*
(`lib/release-type.ts` lo dice: "de modo que la tabla puede ser uniforme y la
pantalla no"), y `app/releases/[id]/edit/page.tsx` lo usaba justo para guardar.

Peor: esa función devolvía `"Álbum"` **con tilde**. No era una variante de
`album`, era otra cadena, y una fuera del vocabulario canónico. El daño era
invisible porque `tracks_release_type_con_mayusculas` compara contra `lower()`, y
el `lower()` de SQLite es ASCII: una tilde lo atraviesa sin que el check se entere.

| Fichero | Antes | Ahora |
|---|---|---|
| `lib/null-safe.ts:182` | `"Álbum"` | `"Album"` |
| `app/releases/[id]/edit/page.tsx:377` | `capitalizeReleaseType(form.type)` | `form.type` |
| `lib/db.ts:3127` | `data.release_type \|\| "Single"` | `\|\| DEFAULT_RELEASE_TYPE` |
| `app/admin/page.tsx:178` | `"Single"` | `"single"` |

**Fila 6 resuelta por el camino corto:** conectar `lib/release-type.ts` era
importar `DEFAULT_RELEASE_TYPE` en `lib/db.ts`, que es lo que hacía falta para la
tercera fila. El módulo deja de ser decorativo —llevaba una ronda siendo la
"fuente de verdad" que nadie consultaba— sin borrar nada.

**`tests/unit/release-type-escritores.test.ts`, nuevo.** Barre `app/`, `lib/` y
`components/` buscando cualquier `release_type: "Single"`, y ata las cuatro
correcciones por separado.

Dos cosas que solo aparecieron al escribirlo:

- **El barrido encontró seis ficheros que no había revisado.** Cuatro son
  proyecciones de lectura (`safeString(head.release_type)` y compañía: copian lo
  que haya, no escriben) y dos son esquemas Zod que aceptan cualquier cadena. El
  test obliga a mirarlos antes de darlos por buenos, y ahora están en la lista
  con lo que son.
- **Uno de los tests documenta una deuda con una aserción negativa explícita:**
  `release_type` no se valida contra `RELEASE_TYPE_VALUES` en ningún sitio —
ni en el PUT del admin, ni en `lib/validations.ts`, ni en el portal de envíos—
mientras que `status` sí se valida contra cinco valores (`route.ts:179`). Quien
lo escriba desde la UI no lo va a hacer, pero una llamada directa sí. Igual que
en `admin-catalog.test.ts`, está escrito para que la deuda se vea donde se
decide el código y haya que cambiar el test a propósito cuando se arregle.

**Disciplina de reversión, las cuatro ejecutadas:**

| Revertido | Resultado |
|---|---|
| `capitalizeReleaseType` → `"Álbum"` | 1 failed |
| `edit/page.tsx` → capitaliza al guardar | 1 failed |
| `createTrack` → `"Single"` | 1 failed |
| `admin/page.tsx` → `"Single"` | **2 failed** (la aserción explícita y la del barrido) |

```
npx tsc --noEmit     → exit 0
npx next lint        → ✔ No ESLint warnings or errors
npx vitest run       → Test Files 75 passed (75)
                       Tests      1530 passed (1530)
```

**1530.** Otra vez la cifra real, para cuando se corrija `AGENTS.md`.

### Fase 4 · P12.2-B · Seguridad

**Fila 7 — el nombre de la columna sale del body.** `updateTrack` y
`upsertDossier` construían el `SET` con `Object.keys()`: el valor ya iba con `?`,
pero el **nombre** se interpolaba. La firma de TypeScript acota las claves en
compilación y el objeto viene de `req.json()` — en runtime no había nada que lo
ate. `PUT /api/tracks` pasaba el body entero sin filtrar, así que una clave como
`"title = (SELECT …) --"` producía SQL arbitrario.

La allowlist va en **`lib/db.ts`**, no en la ruta, y por eso: dos rutas ya tenían
la suya (`app/api/tracks/[id]` y `app/api/releases`) y una no. La divergencia
existía porque la validación estaba en el sitio que se olvidó de ponerla. En la
capa de datos no hay sitio que se pueda olvidar.

Dos decisiones que no son obvias:

- **Una clave desconocida se descarta y se avisa por `console.warn`.** Silenciarla
  evita la inyección; descartarla *en silencio además* evitaría el peor
  resultado, que es devolver 200 y que quien llama crea que guardó algo que no se
  guardó. Sin el aviso, un caller legítimo que se equivoca no se entera nunca.
- **La lista y el tipo de la firma están separados a propósito.** Si el tipo se
  derivara de la lista, añadir una columna sería cambiar una línea y nadie la
  leería.

**Dos ficheros de test, porque atar la forma y probar el efecto son cosas
distintas.** `allowlist-de-columnas.test.ts` compara la allowlist con la interfaz
para que no se separen — y al escribirlo encontró dos fallos reales: mi primera
versión de la lista de dossiers tenía **siete columnas que no existen**
(`guest_list`, `press_photos`, `stage_plot`…) y le faltaban cinco que sí, y
`RawTrackRow` no declaraba `start_time`/`end_time` aunque la tabla los tiene y
`Track` sí. Eso también es cómo se rompe una allowlist: nadie la ejecuta, se mira.

`allowlist-ejecutada.test.ts` **la ejecuta**: inserta una fila, intenta escribir
con una clave que es SQL y comprueba que la fila no cambia. Y comprueba también
que la clave legítima *del mismo body* sí se aplica, porque una allowlist que
bloquease todo también "funcionaría" y dejaría el producto roto sin que ningún
test lo dijera.

**Fila 8 — `admin_notes`.** Era incondicional (`paramsBatch.push(admin_notes ??
null)`), y como la UI manda solo `status` al pulsar "Aprobar", **cada aprobación
borraba el motivo de un rechazo anterior** — que `app/releases/[id]/edit/page.tsx`
le enseña al artista. Ahora se pregunta por la **presencia de la clave** y no por
su valor, porque `null` es una orden de limpiar y tiene que seguir funcionando.
Y `admin/page.tsx:1150` usaba `notif.user_id.slice(0, 8)` a pelo: un `user_id`
nulo reventaba el render del panel entero. Va por `safeString`.

**Disciplina de reversión, las tres ejecutadas:**

| Revertido | Resultado |
|---|---|
| Allowlist de `updateTrack` quitada | **4 failed**, incluido el ataque |
| `admin_notes` a incondicional | 1 failed |

```
npx tsc --noEmit     → exit 0
npx next lint        → ✔ No ESLint warnings or errors
npx vitest run       → Test Files 77 passed (77)
                       Tests      1549 passed (1549)
```




### Un hallazgo lateral, sin arreglar

`route.ts:179` valida `status` contra cinco valores y devuelve 400 si no es
uno de ellos. Al llegar a esa línea, `status !== undefined` en `:200` **siempre es
cierto**: el condicional está muerto y `status = ?` se empuja siempre. No es un
bug —comportamiento correcto por el camino de todos modos— pero es un condicional
que aparenta proteger algo que ya está protegido tres líneas más arriba. Se anota
para la fila 8, que toca ese mismo bloque.


