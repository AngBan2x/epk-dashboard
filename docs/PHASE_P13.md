# FASE P13 - Publicación en redes sociales

> Escrito **antes** de implementar nada, según el Flujo Obligatorio.
> Al que intente leer solo la tabla de plataformas: todo lo que hay debajo está
> ahí porque alguien lo buscó y no lo encontró.

---

## Qué es esta fase

La capacidad de publicar en redes sociales lo que hace PressPlay, sin que ninguna
credencial de publicación llegue al modelo.

El error de partida era de objetivo: se iba a publicar **portadas de albums**
enlazadas al CDN de Apple. Eso vende el catálogo de Apple, no la herramienta, y
peor: la portada es obra de terceros. Las imágenes son **capturas de la propia
plataforma**. Ver la sección de imágenes.

---

## La regla que no se negocia

**El modelo redacta. El administrador publica.**

Ninguna credencial de publicación vive en el repo, ni en `.env.local` del
agente, ni en el prompt de un subagente, ni en `.opencode/`. El subagente
devuelve un borrador; la llamada de publicación la hace el admin tras leerlo.

Por eso **no existe un subagente que publique**, aunque sea lo natural. Un
subagente con el token de la cuenta oficial es un token de la cuenta oficial en
proceso de terceros. `docs/ROTACION_CREDENCIALES.md` ya lo decía; aquí se
convierte en diseño.

### Dónde viven las claves

| Entorno | Dónde |
|---|---|
| Local | `.env.local` (gitignored) |
| Vercel | Variables del proyecto, marcadas como **secret** |
| El agente | **Ninguna**. Solo lee el borrador |

---

## Plataformas: la tabla y por qué está esta

Todas las cifras de esta tabla se verificaron el **2026-10-11** contra
documentación primaria. La fecha importa: estas cifras caducan, y la columna
de estado dice cuáles se han comprobado y cuáles no.

### Las que entran

| Plataforma | ¿Gratis? | Texto + imagen | Límite de texto | Cadencia | Estado |
|---|---|---|---|---|---|
| **Bluesky** | Sí | Sí, en el mismo registro | 300 graphemes | no verificado | lexicon `app.bsky.feed.post` |
| **Mastodon** | Sí | Sí (`status` + `media_ids[]`) | 500 por defecto, **configurable por instancia** | 300 peticiones / 5 min; medios 30 / 30 min | verificado |
| **Threads** | Sí | Sí (`media_type` + `image_url` + `text`) | **500 caracteres** | **250 posts / 24 h**; 4800 × impresiones / 24 h | verificado |
| **Instagram** | Sí | Sí, **solo JPEG** | no publicado en la API | **100 posts / 24 h**, 50 carruseles / 24 h, carrusel ≤ 10 | verificado |
| **Facebook Page** | Sí | Sí (`/{page}/feed`, `/{page}/photos`) | no publicado en la API | 4800 × usuarios comprometidos / 24 h | verificado |
| **LinkedIn** | Sin paywall | Sí (texto + Images API + MultiImage) | no publicado en la API | **no se publica en ninguna parte** | verificado |

**Sobre la columna "no publicado en la API".** Los límites de caracteres de
Instagram, Facebook y LinkedIn existen en la aplicación cliente, no en la
documentación de la API. **No se escriben de memoria en los adaptadores**: se
confirman probando contra la API real, y se anotan con su fecha.

### LinkedIn es el caso raro

Su documentación dice, literalmente:

> *Standard rate limits are not published in documentation.*

El límite se descubre haciendo una llamada de prueba y leyendo la pestaña
Analytics del Developer Portal. Avisa por correo al superar el 75 %, con 1–2 h
de retraso. Consecuencia de diseño: **el adaptador tiene que manejar 429 y
descubrir su propio límite**, no esperar un número de una constante.

### Las que quedan fuera

| Plataforma | Por qué |
|---|---|
| **TikTok** | Gratis, pero tiene tres muros. Las fotos solo se suben por `PULL_FROM_URL` desde **dominio verificado**; el scope `video.publish` exige aprobación de la app; y *"All content posted by unaudited clients will be restricted to **private viewing mode**... your API client must undergo an audit."* Hasta auditar, **todo lo que publiques queda privado**. Gratis de precio, inservible sin trabajo previo. |
| **X** | **Ya no tiene plan gratuito.** Es pay-per-use: 0,015 $/post y **0,20 $/post con URL**. Contradice directamente el objetivo de no pagar por la API. |

