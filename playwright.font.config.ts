/**
 * Dedicated Playwright config for the font checks (check 2 metrics + check 3
 * runtime-console assertion). Separate from playwright.config.ts on purpose:
 * that one boots `next dev` for the dashboard spec; this one serves the
 * PRODUCTION static export (out/) with a plain static server, because what it
 * measures is what ships (FastAPI serves out/ from STATIC_DIR).
 *
 *   npm run build && npm run test:fonts
 *
 * Set FONT_TEST_BASE_URL to point at an already-running origin (production).
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.FONT_TEST_PORT ?? 4371);
const BASE_URL = process.env.FONT_TEST_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /font-metrics\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    locale: "ja-JP",
    // After the device spread: `next build` type-checks this file and rejects
    // a key the spread would overwrite (found on parallel_urban).
    deviceScaleFactor: 1,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], locale: "ja-JP" } }],
  webServer: process.env.FONT_TEST_BASE_URL
    ? undefined
    : {
        command: `npx serve out -l ${PORT}`,
        url: `${BASE_URL}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
