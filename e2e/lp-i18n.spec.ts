import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { LP_COPY } from "../src/i18n/lp";

/**
 * Landing page: JA/EN toggle (ported from landcast tests/e2e/lp-i18n.spec.ts).
 *
 * Runs against the BUILT static export (out/) served by playwright.lp.config.ts,
 * in both projects (1440×900 and 390×844). Each test is one item of the brief:
 *
 *   (a) default render is Japanese, <html lang="ja">, toggle shows JA pressed;
 *       full text snapshot taken
 *   (b) after EN: zero Japanese / CJK / full-width characters in the header,
 *       main and footer (text, aria-label, alt, title); <html lang="en">;
 *       title and meta description are the EN dictionary values
 *   (c) reload keeps EN; localStorage["urbanoracle.lang"] === "en"
 *   (d) /?lang=ja overrides a stored "en" (and is remembered)
 *   (e) switching back to JA restores the (a) snapshot exactly
 *   (f) at 390px no horizontal overflow in either language
 *   (g) toggle: Tab-reachable, immediately left of サインイン, aria-pressed
 *       follows the state, focus indicator measured visible
 *   (h) toggle text contrast, measured on composited pixels: rest / hover /
 *       focus / pressed, light and dark
 *   (i) zero requests to any host but the local server
 *   (j) REPORT ONLY: navigation → first frame showing EN text, 1× and 4× CPU
 *
 * The storage key is the contract string itself; the EN title and description
 * come from the page's own dictionary (src/i18n/lp.ts), not a copy kept here.
 */

const STORAGE_KEY = "urbanoracle.lang";
const TOGGLE = "[data-lang-toggle]";
/** U+3000–303F, U+3040–30FF, U+4E00–9FFF, U+FF01–FF5E, U+FF66–FF9F. */
const CJK = /[　-〿぀-ヿ一-鿿！-～ｦ-ﾟ]/g;

type Rgb = [number, number, number];
type Bitmap = { w: number; h: number; px: number[] };

function toggle(page: Page): Locator {
  return page.locator(TOGGLE);
}

function langButton(page: Page, label: "JA" | "EN"): Locator {
  return toggle(page).getByRole("button", { name: label, exact: true });
}

/** The provider has resolved the language and the toggle is interactive. */
async function ready(page: Page): Promise<void> {
  await expect(page.locator(`${TOGGLE}[data-lang-ready="true"]`)).toBeVisible();
}

async function storedLang(page: Page): Promise<string | null> {
  return page.evaluate((key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return "threw";
    }
  }, STORAGE_KEY);
}

/** Every text node, aria-label, alt and title in the LP header, main and footer, in DOM order. */
async function snapshot(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const root of document.querySelectorAll("header, main, footer")) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
          if (text) out.push(`text:${text}`);
          continue;
        }
        const el = node as Element;
        for (const name of ["aria-label", "alt", "title"]) {
          const value = el.getAttribute(name);
          if (value) out.push(`${name}:${value}`);
        }
      }
    }
    return out;
  });
}

function cjkCount(entries: string[]): { count: number; chars: string } {
  const hits = entries.join("\n").match(CJK) ?? [];
  return { count: hits.length, chars: [...new Set(hits)].join("") };
}

// ---- pixels ---------------------------------------------------------------

/** Decode a PNG in the page (canvas), so no image library is needed here. */
async function decode(page: Page, png: Buffer): Promise<Bitmap> {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { w: bitmap.width, h: bitmap.height, px: Array.from(data) };
  }, png.toString("base64"));
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function rgbAt(bmp: Bitmap, i: number): Rgb {
  return [bmp.px[i * 4], bmp.px[i * 4 + 1], bmp.px[i * 4 + 2]];
}

/**
 * Compare two captures of the same clip that differ in exactly one thing (the
 * text made transparent, or the focus removed). Pixels that changed are the
 * thing; the strongest contrast between a changed pixel and the same pixel
 * without the thing is the contrast of the thing against what it is drawn on.
 */
