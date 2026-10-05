# `docs/` — índice

Este directorio tenía 27 ficheros en la raíz con nombres heterogéneos
(`PLAN_*`, `PHASE_*`, `FIXES_BATCH_*`, `SECURITY_AUDIT_*`, `P6_QA_REPORT.md`,
`ROTACION_CREDENCIALES.md`…), y no había forma de saber cuál leer primero. Este
fichero es esa tabla.

**Nada se movió.** C7 solo troceó `docs/AI_LOG.md` (que eran 7.248 líneas) y añadió
este índice.

## Empieza por aquí

| Si quieres… | Lee |
|---|---|
| Saber qué está hecho y qué no | [`PHASES.md`](PHASES.md) — índice de fases con estado |
| Saber qué reglas no se pueden romper | [`AGENTS.md`](../AGENTS.md) § Fase P, y [`DIRECTRICES.md`](DIRECTRICES.md) |
| Retomar el trabajo | [`HANDOFF_FASE_P.md`](HANDOFF_FASE_P.md) |
| Ver la historia completa | [`AI_LOG.md`](AI_LOG.md) — índice; el texto está en [`ai-log/`](ai-log/) |
| Rotar credenciales / reescribir la historia | [`ROTACION_CREDENCIALES.md`](ROTACION_CREDENCIALES.md) |

## Fases

| Fichero | Qué es |
|---|---|
| [`PHASES.md`](PHASES.md) | **Índice de fases.** Dice dónde está cada una y en qué estado |
| [`PHASE_P3.md`](PHASE_P3.md) … [`PHASE_P10.md`](PHASE_P10.md) | Las subfases de la fase P. La P8 es la del 301 de `/track` y los vídeos de las hijas |

> La numeración P1–P6 ya estaba ocupada por otros documentos, así que las nuevas
> empiezan en P7. No las renumeres.

## Planes

| Fichero | Qué es |
|---|---|
| [`PLAN_DIRECTOR_EPK_DASHBOARD.md`](PLAN_DIRECTOR_EPK_DASHBOARD.md) | El plan original del proyecto (2026-08-28) |
| [`PLAN_MULTIMEDIA_F7_F9.md`](PLAN_MULTIMEDIA_F7_F9.md) | Motor multimedia, iTunes y assets (F7–F9) |
| [`PLAN_RC29_RC31.md`](PLAN_RC29_RC31.md) · [`PLAN_RC31.md`](PLAN_RC31.md) · [`PLAN_RC32.md`](PLAN_RC32.md) · [`PLAN_RC33.md`](PLAN_RC33.md) | Un plan por cada tanda de releases candidate |

## Auditorías y lotes de fixes

| Fichero | Qué es |
|---|---|
| [`P6_QA_REPORT.md`](P6_QA_REPORT.md) | Informe de QA de la fase 6 |
| [`SECURITY_AUDIT_P5_P6.md`](SECURITY_AUDIT_P5_P6.md) | Auditoría de seguridad de P5–P6 |
| [`FIXES_BATCH_1.md`](FIXES_BATCH_1.md) … [`FIXES_BATCH_4.md`](FIXES_BATCH_4.md) | Los cuatro lotes de correcciones puntuales |
| [`CONFIG_TODO.md`](CONFIG_TODO.md) | Pendiente de configuración. **Decisión del usuario: no ejecutar sin leerlo** |

## Bitácora

| Ruta | Qué es |
|---|---|
| [`AI_LOG.md`](AI_LOG.md) | Índice de la bitácora (C7) |
| [`ai-log/`](ai-log/) | La bitácora por época: F0–F9, refactor y A–L, hotfixes, v4 alpha/beta, rc.10–rc.28, y de Tranches a hoy |
| [`handoffs/`](handoffs/) | 14 handoffs de fases anteriores (F0–F6, C–H, P3–P4, final) |

## Otros

| Fichero | Qué es |
|---|---|
| [`RELEASE_NOTES.md`](RELEASE_NOTES.md) | Notas de la v1.0.0 |
| [`modelos gratuitos disponibles.txt`](modelos%20gratuitos%20disponibles.txt) | Lista de modelos gratuitos. **Cambio tuyo, sin relación con el proyecto** |

## Lo que este índice no cubre

- **El código.** `AGENTS.md` tiene la estructura de `app/`, `lib/` y `components/`.
- **Los handoffs viejos.** Los de `docs/handoffs/` son de antes de la fase P y no
  se actualizan; para el estado actual, `HANDOFF_FASE_P.md`.