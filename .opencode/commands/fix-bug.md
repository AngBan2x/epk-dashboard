---
name: fix-bug
description: Investigar y arreglar un bug reportado
---

# Comando: /fix-bug

Investiga y repara un bug reportado en el proyecto.

## Uso
```
/fix-bug <descripción del bug>
```

## Flujo de Ejecución

### Nivel 0: Agente Principal
1. Leer la descripción del bug
2. Usar `explore` agent para investigar archivos relacionados
3. Identificar root cause
4. Decidir: fix directo (1-5 líneas) o delegar a subagente
5. Ejecutar fix
6. Verificar: `npx tsc --noEmit` + `pnpm test:unit`
7. Documentar en `docs/AI_LOG.md`
8. Commit + push

### Delegación
- Si es fix de UI → `dashboard-builder` o `landing-page-builder`
- Si es fix de API → `api-builder`
- Si es fix de auth → `security-auditor`
- Si es fix de audio → `audio-player-builder`
- Si es fix de DB → `db-builder`
