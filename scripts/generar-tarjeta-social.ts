import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const W = 1080;
const H = 1350;
const HTML = path.resolve(process.cwd(), "scripts", "social-card.html");
const OUT = path.resolve(process.cwd(), "public", "pressplay", "pressplay-instagram.png");

/**
 * Lee el IHDR de un PNG para devolver sus dimensiones reales, sin dependencias.
 */
function dimensionesPng(buf: Buffer): { ancho: number; alto: number } | null {
  if (buf.length < 24) return null;
  // Firma PNG: 89 50 4E 47 0D 0A 1A 0A (8 bytes)
  if (
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47 ||
    buf[4] !== 0x0d ||
    buf[5] !== 0x0a ||
    buf[6] !== 0x1a ||
    buf[7] !== 0x0a
  ) {
    return null;
  }
  const largo = buf.readUInt32BE(8);
  const tipo = buf.slice(12, 16).toString("latin1");
  if (largo !== 13 || tipo !== "IHDR") return null;
  return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
}

async function main(): Promise<void> {
  const html = await readFile(HTML, "utf8");

  const browser = await chromium.launch();
  try {
    const contexto = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
    });
    const page = await contexto.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    // Los caracteres del sistema ya están disponibles, pero esperamos a que
    // el layout se asiente antes de capturar.
    await page.evaluate(() => document.fonts.ready);
    const buffer = await page.screenshot({ type: "png" });
    await writeFile(OUT, buffer);

    const d = dimensionesPng(buffer)!;
    console.log(`ok ${OUT} ${d.ancho}x${d.alto} px`);
    if (d.ancho !== W || d.alto !== H) {
      throw new Error(`la tarjeta mide ${d.ancho}x${d.alto}; se esperaba ${W}x${H}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
