import { defineConfig, devices } from "@playwright/test";

/**
 * Title stability and the split login screens (e2e/lang-title.spec.ts,
 * e2e/login-*.spec.ts).
 *
 *   npm run build && npm run test:login
 *
 * Serves the PRODUCTION static export (out/) with python3's http.server — no
 * npm dependency. That server does not map clean URLs, so the specs load
 * /login.html, /pending.html and /forgot-password.html (FastAPI maps /login to
 * login.html in production; the bytes are the same). Its own port
 * (LOGIN_TEST_PORT, default 4391; the LP check uses 4381, fonts 4371). Set
 * LOGIN_TEST_BASE_URL to test an origin that is already running instead, and
 * LOGIN_TEST_OUTPUT_DIR to keep Playwright's artifacts out of the tree.
 *
 * login-captures.spec.ts is opt-in: it skips unless LOGIN_CAPTURE_DIR is set.
 * Every spec aborts requests to the identity hosts and asserts none escaped.
 */

const PORT = Number(process.env.LOGIN_TEST_PORT ?? 4391);
const BASE_URL = process.env.LOGIN_TEST_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(lang-title|login-split|login-contrast|login-captures)\.spec\.ts/,
  outputDir: process.env.LOGIN_TEST_OUTPUT_DIR ?? "test-results/login",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    locale: "ja-JP",
    viewport: { width: 1440, height: 900 },
    // After the device spread: `next build` type-checks this file and rejects
    // a key the spread would overwrite.
    deviceScaleFactor: 1,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } }],
  webServer: process.env.LOGIN_TEST_BASE_URL
    ? undefined
    : {
        command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory out`,
        url: `${BASE_URL}/`,
        // Never attach to whatever else might hold the port.
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
