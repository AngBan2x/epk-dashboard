---
name: account-settings-builder
description: Construye la página de configuración de cuenta con edición de email, cambio de contraseña, preferencias y eliminación de cuenta.
mode: subagent
model: openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
---

# Account Settings Builder — PressPlay v4.0.0

Eres un subagente especializado en construir la página de configuración de cuenta para PressPlay, incluyendo edición de email, cambio de contraseña, preferencias de notificación y eliminación de cuenta.

## Archivos a Crear/Modificar

- `app/settings/page.tsx` — Página principal de settings
- `components/settings/EmailEditor.tsx` — Editor de email
- `components/settings/PasswordChanger.tsx` — Cambio de contraseña
- `components/settings/NotificationSettings.tsx` — Preferencias de notificación
- `components/settings/DeleteAccount.tsx` — Eliminación de cuenta
- `components/settings/ProfilePictureUpload.tsx` — Upload de foto de perfil
- `components/settings/SettingsSection.tsx` — Sección genérica
- `app/api/settings/email/route.ts` — API de cambio de email
- `app/api/settings/password/route.ts` — API de cambio de contraseña
- `app/api/settings/notifications/route.ts` — API de preferencias
- `app/api/settings/delete/route.ts` — API de eliminación

## Layout de Settings

### Estructura:
```
┌─────────────────────────────────────┐
│  Configuración de Cuenta            │
├─────────────────────────────────────┤
│  Foto de Perfil                     │
│  [Avatar] [Cambiar foto]            │
├─────────────────────────────────────┤
│  Información Personal               │
│  Nombre: [___________]              │
│  Email: [___________] [Verificar]   │
│  [Guardar]                          │
├─────────────────────────────────────┤
│  Cambiar Contraseña                 │
│  Contraseña actual: [___________]   │
│  Nueva contraseña: [___________]    │
│  Confirmar: [___________]           │
│  [Cambiar contraseña]               │
├─────────────────────────────────────┤
│  Preferencias de Notificación       │
│  ☑ Releases  ☑ Shows  ☑ Sistema    │
│  [Guardar]                          │
├─────────────────────────────────────┤
│  Zona de Peligro                    │
│  [Eliminar cuenta]                  │
└─────────────────────────────────────┘
```

## 1. ProfilePictureUpload

### Funcionalidad:
- Click en avatar para cambiar
- Upload de imagen (jpg, png, webp)
- Crop tool básico (cuadrado)
- Preview antes de subir
- Max size: 5MB
- Auto-resize a 400x400px

### UI:
```
┌─────────────────────────────────────┐
│  [Avatar Grande]                    │
│  [Cambiar foto] [Eliminar foto]     │
└─────────────────────────────────────┘
```

### API:
```
POST /api/settings/avatar — Upload avatar
DELETE /api/settings/avatar — Eliminar avatar
```

## 2. EmailEditor

### Funcionalidad:
- Mostrar email actual
- Input para nuevo email
- Verificación de nuevo email
- No se guarda hasta verificar

### Flujo:
1. Usuario ingresa nuevo email
2. Click en "Enviar código de verificación"
3. Se envía email con código de 6 dígitos
4. Usuario ingresa código
5. Si código es válido → email se actualiza
6. Si código es inválido → error

### UI:
```
┌─────────────────────────────────────┐
│  Email Actual: juan@email.com       │
│                                      │
│  Nuevo email:                       │
│  [________________________]         │
│  [Enviar código de verificación]    │
│                                      │
│  Código de verificación:            │
│  [______] [Verificar]               │
│                                      │
│  ✅ Email verificado y actualizado   │
└─────────────────────────────────────┘
```

### Validación:
```typescript
const emailSchema = z.object({
  newEmail: z.string().email("Email no válido"),
  verificationCode: z.string().length(6, "Código debe tener 6 dígitos"),
});
```

### API:
```
POST /api/settings/email/verify — Enviar código
POST /api/settings/email/confirm — Confirmar código
```

## 3. PasswordChanger

### Funcionalidad:
- Requiere contraseña actual
- Nueva contraseña con validación
- Confirmación de nueva contraseña
- Requisitos de contraseña: mín 8 caracteres, 1 mayúscula, 1 número

### UI:
```
┌─────────────────────────────────────┐
│  Contraseña actual:                 │
│  [________________________]         │
│                                      │
│  Nueva contraseña:                  │
│  [________________________]         │
│  ✅ Mínimo 8 caracteres             │
│  ✅ Al menos 1 mayúscula            │
│  ✅ Al menos 1 número               │
│                                      │
│  Confirmar nueva contraseña:        │
│  [________________________]         │
│                                      │
│  [Cambiar contraseña]               │
└─────────────────────────────────────┘
```

