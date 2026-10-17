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
---

## RC.37 - Token de Meta: seis nombres que estaban mal

La parte de credenciales de esta fase seattemptó por escrito antes que por
código, y esa decisiónSave the trabajo: **seis de los nombres que di estaban
mal**, y todos se habrían escrito en el `.env.local` y en el código.

No los cuento como seis fallos equivalentes. Los dos primeros son la misma
cosa —no había mirado la pantalla que el usuario tenía delante— y los cuatro
siguientes son consecuencia de haber seguido sin verificar. **La diferencia
importante no es cuántas veces fallé, sino que seguí fallando sin comprobar.**

### Los seis

| Dije | Real | Por qué lo dije |
|---|---|---|
| Botón "Generar token de acceso" | "Crear ajuste" | No miré la pantalla |
| Empieza por activos y permisos | Nombre, variación, identificador, activos, permisos | Sigue el orden equivocado |
| `pages_manage_posts` no existe | Existe, bajo el caso de uso de Page | Lo puse en duda sin comprobar la tabla oficial |
| Registrar la cuenta de IG como desarrollador | No existe ese rol para un activo | Inventé un requisito |
| `instagram_content_publish` | `instagram_content_publish` | **Yo me equivoque aqui.** Ver abajo |
| Los permisos no están disponibles | Están, en otro caso de uso | No busqué por qué el buscador vacío |

### Lo que sí explica el buscador vacío

`developers.facebook.com/docs/development/create-an-app/use-cases-permission-mapping`
tabula los permisos **por caso de uso**, y las filas no se mezclan:

- *Manage everything on your Page* → `pages_manage_posts`, `pages_read_engagement`,
  `pages_show_list`, `read_insights`
- *Manage messaging & content on Instagram* → `instagram_basic`,
  `instagram_content_publish`, `pages_read_engagement`,
  `pages_show_list`, `business_management`

El asistente de Login for Business solo ofrece los del caso de uso de Facebook.
Por eso `instagram_basic` daba "no coincide ningún resultado": **no faltaba,
se estaba buscando en la lista equivocada.**

### La contradicción de la documentación, y por qué la pierde

La página del caso de uso de Instagram pide **`instagram_content_publishing`**, con
`-ing`. La referencia de permisos lista **`instagram_content_publish`**, sin
`-ing`. **Las dos son de Meta y no coinciden.**

La que acepta el diálogo es la **segunda**. Comprobado:

| `scope` enviado | Resultado |
|---|---|
| `instagram_basic` | HTTP 200, pide iniciar sesión |
| `instagram_content_publishing` | **HTTP 500**, "Sorry, something went wrong" |
| `instagram_content_publish` | HTTP 200, pide iniciar sesión |

Es un **500**, no un 400 de permisos. Es decir: el servidor ni siquiera llega a
evaluar el permiso, revienta al construir la petición. Por eso el mensaje es el
genérico y no dice nada de scopes, y por eso seis intentos de adivinar nombres
no podían converger.

**Un control con un `client_id` inventado da un error distinto** —"Identificador
de la app no válido"— lo que confirma que el 500 es del `scope` y no de la app.

### El método que sí funcionó: bisecar la URL

Ni Hypótesis ni memoria: quitar un parámetro cada vez hasta que el 500
desaparezca, y **leer el HTTP de cada combinación**. Diez peticiones, y el
culpable queda aislado sin adivinar.

Vale aquí lo que vale en `tests/unit/adaptadores-social.test.ts`: un
comportamiento que se rompe se comprueba **contra el sistema**, no contra lo que
uno recuerda de haber leído. La referencia de permisos que yo había descargado
decía `instagram_content_publish` y **la había pasado por alto**, precisamente
porque ya venía con una "corrección" mía escrita en el mismo sitio.

### El token vuelve en el fragmento

Esto es lo que decide la arquitectura de la página de callback:

```
https://tu-callback?#access_token=...&long_lived_token=...&expires_in=...
                     ↑ lo que va tras # no llega al servidor
```

El fragmento no viaja en la petición HTTP. **Un route handler de Next.js no puede
leerlo**, por muy bien escrito que esté. Tiene que ser una página de cliente que
lea `window.location.hash`, y por eso `app/auth/meta/callback/page.tsx` es
`'use client'` y no un `route.ts`.

Por el mismo motivo la página limpia la URL con `history.replaceState` en
cuanto lee el fragmento: si se queda en la barra de direcciones, está en el
historial del navegador y en el `Referer` de lo que se cargue después.

### `localhost` no hay que registrarlo

Aviso literal del panel, que parece error y no lo es:

> *"Las redirecciones de `http://localhost` se permiten de manera predeterminada
> cuando la aplicación se encuentra en modo de desarrollo, por lo que no es
> necesario añadirlo aquí."*

