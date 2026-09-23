import { chromium } from "@playwright/test";

// Functional test (local dev only): show expand + dossier->artists sync, with cleanup.
const BASE = "http://localhost:3099";
const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const pass = (n: string, d = "") => { results.push({ name: n, ok: true, detail: d }); console.log(`[PASS] ${n} ${d}`); };
const fail = (n: string, d = "") => { results.push({ name: n, ok: false, detail: d }); console.log(`[FAIL] ${n} — ${d}`); };

async function loginAndCookie(email: string, pw: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pw }),
  });
  if (!r.ok) throw new Error(`login ${email} -> ${r.status}`);
  const setCookie = r.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/auth_session=([^;]+)/);
  if (!m) throw new Error("no auth_session cookie");
  return `auth_session=${m[1]}`;
}

async function main() {
  const cookie = await loginAndCookie("angab06@gmail.com", "12345678");
  const H = { "Content-Type": "application/json", Cookie: cookie };
  const ARTIST = "art-1788275587598";

  // ---- 1. create show with extras ----
  const createRes = await fetch(`${BASE}/api/shows`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      artist_id: ARTIST, venue_name: "TEST Expand Venue", city: "Valencia", country: "Venezuela",
      date: "2027-01-15", time: "20:00", price_range: "$5-10", status: "proximamente",
      description: "TEST descripción del show", notes: "TEST nota interna",
      guest_artists: [{ name: "TEST Invitado", role: "Telonero" }],
      payment_methods: [{ type: "cash", details: "Taquilla" }],
      ticket_link: "https://ejemplo.com/tickets-test",
    }),
  });
  const created = await createRes.json().catch(() => ({}));
  const showId: string | undefined = created?.show?.id ?? created?.id;
  if (!createRes.ok || !showId) { fail("setup create show", `status=${createRes.status}`); return; }
  pass("setup create show", showId);

  // Turso replica lag: poll until the new show is readable
  let visible = false;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const lr = await fetch(`${BASE}/api/shows?artist_id=${ARTIST}`);
      const lj = (await lr.json()) as any;
      if ((lj.shows ?? []).some((s: any) => s.id === showId)) { visible = true; break; }
    } catch {}
  }
  if (!visible) { fail("setup replica visible", "show not readable after 60s"); }

  // ---- 2. expand in dashboard ----
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "auth_session", value: cookie.split("=")[1], domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 45000 });
  const venue = page.getByText("TEST Expand Venue", { exact: false }).first();
  try {
    await venue.waitFor({ timeout: 60000 });
    pass("test show rendered on dashboard");
  } catch {
    fail("test show rendered on dashboard", "venue text absent after 60s");
    await browser.close();
    return;
  }
  const row = page.locator("div.p-4", { has: page.getByText("TEST Expand Venue") }).first();
  const chevron = row.getByRole("button", { name: "Ver detalles" });
  if ((await chevron.count()) === 0) fail("expand chevron visible", "no chevron found");
  else {
    pass("expand chevron visible");
    await chevron.click();
    await page.waitForTimeout(1000);
    const body = (await page.textContent("body")) ?? "";
    const checks = ["TEST descripción del show", "TEST Invitado", "Taquilla", "TEST nota interna", "Ver flyer", "Link alternativo"];
    // flyer not set -> "Ver flyer" absent by design
    const must = ["TEST descripción del show", "TEST Invitado", "Taquilla", "TEST nota interna", "Link alternativo"];
    const missing = must.filter((t) => !body.includes(t));
    if (missing.length) fail("expand panel content", "missing: " + missing.join(", "));
    else pass("expand panel content", must.length + " strings");
    await page.screenshot({ path: "tests/screenshots/fase2-expand-check.png" });
  }
  await browser.close();

  // ---- 3. dossier -> artists sync ----
  const meRes = await fetch(`${BASE}/api/artists/me`, { headers: { Cookie: cookie } });
  const me = await meRes.json().catch(() => ({}));
  const origBio: string = me?.biography ?? "";
  const sentinel = `SENTINEL-${Date.now()}`;
  const putRes = await fetch(`${BASE}/api/dossiers`, {
    method: "PUT", headers: H,
    body: JSON.stringify({ artist_id: ARTIST, biography: sentinel, press_text: "", genre: me?.genre ?? "", location: me?.location ?? "" }),
  });
  async function pollBio(expect: string, tries = 15): Promise<string> {
    let last = "";
    for (let i = 0; i < tries; i++) {
      try {
        const mj = (await (await fetch(`${BASE}/api/artists/me`, { headers: { Cookie: cookie } })).json()) as any;
        last = mj?.biography ?? "";
        if (last === expect) return last;
      } catch {}
      await new Promise((r) => setTimeout(r, 4000));
    }
    return last;
  }
  if (!putRes.ok) fail("dossier PUT", `status=${putRes.status}`);
  else {
    const got = await pollBio(sentinel);
    if (got === sentinel) pass("dossier->artists sync", "biography synced");
    else fail("dossier->artists sync", `got: ${got.slice(0, 80)}`);
    // restore
    await fetch(`${BASE}/api/dossiers`, {
      method: "PUT", headers: H,
      body: JSON.stringify({ artist_id: ARTIST, biography: origBio, press_text: me?.press_text ?? "", genre: me?.genre ?? "", location: me?.location ?? "" }),
    });
    const got3 = await pollBio(origBio);
    if (got3 === origBio) pass("sync restore", "biography restored");
    else fail("sync restore", "restore mismatch");
  }

  // ---- 4. cleanup show ----
  const del = await fetch(`${BASE}/api/shows?id=${showId}`, { method: "DELETE", headers: { Cookie: cookie } });
  if (del.ok) pass("cleanup delete show");
  else fail("cleanup delete show", `status=${del.status}`);

  const bad = results.filter((r) => !r.ok);
  console.log(`\n=== FASE2 FUNCTIONAL: ${results.length - bad.length} PASS / ${bad.length} FAIL ===`);
  if (bad.length) process.exit(1);
}
main().catch((e) => { console.error("CRASH", e); process.exit(2); });
