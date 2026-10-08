# Fases del proyecto — índice

Este fichero es **un índice, no un plan**. No compite con los documentos de fase:
solo dice dónde está cada uno y qué estado tiene.

> **Por qué existe.** `docs/PLAN_FASE_P.md` se creó durante RC.33 con una
> numeración P1–P4 **sin comprobar que la Fase P ya tenía P1–P6 con otro
> significado**. Dos "P4" distintos conviviendo es exactamente el tipo de
> colisión que hace que alguien lea el documento equivocado y tome una decisión
> sobre código que no es. Ese fichero se retiró; su contenido vive ahora en
> `PHASE_P7.md` … `PHASE_P10.md`.

## La Fase P original (P1–P6)

| Fase | Documento | Estado |
|---|---|---|
| P1 | dentro de `docs/AI_LOG.md` (P1.1–P1.8: setup, subagentes) | completada |
| P2 | dentro de `docs/AI_LOG.md` (P2.1–P2.9: DB, landing, header) | completada |
| P3 | [`PHASE_P3.md`](./PHASE_P3.md) — retro-resumen: dashboard, releases, shows, perfil, aprobaciones | completada |
| P4 | [`PHASE_P4.md`](./PHASE_P4.md) — subscriptores, notificaciones, búsqueda, broadcast (P4.1–P4.8) | completada 2026-09-26 |
| P5 | [`PHASE_P5.md`](./PHASE_P5.md) — polish, carruseles, social links, demo | parcial |
| P6 | [`PHASE_P6.md`](./PHASE_P6.md) — fixes UI, roles, seguridad, a11y | planificada |

**Ninguno de estos seis documentos se modifica sin motivo.** Son el registro de
decisiones ya tomadas.

## Las subfases de RC.33 (P7–P10)

| Fase | Documento | Estado |
|---|---|---|
| P7 | [`PHASE_P7.md`](./PHASE_P7.md) — credenciales de test fuera del código | completada |
| P8 | [`PHASE_P8.md`](./PHASE_P8.md) — una página por release | completada; el diseño se revirtió en C1, se restauró en C1-bis y se **redisañó** en F3 (2026-10-08): migas, hero con facts y sidebar sticky, verificado en producción |
| P9 | [`PHASE_P9.md`](./PHASE_P9.md) — pruebas de correo sin `eu.org` | completada |
| P10 | [`PHASE_P10.md`](./PHASE_P10.md) — buzón de sugerencias anónimo | completada |

## Los RC (numeración aparte)

Los RC **no** son fases P. Son iteraciones de estabilización:

| Documento | Contenido |
|---|---|
| [`PLAN_RC33.md`](./PLAN_RC33.md) | el contrato de las 14 peticiones del usuario + 4 problemas estructurales |
| [`PLAN_RC32.md`](./PLAN_RC32.md) | contrato de edición, audio, aprobaciones, catálogo real |
| [`PLAN_RC31.md`](./PLAN_RC31.md) | los 15 problemas + el flujo de promoción |
| [`PLAN_RC29_RC31.md`](./PLAN_RC29_RC31.md) | Blob, descargas de prensa, UI |

Los detalles históricos de cada iteración están en [`AI_LOG.md`](./AI_LOG.md)
(379 KB — ver C7 del handoff para el plan de troceado).

## Documentos transversales

| Documento | Para qué |
|---|---|
| [`ROTACION_CREDENCIALES.md`](./ROTACION_CREDENCIALES.md) | los 5 pasos de rotación + reescritura de `main` + claves de 15 redes |
| [`HANDOFF_FASE_P.md`](./HANDOFF_FASE_P.md) | **arranque de la sesión actual**: 9 puntos de trabajo abiertos |
| [`SECURITY_AUDIT_P5_P6.md`](./SECURITY_AUDIT_P5_P6.md) | auditoría de seguridad de P5/P6 |
| [`RELEASE_NOTES.md`](./RELEASE_NOTES.md) | notas de versión |
| [`DIRECTRICES.md`](./DIRECTRICES.md) | directrices de trabajo |

Y en la raíz del repo, que es donde se mira primero:

- [`../AGENTS.md`](../AGENTS.md) — **comandos, invariantes y trampas**. Incluye
  la sección "Fase P — invariantes que no se pueden romper".
- [`../README.md`](../README.md) — instalación y mapa del proyecto.
