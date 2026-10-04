# HANDOFF — sesión del 2026-10-03

**Estado al cerrar esta sesión:** `main` en `a451b4d` + los 3 commits de este
handoff. **1146/1146 tests**, `tsc` limpio, lint sin avisos, `pnpm build`
correcto. Producción desplegada y verificada.

Este es **el** documento de arranque. Si solo vas a leer uno, lee este.

---

## 1. Arranque en 6 comandos

Copia-pega literal. **Node 24** (`v24.19.0`): el binario de `better-sqlite3`
está compilado para ABI 137 y el Node 22 ya no sirve.

```bash
node -v                                  # debe decir v24
pnpm dev                                 # servidor en :3000
npx tsc --noEmit                         # debe salir limpio
npx next lint                            # debe salir sin avisos
npx vitest run --no-file-parallelism     # 1146/1146, ~110 s
```

**`--no-file-parallelism` NO es opcional.** Sin él el reciclado de workers
dispara una aserción nativa de teardown de V8
(`node::RemoveEnvironmentCleanupHook`, `(env) != nullptr`) y el run muere con
`ERR_IPC_CHANNEL_CLOSED`. **No es un test rojo**: los 1146 pasan. Es un problema
de infraestructura de test, no de producto.

**No ejecutes `pnpm install` ni `pnpm rebuild`**: destruyen el binario y no hay
prebuild para Node 24.

Después de arrancar: `docs/PHASES.md` para el índice de fases.

---

## 2. Las 3 invariantes que se rompen en silencio

Estas cuestan un día cada una si alguien las toca sin saber qué son. Están
detalladas en `AGENTS.md`; aquí van por si solo llegaste a este fichero.

### 2.1 `vitest.config.ts:7-8` — los dos `delete`

```ts
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
```

**NO los borres.** Parecen higiene de test y no lo son. Bajo vitest el env está
ausente, así que `isTursoEnabled()` es falso y los **83 guards
`if (isTursoConfigured()) return;` nunca saltan**: están muertos. Si se restaura
el env, cualquier import mal resuelto pasa de latente a destructivo, y el fallo
sería **verde**. Si alguna vez hay que tocar ese fichero, verifica los conteos con
`scripts/turso-check.ts` antes y después.

### 2.2 Una sola fuente de verdad para decidir el backend

Ramificar sobre **`getTursoClientSync() !== null`**, nunca sobre
`isTursoConfigured()`. El primero lee `process.env` en tiempo de llamada; el
segundo captura un snapshot al importar el módulo. Con el env llegando tarde, el
primero decía "turso" y el segundo `null`, la ruta lanzaba y respondía **500**.

El handle local (`getLocalDb()` para leer, `getLocalDbWrite()` para escribir) se
abre **solo en el brazo sin cliente**, nunca antes.

### 2.3 `/track/[id]` es un shim de 301

Un single es fila de `tracks` **y** cabecera de release con el **mismo id**. Las
dos rutas eran la misma página con dos plantillas. Ya solo queda una.

**`"00:00"` es el relleno del seed, no un disco de cero segundos.**
`sumDurations` lo parsea bien y devuelve `{seconds: 0}`, así que **ningún
`isNaN` salta**: el filtro compara contra el relleno.

---

## 3. Los 10 puntos de trabajo abiertos

Ordenados por dependencia, no por número. **C1 y C2 son independientes de C3.**

### C1 · Revertir el diseño de la página de release ← urgente

**El usuario lo pidió (2026-10-03):** el diseño agreed era el anterior, no el
nuevo. El nuevo hace los demás datos inaccesibles.

**Revierte** a `git show cebc700~1`:
- `app/releases/[id]/page.tsx` (199 → 464 líneas ahora)
- `components/ReleaseTracklistSection.tsx`

**NO toques**, porque ahí viven arreglos que no tienen nada que ver con el diseño:
| Fichero | Qué vive ahí |
|---|---|
| `lib/releases.ts` | el 301 y las 4 salidas |
| `app/track/[id]/page.tsx` | el 301 por la otra puerta |
| `lib/release-page.ts` | el fix de duración del single |
| `app/sitemap.ts`, `NotificationBell.tsx` | hijas fuera de ambos |

**Trasplanta del diseño nuevo:** anillos de foco, `aria-label` con número y
título, botones de 44 px. Ya están hechos en `components/ReleaseTrackList.tsx`
(fichero aparte, no se revierte).

