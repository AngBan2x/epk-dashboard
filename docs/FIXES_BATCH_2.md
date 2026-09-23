# Batch 2 — Design System + Admin Form (PLAN + RESULTADOS)

> **Alcance:** este doc cubre Batch 1 (datos) y Batch 2 (design + admin).
> Batch 3 (secciones dashboard) documentado por separado en `docs/FIXES_BATCH_3.md`.

**Fecha:** 2026-09-22
**Modelo:** Nemotron 3 Ultra Free (opencode)
**Trigger:** Usuario reporta inconsistencia de diseño e información en dashboard
**Migración:** WSL → Windows (mitad del trabajo); typecheck/docs re-verificados en Windows

---

## Problemas Reportados

1. Stats "0 Shows" con 1 show real en sección
2. Stats "Suscriptores = 0" siempre
3. Bio muestra contenido fallback falso si press vacío
4. Headers de cards inconsistentes (h2/h3, text-lg/xl, subtítulos)
5. Botón "Imprimir Hoja de Prensa" duplicado en Bio
6. Badges con mismos datos en colores distintos
7. "Download" en inglés
8. Empty states inconsistentes
9. DossierEditor y BioSection no comparten press_text

---

## Estrategia (3 batches paralelos)

### Primitivos UI (creados ANES de agents para evitar race conditions)
- `components/ui/SectionHeader.tsx` — emoji + h2 + subtítulo + badges/acción
- `components/ui/EmptyState.tsx` — emoji + mensaje + CTA opcional
- `components/ui/Badge.tsx` — CountBadge + StatusBadge
- `lib/show-status.ts` — mapa unificado de estados de shows

### Batch 1 — Datos (archivos exclusivos)
- `lib/db.ts` — `getSubscriberCount(artistId)`
- `app/api/dashboard/route.ts` — retornar `subscribers`; shows sin filtro `approved=1` (usar `getShowsByArtist` o variante)
- `app/api/shows/route.ts` + `lib/validations.ts` — si se necesita `approved` en schema
- **NO toca componentes**

### Batch 2 — Design system + Admin form
- `components/ui/Button.tsx` — variantes canónicas primary/secondary/ghost
- `app/admin/page.tsx` — form "Editar Artista" con estilo card consistente (labels, spacing, textarea)
- **NO toca** Bio/Download/Shows/Dossier/EPK/Lastfm ni db/api

### Batch 3 — Secciones dashboard → ver `docs/FIXES_BATCH_3.md` (resultados finales ahí)

---

## Criterios de aceptación
- [x] Stats Shows = total de shows del artista (incl. pendientes) — filtro `approved=1` eliminado de `getShowsByArtists` (`lib/db.ts:1481`)
- [x] Stats Suscriptores = count real — `getSubscriberCount` + `app/api/dashboard/route.ts` retorna `subscribers`
- [x] Bio sin contenido inventado — `fallbackBio` eliminado de `BioSection.tsx`
- [x] Todas las cards de sección: SectionHeader (`components/ui/SectionHeader.tsx`)
- [x] Un solo botón Imprimir en Bio (`BioSection.tsx:58`)
- [x] "Descargar" en español (`DownloadCenter.tsx:157`)
- [x] Badges compartidos (`components/ui/Badge.tsx` + `lib/show-status.ts`)
- [x] typecheck 0 errores (`npx tsc --noEmit` EXIT:0)
- [x] Visual test screenshots (8 PASS / 0 FAIL / 0 SKIP)

## Testing
- `npx tsc --noEmit` → **PASS (0 errores)**
- `pnpm build` → **PASS** (prebuild corregido a cross-platform)
- `pnpm test:unit` → **PASS (10 files / 110 tests)**
- Visual test `scripts/batch2-visual.ts` → **8 PASS / 0 FAIL** (C1–C7 completos):
  - C1 SectionHeaders (h2) en dashboard artista
  - C2 Bio sin contenido fake
  - C3 "Descargar" en español
  - C4 Un solo botón Imprimir
  - C5 Stats visibles (Shows + Suscriptores)
  - C5b Shows stat value=2
  - C6 Admin form: Biografía + Texto de Prensa + Destacados de Prensa
  - C7 Admin Guardar button style primary-600/700
- Screenshots: `tests/screenshots/batch2/{dark,light}/`

## Bugs encontrados y corregidos en Windows (post-migración)
1. `app/admin/page.tsx:1260` — `artistProfile.biography` → `artistForm.biography` (TS2304)
2. `app/dashboard/page.tsx` — `interface DashboardData` duplicada (líneas 22 y 81) → eliminada la segunda
3. `hover:bg-primary-500` residual en `LyricsSection`, `ProductionDetails`, `StemsPlayer` → `hover:bg-primary-700`
4. `package.json` `prebuild` usaba `rm -f` (Unix-only) → reescrito con `node -e` cross-platform
5. Auth caching: `/api/auth/me` 401 sin cache headers → browser replay de 401 tras login; añadido `no-store` en route + `AuthContext.fetchUser`

## Archivos modificados (git status)
- M: admin/page, api/auth/me/route, api/dashboard/route, dashboard/page, AuthContext, BioSection, BookingModule, DossierEditor, DownloadCenter, EPKExporter, LastfmMetrics, ShowsBooking, LyricsSection, ProductionDetails, StemsPlayer, ui/Button, lib/db, package.json
- ??: ui/Badge, ui/EmptyState, ui/SectionHeader, lib/show-status, docs/FIXES_BATCH_2.md

## Cleanup
- [x] Eliminar scripts de test temporal
- [x] Actualizar AI_LOG.md al final
