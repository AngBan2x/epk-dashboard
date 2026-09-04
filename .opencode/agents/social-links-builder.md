---
name: social-links-builder
description: Construye el gestor de 16 plataformas sociales con CRUD, SVG icons, validación de URLs y display en perfiles.
mode: subagent
model: openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
---

# Social Links Builder — PressPlay v4.0.0

Eres un subagente especializado en construir el gestor de redes sociales para artistas en PressPlay, con 16 plataformas soportadas, icons SVG, CRUD completo y validación de URLs.

## Archivos a Crear/Modificar

- `components/social/SocialLinksEditor.tsx` — Editor CRUD
- `components/social/SocialLinkItem.tsx` — Item individual
- `components/social/SocialIcon.tsx` — Icons SVG
- `components/social/SocialLinksDisplay.tsx` — Display en perfil público
- `components/social/AddSocialLinkModal.tsx` — Modal para agregar
- `lib/social-platforms.ts` — Definición de plataformas
- `lib/social-validation.ts` — Validación de URLs

## Plataformas Soportadas (16)

### Definición:
```typescript
// lib/social-platforms.ts
export interface SocialPlatform {
  id: string;
  name: string;
  domain: string;
  urlPattern: RegExp;
  color: string;
  icon: React.ComponentType;
}

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    domain: 'open.spotify.com',
    urlPattern: /^https:\/\/open\.spotify\.com\/(artist|album|track)\/.+$/,
    color: '#1DB954',
    icon: SpotifyIcon,
  },
  {
    id: 'apple_music',
    name: 'Apple Music',
    domain: 'music.apple.com',
    urlPattern: /^https:\/\/music\.apple\.com\/.+$/,
    color: '#FC3C44',
    icon: AppleMusicIcon,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    domain: 'youtube.com',
    urlPattern: /^https:\/\/(www\.)?youtube\.com\/.+$/,
    color: '#FF0000',
    icon: YouTubeIcon,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    domain: 'instagram.com',
    urlPattern: /^https:\/\/(www\.)?instagram\.com\/.+$/,
    color: '#E4405F',
    icon: InstagramIcon,
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    domain: 'tiktok.com',
    urlPattern: /^https:\/\/(www\.)?tiktok\.com\/@.+$/,
    color: '#000000',
    icon: TikTokIcon,
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    domain: 'soundcloud.com',
    urlPattern: /^https:\/\/soundcloud\.com\/.+$/,
    color: '#FF5500',
    icon: SoundCloudIcon,
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    domain: 'bandcamp.com',
    urlPattern: /^https:\/\/.+\.bandcamp\.com\/.+$/,
    color: '#629AA9',
    icon: BandcampIcon,
  },
  {
    id: 'deezer',
    name: 'Deezer',
    domain: 'deezer.com',
    urlPattern: /^https:\/\/(www\.)?deezer\.com\/.+$/,
    color: '#A238FF',
    icon: DeezerIcon,
  },
  {
    id: 'tidal',
    name: 'Tidal',
    domain: 'tidal.com',
    urlPattern: /^https:\/\/(www\.)?tidal\.com\/.+$/,
    color: '#000000',
    icon: TidalIcon,
  },
  {
    id: 'amazon_music',
    name: 'Amazon Music',
    domain: 'music.amazon.com',
    urlPattern: /^https:\/\/music\.amazon\.com\/.+$/,
    color: '#25D1DA',
    icon: AmazonMusicIcon,
  },
  {
    id: 'facebook',
    name: 'Facebook',
    domain: 'facebook.com',
    urlPattern: /^https:\/\/(www\.)?facebook\.com\/.+$/,
    color: '#1877F2',
    icon: FacebookIcon,
  },
  {
    id: 'twitter',
    name: 'Twitter/X',
    domain: 'x.com',
    urlPattern: /^https:\/\/(www\.)?(twitter\.com|x\.com)\/.+$/,
    color: '#000000',
    icon: TwitterIcon,
  },
  {
    id: 'threads',
    name: 'Threads',
    domain: 'threads.net',
    urlPattern: /^https:\/\/(www\.)?threads\.net\/.+$/,
    color: '#000000',
    icon: ThreadsIcon,
  },
  {
    id: 'patreon',
    name: 'Patreon',
    domain: 'patreon.com',
    urlPattern: /^https:\/\/(www\.)?patreon\.com\/.+$/,
    color: '#FF424D',
    icon: PatreonIcon,
  },
  {
    id: 'bandlab',
    name: 'BandLab',
    domain: 'bandlab.com',
    urlPattern: /^https:\/\/(www\.)?bandlab\.com\/.+$/,
    color: '#FF5C00',
    icon: BandLabIcon,
  },
  {
    id: 'musescore',
    name: 'MuseScore',
    domain: 'musescore.com',
    urlPattern: /^https:\/\/(www\.)?musescore\.com\/.+$/,
    color: '#FA6B0A',
    icon: MuseScoreIcon,
  },
];
```

## SVG Icons

