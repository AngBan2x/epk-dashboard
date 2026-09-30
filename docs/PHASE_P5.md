# PHASE P5 — Polish + Demo + Release v4.0.0 (SPEC, pendiente tras P4)

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

## P5.4 Disclaimer pagos — VERIFICADO Y COMPLETADO
- Si P4.6 no lo incluyó: banner en `ShowForm` + texto en shows públicos.
- (Definido en P4.6 de PHASE_P4; se verifica aquí.)

## P5.5 Portada pro + header útil — PARCIAL (header útil: navegacion, link Artistas para logueados, menu de avatar accesible; la portada pro landing sigue pendiente)
- Portada: foto stock fondo, sin header, "PressPlay" grande centrado, slogan, texto informativo, CTA → dashboard + secciones extra (stats, testimonios/artistas destacados).
- Header: búsqueda (de P4.7), campana (de P4.3), menú avatar (Mi Perfil, Mi Cuenta, Cerrar sesión), links Shows + Artistas.
- Criterio: matriz visual light/dark/desktop/móvil sin regresiones.

## P5.6 Cuenta + QA + release — PARCIAL (QA visual completo hecho; el release sigue siendo prerelease v4.0.0-rc.27 por decision del usuario)
- `app/account`: prefs notificaciones reales + fix borrado (`deleted_at` bloquea login, gracia 30d o purga, password 8 unificado, `logout` con await, sin `getDbWrite` directo).
- QA visual completo + `gh release create v4.0.0` con changelog desde P4.

## Verificación
Igual que P4: gates + matriz + funcional + headed + screenshots + AI_LOG.
