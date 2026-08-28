# PLAN DIRECTOR - EPK Dashboard Musical
**Proyecto:** Dashboard interactivo EPK (Electronic Press Kit) para artista musical  
**Arquitecto:** Orquestador IA (nemotron-3-ultra-free)  
**Fecha:** 2026-08-28  
**Estado:** EJECUCIÓN - Fase 0 en progreso  

---

## 1. DESGLOSE DE FASES DE DESARROLLO

### FASE 0: SETUP Y AUDITORÍA INICIAL (Pre-requisitos) ⏱️ ~2-3h
- [ ] Inicializar repositorio Git (`git init`)
- [ ] Configurar remoto GitHub (`gh repo create epk-dashboard --public --source=. --remote=origin`)
- [ ] Auditar conexiones MCP (`auditar-mcp` skill)
- [ ] Verificar estructura de datos (`catalog.json` + `music_catalog.db`)
- [ ] Scaffold Vite + React + TypeScript + Tailwind CSS
- [ ] Instalar dependencias: MCP clients, Zod, React Router, Playwright, Lucide React, etc.
- [ ] Crear agente `EPKCardGenerator` (Regla 4 obligatoria)
- [ ] Configurar Turso DB (réplica cloud de `music_catalog.db`)
- [ ] Primer commit + push
- [ ] `documentar-proyecto`: README base + `AI_LOG.md` init

### FASE 1: ARQUITECTURA DE DATOS Y TIPADO ⏱️ ~3-4h
- [ ] Generar tipos TypeScript desde `catalog.json` (`Artist`, `Track`, `Metrics`, `ProductionDetails`, `CountryStat`)
- [ ] Crear esquemas Zod/Valibot para validación runtime
- [ ] Implementar capa de acceso a datos (Repository Pattern) con MCP SQLite
- [ ] Sincronizar SQLite ↔ JSON (bidireccional)
- [ ] **Skill:** `auditar-mcp` (verificar SQLite MCP)
- [ ] **Comando:** `/auditar_fase` al finalizar

### FASE 2: COMPONENTES CORE UI (EPK Cards) ⏱️ ~4-5h
- [ ] Componente `EPKCard` responsivo (Mobile-first, Tailwind)
- [ ] Componente `AudioPlayer` con preview embebido
- [ ] Componente `ProductionDetails` (DAW, guitarras, efectos, afinación, tonalidad)
- [ ] Componente `LyricsModal` con botón desplegable
- [ ] Componente `MetricsDashboard` (streams, saves, playlist additions, top countries)
- [ ] **Null-Safety:** `youtube_video_id`, `effects_chain`, `lyrics` pueden ser `null`
- [ ] **Skill:** `validar-null-safety` en cada componente
- [ ] **Comando:** `/renderizar_epk` para generar tarjetas desde datos

### FASE 3: LAYOUT Y NAVEGACIÓN PRINCIPAL ⏱️ ~3-4h
- [ ] `Header` con nombre artista, género, ubicación, monthly listeners
- [ ] `TrackList` / `TrackGrid` con filtros (tipo release, fecha)
- [ ] `HeroSection` con métricas agregadas del artista
- [ ] Routing (React Router) - vistas: `/`, `/track/:id`, `/analytics`
- [ ] Responsive breakpoints: 320px, 768px, 1024px, 1440px
- [ ] **Skill:** `documentar-proyecto` (actualizar README + AI_LOG)

### FASE 4: INTEGRACIONES EXTERNAS Y ENRIQUECIMIENTO ⏱️ ~3-4h
- [ ] Embed YouTube (condicional a `youtube_video_id`)
- [ ] Embed Spotify (track URLs)
- [ ] Turso MCP: Sincronización cloud para persistencia multi-dispositivo
- [ ] GitHub MCP: Automatizar issues/PRs para feedback de stakeholders
- [ ] **Skill:** `auditar-mcp` (verificar Turso + GitHub + Playwright)

