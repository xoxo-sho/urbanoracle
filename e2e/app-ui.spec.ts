import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { signedInDashboard } from "./support/signed-in-dashboard";

/**
 * Follow-up 2 (2026-11-10), in a real browser against the built static export,
 * at both viewports playwright.credits.config.ts runs (1440×900, 390×844):
 *
 *   1. header — the signed-in e-mail, the 「UrbanOracle」 wordmark, the ward
 *      selector and the controls do not overlap, and サインアウト is reachable;
 *   2. text — the 成長率1位 caption and the 人口推移 header's 万人 and growth
 *      figure are 12px, and no rendered text on /app (all five tabs), /, /login
 *      or /forgot-password is below 11px; nothing overflows sideways;
 *   3. map — a second click on the selected ward clears the selection (the
 *      click handler used to keep the selectedWard of the first render), a
 *      click on another ward switches, and the ward dropdown follows.
 *
 * The source-level floor is src/__tests__/typography/no-small-text.test.ts.
 */

const SERVES_EXPORT = !process.env.APP_CREDITS_BASE_URL;
// Longer than any address the header was laid out for: the layout must hold anyway.
const LONG_EMAIL = "a.very.long.address.for.the.header@example-municipality.lg.jp";
const FLOOR_PX = 11;
const CAPTION_PX = "12px";
const TABS = ["地価", "人口", "災害", "交通", "用途地域"] as const;
// src/lib/disaster.ts K2_LABEL, the K2 tile's caption.
const K2_LABEL = "総合危険度ランク5の町丁目";

// ---------------------------------------------------------------------------
// 1. Header
// ---------------------------------------------------------------------------

test("header: the e-mail, the wordmark, the ward selector and the controls do not overlap; サインアウト is reachable", async ({ page, context }) => {
  await signedInDashboard(context, { email: LONG_EMAIL });
  await page.goto("/app");
  const signOut = page.getByRole("button", { name: "サインアウト" });
  await expect(signOut).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("header select")).toBeVisible();

  const g = await page.evaluate((email) => {
    const header = document.querySelector("header") as HTMLElement;
    const box = (r: DOMRect) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    // The wordmark as drawn: its text's own box, which overflow cannot hide.
    const h1 = header.querySelector("h1") as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(h1);
    const emailEl = header.querySelector(`[title="${email}"]`) as HTMLElement | null;
    const button = [...header.querySelectorAll("button")].find((b) => b.textContent?.includes("サインアウト")) as HTMLElement;
    const toggle = header.querySelector('button[title$="モードに切替"]') as HTMLElement;
    const select = header.querySelector("select") as HTMLElement;
    const parts: Record<string, ReturnType<typeof box>> = {
      wordmark: box(range.getBoundingClientRect()),
      select: box(select.getBoundingClientRect()),
      signOut: box(button.getBoundingClientRect()),
      themeToggle: box(toggle.getBoundingClientRect()),
    };
    if (emailEl) parts.email = box(emailEl.getBoundingClientRect());
    const b = button.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      parts,
      emailShown: !!emailEl && emailEl.getBoundingClientRect().width > 0 && emailEl.textContent === email,
      signOutHit: !!hit && button.contains(hit),
      viewport: window.innerWidth,
      headerOverflow: header.scrollWidth - header.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, LONG_EMAIL);

  expect(g.emailShown, "the signed-in e-mail is not shown in the header").toBe(true);
  const names = Object.keys(g.parts);
  const overlaps: string[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = g.parts[names[i]];
      const b = g.parts[names[j]];
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 0.5 && h > 0.5) overlaps.push(`${names[i]} ∩ ${names[j]}: ${w.toFixed(1)}×${h.toFixed(1)}px`);
    }
  }
  expect(overlaps, `at ${g.viewport}px: ${JSON.stringify(g.parts)}`).toEqual([]);
  for (const [name, r] of Object.entries(g.parts)) {
    expect(r.left, `${name} starts left of the viewport`).toBeGreaterThanOrEqual(0);
    expect(r.right, `${name} ends right of the viewport`).toBeLessThanOrEqual(g.viewport);
  }
  expect(g.signOutHit, "サインアウト is covered at its own centre").toBe(true);
  await expect(signOut).toBeInViewport();
  expect(g.headerOverflow).toBeLessThanOrEqual(1);
  expect(g.documentOverflow).toBeLessThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// 2. Text sizes
// ---------------------------------------------------------------------------

