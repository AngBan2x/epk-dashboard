#!/usr/bin/env tsx
/**
 * RC.37 — Comprobacion de credenciales sociales contra la API real.
 *
 * ## Solo LECTURAS
 *
 * Ninguna llamada de este script publica nada. Verifica que el token **sirve**,
 * no que pueda escribir: un token caducado y uno sin permiso de escritura se
 * parecen en un `GET`, y confundirlos cuesta un rato.
 *
 * Es la pieza que faltaba entre `social-check.ts` —que solo mira si las variables
 * existen— y una publicacion de verdad. `social-check.ts` sale con codigo 1
 * diciendo que algo falta; esto dice **si lo que hay funciona**.
 *
 * ## Por que existe el archivo
 *
 * Porque `scripts/social-check.ts` decia "eso lo comprueba social-smoke.ts" y
 * ese archivo no existia. Una referencia a algo inexistente es peor que no
 * tenerla: el que la lea la da por cierta.
 *
 * ## Por que NO imprime tokens
 *
 * Ni los tokens, ni sus longitudes, ni un hash. Solo nombres, y si cada
 * consulta fue o no correcta.
 *
 *   npx tsx scripts/social-smoke.ts
 */

import { config } from "dotenv";

// Este import carga `.env.local` por su cuenta; ver `scripts/lib/credentials.ts`.
config({ path: ".env.local" });

import {
  estaConfigurada,
  opcionesBluesky,
  opcionesFacebook,
  opcionesInstagram,
  opcionesLinkedin,
  opcionesMastodon,
  opcionesThreads,
} from "../lib/social/config";

type Resultado = { ok: boolean; detalle: string };

function leer(nombre: string): string {
  return (process.env[nombre] ?? "").trim();
}

/**
 * Una lectura minima por plataforma.
 *
 * El endpoint mas barato que **solo** demuestra que el token vale: pedir un
 * campo que existe y cuyo error distingue "no vale" de "no puede hacer esto".
 */
async function comprobarFacebook(): Promise<Resultado> {
  const op = opcionesFacebook(REAL_FETCH);
  if (!op.ok) return { ok: false, detalle: `faltan variables: ${op.faltan.join(", ")}` };

  const r = await REAL_FETCH(
    `https://graph.facebook.com/v26.0/${encodeURIComponent(op.valor.pageId)}` +
      `?fields=id,name,fan_count&access_token=${encodeURIComponent(op.valor.pageAccessToken)}`
  );
  const cuerpo = await leerJson(r);

  if (!r.ok) {
    const msg = (cuerpo as { error?: { message?: string } })?.error?.message ?? "";
    if (/\b190\b|expired/i.test(msg)) return { ok: false, detalle: "el token ha CADUCADO" };
    return { ok: false, detalle: `HTTP ${r.status}: ${msg.slice(0, 90)}` };
  }

  const p = cuerpo as { id?: string; name?: string; fan_count?: number };
  return {
    ok: true,
    detalle: `lee la Page "${String(p.name)}" (${String(p.id)}), ${String(p.fan_count ?? 0)} seguidores`,
  };
}

async function comprobarInstagram(): Promise<Resultado> {
  const op = opcionesInstagram(REAL_FETCH);
  if (!op.ok) return { ok: false, detalle: `faltan variables: ${op.faltan.join(", ")}` };

  const r = await REAL_FETCH(
    `https://graph.facebook.com/v26.0/${encodeURIComponent(op.valor.igUserId)}` +
      `?fields=id,username&access_token=${encodeURIComponent(op.valor.accessToken)}`
  );
  const cuerpo = await leerJson(r);

  if (!r.ok) {
    const msg = (cuerpo as { error?: { message?: string } })?.error?.message ?? "";
    if (/\b190\b|expired/i.test(msg)) return { ok: false, detalle: "el token ha CADUCADO" };
    return { ok: false, detalle: `HTTP ${r.status}: ${msg.slice(0, 90)}` };
  }

  const p = cuerpo as { id?: string; username?: string };
  return { ok: true, detalle: `@${String(p.username)} (${String(p.id)})` };
}

async function comprobarMastodon(): Promise<Resultado> {
  const op = opcionesMastodon(REAL_FETCH);
  if (!op.ok) return { ok: false, detalle: `faltan variables: ${op.faltan.join(", ")}` };

  const r = await REAL_FETCH(`${op.valor.instancia}/api/v1/accounts/verify_credentials`, {
    headers: { Authorization: `Bearer ${op.valor.accessToken}` },
  });
  const cuerpo = await leerJson(r);

  if (!r.ok) return { ok: false, detalle: `HTTP ${r.status}: el token no vale en ${op.valor.instancia}` };
  return { ok: true, detalle: `@${String((cuerpo as { username?: string }).username)}` };
}

