import { describe, it, expect } from "vitest";
import { generateRiderHTML, generateDossierHTML } from "../../lib/downloadable-assets";

describe("downloadable-assets", () => {
  const testArtist = "Test Artist Name";

  describe("generateRiderHTML", () => {
    it("returns valid HTML structure", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<html lang="es">');
      expect(html).toContain("<head>");
      expect(html).toContain("<body>");
      expect(html).toContain("</html>");
    });

    it("contains correct title", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain(`<title>Rider Técnico - ${testArtist}</title>`);
    });

    it("contains artist name in header", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain(`Rider Técnico — ${testArtist}`);
    });

    it("contains artist name in body", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain(`<strong>Artista:</strong> ${testArtist}`);
    });

    it("contains all required sections", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain("Equipo de Sonido");
      expect(html).toContain("Backline");
      expect(html).toContain("Rider de Catering");
    });

    it("contains PressPlay footer", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain("Generado por PressPlay");
    });

    it("contains current year", () => {
      const html = generateRiderHTML(testArtist);
      const currentYear = new Date().getFullYear().toString();
      expect(html).toContain(currentYear);
    });

    it("contains meta charset UTF-8", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain('<meta charset="UTF-8"');
    });

    it("has print-friendly CSS", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain("@media print");
    });

    it("does not contain unresolved template variables", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).not.toMatch(/\$\{[a-zA-Z]+\}/);
    });
  });

  describe("generateDossierHTML", () => {
    it("returns valid HTML structure", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<html lang="es">');
      expect(html).toContain("<head>");
      expect(html).toContain("<body>");
      expect(html).toContain("</html>");
    });

    it("contains correct title", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain("<title>PressPlay — Dossier de Prensa</title>");
    });

    it("contains artist name in header", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain(`${testArtist} — Dossier de Prensa`);
    });

    it("contains artist name in body", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain(`${testArtist} es un artista multidisciplinario`);
    });

    it("contains PressPlay branding", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain("PressPlay");
    });

    it("contains all required sections", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain("Biografía");
      expect(html).toContain("Contacto");
    });

    it("contains contact email", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain("booking@epk-dashboard.com");
    });

    it("contains PressPlay Records management", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain("PressPlay Records");
    });

    it("contains PressPlay footer", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain("Generado por PressPlay");
    });

    it("contains current year", () => {
      const html = generateDossierHTML(testArtist);
      const currentYear = new Date().getFullYear().toString();
      expect(html).toContain(currentYear);
    });

    it("contains meta charset UTF-8", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain('<meta charset="UTF-8"');
    });

    it("has print-friendly CSS", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain("@media print");
    });

    it("does not contain unresolved template variables", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).not.toMatch(/\$\{[a-zA-Z]+\}/);
    });
  });
});
