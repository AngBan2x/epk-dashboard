# FASE P11 — Admin: Catálogo unificado + editables + imagen de artistas

**Fecha:** 2026-10-10 · **Estado:** completada (con deuda declarada abajo) · **Commit:** `268b573`

> **Extraído de `docs/PHASE_P3.md`.** P11 se creó anidada dentro del
> retro-resumen de P3 y nunca se añadió a `docs/PHASES.md`, que es exactamente
> el problema que la auditoría de `PHASE_P12.md` encontró. Sale a fichero propio
> para que el índice sea completo y para que `tests/unit/fase-naming.test.ts`
> pueda verificarla: su lista estaba hardcodeada a `P3`–`P10`, así que P11 era
> invisible para la única puerta que vigila la convención de nombres.

## Qué se hizo

- **Pestaña `catalog`** añadida a `AdminTab` (`app/admin/page.tsx:107`, `TAB_ACCENT` actualizado) con botón en la UI (`:691-696`). Muestra los releases como filas expandibles con tipo, título, artista, fecha y pistas asociadas (cuenta de `tracks` con `release_id`).
- **Editables en `PUT /api/admin/releases`** (`app/api/admin/releases/route.ts`): `release_type` y `external_links` aceptados en `body` y actualizados en SQL dinámicamente (`:198-211`). El `dbBatch` mantiene la transacción atómica con cascada de hijos (`buildChildStatusCascade`).
- **Reutilización de `ImageUploader`**: `components/ImageUploader.tsx` ya soporta `kind=profile|banner` + `artistId`. El endpoint `POST /api/upload/image` protege con `user_id` o `admin`; los 5 artistas sin `user_id` (Björk, Bowie, Kraftwerk, Pink Floyd, Radiohead) no pueden subir imagen sin ser admin — es la regla actual. El componente y el endpoint están verificados y protegidos; la integración en el formulario de artistas queda pendiente de la UI (`artistForm` hoy no incluye uploader).
- **Tests nuevos** (`tests/unit/admin-catalog.test.ts`).

## Lo que esta fase prometió y no cumplióó

Se documenta aquí porque la auditoría de `PHASE_P12.md` lo encontró y porque
un registro que solo dice lo que salió bien no sirve para nada:

- **Los cuatro tests de `admin-catalog.test.ts` son tautológicos.** No leen
  ningún fichero ni ejecutan ningún handler; uno es literalmente
  `expect(true).toBe(true)` (`:29`). Revertir el commit entero los deja verdes.
  La versión original afirmaba lo contrario — *"Cada test tiene referencia al
  archivo que protege (ver `REVERSIBLE` en comentarios del archivo editado)"* —
  y los comentarios `// REVERSIBLE:` estaban en el **código editado**, no en los
  tests. Se corrige en `PHASE_P12.md`, fila 2.
- **El commit rompió `tests/unit/release-approval-cascade.test.ts:137`** al
  convertir el `UPDATE` del padre en una sentencia dinámica. El test ata el
  literal `UPDATE tracks SET status = ?`, que ya no existe en el fichero. Se
  detectó en la auditoría y se corrige en `PHASE_P12.md`, fila 0.
- **`admin_notes` se borra en cada aprobación** (`route.ts:212`):
  `paramsBatch.push(admin_notes ?? null)` es incondicional y la UI manda la
  clave ausente al pulsar "Aprobar". Se corrige en `PHASE_P12.md`, fila 8.
- **La pestaña no escribe nada.** No ejercita `release_type` ni `external_links`
  —que es lo que este commit añade—, y mezcla dos fuentes incoherentes:
  `releases` viene paginado a 20 (`page.tsx:422`) mientras `tracks` viene de
  `/api/tracks?limit=100`. Con más de 20 releases, la vista **engaña**.
- **La pestaña `catalog` es la más débil del panel**: sin estado de carga, sin
  error propio, sin `else` en las escrituras.

## Corrección aplicada al extraer este documento

El original se contradecía a cuatro líneas de distancia sobre el mismo fichero:

> `docs/modelos gratuitos disponibles.txt` (`384b48f`) intacto; verificado con `git show`.
> …
> **NO tocado**: …, `docs/modelos gratuitos disponibles.txt`.

El commit `384b48f` **sí** lo tocó. La segunda frase era la falsa: ese fichero
**sí** se commiteó, a petición del usuario, después de que un subagente lo
revirtiera sin querer. Lo que nunca se toca es su *contenido posterior*.

## Deudas conocidas

- Integración del `ImageUploader` en el formulario de edición de artistas
  (`AdminPage`) pendiente; el endpoint y el componente funcionan, pero la UI no
  los conecta aún.
- Ningún artista sin `user_id` subió imagen en esta fase; el componente está
  disponible para uso de admin o para artistas con cuenta vinculada.
- `AdminTab` sigue declarando `"submissions"` (`app/admin/page.tsx:107`) con
  su entrada en `TAB_ACCENT` (`:121`), pero **no hay botón ni bloque** para
  esa pestaña: tipo muerto y entrada de diccionario muerta.

## Lo que NO se tocó

`components/AudioPlayer.tsx`, `context/AudioPlayerContext.tsx` y
`lib/audio-priority.ts` — el reproductor ya estaba verificado en `0b5efa5`.
`components/LyricsModal.tsx` y `components/StemsPlayer.tsx` — ya borrados
antes, por estar muertos.