Con el distintivo **Sin publicar**, `http://localhost:3000/...` vale sin
registrarlo. Registrarlo produce un error rojo que no significa nada.

### `/me/accounts` devuelve las tres credenciales de una vez

Esto sustituye al script intermedio que tenía planeado:

```
GET /me/accounts?fields=id,name,access_token,instagram_business_account
```

Cada elemento trae `id` (Page), `access_token` (**de Page**, no de usuario) e
`instagram_business_account.id`. **Un solo GET** da las tres cosas.

Lo que sí queda confirmado: **el token de Page y el token de usuario son
distintos**. `lib/social/config.ts` mapeaba una sola variable a los dos papeles,
que habría fallado en producción con un 401 que habla de permisos y no del
token. Ahora son `META_USER_ACCESS_TOKEN` (intermedio) y
`META_PAGE_ACCESS_TOKEN` (el que usa `facebook.ts`).

---

## RC.38 — Mastodon: la instancia estaba creada, solo faltaba la URL

### El URN de OAuth no es una URL

```
MASTODON_URL=urn:ietf:wg:oauth:2.0:oob" # para pruebas locales
```

Eso es el URN que la spec de OAuth define para "no hay `redirect_uri`", copiado de
la documentación. **Mastodon no se habia configurado nunca** en el sentido de que
nadie sabe en que instancia esta la cuenta.

Y aqui hay una ironia que conviene escribir: el error no lo daba la API. Daba un
`fetch failed` generico, porque el `urn:` no es un esquema que `fetch` sepa
abrir. Un mensaje util habria sido "esto no parece una URL".

### Se prueban las instancias en vez de preguntar

`MASTODON_ACCESS_TOKEN`, `MASTODON_CLIENT_ID` y `MASTODON_SECRET` si estaban, y
**tenian la forma real** de un token de Mastodon. O sea: la cuenta existia.

Un token de Mastodon **solo vale en la instancia que lo emitio**. Se probaron 14
instancias grandes con `GET /api/v1/accounts/verify_credentials` y salio una:

    https://mastodon.social  ->  @pressplay_epk

Sin preguntar nada. El mismo dato que hacia falta salio de medir, no de recordar.

### Lo que se midio de la instancia

`GET /api/v1/instance` da los limites reales, que **no son los de la tabla**:

| | `limites.ts` | `mastodon.social` |
|---|---|---|
| Caracteres | 500 (por defecto del software) | **500** |
| Imagenes por post | `null` (sin verificar) | **4** |
| Peso maximo de imagen | — | **16 MiB** |

Los caracteres coinciden con el valor por defecto, asi que `limiteTexto` puede
quedarse sin definir. Los 4 adjuntos **no estaban verificados** y ahora si: es un
dato que cambia el comportamiento del adaptador cuando se publique un carrusel, y
no adivinarlo habria significado subir 6 imagenes a una instancia que acepta 4.

Un `OPTIONS` a los endpoints dio 404 en todos, **incluido el que sí funciona por
GET**: `mastodon.social` no implementa `OPTIONS` con esa cabecera. El script se
tiro; comprobar permisos de escritura sin escribir **no es posible** en Mastodon,
porque no hay endpoint de introspeccion de scopes. La prueba real es un post, y ese
lo decide el usuario.

## RC.39 — Threads: dos apps, no una app con permisos

La documentacion de Meta lo dice sin rodeos:

> "When creating your app there will be **2 app IDs and app secrets**. For Threads
> API implementation purposes, use the **Threads app ID** and its corresponding
> app secret."

Comprobado en `.env.local` y **los cuatro valores son distintos entre si**:
`THREADS_APP_ID` (`1390840160777783`) no es `META_APP_ID`
(`1654721962854119`), y sus secrets tampoco. No es un error de configuracion: es
la forma que tiene Threads.

Y `graph.threads.net` es otro dominio. Dos hosts distintos significan dos rutas de
OAuth distintas, y por eso el `grant_type` del intercambio tambien es distinto:

| | Facebook | Threads |
|---|---|---|
| Host | `graph.facebook.com` | `graph.threads.net` |
| Intercambio | `fb_exchange_token` | `th_exchange_token` |
| Caducidad del largo | no caduca | 60 dias, refrescable |

Hay un test que comprueba el `grant_type` entero y **no** por subcadena, porque
`th_exchange_token` contiene `fb_exchange_token` dentro: un `not.toContain` de la
version de Facebook se cumple con el valor correcto y no protegeria nada.

### El App ID de Threads existe

