---
name: auditar-mcp
description: Audita y verifica la conexión activa de los servidores MCP (sqlite, turso, dbhub, playwright, github).
---

# Skill: Auditoría de Servidores MCP

Ejecuta una verificación técnica de los servidores MCP configurados en `.mcp.json` antes de finalizar la fase actual:

1. **Servidor SQLite / DBHub / Turso:**
   - Ejecuta una consulta `SELECT` de prueba vía MCP sobre `music_catalog.db`.
   - Confirma la existencia y estructura de las tablas (`tracks`, `artist_info`).

2. **Servidor Playwright:**
   - Verifica la disponibilidad del navegador sin cabeza para pruebas E2E.

3. **Servidor GitHub:**
   - Comprueba el estado de la autenticación (`gh auth status`) y la sincronización con el repositorio remoto.

4. **Registro:**
   - Imprime en la consola el estado de respuesta de cada herramienta MCP probada y reporta cualquier fallo de integración.