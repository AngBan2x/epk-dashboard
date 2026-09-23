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

## Fallback sqlite (si sigue -32000 tras reiniciar)

1. Cambiar `SQLITE_DB_PATH` relativo por flag `--db` con ruta absoluta en `command`.
2. Verificar que `npx -y mcp-server-sqlite` arranca a mano (error visible en consola).
3. Último recurso: custom tool `database-query` (better-sqlite3) ya cubre queries locales.