`GET graph.threads.net/{app-id}` sin token responde **190 Invalid OAuth 2.0 Access
Token**, no "app no encontrada". La diferencia importa: 190 significa que el App ID
**existe** y solo falta el token, mientras que un id inventado daria "Unsupported
get request". Es la misma distincion que en Facebook, donde "no existe" y "no lo
ves" dan mensajes parecidos.

### El flujo, y cual de los tres pasos es mio

1. **Tú**: el usuario acepta el **Authorization Window** y Meta redirige con un
   **authorization code**. Dura **1 hora** y es de **un solo uso**.
2. **Yo**: `POST /oauth/access_token` con `grant_type=authorization_code` cambia
   ese code por un token de 1 hora.
3. **Yo**: `grant_type=th_exchange_token` lo cambia por uno de 60 dias.

Los pasos 2 y 3 los hace `scripts/threads-token.ts` con las dos variables que ya
existen. **No se puede comprobar el canje sin un code**, y un code solo se
consigue en un navegador: por eso esta fase se queda esperando en el paso 1.

## RC.40 — Threads: la URL que di era de Facebook, y el canje no era un GET

### `PLATFORM_INVALID_APP_ID` era diagnostico, no ruido

La URL que di en RC.39 era `facebook.com/dialog/oauth`, que es el **login de
Facebook**. Threads tiene su propio Authorization Window en **`threads.com`**, y el
error lo decia:

> "Identificador de aplicacion no valido: el identificador de aplicacion
> proporcionado no parece un identificador de aplicacion valido."

O sea: el App ID de Threads no vale *para ese dialogo*. No estaba mal el App ID —
estaba en el sitio equivocado. Siete nombres y URLs erroneos en esta fase, y este
se habia evitado de leer la documentacion antes de escribir el mensaje de error.

La URL buena, comprobada con `curl -L`:

    https://threads.com/oauth/authorize?client_id=...&redirect_uri=...
      &response_type=code&scope=threads_basic,threads_content_publish

Responde `301` a `www.threads.com` y de ahi `302` a `/login`, que es lo correcto
para alguien sin sesion. **No da error.** Comprobado, no supuesto.

### El canje es POST a `.com`, y el secret va en el cuerpo

Tres cosas que solo se ven leyendo la doc del canje:

| | Lo que puse en RC.39 | Lo que es |
|---|---|---|
| Metodo | `GET` con query | **`POST`** con cuerpo |
| Host | `graph.threads.net` | **`graph.threads.com`** |
| `client_secret` | en la query | **en el cuerpo** |

El host es el detalle caro: `.net` es el host de la API, y el endpoint de OAuth
existe en `.com`. A `.net` daria 404.

Y con el secret en el cuerpo hay un test que lo comprueba. En la query el secret
queda en el historial del navegador, en los logs del proxy y en cualquier
`Referer` que salga despues. Es un app secret.

### El canje devuelve el `user_id` de regalo

La respuesta trae `access_token` **y** `user_id` en el mismo JSON, asi que
`THREADS_USER_ID` sale de ahi sin una segunda llamada. Y el ejemplo de la
documentacion lo manda como **numero** (`17841405793187218`), no como string: hay
un test que comprueba que se convierte, porque `THREADS_USER_ID` es string en
todas partes y un number colado haria fallar la comparacion con el id del API sin
motivo aparente.

### El `#_` del final

Meta documenta que al code se le anade un `#_`:

```
https://tu-callback/?code=AQBx-hBsH3...#_
```

> "`#_` will be appended to the end of the redirect URI, but it is not part of the
> code itself, **so strip it out**."

Lo mismo que el `#access_token` de Facebook: llega en el fragmento y no forma parte
del valor.

## RC.41 — La pagina de callback no sabia leer el code, y el code se perdia

### El fallo era de la pagina, no del script

`lib/social/meta.ts` tenia `leerFragmento`, que lee `#access_token=...`. Threads
devuelve el code **en la query**, `?code=...`. La pagina solo llamaba a
`leerFragmento`, asi que abria, no encontraba nada, y decia "No hay ningun token
en la URL".

Lo grave no es el mensaje: es el orden de las lineas. El `useEffect` hace
`replaceState` **antes** de pintar. Para cuando aparecia el aviso, el code ya
habia salido de la barra de direcciones. Quien venía del login se encontraba una
pagina que decia que no habia nada, con el code ya borrado y sin forma de
recuperarlo. Un code de Threads es de un solo uso: pedir otro obliga a repetir
todo el login a mano.

Se noto al hacer el test, no al leer el codigo. Siete RC y la pagina nunca se
habia ejecutado con la URL que Threads manda de verdad.

### `leerQuery`, al lado de `leerFragmento`

Las dos mitades de la URL se leen por separado y se mezclan en el componente.
No se intenta una unica funcion que entienda de las dos: el token de Facebook y
el code de Threads son credenciales distintas con vidas distintas (24 h y una
hora), y tratarlos como lo mismo es como se confunden.

