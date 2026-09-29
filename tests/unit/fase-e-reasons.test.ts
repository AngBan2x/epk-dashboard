import { describe, it, expect } from "vitest";
import {
  classifyUpstreamStatus,
  httpStatusForReason,
  integrationFailure,
  integrationSuccess,
  reasonApiMessageEs,
  reasonMessageEs,
  reasonNoteEs,
  type IntegrationReason,
} from "@/lib/integration-reasons";

describe("Fase E — motivos discriminados de integración", () => {
  describe("classifyUpstreamStatus", () => {
    it("mapea 403 y 429 a cuota (clave sin permisos o cuota agotada)", () => {
      expect(classifyUpstreamStatus(403)).toBe("quota");
      expect(classifyUpstreamStatus(429)).toBe("quota");
    });

    it("mapea 404 a not_found", () => {
      expect(classifyUpstreamStatus(404)).toBe("not_found");
    });

    it("cualquier otro status es un fallo del proveedor, no 'sin datos'", () => {
      for (const status of [400, 401, 418, 500, 502, 503]) {
        expect(classifyUpstreamStatus(status)).toBe("upstream");
      }
    });
  });

  describe("httpStatusForReason", () => {
    it("no_key -> 503, quota -> 429, network/upstream -> 502", () => {
      expect(httpStatusForReason("no_key")).toBe(503);
      expect(httpStatusForReason("quota")).toBe(429);
      expect(httpStatusForReason("network")).toBe(502);
      expect(httpStatusForReason("upstream")).toBe(502);
    });

    it("not_found -> 200: 'sin datos' es una respuesta correcta, no un error", () => {
      expect(httpStatusForReason("not_found")).toBe(200);
    });
  });

  describe("mensajes en español", () => {
    const reasons: IntegrationReason[] = [
      "no_key",
      "not_found",
      "quota",
      "network",
      "upstream",
    ];

    it("cada motivo tiene mensaje largo, nota corta y mensaje de API distintos", () => {
      for (const reason of reasons) {
        const largo = reasonMessageEs(reason, "YouTube");
        const corto = reasonNoteEs(reason, "YouTube");
        const api = reasonApiMessageEs(reason, "YouTube");
        expect(largo.length).toBeGreaterThan(10);
        expect(corto.length).toBeGreaterThan(0);
        expect(api.length).toBeGreaterThan(0);
        // El nombre del servicio aparece en el tooltip y en el mensaje de API:
        // el usuario tiene que saber QUIÉN falló, no solo que algo falló. La
        // nota corta va bajo una celda que ya dice "Streams"/"Likes", así que
        // se dispense del nombre.
        expect(largo).toContain("YouTube");
        expect(api).toContain("YouTube");
      }
    });

    it("los cinco mensajes largos son distintos entre sí", () => {
      const largos = reasons.map((r) => reasonMessageEs(r, "Last.fm"));
      expect(new Set(largos).size).toBe(reasons.length);
    });

    it("el mensaje de cuota menciona la cuota y el de sin clave la configuración", () => {
      expect(reasonMessageEs("quota", "Last.fm")).toContain("cuota");
      expect(reasonMessageEs("no_key", "Last.fm")).toContain("configurado");
    });
  });

  describe("constructores discriminados", () => {
    it("integrationSuccess marca ok y envuelve el dato", () => {
      const res = integrationSuccess({ a: 1 });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data).toEqual({ a: 1 });
    });

    it("integrationFailure marca el motivo y no lleva dato", () => {
      const res = integrationFailure("quota");
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("quota");
    });
  });
});
