# HANDOFF: Landing Page Rediseño Visual

## Estado Actual
- **Fecha:** 2026-09-04
- **Bloqueo:** Cuota OpenRouter agotada — ejecución pendiente hasta reinicio
- **Plan aprobado por:** Usuario
- **Documentación:** `docs/AI_LOG.md` (sección "Bugfix: Landing Page — Rediseño Visual")

## Problemas a Resolver (8 bugs visuales)

| # | Bug | Archivo | Línea |
|---|-----|---------|-------|
| 1 | Logo gigante (33-60% viewport) | `LandingHero.tsx` | 33 |
| 2 | Texto text-8xl (128px) | `LandingHero.tsx` | 40 |
| 3 | Estrella rebotante desbordada | `LandingHero.tsx` | 68-76 |
| 4 | CTA solapando features | `LandingHero.tsx` | 50-58 |
| 5 | Títulos "Cómo funciona" duplicados | `LandingFeatures.tsx` + `LandingHowItWorks.tsx` | — |
| 6 | Iconos genéricos (círculo/estrella x6) | Todos los landing components | — |
| 7 | SVG anidado roto | `LandingHowItWorks.tsx` | 50-55 |
| 8 | Animación CSS duplicada | `globals.css` | 31-37 |

## Ejecución del Fix

### Paso 1: Reescribir `components/landing/LandingHero.tsx`
```tsx
// Cambios clave:
- Logo: w-16 h-16 md:w-20 md:h-20 (antes w-1/3 md:w-1/2)
- Título: text-4xl md:text-5xl lg:text-6xl (antes text-8xl)
- Subtítulo: text-base md:text-lg
- 2 CTAs: "Explorar Catálogo" (sólido) + "Cómo Funciona" (outline, scroll)
- Eliminar scroll indicator (estrella rebotante)
- Overlay: gradiente sutil
```

### Paso 2: Reescribir `components/landing/LandingFeatures.tsx`
```tsx
// Cambios clave:
- Título: "¿Qué es PressPlay?"
- 3 cards con iconos SVG significativos:
  - Nota musical → "EPK para Artistas"
  - Calendario → "Shows & Eventos"
  - Corazón → "Sigue tus Favoritos"
- Fondo blanco, cards con bordes sutiles
```

### Paso 3: Reescribir `components/landing/LandingHowItWorks.tsx`
```tsx
// Cambios clave:
- Título: "Cómo Funciona"
- 3 pasos con números circulares (bg-emerald-500 text-white rounded-full)
  - ① Crea tu Perfil
  - ② Publica tu Música
  - ③ Conecta con tu Audiencia
- Fondo bg-slate-50 para contraste
```

### Paso 4: Limpiar `app/globals.css`
```css
// Eliminar:
@keyframes bounce { ... }
.animate-bounce { ... }

// Agregar:
html { scroll-behavior: smooth; }
```

### Paso 5: Verificar
```bash
npx tsc --noEmit        # 0 errores
npm run build           # build exitoso
pnpm dev                # verificar visualmente
```

## Notas para el Siguiente Modelo
- El plan está en `docs/AI_LOG.md` línea ~1968
- NO ejecutar hasta que el usuario confirme que la cuota OpenRouter se reinició
- El usuario quiere un diseño "profesional" — no más iconos genéricos
- Los 2 CTAs son importantísimos para el usuario
- El Footer está bien — no tocar
- El ClientLayout.tsx no necesita cambios
- La landing page es `app/page.tsx` — no necesita cambios de estructura