async function comprobarBluesky(): Promise<Resultado> {
  const op = opcionesBluesky(REAL_FETCH);
  if (!op.ok) return { ok: false, detalle: `faltan variables: ${op.faltan.join(", ")}` };

  // `resolve` es publico: no necesita token, asi que **no** prueba nada. Se usa
  // `describe` con sesion propia, que si exige uno.
  const r = await REAL_FETCH(`${op.valor.pds}/xrpc/app.bsky.actor.getProfile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${op.valor.password}`,
    },
    body: JSON.stringify({ actor: op.valor.repo }),
  });
  const cuerpo = await leerJson(r);

  if (!r.ok) {
    const msg = (cuerpo as { error?: { message?: string } })?.error?.message ?? "";
    return { ok: false, detalle: `HTTP ${r.status}: ${msg.slice(0, 80)}` };
  }
  return { ok: true, detalle: `resuelve @${String((cuerpo as { handle?: string }).handle)}` };
}

async function comprobarThreads(): Promise<Resultado> {
  const op = opcionesThreads(REAL_FETCH);
  if (!op.ok) return { ok: false, detalle: `faltan variables: ${op.faltan.join(", ")}` };

  const r = await REAL_FETCH(
    `https://graph.threads.net/v1.0/${encodeURIComponent(op.valor.threadsUserId)}` +
      `?fields=id,username&access_token=${encodeURIComponent(op.valor.accessToken)}`
  );
  const cuerpo = await leerJson(r);
  if (!r.ok) return { ok: false, detalle: `HTTP ${r.status}: ${(cuerpo as { error?: { message?: string } })?.error?.message?.slice(0, 80)}` };
  return { ok: true, detalle: `@${String((cuerpo as { username?: string }).username)}` };
}

async function comprobarLinkedin(): Promise<Resultado> {
  const op = opcionesLinkedin(REAL_FETCH);
  if (!op.ok) return { ok: false, detalle: `faltan variables: ${op.faltan.join(", ")}` };

  const r = await REAL_FETCH("https://api.linkedin.com/v2/me", {
    headers: { Authorization: `Bearer ${op.valor.accessToken}` },
  });
  const cuerpo = await leerJson(r);
  if (!r.ok) return { ok: false, detalle: `HTTP ${r.status}: el token no vale` };
  return { ok: true, detalle: String((cuerpo as { id?: string }).id) };
}

async function leerJson(r: Response): Promise<unknown> {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

/** `fetch` real. Los adaptadores lo reciben inyectado; aqui es el de verdad. */
const REAL_FETCH = (globalThis.fetch ?? (() => {
  throw new Error("no hay fetch en este runtime");
})) as typeof fetch;

async function main(): Promise<void> {
  console.log("\nComprobacion de credenciales contra la API real (solo lecturas)\n");

  const comprobaciones: [string, () => Promise<Resultado>, boolean][] = [
    ["Facebook", comprobarFacebook, estaConfigurada("facebook")],
    ["Instagram", comprobarInstagram, estaConfigurada("instagram")],
    ["Mastodon", comprobarMastodon, estaConfigurada("mastodon")],
    ["Bluesky", comprobarBluesky, estaConfigurada("bluesky")],
    ["Threads", comprobarThreads, estaConfigurada("threads")],
    ["LinkedIn", comprobarLinkedin, estaConfigurada("linkedin")],
  ];

  let vivas = 0;
  let configuradas = 0;

  for (const [nombre, fn, configurada] of comprobaciones) {
    if (!configurada) {
      console.log(`  [SIN CONFIGURAR]  ${nombre}`);
      continue;
    }
    configuradas += 1;
    try {
      const res = await fn();
      if (res.ok) vivas += 1;
      console.log(`  [${res.ok ? "FUNCIONA" : "FALLA   "}]  ${nombre.padEnd(10)} ${res.detalle}`);
    } catch (e) {
      console.log(`  [ERROR    ]  ${nombre.padEnd(10)} ${e instanceof Error ? e.message.slice(0, 80) : e}`);
    }
  }

  console.log(`\n  ${vivas}/${configuradas} credenciales configuradas que ademas funcionan.`);
  console.log("  Ninguna llamada de este script publica nada.");
  if (vivas < configuradas) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});