---
name: audit-security
description: Ejecutar auditoría de seguridad completa
---

# Comando: /audit-security

Ejecuta una auditoría de seguridad del proyecto.

## Uso
```
/audit-security
```

## Flujo de Ejecución

1. **Rutas protegidas**: Verificar middleware y auth en todas las rutas
2. **API endpoints**: Verificar autenticación en cada API route
3. **Roles**: Verificar que artist/admin/subscriber tienen permisos correctos
4. **Headers**: Verificar CSP, HSTS, X-Frame-Options
5. **Dependencias**: `pnpm audit` para vulnerabilidades conocidas
6. **Secrets**: Buscar API keys hardcoded en el código
7. **Reportar** hallazgos
8. **Proponer** fixes si es necesario
