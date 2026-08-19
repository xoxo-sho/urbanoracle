import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // The dxa-ui font-metrics spec has its own config (playwright.font.config.ts,
  // static server over out/, no dev server) and runs as its own CI step.
  testIgnore: /font-metrics\.spec\.ts/,
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
