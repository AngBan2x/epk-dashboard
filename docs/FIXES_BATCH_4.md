# Batch 4 — Shows, Bio/Prensa, Ficha (PLAN + RESULTADOS)

**Fecha:** 2026-09-23
**Modelo:** Muse Spark 1.3 Free (OpenCode Zen)
**Trigger:** Usuario reporta 6 issues con screenshots (dashboard, profile, ficha)
**Decisiones usuario:** 1A (imágenes públicas) · 2A (sync dossiers→artists) · 3A (fila expandible) · 4 fases (diseño → datos)

---

## Fase 1 — Diseño (commit `3680cd1`)

### #1 Shows & Booking inconsistente
- Filas de distinta altura (sin ubicación vs con ubicación) → bloque meta de **2 líneas fijas** con placeholders ("Ubicación/Fecha por confirmar").
- Botones ✏️/🗑️ emoji → **SVG** estilo admin (`ShowsBooking.tsx`).
- Banner amarillo "ya pasó" → `Badge amber` compartido inline ("Pasado · se elimina en 48h").

### #2 Actividad Reciente
- Fechas crudas `YYYY-MM-DD` → `formatDateES` (`dashboard/page.tsx`).
- "Editar" hover-only → icono lápiz siempre visible (sutil); shows abren `ShowForm` igual que tracks.
- "Próximo show" fijo → etiqueta real por estado/fecha (`showStatusLabel` + "Show finalizado").

### #6 Ficha de Producción ×3
- Nuevo `lib/production-fields.ts` canónico (orden/labels/placeholders/clase input).
- `ProductionDetails` (vista + edición) y `releases/[id]/edit` consumen el spec.
- Vista **oculta campos vacíos** (adiós 7×"—"); `recording_date` con `formatDateES`.

## Fase 2 — Datos (commits `2327991`, `badf8d2`)

### #3 Datos del show invisibles
- Fila expandible (chevron) por show con extras: descripción, invitados, métodos de pago (chips, `PAYMENT_TYPE_LABELS` movido a `lib/show-status.ts`), flyer, ticket alternativo, motivo de posposición, notas internas (solo `editable`, marcador "solo tú").
- Sin API nueva. Verificado funcional local: chevron + 5 strings del panel.

### #4 Fotos perfil/banner (eran write-only)
- Nadie las mostraba. Ahora hero en `artists/[id]`: banner + avatar superpuesto, fallbacks con gradiente/inicial (layout idéntico sin imágenes).
- Visibles para todo el mundo (página pública).

### #5 Bio & Prensa: fuente única
- **Causa:** `DossierEditor`→tabla `dossiers`, `BioSection`←tabla `artists`, sin sync. Ediciones fantasma.
- **Fix:** `syncDossierToArtist` en `lib/db.ts` — `upsertDossier` sincroniza biography/press_text/genre/location → `artists` (Turso + SQLite). Presence-based (vaciar en dossier vacía en artists).
- `DossierEditor onSaved` → dashboard re-fetch Bio.
- Verificado funcional local: PUT dossier → artists.bio converge; restore OK.

## Bugs colaterales del testing
- **Turso replica lag**: escrituras tardan en replicarse; harness con polling (60s) en `fase2-functional.ts`.
- **Limpieza**: tests funcionales crean show + mutan bio con restore; un sentinel ajeno ("Updated bio test", edición humana concurrente en prod) obligó a convergencia manual artists=dossiers. DB prod limpia al cierre.

## Verificación
- `tsc` 0 · `test:unit` 110/110 · `build` PASS
- `prod-exhaustive.ts`: **50 PASS / 0 FAIL** (15 rutas × 3 roles × 2 themes)
- `fase2-functional.ts` local: expand 5/5 + sync converge + restore + cleanup
- Screenshots: `tests/screenshots/prod-exhaustive/` + `fase2-expand-check.png` (gitignored)

## Fuente de verdad (memoria)
- `artists` = canónico bio/press/genre/location (Bio + página pública).
- `dossiers` = rider + snapshot de exportación (DownloadCenter).
- Sync automático dossiers→artists en cada PUT.

---

## Batch 4b — Estados, optimista, exportar, actividad (2026-09-23, commit 33cbd5b)

### A. Vocabulario unico de estados
- show-status.ts reescrito con los 13 valores reales del enum DB + aliases legacy; SHOW_STATUS_OPTIONS compartido con el select de ShowForm (duplicado eliminado).
- Efecto: badge 'Proximamente' (no 'proximamente' crudo) en Shows, Actividad y BookingModule.

### B. Updates optimistas anti-lag
- Dashboard onSave/delete + admin onSave actualizan estado local con la respuesta del API antes del re-fetch (respaldo). DELETE sin reload.
- Causa del 'no se refleja': fetch-on-mount + Turso replica lag (hasta 60s+ medido).

### C. Exportar Dossier EPK
- Boton full-width XL -> primario compacto (mantiene estados idle/loading/success/error); toggle JSON/HTML -> estilo tabs DossierEditor.

### D. Last.fm
- Padding uniforme rama vacia (p-6). Icono: verificado en codigo (glyph texto, sin <img> roto); si persiste aspecto roto en algun browser -> swap a SVG.

### E. Actividad: Editar icono unificado
- Link texto ambar en tracks -> mismo boton lapiz que shows.

### Verificacion
- tsc 0, unit 110, build OK; prod-exhaustive 50/50 (con checks 'Proximamente' + 'Valencia, Venezuela' + sin 'proximamente');
- fase2-functional local 8/8 (create/render/expand 5 strings/optimistic edit/sync/restore/cleanup). DB prod limpia.
"; Add-Content -LiteralPath "docs/AI_LOG.md" -Value @"

### Batch 4b (2026-09-23, 33cbd5b)
Estados unificados, optimistic shows, exportar compacto, Last.fm padding, editar-icono. Matrix 50/50 + funcional 8/8. Leccion: reads Turso pueden ir a replicas distintas en segundos (poll + reload-loop en harness).
