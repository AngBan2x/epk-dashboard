import { test, expect } from "@playwright/test";

test("create Sad Winter Song release via YouTube", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "angab06@gmail.com");
  await page.fill('input[type="password"]', "12345678");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15000 });

  await page.goto("/releases/new", { waitUntil: "networkidle" });
  await page.waitForLoadState("domcontentloaded");

  await page.locator('input[placeholder="YouTube URL"]').click();
  await page.keyboard.type("https://www.youtube.com/watch?v=P03mdT9cxlg");
  await page.waitForTimeout(5000);

  await page.screenshot({ path: "screenshots/test/release-youtube-autofill.png", fullPage: true });

  const titleVal = await page.locator('input[placeholder="Nombre del release"]').inputValue();
  const coverVal = await page.locator('input[placeholder="https://..."]').inputValue();
  console.log("YouTube auto-fill -> title:", titleVal, "cover:", coverVal.substring(0, 80));

  await page.locator('input[placeholder="Nombre del release"]').fill("Sad Winter Song");
  await page.locator('input[placeholder="Nombre del artista"]').fill("Angel Bandres");
  await page.locator('input[type="date"]').fill("2026-09-15");
  if (!coverVal) {
    await page.locator('input[placeholder="https://..."]').fill("https://i.ytimg.com/vi/P03mdT9cxlg/maxresdefault.jpg");
  }

  await page.locator('button[type="submit"]:has-text("Guardar como borrador")').click();
  await page.waitForTimeout(5000);

  await page.screenshot({ path: "screenshots/test/release-created.png", fullPage: true });
  console.log("Final URL:", page.url());
});
