import { chromium } from "@playwright/test";

const routes = [
  { path: "/dashboard", name: "dashboard" },
  { path: "/track/trk-001", name: "track-detail" },
  { path: "/upload", name: "upload" },
  { path: "/admin", name: "admin" },
  { path: "/login", name: "login" },
];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  for (const route of routes) {
    try {
      await page.goto(`http://localhost:3000${route.path}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.screenshot({ path: `screenshots/${route.name}.png`, fullPage: true });
      console.log(`✅ ${route.name}: screenshot capturado`);
    } catch (error) {
      console.log(`⚠️  ${route.name}: ${error}`);
    }
  }

  await browser.close();
  console.log("\n📸 Screenshots completados en /screenshots/");
}

main();