### FASE 5: TESTING, ACCESIBILIDAD Y AUDITORÍA ⏱️ ~4-5h
- [ ] Playwright MCP: Tests E2E (navegación, audio play, modales, responsive)
- [ ] Auditoria a11y (WCAG 2.1 AA): contraste, focus visible, ARIA labels
- [ ] TypeScript strict mode: `npx tsc --noEmit` (0 warnings)
- [ ] **Skill:** `validar-null-safety` (auditoría completa)
- [ ] **Skill:** `auditar-mcp` (verificación final todos los servidores)
- [ ] **Comando:** `/auditar_fase` exhaustiva

### FASE 6: DESPLIEGUE Y CI/CD ⏱️ ~2-3h
- [ ] Build producción (`npm run build`)
- [ ] Deploy a Vercel
- [ ] Configurar dominio personalizado (opcional)
- [ ] Verificar build en producción
- [ ] **Skill:** `git-workflow` (commit + push final)
- [ ] **Skill:** `documentar-proyecto` (README final + AI_LOG completo)
- [ ] **Skill:** `switch-context` (handoff final si aplica)

---

## 2. MATRIZ DE ASIGNACIÓN DE MODELOS LLM

| Fase | Modelo Recomendado | Proveedor | Justificación |
|------|-------------------|-----------|---------------|
| **Fase 0** | `nemotron 3 ultra free` | OpenCode | Razonamiento arquitectónico, decisiones de stack, setup inicial |
| **Fase 1** | `Nemotron 3 Ultra` | OpenRouter | Tipado estricto, generación de esquemas, validación de datos complejos |
| **Fase 2** | `Nemotron 3.5 Lightning` | OpenCode/OR | Velocidad para generación masiva de componentes UI, Tailwind fluido |
| **Fase 3** | `Nemotron 3.5 Lightning` | OpenCode/OR | Layouts, routing, responsive - tareas repetitivas de UI |
| **Fase 4** | `Nemotron 3 Ultra` | OpenRouter | Integraciones MCP complejas (Turso, GitHub), lógica async |
| **Fase 5** | `Gemma 4 26B A4B` | OpenRouter | Testing, accesibilidad, análisis estático - atención a detalle |
| **Fase 6** | `nemotron 3.5 lightning free` | OpenCode | Deploy, CI/CD, tareas operativas finales |

**Estrategia de Fallback:** Si un modelo falla en su fase asignada, escalar a `Nemotron 3 Ultra` (OpenRouter) o `Nemotron 3 Super` (OpenRouter) para mayor capacidad de razonamiento.

**Nota:** El modelo actual (`nemotron-3-ultra-free`) orquesta el plan completo y actúa como **Arquitecto Principal**. Los modelos especializados se invocan vía `/build` en cada fase.

---

## 3. ESTRATEGIA DE INTEGRACIÓN MCP

| Servidor MCP | Fases | Tareas Concretas |
|-------------|-------|------------------|
| **sqlite** | 0, 1, 2, 5 | - Consulta `SELECT * FROM tracks; SELECT * FROM artist;`<br>- Insert/Update tracks desde UI<br>- Validación esquema DB vs JSON<br>- Tests de integridad referencial |
| **turso** | 4, 6 | - Sincronización cloud de `music_catalog.db`<br>- Replicación read-replica para queries analytics<br>- Backup automático pre-deploy |
| **github** | 0, 3, 4, 6 | - `gh repo create` (Fase 0)<br>- Crear Issues automáticos para bugs E2E (Fase 5)<br>- PR automático con changelog (Fase 6)<br>- `gh auth status` verificación |
| **playwright** | 5 | - E2E: Navegación `/ → /track/:id`<br>- E2E: Audio play/pause, volume<br>- E2E: Modal letras open/close<br>- E2E: Responsive viewport tests (4 breakpoints)<br>- Screenshots visual regression |
| **dbhub** | *(No configurado en .mcp.json)* | Si se añade: Exploración visual DB, queries ad-hoc, export CSV |

**Orden de invocación por fase:**
- Fase 0: `sqlite` → `github` → `playwright`
- Fase 1: `sqlite` (schema + data)
- Fase 2: `sqlite` (read tracks para `/renderizar_epk`)
- Fase 4: `turso` (sync) → `github` (issues)
- Fase 5: `playwright` (E2E) → `sqlite` (verify)
- Fase 6: `github` (push) → `turso` (final sync)

