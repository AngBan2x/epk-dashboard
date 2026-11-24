# FASE P20 — Nada se borra sin que alguien lo pida

**Período:** 2026-11-24 → (abierta)   **Estado:** en curso
**Rama:** main   **Issue:** — (se abre al arrancar la fase)   **Commits:** _(ver tabla)_

> Esta fase se abrió **por necesidad**, no por calendario: P21.6 creó la variable
> `NEXT_PUBLIC_APP_URL`, y con ella el cron `cleanup-shows.yml` dejó de morir en el
> preflight por primera vez en 12 días. Ese cron llama a `DELETE /api/shows/cleanup`,
> que hasta hoy hacía `DELETE FROM shows` — o sea que el efecto de "arreglar la CI"
> era **un borrado diario e irreversible en producción**. P20.1 se hizo en el acto;
> P20.2–P20.4 quedan como el resto de la fase.

## Decisiones que esta fase implementa

| # | Decisión |
|---|---|
| D5 | Los shows se **marcan** (`deleted_at`), no se borran; la purga es un script explícito. |
| D16 | El artista **sí ve** sus shows archivados, **con distintivo** de "archivado" en su dashboard. |

## Checklist

| # | Tarea | Estado | Commit | Evidencia |
|---|-------|--------|--------|-----------|
| P20.1 | `DELETE /api/shows/cleanup` pasa de `DELETE FROM shows` a `UPDATE shows SET deleted_at = ?, updated_at = ?` | ✅ hecha | `c6622c4` | **Riesgo real, no teórico**: 3 filas habrían desaparecido en la corrida de las 06:17 UTC del 2026-11-25 (`demo-show-001` 2026-11-14, `show-…xghs0` 2026-11-01, `show-…7ufhe` 2026-09-30), con `deleted_at` a `NULL` en las tres. La respuesta pasa de `deleted` a **`archived`** para que el nombre no mienta. `readShows` excluye `deleted_at IS NULL`: sin eso, un show archivado volvería a casar con el filtro cada día y **se re-notificaría a diario**. Guard en `tests/unit/shows-cleanup-window.test.ts` (4 tests nuevos): la ruta no puede contener `DELETE FROM shows` — con tamaño mínimo del fuente, para que el stripper de comentarios no haga pasar el `not.toMatch` sin mirar nada —, el SELECT debe filtrar los archivados, y el UPDATE debe escribir `deleted_at` **y** `updated_at`. **Validado por mutación**: revirtiendo la ruta a `DELETE FROM shows`, **10 de 26** tests se ponen rojos. Gate: 1869/1869 en 94 ficheros, tsc 0, lint 0 |
| P20.2 | `scripts/purge-deleted-shows.ts` — dry-run por defecto, `--apply`, ventana de gracia configurable | ⬜ pendiente | — | — |
| P20.3 | El cron `cleanup-shows.yml` pasa a **marcar**; la purga es explícita | ✅ hecha (con P20.1) | `c6622c4` | El cron ya no borra nada: llama a la misma ruta, que ahora archiva. La comprobación del cuerpo pasó de `.deleted` a `.archived`, y el workflow lo dice en su cabecera |
| P20.4 | `getShowsByArtist` (`lib/db.ts:2284`) **no** filtra por `deleted_at` para el dueño: el artista **sí ve** sus shows archivados, **con distintivo** (D16). Los lectores públicos siguen filtrando | ⬜ pendiente | — | — |

## Lo que queda

- **P20.4 es el que cambia comportamiento visible.** Hoy un show archivado
  desaparece del dashboard del artista, exactamente igual que cuando se borraba.
  No es una regresión (antes no existía), pero sí es la mitad de D16 que falta.
- **`deleteShow()` (`lib/db.ts:2444`) sigue siendo un `DELETE` duro** y **no tiene
  ningún llamante**. No es un riesgo hoy; el día que alguien lo conecte a un botón,
  sí. Se alinea con D5 cuando se toque esa zona.
- **La purga explícita (P20.2) es lo que evita que `deleted_at` se convierta en un
  cementerio.** Sin ella, "no se borra" acaba significando "no se borra nunca".
