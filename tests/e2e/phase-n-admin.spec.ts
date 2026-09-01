import { test, expect } from "@playwright/test";

test.describe("N4: Admin Flow", () => {
  test("admin can login and access admin panel", async ({ page }) => {
    // Go to login
    await page.goto("/login", { waitUntil: "networkidle" });

    // Fill login form
    await page.fill('input[type="email"]', "admin@epk.local");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await expect(page).toHaveURL(/\/dashboard/);

    // Screenshot dashboard as admin
    await page.screenshot({
      path: "screenshots/admin/dashboard-admin.png",
      fullPage: true,
    });

    // Check admin panel link exists
    const adminLink = page.locator('a[href="/admin"]');
    await expect(adminLink).toBeVisible();

    // Click admin link
    await adminLink.click();
    await page.waitForURL("**/admin", { timeout: 10000 });
    await expect(page).toHaveURL(/\/admin/);

    // Screenshot admin panel
    await page.screenshot({
      path: "screenshots/admin/admin-panel.png",
      fullPage: true,
    });

    // Check tabs exist
    const tracksTab = page.locator("button", { hasText: "Tracks" });
    await expect(tracksTab).toBeVisible();

    const artistsTab = page.locator("button", { hasText: "Artistas" });
    await expect(artistsTab).toBeVisible();

    const showsTab = page.locator("button", { hasText: "Shows" });
    await expect(showsTab).toBeVisible();

    const notificationsTab = page.locator("button", { hasText: "Notificaciones" });
    await expect(notificationsTab).toBeVisible();
  });

  test("admin can view tracks tab", async ({ page }) => {
    // Login as admin
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', "admin@epk.local");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Go to admin
    await page.goto("/admin", { waitUntil: "networkidle" });

    // Click tracks tab
    const tracksTab = page.locator("button", { hasText: "Tracks" });
    await tracksTab.click();

    // Screenshot tracks tab
    await page.screenshot({
      path: "screenshots/admin/admin-tracks.png",
      fullPage: true,
    });

    // Check tracks are displayed
    const trackCards = page.locator("[class*='track'], [class*='card']");
    const count = await trackCards.count();
    console.log("Track cards found:", count);
  });

  test("admin can view artists tab", async ({ page }) => {
    // Login as admin
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', "admin@epk.local");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Go to admin
    await page.goto("/admin", { waitUntil: "networkidle" });

    // Click artists tab
    const artistsTab = page.locator("button", { hasText: "Artistas" });
    await artistsTab.click();

    // Screenshot artists tab
    await page.screenshot({
      path: "screenshots/admin/admin-artists.png",
      fullPage: true,
    });
  });

  test("admin can view shows tab", async ({ page }) => {
    // Login as admin
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', "admin@epk.local");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Go to admin
    await page.goto("/admin", { waitUntil: "networkidle" });

    // Click shows tab
    const showsTab = page.locator("button", { hasText: "Shows" });
    await showsTab.click();

    // Screenshot shows tab
    await page.screenshot({
      path: "screenshots/admin/admin-shows.png",
      fullPage: true,
    });
  });

  test("admin can view notifications tab", async ({ page }) => {
    // Login as admin
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', "admin@epk.local");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Go to admin
    await page.goto("/admin", { waitUntil: "networkidle" });

    // Click notifications tab
    const notificationsTab = page.locator("button", { hasText: "Notificaciones" });
    await notificationsTab.click();

    // Screenshot notifications tab
    await page.screenshot({
      path: "screenshots/admin/admin-notifications.png",
      fullPage: true,
    });
  });

  test("admin panel in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });

    // Login as admin
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', "admin@epk.local");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Go to admin
    await page.goto("/admin", { waitUntil: "networkidle" });

    // Screenshot admin panel dark mode
    await page.screenshot({
      path: "screenshots/admin/admin-dark.png",
      fullPage: true,
    });
  });

  test("non-admin cannot access admin panel", async ({ page }) => {
    // Try to access admin without login
    await page.goto("/admin", { waitUntil: "networkidle" });

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
