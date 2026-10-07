# FASE P10 — Buzón de sugerencias anónimo, solo admin

**Estado:** COMPLETADA (2026-10-03) — commits `7ccd8a0`, `db84123`, `035f8d6`
**Gate:** 1146/1146 tests · `tsc` limpio · lint sin avisos · verificado en producción
**Migración aplicada en Turso:** tabla `suggestions` + 3 índices

> **Por qué P10 y no P4.** Mismo criterio que P7, P8 y P9: P1–P6 de la Fase P ya
> tenían otro significado. Ver `docs/PHASES.md`.

## Qué es

Una tabla, una ruta pública de envío y una pantalla en `/admin` que solo ve el
admin. Campos: correo, mensaje.

**Decisión de producto: anónimo.** Quien reporta un problema muchas veces no tiene
cuenta, y el buzón existe justo para pescar eso. El anti-spam lo compensa.

## La IP no se guarda en claro

Una IP no identifica a una persona: identifica a una red. La columna `ip_hash` es
un **HMAC-SHA256 con `SESSION_SECRET`**, no un SHA suelto.

El espacio IPv4 son 2³² valores y se recorre por fuerza bruta en segundos, así que
un SHA de una IP *es* la IP con tres pasos de más: llamarlo irreversible sería
falso. Lo que hace que no se revierta es la clave. Además lleva prefijo de
dominio (`suggestions:ip:`) para que el mismo valor no correlacione con otros
usos.

## Trampa de formato documentada

`created_at` se escribe **siempre explícito en ISO con `Z`**. El
`DEFAULT (datetime('now'))` de SQLite devuelve `"YYYY-MM-DD HH:MM:SS"` (espacio,
sin zona) y la comparación de la capa 4 es lexicográfica: `' '` (0x20) < `'T'`
(0x54), así que una fila reciente se contaría como antigua y el límite de 24 h
**no bloquearía nunca**.

## Las cinco capas, todas en el servidor

| # | Capa | Al saltar |
|---|---|---|
| 1 | Honeypot `empresa` (fuera de pantalla, `aria-hidden`, `tabIndex={-1}`) | 201, no escribe |
| 2 | Tiempo de formulario (mínimo 2 s) | 201, no escribe |
| 3 | Rate limit por IP: **10/hora** | **429** + `Retry-After` |
| 4 | **1 por correo cada 24 h** | 201, no escribe |
| 5 | Longitudes (254 / 20–5000, con Zod) | 400 con mensaje útil |

El honeypot va **antes** que la validación: un bot con `empresa` relleno y correo
basura recibe 201, no un 400 que le confirmaría que se está validando su correo.

## La paradoja del NAT, y cómo se resolvió

Detrás de una sola IP hay una oficina con treinta personas, una facultad, un móvil
con CGNAT. Con límite bajo por IP, el primer damnificado es el usuario que más
falta hacía —el que reporta un problema sin cuenta— y se come un 429 sin saber por
qué.

- **IP: 10 por hora**, alto a propósito. Cubre una oficina entera y aun así frena
  el bucle automático, que es lo único para lo que existe.
- **Correo: 1 por 24 h**, el límite DURO. Dos personas tras la misma NAT tienen
  correos distintos, así que no se estorban. Contra el spam es *más* fuerte: un
  bot que rota IPs conservando el correo tampoco cuela.

El coste de equivocarse es asimétrico: un falso positivo por IP se traga un
reporte real y ese usuario no vuelve; un falso negativo son diez mensajes más en
una bandeja que el admin ya filtra.

**Desviación consciente:** el enunciado pedía `email+IP`; se implementó `email` a
secas, estrictamente más fuerte. Hay un test que fija esto.

## Las respuestas no distinguen cuál capa rechazó

`POST` devuelve **201 `{ ok: true }`** y nada más: ni `id`, ni `status`. Las cuatro
capas de descarte devuelven el mismo objeto, byte a byte.

Si el honeypot devolviera 400 y el tiempo 429, un bot solo tendría que recorrer las
cinco capas en orden para descubrir cuáles existen.

La excepción es el **429**, deliberada: quien comparte IP con media oficina y se
bloquea sin explicación no tiene forma de saber que tiene que esperar. Un error
que el usuario honesto no puede entender no es protección, es ruido.

## El aviso al admin no puede perder el mensaje

Orden: **escribir primero, avisar después**. Enganchar el envío a la escritura
habría significado que un 502 de Resend —o un `FROM_EMAIL` sin configurar— se
llevara por delante el mensaje de alguien que solo quería reportar un problema.

`notifyAdmins()` devuelve un motivo, nunca lanza. Notificación in-app primero (no
depende de nada externo), email después reusando `sendNotificationEmail`.

**Cuatro tests** cubren el peor caso: excepción del cliente de correo,
`sent:false`, fallo de la in-app, y cero admins activos. Los cuatro comprueban 201
**y** que la fila sigue en el almacén.

## Protección en tres capas, y solo una decide

1. `middleware.ts:93-101` — `/admin/:path*` ya exige sesión y rol admin. No hizo
   falta tocarlo. `/suggestions` **no** se añade a propósito: es público.
2. **Servidor, en la API** — 401 sin sesión, 403 con `artist`, `subscriber` o rol
   desconocido (`"Admin"` con mayúscula no cuela). **Esta es la autorización**:
   sobrevive a un `curl` y a un middleware mal configurado.
3. `useEffect` en la página — UX, no seguridad: sin él habría un fogonazo de
   pantalla vacía, no una fuga.

## Verificación en producción, capa por capa

No basta con los tests, que corren contra SQLite:

