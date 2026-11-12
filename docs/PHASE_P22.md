# FASE P22 — Los modelos que existen

**Período:** 2026-11-12 → 2026-11-12  **Estado:** en curso
**Rama:** main  **Issue:** #1  **Commits:** (se completa al cerrar)

> **Por qué esta fase existe.** El catálogo de modelos de opencode **cambió**, y el repo no se enteró:
> cuatro subagentes apuntaban a `opencode/muse-spark-1.3`, que **ya no existe** en el proveedor. No
> es que el modelo fuera malo: es que `opencode models` ya no lo lista, y un subagente apuntando a
> un id retirado no da ningún error que lo diga. El síntoma (respuestas raras, vacíos, errores que no
> se explican) no apunta a "tu modelo ya no existe", y por eso la avería se propaga en silencio.
>
> Esta fase no es "poner un modelo nuevo": es **medir** cuál sirve, **desde dónde**, y **dejar la
> fuente de verdad en un solo sitio** para que la próxima vez que el catálogo cambie, el que lo lea
> lo sepa.

## Qué se decidió

| Decisión | Valor | Por qué |
|----------|-------|---------|
| Modelo principal | `opencode/minimax-m3.1-flash-free` | 1M de contexto, el más probado (29 agentes), y funciona |
| `visual-tester` | `opencode/longcat-2.5-free` | el único que **necesita** ver imágenes; 1M ctx, 75 % de ventana |
| `release-manager`, `vercel-deployer`, `doc-writer` | `opencode/nemotron-3.5-super-vl-free` | 1M ctx, 87,5 % de ventana; no necesitan visión |

## Lo que se midió (no se supuso)

### Disponibilidad geográfica — el hallazgo que cambia el reparto

La doc oficial de OpenCode Zen (`opencode.ai/docs/zen`, leída el 2026-11-12) dice, textualmente:

- **Inkling 2 Small Free**: *"not available in the European Union, Iceland, Liechtenstein, Norway,
  Cuba, Iran, North Korea, Russia, Ukraine, **or Venezuela**."*
- **Beam Free**: *"not available in Angola, Belarus, Cambodia, China…, Cuba, …, Iran, Iraq, Laos,
  Libya, Nigeria, North Korea, Russia, Syria, Turkmenistan, Uzbekistan, **Venezuela**, or the
  Crimea, Donetsk, and Luhansk regions of Ukraine."*
- **LongCat 2.5 Free**: *"free on OpenCode for a limited time, **with a limit of 100 requests per
  day**… It's **hosted in China**."* (zero-retention: no entrenan con los prompts)

> **Los dos primeros salen en `opencode models` y fallan al invocarlos.** Listar no es poder usarlos.
> Por eso la regla nueva de AGENTS.md incluye la disponibilidad geográfica como criterio de
> primera clase, y no como nota al pie.

### Smoke tests reales (con la credencial del usuario, 2026-11-12)

Mismo prompt para los dos candidatos: leer un PNG con la tool `read`, describirlo, y responder una
pregunta de razonamiento con ground truth verificable.

| Modelo | ¿Respondió? | ¿Visión? | Razonamiento |
|--------|-------------|----------|--------------|
| `opencode/nemotron-3.5-super-vl-free` | ✅ | ✅ (vio la pantalla de login de PressPlay) | ✅ acertó `parseDuration("1:02:03") = 3723` y `("3:45") = 225` |
| `opencode/longcat-2.5-free` | ✅ | ✅ (vio la pantalla y detectó el "Iniciar Sesión" redundante en el header) | ✅ acertó las dos opciones de `metadata` en Next 14 |

**Colateral encontrado por el smoke test:** `tests/screenshots/admin_dashboard.png` **muestra la
pantalla de login**, no un dashboard de admin. Los dos subagentes lo detectaron por su cuenta. El
screenshot está obsoleto o mal guardado → P23.11.

### Ventana útil: el contexto no es la ventana

La salida máxima declarada se descuenta del presupuesto de entrada (`context − output`):