La pagina ahora dice **que** ha leido y **como** usarlo, porque el comando es
distinto:

| | Facebook | Threads |
|---|---|---|
| Viene en | fragmento `#` | query `?` |
| Vida | 24 h | **1 hora**, un solo uso |
| Se pasa a | `.env.local` | `THREADS_AUTH_CODE` |

### El `#_` que manda Threads

```
https://tu-callback/?code=AQBx-hBsH3...#_
                                       ↑ esto
```

Meta documenta que "no forma parte del code, quítalo". Aqui no hay nada que
quitar — el code esta en la query — pero si hay algo que evitar: que alguien lea
el `#_` como si fuera un valor. Hay un test que pasa `#_` a `leerFragmento` y
comprueba que devuelve `SIN_TOKEN` y **no** `"_"`. Sin ese test, el unico
candidato a "arreglar" el parser es justo el que lo rompe, y el canje falla en
el script con un error que no menciona la URL.

### La errata de la documentacion de Meta

La tabla de errores escribe `acceess_denied` (tres ceses) y el ejemplo de mas
abajo pone `access_denied`. Hay un test que fija que **los dos pasan tal cual**:
normalizar "acceess" -> "access" estaria mal, porque si Meta cambiase el valor,
un parser que "limpia" lo conocido se lo tragaria en silencio.

### `??` donde tocaba `||`

`redirectUri` se leia con `??` en un sitio y con `||` en otro. `??` no salta ante
`""`, solo ante `null`/`undefined`, asi que con `THREADS_REDIRECT_URI=` presente
pero vacia — lo que deja un editor al guardar una variable sin valor — el canje
salia con `redirect_uri=` a pelo. Threads lo rechaza, y su error no menciona la
redirect_uri: **parece un code caducado, que no es**. Era el mismo bug que ya
habia salido en el mensaje de ayuda de RC.40, y no estaba arreglado: se habia
arreglado un sitio y no el otro.

### Y el 404 que no era un 404

Los 14 E2E fallaron de golpe, incluidos los 7 de RC.37 que pasaban antes. La
pagina daba 404 y Playwright decia que su `webServer` no arrancaba. No era la
pagina: habia un `next dev` viejo en el 3000 sirviendo un build anterior a la
ruta, que respondia 200 en `/` y 404 en `/auth/meta/callback`. Un servidor viejo
que responde 200 es peor que uno caido, porque el gate parece sano.

El sintoma que lo delata: **una suite entera falla a la vez**. Un cambio de
codigo rompe un test; un servidor stale rompe todos. Antes de culpar al codigo,
comprobar que el servidor es el actual.

Gate: 1747 tests en 88 ficheros, tsc y lint limpios, 14/14 E2E del callback.

## RC.42 — Los dos callbacks que faltaban, y por que `1349168` no era la lista

### `1349168`: "la URI no esta incluida en la lista de autorizacion OAuth"

Ese error se leyo como "no has guardado la URI en App settings". Se habia
guardado: habia appearing "Se guardaron los cambios" justo antes.

Lo que faltaba era **el otro sitio**. Threads no lee la lista de
*Facebook Login for Business*, sino la del **caso de uso**: *Casos de uso ->
Acceder a la API de Threads -> Configuracion -> Redirigir URL de devolucion de
llamada*. Ese campo estaba vacio, y el propio formulario lo decia con un error
que no parece de campo obligatorio sino de validacion:

```
El formulario no se puede guardar
  Redirect Urls: Especifica un URI de redireccionamiento de OAuth
```

El orden de los hechos explica por que ambos errores coexistieron:

1. Con la lista de la app vacia, rellenar el campo del caso de uso no se podia
   guardar.
2. Con la lista ya guardada, el Authorization Window seguia dando `1349168`
   porque el caso de uso no tenia URI.

Ni el uno ni el otro se resolvia solo. Era un ciclo, y por eso los dos seemed
fallos a la vez.

### Los dos callbacks que faltaban

La doc de Meta pide **tres** URLs en el mismo paso, y solo se estaba haciendo la
primera:

| URL | Para que |
|---|---|
| URI OAuth validos | adonde vuelve el Authorization Window |
| Deauthorize callback | Meta hace ping al revocar |
| Data deletion callback | Meta hace ping al pedir borrar datos |

Las otras dos apuntaban a nada. Anadidas:

- `app/meta/deauthorize/route.ts` — `GET` y `POST` a `200`.
- `app/meta/data-deletion/route.ts` — `GET` devuelve la pagina de instrucciones
  para una persona; `POST` acepta la peticion firmada de Meta.

