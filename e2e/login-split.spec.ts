import { readFileSync } from "node:fs";
import path from "node:path";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { AUTH_COPY } from "../src/i18n/auth";

/**
 * The split sign-in screens (/login, /pending) and the translated
 * /forgot-password, against the BUILT static export (playwright.login.config.ts).
 *
 *   L1 split and breakpoint      L2 form-column order       L3 keyboard
 *   L4 mode rules                L5 panel motion            L6 panel truth
 *   L7 language                  L10 identity (every test, via the fixture)
 *
 * python3's http.server does not map clean URLs, so the routes are loaded as
 * /login.html, /pending.html and /forgot-password.html. /pending renders
 * without a session: Firebase has none, and every identity request is aborted.
 */

const LOGIN = "/login.html";
const PENDING = "/pending.html";
const FORGOT = "/forgot-password.html";
const STORAGE_KEY = "urbanoracle.lang";
const IDENTITY = /(^|\.)(identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|www\.googleapis\.com|firebaseapp\.com)$/;
/** Landcast's numeral class: ASCII and full-width digits, kanji numerals. */
const NUMERAL = /[0-9０-９〇一二三四五六七八九十百千万億兆]/u;
/** U+3000–303F, U+3040–30FF, U+4E00–9FFF, U+FF01–FF5E, U+FF66–FF9F. */
const CJK = /[　-〿぀-ヿ一-鿿！-～ｦ-ﾟ]/g;
const JA = AUTH_COPY.ja;
const EN = AUTH_COPY.en;

type Tally = { seen: number; intercepted: number };

/** L10: every test runs with the identity hosts aborted; none may escape. */
const test = base.extend<{ identity: Tally }>({
  identity: [
    async ({ context }, use, info) => {
      const tally: Tally = { seen: 0, intercepted: 0 };
      context.on("request", (request) => {
        if (IDENTITY.test(new URL(request.url()).hostname)) tally.seen++;
      });
      await context.route(
        (url) => IDENTITY.test(url.hostname),
        (route) => {
          tally.intercepted++;
          return route.abort();
        }
      );
      await use(tally);
      const escaped = tally.seen - tally.intercepted;
      console.log(`[identity] ${info.title}: seen=${tally.seen} intercepted=${tally.intercepted} escaped=${escaped}`);
      expect(escaped, "identity requests escaped").toBe(0);
    },
    { auto: true },
  ],
});

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, `${locator} has no box`).not.toBeNull();
  return b!;
}

async function ready(page: Page): Promise<void> {
  await expect(page.locator('[data-lang-toggle][data-lang-ready="true"]')).toBeVisible();
}

async function open(page: Page, route: string, size: { width: number; height: number } = { width: 1440, height: 900 }) {
  await page.setViewportSize(size);
  await page.goto(route, { waitUntil: "networkidle" });
  await ready(page);
}

async function signUpMode(page: Page) {
  await page.locator("[data-auth-mode-toggle]").click();
  await expect(page.locator('input[type="password"]')).toHaveAttribute("autocomplete", "new-password");
}

async function panelIndex(page: Page): Promise<string | null> {
  return page.locator("[data-auth-panel]").getAttribute("data-panel-index");
}

/** Text, aria-label, alt, title and placeholder of everything under `root`. */
async function readable(page: Page, root = "body"): Promise<string[]> {
  return page.evaluate((selector) => {
    const out: string[] = [];
    const base = document.querySelector(selector);
    if (!base) return out;
    const walker = document.createTreeWalker(base, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.parentElement?.closest("script,style,noscript,template")) continue;
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text) out.push(text);
        continue;
      }
      for (const name of ["aria-label", "alt", "title", "placeholder"]) {
        const value = (node as Element).getAttribute(name);
        if (value) out.push(value);
      }
    }
    return out;
  }, root);
}

// ---------------------------------------------------------------------------
// L1 split and breakpoint
// ---------------------------------------------------------------------------