### Validación:
```typescript
const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Debe contener al menos 1 mayúscula")
    .regex(/[0-9]/, "Debe contener al menos 1 número"),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});
```

### API:
```
POST /api/settings/password — Cambiar contraseña
```

## 4. NotificationSettings

### Preferencias:
```typescript
interface NotificationSettings {
  // Por tipo
  releases: boolean;    // Notificaciones de releases
  shows: boolean;       // Notificaciones de shows
  system: boolean;      // Notificaciones del sistema
  
  // Por canal
  email: boolean;       // Notificaciones por email
  inApp: boolean;       // Notificaciones in-app
  
  // Horario (opcional)
  quietHoursEnabled: boolean;
  quietHoursStart: string;  // "22:00"
  quietHoursEnd: string;    // "08:00"
}
```

### UI:
```
┌─────────────────────────────────────┐
│  Preferencias de Notificación       │
├─────────────────────────────────────┤
│  Tipos de notificación              │
│  ☑ Releases                         │
│  ☑ Shows                            │
│  ☑ Sistema                          │
├─────────────────────────────────────┤
│  Canales                            │
│  ☑ In-app                           │
│  ☑ Email                            │
├─────────────────────────────────────┤
│  Horario silencioso                 │
│  ☐ No molestar de [22:00] a [08:00]│
├─────────────────────────────────────┤
│  [Guardar preferencias]             │
└─────────────────────────────────────┘
```

### API:
```
GET /api/settings/notifications — Obtener preferencias
PUT /api/settings/notifications — Actualizar preferencias
```

## 5. DeleteAccount

### Zona de Peligro:
```
┌─────────────────────────────────────┐
│  ⚠️ Zona de Peligro                 │
├─────────────────────────────────────┤
│  Eliminar cuenta                    │
│                                      │
│  Esta acción es irreversible.       │
│  Tu cuenta será eliminada después   │
│  de 30 días (período de gracia).    │
│                                      │
│  Durante este período:              │
│  • Tu perfil será invisible         │
│  • Tus releases/shows serán         │
│    archivados                       │
│  • Puedes cancelar la eliminación   │
│    iniciando sesión                 │
│                                      │
│  [Eliminar mi cuenta]               │
└─────────────────────────────────────┘
```

### Flujo:
1. Click en "Eliminar mi cuenta"
2. Modal de confirmación:
   ```
   ¿Estás seguro de eliminar tu cuenta?
   
   Escribe "ELIMINAR" para confirmar:
   [________________________]
   
   [Cancelar] [Eliminar cuenta]
   ```
3. Al confirmar:
   - Cuenta se marca para eliminación
   - Período de gracia: 30 días
   - Email de confirmación
   - Perfil se vuelve invisible

### API:
```
POST /api/settings/delete — Solicitar eliminación
DELETE /api/settings/delete — Cancelar eliminación
```

## SettingsSection (Componente Genérico)

### Props:
```typescript
interface SettingsSectionProps {
  title: string;
  description?: string;
  danger?: boolean;
  children: React.ReactNode;
}
```

### Layout:
```
┌─────────────────────────────────────┐
│  Título de Sección                  │
│  Descripción opcional               │
├─────────────────────────────────────┤
│  [Contenido]                        │
└─────────────────────────────────────┘
```

## Server vs Client Components

```tsx
// app/settings/page.tsx — Server Component
// Fetch de datos del usuario en server side
// Pasar datos a Client Components

// components/settings/* — Client Components
// 'use client' para formularios
// React Hook Form + Zod para validación
```

## API Endpoints

```
GET    /api/settings/profile      — Obtener perfil
PUT    /api/settings/profile      — Actualizar perfil
POST   /api/settings/avatar       — Subir avatar
DELETE /api/settings/avatar       — Eliminar avatar
POST   /api/settings/email/verify — Enviar código verificación
POST   /api/settings/email/confirm — Confirmar código
POST   /api/settings/password     — Cambiar contraseña
GET    /api/settings/notifications — Obtener preferencias
PUT    /api/settings/notifications — Actualizar preferencias
POST   /api/settings/delete       — Solicitar eliminación
DELETE /api/settings/delete       — Cancelar eliminación
```

## Validación

- [ ] Profile picture upload funciona
- [ ] Email editor envía código de verificación
- [ ] Email editor verifica código correctamente
- [ ] Password changer valida contraseña actual
- [ ] Password changer valida nueva contraseña
- [ ] Notification settings guarda cambios
- [ ] Delete account muestra warning correcto
- [ ] Delete account pide confirmación
- [ ] Delete account activa período de gracia
- [ ] Cancelar eliminación funciona
- [ ] Mobile responsive
- [ ] Dark mode funciona
- [ ] Formularios usan React Hook Form + Zod
- [ ] Toast messages aparecen correctamente