### Por que `GET` devuelve HTML en la de eliminacion

Porque Meta usa **una sola direccion para dos lectores**. La pagina la lee alguien
que pide borrar sus datos, y el `POST` lo hace Meta. Splittearlas obligaria a
inventar la segunda. Y un `{"ok":true}` en crudo leeria quien llega desde Threads
como "me han ignorado".

### Las dos rutas no borran nada, y lo dicen

La peticion de eliminacion llega firmada con `X-Hub-Signature-256`. **Validar esa
firma es lo que separa un `POST` real de uno cualquiera**, asi que sin ella
cualquiera que descubra la URL podria escribir en ella. No se borra nada todavia.

El `POST` responde `{ok: true, borrado: "pendiente"}` y **no** `{borrado: true}`:
un `200` diciendo que si, haria que Meta creyera que un desconocido puede borrar
cuentas. Hay un test que ata el texto de esa pagina para que no siga diciendo
"pendiente" cuando el codigo ya borre.

Igual en *desautorizar*: el texto dice "autorizacion revocada" pero **no dice que
hemos revocado el token**, porque no lo hemos revocado. El token sigue vivo
hasta que caduca. Un `200` honesto es mejor que un `200` que miente.

Gate: 1753 tests en 89 ficheros, tsc y lint limpios.

## RC.43 — El `1349168` no lo arregla el repo, pero hay una puerta que no exige OAuth

### Lo que se ha descartado, con evidencia

Cuatro hipotesis seguidas, y **las cuatro falsas**:

| Hipotesis | Como se cayo |
|---|---|
| Falta registrar la URI en el panel | Registrada y guardada (`Se han guardado los cambios`) |
| El nombre de Threads esta pillado | `PressPlay EPK` y `PressPlay Music` fallan igual |
| Falta el rol *Threads Tester* | Ya estaba en la captura de Roles |
| Falta aceptar la invitacion | Toast `Invite accepted` |

El `1349168` persiste con las cuatro piezas verificadas. **No es un problema de este
repo**, y a partir de aqui dejaria de adivinar sobre un panel que no se puede ver
desde aqui.

### La pista que estaba en la captura y no se leyo

El panel donde se guardo la URI tiene esta URL:

```
developers.facebook.com/apps/1654721962854119/business-login/settings/?business_id=1125540349998145
```

Es `/business-login/settings/`: **Facebook Login for Business**, que es un panel
distinto del ajuste de OAuth de la app. Threads no es Facebook Login, asi que es
plausible que lea otra lista. Y el rol lo muestra tambien la app:

> "Cuenta de Meta Business Suite: PressPlay EPK administra esta aplicacion."

Sin confirmar: una sesion de administracion de Business Suite puede tener
sustituido el guardado del panel de la app.

### La puerta de atrás: el Generador de identificadores

El panel de Threads trae un bloque que no es OAuth en absoluto:

> **Generador de identificadores de usuario** — Genera identificadores de acceso
> de larga duracion para los **evaluadores de Threads** de esta aplicacion. Solo
> se pueden generar identificadores para cuentas publicas de Threads.

`pressplayepk` ya es evaluador (consta en Roles), asi que **este bloque emite un
token de larga duracion sin Authorization Window y sin `redirect_uri`**. No
contorna una comprobacion de seguridad: contorna una casilla del panel que se ha
quedado atascada, y solo aplica a cuentas que ya tienen rol en la app.

### `--token=` en el script, y por que NO se alarga

```bash
npx tsx scripts/threads-token.ts --token=EL_TOKEN --apply
```

o, mejor en PowerShell para no dejarlo en el historial:

```powershell
$env:THREADS_DASHBOARD_TOKEN = "EL_TOKEN"; npx tsx scripts/threads-token.ts --apply
```

**No se pasa por `th_exchange_token`.** El token del generador ya es largo, y ese
canje **consume el token de entrada**: pasarselo lo gastaria y habria que ir al
panel otra vez. Aqui solo se valida con `GET /me` y se saca el `user_id` de la
misma respuesta.

Hay un test que comprueba que **el token no sale por pantalla** en la rama nueva.
Un script que valida tokens no puede imprimirlos.

### Lo que queda pendiente de verdad

`redirect_uri` hay que resolverlo antes de implementar el OAuth real en la app
para otros usuarios. Se reporta con el Bug Tool de Meta citando `1349168`, con
las cuatro piezas verificadas. Anotado aqui para que no se pierda.

## RC.44 — Threads tiene el permiso de publicar, comprobado sin publicar

### El permiso no se pide, se demuestra

Que el token "funcione" en `social-smoke.ts` solo demuestra `threads_basic`: la
comprobacion lee `GET /me` y nada mas. **`threads_content_publish` es otro
permiso**, y el flujo que lo pedia —el Authorization Window con
`scope=threads_content_publish`— nunca llego a completarse por el `1349168`.

