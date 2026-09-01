---
name: fase
description: Ejecuta una fase completa del plan maestro usando orchestrator con subagentes anidados
---

# Comando: /fase

Ejecuta una fase completa del MASTER_PLAN.md usando orchestrator Nemotron 3 Ultra con subagentes anidados.

## Uso
```
/fase <nombre_fase>
```

Ejemplos:
```
/fase A
/fase B
/fase M
/fase O
```

## Flujo de Ejecución

### Nivel 0: Agente Principal (Mimo V2.5)
1. Leer MASTER_PLAN.md → obtener tareas de la fase
2. Invocar orchestrator con las tareas
3. Recibir reporte del orchestrator
4. Ejecutar quality gates finales
5. Commit + release

### Nivel 1: Orchestrator (Nemotron 3 Ultra)
1. Recibir tareas del agente principal
2. Analizar dependencias entre tareas
3. Ejecutar tareas independientes en paralelo
4. Ejecutar tareas dependientes secuencialmente
5. Recopilar resultados
6. Reportar al agente principal

### Nivel 2: Subagentes Especializados
- `api-builder` → Endpoints REST
- `auth-builder` → Autenticación
- `dashboard-builder` → UI/Components
- `db-builder` → Schema DB
- `quality-auditor` → Tests E2E
- `visual-tester` → Screenshots/DOM
- `brand-fixer` → Branding
- `security-auditor` → Seguridad
- `release-manager` → Releases

## Ejemplo de Ejecución Paralela

```
Yo (Nivel 0):
  task(orchestrator, "Ejecuta Fase O: O1-O10")

Orchestrator (Nivel 1):
  // Ronda 1 - paralelo
  task(auth-builder, "O4: fix session cookie")
  task(api-builder, "O5: fix /api/tracks")
  task(dashboard-builder, "O6: eliminar mensaje")
  task(db-builder, "O7: deleteArtist + O10: limpiar")

  // Ronda 2 - depende de O7
  task(api-builder, "O8: DELETE /api/artists")
  task(dashboard-builder, "O9: botón eliminar")

  // Ronda 3 - quality gates
  bash("pnpm typecheck && pnpm test:unit")

  // Reportar al agente principal
  return { tareas, resultados, qualityGates }
```

## Subagentes y Modelos

| Agente | Modelo | Uso | Permission Task |
|--------|--------|-----|-----------------|
| `orchestrator` | Nemotron 3 Ultra | Coordinación | `allow` |
| `api-builder` | MiMo V2.5 | Endpoints REST | `allow` |
| `auth-builder` | Nemotron 3 Ultra | Auth | `allow` |
| `dashboard-builder` | Nemotron 3.5 Lightning | UI | `allow` |
| `db-builder` | Nemotron 3 Ultra | DB | `allow` |
| `quality-auditor` | Gemma 4 31B | Tests | `allow` |
| `visual-tester` | MiMo V2.5 | Visual QA | `allow` |
| `brand-fixer` | MiMo V2.5 | Branding | `allow` |
| `security-auditor` | Nemotron 3 Ultra | Security | `allow` |
| `release-manager` | Nemotron 3.5 Lightning | Releases | `allow` |

## Cómo Invocar el Orchestrator

### Desde el agente principal (yo)
```
task(orchestrator, "Ejecuta Fase O: tareas O1-O10")
```

### Desde otro subagente
```
task(orchestrator, "Coordinar corrección de bugs en auth y dashboard")
```

### Ejemplo real de uso
```
# Yo invoco al orchestrator
task(orchestrator, """
Ejecuta la Fase O del MASTER_PLAN.md:
- O4: Fix auto-login (auth-builder)
- O5: Fix /api/tracks (api-builder)
- O6: Eliminar mensaje pnpm seed (dashboard-builder)
- O7: Agregar deleteArtist (db-builder)
- O8: DELETE /api/artists endpoint (api-builder)
- O9: Botón eliminar en admin (dashboard-builder)
- O10: Limpiar artists de prueba (db-builder)

Usa paralelo cuando sea posible.
""")

# El orchestrator ejecuta y reporta
return { tareas: [...], resultados: [...], qualityGates: {...} }
```

## Skills Invocadas
- `run-quality-gates` → typecheck + unit + e2e
- `documentar-proyecto` → AI_LOG + README
- `crear-release` → git tag + gh release
- `handoff-automatico` → HANDOFF + AI_LOG
- `auditar-mcp` → verificación 4/4 servidores
- `qa-visual` → testing visual con Playwright
