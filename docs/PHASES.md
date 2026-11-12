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

## Las subfases de RC.33 (P7–P13)

| Fase | Documento | Estado |
|---|---|---|
| P7 | [`PHASE_P7.md`](./PHASE_P7.md) — credenciales de test fuera del código | completada |
| P8 | [`PHASE_P8.md`](./PHASE_P8.md) — una página por release | completada; el diseño se revirtió en C1, se restauró en C1-bis y se **redisañó** en P8.1/P8.2 (2026-10-06/08): migas, hero con facts y sidebar sticky, verificado en producción |
| P9 | [`PHASE_P9.md`](./PHASE_P9.md) — pruebas de correo sin `eu.org` | completada |
| P10 | [`PHASE_P10.md`](./PHASE_P10.md) — buzón de sugerencias anónimo | completada |
| P11 | [`PHASE_P11.md`](./PHASE_P11.md) — admin: catálogo unificado, `release_type`/`external_links` editables | completada con deuda declarada; salió de `PHASE_P3.md` en P12 |
| P12 | [`PHASE_P12.md`](./PHASE_P12.md) - auditoría post-rc.35: las puertas que no fallan | **cerrada**: E2E 136/136 en producción (2026-10-11). Queda deuda declarada |
| P13 | [`PHASE_P13.md`](./PHASE_P13.md) - publicación en redes sociales | **hasta la frontera**: los 6 adaptadores escritos y probados, sin ninguna llamada real |
| P14 | dentro de `AGENTS.md` — publicar solo lo puede hacer un agente designado | vigente. **Ver "Numeración" más abajo** |
| P15 | — | **no es una fase**: era una fila de `PLAN_RC31.md` (ahora `RC.31-T15`) |
| P16 | [`PHASE_P16.md`](./PHASE_P16.md) — el portal de envíos `/submissions` | **pendiente de documentar**: la funcionalidad **ya está implementada** (`app/submissions/`, `app/api/submissions/`, `lib/artist-promotion.ts`) |

## Las fases abiertas (2026-11-12)

Nacen de una auditoría de seguridad, workflow y documentación sobre `main` en `e4342ca`. El plan
completo está en `.opencode/plans/P17-P25-pressplay.md`.

| Fase | Documento | Estado | Tema |
|------|-----------|--------|------|
| **P17** | [`PHASE_P17.md`](./PHASE_P17.md) | en curso | **El catálogo público es un catálogo público.** XSS en el JSON-LD, `/api/search` sin filtro de estado, `user_id` filtrado por la API |
| **P18** | — | pendiente | La sesión caduca, se suspende y se degrada |
| **P19** | — | pendiente | Cabeceras de seguridad y CSP |
| **P20** | — | pendiente | Nada se borra sin que alguien lo pida (soft delete + purga) |
| **P21** | — | pendiente | El pipeline: un gate, dos destinos, deploy por tags |
| **P22** | [`PHASE_P22.md`](./PHASE_P22.md) | en curso | **Los modelos que existen.** 4 subagentes apuntaban a un modelo retirado del catálogo |
| **P23** | — | pendiente | La calidad que se nota |
| **P24** | — | pendiente | La documentación que se puede leer |
| **P25** | — | pendiente | Cerrar la frontera social |

## Numeración: qué está ocupado y por qué

> **Por qué esta sección.** `docs/PLAN_FASE_P.md` se creó durante RC.33 con una numeración P1–P4
> **sin comprobar que la Fase P ya tenía P1–P6 con otro significado**. Dos "P4" distintos conviviendo
> es exactamente el tipo de colisión que hace que alguien lea el documento equivocado y tome una
> decisión sobre código que no es. Se corrigió entonces moviendo las nuevas a P7+.
>
> **La colisión ha vuelto a pasar, con P14**, y por eso la sección se queda en el índice y no en un
> documento de fase: un índice que se queda sin esto es un índice que se queda viejo.

| Identificador | Qué es | Dónde vive |
|---------------|--------|------------|
| P1–P2 | subfases de la Fase P original | dentro de `docs/AI_LOG.md` |
| P3–P6 | subfases de la Fase P original | `docs/PHASE_P3.md` … `PHASE_P6.md` |
| P7–P13 | subfases de RC.33 | `docs/PHASE_P7.md` … `PHASE_P13.md` |
| **P14** | **publicar solo lo puede hacer un agente designado** | dentro de `AGENTS.md` (§P14) |
| P15 | *no es una fase*: era la fila "9/9 padres con `duration = "00:00"`" del plan de RC.31 (severidad S1). **Renumerada a `RC.31-T15`** dentro de `PLAN_RC31.md` | `docs/PLAN_RC31.md` |
| P16 | el portal de envíos `/submissions` | `docs/PHASE_P16.md` (pendiente de escribir) |
| P17–P25 | las fases abiertas de 2026-11-12 | `docs/PHASE_P<n>.md` |

**La colisión concreta de P14:** `PLAN_RC31.md` usaba "P14" para "Paleta de `/admin/approvals`" y
"P15" para "duración `00:00`", con severidad S3 y S1. **Ninguna de las dos era una fase**: eran
filas de una ronda de trabajo con severidad, como "A" o "B". Y **P16** —el portal de envíos— sí
era una fase, pero quedó sin documento.

**Resolución, sin renumerar nada:** P14 se queda con el significado de `AGENTS.md` (la puerta de
publicación, que es la viva y tiene 4 subagentes que proteger y un guard de 14 tests). Las dos filas
de RC.31 dejan de ser fases y pasan a llamarse `RC.31-T14` y `RC.31-T15` dentro de su propio plan.
P16 se documenta como fase cerrada.

**Las siguientes fases empiezan en P17.**

## Los RC (numeración aparte)

Los RC **no** son fases P. Son iteraciones de estabilización:

| Documento | Contenido |
|---|---|
| [`PLAN_RC33.md`](./PLAN_RC33.md) | el contrato de las 14 peticiones del usuario + 4 problemas estructurales |
| [`PLAN_RC32.md`](./PLAN_RC32.md) | contrato de edición, audio, aprobaciones, catálogo real |
| [`PLAN_RC31.md`](./PLAN_RC31.md) | los 15 problemas + el flujo de promoción |
| [`PLAN_RC29_RC31.md`](./PLAN_RC29_RC31.md) | Blob, descargas de prensa, UI |
| *sin plan propio* | **rc.34** — F6: las 12 parejas de imagen del catálogo, más la reescritura de la suite E2E (`cdfbedb` … `152f232`) |
| *sin plan propio* | **rc.35** — consolidación del reproductor en `AudioPlayer` (`4592bd3`), borrado de `StemsPlayer`/`LyricsModal` |
| *sin plan propio* | **rc.36** — P12: las puertas que no fallan. Pendiente de los pasos 5 y 7 |

Los detalles históricos de cada iteración están en [`AI_LOG.md`](./AI_LOG.md)
(20 KB — es el índice; el texto troceado por época está en
[`ai-log/`](./ai-log/), C7).

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