| Modelo | `limit.context` | `limit.output` | usable |
|--------|-----------------|----------------|--------|
| `minimax-m3.1-flash-free` | 1.000.000 | 512.000 | 50,0 % |
| `longcat-2.5-free` | 1.000.000 | 262.144 | 75,0 % |
| `nemotron-3.5-super-vl-free` | 1.000.000 | 131.072 | 87,5 % |

### OpenRouter es el plan B, no el A

- Los `:free` de OpenRouter exigen **créditos pagados** para subir el límite de requests:
  *"For free models, rate limits are determined by the credits that you have purchased."*
- El pago es *"credit cards, AliPay and **cryptocurrency payments in USDC**"* → **USDC es la vía
  realisticamente usable desde Venezuela** (las tarjetas locales suelen ser rechazadas en pagos
  internacionales).
- Cada proveedor free arrastra **sus** restricciones de región: los endpoints de NVIDIA y
  `thinkingmachines/inkling-2-small:free` arrastran las mismas que OpenCode declara.

## Checklist

| # | Tarea | Estado | Commit | Evidencia |
|---|-------|--------|--------|-----------|
| P22.1 | Smoke test de los candidatos antes de asignar | ✅ hecha | — | 2 smoke tests reales, ambos respondieron y leyeron un PNG |
| P22.2 | Asignar el modelo real de los 4 subagentes rotos | ✅ hecha | — | `opencode.json`: `visual-tester` → `longcat-2.5-free`; `release-manager`/`vercel-deployer`/`doc-writer` → `nemotron-3.5-super-vl-free`. Fallback documentado a Nemotron si LongCat agota el cupo |
| P22.3 | Los `.md` de los agentes no deben nombrar un modelo | ✅ hecha | — | `.opencode/agents/visual-tester.md`: la sección "Modelo" ahora describe **capacidades** y dice de dónde sale el id (`opencode.json`). Se añade la tabla de "si tu modelo no responde" con los dos diagnósticos distintos |
| P22.4 | Rehacer la tabla de modelos de AGENTS.md con las cifras medidas | ✅ hecha | — | Tabla de 3 modelos en uso + 11 en reserva con su estado en Venezuela + la regla de la ventana útil + el bloque de OpenRouter como plan B |
| P22.5 | Verificar el pago de OpenRouter por USDC | ⬜ pendiente | — | **Requiere a la persona**: topping up de la cuenta. No lo hace un agente |
| P22.6 | Eliminar las referencias a modelos muertos en AGENTS.md | ✅ hecha | — | `space-bunny-free`, `muse-spark-1.3` y `mimo-v2.6-flash-free` ya no aparecen como "modelo en uso". La columna "Modelo" de las 7 tablas de subagentes **se eliminó**: repetía el mismo valor en 27 filas y por eso se quedó obsoleta sin que nadie lo notara |
| P22.7 | Reglas A–F en AGENTS.md | ✅ hecha | — | La sección "Las fases tienen checklist viva (P17 en adelante)" |
| P22.8 | Actualizar la tabla de contexto del guard de compactación | ✅ hecha | — | `tests/unit/override-compaction.test.ts`: `longcat-2.5-free` añadido con **1.000.000** (el valor real de models.dev, no 1.048.576) y el de Nemotron corregido. El guard rechazaba el modelo nuevo por no estar en la tabla — que es exactamente lo que tiene que hacer |

## Lo que queda abierto

- **P22.5** es una acción de la persona, no del agente: topping up de OpenRouter por USDC.
- **El cupo de 100 req/día de LongCat** es el único punto frágil del reparto, y cae sobre
  `visual-tester`, que es el agente que más llama. Mitigación: fallback documentado a
  `nemotron-3.5-super-vl-free` (también ve imágenes). Si el margen real queda corto, se mueve
  `visual-tester` a Nemotron y LongCat queda para tareas cortas.
- **LongCat está alojado en China.** El provider sigue zero-retention (no entrena con los prompts),
  pero conviene tenerlo presente para el contenido del repo. Los adaptadores sociales nunca mandan
  secretos en un prompt (regla del repo), así que el riesgo es acotado.

## Lo que se hizo

_(se rellena con commit y salida literal de puerta a medida que avanza)_
