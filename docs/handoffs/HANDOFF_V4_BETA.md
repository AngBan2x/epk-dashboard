# HANDOFF: v4.0.0-beta.1 — Critical Fixes + YouTube API + Visualizer

## Estado Actual
- **Fecha:** 2026-09-07
- **Último release:** v4.0.0-alpha.3 (5 sept 2026)
- **HEAD:** 7d19655 (5+ commits sin release)
- **Working tree:** Limpio
- **Target release:** v4.0.0-beta.1 (prerelease)

## Issues a Resolver (6)

### Issue 1: Label duplicado "Preview (30s) (30s)"
- **Archivo:** `components/AudioPlayer.tsx:180`
- **Causa:** `audio-priority.ts:51` retorna `label: 'Preview (30s)'` y AudioPlayer agrega `(30s)` otra vez
- **Fix:** Eliminar `{s.type === 'preview' && '(30s)'}` — el label ya lo incluye

### Issue 2: YouTube IFrame API para tracks YouTube-only
- **Archivos:** `context/AudioPlayerContext.tsx` + `components/GlobalAudioPlayer.tsx` + `lib/youtube-player.ts` (nuevo)
- **Causa:** "Se Va" y "The Rain" no reproducen audio porque `audioUrl` es string vacío
- **Fix:** Wrapper de YouTube IFrame API que controla playback via iframe oculto

### Issue 3: Visualizer stuck — no se puede cerrar
- **Archivos:** `context/AudioPlayerContext.tsx` + `components/GlobalAudioPlayer.tsx`
- **Causa:** `clearTrack()` no cierra visualizer + no hay botón X dentro del visualizer
- **Fix:** Agregar `setIsVisualizerOpen(false)` en `clearTrack()` + botón X dentro del visualizer

### Issue 4: Download Center layout roto
- **Archivo:** `components/DownloadCenter.tsx:201-236`
- **Causa:** Flex layout con nombres largos causa superposición
- **Fix:** Reestructurar flex: asset info con `min-w-0 flex-1`, botón con `flex-shrink-0`

### Issue 5: Tests de archivos descargables
- **Archivos:** `lib/downloadable-assets.ts` (nuevo) + `tests/unit/downloadable-assets.test.ts` (nuevo)
- **Fix:** Extraer funciones de generación HTML + tests unitarios + E2E

### Issue 6: Visualizer lifecycle tests
- **Archivo:** `tests/e2e/audio-player-stress.spec.ts`
- **Fix:** Tests de visualizer antes/durante/después de play + clearTrack

## Orden de Ejecución
1. Fase 1: Issues 1, 3, 4 (paralelo — fixes rápidos)
2. Fase 2: Issue 5A (refactor) → 5B (unit tests)
3. Fase 3: Issue 2 (YouTube API — más complejo)
4. Fase 4: Issues 5C + 6 (E2E tests)
5. Fase 5: Typecheck → Build → Tests → Docs → Release

## Comando de Release
```bash
gh release create v4.0.0-beta.1 --prerelease \
  --title "v4.0.0-beta.1 — Critical Fixes + YouTube API + Visualizer" \
  --generate-notes
```

## Contexto del Proyecto
- **Framework:** Next.js 14 (App Router), TypeScript 5 strict
- **Package manager:** pnpm (NO npm)
- **Dev server:** `pnpm dev`
- **Admin:** admin@epk.local / admin123
- **Test user:** angab06@gmail.com / 12345678
- **Repo:** https://github.com/AngBan2x/epk-dashboard
- **Vercel:** https://epk-dashboard.vercel.app
