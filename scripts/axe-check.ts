import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3000";

type AxeResult = {
  violations: Array<{
    id: string;
    impact: string | null;
    help: string;
    nodes: Array<{ target: string[]; failureSummary?: string }>;
  }>;
};

async function audit(url: string) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  const result = (await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("no se pudo cargar axe"));
      document.head.appendChild(s);
    });
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<AxeResult> } }).axe;
    return await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] });
  })) as AxeResult;
  await browser.close();
  return result;
}

async function main() {
  const routes = ["/dashboard", "/shows", "/artists"];
  let total = 0;
  for (const route of routes) {
    const res = await audit(`${BASE}${route}`);
    const serias = res.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    total += serias.length;
    console.log(`\n=== ${route}: ${res.violations.length} violaciones (${serias.length} criticas/serias)`);
    for (const v of res.violations) {
      console.log(`  [${v.impact ?? "minor"}] ${v.id}: ${v.help} (${v.nodes.length} nodos)`);
      if (v.impact === "critical" || v.impact === "serious") {
        v.nodes.slice(0, 4).forEach((n) => console.log(`      ej: ${n.target.join(" ")} :: ${(n.failureSummary ?? "").split("\n")[0]}`));
      }
    }
  }
  console.log(`\nTOTAL criticas/serias: ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
