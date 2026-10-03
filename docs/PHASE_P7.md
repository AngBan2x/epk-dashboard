# PHASE P7 — Credenciales de test fuera del código

**Estado:** COMPLETADA (2026-10-03) · commits `cf07930`, `cb2b09e`
**Alcance:** 41 ficheros modificados (16 scripts, 12 specs de Playwright, helpers, config)
**Gate:** 1146/1146 tests · `tsc` limpio · lint sin avisos

> **Por qué P7 y no P1.** La numeración P1–P6 de la Fase P ya existía con otro
> significado (P3 = retro-resumen, P4 = subscribers/notifications/search, P5 =
> polish, P6 = fixes UI/roles/seguridad). Este trabajo se numeró P1–P4 en un
> principio, lo que **chocaba** con esos documentos. Ver `docs/PHASES.md`.

## El problema

La credencial de una cuenta real estaba **hardcodeada en 41 ficheros**: 16
scripts, 12 specs de Playwright y sus helpers. Vive en el historial de git, en
**30 commits**.

`README.md` ya se había limpiado en RC.32, pero borrar la cadena del fichero
**no la borra del historial**: `git log -p` sigue leyéndola.

## Por qué el orden importa

Si se rota la contraseña antes de externalizar, los 12 specs de E2E se rompen. El
orden obligatorio es: **externalizar → verificar que los tests siguen verdes →
rotar → reescribir el historial.** Está en `docs/ROTACION_CREDENCIALES.md`.

## La decisión que convierte esto en algo o en nada

**El default NO puede ser la credencial real.** Si el helper cae a
`process.env.TEST_ARTIST_PASSWORD ?? "<la contraseña real>"`, el secreto sigue en
el repo y se ha hecho un cambio cosmético con forma de arreglo.

Con default **vacío**, un entorno sin configurar **falla visible** en vez de
autenticarse con el secreto de producción.

Y la regla resultó más fina de lo que parecía:

| Variable | Default | Por qué |
|---|---|---|
| `TEST_ARTIST_PASSWORD` | `""` | es un secreto |
| `TEST_ADMIN_PASSWORD` | `""` | es un secreto |
| `TEST_ADMIN_EMAIL` | `admin@epk.local` | dominio inventado: no existe, no es PII, no autentica nada solo |
| `TEST_ARTIST_EMAIL` | `""` | la única cuenta de artista conocida es de una persona real: **el correo es PII** |

Aplicar "correo con default" de forma uniforme habría dejado el correo real en el
repo, que es justo lo que hay que sacar.

## Contrato

| Fichero | Contenido |
|---|---|
| `scripts/lib/credentials.ts` | **única** definición + carga `.env.local` |
| `tests/e2e/credentials.ts` | reexport puro, sin lógica |
| `playwright.config.ts` | `dotenv.config({ path: ".env.local" })` antes de `defineConfig` |
| `.env.example` | las 4 variables, marcadas como solo-test |

Un test ata la **identidad de la función** entre los dos ficheros
(`reexport.requireCredentials === canonica.requireCredentials`): si alguien copia
la lógica en vez de reexportar, se rompe.

## `playwright.config.ts` no cargaba el entorno

**Playwright no hereda la carga de `.env.local` de Next.** Sin
`dotenv.config()` antes de `defineConfig`, los `process.env.TEST_*` son
`undefined` en los specs: 12 ficheros de test rotos sin explicación.

`vitest.config.ts` es un fichero **distinto** y **no se toca**: sus dos
`delete process.env.TURSO_*` son lo que protege Turso durante los tests de
unidad. Parecen higiene de test y no lo son.

## Tres cosas que no estaban en el plan original

**1. El módulo que lee el entorno es el que lo carga.** Los exports de
`credentials.ts` leían `process.env` a nivel de módulo. Como en ES modules
**todos los imports se evalúan antes que cualquier sentencia del cuerpo**, el
`dotenv.config()` del consumidor corría *después*, y las constantes salían
vacías. No eran solo los 2 seeds: **los ~30 consumidores** dependían del mismo
orden y fallaban en silencio autenticándose con cadenas vacías.

Es el mismo patrón que RC.32 rompió en `lib/turso.ts`. Arreglarlo en
`credentials.ts` lo resolvió de una vez para los 30.

**2. `??` no cae en el default ante una cadena vacía.** `process.env.X ?? DEF`
con `X=""` devuelve `""`, no `DEF`. Y una variable presente pero vacía es justo
lo que se encuentra quien exporta mal un secreto en CI. El efecto era el
contrario del buscado: el default del admin **desaparecía cuando el entorno
estaba mal configurado**. Hay dos helpers, `readEnv` (con default) y
`readEnvStrict` (sin default), y la diferencia es deliberada.

**3. El test que protegía las credenciales las metía de vuelta.** Usaba las
cadenas reales como valor centinela, para comprobar que el helper no las
devolvía. **El guard que protege del secreto lo metía en el repo para poder
comprobarlo.** Ahora usa centinelas sintéticos de dominio inválido.

## Deuda que queda

- **`git filter-repo` NO está instalado** en esta máquina. Y el paso de
  reescribir el historial sigue pendiente: `docs/ROTACION_CREDENCIALES.md`.
- Los 4 scripts `.cjs` (`verify-social-editor`, `verify-tabs-icons`,
  `verify-wave1`, `verify-wave2`) corren con `node` sin `tsx` y **no pueden
  importar un `.ts`**: repiten la lectura del env en 4 líneas. Deuda
  reportada, no resuelta.

## Verificación

- `tsc` limpio, lint sin avisos, **1146/1146** en 61 ficheros.
- `git grep -E "<credencial>" -- scripts tests app components lib` → **0** en
  código (las 7 apariciones restantes están en `docs/`, describiendo el problema,
  más el patrón de búsqueda de la guía de rotación).
- **Mutación del guard**: introduciendo un default en `readEnvStrict` salen
  **3 tests rojos**; restaurado, 8 verdes. Sin comprobarlo, un test que solo
  pasa no distingue un guard de una costumbre.