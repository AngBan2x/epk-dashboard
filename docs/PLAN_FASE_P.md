# Fase P - cierre de RC.33 y las cuatro peticiones nuevas

> Cierra la Fase RC.33 (olas 9 y 10) y abre subfases own para las cuatro
> peticiones que llegaron a mitad de la fase.

## Estado al abrir esta fase

RC.33 dejo **10 commits** en `main` y **1020 tests** verdes. Las olas 0 a 8 estan
desplegadas y verificadas en produccion. Faltan dos, y son las mas pesadas:

| Ola | Que es | Por que se hizo la ultima |
|-----|---------|---------------------------|
| 9 | Externalizar credenciales | Debe ir **antes** de rotarlas, si no rompe 12 specs |
| 10 | Una pagina por release | Toca navegacion, sitemap, notificaciones y 83 filas |

Las cuatro peticiones nuevas del usuario (pruebas de Resend, subagente de redes
sociales, cuentas oficiales de la plataforma, buzon de sugerencias) se abren como
subfases propias **despues**, no mezcladas con el cierre.

## Regla de oro

Igual que RC.32/RC.33: **ningun fichero en dos agentes**, commits del
orquestador, y **stagear con rutas explicitas** (`git add app components lib.`
una vez se trago `middleware.ts` en RC.31).

Y una regla propia de esta fase: **ninguna escritura en produccion sin dry-run
revisado y con la lista de descartes a la vista.** Es lo que aplico con las fotos:
se autorizaron 13 escrituras y se aplicaron 3, porque las otras 10 no estaban
bien compuestas para su hueco.

---

## P1 - Externalizar credenciales (Ola 9)

**El problema.** La credencial de la cuenta del usuario esta hardcodeada en **~35
ficheros**: 10 scripts, 12 specs de Playwright y helpers. `README.md` ya se
limpio en RC.32, pero el historial sigue teniendo 24 commits con el secreto.

**Por que no basta con borrarlo.** Si se rota la contrasena antes de externalizar,
los 12 specs de E2E se rompen. El orden es obligatorio: externalizar, verificar
que los 1020 tests siguen verdes, **entonces** rotar.

**Lo que ya existe y se reutiliza.** `dotenv` es dependencia. `.env.local` esta en
`.gitignore`. Y `scripts/verify-tabs-icons.cjs:15-16` ya hace bien el patron:
`process.env.ADMIN_EMAIL || "admin@epk.local"`.

**Lo que falta.** `playwright.config.ts` **no carga `.env.local`**: Playwright no
hereda la carga de Next.

**Contrato:**

