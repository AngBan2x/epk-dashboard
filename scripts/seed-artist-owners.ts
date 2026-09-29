#!/usr/bin/env tsx
/**
 * D1 — Crea las cuentas de los artistas que no tienen dueño y las enlaza (P7/rc.29)
 *
 * Contexto: 6 de 7 artistas tienen `artists.user_id = NULL`, asi que sus
 * aprobaciones no les llegan y el perfil no aparece como reclamado. Este script
 * crea una cuenta `artist` por cada uno y la enlaza.
 *
 * Decisiones del usuario (2026-09-28):
 * - Emails en `@pressplay.app` (dominio propio, no de terceros).
 * - Contraseña aleatoria de 32 bytes que NO se documenta en ningun sitio. Las
 *   cuentas quedan "reclamadas" pero nadie puede entrar con ellas nunca.
 *
 * Idsempotente y conservador:
 * - Dry-run por defecto; `--apply` para escribir.
 * - NUNCA toca a un usuario que ya es dueño de otro artista, ni al admin.
 * - Si ya existe un usuario con el mismo nombre exacto o email, salta.
 * - Un solo artista por cuenta.
 *
 * Uso:
 *   npx tsx scripts/seed-artist-owners.ts           # dry-run
 *   npx tsx scripts/seed-artist-owners.ts --apply   # escribir
 *   npx tsx scripts/seed-artist-owners.ts --help
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import {
  createUser,
  getAllArtists,
  getAllUsers,
  isTursoEnabled,
  tursoExecUpdate,
} from "../lib/db";
import type { ArtistProfile, User } from "@/types/music";

const EMAIL_DOMAIN = "pressplay.app";
/** Nombres que el script jamas debe tocar, pase lo que pase. */
const PROTECTED_NAMES = new Set(["admin epk"]);
const PROTECTED_EMAILS = new Set(["admin@epk.local"]);

interface Plan {
  artist: ArtistProfile;
  slug: string;
  email: string;
  reason: string;
  blocked?: string;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildPlan(artists: ArtistProfile[], users: User[]): Plan[] {
  const existingNames = new Set(users.map((u) => u.name.trim().toLowerCase()));
  const existingEmails = new Set(users.map((u) => u.email.trim().toLowerCase()));

  const out: Plan[] = [];
  for (const artist of artists) {
    if (artist.user_id) continue;

    const name = artist.name.trim();
    const slug = slugify(name);
    const email = `${slug}@${EMAIL_DOMAIN}`;
    const plan: Plan = { artist, slug, email, reason: "" };

    if (!name) {
      plan.blocked = "artista sin nombre";
      out.push(plan);
      continue;
    }
    if (PROTECTED_NAMES.has(name.toLowerCase())) {
      plan.blocked = "nombre protegido";
      out.push(plan);
      continue;
    }
    if (existingEmails.has(email)) {
      plan.blocked = `ya existe la cuenta ${email}`;
      out.push(plan);
      continue;
    }
    if (existingNames.has(name.toLowerCase())) {
      plan.blocked = `ya existe un usuario llamado "${name}"`;
      out.push(plan);
      continue;
    }

    // si algun usuario ya es dueño de OTRO artista, no lo reutilizamos
    const ownerOfOther = users.find((u) => u.name.trim().toLowerCase() === name.toLowerCase());
    if (ownerOfOther) {
      plan.blocked = "colision de propietario";
      out.push(plan);
      continue;
    }

    plan.reason = "sin dueño y sin colisión: se crea cuenta y se enlaza";
    out.push(plan);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Crea cuentas para los artistas sin dueño y las enlaza (D1).

  npx tsx scripts/seed-artist-owners.ts           # dry-run (default)
  npx tsx scripts/seed-artist-owners.ts --apply   # escribir

 dry-run:      imprime el plan sin escribir nada
 Idempotente:  si la cuenta ya existe, la omite
 Protege:      admin y cualquier cuenta existente
 Emails:       <slug>@${EMAIL_DOMAIN}
 Contrasena:   aleatoria e irreproducible (nadie puede entrar con ellas)
`);
    process.exit(0);
  }

  console.log(`\n${apply ? "APLICANDO" : "DRY-RUN"} — D1: cuentas para artistas sin dueño\n`);

  const artists = await getAllArtists();
  const users = await getAllUsers();
  const orphans = artists.filter((a) => !a.user_id);

  console.log(`Artistas totales: ${artists.length}`);
  console.log(`Con dueño:        ${artists.length - orphans.length}`);
  console.log(`Sin dueño:        ${orphans.length}`);
  console.log(`Usuarios:         ${users.length}\n`);

  if (orphans.length === 0) {
    console.log("No hay artistas sin dueño.");
    return;
  }

  const plan = buildPlan(artists, users);
  const actionable = plan.filter((p) => !p.blocked);
  const blocked = plan.filter((p) => p.blocked);

  console.log("─".repeat(96));
  console.log(`${"ARTISTA".padEnd(24)}${"EMAIL".padEnd(34)}ACCION`);
  console.log("─".repeat(96));
  for (const p of plan) {
    const accion = p.blocked ? `OMITIDO — ${p.blocked}` : "crear cuenta + enlazar";
    console.log(`${p.artist.name.slice(0, 23).padEnd(24)}${p.email.padEnd(34)}${accion}`);
  }
  console.log("─".repeat(96));
  console.log(`\nResumen: ${actionable.length} a crear/enlazar, ${blocked.length} omitidos`);

  if (!apply) {
    console.log("\nDry-run. No se escribió nada. Usa --apply para aplicar.");
    return;
  }

  if (actionable.length === 0) {
    console.log("\nNada que aplicar.");
    return;
  }

  console.log("\nAplicando...\n");
  let created = 0;
  let linked = 0;

  for (const p of actionable) {
    const userId = `usr-${randomUUID().slice(0, 8)}`;
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    const name = p.artist.name.trim();

    try {
      // createUser se encarga del esquema (la tabla `users` NO tiene updated_at)
      await createUser({
        id: userId,
        name,
        email: p.email,
        password_hash: passwordHash,
        role: "artist",
        preferences: {
          email_notifications: true,
          push_notifications: true,
          new_release_alerts: true,
          show_alerts: true,
        } as User["preferences"],
        avatar: null,
        email_verified: false,
        deleted_at: null,
        last_login: null,
      });

      if (isTursoEnabled()) {
        await tursoExecUpdate("UPDATE artists SET user_id = ? WHERE id = ?", [userId, p.artist.id]);
      } else {
        const { getDbWrite } = await import("../lib/db");
        getDbWrite().prepare("UPDATE artists SET user_id = ? WHERE id = ?").run(userId, p.artist.id);
      }

      created++;
      linked++;
      console.log(`  OK ${name} -> ${p.email}`);
    } catch (err) {
      console.error(`  ERROR ${name}:`, (err as Error).message);
    }
  }

  console.log(`\nCompletado: ${created} cuentas creadas, ${linked} artistas enlazados.`);
  console.log("Las contraseñas no se han mostrado ni se guardan en ningun sitio.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
