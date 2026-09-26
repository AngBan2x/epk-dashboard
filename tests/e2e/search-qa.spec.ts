import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

test.describe("P4.7: Busqueda y ordenacion QA", () => {
  test.describe.configure({ timeout: 300_000 });

  test("API: busqueda por artistas, releases y shows con minimo de caracteres", async ({ request }) => {
    const tooShort = await request.get(`${BASE_URL}/api/search?q=a`);
    expect(tooShort.status()).toBe(400);
    expect((await tooShort.json()).error).toMatch(/2 caracteres/);

    const all = await request.get(`${BASE_URL}/api/search?q=bush`);
    expect(all.status()).toBe(200);
    const body = await all.json();
    expect(body.results.artists.some((a: { title: string }) => /Kate Bush/i.test(a.title))).toBe(true);
    expect(body.results.releases.some((r: { title: string }) => /Running Up That Hill/i.test(r.title))).toBe(true);
    expect(body.results.artists[0].url).toMatch(/^\/artists\//);

    const scoped = await request.get(`${BASE_URL}/api/search?q=bush&scope=artist`);
    expect(scoped.status()).toBe(200);
    expect((await scoped.json()).results.releases).toEqual([]);

    const shows = await request.get(`${BASE_URL}/api/search?q=teatro`);
    expect(shows.status()).toBe(200);
    const showsBody = await shows.json();
    expect(showsBody.results.shows.length).toBeGreaterThan(0);
    expect(showsBody.results.shows[0].url).toContain("/shows?venue=");

    const accented = await request.get(`${BASE_URL}/api/search?q=valencia`);
    expect(accented.status()).toBe(200);

    const started = Date.now();
    const perf = await request.get(`${BASE_URL}/api/search?q=queen`);
    const elapsed = Date.now() - started;
    expect(perf.status()).toBe(200);
    expect(elapsed).toBeLessThan(3000);
  });

  test("UI: buscador del header, overlay movil y orden que persiste en la URL", async ({ browser }) => {
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await desktop.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`${BASE_URL}/artists`, { waitUntil: "domcontentloaded" });
    const input = page.getByRole("combobox", { name: /buscar/i }).first();
    await expect(input).toBeVisible({ timeout: 45_000 });
    await input.fill("bush");
    await expect(page.getByText("Kate Bush").first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "tests/screenshots/search/qa-desktop-search.png", fullPage: false });
    await page.keyboard.press("Escape");

    const asc = await page.locator("main a[href^='/artists/']").allInnerTexts();
    await page.goto(`${BASE_URL}/artists?sort=name&order=desc`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const desc = await page.locator("main a[href^='/artists/']").allInnerTexts();
    expect(asc.join("|")).not.toBe(desc.join("|"));

    await page.goto(`${BASE_URL}/artists?sort=name&order=desc`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const afterReload = await page.locator("main a[href^='/artists/']").allInnerTexts();
    expect(afterReload.join("|")).toBe(desc.join("|"));

    await page.goto(`${BASE_URL}/shows?sort=date&order=asc`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Shows/i }).first()).toBeVisible({ timeout: 45_000 });
    expect(errors).toEqual([]);
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mpage = await mobile.newPage();
    await mpage.goto(`${BASE_URL}/shows`, { waitUntil: "domcontentloaded" });
    const searchButton = mpage.getByRole("button", { name: "Buscar" }).first();
    await expect(searchButton).toBeVisible({ timeout: 45_000 });
    await mpage.waitForTimeout(1500);
    await searchButton.click();
    const overlay = mpage.locator("div.fixed.inset-0").first();
    await expect(overlay).toBeVisible({ timeout: 30_000 });
    const box = await overlay.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(380);
    expect(box?.height).toBeGreaterThanOrEqual(700);
    await mpage.getByRole("combobox", { name: /buscar/i }).first().fill("teatro");
    await expect(mpage.getByText("Teatro Municipal").first()).toBeVisible({ timeout: 30_000 });
    await mpage.screenshot({ path: "tests/screenshots/search/qa-mobile-search.png", fullPage: false });
    await mpage.keyboard.press("Escape");
    await expect(overlay).toBeHidden({ timeout: 15_000 });
    await mobile.close();
  });
});
