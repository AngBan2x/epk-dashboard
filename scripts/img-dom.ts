import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const imgs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img")).slice(0, 10).map((i) => ({
      src: i.getAttribute("src")?.slice(0, 80),
      srcset: i.getAttribute("srcset")?.slice(0, 60) ?? null,
      w: i.naturalWidth,
    }))
  );
  console.log(JSON.stringify(imgs, null, 1));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
