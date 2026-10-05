# v3.10–v3.11 · hotfixes, sesiones y auditoría de P3

> Extraído de `docs/AI_LOG.md` por C7 (2026-10-05): un fichero por época,
> **moviendo** el texto, sin reescribirlo. Para buscar algo, empieza por
> `docs/AI_LOG.md`, que es el índice.

## Fix: Dark Mode Consistency + iTunes→Apple Music Branding (v3.10.0)

**Fecha:** 2026-09-03
**Modelo:** MiMo V2.5 Free (OpenCode)
**Modo:** Build

### Problema
1. **Dark mode text ilegible**: `<h3>` y `<dd>` en ProductionDetails no tenían `dark:text-*` explícito, resultando en texto invisible sobre fondos oscuros
2. **Inconsistencia de palette**: Varios componentes usaban `dark:text-dark-*` (custom palette) en vez de `dark:text-slate-*` (estándar Tailwind)
3. **iTunes branding obsoleto**: Link mostraba "Comprar en iTunes" con URL de iTunes y color azul, cuando la plataforma actual es Apple Music

### Causa Raíz
1. ProductionDetails heredaba colores del padre sin definir los suyos propios para dark mode
2. La palette `dark` en tailwind.config.ts era idéntica a `slate`, pero su uso creaba confusión semántica (`dark:text-dark-300` = doble token `dark`)
3. El link nunca se actualizó cuando iTunes fue reemplazado por Apple Music

### Solución
1. Agregar `dark:text-slate-100` al `<h3>` y `dark:text-slate-200` al `<dd>` en ProductionDetails
2. Reemplazar todos los `dark:*-dark-*` por `dark:*-slate-*` en 8 archivos: LyricsModal, Button, Modal, Card, Skeleton, VideoShowcase, ImageGallery, AudioVisualizer
3. Cambiar "Comprar en iTunes" → "Escuchar en Apple Music", URL `itunes.apple.com` → `music.apple.com`, color `blue` → `pink`

### Archivos Modificados
| Archivo | Acción |
|---------|--------|
| `components/ProductionDetails.tsx` | Agregar dark:text-slate-100 y dark:text-slate-200 |
| `components/LyricsModal.tsx` | text-dark-600 → text-slate-600 + h2 dark:text-slate-100 |
| `components/ui/Button.tsx` | secondary + ghost: dark:bg-dark-* → dark:bg-slate-* |
| `components/ui/Modal.tsx` | border + close button: dark:text-dark-* → dark:text-slate-* |
| `components/ui/Card.tsx` | Limpiar duplicate dark:border-dark-* |
| `components/ui/Skeleton.tsx` | dark:bg-dark-* → dark:bg-slate-* |
| `components/VideoShowcase.tsx` | bg + border + text: dark:*-dark-* → dark:*-slate-* |
| `components/ImageGallery.tsx` | bg + border + text: dark:*-dark-* → dark:*-slate-* |
| `components/AudioVisualizer.tsx` | bg + border: dark:*-dark-* → dark:*-slate-* |
| `components/MetricsCharts.tsx` | 3 h3 headings: agregar dark:text-slate-100 |
| `app/track/[id]/page.tsx` | iTunes → Apple Music branding |
| `.opencode/agents/visual-tester.md` | Modelo → Nemotron 3 Nano Omni (vision-capable) |

### Quality Gates
| Check | Resultado |
|-------|-----------|
| TypeScript | ✅ 0 errores |
| Unit Tests | ✅ 41/41 passing |
| Vision QA (Nemotron 3 Nano Omni) | ✅ 4/4 elementos PASS (Tendencia Histórica N/A — requiere trackId) |

### Commits
- `e581525` — fix: dark mode consistency + iTunes→Apple Music branding (v3.10.0)
- `6975501` — feat: visual-tester with DOM fallback when Gemma rate-limited
- `b7bde58` — fix: dark mode headings in LyricsModal + MetricsCharts + switch visual-tester to Nemotron 3 Nano Omni

### Release
- v3.10.0: https://github.com/AngBan2x/epk-dashboard/releases/tag/v3.10.0

---

## v3.10.1 — Track Page: SVG + Spacing + Icon Colors

**Fecha:** 2026-09-03

