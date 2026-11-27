# FASE P20 — Nada se borra sin que alguien lo pida

**Período:** 2026-11-24 → 2026-11-27   **Estado:** completada
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
| P20.2 | `scripts/purge-deleted-shows.ts` — dry-run por defecto, `--apply`, ventana de gracia configurable | ✅ hecha | `a293827` | Dry-run por defecto y `--apply` como única puerta de escritura, igual que `qa-cleanup.ts`. Ventana de **90 días** por defecto (`--days N`), porque un archivado de ayer puede ser un clic equivocado y `deleted_at` es lo único que permite deshacerlo. **La decisión no vive en el script**: `selectPurgeable()` está en `lib/show-archive.ts` y se ejecuta en `tests/unit/show-archive.test.ts` (borde exacto de la ventana incluido, y `deleted_at` ilegible **nunca** se purga: se aparta y se informa). Reutiliza `deleteShow()`. Verificado **contra producción en dry-run**: `Archivados: 0 · más antiguos que 90 días: 0`, sin escribir nada |
| P20.3 | El cron `cleanup-shows.yml` pasa a **marcar**; la purga es explícita | ✅ hecha (con P20.1) | `c6622c4` | El cron ya no borra nada: llama a la misma ruta, que ahora archiva. La comprobación del cuerpo pasó de `.deleted` a `.archived`, y el workflow lo dice en su cabecera |
| P20.4 | `getShowsByArtist` (`lib/db.ts:2284`) **no** filtra por `deleted_at` para el dueño: el artista **sí ve** sus shows archivados, **con distintivo** (D16). Los lectores públicos siguen filtrando | ✅ hecha | `a293827` | La mitad de datos ya estaba; faltaba la vista. `lib/show-archive.ts` (`isArchived`, `orderForOwner`, `showsCountLabel`) + distintivo **Archivado** en `ShowsBooking` con `title` explicativo, y contador `"5 shows · 1 archivado"`. El orden importa: un archivado es pasado por definición y el SQL ordena ASC, así que sin `orderForOwner` salían **los primeros**. La lógica vive en `lib/` para poder ejecutarla en un test. **Mutación**: quitando `deleted_at IS NULL` de `getApprovedShowsByArtist`, el test de D16 se pone rojo |

## Lo que queda

- **El workflow `Cleanup Shows` está reactivado** (`gh workflow enable "Cleanup Shows"`,
  2026-11-27 → `active`). Se desactivó el 2026-11-24 porque el deploy a producción solo ocurre si
  los E2E pasan, y aquí nunca habían pasado: el cron de las 06:17 UTC habría llamado a la ruta
  vieja, que sí borra. Se vuelve a armar **después** de confirmar que producción sirve el código
  nuevo: `gh api …/commits/8ae52ea/status` → `Vercel=success` y el deploy
  `dpl_BMBrUbJkffRx4RkH6yrZj1RHcBc5` en `READY`. **No está verificado end-to-end todavía**: el
  primer cron con la ruta nueva corre el 2026-11-27 a las 06:17 UTC, y su efecto esperado es
  archivar 3 shows pasados. Lo comprobable después es `SELECT id, deleted_at FROM shows WHERE
  deleted_at IS NOT NULL` — tres filas, no cero.
- **`/api/shows?artist_id=` sigue sirviendo el alcance público a un artista autenticado**
  (`app/api/shows/route.ts:133-138`): solo el admin usa `getShowsByArtist()`. El dashboard no lo
  nota porque recibe los shows ya resueltos por `/api/dashboard`, pero quien llame a la API con su
  propio `artist_id` no verá ni sus archivados ni sus pendientes de aprobación. El arreglo es un
  `isOwner` (`getArtistById(artistId)?.user_id === session.userId`) en el ternario. **No se hizo en
  este pase a propósito**: es una rama de autorización nueva en una ruta pública y no hay arnés de
  tests de route handlers; se cambia cuando haya con qué probarla.
- **`deleteShow()` (`lib/db.ts:2444`) ya tiene su llamante**: `scripts/purge-deleted-shows.ts`.
  Sigue siendo un `DELETE` duro, pero ahora solo lo alcanza un `--apply` escrito a mano y con
  ventana de gracia. Un botón de la interfaz que lo llamara seguiría estando mal.
- **`shows.status` tiene valores retirados**: 4 de los 5 shows de producción llevan
  `status='disponible'`, que no está en el vocabulario y se lee como `proximamente`, con un
  warning por cada lectura (`[show-status] "disponible" no está en el vocabulario…`). No es de
  esta fase, pero es ruido de log en cada página de shows y un backfill lo apagaría.
