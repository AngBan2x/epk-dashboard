import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const out: string[] = [];

  await page.goto(`${BASE}/shows`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const unlabeled = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll("input, select, textarea"));
    return controls
      .filter((el) => {
        const id = el.getAttribute("id");
        const hasLabel = id ? !!document.querySelector(`label[for="${CSS.escape(id)}"]`) : false;
        const hasAria = !!el.getAttribute("aria-label") || !!el.getAttribute("aria-labelledby");
        const wrapped = !!el.closest("label");
        return !(hasLabel || hasAria || wrapped);
      })
      .map((el) => `${el.tagName}#${el.getAttribute("id") ?? "?"}[type=${el.getAttribute("type") ?? "-"}]`);
  });
  out.push(`/shows controles sin etiqueta: ${unlabeled.length}${unlabeled.length ? " -> " + unlabeled.join(", ") : ""}`);

  const focusRing = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => !b.className.includes("focus-visible")
    );
    if (!btn) return "sin boton de prueba";
    btn.focus();
    const cs = getComputedStyle(btn);
    return `outline=${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`;
  });
  out.push(`anillo de foco global: ${focusRing}`);

  const tapTargets = await page.evaluate(() => {
    const small = Array.from(document.querySelectorAll("button, a[href]")).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.height < 36 || r.width < 36);
    });
    return { total: small.length, muestra: small.slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}`) };
  });
  out.push(`targets tactiles <36px: ${tapTargets.total} ${tapTargets.muestra.join(" | ")}`);

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const loginFocus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return "sin foco";
    const cs = getComputedStyle(el);
    return `${el.tagName} outline=${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`;
  });
  out.push(`/login foco en email: ${loginFocus}`);

  console.log(out.join("\n"));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
