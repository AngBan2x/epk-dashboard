# scripts/danger/ — scripts que escriben en la base de datos

Todos los scripts de este directorio **escriben datos en Turso/SQLite** y, por tanto,
son potencialmente destructivos. Por eso:

- **Dry-run por defecto.** Ejecutar un script sin `--apply` solo muestra lo que
  haría, sin escribir nada.
- **`--apply` es obligatorio.** Es la única puerta de escritura. Un script de este
  directorio que se ejecute sin `--apply` no debe modificar ni una fila.

## Convención

Cada script de este directorio debe:

1. Leer `process.argv.includes("--apply")` al arrancar.
2. Si no está `--apply`, imprimir qué haría y salir con código 0 sin escribir.
3. Si está `--apply`, ejecutar las escrituras y reportar cuántas filas se tocaron.
4. Nunca escribir en Turso de producción sin que el operador haya revisado primero
   el dry-run.

## Scripts en este directorio

| Script | Qué hace |
|--------|----------|
| `seed-admin.ts` | Crea el usuario admin en `users` |
| `fix-turso-all.ts` | Arregla datos inconsistentes en Turso |
| `fix-turso-artists.ts` | Arregla filas de artistas en Turso |
| `fix-youtube-metadata.ts` | Corrige metadatos de YouTube en tracks |
| `generate-more-data.ts` | Genera datos adicionales de prueba |
| `sync-to-turso.ts` | Sincroniza datos a Turso |
| `sync-tracks-turso.ts` | Sincroniza tracks a Turso |
| `sync-users-turso.ts` | Sincroniza usuarios a Turso |
| `cleanup-turso-artists.ts` | Limpia artistas huérfanos en Turso |
| `fase2-functional.ts` | Pruebas funcionales de la fase 2 |

## Por qué no están en `scripts/` directamente

`scripts/` es para scripts de utilidad (consultas, verificaciones, migraciones de
schema) que son seguros de ejecutar. `scripts/danger/` es para scripts que
escriben en la base de datos y requieren confirmación explícita (`--apply`).

Esto aplica el principio de que **ninguna escritura en producción sin dry-run
revisado**, que es una de las invariantes del proyecto (P7, P21.5).