Hay un endpoint que lo demuestra sin escribir nada:

```
GET /{threads-user-id}/threads_publishing_limit?fields=quota_usage,config
```

> "This endpoint requires the `threads_basic` and `threads_content_publish`
> permissions."

```
[OK]  quota_usado=0  de 250 cada 86400s
```

Es una **lectura**. Y sirve: si el permiso no estuviera, responderia 403 y el
mensaje seria sobre permisos, no sobre cuota. El token de `pressplayepk` puede
publicar.

### Lo que Threads ya tiene y lo que no

| | Estado |
|---|---|
| Credenciales contra la API real | ✅ `@pressplayepk`, id `29332926652967905` |
| `threads_content_publish` | ✅ concedido, cuota 250/dia sin usar |
| Adaptador (`redactarThreads`, `crearContenedor`, publicar) | ✅ implementado |
| **Algo que llame al adaptador** | ❌ **no existe**: `threads_publish` no aparece en `app/` |
| Primera publicación real | ❌ ninguna, y no se hace sin aprobacion |
| **Medio accesible publicamente** | ❌ **es el siguiente obstaculo real** |

### El medio obligatorio

De la documentacion del API:

> "We download media used in publishing attempts so **the media must be hosted on
> a publicly accessible server** at the time of the attempt."

Y `threads_publish` pide `media_id`. O sea: **un post de solo texto tambien
necesita imagen** — tipicamente un PNG transparente de 1x1 — porque el
contenedor se crea siempre contra una URL. Meta **descarga** el fichero en el
momento del intento: una URL que solo responde autenticada, o que cambia, deja
el post a medias con un error que no dice "tu imagen no es publica".

Esto no es un detalle de implementacion, cambia el diseno: hace falta una ruta
sirva el medio desde `epk-dashboard.vercel.app` sin sesion. El adaptador ya sabe
lo que es un `Imagen`; lo que falta es la ruta que lo publique.

### Los dos timers que nadie esta mirando

- **El token caduca a los 60 dias** y hay que refrescarlo con
  `GET /refresh_access_token?grant_type=th_refresh_token` **antes**, mientras siga
  vivo. Pasado ese punto no hay renewal: hay que volver al panel.
- **`redirect_uri` sigue sin resolverse.** No bloquea esta cuenta, pero bloquea
  el OAuth para cualquier usuario que no sea evaluador. Se reporta con el Bug
  Tool de Meta.

## RC.45 — Threads publicable: comprobar el medio, y dos rutas que no se confunden

### El fallo mas caro de Threads no es de permisos, es de medio

> "We download media used in publishing attempts so **the media must be hosted on a
> publicly accessible server** at the time of the attempt."

Meta **descarga** la imagen cuando se publica. Un medio que no se puede descargar
no da un error de "imagen no valida": da un `400` opaco, o crea el contenedor y
deja la publicacion **a medias**. Y una publicacion a medias ya la ve gente.

Por eso la comprobacion va en el `preview()`, que es gratis y repetible, y no en
el `publicar()`, que no lo es.

### `problema` y `aviso` no sondecorators, son la decision

- `problema` -> **bloquea**. No depende de la red, asi que reintentar no lo arregla:
  `http://` en vez de `https://`, localhost, un HTML en vez de una imagen, 9 MB.
- `aviso` -> **no bloquea**. Un `HEAD` que revienta, un `403`, un CDN sin
  `content-length`. El requisito real de Threads es que el **`GET`** de la imagen
  funcione, y eso no lo responde un `HEAD`. Bloquear aqui dejaria al admin sin
  poder publicar por un CDN que funciona.

Hay tests para las dos mitades, incluida la direccion: un fallo de red que
bloquearia sale como `ok: true` con aviso.

### Las dimensiones NO se comprueban

Saber si una imagen mide 320x320 o 50x50 exige bajarla entera y parsear la
cabecera de JPEG, PNG o WEBP. No se hace, y el `preview` **lo dice** en un aviso.
Un aviso honesto vale mas que una comprobacion que da seguridad falsa.

### El `preview` no puede publicar. Ni por error deflags

La razon de que sean dos rutas y no una con `publicar: true` es que **una ruta
que no puede publicar no tiene ningun camino de codigo que escriba en Threads**.
Con un flag, un `?publicar=1` o un valor por defecto equivocado es una
publicacion real.

Y la de publicar exige `confirmar === true`, chequeado con `=== true` y no de
presencia: `{"confirmar": "si"}` y `{"confirmar": 1}` se quedan fuera. Los tests
miran **`fetch` llamado 0 veces**, no el codigo de respuesta: un `400` con la red
tocada habria publicado el post y luego avisado del error.

