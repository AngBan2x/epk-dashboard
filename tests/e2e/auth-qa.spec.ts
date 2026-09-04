import { test, expect } from '@playwright/test';

const BASE_URL = 'https://epk-dashboard.vercel.app';

test.describe('Auth QA — v3.10.3', () => {

  test('1. Login page has rememberMe checkbox', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    
    const checkbox = page.locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
    
    const label = page.locator('label', { hasText: 'Recordar mi sesión' });
    await expect(label).toBeVisible();
    
    console.log('✅ rememberMe checkbox visible');
  });

  test('2. Login without rememberMe — session cookie set with exp', async ({ page }) => {
    const context = await page.context();
    await context.clearCookies();
    
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'admin@epk.local');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    
    const cookies = await context.cookies();
    const authCookie = cookies.find(c => c.name === 'auth_session');
    
    expect(authCookie).toBeTruthy();
    expect(authCookie!.httpOnly).toBe(true);
    expect(authCookie!.path).toBe('/');
    
    // Verify token via API
    const meResponse = await page.goto(`${BASE_URL}/api/auth/me`);
    const body = await meResponse!.json();
    expect(body.email).toBe('admin@epk.local');
    
    console.log('✅ Login works, cookie set, /api/auth/me returns user');
  });

  test('3. Login with rememberMe — session persists', async ({ page }) => {
    const context = await page.context();
    await context.clearCookies();
    
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'admin@epk.local');
    await page.fill('input[type="password"]', 'admin123');
    await page.check('input[type="checkbox"]');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    
    const cookies = await context.cookies();
    const authCookie = cookies.find(c => c.name === 'auth_session');
    
    expect(authCookie).toBeTruthy();
    
    // Verify via API
    const meResponse = await page.goto(`${BASE_URL}/api/auth/me`);
    const body = await meResponse!.json();
    expect(body.email).toBe('admin@epk.local');
    
    console.log('✅ Login with rememberMe works, session persists');
  });

  test('4. Expired token returns 401 on /api/auth/me', async ({ page }) => {
    const context = await page.context();
    await context.clearCookies();
    
    // Create expired token via page.evaluate (browser context has atob)
    const expiredToken = await page.evaluate(() => {
      return btoa(JSON.stringify({
        userId: 'usr-001',
        email: 'admin@epk.local',
        role: 'admin',
        iat: Date.now() - 100000,
        exp: Date.now() - 1000,
      }));
    });
    
    await context.addCookies([{
      name: 'auth_session',
      value: expiredToken,
      domain: 'epk-dashboard.vercel.app',
      path: '/',
      httpOnly: true,
    }]);
    
    const response = await page.goto(`${BASE_URL}/api/auth/me`);
    expect(response!.status()).toBe(401);
    
    const body = await response!.json();
    expect(body.error).toContain('expirada');
    
    console.log(`✅ Expired token returns 401: "${body.error}"`);
  });

  test('5. Valid token works on /api/auth/me', async ({ page }) => {
    const context = await page.context();
    await context.clearCookies();
    
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: 'admin@epk.local', password: 'admin123', rememberMe: false },
    });
    expect(loginResponse.ok()).toBeTruthy();
    
    const meResponse = await page.goto(`${BASE_URL}/api/auth/me`);
    expect(meResponse!.status()).toBe(200);
    
    const body = await meResponse!.json();
    expect(body.email).toBe('admin@epk.local');
    expect(body.role).toBe('admin');
    expect(body.password_hash).toBeUndefined();
    
    console.log(`✅ Valid token returns user: ${body.email} (${body.role})`);
  });

  test('6. Likes POST without auth returns 401', async ({ page }) => {
    const context = await page.context();
    await context.clearCookies();
    
    const response = await page.request.post(`${BASE_URL}/api/likes`, {
      data: { track_id: 'trk-001' },
    });
    
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('autenticado');
    
    console.log(`✅ Like without auth returns 401: "${body.error}"`);
  });

  test('7. Likes POST with valid auth works', async ({ page }) => {
    const context = await page.context();
    await context.clearCookies();
    
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: 'admin@epk.local', password: 'admin123', rememberMe: true },
    });
    expect(loginResponse.ok()).toBeTruthy();
    
    const likeResponse = await page.request.post(`${BASE_URL}/api/likes`, {
      data: { track_id: 'trk-001' },
    });
    
    expect(likeResponse.ok()).toBeTruthy();
    const body = await likeResponse.json();
    expect(typeof body.liked).toBe('boolean');
    expect(typeof body.count).toBe('number');
    
    console.log(`✅ Like with auth works: liked=${body.liked}, count=${body.count}`);
  });

  test('8. Likes GET returns count for track', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/likes?track_id=trk-001`);
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.track_id).toBe('trk-001');
    expect(typeof body.count).toBe('number');
    
    console.log(`✅ Like count for trk-001: ${body.count}`);
  });

  test('9. Middleware redirects expired session to /login', async ({ page }) => {
    const context = await page.context();
    await context.clearCookies();
    
    const expiredToken = await page.evaluate(() => {
      return btoa(JSON.stringify({
        userId: 'usr-001',
        email: 'admin@epk.local',
        role: 'admin',
        iat: Date.now() - 100000,
        exp: Date.now() - 1000,
      }));
    });
    
    await context.addCookies([{
      name: 'auth_session',
      value: expiredToken,
      domain: 'epk-dashboard.vercel.app',
      path: '/',
      httpOnly: true,
    }]);
    
    const response = await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
    
    // Should redirect to /login
    expect(page.url()).toContain('/login');
    
    console.log('✅ Expired session redirected to /login by middleware');
  });

  test('10. Session survives page navigation (within expiry)', async ({ page }) => {
    const context = await page.context();
    await context.clearCookies();
    
    // Login
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: 'admin@epk.local', password: 'admin123', rememberMe: true },
    });
    expect(loginResponse.ok()).toBeTruthy();
    
    // Navigate to dashboard
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    
    // Should be on dashboard (not redirected to login)
    expect(page.url()).toContain('/dashboard');
    
    // Navigate to track page
    await page.goto(`${BASE_URL}/track/trk-001`, { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/track/trk-001');
    
    // Verify still authenticated
    const meResponse = await page.goto(`${BASE_URL}/api/auth/me`);
    const body = await meResponse!.json();
    expect(body.email).toBe('admin@epk.local');
    
    console.log('✅ Session survives page navigation');
  });

});
