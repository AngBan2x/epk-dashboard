import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await page.goto(`${BASE}/shows`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const info = await page.evaluate(() => {
    const sheets = Array.from(document.styleSheets);
    const found: string[] = [];
    for (const sheet of sheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (rule.cssText.includes("focus-visible")) found.push(rule.cssText.slice(0, 160));
      }
    }
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => !String(b.className).includes("focus-visible")
    );
    let computed = "sin boton";
    if (btn) {
      btn.focus();
      const cs = getComputedStyle(btn);
      computed = `${btn.textContent?.trim().slice(0, 18)} outline=${cs.outlineWidth}/${cs.outlineStyle}`;
    }
    return { sheets: sheets.length, found: found.slice(0, 6), computed };
  });

  console.log("hojas:", info.sheets);
  info.found.forEach((r) => console.log("regla:", r));
  console.log("computed:", info.computed);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
