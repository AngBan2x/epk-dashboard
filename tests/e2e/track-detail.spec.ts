import { test, expect } from "@playwright/test";

test.describe("Track Detail", () => {
  test("loads track detail page", async ({ page }) => {
    await page.goto("/track/trk-001");
    // h1 now shows the track title instead of generic "Detalle de Track"
    await expect(page.locator("h1")).toBeVisible();
  });

  test("shows not found for invalid track", async ({ page }) => {
    const response = await page.goto("/track/invalid-id");
    expect(response?.status()).toBe(404);
  });
});
