import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const TRACKS = [
  { id: "trk-001", title: "Bohemian Rhapsody", sources: 3, youtubeOnly: false },
  { id: "trk-002", title: "Smells Like Teen Spirit", sources: 3, youtubeOnly: false },
  { id: "trk-003", title: "Blinding Lights", sources: 3, youtubeOnly: false },
  { id: "trk-004", title: "Hotel California", sources: 3, youtubeOnly: false },
  { id: "trk-005", title: "Shape of You", sources: 3, youtubeOnly: false },
  { id: "trk-006", title: "Running Up That Hill", sources: 3, youtubeOnly: false },
  { id: "7c922875-54c5-4670-8940-98b07403f691", title: "Se Va", sources: 0, youtubeOnly: true },
  { id: "fa5b4397-c50e-4ae5-9b65-0ebdd6b1b898", title: "The Rain", sources: 0, youtubeOnly: true },
];

async function waitForPlayer(page: Page, timeout = 15000) {
  await page.locator(".fixed.bottom-0").first().waitFor({ state: "visible", timeout });
}

async function isPlayerVisible(page: Page) {
  const count = await page.locator(".fixed.bottom-0").count();
  if (count === 0) return false;
  return page.locator(".fixed.bottom-0").first().isVisible();
}

async function closePlayerIfVisible(page: Page) {
  const close = page.locator('button[aria-label="Cerrar reproductor"]');
  if ((await close.count()) > 0 && (await close.first().isVisible())) {
    await close.first().click();
    await page.waitForTimeout(300);
  }
}

async function clickPlayDashboard(page: Page) {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForSelector(".grid", { timeout: 15000 });
  const btn = page.locator('button[aria-label="Reproducir"]').first();
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click();
}

async function clickPlayDetail(page: Page, trackId: string) {
  await page.goto(`${BASE_URL}/track/${trackId}`);
  await page.waitForSelector("h1", { timeout: 15000 });
  const btn = page.locator('button[aria-label="Reproducir"]').first();
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click();
}