| Fichero | Contenido |
|---|---|
| `.env.example` | `TEST_ARTIST_EMAIL`, `TEST_ARTIST_PASSWORD`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD` |
| `playwright.config.ts` | cargar `dotenv` antes de `defineConfig` |
| `tests/e2e/credentials.ts` (nuevo) | reexporta las 4 con default **vacio**, no con el valor real |
| `scripts/lib/credentials.ts` (nuevo) | idem, para los scripts |
| ~35 ficheros | pasan a consumir el helper |

**Decision importante: el default NO puede ser la credencial real.** Si el helper
cae a `"angab06@gmail.com" / "12345678"`, el secreto sigue en el repo y hemos
hecho un cambio cosmético. Con default vacio, un entorno sin configurar **falla
visible** en vez de pasar con el secreto de prod.

## P2 - Una pagina por release (Ola 10)

La mas pesada. Ver `docs/PLAN_RC33.md`, seccion "El problema estructural".

Los dos niveles de pagina estan al reves: `/releases/[id]` son 199 lineas sin
reproductor ni metricas, y `/track/[id]` son 535 lineas con todo. Copiar el
diseno de la buena a la pobre.

**La trampa del esquema.** Un release es una fila de `tracks` con
`release_id IS NULL`. **No hay forma de distinguir un single de un album**: la
unica senal es si tiene hijas. De las 18 cabeceras, **6 son singles sin hijas**,
as que la pagina tiene que cubrir los dos casos o 6 quedan igual de vacias.

**Bug ya identificado:** `app/track/[id]/page.tsx:195` usa `track.id` donde deberia
usar `track.release_id`, asi que la ficha de una hija enlaza a
`/releases/<su propio id>`, que es una pagina vacia. Verificado en produccion.

**Alcance:** `/track/<hija>` -> redirigir al padre; sacarlas del sitemap
(`app/sitemap.ts:37` no filtra por `release_id` y las indexa), del prev/next
(`:502,518`) y de las notificaciones (`NotificationBell.tsx:113`).

**Exige regresion visual en 5 cortes.**

## P3 - Pruebas de Resend sin esperar a eu.org

**El usuario lo pidio expresamente** porque quiere aprovechar el reinicio de cuota.

**No hace falta `FROM_EMAIL`.** Resend trae un remitente de pruebas,
`onboarding@resend.dev`, que **solo entrega a la cuenta propia**. Es exactamente
para esto.

**Pero la suite no debe depender de Resend ni de la cuota.** Si las pruebas de
correo real estan en el gate, cada corrida gasta cuota y depende de la red: tests
que pasan el lunes y fallan el martes.

Dos capas:

| Capa | Que hace | Cuando corre |
|---|---|---|
| **Principal** | `lib/email.ts` con transporte inyectado; doble en memoria. Asserts sobre destinatario, subject, HTML y adjuntos | **Siempre**, en los 1020 |
| **Humo, opt-in** | envio real a la cuenta del usuario via `onboarding@resend.dev`, activado por `RESEND_SMOKE=1` | Cuando el usuario lo lance |

Ya existen `lib/email.ts` y `tests/unit/email.test.ts` (229 lineas): es adaptar,
no construir.

**Sin MCP de Resend**, por el mismo motivo que se rechazo el de YouTube: enviar un
correo es un `POST` con una API key. Un MCP de terceros no añade nada y mete una
dependencia externa en el camino critico. Precedente: RC.32 elimino un MCP
(`fetch`) que **no existia en npm** y rompia el arranque.

## P4 - Buzon de sugerencias (solo admin)

**Que es.** Una tabla, una ruta publica de envio, y una pantalla en `/admin` que
solo ve el admin. Campos: correo, mensaje.

**Anti-spam sin CAPTCHA ni servicios de pago.** Cinco capas, todas locales:

| Capa | Que corta |
|---|---|
| Campo trampa (honeypot) invisible que los humanos no llenan y los bots si | El 90% de los bots |
| Tiempo de formulario: se rechaza si se envia en < 2 s desde que se pinto | Relleno automatico |
| Rate limit por IP con `lib/rate-limit.ts` (ya existe) | Repeticion |
| Una respuesta por `email+IP` cada 24 h | Reenvio |
| Limites de longitud, validados en servidor | Relleno |

**Aviso al admin:** email via Resend **mas** notificacion in-app, reusando el
patron de `approval-notifications` y `subscriber-notifications`.

**Decision de producto (a confirmar por el usuario):** buzon **anonimo** con las
cinco capas, o solo para registrados. Anonimo es mejor para alguien que
reporta un problema sin registrarse; registrado reduce spam de una vez.
**Propuesta: anonimo**, porque el buzon existe para pescar problemas de quien no
tiene cuenta.

---

## Lo que esta fase NO cierra

- `/api/sync` sigue deshabilitado (410). La portabilidad local a Turso sigue sin
  sustituto.
- `vitest` en paralelo no es viable con un route handler que carga modulo nativo.
- **La promocion via show** sigue siendo imposible por diseno:
  `userHasApprovedContent` exige un perfil de artista previo.
- **La descarga del dossier/rider sigue siendo publica por API.** La Ola 6 arreglo
  la *promesa de la interfaz*, no la frontera: `POST /api/export` solo lleva rate
  limit.
- Bjork y David Bowie sin audio de `- Topic` (canales no verificados).
- 14 pistas con video "parecido" retenidos para revision manual.
- `app/track/[id]/page.tsx` y `lib/downloadable-assets.ts` siguen con `?? 0` en
  metricas: el dossier que se descarga para prensa lleva `0` inventado.
- Tres definiciones del tipo de estado de show y cinco listas de transiciones
  dispersas.

## Orden de ejecucion

```
P1  credenciales    -> el usuario rota (paso a paso en el informe final)
P3  Resend          -> desbloquea pruebas de humo sin eu.org
P4  buzon           -> independiente de P2, se puede en paralelo
P2  pagina de release  -> la mas pesada, con regresion visual al final
```

P1 antes que nada porque **bloquea al usuario**: hasta que las credenciales esten
externalizadas, no puede rotar sin romper los E2E.