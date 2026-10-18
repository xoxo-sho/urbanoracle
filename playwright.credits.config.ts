import { defineConfig, devices } from "@playwright/test";

/**
 * /app map basemap and credits (e2e/app-credits.spec.ts).
 *
 *   npm run build && npm run test:credits
 *
 * Serves the PRODUCTION static export (out/) with python3's http.server, on
 * its own port (APP_CREDITS_PORT, default 4401; LP 4381, login 4391, fonts
 * 4371). Set APP_CREDITS_BASE_URL to test an origin that is already running
 * instead. The map draws with WebGL, so Chromium is given SwiftShader.
 *
 * Two projects, the two viewports the attribution must stay expanded at:
 * 1440×900 and 390×844.
 */

const PORT = Number(process.env.APP_CREDITS_PORT ?? 4401);
const BASE_URL = process.env.APP_CREDITS_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const WEBGL = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

export default defineConfig({
  testDir: "./e2e",
  testMatch: /app-credits\.spec\.ts/,
  outputDir: process.env.APP_CREDITS_OUTPUT_DIR ?? "test-results/app-credits",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    locale: "ja-JP",
    deviceScaleFactor: 1,
    launchOptions: { args: WEBGL },
  },
  projects: [
    {
      name: "desktop-1440x900",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, launchOptions: { args: WEBGL } },
    },
    {
      name: "mobile-390x844",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, launchOptions: { args: WEBGL } },
    },
  ],
  webServer: process.env.APP_CREDITS_BASE_URL
    ? undefined
    : {
        command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory out`,
        url: `${BASE_URL}/`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
