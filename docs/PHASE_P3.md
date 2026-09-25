# PHASE P3 — Retro-resumen (completada)

**Período:** 2026-09-04 → 2026-09-23 · **Releases:** v4.0.0-alpha.2 → v4.0.0-rc.26+

## Lo construido
- Dashboard artista (stats, quick actions, actividad, tracks, dossier/rider, bio, shows, Last.fm, export).
- CRUD releases (single/EP/album) + edit page + iTunes/YouTube autofill + multi-track + timestamps + capítulos.
- CRUD shows + estados (13 valores unificados en `lib/show-status.ts`) + pagos + flyer + invitados + notas.
- Perfil artista + imágenes (upload R2→Blob) + hero público + lightbox + galería prensa CRUD.
- Approval workflow (draft/pending/approved/rejected) + admin panel + approvals page.
- Cuenta (email/pass/delete), dossier sync→artists, fechas UTC deterministas, updates optimistas anti-lag.
- Testing: 110 unit + matriz prod 50/50 + funcionales + headed + screenshots (gitignored).

## Decisiones arquitectónicas
- `artists` = canónico bio/press (sync desde dossiers, nunca al revés).
- Fechas SSR con `timeZone: UTC` pineado (anti-hidratación #425).
- Updates optimistas + re-fetch respaldo (Turso replica lag severo).
- Custom tools > MCP para DB (`database-query`); `gh` CLI > github MCP; Blob > R2 (sin tarjeta).
- Screenshots y `.env.local` nunca al repo; `download-center-fixed` y binarios sueltos eliminados.

## Deudas conocidas (origen de P4/P5)
- Approval con doble sistema (tracks.status vs submissions) sin unificar.
- `ITunesSearch` invisible al inicio; ownership releases por nombre; `PUT` pierde `type`; POST siempre `draft`.
- `computeDynamicStatus` volátil; `ShowStatus | string` anula tipos; `BookingModule.ShowDate` muerto.
- `searchTracks`/`TrackFilters` muertos; sin search global ni sort.
- Social: solo 4 plataformas, sin UI de gestión.
- Suscriptor: solo tabla; register fuerza artist; prefs sin UI; borrado deja FKs; `deleted_at` no bloquea login.
- Notifs: sin bell/panel/polling; email solo manual; sin fan-out ni broadcast.
- Seed demo insuficiente (4 singles + 2 albums, 0 EP/B-sides).
- Sin carruseles; header sin search/bell/avatar; portada mejorable.