---

## 4. USO DE SKILLS Y COMANDOS PERSONALIZADOS

### Skills - Cronograma de Activación

| Skill | Fases | Momento Exacto de Invocación |
|-------|-------|-------------------------------|
| **auditar-mcp** | 0, 1, 4, 5, 6 | **Inicio de fase** (verificar salud MCP) + **Fin de fase** (confirmar integraciones) |
| **validar-null-safety** | 1, 2, 3, 5 | **Post-generación** de cada componente/archivo TSX<br>**Obligatorio** antes de commit en Fases 2, 3, 5 |
| **documentar-proyecto** | 0, 3, 5, 6 | **Fase 0:** README base + AI_LOG init<br>**Fase 3:** Docs componentes + arquitectura<br>**Fase 5:** Test results + a11y report<br>**Fase 6:** README final + AI_LOG completo |
| **git-workflow** | 0, 3, 6 | **Fase 0:** `git init` + `gh repo create` + primer commit<br>**Fase 3:** Commit "feat: layout principal"<br>**Fase 6:** Commit final + push + tag release |
| **switch-context** | 1→2, 2→3, 3→4, 4→5, 5→6 | **Entre cada fase** - Generar handoff para siguiente modelo asignado |

### Comandos Personalizados - Uso Específico

| Comando | Fases | Descripción de Uso |
|---------|-------|-------------------|
| **`/renderizar_epk`** | 2 | **Uso principal:** Generar `EPKCard` para cada track en `catalog.json`<br>Invocar: `/renderizar_epk trk-001`, `/renderizar_epk trk-002`<br>Output: Componente `.tsx` listo para importar |
| **`/auditar_fase`** | 1, 2, 3, 5 | **Al finalizar cada fase técnica:**<br>- Ejecuta `npx tsc --noEmit`<br>- Verifica null-safety en archivos nuevos<br>- Confirma MCP health<br>- Genera reporte en `AI_LOG.md` |
| **`/hacer_handoff`** | 1→6 | **Alias de `switch-context`:** Genera prompt de continuidad para siguiente modelo<br>Incluye: archivos modificados, MCP usados, siguiente modelo, restricciones TS |

---

## 5. REGLAS DE CALIDAD Y NULL-SAFETY

### 5.1 Tipado Estricto (TypeScript)
```typescript
// Config obligatoria en tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 5.2 Campos Críticos con Null-Safety (desde `catalog.json`)

| Campo | Tipo | Puede ser null | Estrategia de Manejo |
|-------|------|----------------|---------------------|
| `youtube_video_id` | `string \| null` | ✅ Sí (trk-002) | Renderizado condicional: `{track.youtube_video_id && <YouTubeEmbed />}` |
| `effects_chain` | `string \| null` | ✅ Sí (trk-002) | Helper `safeString(effects_chain, 'No especificado')` |
| `lyrics` | `string \| null` | ✅ Sí (trk-002) | Botón "Ver letra" deshabilitado si null + toast informativo |
| `metrics.top_countries` | `CountryStat[]` | ❌ No (array vacío) | `top_countries?.length ? map : <EmptyState />` |
| `production_details.guitars` | `string` | ⚠️ Posible | Validar en Zod schema: `.optional().default('No especificado')` |

### 5.3 Helpers Obligatorios (crear en `src/lib/null-safety.ts`)

```typescript
export const safeString = (val: string | null | undefined, fallback = '—'): string => 
  val?.trim() ? val : fallback;

export const hasValue = <T>(val: T | null | undefined): val is T => 
  val !== null && val !== undefined && val !== '';

export const safeNumber = (val: number | null | undefined, fallback = 0): number => 
  typeof val === 'number' && !isNaN(val) ? val : fallback;

export const renderIf = <T>(condition: boolean, content: React.ReactNode, fallback = null) =>
  condition ? content : fallback;