function changed(withThing: Bitmap, without: Bitmap) {
  let pixels = 0;
  let best = { ratio: 0, fg: [0, 0, 0] as Rgb, bg: [0, 0, 0] as Rgb };
  for (let i = 0; i < withThing.w * withThing.h; i++) {
    const a = rgbAt(withThing, i);
    const b = rgbAt(without, i);
    if (Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) <= 24) continue;
    pixels++;
    const r = contrast(a, b);
    if (r > best.ratio) best = { ratio: r, fg: a, bg: b };
  }
  return { pixels, ...best };
}

async function capture(page: Page, target: Locator, pad = 0): Promise<Bitmap> {
  const box = (await target.boundingBox())!;
  const png = await page.screenshot({
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
    animations: "disabled",
  });
  return decode(page, png);
}

const NO_TRANSITIONS = `${TOGGLE}, ${TOGGLE} * { transition: none !important; animation: none !important; }`;
const HIDE_TEXT = `${TOGGLE} button { color: transparent !important; -webkit-text-fill-color: transparent !important; }`;

async function hiResPage(browser: Browser, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: "ja-JP" });
  return context.newPage();
}

// ---------------------------------------------------------------------------

test.describe("landing page — JA/EN toggle", () => {
  let consoleErrors: string[] = [];

  test.beforeEach(({ page }) => {
    consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e)}`));
  });

  test("(a) default render is Japanese, <html lang=ja>, JA pressed; full text snapshot", async ({ page }, info) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    const snap = await snapshot(page);
    await info.attach("ja-snapshot.json", { body: JSON.stringify(snap, null, 1), contentType: "application/json" });
    expect(cjkCount(snap).count, "the default render is Japanese").toBeGreaterThan(0);
    expect(snap).toContain("text:サインイン");
    await ready(page);
    await expect(langButton(page, "JA")).toHaveAttribute("aria-pressed", "true");
    await expect(langButton(page, "EN")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    console.log(`(a) ${info.project.name}: ${snap.length} snapshot entries`);
  });

  test("(b) EN: zero Japanese in header/main/footer, <html lang=en>, EN title and description", async ({ page }, info) => {
    await page.goto("/");
    await ready(page);
    await langButton(page, "EN").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    const snap = await snapshot(page);
    const { count, chars } = cjkCount(snap);
    await info.attach("en-snapshot.json", { body: JSON.stringify(snap, null, 1), contentType: "application/json" });
    console.log(`(b) ${info.project.name}: CJK/full-width characters after EN = ${count}`);
    expect(count, `Japanese or full-width characters left in EN: ${chars}`).toBe(0);

    const en = LP_COPY.en;
    await expect(page).toHaveTitle(en.metaTitle);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", en.metaDescription);
  });

  test("(c) reload keeps EN; storage holds en", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await langButton(page, "EN").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await ready(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(langButton(page, "EN")).toHaveAttribute("aria-pressed", "true");
    expect(await storedLang(page)).toBe("en");
    expect(consoleErrors.filter((e) => /hydrat/i.test(e)), "hydration errors").toEqual([]);
  });

  test("(d) /?lang=ja overrides a stored en, and is remembered", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((key) => window.localStorage.setItem(key, "en"), STORAGE_KEY);
    await page.goto("/");
    await ready(page);
    await expect(page.locator("html"), "a stored en applies without ?lang=").toHaveAttribute("lang", "en");

    await page.goto("/?lang=ja");
    await ready(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(langButton(page, "JA")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => storedLang(page), { message: "?lang=ja is written to storage" }).toBe("ja");
  });

  test("(e) switching back to JA restores the (a) snapshot exactly", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const before = await snapshot(page);
    const titleBefore = await page.title();
    await langButton(page, "EN").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(await snapshot(page)).not.toEqual(before);
    await langButton(page, "JA").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    expect(await snapshot(page)).toEqual(before);
    expect(await page.title()).toBe(titleBefore);
  });

  test("(f) 390px: no horizontal overflow in either language", async ({ page }, info) => {
    test.skip(page.viewportSize()!.width !== 390, "390px project only");
    await page.goto("/");
    await ready(page);
    const ja = await page.evaluate(() => document.documentElement.scrollWidth);
    await langButton(page, "EN").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const en = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log(`(f) ${info.project.name}: scrollWidth ja=${ja} en=${en}`);
    expect([ja, en]).toEqual([390, 390]);
  });

  test("(g) toggle: Tab-reachable, left of サインイン, aria-pressed, visible focus", async ({ page, browser }, info) => {
    await page.goto("/");
    await ready(page);

    // Placement: in the header, immediately left of the サインイン link.
    const group = toggle(page);
    const signIn = page.locator("header").getByRole("link", { name: "サインイン", exact: true });
    const g = (await group.boundingBox())!;
    const s = (await signIn.boundingBox())!;
    expect(g.x + g.width, "toggle ends before サインイン starts").toBeLessThanOrEqual(s.x);
    expect(Math.abs(g.y + g.height / 2 - (s.y + s.height / 2)), "same row").toBeLessThanOrEqual(4);
    expect(
      await group.evaluate((el) => el.nextElementSibling?.matches('a[href="/login"]') ?? false),
      "the next element after the toggle is the サインイン link"
    ).toBe(true);

    // Keyboard: the first Tab stops land on the toggle, and Space/Enter operate it.
    let presses = 0;
    for (; presses < 4; presses++) {
      await page.keyboard.press("Tab");
      if (await langButton(page, "JA").evaluate((el) => el === document.activeElement)) break;
    }
    expect(presses + 1, "Tab presses to reach the toggle").toBeLessThanOrEqual(2);
    await page.keyboard.press("Tab");
    await expect(langButton(page, "EN")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(langButton(page, "EN")).toHaveAttribute("aria-pressed", "true");
    await expect(langButton(page, "JA")).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(langButton(page, "JA")).toHaveAttribute("aria-pressed", "true");
    await expect(langButton(page, "EN")).toHaveAttribute("aria-pressed", "false");

    // Focus indicator, measured: focused vs blurred capture of the toggle.
    const hi = await hiResPage(browser, page.viewportSize()!.width, page.viewportSize()!.height);
    await hi.goto("/");
    await ready(hi);
    await hi.addStyleTag({ content: NO_TRANSITIONS });
    const results: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      await hi.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark");
      for (const label of ["JA", "EN"] as const) {
        const button = langButton(hi, label);
        await button.focus();
        expect(await button.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
        const focused = await capture(hi, toggle(hi), 6);
        await button.evaluate((el) => (el as HTMLElement).blur());
        const blurred = await capture(hi, toggle(hi), 6);
        const ring = changed(focused, blurred);
        results.push(`${theme} ${label}: ring ${ring.pixels}px, ${ring.ratio.toFixed(2)}:1 rgb(${ring.fg}) on rgb(${ring.bg})`);
        expect(ring.pixels, `${theme} ${label}: focus changes nothing visible`).toBeGreaterThan(40);
        expect(ring.ratio, `${theme} ${label}: focus indicator contrast`).toBeGreaterThanOrEqual(3);
      }
    }
    await hi.context().close();
    console.log(`(g) ${info.project.name}: ${results.join(" | ")}`);
  });

  test("(h) toggle text contrast on composited pixels: rest, hover, focus, pressed; both themes", async ({ page, browser }, info) => {
    const hi = await hiResPage(browser, page.viewportSize()!.width, page.viewportSize()!.height);
    await hi.goto("/");
    await ready(hi);
    await hi.addStyleTag({ content: NO_TRANSITIONS });

    const rows: string[] = [];
    let worst = Infinity;
    for (const theme of ["light", "dark"] as const) {
      await hi.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark");
      for (const label of ["JA", "EN"] as const) {
        const button = langButton(hi, label);
        const pressed = (await button.getAttribute("aria-pressed")) === "true";
        for (const state of ["rest", "hover", "focus"] as const) {
          await hi.mouse.move(0, 0);
          await hi.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
          if (state === "hover") await button.hover();
          if (state === "focus") {
            await button.focus();
            expect(await button.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
          }
          const withText = await capture(hi, button);
          const hide = await hi.addStyleTag({ content: HIDE_TEXT });
          const withoutText = await capture(hi, button);
          await hide.evaluate((el) => (el as Element).remove());
          const text = changed(withText, withoutText);
          const name = `${theme} ${label}${pressed ? " (pressed)" : ""} ${state}`;
          rows.push(`${name}: ${text.ratio.toFixed(2)}:1 rgb(${text.fg}) on rgb(${text.bg}), ${text.pixels} glyph px`);
          expect(text.pixels, `${name}: no glyph pixels found`).toBeGreaterThan(20);
          expect(text.ratio, `${name}: text contrast`).toBeGreaterThanOrEqual(4.5);
          worst = Math.min(worst, text.ratio);
        }
      }
    }
    await hi.context().close();
    await info.attach("toggle-contrast.txt", { body: rows.join("\n"), contentType: "text/plain" });
    console.log(`(h) ${info.project.name}: worst ${worst.toFixed(2)}:1\n  ${rows.join("\n  ")}`);
  });

  test("(i) zero requests to any host but the local server", async ({ page, baseURL }, info) => {
    const local = new URL(baseURL!).host;
    const foreign: string[] = [];
    let total = 0;
    await page.context().route("**/*", (route) => {
      total++;
      const url = new URL(route.request().url());
      if (url.host === local || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
      foreign.push(url.href);
      return route.abort();
    });
    await page.goto("/");
    await ready(page);
    await langButton(page, "EN").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await ready(page);
    await page.goto("/?lang=ja");
    await ready(page);
    console.log(`(i) ${info.project.name}: ${total} requests, ${foreign.length} to other hosts`);
    expect(foreign).toEqual([]);
  });

  test("(j) REPORT ONLY: navigation → first frame showing EN text, 1× and 4× CPU", async ({ browser, page }, info) => {
    test.skip(page.viewportSize()!.width !== 1440, "measured once, on the desktop project");
    // Report only: it must not fail when EN never shows (it then reports null),
    // so the budget covers every run waiting out its full 10s.
    test.setTimeout(180_000);
    const en = LP_COPY.en;
    const ja = LP_COPY.ja;
    const RUNS = 5;
    const report: Record<string, { firstJa: number | null; firstEn: number | null; fcp: number | null }[]> = {};

    for (const rate of [1, 4]) {
      report[`${rate}x`] = [];
      for (let run = 0; run < RUNS; run++) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ja-JP" });
        const p = await context.newPage();
        await p.addInitScript(
          ({ key, enMark, jaMark }) => {
            try {
              window.localStorage.setItem(key, "en");
            } catch {}
            const w = window as unknown as Record<string, unknown>;
            w.__firstJa = null;
            w.__firstEn = null;
            const tick = () => {
              const h1 = document.querySelector("h1")?.textContent ?? "";
              if (w.__firstJa === null && h1.includes(jaMark)) w.__firstJa = performance.now();
              if (h1.includes(enMark)) {
                w.__firstEn = performance.now();
                return;
              }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          },
          { key: STORAGE_KEY, enMark: en.heroTitle1, jaMark: ja.heroTitle1 }
        );
        const cdp = await context.newCDPSession(p);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate });
        await p.goto("/", { waitUntil: "load" });
        await p.waitForFunction(() => (window as unknown as { __firstEn: number | null }).__firstEn !== null, null, {
          timeout: 10_000,
        }).catch(() => undefined);
        report[`${rate}x`].push(
          await p.evaluate(() => {
            const w = window as unknown as { __firstJa: number | null; __firstEn: number | null };
            const fcp = performance.getEntriesByName("first-contentful-paint")[0];
            return { firstJa: w.__firstJa, firstEn: w.__firstEn, fcp: fcp ? fcp.startTime : null };
          })
        );
        await context.close();
      }
    }
    const median = (values: (number | null)[]) => {
      const sorted = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
      return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    };
    const summary = Object.fromEntries(
      Object.entries(report).map(([rate, runs]) => [
        rate,
        { medianFirstEn: median(runs.map((r) => r.firstEn)), medianFcp: median(runs.map((r) => r.fcp)), runs: runs.length },
      ])
    );
    await info.attach("first-paint.json", { body: JSON.stringify({ summary, report }, null, 1), contentType: "application/json" });
    console.log(`(j) ${JSON.stringify({ summary, report })}`);
  });
});