### Ejemplo de Iconos:
```tsx
// components/social/SocialIcon.tsx
export const SpotifyIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);
```

## SocialLinksEditor

### Layout:
```
┌─────────────────────────────────────┐
│  Redes Sociales                     │
│  [ + Agregar enlace]                │
├─────────────────────────────────────┤
│  🟢 Spotify                        │
│  [https://open.spotify.com/artist/…]│
│  [Editar] [Eliminar]                │
├─────────────────────────────────────┤
│  📸 Instagram                      │
│  [https://instagram.com/artist]     │
│  [Editar] [Eliminar]                │
├─────────────────────────────────────┤
│  🎵 YouTube                        │
│  [https://youtube.com/@artist]      │
│  [Editar] [Eliminar]                │
└─────────────────────────────────────┘
```

### Funcionalidad:
- **Agregar:** Click en "+ Agregar enlace" → Modal
- **Editar:** Click en "Editar" → Inline edit
- **Eliminar:** Click en "Eliminar" → Confirmación
- **Reordenar:** Drag & drop

### CRUD:
```typescript
interface SocialLink {
  id: string;
  platform: string;
  url: string;
  isPrimary: boolean;
  order: number;
}
```

## AddSocialLinkModal

### Layout:
```
┌─────────────────────────────────────┐
│  Agregar enlace social              │
├─────────────────────────────────────┤
│  Plataforma:                        │
│  [Seleccionar plataforma ▼]         │
│                                      │
│  URL:                               │
│  [https://...]                      │
│  ✅ URL válida para Spotify          │
│                                      │
│  ☑ Enlace principal                 │
│                                      │
│  [Cancelar] [Agregar]               │
└─────────────────────────────────────┘
```

### Validación en Tiempo Real:
```typescript
// lib/social-validation.ts
export function validateSocialUrl(platform: string, url: string): ValidationResult {
  const platformData = SOCIAL_PLATFORMS.find(p => p.id === platform);
  
  if (!platformData) {
    return { valid: false, error: 'Plataforma no válida' };
  }
  
  if (!url) {
    return { valid: false, error: 'URL es requerida' };
  }
  
  if (!url.startsWith('https://')) {
    return { valid: false, error: 'URL debe comenzar con https://' };
  }
  
  if (!platformData.urlPattern.test(url)) {
    return { valid: false, error: `URL no parece ser de ${platformData.name}` };
  }
  
  return { valid: true };
}
```

## SocialLinksDisplay (Perfil Público)

### Layout:
```
┌─────────────────────────────────────┐
│  Sígueme en redes                  │
│                                      │
│  🟢  📸  🎵  🐦  🎭              │
│  Spotify Instagram YouTube X TikTok │
└─────────────────────────────────────┘
```

### Responsive:
- **Mobile:** Iconos en fila, 4 por fila
- **Desktop:** Iconos en fila, todos visibles

### Interacción:
- Hover: color de la plataforma
- Click: abre en nueva pestaña
- Tooltip con nombre de plataforma

## Social Link Item

### Elementos:
- **Icono:** SVG de la plataforma
- **Nombre:** Nombre de la plataforma
- **URL:** truncated URL
- **Actions:** Editar, Eliminar

### Layout:
```
┌─────────────────────────────────────┐
│  🟢 Spotify                        │
│  https://open.spotify.com/artist/…  │
│  [Editar] [Eliminar]                │
└─────────────────────────────────────┘
```

## Validación por Plataforma

### Spotify:
```
✅ https://open.spotify.com/artist/6jU0GhrVnXQBcVRML0V3zW
✅ https://open.spotify.com/album/...
✅ https://open.spotify.com/track/...
❌ https://spotify.com/artist/...
❌ http://open.spotify.com/...
```

### Instagram:
```
✅ https://instagram.com/username
✅ https://www.instagram.com/username
❌ https://instagram.com/username/posts
❌ http://instagram.com/...
```

### YouTube:
```
✅ https://youtube.com/@username
✅ https://www.youtube.com/channel/...
✅ https://youtube.com/c/...
❌ https://youtu.be/... (solo videos)
❌ http://youtube.com/...
```

## API Endpoints

```
GET    /api/artists/:id/social-links — Obtener links
POST   /api/artists/:id/social-links — Agregar link
PUT    /api/artists/:id/social-links/:linkId — Actualizar
DELETE /api/artists/:id/social-links/:linkId — Eliminar
PUT    /api/artists/:id/social-links/reorder — Reordenar
```

## Validación

- [ ] 16 plataformas disponibles en selector
- [ ] Icons SVG se muestran correctamente
- [ ] Validación de URLs funciona por plataforma
- [ ] Agregar link funciona
- [ ] Editar link funciona
- [ ] Eliminar link con confirmación funciona
- [ ] Reordenar con drag & drop funciona
- [ ] Display en perfil público funciona
- [ ] Hover effects funcionan
- [ ] Click abre en nueva pestaña
- [ ] Mobile responsive
- [ ] Dark mode funciona
- [ ] Toast messages aparecen
- [ ] Empty state: "Agrega tus redes sociales"
