---
name: release
description: Crear release con changelog automático
---

# Comando: /release

Crea una release en GitHub con changelog generado desde commits recientes.

## Uso
```
/release <versión>
```

Ejemplo:
```
/release v4.0.0-beta.1
```

## Flujo de Ejecución

1. Verificar que no hay cambios pendientes (`git status`)
2. Generar changelog desde commits recientes
3. Crear tag git
4. Push tag a origin
5. Crear release con `gh release create`
6. Documentar en `docs/AI_LOG.md`