Ambas quedan documentadas aquí para que no se reintenten dentro de seis meses
"porque son gratis".

---

## El hallazgo de Meta, y por qué está citado literalmente

De la documentación de Instagram Platform:

> *"If your app only serves **your** Instagram professional account or an
> account you manage, **Standard Access is all your app needs**."*

> Advanced Access —*"requires App Review and Business Verification"*— es solo
> para cuentas ajenas.

Y de Threads:

> *"[Threads testers] can grant your app these permissions at any time."*

**El App Review solo aplica a usuarios sin rol en la app.** La cuenta oficial
tendrá rol, así que las tres superficies de Meta se montan sin revisión y sin
verificación de empresa. No es lo que la gente cree de Meta, y dentro de un año
alguien afirmará lo contrario: por eso la cita va textual.

### Requisito duro

**Instagram exige cuenta profesional** (Business o Creator). Una personal no
puede usar la API. Threads, además, exige Instagram profesional vinculado.

### Un solo app

Facebook Page, Instagram y Threads comparten **un solo app de Meta**. Threads
tiene su propio *Use Case* dentro de él, pero la app es una.

---

## Imágenes: capturas propias, no portadas

Todas las APIs de Meta y Threads **descargan la imagen desde una URL pública**.
Dos cosas se comprobaron en la base de datos antes de decidir:

- **82 portadas** apuntan al CDN de Apple (`mzstatic.com`), el resto a archive.org.
- Todas son `/600x600bb.jpg`, o sea **600×600**.

600×600 cumple el mínimo de 320 px de Threads. Habría servido. **Pero:**

1. **No es tu imagen.** Es una URL de Apple que puede cambiar o bloquear el
   hotlinking, y no la controlas.
2. **El problema de derechos no desaparece:** la portada es obra del sello o del
   artista. Publicarla es práctica habitual en promoción musical, pero es una
   decisión editorial, no un detalle técnico.

**Decisión: capturas de la propia plataforma**, servidas desde el dominio propio
como JPEG.

| Pantalla | Qué enseña |
|---|---|
| `/` | Qué es esto |
| `/releases/[id]` | La ficha con reproductor: el producto |
| `/artists/[id]` | El dossier, que es lo que busca un periodista |
| `/shows` | La agenda de fechas |
| `/dashboard` | Lo que ve el artista al entrar |

Tema claro **y** oscuro: es funcionalidad real del producto, así que enseñar
ambos es enseñar una función, no repetir.

### La cola de aprobaciones queda fuera

Se consideró incluirla y **se descartó**. Lo escrito, para que nadie la
vuelva a añadir creyendo que es idea nueva:

Una captura de la cola transmite una cosa concreta: *aquí hay una persona
decidiendo qué se publica*. Para un periodista vale más que cualquier captura de
interfaz. Se cae por tres razones, en orden de peso:

1. **Enseña el término, no el producto.** Invita a mirar la cola: qué hay
   pendiente, quién aprobó qué, qué se rechazó. Quien entra ahí ya no está
   viendo una herramienta musical, está mirando tu moderation queue.
2. **El argumento solo funciona si la moderación es creíble**, y publicarla
   invita a examinar la política de moderación con la que quizá no quieras
   aparecer.
3. **Es la parte que más cambia.** Es interfaz de trabajo, no landing: se
   rediseña con el uso, y una captura en redes envejece mal.

**No es definitivo.** Si la moderación llega a tener algo que contar —un criterio
editorial público, un sello de "verificado por humano"— esa es una historia
mejor que cualquier captura de producto, y vuelve a tener sentido.

---

## Dónde viven las capturas

**`public/pressplay/`**, commiteadas. Vercel las sirve por CDN, así que son URLs
públicas sin más infraestructura. Unos 12–16 JPEG.

Se regeneran con un comando. No se editan a mano.

