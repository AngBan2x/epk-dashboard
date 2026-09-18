import { test, expect } from '@playwright/test';

const BASE_URL = 'https://epk-dashboard.vercel.app';

test.describe('P3.6 + P3.3 Production E2E Tests', () => {
  test('Shows page - GET /shows returns 200 with title and filter controls', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/shows`, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    // Check for "Shows & Events" title
    await expect(page.locator('h1')).toContainText('Shows & Events');

    // Check for filter controls
    // Search input has placeholder "Venue o ciudad"
    await expect(page.locator('input[placeholder="Venue o ciudad"]')).toBeVisible();
    // Status dropdown
    await expect(page.locator('select')).toBeVisible();
    // Future only checkbox
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible();
  });

  test('Shows API - GET /api/shows returns 200 with JSON', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/shows`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    // Response is { shows: [] }
    expect(data).toHaveProperty('shows');
    expect(Array.isArray(data.shows)).toBe(true);
  });

  test('Shows API - POST /api/shows without auth returns 401', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/shows`, {
      data: {
        title: 'Test Show',
        date: '2025-12-31',
        venue: 'Test Venue',
        city: 'Test City',
      },
    });
    expect(response.status()).toBe(401);
  });

  test('iTunes API - GET /api/itunes-search?term=bad+bunny returns 200 with JSON array', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/itunes-search?term=bad+bunny`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    // Response is { resultCount: number, results: [...] }
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBe(true);
  });

  test('Dashboard page - GET /dashboard returns 200 (has ShowForm integrated)', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    // Check that page loads (may redirect to login if not authenticated)
    // At minimum should not be a 404 or 500
    expect(response?.status()).toBeLessThan(400);
  });

  test('Admin page - GET /admin returns 200 (has ShowForm integrated)', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    // Check that page loads (may redirect to login if not authenticated)
    // At minimum should not be a 404 or 500
    expect(response?.status()).toBeLessThan(400);
  });
});