### Revalida en el momento de publicar

No confía en lo que el navegador le dijera al `preview`. El texto puede haber
cambiado entre una llamada y otra, y validar es gratis. Un cliente que nunca haya
pasado por el `preview` puede publicar igual, pero nunca con texto sin validar.

### Comprobado en local, contra la API real

```
[recorte-900]     listo=true  chars=500        <- recorta y lo dice
[portada-itunes]  listo=true  img[ok=true tipo=image/jpeg bytes=89063]
[url-no-imagen]   listo=false ERROR: no devuelve una imagen sino `text/html`
[http-no-https]   listo=false ERROR: tiene que ser https
[localhost]       listo=false ERROR: Meta esta en otro servidor
```

Las portadas que ya hay en `tracks.cover_image` son URLs de CDN publico
(`is1-ssl.mzstatic.com`, 600x600, 87 KB): cumplen el minimo de 320 px de ancho y
el maximo de 1440. **Se pueden publicar tal cual**, sin tuberias de medios.

### Lo que falta para usarlo en produccion

Las rutas leen `THREADS_APP_ID`, `THREADS_USER_ID` y `THREADS_ACCESS_TOKEN` del
entorno. Esas tres estan en `.env.local` y **no en Vercel**: en produccion la ruta
responde `503` diciendo que variables faltan, por nombre y nunca por valor. El
token tampoco es de producción: es el del generador del panel, para `@pressplayepk`.

## RC.46 — El paso es un campo, y a publication se responde con un informe

### `ErrorApi` estaba copiado en los seis adaptadores

Identica byte a byte, seis veces. Anadir un campo obligaba a seis ediciones que
podian divergir sin que nada lo indicara. Ahora es una clase sola en `tipos.ts`, y
`plataforma` y `paso` son campos.

Y `paso` es un **vocabulario cerrado** (`sesion`, `medio`, `contenedor`,
`publicar`, `consulta`), no texto libre, porque la pregunta que hay que poder
contestar es "¿que fallo?" y contestarla exige poder **filtrar**. La distincion que
mas importa: `createSession` de Bluesky es `sesion`, no `publicar`. "La contrasena
de la app esta mal" y "la API fallo al publicar" piden acciones distintas, y un
solo string las mezcla.

### Los pasos de cada plataforma, que no son todos iguales

| Plataforma | Pasos |
|---|---|
| Facebook | `publicar` (`/feed`) despues `medio` (`/photos`) |
| Mastodon | `medio` y `publicar` |
| Threads | `contenedor` y `publicar` |
| Instagram | `medio` (hijos de carrusel), `contenedor`, `publicar` |
| Bluesky | `sesion`, `medio`, `publicar` |
| LinkedIn | `medio` (x2), `publicar` |

Que Facebook y Threads hagan `/feed` y `/threads` **antes** de adjuntar el medio
significa que un fallo en el paso 2 deja un post **ya publicado sin imagen**. Marcar
el primer paso como `publicar` es lo que hace visible eso en el informe en vez de
salir como "anadio la foto".

### Por que el script y no una ruta web

Porque el token tiene que vivir en algun sitio. En una funcion serverless,
cualquiera con una sesion de admin valida pasa a poder publicar en la cuenta de la
marca: eso no es "admin de una app de musica", es control de la presencia en
redes. En el `.env.local` de una persona, solo publica quien tiene ese fichero.

Las variables de Threads **no estan en Vercel** y no se van a poner.

### `no-intentado` es un estado, no la ausencia de uno

Con dos estados ("publicado" / "fallo"), despues de un fallo no se puede
contestar que paso con las siguientes: se quedaron en un limbo. El tercero
responde exactamente eso.

### El fallo que casi se cuela: mirar el pre-flight dentro del bucle

La primera version de `publicarEnOrden` comprobaba `preparado.listo` en cada
vuelta. Con Threads listo y Mastodon no, **publicaba Threads y luego se
paraba**. El test lo caza:

```
Expected: publicadas 0
Received: 1
```

El pre-flight se mira **entero y antes de empezar**. Si una plataforma no esta
lista, no se escribe en ninguna: un fallo barato en la segunda no puede dejar un
post fuera sin avisar.

### Por que `Promise.all` no aparece en ninguna parte

Rechaza en el primer error y **pierde los resultados de las demas**. Publicando
en cuatro con uno roto, `Promise.all` daria a entender que no salio ninguno.
Secuencial, y con corte en el primer fallo.

### El informe sobrevive al terminal

`informes/publicacion-<ts>.json`, con una linea por plataforma. Sin eso, un fallo
a las tres de la manana no se puede diagnosticar. `informes/` esta en
`.gitignore`: es historial de salida a internet, no codigo.