**Regla de seguridad, no opcional:** la ruta que las sirve **nunca acepta una
URL como parámetro**. Si acepta `?url=...` es un proxy abierto, y con él
cualquiera puede usar el servidor para alcanzar direcciones internas. Se
resuelve por identificador contra la tabla y se devuelve solo lo que ya está
guardado. Va con su allowlist en tiempo de ejecución, como la de las columnas de
`lib/db.ts`.

---

## Lo que hay que ver antes de dar por bueno un generador

Los scripts de captura que ya había en `scripts/` fallan **en silencio**:

- `scripts/take-screenshots.ts` apunta a rutas que no existen (`/track/trk-001`)
  y no autentica.
- `screenshots/` tiene 16 ficheros, **gitignorados**: artefactos de depuración.
- `prod-dark-home.png` y `prod-light-home.png` pesan **1,5 KB**. Una landing real
  no pesa eso: son páginas en blanco.

Un generador que "terminó con éxito" y dejó dos ficheros vacíos es peor que uno
que falla, porque el éxito falso se descubre en la publicación, no antes.

**El generador nuevo aborta si una captura sale en blanco**, midiendo bytes y
dimensiones.

---

## El reparto de subagentes

Los modelos viven **solo** en `opencode.json`; ningún `.md` de `.opencode/agents/`
declara `model:`. Hay **29 subagentes propios** —los `.md`— más el `compaction`,
que es interno. Para esta fase:

| Tarea | Subagente | Modelo |
|---|---|---|
| Escribir este documento | `doc-writer` | muse-spark-1.3 |
| E2E en producción | `playwright-tester` | space-bunny-free |
| Adaptadores | `api-builder` | space-bunny-free |
| Tests de los adaptadores | `api-tester` | space-bunny-free |
| Revisar separación borrador/publicación, SSRF, manejo de tokens | `security-auditor` | space-bunny-free |
| Verificar que las capturas no salen en blanco | `visual-tester` | muse-spark-1.3 |
| Desplegar y cerrar la release | `vercel-deployer` · `release-manager` | muse-spark-1.3 |

**Ninguno publica.** No se crea un subagente publicador: ver la regla del
principio.

---

## Orden de ejecución

Cada paso: documento → código → gate completo → commit y push. El gate es
`tsc`, `lint`, `vitest` y `build`.

| # | Paso | ¿Necesita credenciales de red social? |
|---|---|---|
| 0 | Arreglo de compactación (hecho, `b841aca`) | No |
| 1 | Este documento | No |
| 2 | E2E de producción → cerrar P12 → rc.36 | No |
| 3 | `scripts/capture-social.ts` | No |
| 4 | Test que valida las capturas | No |
| 5 | Subagente `social-drafter` | No |
| 6 | Interfaz de adaptadores + los 6 adaptadores, con HTTP simulada | No |
| 7 | **Frontera.** Aquí se para | **Sí** |

### El orden de los adaptadores

| Orden | Plataforma | Por qué en ese sitio |
|---|---|---|
| 1 | Bluesky | Sin revisión y sin cuotas que canonicen. Valida el flujo entero |
| 2 | Threads | Introduce el patrón "contenedor → publicar" de Meta |
| 3 | Instagram | Reutiliza el par anterior |
| 4 | Facebook Page | Mismo par, otro endpoint |
| 5 | LinkedIn | Flujo propio de subida de imagen |
| 6 | Mastodon | OAuth por instancia |

**Riesgo asumido, escrito:** los seis se escriben con especificación verificada
pero **sin una sola llamada real**. El riesgo no es el código: es lo que la
documentación no dice y solo aparece al ejecutar. Por eso van en ese orden y
con HTTP simulada, para que cuando llegue una credencial el fallo sea en un
sitio y no en seis.

---

## La frontera

Esta fase se entrega **hasta el paso 6 inclusive**. El punto de parada es
deliberado: los seis adaptadores existen y están probados contra capa simulada,
y no se ha hecho **ni una sola llamada real a ninguna plataforma**.

A partir de ahí hace falta lo que está en
`docs/CONFIG_TODO.md` y credenciales que dejarlas en `.env.local` y Vercel.

**No se pasan credenciales por el chat.** Se leen del fichero cuando toque.