⚠️ **El diseño anterior tiene 4 secciones** (Descripción, Pistas, Enlaces, Letra)
y el nuevo **3**. Un revert de layout es donde se cuela una sección sin avisar:
pon un test que compruebe las 4.

### C2 · Consolidar el reproductor de las EPKCard

**Decisión tomada:** todo al patrón **`Reproducir • <fuente>`**. Los álbumes pasan
de `Escuchar N pistas` a `Reproducir • N pistas`.

Hoy conviven cuatro etiquetas: `Reproducir • YouTube`, `Reproducir • Preview
(30s)`, `Escuchar N pistas`, `Ninguna de sus pistas tiene audio disponible`. La
cuarta **se queda**: es información honesta, no una variante del botón.

Fichero: `components/EPKCard.tsx:463-502` (rama de padre) y la rama de single.

⚠️ `playQueue` recibe la cola completa y el contador del reproductor tiene que
seguir diciendo la verdad. `buildReleaseQueue` **se importa, no se copia**.

### C3 · Un solo botón en el formulario de edición

**Decisión tomada:** un botón principal cuya etiqueta depende del estado.
El secundario desaparece.

`borrador` → "Publicar" · `aprobado` → "Actualizar publicación" ·
`pendiente`/`rechazado` → "Enviar para revisión"

Hoy conviven en `app/releases/[id]/edit/page.tsx`:
- `:752` — "Enviar para revisión (retira del catálogo)" → `status: "pending"`
- `:56` — "Actualizar publicación" → guarda sin tocar el estado

Uno **guarda** y otro **despublica**, en el mismo formulario. Con un solo botón,
la etiqueta **es** la consecuencia.

### C4 · Recortar los estados de show

**Decisión tomada: 6 seleccionables + derivados por fecha.**

- **6 seleccionables:** `proximamente`, `confirmado`, `activo`, `pospuesto`,
  `cancelado`, `suspendido`
- **Derivados de la fecha, no elegibles:** `hoy`, `pasado`. Ya existe
  `computeDynamicStatus` en `lib/show-dynamic-status.ts:138`.
- **Se eliminan por redundantes:** `finalizado` (= pasado),
  `en_venta`/`disponible`/`activo` (lo mismo tres veces), `agotado` (inventario de
  entradas, no ciclo de vida), `reprogramado` (= pospuesto + nueva fecha).

Ficheros: `lib/show-status.ts` (tipo `:4-17`, `SHOW_STATUS_OPTIONS` `:78`),
`components/ShowForm.tsx:244-248`.

⚠️ **`ShowStatus` termina en `| string`** (`lib/show-status.ts:18`), lo que
**anula la validación por completo**: hoy cualquier string es un estado válido.
Hay que cerrar el tipo.

**Sin riesgo de datos:** en producción hay **1 show, en `proximamente`**. Los 12
que se quitan tienen cero registros.

### C5 · Fotos de perfil de los 5 artistas

Verificado en Turso: **0 fotos de perfil** en Björk, David Bowie, Kraftwerk,
Pink Floyd y Radiohead. Hay **3 banners** (Kraftwerk, Pink Floyd, Radiohead);
Björk y Bowie **no tienen ninguno**.

`scripts/apply-artist-images.ts` ya admite `profile` y `banner` por artista, pero
su allowlist curada solo cubre otros nombres. Hay que añadir 5 perfiles y buscar
2 banners.

**Regla que ya paying:** dry-run, revisión visual una a una, `--apply` solo
después. Bowie y Björk se quedaron fuera a propósito: su composición no funciona
en círculo ni en wide, y la inicial con degradado es mejor que un recorte malo.

### C6 · Cuenta suscriptor de prueba

Verificado en Turso: **0 cuentas suscriptor**. Hay 7 artistas y 1 admin.

Credenciales a `.env.local` con el mismo patrón que P7 (`scripts/lib/credentials.ts`),
y el registro público ya crea `subscriber` (P4 de la fase P original).

Sin esto **no se puede verificar**: suscripciones, notificaciones, preferencias
de email, ni el broadcast. Es lo que más superficie de bug deja sin cubrir.

### C7 · Reorganizar la documentación

`docs/AI_LOG.md`: **6.689 líneas, 379 KB, 111 epígrafes de nivel 2, 573 de nivel
3**. El bloque más largo son 432 líneas. Es ilegible por inspección humana.

Propuesta: `docs/ai-log/` con un fichero por época, y `AI_LOG.md` reducido a
índice. **Nada se borra**: es mover, no resumir.