### Fixes
| Fix | Causa raíz | Cambio |
|-----|-----------|--------|
| **Enlaces Externos spacing** | Links muy juntos (`space-y-3` sin gap horizontal) | Cambiar a `flex flex-col gap-3` |
| **Apple Music SVG truncado** | Path del SVG de Apple Music incompleto (508 chars vs 1000+) | Reemplazar con path completo de Simple Icons |
| **Streams/Saves/Playlists icon colors** | `<div>{icon}</div>` sin color inline — usaba color por defecto del tema | Agregar `style={{ color }}` al div del ícono |
| **SocialBar Apple Music missing** | `appleMusicUrl` prop definida pero no destruida ni usada en links array | Agregar destrucción + push al array con AppleMusicIcon |
| **MetricCard emoji icons** | Emojis ▶♥♫ renderizan pequeño e inconsistente | Reemplazar con SVG icons inline (play, heart, music) |
| **Recharts ResponsiveContainer empty** | Charts no renderizan al capturar antes de hydration | Agregar `minHeight={200}` + `key` al Pie |
| **Visual-tester model** | Gemma 4 31B rate-limited en OpenRouter | Cambiar a Nemotron 3 Nano Omni (vision-capable, gratuito) |

### Commits
- `13748c2` — fix: track page — Apple Music SVG, external links spacing, metric icon colors
- `2b9b994` — fix: SocialBar Apple Music link + MetricCard SVG icons + track page spacing
- `e536e64` — fix: Recharts ResponsiveContainer minHeight + pie key to fix empty chart rendering
- `40881df` — fix: AudioPlayer — remove redundant title, 'Reproducir preview (30s)', improve contrast

### Quality Gates
| Check | Resultado |
|-------|-----------|
| TypeScript | ✅ 0 errores |
| Unit Tests | ✅ 41/41 passing |
| Visual QA (Vercel production) | ✅ Charts, icons, spacing, dark mode, contrast — all PASS |

### Release
- v3.10.1: https://github.com/AngBan2x/epk-dashboard/releases/tag/v3.10.1

---

## v3.10.2 — Visual Tester: Proactive Detection + Cross-Page Consistency

**Fecha:** 2026-09-03

### Cambios
| Cambio | Descripción |
|--------|-------------|
| **Modelo corregido** | Referencia a "Gemma 4 31B" → Nemotron 3 Nano Omni (el que realmente está configurado) |
| **Detección proactiva** | Checklist de 30+ items que el agente debe verificar SIN que se le pida: texto truncado, colores hardcodeados, iconos rotos, spacing inconsistente, etc. |
| **Consistencia cross-page** | Verificar que componentes compartidos (AudioPlayer, MetricCard, SocialBar, Card, Button, Modal) se vean IGUAL en todas las páginas |
| **Análisis de imágenes** | Buscar issues visuales comunes: elementos superpuestos, imágenes rotas, SVG truncados, desbordamiento |
| **Formato de reporte** | Sección dedicada para "Detección Proactiva" y "Consistencia Cross-Page" en el reporte |

### Archivos modificados
- `.opencode/agents/visual-tester.md` — Reescritura completa con mejoras

---

## v3.10.3 — Auth Fixes: Session Cookies + Likes Counting

**Fecha:** 2026-09-03

### Problema 1: Cookie "Remember Me" — Sesión persiste sin expiración
| Aspecto | Antes | Después |
|---------|-------|---------|
| Token de sesión | `{userId, email, role}` — sin `iat`/`exp` | `{userId, email, role, iat, exp?}` — con timestamp |
| expiración | Solo `maxAge` en cookie (session cookie sin `maxAge` = indefinido) | Token lleva `exp` embebido: 24h si no rememberMe, indefinido si rememberMe |
| Validación middleware | Solo decodificaba `atob()` + `JSON.parse()` — nunca verificaba expiración | `decodeSessionToken()` + `isSessionValid()` — rechaza tokens expirados |
| Login page | Sin checkbox "Recordar sesión" | Checkbox + `rememberMe` state pasado al `login()` |

### Problema 2: Likes — Cookie name mismatch + auth insegura
| Aspecto | Antes | Después |
|---------|-------|---------|
| Cookie leída | `session_user_id` (no existe en el auth flow) | `auth_session` (la que realmente setea el login) |
| Decode | `req.cookies.get("session_user_id")?.value` (raw string) | `decodeSessionToken()` + `isSessionValid()` |
| Header fallback | `x-user-id` header (spoofable, inseguro) | Eliminado — solo cookie auth |

### Commits
- `lib/auth.ts` — utilidad compartida `decodeSessionToken()` + `isSessionValid()`
- `app/api/auth/login/route.ts` — agregar `iat`/`exp` al token
- `app/login/page.tsx` — agregar checkbox "Recordar sesión"
- `middleware.ts` — usar `decodeSessionToken()` + verificar `exp`
- `app/api/auth/me/route.ts` — usar `decodeSessionToken()` + verificar `exp`
- `app/api/likes/route.ts` — fix cookie name + decode + eliminar header fallback