/** Every visible text node set below the floor, with where it is. */
async function textBelowFloor(page: Page) {
  return page.evaluate((floor) => {
    const out: string[] = [];
    const where = (el: Element) => {
      const surface = el.closest("[data-surface]")?.getAttribute("data-surface");
      const cls = (el.getAttribute("class") ?? "").split(/\s+/).slice(0, 4).join(".");
      return `${surface ? `[${surface}] ` : ""}<${el.tagName.toLowerCase()}${cls ? ` .${cls}` : ""}>`;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").trim();
      const el = n.parentElement;
      if (!text || !el || el.closest("script, style, noscript, template")) continue;
      if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < floor) out.push(`${size}px ${where(el)} 「${text.slice(0, 30)}」`);
    }
    return out;
  }, FLOOR_PX);
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[role="tabpanel"]:not([hidden])') as HTMLElement | null;
    const root = document.documentElement;
    return { panel: panel ? panel.scrollWidth - panel.clientWidth : 0, document: root.scrollWidth - root.clientWidth };
  });
}

async function openTab(page: Page, name: string) {
  await page.getByRole("tab", { name, exact: true }).click();
  await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
  // Let the panel's charts draw before reading them.
  await page.waitForTimeout(800);
}

test("the 成長率1位 caption, the other two tile captions and the 人口推移 header's 万人 and growth figure are 12px", async ({ page, context }) => {
  await signedInDashboard(context);
  await page.goto("/app");
  const tiles = page.locator(".key-metric");
  await expect(tiles).toHaveCount(3, { timeout: 30_000 });
  const growthCaption = tiles.nth(0).getByText("成長率1位");
  await expect(growthCaption).toBeVisible({ timeout: 30_000 });
  // The ward under the caption (台東区 in the committed fixture) is in the same element.
  await expect(growthCaption).toContainText("区");
  const k2Caption = tiles.nth(1).getByText(K2_LABEL, { exact: true });
  const k3Caption = tiles.nth(2).getByText("日間乗降客", { exact: true });
  const sizes = {
    growthCaption: await growthCaption.evaluate((el) => getComputedStyle(el).fontSize),
    k2Caption: await k2Caption.evaluate((el) => getComputedStyle(el).fontSize),
    k3Caption: await k3Caption.evaluate((el) => getComputedStyle(el).fontSize),
  };
  expect(sizes).toEqual({ growthCaption: CAPTION_PX, k2Caption: CAPTION_PX, k3Caption: CAPTION_PX });

  await openTab(page, "人口");
  const head = page.locator('[data-surface="population-trend"]');
  const unit = head.getByText("万人", { exact: true });
  const growth = head.locator("span").filter({ hasText: /^[+-]?\d+\.\d%$/ });
  await expect(unit).toBeVisible({ timeout: 30_000 });
  await expect(growth).toHaveCount(1);
  expect({
    unit: await unit.evaluate((el) => getComputedStyle(el).fontSize),
    growth: await growth.evaluate((el) => getComputedStyle(el).fontSize),
  }).toEqual({ unit: CAPTION_PX, growth: CAPTION_PX });
});

test("/app: no rendered text below 11px on any of the five tabs, and nothing overflows sideways", async ({ page, context }) => {
  await signedInDashboard(context);
  await page.goto("/app");
  await expect(page.locator(".key-metric")).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('[data-source="growthRate"]')).toBeVisible({ timeout: 30_000 });
  const found: string[] = [];
  for (const tab of TABS) {
    await openTab(page, tab);
    for (const line of await textBelowFloor(page)) found.push(`${tab}: ${line}`);
    const o = await overflow(page);
    expect(o.panel, `${tab} tab panel overflows sideways`).toBeLessThanOrEqual(1);
    expect(o.document, `${tab}: the page overflows sideways`).toBeLessThanOrEqual(1);
  }
  expect([...new Set(found)], `${found.length} text node(s) below ${FLOOR_PX}px`).toEqual([]);
});

for (const route of ["/", "/login", "/forgot-password"]) {
  test(`${route}: no rendered text below 11px, and nothing overflows sideways`, async ({ page, context }) => {
    if (SERVES_EXPORT && route !== "/") {
      // python's http.server has no clean URLs; FastAPI serves /login from login.html.
      await context.route(
        (url) => url.pathname === route,
        (r) => r.fulfill({ path: path.join(__dirname, "..", "out", `${route.slice(1)}.html`), contentType: "text/html" })
      );
    }
    await page.goto(route);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    const found = await textBelowFloor(page);
    expect(found, `${found.length} text node(s) below ${FLOOR_PX}px`).toEqual([]);
    expect((await overflow(page)).document).toBeLessThanOrEqual(1);
  });
}