`docs/` tiene 24 ficheros en la raíz con nombres heterogéneos. `docs/PHASES.md`
ya cubre las fases; falta un índice del resto.

**Va el último a propósito:** es el único ítem que no bloquea a otro, y es el que
peor se hace con el contexto lleno.

### C8 · Renumeración de fases ← ya hecho, no repetir

Las subfases de RC.33 se renumeraron a **P7–P10**. La numeración P1–P6 **ya
estaba ocupada**. Ver `docs/PHASES.md`. **No las renumeres otra vez.**

### C9 · Reescritura del historial ← a medias, y no es lo más urgente

Los pasos 1 a 3 **ya están hechos**: contraseñas rotadas en la app y
propagadas a `.env.local`, y los seeds leen del entorno (P7). Falta el paso 4.

> **Lo que queda en la historia es un valor MUERTO.** Las contraseñas ya no
> sirven para nada, así que la reescritura no es urgente por seguridad de
> acceso: es defensa en profundidad y, sobre todo, **PII** (el correo). El orden
> correcto es seguir con los 8 puntos de trabajo y hacer esto cuando haya sitio.

**Tres cosas que la sesión anterior descubrió probándolas, no suponiéndolas:**

**1. El repo tiene un path INVÁLIDO que rompe las dos herramientas.**
`Directrices del Proyecto Final.md:Zone.Identifier` — un **flujo de datos
alternativo de NTFS** (la marca que Windows pone a lo descargado de internet)
commiteado como fichero. En NTFS el `:` no es válido, y:
- `filter-repo` → `fatal: invalid path` dentro de **`fast-import`**, al leer el
  flujo, antes de que el filtro pueda verlo (por eso `--path --invert-paths` no
  sirve)
- `filter-branch` → `Could not initialize the index` (hace checkout)

Afecta a **16 de los 342 commits** (de los cuales solo **2 lo tocan**: el bootstrap
que lo añadió y `6952683` que lo borró); en HEAD no está. **Mientras siga ahí,
ninguna reescritura funciona en Windows.** Los scripts para quitarlo están en el
repo.

**2. El `OSError: [Errno 22]` de `filter-repo` NO es el blob, ni el tamaño, ni
los espacios.** Se descartó cada hipótesis con un probe:
- probe con el blob exacto de `pnpm-lock.yaml` (199 KB) → **pasa**
- probe con un repo de 78 MB → **pasa**
- clon en una ruta **sin espacios** → **falla igual**

Sin diagnóstico útil, se hizo con plumbing.

**3. Los TAGS son una puerta trasera.** Hay 61 en el momento de escribir esto
(`git tag | wc -l`), y cada uno apunta a un commit concreto. **Aunque limpies
`main`, un tag devuelve el historial viejo con la credencial.** Hay que
reescribirlos uno a uno.

> **Vuelve a mirar el número, no lo des por bueno.** Estas cifras se
> desfasaron solas dos veces en una tarde: al añadir commits, el conteo de
> commits y el de tags cambian. Los números de este documento son una foto del
> momento de escribirlo, y por eso los que importan llevan el comando al lado.

**El orden correcto:**

```bash
git clone --mirror . ../epk-respaldo.git          # backup PRIMERO
node scripts/git/rewrite-invalid-path.js          # quita el path inválido
node scripts/git/purge-history.js main            # purga la credencial
node scripts/git/purge-history.js refs/tags/v4.0.0-rc.33   # x58
git reflog expire --expire=now --all && git gc --prune=now --force
git push --force-with-lease origin main
git push --force origin 'refs/tags/*'
```

**La verificación buena NO es "los tests pasan".** Eso no distingue una
reescritura correcta de una que perdió medio repositorio. Es comprobar que **cada
commit viejo y su reescrito difieran SOLO en lo esperado**; el comando está
escrito en `docs/ROTACION_CREDENCIALES.md` §4.0.

Guía completa: `docs/ROTACION_CREDENCIALES.md`. Ya tiene el orden de los tags y
el aviso de no borrar los tags del remoto antes de subir los reescritos (las
releases se rompen).

### C10 · Un fallo propio que dejó el working tree sucio ← ya corregido

`git filter-branch` **falló a medias** y dejó el `working tree` del repo
principal con un `pnpm-lock.yaml` **viejo** (bajaba `@libsql/client` a ^0.14 y
eliminaba `bcryptjs` y `@vercel/blob`). No se detectó por `git status` hasta
después, y un `git commit -a` lo habría subido.