for (const route of [LOGIN, PENDING]) {
  test(`L1 ${route}: form left / panel right 50/50 with one boundary from 1080px; removed below; 390 fits`, async ({ page }) => {
    for (const size of [
      { width: 2560, height: 1400 },
      { width: 1440, height: 900 },
      { width: 1080, height: 800 },
    ]) {
      await open(page, route, size);
      const form = await box(page.locator("[data-auth-form]"));
      const panel = await box(page.locator("[data-auth-panel]"));
      const tag = `${route} ${size.width}x${size.height}`;
      console.log(`[L1] ${tag}: form x=${form.x} w=${form.width}; panel x=${panel.x} w=${panel.width} h=${panel.height}`);
      expect(form.x, `${tag}: form starts at the left edge`).toBe(0);
      expect(form.x + form.width, `${tag}: form ends where the panel starts`).toBeLessThanOrEqual(panel.x + 1);
      expect(Math.abs(form.width - size.width / 2), `${tag}: form is half`).toBeLessThanOrEqual(1);
      expect(Math.abs(panel.width - size.width / 2), `${tag}: panel is half`).toBeLessThanOrEqual(1);
      expect(Math.round(panel.x + panel.width), `${tag}: panel ends at the right edge`).toBe(size.width);
      expect(panel.y, `${tag}: boundary starts at the top`).toBe(0);
      expect(panel.height, `${tag}: boundary runs to the bottom`).toBeGreaterThanOrEqual(size.height);
      const borders = await page.evaluate(() => {
        const f = getComputedStyle(document.querySelector("[data-auth-form]")!);
        const p = getComputedStyle(document.querySelector("[data-auth-panel]")!);
        return {
          formRight: f.borderRightWidth,
          formLeft: f.borderLeftWidth,
          panelLeft: p.borderLeftWidth,
          panelRight: p.borderRightWidth,
          panelLeftStyle: p.borderLeftStyle,
        };
      });
      expect(borders, `${tag}: exactly one 1px boundary, the panel's left edge`).toEqual({
        formRight: "0px",
        formLeft: "0px",
        panelLeft: "1px",
        panelRight: "0px",
        panelLeftStyle: "solid",
      });
    }

    await open(page, route, { width: 1079, height: 800 });
    await expect(page.locator("[data-auth-panel]")).toBeHidden();
    expect((await box(page.locator("[data-auth-form]"))).width, `${route} 1079: form is full width`).toBe(1079);

    await open(page, route, { width: 390, height: 844 });
    await expect(page.locator("[data-auth-panel]")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${route} 390: no horizontal overflow`).toBe(390);
  });
}

// ---------------------------------------------------------------------------
// L2 order, L3 keyboard, L4 mode rules
// ---------------------------------------------------------------------------

const SIGN_IN_ORDER = [
  "[data-auth-wordmark]",
  "[data-auth-subtitle]",
  'input[type="email"]',
  'input[type="password"]',
  'button[type="submit"]',
  "[data-auth-divider]",
  "[data-auth-google]",
  "[data-auth-mode-toggle]",
  'a[href="/forgot-password"]',
  "[data-auth-about]",
];
const SIGN_UP_ORDER = [
  "[data-auth-wordmark]",
  "[data-auth-subtitle]",
  'input[type="email"]',
  'input[type="password"]',
  '[data-check="length"]',
  'button[type="submit"]',
  "[data-auth-divider]",
  "[data-auth-google]",
  "[data-auth-mode-toggle]",
  "[data-auth-footnote]",
  "[data-auth-about]",
];

async function assertOrder(page: Page, selectors: string[], mode: string) {
  const result = await page.evaluate((list) => {
    const els = list.map((s) => document.querySelector(s));
    const missing = list.filter((_, i) => !els[i]);
    if (missing.length) return { missing, dom: false, visual: false, tops: [] as number[] };
    const dom = els.every((el, i) => i === 0 || !!(els[i - 1]!.compareDocumentPosition(el!) & Node.DOCUMENT_POSITION_FOLLOWING));
    const tops = els.map((el) => Math.round(el!.getBoundingClientRect().top));
    const visual = tops.every((t, i) => i === 0 || t > tops[i - 1]);
    return { missing, dom, visual, tops };
  }, selectors);
  expect(result.missing, `${mode}: elements present`).toEqual([]);
  expect(result.dom, `${mode}: DOM order`).toBe(true);
  expect(result.visual, `${mode}: visual order top → bottom (${result.tops.join(", ")})`).toBe(true);
}

test("L2 /login: form column order in both modes; wordmark, subtitle, labels, placeholders; no ACCESS", async ({ page }) => {
  await open(page, LOGIN);
  await assertOrder(page, SIGN_IN_ORDER, "sign-in");
  await expect(page.locator("[data-auth-wordmark]")).toHaveText(JA.brand);
  expect(await page.locator("[data-auth-wordmark]").evaluate((el) => el.tagName)).toBe("H1");
  await expect(page.locator("[data-auth-subtitle]")).toHaveText(JA.subtitle);
  await expect(page.getByLabel(JA.emailLabel)).toHaveAttribute("placeholder", JA.emailPlaceholder);
  await expect(page.getByLabel(JA.passwordLabel)).toHaveAttribute("placeholder", JA.passwordPlaceholder);
  await expect(page.locator('button[type="submit"]')).toHaveText(JA.submitSignIn);
  await expect(page.locator("[data-auth-divider]")).toHaveText(JA.or);
  // The way back to the landing page: the same link /pending has.
  await expect(page.locator("[data-auth-about]")).toHaveText(JA.aboutLink);
  await expect(page.locator("[data-auth-about]")).toHaveAttribute("href", "/");
  expect(await page.locator("body").innerText()).not.toContain("ACCESS");
  expect(await page.getByRole("heading", { level: 2 }).count(), "no 「サインイン」 h2").toBe(0);

  await signUpMode(page);
  await assertOrder(page, SIGN_UP_ORDER, "sign-up");
  await expect(page.locator('button[type="submit"]')).toHaveText(JA.submitSignUp);
  expect(await page.locator("body").innerText()).not.toContain("ACCESS");
});

test("L2 /pending: wordmark and subtitle, then the verification content in its order; the escape hatch is DOM-last", async ({ page }) => {
  await open(page, PENDING);
  await assertOrder(page, ["[data-auth-wordmark]", "[data-auth-subtitle]", "[data-auth-verify-title]", "[data-auth-verify-check]", "[data-auth-divider]", "[data-auth-verify-resend]"], "pending");
  await expect(page.locator("[data-auth-wordmark]")).toHaveText(JA.brand);
  await expect(page.locator("[data-auth-subtitle]")).toHaveText(JA.subtitle);
  for (const removed of ["あと一歩で、", "計器が開きます。", "審査はありません"]) {
    expect(await page.locator("body").innerText(), `dropped: ${removed}`).not.toContain(removed);
  }
});

test("L3 keyboard: the first Tab lands on the email field, the back-link follows the register and forgot links; the panel has 0 focusable elements", async ({ page }) => {
  await open(page, LOGIN);
  const name = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return "body";
      for (const attr of ["data-auth-google", "data-auth-mode-toggle", "data-auth-about"]) if (el.hasAttribute(attr)) return attr;
      if (el instanceof HTMLInputElement) return `input:${el.type}`;
      if (el.getAttribute("href") === "/forgot-password") return "forgot";
      if (el.closest("[data-lang-toggle]")) return `lang:${el.textContent}`;
      return `${el.tagName.toLowerCase()}[type=${el.getAttribute("type")}]`;
    });
  const order: string[] = [];
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press("Tab");
    order.push(await name());
  }
  console.log(`[L3] /login Tab order: ${order.join(" → ")}`);
  expect(order).toEqual([
    "input:email",
    "input:password",
    "button[type=submit]",
    "data-auth-google",
    "data-auth-mode-toggle",
    "forgot",
    "data-auth-about",
    "lang:JA",
    "lang:EN",
  ]);
  for (const route of [LOGIN, PENDING]) {
    await open(page, route);
    const panel = page.locator("[data-auth-panel]");
    await expect(panel).toHaveAttribute("aria-hidden", "true");
    const focusables = await panel.evaluate(
      (el) => el.querySelectorAll('a[href], button, input, select, textarea, [tabindex], [contenteditable]').length
    );
    expect(focusables, `${route}: focusable elements in the panel`).toBe(0);
  }
});

test("L4 mode rules: one Google label in both modes; forgot link in sign-in only; footnote in sign-up only", async ({ page }) => {
  await open(page, LOGIN);
  await expect(page.locator("[data-auth-google]")).toHaveText(JA.googleSignIn);
  await expect(page.locator('a[href="/forgot-password"]')).toHaveText(JA.forgotLink);
  await expect(page.locator("[data-auth-footnote]")).toHaveCount(0);
  await signUpMode(page);
  await expect(page.locator("[data-auth-google]")).toHaveText(JA.googleSignIn);
  await expect(page.locator('a[href="/forgot-password"]')).toHaveCount(0);
  await expect(page.locator("[data-auth-footnote]")).toHaveText(JA.accountNote);
  await expect(page.locator("[data-auth-build]")).toHaveText(/^BUILD \S+$/);
});

// ---------------------------------------------------------------------------
// L5 panel motion
// ---------------------------------------------------------------------------

const INTERVAL_MS = 5200;

async function awayFromPanel(page: Page) {
  // Over the form half's empty top-left corner: not the panel, nothing focusable.
  await page.mouse.move(8, 8);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function waitForAdvance(page: Page, from: string | null, timeout: number): Promise<number> {
  const started = Date.now();
  await expect.poll(() => panelIndex(page), { timeout, intervals: [50] }).not.toBe(from);
  return Date.now() - started;
}

test("L5 motion: advances every 5200ms with a 240ms fade out then a 240ms fade in", async ({ page }) => {
  await open(page, LOGIN);
  await awayFromPanel(page);
  const first = await panelIndex(page);
  await waitForAdvance(page, first, INTERVAL_MS + 1500);
  const second = await panelIndex(page);
  const gap = await waitForAdvance(page, second, INTERVAL_MS + 1500);
  console.log(`[L5] measured interval between advances: ${gap}ms`);
  expect(Math.abs(gap - INTERVAL_MS), "interval").toBeLessThanOrEqual(300);

  const timing = await page.evaluate(() => {
    const slides = [...document.querySelectorAll<HTMLElement>("[data-auth-slide]")];
    const active = slides.find((s) => s.dataset.active === "true")!;
    const inactive = slides.find((s) => s.dataset.active !== "true")!;
    const t = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      return { property: cs.transitionProperty, duration: cs.transitionDuration, delay: cs.transitionDelay };
    };
    return { in: t(active), out: t(inactive), dots: document.querySelectorAll("[data-auth-dot]").length };
  });
  console.log(`[L5] fade in ${JSON.stringify(timing.in)} out ${JSON.stringify(timing.out)}`);
  expect(timing.out).toMatchObject({ property: "opacity", duration: "0.24s", delay: "0s" });
  expect(timing.in.property).toBe("opacity");
  expect(timing.in.duration).toBe("0.24s");
  expect(parseFloat(timing.in.delay), "fade in starts after the fade out ends").toBeGreaterThanOrEqual(0.24);
  expect(timing.dots).toBe(3);
});

test("L5 pause: hover over the panel, focus within the shell, and a hidden tab each stop the advance", async ({ page }) => {
  await open(page, LOGIN);
  await awayFromPanel(page);
  const hold = async (label: string) => {
    const at = await panelIndex(page);
    await page.waitForTimeout(INTERVAL_MS + 900);
    expect(await panelIndex(page), `${label}: no advance`).toBe(at);
    return at;
  };

  const panel = await box(page.locator("[data-auth-panel]"));
  await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2);
  const hovered = await hold("hover over the panel");
  await awayFromPanel(page);
  await waitForAdvance(page, hovered, INTERVAL_MS + 1500);

  await page.locator('input[type="email"]').focus();
  const focused = await hold("focus within the shell");
  await awayFromPanel(page);
  await waitForAdvance(page, focused, INTERVAL_MS + 1500);

  await page.evaluate(() => Object.defineProperty(document, "hidden", { configurable: true, get: () => true }));
  const hidden = await hold("hidden tab");
  await page.evaluate(() => Object.defineProperty(document, "hidden", { configurable: true, get: () => false }));
  await waitForAdvance(page, hidden, INTERVAL_MS + 1500);
});

test("L5 reduced motion: slide A only, static, no dots, 0s animation duration and delay on every panel element", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, LOGIN);
  await awayFromPanel(page);
  await expect(page.locator("[data-auth-panel]")).toHaveAttribute("data-reduced-motion", "true");
  expect(await panelIndex(page)).toBe("0");
  await expect(page.locator('[data-auth-slide][data-active="true"]')).toHaveAttribute("data-slide-id", "A");
  await page.waitForTimeout(INTERVAL_MS + 900);
  expect(await panelIndex(page), "static").toBe("0");
  await expect(page.locator("[data-auth-dot]")).toHaveCount(0);
  const timings = await page.evaluate(() => {
    const els = [document.querySelector("[data-auth-panel]")!, ...document.querySelectorAll("[data-auth-panel] *")];
    const bad = els
      .map((el) => getComputedStyle(el))
      .filter((cs) => cs.animationDuration.split(",").some((d) => d.trim() !== "0s") || cs.animationDelay.split(",").some((d) => d.trim() !== "0s"));
    return { elements: els.length, bad: bad.length };
  });
  console.log(`[L5] reduced motion: ${timings.elements} panel elements, ${timings.bad} with non-zero animation duration or delay`);
  expect(timings.bad).toBe(0);
});

test("L5 ghosting and height: sampled every 20ms across transitions, never two slides at once, constant height", async ({ page }) => {
  await open(page, LOGIN);
  await awayFromPanel(page);
  const samples = await page.evaluate(
    async ({ every, span }) => {
      const out: { visible: number; height: number }[] = [];
      const end = performance.now() + span;
      while (performance.now() < end) {
        const slides = [...document.querySelectorAll<HTMLElement>("[data-auth-slide]")];
        out.push({
          visible: slides.filter((s) => parseFloat(getComputedStyle(s).opacity) > 0.01).length,
          height: Math.round(document.querySelector("[data-auth-stage]")!.getBoundingClientRect().height),
        });
        await new Promise((r) => setTimeout(r, every));
      }
      return out;
    },
    { every: 20, span: INTERVAL_MS * 2 + 1200 }
  );
  const ghost = samples.filter((s) => s.visible > 1).length;
  const heights = [...new Set(samples.map((s) => s.height))];
  const transitions = samples.filter((s) => s.visible === 0).length;
  console.log(`[L5] ghosting: ${samples.length} frames sampled, ${ghost} with two slides, ${transitions} between slides; heights ${heights.join(",")}`);
  expect(transitions, "the window covered at least one transition").toBeGreaterThan(0);
  expect(ghost).toBe(0);
  expect(heights).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// L6 panel truth (runtime; the static check is in src/__tests__/auth/)
// ---------------------------------------------------------------------------

for (const lang of ["ja", "en"] as const) {
  test(`L6 panel truth (${lang}): no numeral anywhere in the rendered panel, no 再現 / "recreat", the label on every slide`, async ({ page }) => {
    await open(page, `${LOGIN}?lang=${lang}`);
    const t = AUTH_COPY[lang];
    const found = await page.evaluate(() => {
      const panel = document.querySelector("[data-auth-panel]")!;
      const out: string[] = [];
      for (const el of [panel, ...panel.querySelectorAll("*")]) {
        for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) out.push(node.textContent);
        for (const attr of el.getAttributeNames()) {
          if (["aria-label", "title", "alt", "aria-description"].includes(attr)) out.push(el.getAttribute(attr) ?? "");
        }
        for (const pseudo of ["::before", "::after"]) {
          const content = getComputedStyle(el, pseudo).content;
          if (content && content !== "none" && content !== "normal") out.push(content);
        }
      }
      const svgText = panel.querySelectorAll("svg text, svg title, svg desc").length;
      const slides = [...panel.querySelectorAll("[data-auth-slide]")].map((s) => s.querySelector("[data-auth-label]")?.textContent ?? "");
      return { out, svgText, slides };
    });
    const numerals = found.out.join("\n").match(new RegExp(NUMERAL.source, "gu")) ?? [];
    console.log(`[L6] ${lang}: ${found.out.length} text-bearing items in the panel, ${numerals.length} numerals, ${found.svgText} svg text`);
    expect(numerals).toEqual([]);
    expect(found.svgText).toBe(0);
    expect(found.out.join("\n")).not.toContain("再現");
    expect(found.out.join("\n").toLowerCase()).not.toContain("recreat");
    expect(found.slides).toEqual([t.panelLabel, t.panelLabel, t.panelLabel]);
  });
}

// ---------------------------------------------------------------------------
// L7 language
// ---------------------------------------------------------------------------

async function storeEn(page: Page) {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, "en");
    } catch {}
  }, STORAGE_KEY);
}

test("L7 /login and /pending follow urbanoracle.lang and ?lang=; the toggle switches", async ({ page }) => {
  for (const route of [LOGIN, PENDING]) {
    await open(page, route);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.locator("[data-auth-subtitle]")).toHaveText(JA.subtitle);
    await page.locator("[data-lang-toggle]").getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("[data-auth-subtitle]")).toHaveText(EN.subtitle);
    expect(await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY)).toBe("en");
    await open(page, `${route}?lang=ja`);
    await expect(page.locator("[data-auth-subtitle]")).toHaveText(JA.subtitle);
    await open(page, `${route}?lang=en`);
    await expect(page.locator("[data-auth-subtitle]")).toHaveText(EN.subtitle);
    await page.evaluate((k) => window.localStorage.removeItem(k), STORAGE_KEY);
  }
});

test("L7 English: zero Japanese / full-width characters on /login (both modes), /pending and /forgot-password", async ({ page }) => {
  await storeEn(page);
  const counts: Record<string, number> = {};
  const check = async (name: string) => {
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const hits = (await readable(page)).join("\n").match(CJK) ?? [];
    counts[name] = hits.length;
    expect(hits.join(""), `${name}: Japanese left in English`).toBe("");
  };
  await open(page, LOGIN);
  await check("/login sign-in");
  await signUpMode(page);
  await check("/login sign-up");
  await open(page, PENDING);
  await check("/pending");
  await page.goto(FORGOT, { waitUntil: "networkidle" });
  await check("/forgot-password");
  await expect(page.locator("[data-lang-toggle]"), "/forgot-password has no toggle").toHaveCount(0);
  console.log(`[L7] CJK characters under EN: ${JSON.stringify(counts)}`);
});

// ---------------------------------------------------------------------------
// Source checks that belong with the screens
// ---------------------------------------------------------------------------

test("/forgot-password keeps its single-column layout (no shell, no panel)", async ({ page }) => {
  await page.goto(FORGOT, { waitUntil: "networkidle" });
  await expect(page.locator("[data-auth-shell]")).toHaveCount(0);
  await expect(page.locator("[data-auth-panel]")).toHaveCount(0);
  const source = readFileSync(path.join(process.cwd(), "src/app/forgot-password/page.tsx"), "utf8");
  expect(source).not.toContain("AuthShell");
});
