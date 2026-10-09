import { test as base, expect, type Locator, type Page } from "@playwright/test";

/**
 * L8 — rendered text contrast on the split sign-in screens, measured on
 * COMPOSITED PIXELS (not tokens), against the built export.
 *
 * For every visible element that carries text, the element is captured twice:
 * as rendered, and with its text made transparent. Pixels that changed are
 * glyph pixels; the strongest contrast between a glyph pixel and the same
 * pixel without the glyph is the text's contrast against what it is drawn on.
 * Placeholders are measured the same way with ::placeholder made transparent.
 *
 * States: /login sign-in at rest, sign-up at rest, placeholders, hover and
 * focus of every control, disabled buttons, the error message; /pending at
 * rest; each of the three panel slides. Light and dark themes, ja and en.
 * Everything must be AA (4.5:1). Identity hosts are aborted; none may escape.
 */

const LOGIN = "/login.html";
const PENDING = "/pending.html";
const AA = 4.5;
const IDENTITY = /(^|\.)(identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|www\.googleapis\.com|firebaseapp\.com)$/;

type Tally = { seen: number; intercepted: number };
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
test.use({ deviceScaleFactor: 2, viewport: { width: 1440, height: 900 } });

type Rgb = [number, number, number];
type Bitmap = { w: number; h: number; px: number[] };
type Row = { screen: string; state: string; what: string; ratio: number; glyphs: number; fg: Rgb; bg: Rgb };

const MARK = "data-contrast-target";
const NO_MOTION = "*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }";

async function decode(page: Page, png: Buffer): Promise<Bitmap> {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    return { w: bitmap.width, h: bitmap.height, px: Array.from(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data) };
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

function glyphContrast(withText: Bitmap, without: Bitmap) {
  let glyphs = 0;
  let best = { ratio: 0, fg: [0, 0, 0] as Rgb, bg: [0, 0, 0] as Rgb };
  for (let i = 0; i < withText.w * withText.h; i++) {
    const a: Rgb = [withText.px[i * 4], withText.px[i * 4 + 1], withText.px[i * 4 + 2]];
    const b: Rgb = [without.px[i * 4], without.px[i * 4 + 1], without.px[i * 4 + 2]];
    if (Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) <= 24) continue;
    glyphs++;
    const r = contrast(a, b);
    if (r > best.ratio) best = { ratio: r, fg: a, bg: b };
  }
  return { glyphs, ...best };
}

async function clipOf(target: Locator) {
  const b = (await target.boundingBox())!;
  return { x: Math.max(0, b.x - 1), y: Math.max(0, b.y - 1), width: b.width + 2, height: b.height + 2 };
}

/** Measure one element's own text (or its placeholder) on composited pixels. */
async function measure(page: Page, target: Locator, hide: "text" | "placeholder"): Promise<ReturnType<typeof glyphContrast>> {
  await target.evaluate((el, mark) => el.setAttribute(mark, ""), MARK);
  const clip = await clipOf(target);
  const withText = await decode(page, await page.screenshot({ clip }));
  const css =
    hide === "text"
      ? `[${MARK}], [${MARK}] * { color: transparent !important; -webkit-text-fill-color: transparent !important; }`
      : `[${MARK}]::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; }`;
  const style = await page.addStyleTag({ content: css });
  const without = await decode(page, await page.screenshot({ clip }));
  await style.evaluate((el) => (el as Element).remove());
  await target.evaluate((el, mark) => el.removeAttribute(mark), MARK);
  return glyphContrast(withText, without);
}

/** Every visible element under `root` with a direct, non-empty text node. */
async function textElements(page: Page, root: string): Promise<Locator[]> {
  const count = await page.evaluate((selector) => {
    // Marks left by an earlier root would collide with this root's indices.
    for (const el of document.querySelectorAll("[data-contrast-index]")) el.removeAttribute("data-contrast-index");
    let n = 0;
    for (const el of document.querySelectorAll(`${selector}, ${selector} *`)) {
      const own = [...el.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent!.trim());
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (own && r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0) {
        el.setAttribute("data-contrast-index", String(n++));
      } else el.removeAttribute("data-contrast-index");
    }
    return n;
  }, root);
  return Array.from({ length: count }, (_, i) => page.locator(`[data-contrast-index="${i}"]`));
}

async function label(target: Locator): Promise<string> {
  return target.evaluate((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 32)}"`);
}

async function open(page: Page, route: string, theme: "light" | "dark") {
  await page.goto(route, { waitUntil: "networkidle" });
  await expect(page.locator('[data-lang-toggle][data-lang-ready="true"]')).toBeVisible();
  await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark");
  await page.addStyleTag({ content: NO_MOTION });
  await page.mouse.move(2, 2);
}

