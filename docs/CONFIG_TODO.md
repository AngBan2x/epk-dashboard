# CONFIG TODO — Pendiente (no ejecutar aún)

Decisión usuario (2026-09-23): A+B ejecutados, C queda aquí documentado.

## C8. Deduplicar agentes (opencode.json vs .opencode/agents/*.md)

- Estado: los mismos 29 agentes definidos en **ambos** sitios.
- Los `.md` **no traen `model`** (dependen del JSON); el JSON no trae `prompt`.
- Funciona por merge, pero hay que mantener description/permission en dos lugares.
- Opciones: (a) mover `model` a frontmatter MD y vaciar bloque `agent` del JSON; (b) lo contrario. La skill `customize-opencode` prefiere archivos para lo no-trivial → **(a)** es la dirección natural.

## C9. github MCP vs gh CLI (decisión tomada: gh CLI)

- `github` MCP deshabilitado en `opencode.json` (consume mucho contexto).
- GitHub se opera con `gh` CLI (auth keyring OK: AngBan2x).
- Si algún flujo futuro necesita tools MCP de GitHub, reactivar con token **solo en config global** (`mcp.github.environment`), nunca en el repo.

## C10. MCP deshabilitados en el panel

- sentry/memory/sequential-thinking/plur/novu/strac-dlp/ctxfile figuran como Disabled.
- Decidir: quitarlos del todo del `opencode.json` (panel limpio) o mantenerlos como referencia rápida.

## C11. visual-tester → modelo openrouter

- Usa `openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`.
- Verificar que hay API key de OpenRouter en el auth de opencode; si no, el subagente fallará al invocarse.

## Fallback sqlite — RESUELTO vía path B (2026-09-23)

**Diagnóstico con spawn real + handshake MCP:**
1. Spawn directo: `Error: Cannot find module 'ajv'` — caché npx corrupto (`ajv/` sin `package.json`), exit 1 → -32000.
2. Tras borrar caché corrupto: `npx -y mcp-server-sqlite` se atasca 4+ min en warnings EPERM de cleanup + descarga/compilación nativa de better-sqlite3. Servidor nunca arranca.
3. Conclusión: paquete irrecuperable vía npx en Windows → **sqlite MCP deshabilitado** (`enabled: false`, comando conservado para reintentar).
4. Queries locales vía custom tool `database-query` (better-sqlite3 del proyecto, probado OK).
5. Bonus: el paquete tiene bug `verbose: console.log` → corrompe stdout/stdio en la primera query. Otra razón para no usarlo.
