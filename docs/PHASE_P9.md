# FASE P9 — Pruebas de correo con Resend sin esperar a `eu.org`

**Estado:** COMPLETADA (2026-10-03) — commit `70db215`
**Gate:** 1146/1146 tests · `tsc` limpio · lint sin avisos

> **Por qué P9 y no P3.** Mismo criterio que P7 y P8: P1–P6 de la Fase P ya
> tenían otro significado. Ver `docs/PHASES.md`.

## El bloqueo, y por qué la prueba se parte en dos

`RESEND_API_KEY` estaba configurada pero **`FROM_EMAIL` no**, porque no hay
dominio verificado.

Y aquí está el dato que hace la fase posible: **sin dominio verificado Resend sí
envía**, pero solo desde `onboarding@resend.dev`, y **solo al propio titular de la
cuenta**. A cualquier otra dirección responde **403**. Verificado en la API de
Resend, no supuesto.

De ahí la división, que es la decisión técnica de la fase:

| Suite | Transporte | Correo | Cuándo corre |
|---|---|---|---|
| **normal** | falso (inyectado) | cualquiera | **siempre**, en cada push |
| **humo** | Resend real | **solo el titular** | solo con `RESEND_SMOKE=1` |

Si el humo estuviera en la suite normal, falla por cuota o por red y entonces
**nadie ejecuta el gate**, que es peor que no tener la prueba.

## El tercer estado: "no se intentó" no es "falló"

Ambos dan `sent: false`, pero contestan a preguntas distintas. *Fallo* = hubo
llamada y no salió. *No se intentó* = no habrá llamada.

Sin el tercero, un `FROM_EMAIL` ausente se contaría como fallo de envío y el
panel admin diría que se perdieron correos que nadie iba a mandar. En
`lib/email.ts` se traduce a contadores distintos (`skipped` frente a `failed`) y a
log distinto.

**No es teórico:** `lib/email.ts` lo usan el camino de aprobaciones y el buzón de
sugerencias (P10). Si el envío se convierte en excepción, ambas rutas se caen por
un problema de correo.

## La regla del remitente

Cuando el remitente efectivo es `onboarding@resend.dev`, el único destinatario
permitido es `RESEND_SMOKE_TO`. **Comparar es obligatorio** porque intentar a otra
persona es un 403 garantizado, y un 403 por suscriptor tapa el fallo real que se
quiere ver.

La comparación ignora mayúsculas, espacios, la forma `Nombre <dir@host>` y el
`+etiqueta` **solo en dominios de Gmail**: en el resto `a+x@ejemplo.com` y
`a@ejemplo.com` son dos buzones distintos.

## Por qué el humo es un script y no un spec

**Cuota:** 100 correos/mes en el plan gratis. En la suite, correrla 20 veces al
día la vacía, y a fin de mes la prueba muere por un motivo ajeno al código.

## Sin MCP de Resend

Por el mismo motivo que se rechazó el de YouTube: enviar un correo es un `POST`
con una API key. Un MCP de terceros no añade nada y mete una dependencia externa
en el camino crítico. Precedente: RC.32 eliminó un MCP (`fetch`) que **no existía
en npm** y rompía el arranque.

## Cambio de comportamiento, consciente

Con `RESEND_API_KEY` puesta y `FROM_EMAIL` ausente, antes se intentaba el envío
y Resend respondía 403 por suscriptor; ahora se registra `not_attempted` con
motivo, **sin llamar**. No se pierde ningún correo porque ninguno habría
llegado, pero el contador `failed` de producción pasará a 0.

Es la lectura correcta, no una regresión: **0 fallos porque 0 intentos.**

## Dos cosas que el subagente hizo mal

**Hizo una llamada real a la API de Resend.** Puso un destinatario inventado
esperando que la guarda lo rechazara, pero el script envía siempre a
`RESEND_SMOKE_TO`: la coincidencia era trivial y llamó. Resend respondió 422
**sin enviar nada** y sin consumir cuota. Debió razonar antes de ejecutar.

**Pero el 422 era un hallazgo útil**: Resend rechaza los dominios de ejemplo, y el
`.env.example` traía `tu-correo-de-titular@example.com` como placeholder — un
error garantizado para quien copiara el fichero. Corregido a vacío.

## Deuda que queda

**`lib/resend.ts` queda huérfano**: era el único que lo importaba y ya no lo
importa nadie. Sigue con el patrón de env en ámbito de módulo (`resend.ts:3-4`),
el mismo que RC.32 rompió en `lib/turso.ts`. No rompe nada hoy, pero borrarlo o
reescribirlo merece su propia ola.

## Verificación

- `tsc` limpio, lint sin avisos, **1146/1146** en 59 ficheros.
- `RESEND_SMOKE=1` es la **única** puerta al envío real, y hay un test que ata
  `RESEND_SMOKE !== "1"` a "desactivado": si alguien lo deja siempre activo, sale
  rojo.
- `scripts/verify-resend-smoke.ts` sin la variable imprime el estado y **por qué
  no corre**, y sale 0 sin enviar nada.
