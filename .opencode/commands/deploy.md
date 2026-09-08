---
name: deploy
description: Deploy a Vercel
---

# Comando: /deploy

Ejecuta deploy del proyecto a Vercel.

## Uso
```
/deploy
```

## Flujo de Ejecución

1. Verificar que no hay errores de TypeScript
2. Ejecutar build local
3. Deploy a Vercel con `npx vercel --prod --yes`
4. Reportar URL del deploy
5. Documentar en `docs/AI_LOG.md`
