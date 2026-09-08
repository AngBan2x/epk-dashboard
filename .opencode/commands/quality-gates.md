---
name: quality-gates
description: Ejecutar verificación completa de calidad del proyecto
---

# Comando: /quality-gates

Ejecuta la suite completa de verificación de calidad.

## Uso
```
/quality-gates
```

## Flujo de Ejecución

1. **TypeScript**: `npx tsc --noEmit`
2. **Unit Tests**: `pnpm test:unit`
3. **Build**: `pnpm build`
4. **Reportar** resultados consolidados

## Formato de Salida
```
✅ TypeScript: 0 errores
✅ Tests: 41/41 passing
✅ Build: exitoso
```

## Si falla
- Identificar el error específico
- Proponer fix
- Re-ejecutar después del fix