async function measureAll(page: Page, rows: Row[], screen: string, state: string, root: string) {
  for (const el of await textElements(page, root)) {
    const r = await measure(page, el, "text");
    rows.push({ screen, state, what: await label(el), ratio: r.ratio, glyphs: r.glyphs, fg: r.fg, bg: r.bg });
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const lang of ["ja", "en"] as const) {
    test(`L8 contrast ${theme} ${lang}: every text node on /login, /pending and the panel is AA`, async ({ page }, info) => {
      test.setTimeout(240_000);
      const rows: Row[] = [];
      const q = `?lang=${lang}`;

      // /login sign-in at rest (form half + toggle + BUILD).
      await open(page, LOGIN + q, theme);
      await measureAll(page, rows, "/login", "sign-in rest", "[data-auth-form]");

      // Placeholders.
      for (const input of ['input[type="email"]', 'input[type="password"]']) {
        const r = await measure(page, page.locator(input), "placeholder");
        rows.push({ screen: "/login", state: "placeholder", what: input, ratio: r.ratio, glyphs: r.glyphs, fg: r.fg, bg: r.bg });
      }

      // Hover and focus of every control in the form half.
      const controls = page.locator("[data-auth-form] button, [data-auth-form] a[href]");
      const n = await controls.count();
      for (let i = 0; i < n; i++) {
        const c = controls.nth(i);
        await c.hover();
        let r = await measure(page, c, "text");
        rows.push({ screen: "/login", state: "hover", what: await label(c), ratio: r.ratio, glyphs: r.glyphs, fg: r.fg, bg: r.bg });
        await page.mouse.move(2, 2);
        await c.focus();
        r = await measure(page, c, "text");
        rows.push({ screen: "/login", state: "focus", what: await label(c), ratio: r.ratio, glyphs: r.glyphs, fg: r.fg, bg: r.bg });
        await c.evaluate((el) => (el as HTMLElement).blur());
      }

      // Disabled: the two buttons a pending request disables.
      for (const sel of ['button[type="submit"]', "[data-auth-google]"]) {
        const b = page.locator(sel);
        await b.evaluate((el) => el.setAttribute("disabled", ""));
        const r = await measure(page, b, "text");
        rows.push({ screen: "/login", state: "disabled", what: await label(b), ratio: r.ratio, glyphs: r.glyphs, fg: r.fg, bg: r.bg });
        await b.evaluate((el) => el.removeAttribute("disabled"));
      }

      // Sign-up at rest (checklist, footnote), then the error message.
      await page.locator("[data-auth-mode-toggle]").click();
      await measureAll(page, rows, "/login", "sign-up rest", "[data-auth-form]");
      await page.locator('input[type="email"]').fill("a@example.com");
      await page.locator('input[type="password"]').fill("short");
      await page.locator('button[type="submit"]').click();
      const alert = page.locator('[data-auth-form] [role="alert"]'); // not Next's route announcer
      await expect(alert).toBeVisible();
      const er = await measure(page, alert, "text");
      rows.push({ screen: "/login", state: "error", what: await label(alert), ratio: er.ratio, glyphs: er.glyphs, fg: er.fg, bg: er.bg });

      // The panel, each slide shown in turn.
      for (const id of ["A", "B", "C"]) {
        const style = await page.addStyleTag({
          content: `[data-auth-slide] { opacity: 0 !important; } [data-auth-slide][data-slide-id="${id}"] { opacity: 1 !important; }`,
        });
        await measureAll(page, rows, "panel", `slide ${id}`, `[data-auth-slide][data-slide-id="${id}"]`);
        await style.evaluate((el) => (el as Element).remove());
      }

      // /pending at rest.
      await open(page, PENDING + q, theme);
      await measureAll(page, rows, "/pending", "rest", "[data-auth-form]");

      const failing = rows.filter((r) => r.ratio < AA || r.glyphs < 4);
      const byScreen = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.screen] = (acc[r.screen] ?? 0) + 1), acc), {});
      const min = rows.reduce((m, r) => (r.ratio < m.ratio ? r : m), rows[0]);
      await info.attach(`contrast-${theme}-${lang}.json`, { body: JSON.stringify(rows, null, 1), contentType: "application/json" });
      console.log(
        `[L8] ${theme} ${lang}: ${rows.length} measurements ${JSON.stringify(byScreen)}; minimum ${min.ratio.toFixed(2)}:1 ` +
          `(${min.screen} ${min.state} ${min.what} rgb(${min.fg}) on rgb(${min.bg}))` +
          (failing.length ? `\n  FAILING: ${failing.map((f) => `${f.screen} ${f.state} ${f.what} ${f.ratio.toFixed(2)}:1 (${f.glyphs} glyph px)`).join("\n  FAILING: ")}` : "")
      );
      expect(rows.length).toBeGreaterThan(20);
      expect(failing.map((f) => `${f.screen} ${f.state} ${f.what} ${f.ratio.toFixed(2)}:1`)).toEqual([]);
    });
  }
}