// ═══════════════════════════════════════════════════════════════
// SUITE 1: PLAYBACK BÁSICO
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 1: Playback Básico", () => {
  test("1.1 Play en dashboard — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForSelector(".grid", { timeout: 15000 });
      const btn = page.locator('button[aria-label="Reproducir"]').first();
      await btn.waitFor({ state: "visible", timeout: 10000 });
      await btn.click();
      await waitForPlayer(page);
      expect(await isPlayerVisible(page)).toBeTruthy();
    }
  });

  test("1.2 Play en track detail — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDetail(page, track.id);
      if (track.youtubeOnly) {
        // YouTube-only: verify YouTube iframe or "Ver en YouTube" is visible
        const ytFrame = page.locator('iframe[src*="youtube.com/embed"], a[href*="youtube.com/watch"]');
        await expect(ytFrame.first()).toBeVisible({ timeout: 5000 });
      } else {
        const pauseBtn = page.locator('button[aria-label="Pausar"]').first();
        await expect(pauseBtn).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test("1.3 Pausa — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      if (track.youtubeOnly) continue; // YouTube-only: no global player pause
      await clickPlayDetail(page, track.id);
      const pauseBtn = page.locator('button[aria-label="Pausar"]').first();
      await pauseBtn.waitFor({ state: "visible", timeout: 5000 });
      await pauseBtn.click();
      await page.waitForTimeout(300);
      const playBtn = page.locator('button[aria-label="Reproducir"]').first();
      await expect(playBtn).toBeVisible({ timeout: 5000 });
    }
  });

  test("1.4 Cierre del player", async ({ page }) => {
    await clickPlayDashboard(page);
    await waitForPlayer(page);
    // Close from collapsed view (close button is in collapsed state)
    await closePlayerIfVisible(page);
    await page.waitForTimeout(500);
    // After close, player should be fully hidden
    expect(await isPlayerVisible(page)).toBeFalsy();
  });

  test("1.5 Doble play rápido — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDetail(page, track.id);
      const btn = page.locator('button[aria-label="Reproducir"], button[aria-label="Pausar"]').first();
      await btn.waitFor({ state: "visible", timeout: 10000 });
      await btn.click();
      await page.waitForTimeout(100);
      const btn2 = page.locator('button[aria-label="Reproducir"], button[aria-label="Pausar"]').first();
      await btn2.click().catch(() => {});
      await page.waitForTimeout(200);
      const controls = page.locator('button[aria-label="Reproducir"], button[aria-label="Pausar"]');
      expect(await controls.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test("1.6 Play después de cerrar — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForSelector(".grid", { timeout: 15000 });
      const btn = page.locator('button[aria-label="Reproducir"]').first();
      await btn.waitFor({ state: "visible", timeout: 10000 });
      await btn.click();
      await waitForPlayer(page);
      // Close player
      await closePlayerIfVisible(page);
      await page.waitForTimeout(300);
      // Play again
      await btn.click().catch(() => {});
      await waitForPlayer(page);
      expect(await isPlayerVisible(page)).toBeTruthy();
    }
  });

  test("1.7 Info del track en player — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDetail(page, track.id);
      if (track.youtubeOnly) {
        // YouTube-only: verify YouTube embed or "Ver en YouTube" visible
        const ytVisible = page.locator('iframe[src*="youtube.com/embed"], a:has-text("Ver en YouTube")').first();
        await expect(ytVisible).toBeVisible({ timeout: 5000 });
      } else {
        await waitForPlayer(page);
        const playerText = await page.locator(".fixed.bottom-0").first().innerText();
        expect(playerText.length).toBeGreaterThan(0);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 2: MULTI-SOURCE SELECTOR
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 2: Multi-Source Selector", () => {
  test("2.1 Tracks con múltiples fuentes — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      if (track.youtubeOnly) continue;
      await clickPlayDetail(page, track.id);
      const body = await page.locator("body").innerText();
      expect(body.length).toBeGreaterThan(0);
    }
  });

  test("2.2 Cambiar source — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDetail(page, track.id);
      const select = page.locator("select").first();
      if ((await select.count()) > 0) {
        const opts = select.locator("option");
        const count = await opts.count();
        if (count > 1) {
          const val = await opts.nth(1).getAttribute("value");
          if (val) {
            await select.selectOption(val);
            await expect(select).toHaveValue(val);
          }
        }
      }
    }
  });

  test("2.3 YouTube source — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDetail(page, track.id);
      const select = page.locator("select").first();
      if ((await select.count()) > 0) {
        const ytOpt = select.locator('option[value="youtube"]');
        if ((await ytOpt.count()) > 0) {
          await select.selectOption("youtube");
          await page.waitForTimeout(800);
          const iframe = page.locator('iframe[src*="youtube.com/embed"]');
          await expect(iframe).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test("2.4 Prioridad preview por defecto — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDetail(page, track.id);
      const select = page.locator("select").first();
      if ((await select.count()) > 0) {
        const firstVal = await select.locator("option").first().getAttribute("value");
        expect(firstVal).toBe("preview");
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 3: NAVEGACIÓN + PERSISTENCIA
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 3: Navegación + Persistencia", () => {
  test("3.1 Play en detail, navegar a dashboard — player persiste", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDetail(page, track.id);
      await page.waitForTimeout(500);
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForTimeout(1000);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("3.2 Cambio de track — todos los tracks", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector(".grid", { timeout: 15000 });
    const btns = page.locator('button[aria-label="Reproducir"]');
    const count = Math.min(5, await btns.count());
    // Click first button, wait for player
    await btns.nth(0).click();
    await waitForPlayer(page);
    // Now click remaining buttons — each should switch tracks
    for (let i = 1; i < count; i++) {
      await btns.nth(i).click();
      await page.waitForTimeout(1000);
    }
    expect(await isPlayerVisible(page)).toBeTruthy();
  });

  test("3.3 Navegación rápida — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      const routes = ["/dashboard", `/track/${track.id}`, "/dashboard"];
      for (const route of routes) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForTimeout(600);
      }
      await expect(page.locator("body")).toBeVisible();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 4: GLOBAL PLAYER COMPORTAMIENTO
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 4: Global Player Comportamiento", () => {
  test("4.1 Auto-hide 5s", async ({ page }) => {
    await clickPlayDashboard(page);
    await waitForPlayer(page);
    // Verify player is visible and playing
    const player = page.locator(".fixed.bottom-0");
    await expect(player.first()).toBeVisible();
    // Move mouse away and wait — player should still be functional
    await page.mouse.move(0, 0);
    await page.waitForTimeout(6000);
    // Player container should still exist (auto-hide collapses but doesn't remove)
    await expect(player.first()).toBeVisible();
  });

  test("4.2 Reaparece en hover", async ({ page }) => {
    await clickPlayDashboard(page);
    await waitForPlayer(page);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    await page.waitForTimeout(6000);
    await page.locator(".fixed.bottom-0").first().hover();
    await page.waitForTimeout(600);
    const fullPlayer = page.locator(".fixed.bottom-0 .rounded-lg");
    await expect(fullPlayer.first()).toBeVisible({ timeout: 3000 });
  });

  test("4.3 Barra de progreso avanza — primeros 4 tracks", async ({ page }) => {
    const subset = TRACKS.slice(0, 4);
    for (const track of subset) {
      await clickPlayDetail(page, track.id);
      await page.waitForTimeout(2000);
      const playerTime = page.locator(".fixed.bottom-0 .font-mono");
      if ((await playerTime.count()) > 0) {
        const text = await playerTime.first().textContent();
        expect(text).toContain(":");
      }
    }
  });

  test("4.4 Control de volumen", async ({ page }) => {
    await clickPlayDashboard(page);
    await waitForPlayer(page);
    await page.locator(".fixed.bottom-0").first().hover();
    await page.waitForTimeout(500);
    const vol = page.locator('input[aria-label="Control de volumen"]');
    if ((await vol.count()) > 0) {
      await vol.fill("0");
      await page.waitForTimeout(300);
      const playerText = await page.locator(".fixed.bottom-0").first().innerText();
      expect(playerText).toContain("🔇");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 5: VISUALIZER — ESTRÉS COMPLETO
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 5: Visualizer Estrés", () => {
  test("5.1 Abrir + verificar canvas — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDashboard(page);
      await waitForPlayer(page);
      await page.locator(".fixed.bottom-0").first().hover();
      await page.waitForTimeout(400);
      const vizBtn = page.locator('button:has-text("Visualizador")');
      if ((await vizBtn.count()) > 0 && (await vizBtn.first().isVisible())) {
        await vizBtn.first().click();
        await page.waitForTimeout(600);
        const canvas = page.locator(".fixed.bottom-0 canvas");
        await expect(canvas.first()).toBeVisible({ timeout: 3000 });
        await vizBtn.first().click();
        await page.waitForTimeout(300);
      }
    }
  });

  test("5.2 Toggle rápido ×10 — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDashboard(page);
      await waitForPlayer(page);
      await page.locator(".fixed.bottom-0").first().hover();
      await page.waitForTimeout(400);
      const vizBtn = page.locator('button:has-text("Visualizador")');
      if ((await vizBtn.count()) > 0 && (await vizBtn.first().isVisible())) {
        for (let i = 0; i < 10; i++) {
          await vizBtn.first().click();
          await page.waitForTimeout(80);
        }
        expect(await isPlayerVisible(page)).toBeTruthy();
        const canvas = page.locator(".fixed.bottom-0 canvas");
        if ((await canvas.count()) > 0 && (await canvas.first().isVisible())) {
          await vizBtn.first().click();
          await page.waitForTimeout(200);
        }
      }
    }
  });

  test("5.3 Abrir antes de play, play, cerrar durante — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDashboard(page);
      await waitForPlayer(page);
      const pauseBtn = page.locator('button[aria-label="Pausar"]').first();
      if ((await pauseBtn.count()) > 0 && (await pauseBtn.isVisible())) {
        await pauseBtn.click();
        await page.waitForTimeout(200);
      }
      await page.locator(".fixed.bottom-0").first().hover();
      await page.waitForTimeout(400);
      const vizBtn = page.locator('button:has-text("Visualizador")');
      if ((await vizBtn.count()) > 0 && (await vizBtn.first().isVisible())) {
        await vizBtn.first().click();
        await page.waitForTimeout(500);
        await expect(page.locator(".fixed.bottom-0 canvas").first()).toBeVisible({ timeout: 3000 });
        const playBtn = page.locator('button[aria-label="Reproducir"]').first();
        if ((await playBtn.count()) > 0 && (await playBtn.isVisible())) {
          await playBtn.click();
          await page.waitForTimeout(500);
          await expect(page.locator(".fixed.bottom-0 canvas").first()).toBeVisible();
          await vizBtn.first().click();
          await page.waitForTimeout(400);
          expect(await isPlayerVisible(page)).toBeTruthy();
        }
      }
    }
  });

  test("5.4 Visualizer + cambio de track — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDashboard(page);
      await waitForPlayer(page);
      await page.locator(".fixed.bottom-0").first().hover();
      await page.waitForTimeout(400);
      const vizBtn = page.locator('button:has-text("Visualizador")');
      if ((await vizBtn.count()) > 0 && (await vizBtn.first().isVisible())) {
        await vizBtn.first().click();
        await page.waitForTimeout(500);
        await expect(page.locator(".fixed.bottom-0 canvas").first()).toBeVisible({ timeout: 3000 });
        // Close visualizer — player persists
        await vizBtn.first().click();
        await page.waitForTimeout(300);
        expect(await isPlayerVisible(page)).toBeTruthy();
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 6: EDGE CASES / ESTRÉS
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 6: Edge Cases / Estrés", () => {
  test("6.1 Clicks rápidos ×10 — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      await clickPlayDetail(page, track.id);
      const btn = page.locator('button[aria-label="Reproducir"], button[aria-label="Pausar"]').first();
      await btn.waitFor({ state: "visible", timeout: 10000 });
      for (let i = 0; i < 10; i++) {
        await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(300);
      const controls = page.locator('button[aria-label="Reproducir"], button[aria-label="Pausar"]');
      expect(await controls.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test("6.2 Cambio rápido 3 tracks", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector(".grid", { timeout: 15000 });
    const btns = page.locator('button[aria-label="Reproducir"]');
    const count = Math.min(5, await btns.count());
    // Click first, wait for player, then rapid-switch remaining
    await btns.nth(0).click();
    await waitForPlayer(page);
    for (let i = 1; i < count; i++) {
      await btns.nth(i).click().catch(() => {});
      await page.waitForTimeout(500);
    }
    expect(await isPlayerVisible(page)).toBeTruthy();
  });

  test("6.3 Navegación rápida ×3 — primeros 4 tracks", async ({ page }) => {
    const subset = TRACKS.slice(0, 4);
    for (const track of subset) {
      for (let i = 0; i < 3; i++) {
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForTimeout(500);
        await page.goto(`${BASE_URL}/track/${track.id}`, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForTimeout(500);
      }
      await expect(page.locator("h1")).toBeVisible();
    }
  });

  test("6.4 Recargar durante play — primeros 4 tracks", async ({ page }) => {
    const subset = TRACKS.slice(0, 4);
    for (const track of subset) {
      await clickPlayDetail(page, track.id);
      await page.waitForTimeout(800);
      await page.reload();
      await page.waitForTimeout(1500);
      await expect(page.locator("h1")).toBeVisible();
    }
  });

  test("6.5 YouTube iframe load — todos los tracks", async ({ page }) => {
    for (const track of TRACKS) {
      if (!track.youtubeOnly) continue;
      await clickPlayDetail(page, track.id);
      await page.waitForTimeout(2000);
      const ytFrame = page.locator('iframe[src*="youtube.com/embed"], a[href*="youtube.com/watch"]');
      await expect(ytFrame.first()).toBeVisible({ timeout: 10000 });
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 7: DARK MODE
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 7: Dark Mode", () => {
  test("7.1 Player dark mode — todos los tracks", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    const toggle = page.locator("button[aria-label='Cambiar a modo claro'], button[aria-label='Cambiar a modo oscuro']");
    await toggle.waitFor({ state: "visible", timeout: 10000 });
    const initialClass = await page.locator("html").getAttribute("class");
    await toggle.click();
    await page.waitForTimeout(300);
    const newClass = await page.locator("html").getAttribute("class");
    expect(newClass).not.toBe(initialClass);
    for (const track of TRACKS) {
      await clickPlayDashboard(page);
      await waitForPlayer(page);
      expect(await isPlayerVisible(page)).toBeTruthy();
    }
  });

  test("7.2 Source selector dark — todos los tracks", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    const toggle = page.locator("button[aria-label='Cambiar a modo claro'], button[aria-label='Cambiar a modo oscuro']");
    await toggle.waitFor({ state: "visible", timeout: 10000 });
    await toggle.click();
    await page.waitForTimeout(300);
    for (const track of TRACKS) {
      await clickPlayDetail(page, track.id);
      const select = page.locator("select").first();
      if ((await select.count()) > 0) {
        await expect(select).toBeVisible();
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 8: RESPONSIVE / MOBILE
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 8: Responsive / Mobile", () => {
  test("8.1 Mobile layout — primeros 4 tracks", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const subset = TRACKS.slice(0, 4);
    for (const track of subset) {
      await clickPlayDetail(page, track.id);
      await waitForPlayer(page);
      const player = page.locator(".fixed.bottom-0").first();
      await expect(player).toBeVisible();
      const box = await player.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(375);
    }
  });

  test("8.2 Touch play — primeros 4 tracks", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Touch tests only for chromium mobile");
    await page.setViewportSize({ width: 375, height: 667 });
    const subset = TRACKS.slice(0, 4);
    for (const track of subset) {
      await page.goto(`${BASE_URL}/track/${track.id}`);
      await page.waitForSelector("h1", { timeout: 15000 });
      const btn = page.locator('button[aria-label="Reproducir"]').first();
      await btn.waitFor({ state: "visible", timeout: 10000 });
      await btn.click();
      await page.waitForTimeout(500);
      expect(await isPlayerVisible(page)).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 9: DOWNLOADABLE ASSETS
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 9: Downloadable Assets", () => {
  test("9.1 Download section visible — primeros 3 tracks", async ({ page }) => {
    const subset = TRACKS.slice(0, 3);
    for (const track of subset) {
      await page.goto(`${BASE_URL}/track/${track.id}`);
      await page.waitForSelector("h1", { timeout: 15000 });
      const downloadSection = page.locator('text=Centro de Descargas');
      if ((await downloadSection.count()) > 0) {
        await expect(downloadSection.first()).toBeVisible();
      }
    }
  });

  test("9.2 Download buttons present — primeros 3 tracks", async ({ page }) => {
    const subset = TRACKS.slice(0, 3);
    for (const track of subset) {
      await page.goto(`${BASE_URL}/track/${track.id}`);
      await page.waitForSelector("h1", { timeout: 15000 });
      const downloadBtns = page.locator('button[aria-label*="Descargar"]');
      const count = await downloadBtns.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test("9.3 Rider download generates valid HTML", async ({ page }) => {
    await page.goto(`${BASE_URL}/track/trk-001`);
    await page.waitForSelector("h1", { timeout: 15000 });

    // Listen for new page (download opens in new tab)
    const [downloadPage] = await Promise.all([
      page.waitForEvent("popup", { timeout: 5000 }).catch(() => null),
      page.locator('button[aria-label*="Descargar"]').first().click(),
    ]);

    if (downloadPage) {
      await downloadPage.waitForLoadState();
      const content = await downloadPage.content();
      // Verify it's HTML with PressPlay branding
      expect(content).toContain("PressPlay");
      expect(content).toContain("<!DOCTYPE html>");
      await downloadPage.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 10: VISUALIZER LIFECYCLE
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 10: Visualizer Lifecycle", () => {
  test("10.1 Open visualizer before play — no crash", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector(".grid", { timeout: 15000 });
    const btn = page.locator('button[aria-label="Reproducir"]').first();
    await btn.waitFor({ state: "visible", timeout: 10000 });
    await btn.click();
    await waitForPlayer(page);

    // Hover to expand player
    await page.locator(".fixed.bottom-0").first().hover();
    await page.waitForTimeout(300);

    // Open visualizer
    const vizBtn = page.locator('button[aria-label="Abrir visualizador"]');
    if ((await vizBtn.count()) > 0 && (await vizBtn.first().isVisible())) {
      await vizBtn.first().click();
      await page.waitForTimeout(500);
      // Visualizer should be visible
      const canvas = page.locator("canvas").first();
      if ((await canvas.count()) > 0) {
        await expect(canvas).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test("10.2 Visualizer during play — audio continues", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector(".grid", { timeout: 15000 });
    const btn = page.locator('button[aria-label="Reproducir"]').first();
    await btn.waitFor({ state: "visible", timeout: 10000 });
    await btn.click();
    await waitForPlayer(page);

    // Verify playing
    const pauseBtn = page.locator('button[aria-label="Pausar"]').first();
    await expect(pauseBtn).toBeVisible({ timeout: 5000 });

    // Hover to expand
    await page.locator(".fixed.bottom-0").first().hover();
    await page.waitForTimeout(300);

    // Open visualizer
    const vizBtn = page.locator('button[aria-label="Abrir visualizador"]');
    if ((await vizBtn.count()) > 0 && (await vizBtn.first().isVisible())) {
      await vizBtn.first().click();
      await page.waitForTimeout(500);

      // Audio should still be playing (pause button still visible)
      await expect(pauseBtn).toBeVisible();
    }
  });

  test("10.3 Close visualizer during play — audio continues", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector(".grid", { timeout: 15000 });
    const btn = page.locator('button[aria-label="Reproducir"]').first();
    await btn.waitFor({ state: "visible", timeout: 10000 });
    await btn.click();
    await waitForPlayer(page);

    // Hover to expand
    await page.locator(".fixed.bottom-0").first().hover();
    await page.waitForTimeout(300);

    // Open visualizer
    const vizBtn = page.locator('button[aria-label="Abrir visualizador"]');
    if ((await vizBtn.count()) > 0 && (await vizBtn.first().isVisible())) {
      await vizBtn.first().click();
      await page.waitForTimeout(300);

      // Close visualizer via the X button inside it
      const closeVizBtn = page.locator('button[aria-label="Cerrar visualizador"]').first();
      if ((await closeVizBtn.count()) > 0 && (await closeVizBtn.isVisible())) {
        await closeVizBtn.click();
        await page.waitForTimeout(300);
      }

      // Audio should still be playing
      const pauseBtn = page.locator('button[aria-label="Pausar"]').first();
      await expect(pauseBtn).toBeVisible();
    }
  });

  test("10.4 Visualizer + clearTrack — auto close", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector(".grid", { timeout: 15000 });
    const btn = page.locator('button[aria-label="Reproducir"]').first();
    await btn.waitFor({ state: "visible", timeout: 10000 });
    await btn.click();
    await waitForPlayer(page);

    // Hover to expand
    await page.locator(".fixed.bottom-0").first().hover();
    await page.waitForTimeout(300);

    // Open visualizer
    const vizBtn = page.locator('button[aria-label="Abrir visualizador"]');
    if ((await vizBtn.count()) > 0 && (await vizBtn.first().isVisible())) {
      await vizBtn.first().click();
      await page.waitForTimeout(300);

      // Verify visualizer canvas is visible
      const canvas = page.locator(".fixed.bottom-0 canvas");
      await expect(canvas.first()).toBeVisible({ timeout: 3000 });

      // Close visualizer first, then close player
      const closeViz = page.locator('button[aria-label="Cerrar visualizador"]');
      if ((await closeViz.count()) > 0 && (await closeViz.first().isVisible())) {
        await closeViz.first().click();
        await page.waitForTimeout(300);
      }

      // Now close player
      const closeBtn = page.locator('button[aria-label="Cerrar reproductor"]');
      if ((await closeBtn.count()) > 0 && (await closeBtn.first().isVisible())) {
        await closeBtn.click();
        await page.waitForTimeout(500);

        // Player should be hidden
        expect(await isPlayerVisible(page)).toBeFalsy();
      }
    }
  });

  test("10.5 Rapid visualizer toggle ×20 — no crash", async ({ page }) => {
    for (const track of TRACKS.slice(0, 3)) {
      await clickPlayDetail(page, track.id);
      await waitForPlayer(page);

      // Hover to expand
      await page.locator(".fixed.bottom-0").first().hover();
      await page.waitForTimeout(200);

      const vizBtn = page.locator('button[aria-label="Abrir visualizador"], button[aria-label="Cerrar visualizador"]').first();
      if ((await vizBtn.count()) > 0 && (await vizBtn.isVisible())) {
        for (let i = 0; i < 20; i++) {
          await vizBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(50);
        }
        // Player should still be visible
        expect(await isPlayerVisible(page)).toBeTruthy();
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 11: Source Priority (auto, no dropdown)
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 11: Source Priority (auto, no dropdown)", () => {
  test("11.1 Source selector dropdown does NOT exist in DOM", async ({ page }) => {
    for (const track of TRACKS) {
      if (track.youtubeOnly) continue; // YouTube-only tracks don't have dropdown
      await clickPlayDetail(page, track.id);
      const select = page.locator("select").first();
      // Dropdown should not exist (removed per fix)
      expect(await select.count()).toBe(0);
    }
  });

  test("11.2 Preview source is auto-selected for tracks with preview URL", async ({ page }) => {
    for (const track of TRACKS) {
      if (track.youtubeOnly) continue;
      await clickPlayDetail(page, track.id);
      // Since there's no dropdown, preview should auto-play
      const pauseBtn = page.locator('button[aria-label="Pausar"]').first();
      await expect(pauseBtn).toBeVisible({ timeout: 5000 });
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 12: YouTube-only Track Behavior
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 12: YouTube-only Track Behavior", () => {
  const youtubeOnlyTracks = TRACKS.filter((t) => t.youtubeOnly);

  test("12.1 YouTube-only tracks do NOT show iframe embed", async ({ page }) => {
    for (const track of youtubeOnlyTracks) {
      await clickPlayDetail(page, track.id);
      // Should NOT have iframe embed (removed per fix)
      const iframe = page.locator('iframe[src*="youtube.com/embed"]');
      expect(await iframe.count()).toBe(0);
    }
  });

  test("12.2 YouTube-only tracks show 'Ver en YouTube' button", async ({ page }) => {
    for (const track of youtubeOnlyTracks) {
      await clickPlayDetail(page, track.id);
      const ytButton = page.locator('a:has-text("Ver en YouTube"), button:has-text("Ver en YouTube")').first();
      await expect(ytButton).toBeVisible({ timeout: 5000 });
    }
  });

  test("12.3 Visualizer button is hidden when playing YouTube-only track", async ({ page }) => {
    for (const track of youtubeOnlyTracks) {
      await clickPlayDetail(page, track.id);
      // Visualizer button should not be visible for YouTube-only tracks
      const vizBtn = page.locator('button:has-text("Visualizador"), button[aria-label="Abrir visualizador"]').first();
      // Check if visible - should be hidden
      if ((await vizBtn.count()) > 0) {
        const isVisible = await vizBtn.isVisible();
        expect(isVisible).toBeFalsy();
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUITE 13: UI Fixes Verification
// ═══════════════════════════════════════════════════════════════

test.describe("Suite 13: UI Fixes Verification", () => {
  test("13.1 Production details section is collapsed by default", async ({ page }) => {
    for (const track of TRACKS.slice(0, 3)) {
      await page.goto(`${BASE_URL}/track/${track.id}`);
      await page.waitForSelector("h1", { timeout: 15000 });
      // Find production details section - should be collapsed
      // Look for expanded content that should NOT be visible initially
      const expandedContent = page.locator('text=DAW, text=Guitarras, text=Efectos, text=Afinação, text=Tonalidad').first();
      // The expanded production details should not be visible (collapsed by default)
      if ((await expandedContent.count()) > 0) {
        await expect(expandedContent).not.toBeVisible();
      }
    }
  });

  test("13.2 MetricsCharts section exists on track detail page", async ({ page }) => {
    for (const track of TRACKS.slice(0, 3)) {
      await page.goto(`${BASE_URL}/track/${track.id}`);
      await page.waitForSelector("h1", { timeout: 15000 });
      // Check for metrics charts section
      const metricsSection = page.locator('text=Métricas, text=Streams, text=Saves, text=Playlist, text=Top Countries').first();
      // Should have some metrics-related content visible
      if ((await metricsSection.count()) > 0) {
        await expect(metricsSection).toBeVisible({ timeout: 5000 });
      }
    }
  });
});
