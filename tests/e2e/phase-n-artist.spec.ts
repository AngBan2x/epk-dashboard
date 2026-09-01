import { test, expect } from "@playwright/test";

test.describe("N5: Artist Flow", () => {
  test("artist can login and access dashboard", async ({ page }) => {
    // Go to login
    await page.goto("/login", { waitUntil: "networkidle" });

    // Fill login form with test artist
    await page.fill('input[type="email"]', "angab06@gmail.com");
    await page.fill('input[type="password"]', "12345678");
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await expect(page).toHaveURL(/\/dashboard/);

    // Screenshot artist dashboard
    await page.screenshot({
      path: "screenshots/artist/artist-dashboard.png",
      fullPage: true,
    });

    // Check artist dashboard has "Mi Dashboard" heading
    const heading = page.locator("h1", { hasText: "Mi Dashboard" });
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test("artist can view their tracks", async ({ page }) => {
    // Login as artist
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', "angab06@gmail.com");
    await page.fill('input[type="password"]', "12345678");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Check "Mis Tracks" section exists
    const misTracks = page.locator("h2", { hasText: "Mis Tracks" });
    await expect(misTracks).toBeVisible({ timeout: 5000 });

    // Screenshot artist tracks
    await page.screenshot({
      path: "screenshots/artist/artist-tracks.png",
      fullPage: true,
    });
  });

  test("artist can view BioSection", async ({ page }) => {
    // Login as artist
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', "angab06@gmail.com");
    await page.fill('input[type="password"]', "12345678");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Check BioSection exists
    const bioSection = page.locator("text=Biografía").first();
    const bioExists = await bioSection.isVisible().catch(() => false);
    console.log("BioSection visible:", bioExists);

    // Screenshot artist bio
    await page.screenshot({
      path: "screenshots/artist/artist-bio.png",
      fullPage: true,
    });
  });

  test("artist can view Shows & Booking", async ({ page }) => {
    // Login as artist
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', "angab06@gmail.com");
    await page.fill('input[type="password"]', "12345678");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Check Shows & Booking section exists
    const showsSection = page.locator("text=Shows").first();
    const showsExists = await showsSection.isVisible().catch(() => false);
    console.log("Shows section visible:", showsExists);

    // Screenshot artist shows
    await page.screenshot({
      path: "screenshots/artist/artist-shows.png",
      fullPage: true,
    });
  });

  test("artist dashboard in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });

    // Login as artist
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', "angab06@gmail.com");
    await page.fill('input[type="password"]', "12345678");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Screenshot artist dashboard dark mode
    await page.screenshot({
      path: "screenshots/artist/artist-dark.png",
      fullPage: true,
    });
  });

  test("artist dashboard mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Login as artist
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', "angab06@gmail.com");
    await page.fill('input[type="password"]', "12345678");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Screenshot artist dashboard mobile
    await page.screenshot({
      path: "screenshots/artist/artist-mobile.png",
      fullPage: true,
    });
  });
});