| Prueba | Resultado |
|---|---|
| Sin `form_started_at` | 201 y **no guarda** (falla cerrado) |
| Campo `form_started_at` correcto | 201 y **guarda**, `ip_hash` de 64 hex |
| Mismo correo otra vez | 201 idéntico y **no guarda** (capa 4) |
| Mensaje de 15 caracteres | **400** con mensaje útil en español |
| `GET /api/suggestions` sin sesión | 401 |

## Un fallo propio de la orquestación

El commit de P10 dejó `app/api/suggestions/[id]/route.ts` **sin trackear**, y con
ella el PATCH que el propio panel de admin necesita. **Salió verde con la mitad
de la API sin publicar.** Se cerró con un commit aparte y explícito, porque es una
corrección del commit anterior y no funcionalidad nueva: si no, se habría mezclado
en los 2324 inserts del otro.

## El modo oscuro no distingue cual capa rechazo (P10.1, 2026-10-06)

No es una regla del buzón, pero salió de aquí y comparte su peor caso: **un
`dark:` puesto a medias se ve igual de bien en modo claro que en modo oscuro**.
Nadie lo detecta probando en el tema por defecto.

### Que pasaba

`dark:` en el **borde** y nada en el **fondo**. En claro no se nota nada, porque
`bg-white` es exactamente lo que quiere la luz. En oscuro la caja se queda
**blanca**, y el texto que dentro lleva `dark:text-white` queda **blanco sobre
blanco**: invisible. Con el borde oscuro al lado, el resultado es una caja con
borde correcto y relleno que no pertenece a ningún tema.

Había **cuatro** sitios, y tres eran el mismo className copiado a mano:

| Sitio | Qué se quedaba blanco |
|---|---|
| `app/admin/suggestions/page.tsx` | las tarjetas de estadística inactivas |
| `app/admin/suggestions/page.tsx` | la franja de la navegación del panel |
| `app/suggestions/page.tsx` | la franja de migas de pan (página **pública**) |
| `app/admin/approvals/page.tsx` | la franja de vuelta al panel |
| `app/admin/approvals/page.tsx` | las cuatro pestañas de filtro, rama inactiva |

Es el mismo fallo que en P10 con las cinco capas: **la invariante no estaba
escrita en ninguna parte**, así que cada página la reintroducía por su cuenta.
Las tres franjas son el mismo string literal; la cuarta, la misma idea dentro de
un ternary.

### La invariante, escrita y comprobada

`tests/unit/dark-mode-pairing.test.ts` recorre `app/` y `components/` y exige
que **todo `className` con fondo claro lleve su `dark:bg`**. Tres detalles, y
los tres importan:

1. **No cuenta `hover:`.** `hover:bg-slate-100 dark:hover:bg-slate-800` está
   bien. Sin un *lookbehind* que prohíba el prefijo, el regex lee el fondo del
   `hover:` como fondo sin pareja y el test marca como ofensores media
   aplicación.
2. **No cuenta la opacidad.** `bg-white/10` sobre un degradado es decorativo y
   es igual en los dos temas.
3. **Mira cada rama de un ternary por separado.** Este es el detalle que
   importa. Un `className` no es siempre una lista de clases: suele ser un
   *ternary* con dos. Buscar "algun `dark:bg` en la cadena" da por buena la rama
   activa (`bg-primary-50 dark:bg-primary-950/40`) y **tapa** a la inactiva
   (`bg-white ... dark:border-slate-800`, sin fondo). El test pasó con las cuatro
   pestañas blancas delante; lo vio el navegador.

Verificado que **falla al revertir**: quitando el `dark:bg` de
`/admin/approvals` el test se pone rojo. Un check que siempre pasa no protege de
nada.

### Dificultad real: el tema no es una media query

`emulateMedia({ colorScheme: "dark" })` **no basta**. El tema vive en
`localStorage["epk-theme"]` y se aplica con la clase `dark` en `<html>`
(`components/ThemeToggle.tsx:14`, `app/layout.tsx:47`). Con la media emulada y
sin la clase, la página se renderiza en claro y da un falso "verde". El script
de comprobación tiene que sembrar `localStorage` **antes** del primer
`goto`.

### Verificado en navegador

Servidor local en dark real (`<html class="dark">`):

- `/admin/suggestions` → franja `rgb(15, 23, 42)` (slate-900), tarjetas
  inactivas `rgb(30, 41, 59)` (slate-800), números blancos legibles.
- `/suggestions` → franja `rgb(15, 23, 42)`.

`/admin/approvals` no se pudo renderizar en local con datos: `next start` contra
SQLite se muere con la asertación nativa de `better-sqlite3`
(`node::RemoveEnvironmentCleanupHook`, `(env) != nullptr`), la misma de los
workers de vitest. Queda pendiente de comprobar en producción, donde se usa
Turso y no hay `better-sqlite3` en el bundle.

## Pendientes

- `/admin/approvals` (franja y pestañas de filtro) pendiente de verificación
  visual en producción: en local el servidor SQLite-only se cae al tercera
  navegación, con la asertación nativa de `better-sqlite3`.
- `scripts/turso-check.ts` tiene el check `suggestions_email_duplicado_en_24h`
  **porque los tests corren contra SQLite, no contra Turso**: si esa capa falla en
  producción, los tests no lo ven.
- `deleteUser` **no** borra las sugerencias de ese usuario. Coherente con "el
  buzón es anónimo, el mensaje no es de nadie" y con que no hay FK, pero es una
  **decisión de privacidad pendiente**.
- Sin E2E del flujo `/suggestions` → admin.
- La capa 2 asume que el reloj del navegador está en hora: comparar relojes sin un
  token del servidor no tiene arreglo. Las otras cuatro capas no dependen de eso.
