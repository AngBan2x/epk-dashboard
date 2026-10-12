/**
 * El subagente `social-drafter` redacta. No publica. Eso se ata aquí.
 *
 * ## Por qué un test y no solo una instrucción
 *
 * `docs/ROTACION_CREDENCIALES.md` dice que el agente no debe tener credenciales
 * de publicación. Escrito así, en un `.md`, es un consejo: depende de que nadie
 * añada una herramienta al subagente un martes con prisa. Y el síntoma, si
 * ocurre, no es un fallo — es un post publicado desde la cuenta oficial, que no
 * tiene vuelta atrás sin alcance.
 *
 * Así que el permiso está en `opencode.json`, en `deny` explícito, y aquí se
 * comprueba. Para poder publicar necesitaría `bash`, `edit` o `write`: los tres
 * están denegados, y `task` también, porque un subagente que lanza a otro que sí
 * puede escribir es la misma puerta con dos hojas.
 *
 * ## Lo que este test NO comprueba
 *
 * Que el subagente se comporte bien. Eso no se puede testear, y fingir lo
 * contrario sería otro test tautológico de los que `puertas-que-fallan.test.ts`
 * se encarga de cazar. Aquí se comprueba la **frontera**: qué puede llegar a
 * tocar si el prompt se ignora.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const leer = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

interface AgentConfig {
  description?: string;
  mode?: string;
  model?: string;
  permission?: Record<string, unknown>;
}

const cfg = JSON.parse(leer("opencode.json")) as { agent?: Record<string, AgentConfig> };
const drafter = cfg.agent?.["social-drafter"];

describe("el subagente que redacta no puede publicar", () => {
  it("existe y es un subagente de verdad", () => {
    expect(drafter, "social-drafter no está en opencode.json").toBeDefined();
    expect(drafter!.mode).toBe("subagent");
  });

  it("no tiene bash, ni edit, ni write", () => {
    // Las tres vías por las que un agente podría ejecutar una llamada de
    // publicación: lanzar un comando, editar un fichero, escribir un fichero.
    const p = drafter!.permission!;
    expect(p["bash"], "bash no está denegado").toEqual({ "*": "deny" });
    expect(p["edit"], "edit no está denegado").toEqual({ "*": "deny" });
    expect(p["write"], "write no está denegado").toEqual({ "*": "deny" });
  });

  it("tampoco puede lanzar a otro que sí pueda", () => {
    // Sin esto, el deny se esquivaría por el mismo camino con dos hojas.
    expect(drafter!.permission!["task"]).toBe("deny");
  });

  it("no puede traer contenido de fuera", () => {
    // Podría meter en un borrador un texto de otra web, incluido algo que no
    // debería estar publicándose. Menos herramientas, menos superficie.
    expect(drafter!.permission!["webfetch"]).toBe("deny");
    expect(drafter!.permission!["websearch"]).toBe("deny");
  });

  it("la descripcion dice en mayusculas que no publica", () => {
    // El `description` es lo que se lee en el selector de agentes, antes de
    // cargar el prompt. Si ahí no dice "nunca publica", el que elige agente se
    // lleva la sorpresa después.
    expect(drafter!.description).toMatch(/NUNCA publica/);
  });
});

describe("el .md del subagente dice lo mismo", () => {
  const MD = ".opencode/agents/social-drafter.md";

  it("existe y tiene frontmatter de subagente", () => {
    expect(existsSync(path.resolve(process.cwd(), MD))).toBe(true);
    const md = leer(MD);
    expect(md).toMatch(/^---\n[\s\S]*?mode: subagent/);
  });

  it("declara el no-publicar antes de cualquier otra instruccion", () => {
    // La regla tiene que estar arriba, no al final. Un agente que se lee el
    // final ya ha hecho el trabajo.
    const md = leer(MD);
    const iRegla = md.search(/No publicas/);
    const iPrimerTrabajo = md.search(/## Qué haces/);
    expect(iRegla).toBeGreaterThan(-1);
    expect(iRegla).toBeLessThan(iPrimerTrabajo);
  });

  it("lleva los limites verificados con su fecha", () => {
    // Los límites caducan. Sin fecha, dentro de un año son un cuadro sin
    // origen, y se corrigen con la memoria de alguien.
    expect(leer(MD)).toMatch(/2026-10-11/);
  });

  it("avisa de los limites que no estan publicados", () => {
    // Instagram, Facebook y LinkedIn no dicen su límite de caracteres en la API.
    // Un subagente que los rellene de memoria está inventando.
    expect(leer(MD)).toMatch(/no los rellenes de memoria|no publicados|sin verificar/);
  });

  it("no menciona la cola de aprobaciones como algo que enseñar", () => {
    // Se descartó a propósito. Decirle al subagente que la evite es la forma de
    // que no se "categorice" después.
    expect(leer(MD)).toMatch(/No menciones `\/admin\/approvals`/);
  });
});

describe("las capturas que puede proponer no llevan datos personales", () => {
  it("el generador solo autentica el dashboard", () => {
    // Una captura autenticada de una página pública sale con el nombre de una
    // persona real y su contador de notificaciones. Publicada, no se quita.
    const script = leer("scripts/capture-social.ts");
    const lineas = script.split("\n").filter((l) => l.trim().startsWith("{ nombre:"));
    expect(lineas.filter((l) => l.includes("necesitaSesion: true")).length).toBe(1);
  });
});