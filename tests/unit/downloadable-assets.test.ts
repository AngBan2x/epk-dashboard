import { describe, it, expect } from "vitest";
import { generateRiderHTML, generateDossierHTML } from "../../lib/downloadable-assets";

describe("downloadable-assets", () => {
  const testArtist = "Test Artist Name";
  const customData = {
    biography: "Biografia personalizada del artista para testing.",
    press_text: "Texto de prensa de ejemplo.",
    genre: "Rock Alternativo",
    location: "Valencia, Venezuela",
    influences: "Radiohead, Arctic Monkeys, The Strokes",
    contact_email: "contacto@test.com",
    booking_email: "booking@test.com",
    management: "Test Management",
    website: "https://test-artist.com",
    rider_pa_system: "Line Array L-Acoustics K2 - 20,000W RMS",
    rider_monitors: "6 mezclas in-ear Shure PSM1000",
    rider_console: "Yamaha CL5 - 64 canales",
    rider_subwoofers: "8 sub-graves L-Acoustics KS28",
    rider_guitar: "Fender Twin Reverb 85W",
    rider_bass: "Ampeg SVT-4PRO + SVT-810E",
    rider_drums: "DW Collector Series + hardware Configurado",
    rider_keyboards: "Nord Stage 4 88 + Sustain Pedal",
    rider_lighting: "LED wash + spots con DMX",
    rider_stage_size: "8m x 6m",
    rider_stage_conditions: "Escenario techado con piso de madera",
    rider_hospitality: "Catering completo: desayuno, almuerzo, cena",
    rider_transport: "Van + chofer desde hotel",
    rider_special_notes: "No se permite uso de pirotecnia cerca del escenario",
  };

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
      expect(html).toContain(`<title>Rider Tecnico - ${testArtist}</title>`);
    });

    it("contains artist name in header", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain(`Rider Tecnico &mdash; ${testArtist}`);
    });

    it("contains artist name in body", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain(`<strong>Artista:</strong> ${testArtist}`);
    });

    it("contains all required sections", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain("Equipo de Sonido");
      expect(html).toContain("Backline");
      expect(html).toContain("Escenario");
      expect(html).toContain("Hospitality");
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

    it("uses default values when no dossier data provided", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).toContain("Line Array - Minimo 15,000W RMS");
      expect(html).toContain("Digital - minimo 32 canales");
    });

    it("uses custom dossier data when provided", () => {
      const html = generateRiderHTML(testArtist, customData);
      expect(html).toContain("L-Acoustics K2 - 20,000W RMS");
      expect(html).toContain("Yamaha CL5 - 64 canales");
      expect(html).toContain("8m x 6m");
    });

    it("shows special notes when provided", () => {
      const html = generateRiderHTML(testArtist, customData);
      expect(html).toContain("Notas Especiales");
      expect(html).toContain("pirotecnia");
    });

    it("hides special notes section when empty", () => {
      const html = generateRiderHTML(testArtist);
      expect(html).not.toContain("Notas Especiales");
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
      expect(html).toContain("<title>PressPlay &mdash; Dossier de Prensa</title>");
    });

    it("contains artist name in header", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain(`${testArtist} &mdash; Dossier de Prensa`);
    });

    it("contains default biography when no data provided", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain(`${testArtist} es un artista multidisciplinario`);
    });

    it("contains custom biography when provided", () => {
      const html = generateDossierHTML(testArtist, customData);
      expect(html).toContain("Biografia personalizada del artista para testing.");
    });

    it("contains press text when provided", () => {
      const html = generateDossierHTML(testArtist, customData);
      expect(html).toContain("Texto de prensa de ejemplo.");
    });

    it("contains genre and location when provided", () => {
      const html = generateDossierHTML(testArtist, customData);
      expect(html).toContain("Rock Alternativo");
      expect(html).toContain("Valencia, Venezuela");
    });

    it("contains influences as tags when provided", () => {
      const html = generateDossierHTML(testArtist, customData);
      expect(html).toContain("Radiohead");
      expect(html).toContain("Arctic Monkeys");
    });

    it("contains contact info when provided", () => {
      const html = generateDossierHTML(testArtist, customData);
      expect(html).toContain("contacto@test.com");
      expect(html).toContain("Test Management");
      expect(html).toContain("https://test-artist.com");
    });

    it("uses default contact when no data provided", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain("booking@epk-dashboard.com");
      expect(html).toContain("PressPlay Records");
    });

    it("contains PressPlay branding", () => {
      const html = generateDossierHTML(testArtist);
      expect(html).toContain("PressPlay");
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