### Quality Gates
| Check | Resultado |
|-------|-----------|
| TypeScript | ✅ 0 errores |
| Unit Tests | ✅ 41/41 passing |

---

## v3.11.0 — Fase P1.8: Setup para Fase P Profesional

**Fecha:** 2026-09-04
**Modelo:** Mimo v2.5 Free
**Modo:** Build

### Objetivo
Preparar infraestructura para la Fase P (Profesional v4.0.0): crear 12 subagentes especializados + configurar MCP Unsplash para stock photos.

### Decisión: Shutterstock vs Unsplash
| Opción | Estado | Decisión |
|--------|--------|----------|
| Shutterstock MCP (ag2-mcp-servers) | Auto-generado, 0 stars, Python | ❌ No confiable |
| Unsplash API | Gratuita, 50 req/hora, sin API key para demos | ✅ Seleccionada |

### Subagentes Creados (12)
| # | Archivo | Nombre | Para qué |
|---|---------|--------|----------|
| 1 | `.opencode/agents/landing-page-builder.md` | Landing Page Builder | Página de inicio profesional (Unsplash bg, hero, CTAs) |
| 2 | `.opencode/agents/header-builder.md` | Header Builder | Header sticky + mobile-first + footer |
| 3 | `.opencode/agents/artist-dashboard-builder.md` | Artist Dashboard Builder | Panel de control de artista + perfil |
| 4 | `.opencode/agents/release-form-builder.md` | Release Form Builder | CRUD lanzamientos + auto-metadata iTunes + cover handling |
| 5 | `.opencode/agents/show-form-builder.md` | Show Form Builder | CRUD shows + estados + pagos + disclaimer |
| 6 | `.opencode/agents/approval-workflow-builder.md` | Approval Workflow Builder | Sistema aprobación admin → artista |
| 7 | `.opencode/agents/notification-builder.md` | Notification Builder | Notificaciones in-app + email (Resend) |
| 8 | `.opencode/agents/subscriber-builder.md` | Subscriber Builder | Rol suscriptor + suscripciones + preferencias |
| 9 | `.opencode/agents/search-builder.md` | Search Builder | Búsqueda en tiempo real (SQLite LIKE, debounced) |
| 10 | `.opencode/agents/account-settings-builder.md` | Account Settings Builder | Gestión de cuenta (email verif, password, notifs, eliminar 30d) |
| 11 | `.opencode/agents/carousel-builder.md` | Carousel Builder | Carruseles infinitos de artistas/lanzamientos |
| 12 | `.opencode/agents/social-links-builder.md` | Social Links Builder | SVG icons (17 plataformas) + CRUD social links |

### MCP Configurado
| MCP | Estado | Uso |
|-----|--------|-----|
| Unsplash | ❌ No hay MCP oficial | API directa via fetch con `UNSPLASH_ACCESS_KEY` |

### Unsplash API (Configurado)
| Variable | Valor | Ubicación |
|----------|-------|-----------|
| `UNSPLASH_APP_ID` | `1054368` | `.env.local` (gitignored) |
| `UNSPLASH_ACCESS_KEY` | `3XPRD-...` | `.env.local` (gitignored) |
| `UNSPLASH_SECRET_KEY` | `vATuK...` | `.env.local` (gitignored) |

### Commits
- `e1a7baf` — feat(P1.8): setup Phase P Professional — 12 subagents + Unsplash API + roadmap
- `3560fb1` — fix(P1.8): correct model reference in 4 subagentes
- `973ca0f` — chore: add Unsplash API credentials to .env.local + update docs

### Release
- v3.11.0: https://github.com/AngBan2x/epk-dashboard/releases/tag/v3.11.0

### Roadmap Fase P: Profesional (v4.0.0)
| Fase | Nombre | Tasks | Estado |
|------|--------|-------|--------|
| **P1.8** | Setup: subagentes + API Unsplash | 12 subagentes + credenciales Unsplash | ✅ Completada |
| **P2** | Foundation: DB + Landing + Header | 9 tasks | ✅ Completada |
| **P3** | Artist Self-Management | 8 tasks | ⏳ Pendiente |
| **P4** | Subscribers + Notifications + Search | 7 tasks | ⏳ Pendiente |
| **P5** | Polish + Demo + Release v4.0.0 | 6 tasks | ⏳ Pendiente |

---