```

### 5.4 Reglas de Renderizado Seguro

1. **NUNCA** acceder a propiedad anidada sin optional chaining: `track.production_details?.effects_chain`
2. **SIEMPRE** usar `safeString()` para textos de producción (DAW, guitarras, efectos, afinación, tonalidad)
3. **SIEMPRE** validar arrays antes de `.map()`: `track.metrics?.top_countries?.map(...) ?? []`
4. **AUDIO/VIDEO:** Verificar URL existe antes de renderizar `<audio src={...}>` o `<iframe src={...}>`
5. **IMÁGENES:** `onError` handler obligatorio en `<img>` para fallback a placeholder

### 5.5 Criterios de Aceptación por Fase

| Fase | Criterio Null-Safety | Verificación |
|------|---------------------|--------------|
| 1 | Tipos generados reflejan nulabilidad real | `tsc --noEmit` = 0 errors |
| 2 | 100% componentes usan helpers | `validar-null-safety` skill PASS |
| 3 | Layout no colapsa con datos incompletos | Playwright: 4 viewports + datos edge-case |
| 5 | 0 `TypeError` en consola E2E | Playwright MCP test suite PASS |
| 6 | Build producción sin warnings | `npm run build` exit code 0 |

---

## 6. ARQUITECTURA TÉCNICA RESUMIDA

```
epk-dashboard-v2/
├── data/
│   ├── catalog.json          # Fuente de verdad (artist + tracks)
│   └── music_catalog.db      # SQLite (MCP sqlite)
├── src/
│   ├── types/                # FASE 1 - Types from JSON
│   ├── lib/
│   │   ├── null-safety.ts    # Helpers obligatorios
│   │   ├── repository.ts     # Data access (MCP sqlite)
│   │   └── validation.ts     # Zod schemas
│   ├── components/
│   │   ├── EPKCard.tsx       # FASE 2 - /renderizar_epk
│   │   ├── AudioPlayer.tsx
│   │   ├── ProductionDetails.tsx
│   │   ├── LyricsModal.tsx
│   │   ├── MetricsDashboard.tsx
│   │   ├── Header.tsx        # FASE 3
│   │   ├── TrackGrid.tsx
│   │   └── ui/               # Primitivas (Button, Card, Modal)
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── TrackDetail.tsx
│   │   └── Analytics.tsx
│   ├── hooks/
│   │   └── useTracks.ts
│   └── app/
│       ├── routes.tsx
│       └── providers.tsx
├── tests/
│   └── e2e/                  # FASE 5 - Playwright MCP
├── .mcp.json                 # Config MCP servers
├── .opencode/
│   ├── commands/
│   │   └── renderizar_epk.md
│   └── skills/               # 5 skills configuradas
├── AI_LOG.md                 # Bitácora IA (documentar-proyecto)
├── README.md                 # Docs proyecto
└── package.json              # Vite + React + TS + Tailwind
```

---

## 7. DECISIONES CONFIRMADAS POR USUARIO

| Decisión | Valor |
|----------|-------|
| **Despliegue objetivo** | Vercel |
| **OpenRouter API Key** | Disponible |
| **Turso** | Configurar (réplica cloud) |
| **Agente personalizado** | `EPKCardGenerator` para `/renderizar_epk` |
| **Stack** | React + TypeScript + Tailwind + Vite |
| **Package Manager** | pnpm (v11.24.0) |
| **GitHub CLI** | Autenticado (AngBan2x) |
| **Turso CLI** | Autenticado (angban2x) |
| **Playwright** | Chromium + deps sistema instalados |

---

## 8. PRÓXIMA ACCIÓN INMEDIATA

**Iniciar Fase 0 (Build Mode):**
1. `git init` + `gh repo create epk-dashboard --public --source=. --remote=origin`
2. `auditar-mcp` skill - verificar 4 servidores MCP
3. `pnpm create vite@latest . -- --template react-ts`
4. Instalar dependencias core + MCP + UI + testing
5. Crear agente `EPKCardGenerator` en `.opencode/agents/`
6. `turso db create epk-dashboard` + sync `music_catalog.db`
7. Primer commit + push
8. `documentar-proyecto` skill - README base + AI_LOG.md

---

*Documento generado por Arquitecto Principal (nemotron-3-ultra-free) - Ejecución autorizada.*