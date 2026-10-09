import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

/**
 * Captures of the sign-in screens for review — NOT a CI check (adapted from
 * origin/feat/login-panel e2e/login-captures.spec.ts). Runs only when
 * LOGIN_CAPTURE_DIR names a directory; otherwise every test is skipped.
 *
 *   LOGIN_CAPTURE_DIR=/path npm run test:login
 *
 * /login sign-in, /login sign-up and /pending at 2560×1400, 1440×900 and
 * 390×844 in Japanese and English (light); /login sign-in at 1440×900 in the
 * dark theme, both languages; one panel frame caught mid-transition;
 * /forgot-password at 1440×900 in both languages. Every capture is taken after
 * transitions settle. /pending renders without a session; identity hosts are
 * aborted and none may escape.
 */

const DIR = process.env.LOGIN_CAPTURE_DIR;
const IDENTITY = /(^|\.)(identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|www\.googleapis\.com|firebaseapp\.com)$/;

type Tally = { seen: number; intercepted: number };
const test = base.extend<{ identity: Tally }>({
  identity: [
    async ({ context }, use) => {
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
      expect(tally.seen - tally.intercepted, "identity requests escaped").toBe(0);
    },
    { auto: true },
  ],
});

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined))
    )
  );
  await page.waitForTimeout(300);
}

async function open(page: Page, route: string, lang: "ja" | "en", theme: "light" | "dark" = "light") {
  await page.goto(`${route}?lang=${lang}`, { waitUntil: "networkidle" });
  if (route !== "/forgot-password.html") {
    await expect(page.locator('[data-lang-toggle][data-lang-ready="true"]')).toBeVisible();
  }
  await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark");
  await page.mouse.move(2, 2);
  await settle(page);
}

test.describe("sign-in captures", () => {
  test.skip(!DIR, "LOGIN_CAPTURE_DIR not set");

  for (const [w, h] of [
    [2560, 1400],
    [1440, 900],
    [390, 844],
  ] as const) {
    for (const lang of ["ja", "en"] as const) {
      test(`${w}x${h} ${lang}: /login sign-in, sign-up and /pending`, async ({ page }) => {
        mkdirSync(DIR!, { recursive: true });
        await page.setViewportSize({ width: w, height: h });
        await open(page, "/login.html", lang);
        await page.screenshot({ path: join(DIR!, `login-signin-${w}x${h}-${lang}-light.png`) });
        await page.locator("[data-auth-mode-toggle]").click();
        await settle(page);
        await page.screenshot({ path: join(DIR!, `login-signup-${w}x${h}-${lang}-light.png`) });
        await open(page, "/pending.html", lang);
        await page.screenshot({ path: join(DIR!, `pending-${w}x${h}-${lang}-light.png`) });
      });
    }
  }

  for (const lang of ["ja", "en"] as const) {
    test(`1440x900 ${lang}: /login dark, /forgot-password`, async ({ page }) => {
      mkdirSync(DIR!, { recursive: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, "/login.html", lang, "dark");
      await page.screenshot({ path: join(DIR!, `login-signin-1440x900-${lang}-dark.png`) });
      await open(page, "/forgot-password.html", lang);
      await page.screenshot({ path: join(DIR!, `forgot-password-1440x900-${lang}-light.png`) });
    });
  }

  test("one panel frame mid-transition (1440x900 ja light)", async ({ page }) => {
    mkdirSync(DIR!, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/login.html", "ja");
    const caught = await page.evaluate(async () => {
      const deadline = performance.now() + 7000;
      while (performance.now() < deadline) {
        const opacities = [...document.querySelectorAll<HTMLElement>("[data-auth-slide]")].map((s) => parseFloat(getComputedStyle(s).opacity));
        const fading = opacities.find((o) => o > 0.2 && o < 0.8);
        if (fading !== undefined) return fading;
        await new Promise((r) => setTimeout(r, 8));
      }
      return null;
    });
    await page.screenshot({ path: join(DIR!, "login-signin-1440x900-ja-light-mid-transition.png") });
    console.log(`[captures] mid-transition frame at slide opacity ${caught}`);
    expect(caught).not.toBeNull();
  });
});
