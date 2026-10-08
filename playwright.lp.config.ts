import { defineConfig, devices } from "@playwright/test";

/**
 * Landing-page language toggle (e2e/lp-i18n.spec.ts).
 *
 *   npm run build && npm run test:lp
 *
 * Serves the PRODUCTION static export (out/) with python3's http.server — no
 * npm dependency, and like FastAPI's mount it ignores the query string, so
 * /?lang=en resolves to index.html. Its own port (LP_TEST_PORT, default 4381;
 * the font check uses 4371). Set LP_TEST_BASE_URL to test an origin that is
 * already running instead. LP_TEST_OUTPUT_DIR moves Playwright's artifacts
 * out of the working tree.
 *
 * Two projects, the two viewports the toggle must fit: 1440×900 and 390×844.
 */

const PORT = Number(process.env.LP_TEST_PORT ?? 4381);
const BASE_URL = process.env.LP_TEST_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /lp-i18n\.spec\.ts/,
  outputDir: process.env.LP_TEST_OUTPUT_DIR ?? "test-results/lp-i18n",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    locale: "ja-JP",
    // After the device spread: `next build` type-checks this file and rejects
    // a key the spread would overwrite.
    deviceScaleFactor: 1,
  },
  projects: [
    {
      name: "desktop-1440x900",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
    {
      name: "mobile-390x844",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: process.env.LP_TEST_BASE_URL
    ? undefined
    : {
        command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory out`,
        url: `${BASE_URL}/`,
        // Never attach to whatever else might hold the port.
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