El informe **no lleva tokens**: hay un test que lo comprueba.

### El token de Threads caduca a los 60 dias y no se renueva

El permission grant dura 90 si el perfil es publico y refrescarlo lo extiende. El
**token** son 60, y despues no hay renewal: hay que volver al panel.

Aviso con margen, a partir de 14 dias, y uno especifico cuando ya caduco, que dice
que solo se arregla desde el panel. La antiguedad se saca del **mtime** de
`.env.local` en vez de una variable de fecha, porque esa variable se queda vieja
en cuanto se regenera el token y nadie se acuerda de actualizarla. Va en la
direccion segura: avisa de mas, no de menos. Y si no sabe, **no dice nada** en vez
de decir "todo bien".

### Estado de las seis plataformas

| Plataforma | Publica | Probado contra la API real |
|---|---|---|
| Threads | si | perfil y cuota. El camino de escritura, solo con capa falsa |
| Facebook | si | no |
| Instagram | si | no |
| Mastodon | si | no |
| Bluesky | si | no |
| LinkedIn | si | no |

`--plataformas` es **obligatorio y sin valor por defecto**. Un "publicar en todas
las configuradas" por defecto es un accidente esperando en cuanto se anade una
plataforma nueva.

Nota: 2 tests de `deezer-previews.test.ts` fallan desde antes de RC.46, en HEAD.
No se han tocado.

Gate: 1799 tests en 91 ficheros (2 fallan, los de Deezer), tsc y lint limpios.

### El override de compactación: medido, y no funciona

La compactación de `space-bunny-free` seguía saltando al ~50 %. Durante meses la
explicación fue que el modelo declara `limit.output = 524288` —la mitad de sus
1.048.576 de contexto— y que `opencode.json` lo bajaba a `32000` para subir la
ventana al ~95 %.

**No funciona. Se midió.**

`opencode debug config` resuelve el valor: `output: 32000`. Es decir, **la
configuración se lee**. Pero leerla no es aplicarla.

#### El experimento, y por qué con mimo y no con space-bunny

Probarlo con el modelo de 1M exigiría llenar medio millón de tokens. La pregunta
—"¿lee el runtime el override?"— se responde con un modelo de 200K donde el
efecto es brutal:

- Contexto 200.000, salida real 32.000 → ventana **168.000** (84 %).
- Con `limit.output = 190000` → ventana **10.000** (5 %).

Una sesión con `opencode run -m opencode/mimo-v2.6-flash-free --format json` dio
`cache_read` de **180.800**. Con 10.000 de ventana eso es imposible.

**El runtime no aplica `provider.*.models.*.*.limit.output`.** Dos indicios de
por qué no podía: el schema marca `provider` como **`deprecated: true`**, y la
documentación solo explica `provider.*.models.*.variants`, **nunca `limit`**.

La línea se quitó de `opencode.json`. Dejarla era peor: una línea que *parece*
arreglar un problema y no lo hace.

#### El test anterior era una tautología

`override-compaction.test.ts` afirmaba `usable > 0.9`, calculado sobre los números
del propio JSON: `1048576 − 32000` da 96,9 %, **sea cual sea el mundo**. Pasaba
siempre y no protegía de nada.

Lo interesante es que su cabecera **sí era honesta**: "No comprueba que la
compactación ocurra al 95 %". Ató la configuración, no el comportamiento, y lo
dijo. El problema es que la existencia del test implicaba que algo estaba
vigilado, y `AGENTS.md` afirmaba el 95 % sin ninguna salvedad.

Reescrito para atar lo único que **sí** se puede degradar en silencio: que la
documentación no afirme un arreglo inexistente, y que registre el procedimiento
para volver a comprobarlo cuando opencode cambie.

#### Un cabo suelto, dicho

La fórmula `context − output` sigue siendo una inferencia. Con el dato nuevo hay
un cabo: `cache_read` llegó a 180.800 en un modelo cuya ventana `context − output`
da 168.000. Así que la cuenta del runtime **no es exactamente** esa fórmula.

Lo que sí es sólido: `space-bunny-free` declara 524.288 de salida sobre 1.048.576.
Reservar la mitad del contexto para la salida deja media ventana, y ese es el
número que manda. `reserved` se queda en 20000: bajarlo a 0 ganaría un 1,9 % de
los 524K reales y dejaría sin margen para la salida del modelo.

#### La defensa real

No hay arreglo por configuración. La palanca es **no llenar esa ventana**, y eso es
lo que hacen los subagentes: el contexto de uno es independiente del del agente que
lo delega.

Gate: 1805 tests en 91 ficheros, todos verdes. tsc y lint limpios.
