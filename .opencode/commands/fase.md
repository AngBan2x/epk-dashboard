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
/fase C
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

## Delegación a Subagentes

El comando `/fase` usa el agente `fase-orchestrator` que a su vez delega:
- **Schema/DB** → `api-builder` (Nemotron 3 Ultra para casos complejos, MiMo V2.5 para rutinarios)
- **Endpoints REST** → `api-builder` (MiMo V2.5)
- **UI/Components** → `dashboard-builder` (Nemotron 3.5 Lightning / MiMo V2.5)
- **Auth** → `auth-builder` (Nemotron 3 Ultra)
- **Tests E2E** → `quality-auditor` (Gemma 4 31B)
- **Release** → `release-manager` (Nemotron 3.5 Lightning)

## Estrategia de Alternancia de Modelos

| Tipo de Tarea | Modelo | Agente |
|---------------|--------|--------|
| Schema/DB complejo | Nemotron 3 Ultra | api-builder, auth-builder |
| Endpoints REST rutinarios | MiMo V2.5 Free | api-builder |
| UI/Components interactivos | Nemotron 3.5 Lightning | dashboard-builder |
| Páginas simples / Paneles CRUD | MiMo V2.5 Free | dashboard-builder |
| Tests E2E / Auditoría | Gemma 4 31B | quality-auditor |
| Orquestación / Releases | Nemotron 3 Ultra / 3.5 Lightning | fase-orchestrator, release-manager |

## Skills Invocadas
- `run-quality-gates` → typecheck + unit + e2e
- `documentar-proyecto` → AI_LOG + README
- `crear-release` → git tag + gh release
- `handoff-automatico` → HANDOFF + AI_LOG
- `auditar-mcp` → verificación 4/4 servidores
