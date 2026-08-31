# Plan de Implementación Fases Multimedia (F7 - F9) — EPK Dashboard v2

Este plan maestro define la arquitectura técnica, modelos de datos, componentes y quality gates para la ejecución de las Fases **F7**, **F8** y **F9** en `epk-dashboard-v2`, manteniendo una estrategia estricta de **Null-Safety** (`lib/null-safe.ts`) y optimización de rendimiento (Lighthouse > 90, first load JS < 250 KB).

---

## 1. Desglose de Fases de Desarrollo

| Fase | Nombre | Objetivo Principal | Entregables Clave |
|------|--------|-------------------|-------------------|
| **F7** | **Engine Multimedia, iTunes API & Assets** | Integración con iTunes Search API, Web Audio API y reproductor global persistente | `lib/itunes.ts`, `lib/web-audio.ts`, `context/AudioPlayerContext.tsx`, `components/GlobalAudioPlayer.tsx`, `components/AudioVisualizer.tsx`, `components/ImageGallery.tsx`, `components/DownloadCenter.tsx` |
| **F8** | **Pipeline Audiovisual & Multi-Track Stems** | Extensión de tipos de datos, reproductor de stems multicanal y showcase de video ultraligero | Actualización `types/music.ts` & `lib/validations.ts`, `components/StemsPlayer.tsx`, `components/VideoShowcase.tsx`, `components/VideoPlayerModal.tsx` |
| **F9** | **Pitch Deck Animado, Exportación & QA** | Experiencia inmersiva estilo Pitch Deck, exportador de ficha técnica (ZIP/JSON) y tests E2E | `components/EPKExporter.tsx`, `app/api/export/route.ts`, vistas con transiciones Framer Motion, suite E2E en Playwright |

---

## 2. Arquitectura Detallada por Fase

### Fase F7: Engine Multimedia, iTunes API & Assets
1. **Cliente iTunes Search API (`lib/itunes.ts`)**:
   - Conexión a `https://itunes.apple.com/search`.
   - Búsqueda por artista (`term`, `entity=musicArtist`) y canciones (`entity=song`).
   - Transformación de portadas estándar (`100x100bb.jpg`) a Ultra Alta Definición (`600x600bb.jpg` o `1200x1200bb.jpg`).
   - Extracción y normalización de `previewUrl` (M4A/AAC 30s preview) con fallback a audio local si falla la red o devuelve nulo.
   - Cache en memoria y manejo resiliente de errores HTTP sin bloquear el SSR.

2. **Motor Web Audio API (`lib/web-audio.ts`) & Visualizador (`components/AudioVisualizer.tsx`)**:
   - Abstracción de `AudioContext`, `AnalyserNode`, `MediaElementAudioSourceNode` y `GainNode`.
   - Manejo de restricciones de autoplay de navegadores (`ctx.resume()` en primer gesto de usuario).
   - Renderizado en `<canvas>` o `Framer Motion` con `requestAnimationFrame` para visualización de frecuencias en tiempo real (64/128 bandas).

3. **Reproductor Global Persistente (`components/GlobalAudioPlayer.tsx`)**:
   - `AudioPlayerContext` en `app/layout.tsx` para permitir que el audio continúe reproduciéndose mientras se navega entre `/dashboard` y `/track/[id]`.
   - Controles de Play/Pause, barra de progreso interactiva, control de volumen, metadata del track y botón para alternar el visualizador.

4. **Assets de Prensa & Galería (`components/ImageGallery.tsx`, `components/DownloadCenter.tsx`)**:
   - Galería responsiva en mosaico/lightbox con lazy loading (`next/image`), portadas HD obtenidas de iTunes y fotos de prensa.
   - Centro de descargas para fotos promocionales en alta resolución y ficha técnica.

---

### Fase F8: Pipeline Audiovisual & Multi-Track Stems
1. **Modelos de Datos y Validación**:
   - Ampliación de interfaces en `types/music.ts`:
     - `itunes_track_id?: string | null`
     - `stems_urls?: { drums?: string; bass?: string; guitars?: string; vocals?: string; other?: string } | null`
     - `video_embed_url?: string | null`
     - `gallery_images?: string[] | null`
   - Actualización de esquemas Zod en `lib/validations.ts` y parser en `lib/db.ts`.

2. **Showcase de Video Ultraligero (`components/VideoShowcase.tsx`)**:
   - Fachada ligera (facade pattern) para incrustar videos de YouTube/Vimeo sin descargar los scripts pesados del IFrame hasta que el usuario interactúe (manteniendo 0 impacto en First Contentful Paint).

3. **Reproductor de Stems Multicanal (`components/StemsPlayer.tsx`)**:
   - Sincronización precisa de hasta 4 pistas simultáneas (Voz, Guitarras, Bajo, Batería).
   - Nodos de ganancia independientes para `Solo` y `Mute` con medidores de nivel por pista.

---

### Fase F9: Pitch Deck Animado, Exportación & QA
1. **Exportación de Dossier (`app/api/export/route.ts`, `components/EPKExporter.tsx`)**:
   - Generación y descarga de la ficha técnica completa en formato JSON estructurado y HTML descargable para prensa.

2. **Modo Pitch Deck Interactivo**:
   - Vista cinemática (aspect ratio 21:9) con navegación por diapositivas y animaciones fluidas con `framer-motion`.

3. **Quality Gates & Tests Playwright**:
   - Tests E2E para búsqueda en iTunes API, reproducción global continua entre rutas y renderizado sin excepciones de null-safety.

---

## 3. Plan de Verificación

### Tests Automatizados
- **Typecheck**: `pnpm typecheck` (0 errores en modo estricto).
- **Unit Tests**: `pnpm test:unit` (validación de `lib/itunes.ts` y helpers null-safe).
- **E2E Tests**: `pnpm test:e2e` con Playwright para verificar reproducción y navegación.

### Quality Gates
- Cero accesos directos a propiedades nulas (respetando `lib/null-safe.ts`).
- Bundle first load JS < 250 KB.
