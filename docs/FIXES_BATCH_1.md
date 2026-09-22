# Batch Fixes — 8 Issues (COMPLETADO)

**Fecha:** 2026-09-22
**Estado:** Completado y deployed
**Modelo:** Nemotron 3 Ultra Free (opencode)
**Release:** v4.0.0-rc.24
**Commit:** `6d8d709`

---

## Issues Resueltos

### Fix 1: Ficha de Producción — Data Loss + Styling ✅
**Archivos modificados:** 5
- `lib/db.ts:580-594` — `parseProductionDetails()` ahora lee 11 campos
- `lib/validations.ts:15-21` — `ProductionDetailsSchema` valida 11 campos
- `components/ProductionDetails.tsx` — View mode `gap-2`→`gap-3`, labels con `mb-1`
- `app/releases/[id]/edit/page.tsx:46-60` — Local state expandido a 11 campos
- `app/releases/[id]/edit/page.tsx:496-580` — Form UI con 11 campos

**Root cause:** `parseProductionDetails()` dropeaba 6 campos extendidos

---

### Fix 2: YouTube Timestamps en Release Edit ✅
**Archivos modificados:** 5
- `app/releases/[id]/edit/page.tsx:13-17` — `TrackInput` con `start_time`/`end_time`
- `app/releases/[id]/edit/page.tsx:106-112` — Carga timestamps del DB
- `app/api/releases/route.ts:197-205` — `ALLOWED_COLUMNS` incluye timestamps
- `app/api/tracks/[id]/route.ts:52` — `allowedFields` incluye timestamps
- `app/releases/[id]/edit/page.tsx:496-515` — UI inputs para start/end time

**Root cause:** 5 bugs — edit page dropeaba timestamps, API whitelist los bloqueaba

---

### Fix 3: Test Show Cleanup + Notificación Artista ✅
**Archivos modificados:** 2 + DB cleanup
- DB: `DELETE FROM shows WHERE venue_name LIKE 'Test%'...` — Eliminados shows test
- `app/api/shows/route.ts:123-135` — Notificación `show_pending_review` tras `createShow()`
- `types/music.ts:221` — Añadido `"show_pending_review"` a `NotificationType`

**Root cause:** Shows de test contaminaban producción, artista no notificado

---

### Fix 4: Header Nav — "Catálogo" Duplicado ✅
**Archivos modificados:** 1 (`components/Header.tsx`)
- Desktop: Removido "Catálogo" del branch logged-in
- Mobile: Removido "Catálogo" del branch logged-in

**Root cause:** Ambos links iban a `/dashboard`, redundante para usuarios logueados

---

### Fix 5: Admin Profile — Press Text/Highlights ✅
**Verificación:** Código verificado — `updateArtist()` maneja `pressText/press_text` y `pressHighlights/press_highlights` correctamente.

---

### Fix 6: Centro de Descargas — Overlap Texto/Badges ✅
**Archivos modificados:** 1 (`components/DownloadCenter.tsx:116-133`)
- Título con `truncate`
- Badges en `flex-col sm:flex-row` con `whitespace-nowrap`

**Root cause:** En sidebar estrecho (~266px), badges se superponían al título

---

### Fix 7: Like Button Login en Artist Detail ✅
**Archivos modificados:** 2
- `app/artists/[id]/page.tsx` — Fetch tracks en server, pasa a Client Component
- `components/ArtistTracksSection.tsx` (NUEVO) — Client Component con `LoginModal` + `onLoginPrompt`

**Root cause:** Página Server Component no podía pasar handler a Client Component

---

### Fix 8: Press Gallery CRUD — Edit/Delete Buttons ✅
**Archivos modificados:** 5
- `components/ImageGallery.tsx` — Botones editar/eliminar por tile cuando `isOwner`
- `components/ImageGalleryWrapper.tsx` — Handlers `onImageRemoved` + `onImageEdited`
- `app/api/upload/image/route.ts` — `DELETE` handler con R2 `DeleteObjectCommand`
- `app/api/tracks/[id]/route.ts:52` — `gallery_images` en `allowedFields`
- R2: Implementado `DeleteObjectCommand` (era 0 usos en proyecto)

**Root cause:** Arquitectura append-only. Solo existía POST `/api/upload/image`.

---

## Quality Gates
- TypeScript: ✅ 0 errores
- Unit Tests: 93 passed / 17 skipped / 2 pre-existing env failures (better-sqlite3)
- Build: ✅ Production build successful
- Lint: ✅ 0 errores

---

## Cleanup Checklist
- ✅ `test-rc23.js` eliminado
- ✅ `test-loading.js` eliminado
- ✅ Test shows eliminados de DB local + **Turso (6 shows: `Test Venue*`, `Null Test`, `Minimal*`)**
- ✅ `test-rc24-visual.js` eliminado
- ✅ `test-rc24-retest.js` eliminado

---

## Visual Tests — rc.24 (Final)

**Fecha:** 2026-09-22  
**Servidor:** `localhost:3099` (dev)  
**Screenshots:** `tests/screenshots/rc24/{dark,light,mobile}/` — 39 archivos

### Suite principal (test-rc24-visual.js): 9 PASS / 2 FAIL / 1 SKIP

| # | Test | Status | Notas |
|---|------|--------|-------|
| 1 | Fix7 Like→Login | ✅ PASS | LoginModal visible en guest |
| 2 | Fix4 Header (desktop) | ✅ PASS | Sin "Catálogo" logged-in |
| 3 | Fix4 Header (mobile) | ✅ PASS | Sin "Catálogo" logged-in |
| 4 | Fix1 Extended prod fields | ✅ PASS | genre/bpm/mood/credits |
| 5 | Fix1 ProductionDetails | ✅ PASS | gap-3 + mb-1 |
| 6 | Fix2 Timestamp inputs | ✅ PASS | Start/End (s) |
| 7 | Fix8 Gallery upload btn | ✅ PASS | "+ Subir" |
| 8 | Fix6 DownloadCenter on track | ✅ PASS | truncate + badges stack |
| 9 | Fix3 Shows section | ✅ PASS | Sección visible admin |
| 10 | Fix1 Card emoji prefixes | ❌→✅ | Falso positivo: buscaba en dashboard admin; 📄📥📝🎤 viven en **dashboard de artista** |
| 11 | Fix5 Admin press fields | ❌→✅ | Falso positivo: script clickeó tab Tracks; campos viven en tab **Artistas** (sin placeholder, solo label) |
| 12 | Fix6 DownloadCenter badges | ⏭️ SKIP | Sección no existe en dashboard admin (correcto) |

### Retest (test-rc24-retest.js): 2/2 PASS

| # | Test | Status | Evidencia |
|---|------|--------|-----------|
| 1 | Fix1 Card emoji prefixes | ✅ PASS | `RE1-artist-dashboard-emoji.png` — 📄 Dossier, 📥 Descargas, 📝 Bio, 🎤 Shows (y=1365–1667, visible) |
| 2 | Fix5 Admin press fields | ✅ PASS | `RE3-admin-artist-edit-press.png` — Labels "Texto de Prensa" + "Destacados de Prensa" |

**Resultado real: 11 PASS / 0 FAIL / 1 SKIP** (los 2 FAIL originales eran bugs del test script, no del producto)

---

## Results
- Commit: `6d8d709` (code) + docs commit (visual results)
- Deploy: ✅ https://epk-dashboard.vercel.app
- Release: ✅ https://github.com/AngBan2x/epk-dashboard/releases/tag/v4.0.0-rc.24
- Visual Tests: ✅ 11 PASS / 0 FAIL / 1 SKIP