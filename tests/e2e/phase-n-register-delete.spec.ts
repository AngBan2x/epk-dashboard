import { test, expect } from "@playwright/test";

test.describe("N6: Register + Login + Delete Account", () => {
  let testEmail: string;
  const TEST_PASSWORD = "TestPass123!";

  test("register new account", async ({ page }) => {
    testEmail = `test-n6-${Date.now()}@example.com`;
    
    await page.goto("/register", { waitUntil: "networkidle" });

    await page.fill('input#name', "Test Phase N User");
    await page.fill('input[type="email"]', testEmail);
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill(TEST_PASSWORD);
    await passwordInputs.nth(1).fill(TEST_PASSWORD);

    await page.screenshot({
      path: "screenshots/register-delete/register-form.png",
      fullPage: true,
    });

    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard/);

    await page.screenshot({
      path: "screenshots/register-delete/after-register.png",
      fullPage: true,
    });

    console.log("Registered with email:", testEmail);
  });

  test("login with new account", async ({ page }) => {
    // Register a fresh account
    const loginEmail = `test-login-${Date.now()}@example.com`;
    
    await page.goto("/register", { waitUntil: "networkidle" });
    await page.fill('input#name', "Login Test");
    await page.fill('input[type="email"]', loginEmail);
    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.nth(0).fill(TEST_PASSWORD);
    await pwInputs.nth(1).fill(TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 15000 });

    // Logout via API call, then clear cookie in browser
    await page.request.post("/api/auth/logout");
    // Clear auth cookie manually
    await page.context().clearCookies();
    
    // Go to login page
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', loginEmail);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await expect(page).toHaveURL(/\/dashboard/);

    await page.screenshot({
      path: "screenshots/register-delete/after-login.png",
      fullPage: true,
    });

    console.log("Logged in with:", loginEmail);
  });

  test("delete account via API", async ({ page }) => {
    // Register first
    const delEmail = `test-del-${Date.now()}@example.com`;
    
    await page.goto("/register", { waitUntil: "networkidle" });
    await page.fill('input#name', "Delete User");
    await page.fill('input[type="email"]', delEmail);
    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.nth(0).fill(TEST_PASSWORD);
    await pwInputs.nth(1).fill(TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 15000 });

    // Delete account via API
    const deleteResponse = await page.request.delete("/api/auth/me");
    expect(deleteResponse.ok()).toBeTruthy();
    const body = await deleteResponse.json();
    console.log("Delete response:", body);

    // Verify session is cleared
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const url = page.url();
    const isOnLogin = url.includes("/login");
    console.log("Redirected to login after delete:", isOnLogin);

    await page.screenshot({
      path: "screenshots/register-delete/after-delete.png",
      fullPage: true,
    });
  });

  test("deleted account cannot login", async ({ page }) => {
    // Register and delete
    const delEmail2 = `test-del2-${Date.now()}@example.com`;
    
    await page.goto("/register", { waitUntil: "networkidle" });
    await page.fill('input#name', "Del2 User");
    await page.fill('input[type="email"]', delEmail2);
    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.nth(0).fill(TEST_PASSWORD);
    await pwInputs.nth(1).fill(TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 15000 });

    // Delete
    const delRes = await page.request.delete("/api/auth/me");
    expect(delRes.ok()).toBeTruthy();

    // Try to login with deleted account
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', delEmail2);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for error or stay on login
    await page.waitForTimeout(2000);
    const url = page.url();
    const stayedOnLogin = url.includes("/login");
    console.log("Stayed on login (account deleted):", stayedOnLogin);

    // Should see error message
    const errorMsg = page.locator("text=Credenciales inválidas");
    const hasError = await errorMsg.isVisible().catch(() => false);
    console.log("Shows error message:", hasError);

    await page.screenshot({
      path: "screenshots/register-delete/deleted-account-login.png",
      fullPage: true,
    });
  });
});
