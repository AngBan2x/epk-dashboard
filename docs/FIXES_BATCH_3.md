# Batch 3 — Secciones Dashboard (RESULTADOS)

**Fecha:** 2026-09-22 / 2026-09-23
**Modelo:** Muse Spark 1.3 Free (OpenCode Zen)
**Trigger:** Usuario reporta inconsistencia de diseño e información en dashboard artista
**Relacionado:** `docs/FIXES_BATCH_1.md` (datos base), `docs/FIXES_BATCH_2.md` (design system + admin form)
**Commits:** `332254f` (código) · docs + release en `v4.0.0-rc.25`
**Migración:** WSL → Windows a mitad del trabajo; verificación completa en Windows

---

## Problemas (del reporte original, ámbito Batch 3)

3. Bio muestra contenido fallback falso si press vacío
4. Headers de cards inconsistentes (h2/h3, text-lg/xl, subtítulos)
5. Botón "Imprimir Hoja de Prensa" duplicado en Bio
6. Badges con mismos datos en colores distintos
7. "Download" en inglés
8. Empty states inconsistentes
9. DossierEditor y BioSection no comparten press_text (headers distintos)

---

## Primitivos UI (creados antes, compartidos con Batch 2)

- `components/ui/SectionHeader.tsx` — emoji + h2 + subtítulo + badges/acción
- `components/ui/EmptyState.tsx` — emoji + mensaje + CTA opcional
- `components/ui/Badge.tsx` — CountBadge + StatusBadge
- `lib/show-status.ts` — mapa unificado de estados de shows

---

## Cambios por sección

| Archivo | Cambio |
|---------|--------|
| `components/BioSection.tsx` | `fallbackBio` eliminado (sin contenido inventado), 1× botón Imprimir (`:58`), SectionHeader, EmptyState |
| `components/DownloadCenter.tsx` | "Descargar" ES (`:157`), CountBadge shared, hover primary-700 |
| `components/ShowsBooking.tsx` | h2 + SectionHeader, StatusBadge de `lib/show-status` |
| `components/DossierEditor.tsx` | header en expandido, hover primary-700, SectionHeader |
| `components/EPKExporter.tsx` | text-lg, CountBadge, EmptyState/deshabilitar si 0 tracks |
| `components/LastfmMetrics.tsx` | SectionHeader completo |
| `components/BookingModule.tsx` | StatusBadge shared |
| `app/dashboard/page.tsx` | secciones nativas envueltas en cards, col-span fix, SectionHeader |

**NO tocó** `lib/db.ts` ni `app/api/*` (regla de exclusividad por batch).

---

## Criterios de aceptación

- [x] Bio sin contenido inventado — `fallbackBio` eliminado
- [x] Todas las cards de sección usan SectionHeader
- [x] Un solo botón Imprimir en Bio
- [x] "Descargar" en español
- [x] Badges compartidos (`Badge.tsx` + `show-status.ts`)
- [x] Empty states consistentes (EmptyState)
- [x] typecheck 0 errores
- [x] Visual test 8/8 (C1–C5b cubren Batch 3)

---

## Verificación (Windows, 2026-09-23)

- `npx tsc --noEmit` → **PASS (0 errores)**
- `pnpm test:unit` → **PASS (10 files / 110 tests)**
- `pnpm build` → **PASS**
- `scripts/batch2-visual.ts` → **8 PASS / 0 FAIL / 0 SKIP**
  - C1 SectionHeaders (h2) ×8–9 en dashboard artista
  - C2 Bio sin contenido fake
  - C3 "Descargar" ES
  - C4 Un solo botón Imprimir
  - C5 Stats visibles (Shows + Suscriptores)
  - C5b Shows stat value=2
  - C6 Admin form labels (Batch 2)
  - C7 Admin Guardar style (Batch 2)
- Screenshots: `tests/screenshots/batch2/{dark,light}/` (no commiteados)

### E2E smoke (`dashboard.spec.ts` + `auth-qa.spec.ts`)

Resultado: **5 passed / 7 failed — todos pre-existentes, ninguno es regresión del batch.**

| Spec | Fallo | Causa |
|------|-------|-------|
| `dashboard.spec.ts` (2) | `h1` con "PressPlay" | Expectativa desactualizada: el h1 real dice "Panel de Administración" / saludo artista |
| `dashboard.spec.ts` | `/` → `/dashboard` | Expectativa desactualizada: `/` ahora es landing page |
| `auth-qa.spec.ts` (5) | timeouts `networkidle` | El spec hardcodea `BASE_URL=https://epk-dashboard.vercel.app` (testea prod, no local) |

**Follow-up:** actualizar `dashboard.spec.ts` a las expectativas reales; parametrizar `BASE_URL` en `auth-qa.spec.ts`. No bloquean rc.25.

---

## Release

- **Tag:** `v4.0.0-rc.25` (prerelease)
- Incluye: Batch 2 (design + admin) + Batch 3 (secciones) + fixes Windows + fix auth `no-store`
- Deploy: https://epk-dashboard.vercel.app (auto-deploy desde main)
