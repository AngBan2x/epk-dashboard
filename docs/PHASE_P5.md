# FASE P5 — Polish + Demo + Release v4.0.0 (SPEC, pendiente tras P4)

**Estado:** PARCIAL (2026-09-30) — P5.1, P5.3, P5.4 y P5.5 completadas durante la tanda P5/P6; **P5.2 aplicado en producción** (2026-09-30, con nombres reales y sin sufijo `-seed`, ver `docs/PLAN_RC29_RC31.md` §4 D2); P5.6 sigue siendo prerelease (decisión del usuario).
**Subagentes:** carousel-builder, social-links-builder, show-form-builder, quality-auditor, release-manager, db-migrator/seed.

## P5.1 Carruseles infinitos — HECHO (alcance reducido por decision del usuario: solo catalogo del dashboard)
- Embla Carousel (nueva dep) para artistas y releases: responsive, navegación, auto-play opcional, click → página dedicada (`< nombre >` + dots según diseño usuario).
- Dónde: `/` (landing, sección catálogo), `/artists`, página dedicada lanzamientos.
- Criterio: scroll horizontal fluido desktop+móvil, sin layout shift, a11y (aria-roledescription, teclado).

## P5.2 Seed demo influyente — SCRIPT LISTO, NO APLICADO EN PROD
- Nuevo `scripts/seed-influential-catalog.ts` determinista: 2 artistas × 2 álbumes influyentes, 1 artista × 1 EP, 2 artistas × 2 singles con lados B (+`is_double_single`, `disc_number>1`, `release_id` hijos, `start_time/end_time`).
- Demuestra: multi-track, timestamps, capítulos, B-sides UI (cuando exista).
- Criterio: conteo exacto post-seed; sin duplicados al re-ejecutar.

## P5.3 Social links (16 plataformas) — HECHO
- `lib/social-platforms.ts` (16 SVG icons + validadores URL) + editor en `/profile` + display en `artists/[id]` (reemplaza URLs hardcodeadas del dashboard).
- Eliminar `BandcampIcon` muerta o integrarla.
- Criterio: guardar 16 links → se ven en página pública con iconos correctos.

### Los iconos tienen UNA fuente (2026-10-06)

Lo de arriba resuelve los links del **perfil del artista**. Lo que vino después es
otra cosa: los enlaces de **streaming de un lanzamiento**, que también son
plataformas y también tienen logo, y que nadie conectó con este fichero.

Tenían **tres** copias del mismo catálogo, y se habían separado:

| Copia | Dónde | Qué se había desviado |
|---|---|---|
| `lib/social-platforms.ts` | perfiles de artista | la buena |
| `buildReleaseLinks` en `app/releases/[id]/page.tsx` | botones de la ficha | 4 SVG inline, y **Bandcamp sin icono** (`icon: null`) |
| La barra lateral de `app/track/[id]/page.tsx` | enlaces del detalle | un **path de nota musical** donde debía ir el logo de Apple Music, y un `d` de Deezer que no era el de aquí |

El síntoma que llegó fue "hay SVGs rotos" y la lista concreta: Apple Music
monocromático, Tidal y Deezer. La causa real era esa: **tres versiones del mismo
logo en tres ficheros, y nada de eso se ve al compilar**.

Ahora `lib/release-links.ts` es la fuente común: sale el `href` (de
`external_links` primero y de la columna de la fila después), el color y la
clave de plataforma. Ninguna vista escribe un `d` por su cuenta. Y **Tidal**
tiene rama, que antes no la tenía en ninguna de las dos.

Dos cosas que costaron y que conviene no volver a hacer:

- **El color va en `style`, no en `className`.** Tailwind genera el CSS
  escaneando el fuente en busca de cadenas **literales**: un `bg-[${color}]`
  armado por interpolación no existe en la hoja de estilos y el botón sale sin
  fondo, sin error y sin aviso.
- **Los verbos ("Escuchar en X" / "Ver en YouTube") son copy de cada vista** y
  viven donde se usan. Lo común es el dato, no la frase.

`tests/unit/release-links.test.ts` ata las dos: comprueba que Tidal sale, que
Bandcamp trae color, y que ninguna de las dos páginas vuelve a llevar su copia
(los `d` concretos, no un `not.toMatch(/d="M/)` genérico que daría falso positivo
por los chevrons de anterior/siguiente).

## P5.4 Disclaimer pagos — VERIFICADO Y COMPLETADO
- Si P4.6 no lo incluyó: banner en `ShowForm` + texto en shows públicos.
- (Definido en P4.6 de PHASE_P4; se verifica aquí.)

## P5.5 Portada pro + header útil — PARCIAL (header útil: navegacion, link Artistas para logueados, menu de avatar accesible; la portada pro landing sigue pendiente)
- Portada: foto stock fondo, sin header, "PressPlay" grande centrado, slogan, texto informativo, CTA → dashboard + secciones extra (stats, testimonios/artistas destacados).
- Header: búsqueda (de P4.7), campana (de P4.3), menú avatar (Mi Perfil, Mi Cuenta, Cerrar sesión), links Shows + Artistas.
- Criterio: matriz visual light/dark/desktop/móvil sin regresiones.

### El botón "Iniciar Sesión" no se pinta en /login ni en /register (2026-10-06)

En `/login` el header pintaba "Iniciar Sesión" **y** debajo el propio formulario
con un botón "Iniciar Sesión". Dos controles para la misma acción en la misma
pantalla, y el usuario lo señaló como redundante.

Se oculta en las dos rutas de acceso, `/login` y `/register`, y solo en ellas: en
cualquier otra página pública el botón es la vía de entrada y se queda.

La regla de por qué **esas** dos y no más: el botón se dibuja cuando no hay
sesión, así que el problema no es "el header tiene un botón de login" sino que
**la página ya es el login**. Y `/register` tiene exactamente el mismo caso: su
CTA es "Crear cuenta" y el header ofrecía "Iniciar Sesión", que además lleva a
otro formulario.

Un detalle que no es estético: se decide por **ruta**, no por "si hay un
formulario en la página". La alternativa —buscar un `<form>` en el DOM— depende
de que el JS ya haya corrido, y en el primer pintado el header puede aparecer
antes, que es justo el momento en que el duplicado se nota.

## P5.6 Cuenta + QA + release — PARCIAL (QA visual completo hecho; el release sigue siendo prerelease v4.0.0-rc.27 por decision del usuario)
- `app/account`: prefs notificaciones reales + fix borrado (`deleted_at` bloquea login, gracia 30d o purga, password 8 unificado, `logout` con await, sin `getDbWrite` directo).
- QA visual completo + `gh release create v4.0.0` con changelog desde P4.

## Verificación
Igual que P4: gates + matriz + funcional + headed + screenshots + AI_LOG.
