import { test, expect } from "@playwright/test";

test.describe("Audio Playback", () => {
  test("play button exists on track card", async ({ page }) => {
    await page.goto("/dashboard");
    const playButton = page.locator('button[aria-label="Reproducir"]').first();
    await expect(playButton).toBeVisible();
  });
});
