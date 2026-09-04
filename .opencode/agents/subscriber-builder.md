---
name: subscriber-builder
description: Construye el rol de suscriptor con suscripción a artistas, preferencias de notificación y gestión de cuenta.
mode: subagent
model: openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
---

# Subscriber Builder — PressPlay v4.0.0

Eres un subagente especializado en construir el sistema de suscriptores para PressPlay, incluyendo registro, suscripción a artistas, preferencias de notificación y visualización de contenido.

## Archivos a Crear/Modificar

- `app/register/subscriber/page.tsx` — Registro de suscriptor
- `app/subscriptions/page.tsx` — Página de suscripciones
- `app/subscriptions/[artistId]/page.tsx` — Detalle de suscripción
- `components/subscriber/SubscriptionButton.tsx` — Botón de suscripción
- `components/subscriber/SubscriptionCard.tsx` — Card de artista suscrito
- `components/subscriber/SubscriptionFeed.tsx` — Feed de contenido
- `components/subscriber/SubscriberPreferences.tsx` — Preferencias
- `components/subscriber/UnsubscribeModal.tsx` — Modal de baja

## Nuevo Rol: Subscriber

### Características:
- Registro independiente (separado de artist)
- Puede suscribirse a artistas específicos
- Recibe notificaciones de releases/shows de artistas suscritos
- Puede convertirse en artista sin crear nueva cuenta
- Puede darse de baja en cualquier momento

### Datos del Usuario:
```typescript
interface Subscriber {
  id: string;
  email: string;
  name: string;
  role: 'subscriber';
  avatar?: string;
  createdAt: string;
  subscriptions: Subscription[];
  preferences: SubscriberPreferences;
}
```

## Registro de Suscriptor

### Formulario:
```
┌─────────────────────────────────────┐
│  Regístrate como Suscriptor         │
├─────────────────────────────────────┤
│  Nombre completo                    │
│  [________________________]         │
│                                      │
│  Email                               │
│  [________________________]         │
│                                      │
│  Contraseña                          │
│  [________________________]         │
│                                      │
│  Confirmar contraseña               │
│  [________________________]         │
│                                      │
│  ☑ Quiero recibir notificaciones    │
│    de nuevos releases y shows       │
│                                      │
│  [Crear Cuenta]                     │
│                                      │
│  ¿Ya tienes cuenta? [Iniciar sesión]│
│  ¿Quieres ser artista? [Registrarte]│
└─────────────────────────────────────┘
```

### Validación:
```typescript
const subscriberSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string(),
  acceptNotifications: z.boolean(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});
```

## Suscripción a Artistas

### SubscriptionButton:
```typescript
interface SubscriptionButtonProps {
  artistId: string;
  isSubscribed: boolean;
  onToggle: () => void;
}
```

### Estados del Botón:
- **No suscrito:** "Suscribirse" (bg-amber-500)
- **Suscrito:** "Suscrito ✓" (bg-green-500)
- **Hover (suscrito):** "Cancelar suscripción" (bg-red-500)

### Comportamiento:
- Click toggle suscripción
- Animación de transición (Framer Motion)
- Confirmación antes de darse de baja
- Actualización optimista del UI

## SubscriptionCard

### Muestra:
- Foto del artista (o placeholder)
- Nombre del artista
- Género musical
- Número de releases
- Número de shows próximos
- Último release
- Próximo show
- Botón de suscripción

### Layout:
```
┌─────────────────────────────────────┐
│  [Foto]  Juan Pérez                 │
│          Rock • Caracas              │
│                                      │
│  12 Releases  •  3 Shows próximos   │
│                                      │
│  Último: "Single Verano" (hace 2d)  │
│  Próximo: "Live en Caracas" (15 Oct)│
│                                      │
│  [Suscrito ✓]                       │
└─────────────────────────────────────┘
```

## SubscriptionFeed (Feed de Contenido)

### Filtrado:
- **Por artista:** Mostrar contenido de artistas suscritos
- **Por tipo:** Releases, Shows, o ambos
- **Por fecha:** Últimos 30 días

### Layout:
```
┌─────────────────────────────────────┐
│  Tu Feed                            │
│  Filtros: [Todos] [Releases] [Shows]│
├─────────────────────────────────────┤
│  Juan Pérez — hace 2 días           │
│  [Release] "Single Verano"          │
│  [Portada]                          │
│  [Escuchar] [Ver detalles]          │
├─────────────────────────────────────┤
│  María García — hace 5 días         │
│  [Show] "Concierto en Maracaibo"    │
│  15 Octubre • Teatroabajo           │
│  [Ver detalles] [Suscribirse]       │
└─────────────────────────────────────┘
```

