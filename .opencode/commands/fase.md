---
name: fase
description: Ejecuta una fase completa del plan maestro: code → test → docs → commit → release
---

# Comando: /fase

Ejecuta una fase completa del MASTER_PLAN.md de forma autónoma.

## Uso
```
/fase <nombre_fase>
```

Ejemplos:
```
/fase A
/fase B
/fase M
```

## Flujo de Ejecución

1. **Leer MASTER_PLAN.md** → obtener tareas de la fase especificada
2. **Verificar precondiciones** → git status limpio, MCP servers activos
3. **Ejecutar tareas secuencialmente** → delegando a subagentes según modelo asignado
4. **Quality Gates** → `pnpm typecheck && pnpm test:unit && pnpm test:e2e`
5. **Documentación** → AI_LOG.md + HANDOFF + README.md
6. **Git** → commit convencional + push
7. **Release** → git tag + GitHub Release (stable/prerelease según tests)
8. **Reporte** → resumen de tareas, tests, release creado

## Delegación Directa a Subagentes

El comando `/fase` se ejecuta directamente desde el agente principal, invocando subagentes con `task`:

```
/fase M → yo leo MASTER_PLAN
        → task(api-builder, "M1: fix next.config.js")
        → task(db-builder, "M2: Turso schema")
        → task(api-builder, "M3: dual-mode db.ts")
        → pnpm typecheck && pnpm test:unit
        → git commit + release
```

### Subagentes Disponibles

| Agente | Modelo | Uso |
|--------|--------|-----|
| `api-builder` | `opencode/mimo-v2.5-free` | Endpoints REST, fixes rutinarios |
| `auth-builder` | `opencode/nemotron-3-ultra-free` | Sistema de autenticación |
| `dashboard-builder` | `opencode/nemotron-3.5-lightning-free` | UI/Components, páginas |
| `db-builder` | `opencode/nemotron-3-ultra-free` | Schema DB, migraciones |
| `quality-auditor` | `openrouter/gemma-4-31b` | Tests E2E, auditoría |
| `release-manager` | `opencode/nemotron-3.5-lightning-free` | Git tags, releases |
| `security-auditor` | `nvidia/nemotron-3-ultra-550b-a55b:free` | Seguridad, rutas |
| `brand-fixer` | `opencode/mimo-v2.5-free` | Logos, marcas |
| `visual-tester` | `opencode/mimo-v2.5-free` | Screenshots, DOM, a11y |

## Estrategia de Alternancia de Modelos

| Tipo de Tarea | Modelo | Agente |
|---------------|--------|--------|
| Schema/DB complejo | Nemotron 3 Ultra | `db-builder`, `auth-builder` |
| Endpoints REST rutinarios | MiMo V2.5 Free | `api-builder` |
| UI/Components interactivos | Nemotron 3.5 Lightning | `dashboard-builder` |
| Páginas simples / Paneles CRUD | MiMo V2.5 Free | `dashboard-builder` |
| Tests E2E / Auditoría | Gemma 4 31B | `quality-auditor` |
| Testing Visual | MiMo V2.5 Free | `visual-tester` |
| Releases | Nemotron 3.5 Lightning | `release-manager` |

## Skills Invocadas
- `run-quality-gates` → typecheck + unit + e2e
- `documentar-proyecto` → AI_LOG + README
- `crear-release` → git tag + gh release
- `handoff-automatico` → HANDOFF + AI_LOG
- `auditar-mcp` → verificación 4/4 servidores
- `qa-visual` → testing visual con Playwright
