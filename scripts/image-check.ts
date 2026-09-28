import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  const failedImages: string[] = [];
  const optimized: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (res) => {
    if (res.request().resourceType() === "image") {
      const url = res.url();
      if (res.status() >= 400) failedImages.push(`${res.status()} ${url.slice(0, 90)}`);
      if (url.includes("/_next/image")) optimized.push(url.slice(0, 110));
    }
  });

  for (const route of ["/dashboard", "/artists", "/shows"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
    const broken = await page.evaluate(
      () => document.querySelectorAll("img").length -
        Array.from(document.querySelectorAll("img")).filter((i) => i.complete && i.naturalWidth > 0).length
    );
    console.log(`${route}: imgs rotas=${broken}`);
  }

  const track = await page.evaluate(() => {
    const link = document.querySelector('a[href^="/track/"]');
    return link?.getAttribute("href") ?? null;
  });
  if (track) {
    await page.goto(`${BASE}${track}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
  }

  console.log(`imgs optimizadas por /_next/image: ${optimized.length}`);
  optimized.slice(0, 3).forEach((u) => console.log("  " + u));
  console.log(`imgs con error HTTP: ${failedImages.length}`);
  failedImages.slice(0, 5).forEach((u) => console.log("  " + u));
  console.log(`errores de pagina: ${errors.length ? errors.join("; ") : "ninguno"}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
