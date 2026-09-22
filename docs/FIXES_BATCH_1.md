# Batch Fixes — 8 Issues (Plan Inicial)

**Fecha:** 2026-09-22
**Estado:** Plan inicial documentado
**Modelo:** Nemotron 3 Ultra Free (opencode)
**Release objetivo:** v4.0.0-rc.24

---

## Issues a Resolver

### Fix 1: Ficha de Producción — Data Loss + Styling
**Archivos afectados:**
- `lib/db.ts:580-594` — `parseProductionDetails()` solo lee 5 de 11 campos
- `lib/validations.ts:15-21` — `ProductionDetailsSchema` valida solo 5 campos
- `components/ProductionDetails.tsx` — View mode `gap-2` vs edit `gap-3`, labels sin `mb-1`
- `app/releases/[id]/edit/page.tsx:46-52` — Local state solo 5 campos
- `app/releases/[id]/edit/page.tsx:496-551` — Form UI solo 5 campos

**Root cause:** `parseProductionDetails()` dropea 6 campos extendidos (genre, sub_genre, bpm, mood, recording_date, production_credits)

---

### Fix 2: YouTube Timestamps en Release Edit
**Archivos afectados:**
- `app/releases/[id]/edit/page.tsx:13-17` — `TrackInput` sin `start_time`/`end_time`
- `app/releases/[id]/edit/page.tsx:92-98` — No carga timestamps del DB
- `app/api/releases/route.ts:197-204` — `ALLOWED_COLUMNS` los excluye
- `app/api/tracks/[id]/route.ts:52` — `allowedFields` los bloquea
- `app/releases/[id]/edit/page.tsx:446-482` — Sin UI para timestamps

**Root cause:** 5 bugs — edit page dropea timestamps, API whitelist los bloquea

---

### Fix 3: Test Show Cleanup + Notificación Artista
**Archivos afectados:**
- DB: `DELETE FROM shows WHERE venue_name LIKE 'Test%' OR venue_name = 'Null Test' OR venue_name LIKE 'Minimal%'`
- `app/api/shows/route.ts:99-128` — Insertar notificación tras `createShow()`
- `types/music.ts:221` — Añadir `"show_pending_review"` a `NotificationType`

**Root cause:** Shows de test contaminan producción, artista no notificado al enviar show

---

### Fix 4: Header Nav — "Catálogo" Duplicado
**Archivos afectados:**
- `components/Header.tsx:38-43` — Branch logged-in desktop muestra ambos
- `components/Header.tsx:122-128` — Branch logged-in mobile muestra ambos

**Root cause:** Ambos links van a `/dashboard`, solo uno necesario para usuarios logueados

---

### Fix 5: Admin Profile — Press Text/Highlights No Persisten
**Archivos afectados:**
- `app/admin/page.tsx` — Form state (lines 98-106), edit-populate (1128-1138), form JSX (1266-1286), PUT payload (1178-1190)
- `app/api/artists/[id]` PUT handler

**Análisis:** Código parece correcto. Requiere verificación manual + logging si falla

---

### Fix 6: Centro de Descargas — Overlap Texto/Badges
**Archivos afectados:**
- `components/DownloadCenter.tsx:116-133` — Header flex con título + badges

**Root cause:** En sidebar estrecho (~266px), badges se superponen al título

---

### Fix 7: Like Button Login en Artist Detail
**Archivos afectados:**
- `components/EPKCard.tsx:85-93` — `onLoginPrompt?.()` no-op si no se pasa
- `app/artists/[id]/page.tsx` — Server Component, `TracksSection` sin `onLoginPrompt` ni `LoginModal`

**Root cause:** Página Server Component no puede pasar handler a Client Component

---

### Fix 8: Press Gallery CRUD — Edit/Delete Buttons
**Archivos afectados:**
- `components/ImageGallery.tsx` — Solo upload toggle, sin edit/delete per-tile
- `components/ImageGalleryWrapper.tsx` — Solo `onImageAdded`, sin `onImageRemoved`
- `app/api/upload/image/route.ts` — Solo POST, sin DELETE
- `app/api/tracks/[id]/route.ts:52` — `gallery_images` no en `allowedFields`
- R2: `DeleteObjectCommand` no implementado (0 usos en proyecto)

**Root cause:** Arquitectura append-only. Solo existe POST `/api/upload/image`. Galería solo existe en `/track/[id]`, NO en release pages.

---

## Plan de Ejecución

### Batch A (Paralelo — archivos independientes)
1. **Fix 1** — Ficha de Producción (5 archivos)
2. **Fix 2** — YouTube Timestamps (5 archivos)
4. **Fix 4** — Header Nav (1 archivo, 2 ubicaciones)
6. **Fix 6** — DownloadCenter Overlap (1 archivo)

### Batch B (Paralelo — archivos independientes)
3. **Fix 3** — Test Show Cleanup + Notification (DB + 2 archivos)
7. **Fix 7** — Like Button Login (2 archivos)
8. **Fix 8** — Press Gallery CRUD (5 archivos + R2 delete)

### Batch C (Verificación)
5. **Fix 5** — Admin Press Fields (verificación manual)

### Post-Implementation
- Typecheck: `npx tsc --noEmit`
- Unit tests: `pnpm test:unit`
- E2E tests: `npx playwright test` (visible browser)
- Visual screenshots: Todas las páginas públicas + protegidas
- Cleanup: Eliminar `test-rc23.js`, `test-loading.js`
- Commit + Push + Deploy
- Documentación final en `docs/FIXES_BATCH_1.md` + `docs/AI_LOG.md`

---

## Testing Strategy

| Check | Herramienta | Esperado |
|-------|-------------|----------|
| TypeScript | `tsc --noEmit` | 0 errores |
| Unit tests | `pnpm test:unit` | 41/41 passing |
| E2E tests | Playwright (headless: false) | All passing |
| Visual | Screenshots dark/light/mobile | Sin regresiones |
| DB cleanup | Verificar shows test eliminados | 0 test shows |
| R2 cleanup | Verificar objetos huérfanos eliminados | 0 huérfanos |

---

## Cleanup Checklist
- [ ] `test-rc23.js` eliminado
- [ ] `test-loading.js` eliminado
- [ ] Test shows eliminados de producción
- [ ] Test releases eliminados de producción
- [ ] Test tracks eliminados de producción