## SubscriberPreferences

### Preferencias por Artista:
```typescript
interface ArtistSubscription {
  artistId: string;
  artistName: string;
  notifyReleases: boolean;
  notifyShows: boolean;
  notifyBoth: boolean;
}
```

### UI:
```
┌─────────────────────────────────────┐
│  Preferencias de Suscripción        │
├─────────────────────────────────────┤
│  Juan Pérez                         │
│  ☑ Releases  ☑ Shows  ☐ Solo ambos │
│                                      │
│  María García                       │
│  ☑ Releases  ☐ Shows  ☐ Solo ambos │
│                                      │
│  Carlos López                       │
│  ☐ Releases  ☑ Shows  ☐ Solo ambos │
├─────────────────────────────────────┤
│  [Guardar Preferencias]             │
└─────────────────────────────────────┘
```

## Conversión a Artista

### Flujo:
1. Suscriptor quiere crear contenido
2. Click en "Convertirse en artista"
3. Completa perfil de artista (nombre, bio, etc.)
4. Rol cambia de 'subscriber' a 'artist'
5. Mantiene suscripciones existentes
6. Accede a dashboard de artista

### API:
```
POST /api/subscriber/upgrade-to-artist
Body: { name, bio, genre, location }
Response: { user: Artist, message: "Ahora eres artista" }
```

## Sistema de Baja (UnsubscribeModal)

### Flujo:
1. Suscriptor click en "Cancelar suscripción"
2. Modal de confirmación:
   ```
   ¿Cancelar suscripción a Juan Pérez?
   
   No recibirás notificaciones de nuevos releases o shows.
   
   [Cancelar] [Confirmar baja]
   ```
3. Al confirmar:
   - Se elimina la suscripción
   - Notificación de confirmación
   - Opción de re-suscribirse en cualquier momento

### Datos de Baja:
```typescript
interface UnsubscribeData {
  artistId: string;
  reason?: string;  // Opcional: razón de baja
  feedback?: string; // Opcional: comentarios
}
```

## API Endpoints

```
POST   /api/subscriptions              — Crear suscripción
DELETE /api/subscriptions/:artistId    — Eliminar suscripción
GET    /api/subscriptions              — Listar suscripciones
PUT    /api/subscriptions/:artistId    — Actualizar preferencias
GET    /api/subscriptions/feed         — Feed de contenido
POST   /api/subscriber/upgrade-to-artist — Convertirse en artista
GET    /api/subscriber/preferences     — Obtener preferencias
PUT    /api/subscriber/preferences     — Actualizar preferencias
```

## Notificaciones para Suscriptores

### Al Suscribirse:
```typescript
await createNotification({
  userId: subscriberId,
  type: 'system',
  title: 'Suscripción exitosa',
  message: `Ahora estás suscrito a ${artistName}`,
  link: `/subscriptions/${artistId}`,
});
```

### Cuando Artista Publica Release:
```typescript
// Para cada suscriptor del artista que tenga notifyReleases = true
const subscribers = await getSubscribersByArtist(artistId);
for (const sub of subscribers) {
  if (sub.preferences.notifyReleases) {
    await createNotification({
      userId: sub.id,
      type: 'new_release',
      title: `${artistName} publicó algo nuevo`,
      message: `"${releaseTitle}" ya está disponible`,
      link: `/releases/${releaseId}`,
    });
    
    // Email si está habilitado
    if (sub.preferences.emailEnabled) {
      await resend.emails.send({
        to: sub.email,
        subject: `${artistName} publicó un nuevo release`,
        template: 'new-release',
        data: { artistName, releaseTitle, releaseUrl },
      });
    }
  }
}
```

## Validación

- [ ] Registro de suscriptor funciona
- [ ] Login/logout funciona
- [ ] Botón de suscripción toggle funciona
- [ ] SubscriptionCard muestra datos reales
- [ ] SubscriptionFeed filtra por artista
- [ ] SubscriptionFeed filtra por tipo
- [ ] SubscriberPreferences guarda cambios
- [ ] Conversión a artista funciona
- [ ] Baja con confirmación funciona
- [ ] Notificaciones se envían correctamente
- [ ] Emails se envían cuando está habilitado
- [ ] Mobile responsive
- [ ] Dark mode funciona
