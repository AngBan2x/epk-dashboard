---
name: db-migration
description: Workflow para crear nuevas tablas SQLite, sincronizar con Turso, y actualizar types TypeScript.
---

# Skill: db-migration

Workflow para crear nuevas tablas SQLite, sincronizar con Turso, y actualizar types TypeScript.

## Cuando Usar
- Al agregar nuevas entidades (ej: tabla `artists`)
- Al modificar schema existente
- Al crear scripts de seed

## Instrucciones para el Agente:

### Paso 1: Definir Schema
```sql
-- Ejemplo: tabla artists
CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  biography TEXT,
  press_text TEXT,
  press_highlights TEXT,  -- JSON array
  genre TEXT,
  location TEXT,
  monthly_listeners INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Paso 2: Actualizar `lib/db.ts`
```typescript
// 1. Función de inicialización
function initArtistsTable() {
  const db = getDbWrite();
  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      biography TEXT,
      press_text TEXT,
      press_highlights TEXT,
      genre TEXT,
      location TEXT,
      monthly_listeners INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

// 2. Llamar en initDatabase()
export function initDatabase() {
  initUsersTable();
  initTracksTable();
  initArtistsTable();  // <-- NUEVO
  // ...
}

// 3. Funciones CRUD
export function getArtistByName(name: string): Artist | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM artists WHERE name = ?").get(name);
  return row ? row as Artist : null;
}

export function createArtist(data: CreateArtistInput): Artist {
  const db = getDbWrite();
  const id = `art-${Date.now()}`;
  db.prepare(`
    INSERT INTO artists (id, name, biography, press_text, press_highlights, genre, location)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.biography, data.pressText, JSON.stringify(data.pressHighlights), data.genre, data.location);
  return { id, ...data };
}
```

### Paso 3: Actualizar `types/music.ts`
```typescript
export interface Artist {
  id: string;
  name: string;
  biography: string | null;
  press_text: string | null;
  press_highlights: string[] | null;
  genre: string | null;
  location: string | null;
  monthly_listeners: number;
  created_at: string;
}

export interface CreateArtistInput {
  name: string;
  biography?: string;
  pressText?: string;
  pressHighlights?: string[];
  genre?: string;
  location?: string;
}
```

### Paso 4: Actualizar Turso Schema
```typescript
// lib/turso.ts
const ARTISTS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS artists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    biography TEXT,
    press_text TEXT,
    press_highlights TEXT,
    genre TEXT,
    location TEXT,
    monthly_listeners INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`;
```

### Paso 5: Crear Script Seed
```typescript
// scripts/seed-artists.ts
import { createArtist } from "../lib/db";

const artists = [
  {
    name: "Queen",
    biography: "Britannic rock legends...",
    pressText: "One of the most influential rock bands...",
    pressHighlights: ["Grammy Hall of Fame", "Rock & Roll Hall of Fame"],
    genre: "Rock",
    location: "London, UK"
  },
  // ...
];

artists.forEach(a => createArtist(a));
```

### Paso 6: Agregar a `package.json`
```json
{
  "scripts": {
    "db:seed:artists": "tsx scripts/seed-artists.ts"
  }
}
```

## Archivos de Referencia
- `lib/db.ts` — Todas las funciones DB
- `types/music.ts` — Interfaces
- `lib/turso.ts` — Schema Turso
- `scripts/sync-to-turso.ts` — Sync script
- `package.json` — Scripts de seed

## Output Esperado
```markdown
## Migration Report

### Tabla Creada
- `artists` con columnas: id, name, biography, press_text, ...

### Types Actualizados
- `Artist` interface en `types/music.ts`

### Functions Creadas
- `getArtistByName()` en `lib/db.ts`
- `createArtist()` en `lib/db.ts`

### Seed Script
- `scripts/seed-artists.ts` con 6 artistas
```
