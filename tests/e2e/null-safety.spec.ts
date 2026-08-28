import { test, expect } from "@playwright/test";

test.describe("Null Safety", () => {
  test("no console errors on dashboard", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });

  test("track with null youtube_video_id renders without error", async ({ page }) => {
    await page.goto("/track/trk-002");
    await expect(page.locator("h1")).toBeVisible();
  });
});