// ---------------------------------------------------------------------------
// 3. Map: select, clear, switch
// ---------------------------------------------------------------------------

/** The ward the map's hover card names at (x, y), or null. */
async function wardAt(page: Page, x: number, y: number): Promise<string | null> {
  // Off the map first, so the card from the last point is gone (mouseleave).
  await page.mouse.move(2, 2);
  await page.mouse.move(x, y);
  return page.evaluate(() => document.querySelector(".maplibregl-popup-content > div > div:first-child")?.textContent?.trim() ?? null);
}

async function mapBox(page: Page) {
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  if (!box) throw new Error("the map canvas has no box");
  return box;
}

/** A point on the map whose hover card names a ward accepted by `want`, scanning east to west. */
async function findWard(page: Page, want: (name: string) => boolean) {
  const box = await mapBox(page);
  for (let x = box.x + box.width - 16; x > box.x + 16; x -= 22) {
    for (let y = box.y + 16; y < box.y + box.height - 16; y += 22) {
      const name = await wardAt(page, x, y);
      if (name && name.endsWith("区") && want(name)) return { x, y, name };
    }
  }
  return null;
}

async function mapReady(page: Page) {
  await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
  const box = await mapBox(page);
  // The ward layer is up when the centre of the map names a ward.
  await expect
    .poll(async () => (await wardAt(page, box.x + box.width / 2, box.y + box.height / 2)) ?? "", { timeout: 30_000 })
    .toMatch(/区$/);
}

/** Zoom out to the bounds so all 23 wards are on the map. */
async function zoomOut(page: Page) {
  for (let i = 0; i < 2; i++) {
    await page.locator(".maplibregl-ctrl-zoom-out").click();
    await page.waitForTimeout(600);
  }
}

async function expectSelection(page: Page, ward: string | null) {
  await expect(page.locator("header select")).toHaveValue(ward ?? "");
  // The label in the map's top-left corner.
  await expect(page.locator(".map-overlay").first()).toHaveText(ward ?? "全エリア");
}

async function clickSelectedWardAtCentre(page: Page, ward: string) {
  // flyToWard centres the selected ward (800 ms); wait for it to land.
  await page.waitForTimeout(1500);
  const box = await mapBox(page);
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(await wardAt(page, centre.x, centre.y), "the selected ward is not under the map's centre").toBe(ward);
  await page.mouse.click(centre.x, centre.y);
}

test("map: clicking 江戸川区 selects it; clicking it again returns to 全エリア (map label and dropdown)", async ({ page, context }) => {
  await signedInDashboard(context);
  await page.goto("/app");
  await mapReady(page);
  await zoomOut(page);
  const edogawa = await findWard(page, (n) => n === "江戸川区");
  expect(edogawa, "江戸川区 is not on the zoomed-out map").not.toBeNull();
  await page.mouse.click(edogawa!.x, edogawa!.y);
  await expectSelection(page, "江戸川区");

  await clickSelectedWardAtCentre(page, "江戸川区");
  await expectSelection(page, null);
});

test("map: with 江戸川区 selected, clicking another ward switches to it", async ({ page, context }) => {
  await signedInDashboard(context);
  await page.goto("/app");
  await mapReady(page);
  await zoomOut(page);
  const edogawa = await findWard(page, (n) => n === "江戸川区");
  expect(edogawa).not.toBeNull();
  await page.mouse.click(edogawa!.x, edogawa!.y);
  await expectSelection(page, "江戸川区");
  // Selecting flies to 江戸川区 at zoom 13.5, where no neighbour is in view.
  await page.waitForTimeout(1500);
  await zoomOut(page);

  const other = await findWard(page, (n) => n !== "江戸川区");
  expect(other, "no other ward is on the map around 江戸川区").not.toBeNull();
  await page.mouse.click(other!.x, other!.y);
  await expectSelection(page, other!.name);
});

test("map: a ward chosen in the dropdown is cleared by clicking it on the map; the dropdown follows", async ({ page, context }) => {
  await signedInDashboard(context);
  await page.goto("/app");
  await mapReady(page);
  await page.locator("header select").selectOption("江戸川区");
  await expectSelection(page, "江戸川区");

  await clickSelectedWardAtCentre(page, "江戸川区");
  await expectSelection(page, null);
});