**La lección:** una herramienta de reescritura que falla **no es inocua** aunque
diga que no ha escrito nada. Después de usarla, `git checkout -- .` sobre los
ficheros que no deben haber cambiado, y comprobar las dependencias
críticas del lockfile. Está corregido en esta sesión.

---

## 4. Estado real de producción

Consultado por SQL directo (MCP de Turso), que es la fuente de verdad.

| Dato | Valor |
|---|---|
| tracks / artistas / shows | **83 / 12 / 2** |
| usuarios por rol | 7 artist · 1 admin · **0 subscriber** |
| vídeos con `video_kind` | **29 de 74** (14 "parecidos" retenidos) |
| canales oficiales | 5 |
| banners / fotos de perfil | 3 / **0** |
| portadas iTunes / Unsplash | 65 / 0 |
| huérfanas / datos de QA | 0 / 0 |
| `suggestions` | tabla creada, 0 filas |

**`npx tsx scripts/turso-check.ts`** es el script que verifica todo esto. Corre
como fuente de verdad, no las lecturas de API: la réplica va retrasada.

---

## 5. Los cinco fallos propios de esta sesión

Se escriben porque son el tipo de cosa que se repite si no queda constancia.

**1. Un commit salió verde con la mitad de la API sin publicar.** El commit de
P10 dejó `app/api/suggestions/[id]/route.ts` **sin trackear**, y con ella el
PATCH que el propio panel de admin necesita. Se cerró con un commit aparte y
explícito. **Un commit no se da por bueno porque los tests pasen**: hay que
mirar `git status` después.

**2. El test que protegía las credenciales las metía de vuelta en el repo.**
Usaba las cadenas reales como centinela. **El guard que protege del secreto lo
metía en el repo para poder comprobarlo.** Corregido, y después **mutado el
código para verificar que el test se pone rojo**: con un default colado salen 3
rojos.

**3. La consola de PowerShell muestra `?` por CJK y por U+FFFD.** Dos veces
"vi" ficheros rotos que estaban perfectamente, y casi los "arreglé".
Verificar **contra los codepoints**, no contra la consola:

```powershell
[regex]::Matches([System.IO.File]::ReadAllText($f), "[\u4E00-\u9FFF\uFFFD]")
```

Y ojo: `Select-String` con el patrón `[\u4E00-\u9FFF]` **no encuentra nada en
silencio**, porque `\uXXXX` no existe en el regex de PowerShell. Un patrón de
búsqueda que no busca es peor que uno que falla.

**4. Una herramienta que falla no es inocua.** `git filter-branch` falló con
`Could not initialize the index` y **dejó el working tree a medias**, con un
`pnpm-lock.yaml` viejo que bajaba dependencias. No lo detectó `git status` hasta
después, y un `git commit -a` lo habría subido. **Detalle en C10.**

**5. Descarta hipotesis con probes, no con suposiciones.** Se perdio casi una hora
creyendo que el fallo de ilter-repo era el blob, luego el tamano del repo,
luego los espacios en el path. **Las tres eran falsas**, y cada una se comprobó
con un repo mínimo que pasaba sin problema. Un probe que demuestra que algo **no**
es la causa vale tanto como uno que lo demuestra.

---

## 6. Convenciones que no se deducen del código

- **Stagear con rutas explícitas.** `git add app components lib` una vez se tragó
  `middleware.ts` en RC.31.
- **Ningún fichero en dos agentes a la vez.** Los commits los hace el orquestador.
- **Ninguna escritura en producción sin dry-run revisado**, y con la lista de
  descartes a la vista. Es lo que se aplicó con las fotos: se autorizaron 13 y se
  aplicaron 3.
- **Nada de secretos en logs, en errores ni en prompts.** PII tampoco: correos y
  mensajes de usuario no salen.
- **Conventional commits**: `feat:`, `fix:`, `docs:`.
- **Nunca quitar los TODO** de los documentos de fase.
- **Verificar que un test falla al revertir el arreglo.** Un check que siempre
  pasa no protege de nada, y RC.32–33 gastaron una release entera por eso.

---

## 7. Los otros handoffs

`docs/handoffs/` tiene 14 ficheros, escritos en momentos distintos del proyecto.
**Este los sustituye a efectos de arranque.** Los demás siguen siendo el registro
de lo que se decidió en su momento; no los borres.

Si necesitas el historial de una iteración concreta, está en `docs/AI_LOG.md` y
en los tags de Git (`v4.0.0-rc.33` es el estado de este handoff).
