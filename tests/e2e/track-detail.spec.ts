import { test, expect } from "@playwright/test";

test.describe("Track Detail", () => {
  test("loads track detail page", async ({ page }) => {
    await page.goto("/track/trk-001");
    await expect(page.locator("h1")).toContainText("Detalle de Track");
  });

  test("shows not found for invalid track", async ({ page }) => {
    const response = await page.goto("/track/invalid-id");
    expect(response?.status()).toBe(404);
  });
});