---

## Lo que queda por decidir

- **Mastodon**: hay que elegir instancia, y el alcance depende mucho de cuál.
  Una instancia generalista desperdicia el effort; una musical llega a la gente
  adecuada.
- **Si registrar publicaciones en la base de datos.** Requiere tabla nueva y,
  por tanto, `db-migrator`. Ahora no está previsto: se asume que no.
- **LinkedIn sin límites publicados**: el primer día útil contra la API real se
  anota el número que devuelva el Developer Portal, con la fecha.
---

## Estado al llegar a la frontera

Pasos 0 a 6 hechos. **No se ha hecho ni una sola llamada real a ninguna
plataforma.**

| Paso | Qué | Commit |
|---|---|---|
| 0 | Arreglo de compactación | 841aca |
| 1 | Este documento | 821668e |
| 2 | E2E de producción → cierre de P12 |  8fc59e |
| 3 | scripts/capture-social.ts + 20 capturas |  8fc59e |
| 4 | Test que vigila las capturas |  8fc59e |
| 5 | Subagente social-drafter |  1f69ec |
| 6 | Interfaz + seis adaptadores | c93a008 |

### Lo entregado

- **20 capturas** en public/pressplay/, 3,21 MB. Se commitean porque Vercel
  sirve public/ por CDN y cada una es ya una URL pública.
- **scripts/capture-social.ts** con dos comprobaciones que abortan: el selector
  de la página tiene que existir, y el peso tiene que pasar un suelo.
- **social-drafter**, con ash, dit, write, 	ask, webfetch y
  websearch en deny.
- **lib/social/limites.ts**: la tabla única de límites con fecha.
- **lib/social/tipos.ts** + seis adaptadores con la capa HTTP inyectada.
- **1.657 tests** en 84 ficheros. Gate: 	sc, lint, itest y uild limpios.

### Lo que se encontró por el camino

Tres cosas que no estaban en el plan y quevalen más que el plan:

1. **Un bug real en alidar de Mastodon**: comparaba siempre contra el 500 de
   la tabla, así que con una instancia que permite 280 un texto de 300 pasaba.
   Lo encontró el test al fijar limiteTexto: 280, no la lectura del código.
2. **Un fallo de diseño propio**: AdaptadorSocial no tenía publicar, así que
   crearAdaptador() devolvía la mitad de un adaptador. Corregido en los seis.
3. **La landing y la ficha de release no tienen landmark <main>.** Se vio al
   escribir el generador. Deuda de accesibilidad, anotada para su ronda.

### Lo que queda sin confirmar, y por qué es donde mirar primero

Nada de esto se ha podido comprobar sin una llamada real. El subagente lo
declaró en vez de rellenarlo:

| Plataforma | Sin confirmar |
|---|---|
| **Threads** | La forma de cada elemento de children en un carrusel |
| **Instagram** | El patrón de dos fases del carrusel |
| **LinkedIn** | El verbo PUT para subir los bytes, y el nombre del campo image |
| **Bluesky** | El máximo de imágenes por post; si la contraseña es de cuenta o *app password* |
| **Mastodon** | El máximo de medios por estado |

**El orden de comprobación es el de los adaptadores**, porque es el orden en que
se puede fallar: Bluesky es el único sin muro de revisión, y su límite de
imágenes es el único que no tenemos. Si algo falla, empieza por ahí.

### Lo que hace falta para cruzar la frontera

| Plataforma | Qué |
|---|---|
| **Bluesky** | App password de la cuenta. **Empieza por aquí**: es el más rápido |
| **Meta** | Un app. Threads como *tester*, Instagram en cuenta **Profesional**, client secret |
| **Mastodon** | La instancia elegida y su token. **Hay que elegirla**: el alcance depende de cuál |
| **LinkedIn** | Client ID y secret. Ojo: sus límites no se publican, se descubren probando |

Los secretos van a .env.local y a las variables de Vercel marcadas como secret.
**No se pasan por el chat**: se leen del fichero.

Una vez haya una credencial, el orden es: **una** publicación de prueba a mano
por el admin, comprobar que el flujo funciona, y solo después conectar el panel.