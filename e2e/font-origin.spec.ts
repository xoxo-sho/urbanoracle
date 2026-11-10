import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Guard (iv), the part only a browser can hold: on the built export, fonts
 * come from this origin only.
 *
 * Geist, Geist Mono and Noto Sans JP are vendored under public/fonts/
 * (scripts/vendor-fonts.mjs) and served from /fonts/; the two heading subsets
 * stay with next/font/local under /_next/static/media/. The LP, /login and
 * /app must send no request to Google Fonts, and every font they load must be
 * one of those files and answer 200. The two Latin files next/font/google
 * preloaded (Geist and Geist Mono, latin) are still preloaded.
 *
 * /app is signed in the way app-credits.spec.ts does it: Firebase's persisted
 * user is seeded for the structural build's apiKey and accounts:lookup and
 * /api/v1/auth/me are answered here. The data routes answer 503, the product's
 * own failure state: this spec is about which fonts load, not about the data.
 *
 * Runs with the font checks (playwright.font.config.ts, `npm run test:fonts`).
 *
 * RED on main (9010a53): the three families are served from
 * /_next/static/media/ under next/font's names, and nothing is in /fonts/.
 */

const GOOGLE_FONTS = /^https?:\/\/fonts\.(googleapis|gstatic)\.com\//;
const VENDORED = /^\/fonts\/(geist|geist-mono|noto-sans-jp)\/[a-z0-9-]+-[0-9a-f]{16}\.woff2$/;
const HEADING = /^\/_next\/static\/media\/(SourceSerif4_700_subset|ZenOldMincho_700_subset)-s\.p\.[^/]+\.woff2$/;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "structural-check-build";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-type": "application/json" };

/** The preload list the root layout uses, read from source (it does not exist before the fonts are vendored). */
function preloadList(): string[] {
  const file = path.join(__dirname, "..", "src", "app", "vendored-fonts.ts");
  if (!fs.existsSync(file)) return [];
  return [...fs.readFileSync(file, "utf8").matchAll(/"(\/fonts\/[^"]+)"/g)].map((m) => m[1]);
}

async function signIn(page: Page) {
  await page.addInitScript(
    ([key, apiKey]) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          uid: "e2e-fonts",
          email: "e2e-fonts@example.com",
          emailVerified: true,
          isAnonymous: false,
          providerData: [],
          stsTokenManager: { refreshToken: "e2e", accessToken: "e2e", expirationTime: Date.now() + 3600 * 1000 },
          createdAt: "1700000000000",
          lastLoginAt: "1700000000000",
          apiKey,
          appName: "[DEFAULT]",
        }),
      );
    },
    [`firebase:authUser:${API_KEY}:[DEFAULT]`, API_KEY],
  );
  await page.route(/identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/, (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({
          status: 200,
          headers: CORS,
          body: JSON.stringify({
            users: [{ localId: "e2e-fonts", email: "e2e-fonts@example.com", emailVerified: true, providerUserInfo: [] }],
          }),
        }),
  );
  await page.route(/\/api\/v1\//, (route) =>
    new URL(route.request().url()).pathname === "/api/v1/auth/me"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", email_verified: true, role: "user" }) })
      : route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "unavailable" }) }),
  );
}

for (const route of ["/", "/login", "/app"] as const) {
  test(`${route}: every font comes from this origin — the vendored files and the two heading subsets — and none from Google`, async ({
    page,
    baseURL,
  }) => {
    const google: string[] = [];
    const fonts: Array<{ url: string; status: number }> = [];
    page.on("request", (req) => {
      if (GOOGLE_FONTS.test(req.url())) google.push(req.url());
    });
    page.on("response", (res) => {
      if (res.request().resourceType() === "font") fonts.push({ url: res.url(), status: res.status() });
    });

    if (route === "/app") await signIn(page);
    await page.goto(route, { waitUntil: "networkidle" });
    if (route === "/app") await expect(page.getByRole("tablist").first()).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      // Let the slices requested by late layout settle too.
      await new Promise((r) => setTimeout(r, 500));
      await document.fonts.ready;
    });

    expect(google, "requests to Google Fonts").toEqual([]);
    const origin = new URL(baseURL!).origin;
    const vendored = fonts.filter((f) => VENDORED.test(new URL(f.url).pathname));
    expect(vendored.length, "no vendored font was loaded (non-vacuity)").toBeGreaterThan(2);
    for (const f of fonts) {
      const u = new URL(f.url);
      expect(u.origin, f.url).toBe(origin);
      expect(VENDORED.test(u.pathname) || HEADING.test(u.pathname), `${u.pathname} is neither a vendored file nor a heading subset`).toBe(true);
      expect(f.status, f.url).toBe(200);
    }

    // Japanese body text is on every one of these pages: Noto Sans JP slices load.
    expect(vendored.some((f) => new URL(f.url).pathname.startsWith("/fonts/noto-sans-jp/"))).toBe(true);

    // The two Latin files are preloaded, as they were under next/font/google.
    const expected = preloadList();
    expect(expected.length, "src/app/vendored-fonts.ts lists no file to preload").toBe(2);
    const preloaded = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel="preload"][as="font"]')].map((l) => ({
        href: l.getAttribute("href"),
        type: l.getAttribute("type"),
        crossorigin: l.getAttribute("crossorigin"),
      })),
    );
    for (const href of expected) {
      expect(preloaded, `${href} is not preloaded`).toContainEqual({ href, type: "font/woff2", crossorigin: "" });
    }
  });
}
