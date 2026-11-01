import fs from "node:fs";
import path from "node:path";
import { test, expect, type BrowserContext } from "@playwright/test";

/**
 * /app basemap and map credits against the built static export
 * (RECON 2026-10-data-terms §5 UO-5, §7.1; 国土地理院 地理院タイル一覧).
 *
 * The dashboard is shown signed in without any real identity: Firebase's
 * persisted user is seeded in localStorage and accounts:lookup is answered
 * here; every /api/v1/* call is answered from backend/data/sample_fallback.json.
 * The map tiles themselves are real network requests, which is the point.
 */

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "structural-check-build";
const USER_KEY = `firebase:authUser:${API_KEY}:[DEFAULT]`;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-type": "application/json" };
const GSI_TILE_LIST = "https://maps.gsi.go.jp/development/ichiran.html";
const PROCESSED = "地理院タイル（淡色地図）を加工して作成";
const SERVES_EXPORT = !process.env.APP_CREDITS_BASE_URL;

// The two live endpoints answer with real-shaped fixtures (the sample sets
// they used to fall back to left in real-data plan PR 1); /disaster-risks
// still serves the curated sample set from backend/data/sample_fallback.json.
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backend", "data", "sample_fallback.json"), "utf8"));
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "live-api.json"), "utf8"));
const API: Record<string, unknown> = {
  "/api/v1/demographics": { status: "ok", data: live.demographics, isLive: true, sources: live.sources },
  "/api/v1/transport": { status: "ok", data: live.stations, isLive: true, fetchedAt: "2026-10-17T05:30:00+00:00" },
  "/api/v1/disaster-risks": { status: "ok", data: sample.sampleDisasterRisks, isLive: false },
  "/api/v1/auth/me": { status: "active", email_verified: true, role: "user" },
};

async function signedInDashboard(context: BrowserContext) {
  await context.addInitScript(([key, apiKey]) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        uid: "e2e-credits",
        email: "e2e-credits@example.com",
        emailVerified: true,
        isAnonymous: false,
        providerData: [],
        stsTokenManager: { refreshToken: "e2e", accessToken: "e2e", expirationTime: Date.now() + 3600 * 1000 },
        createdAt: "1700000000000",
        lastLoginAt: "1700000000000",
        apiKey,
        appName: "[DEFAULT]",
      })
    );
  }, [USER_KEY, API_KEY]);
  await context.route(/identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/, (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({
          status: 200,
          headers: CORS,
          body: JSON.stringify({
            users: [{ localId: "e2e-credits", email: "e2e-credits@example.com", emailVerified: true, providerUserInfo: [] }],
          }),
        })
  );
  await context.route(/\/api\/v1\//, (route) => {
    const body = API[new URL(route.request().url()).pathname];
    return route.fulfill({ status: body ? 200 : 404, contentType: "application/json", body: JSON.stringify(body ?? {}) });
  });
  if (SERVES_EXPORT) {
    // python's http.server has no clean URLs; FastAPI serves /app from app.html.
    await context.route(
      (url) => url.pathname === "/app",
      (route) => route.fulfill({ path: path.join(__dirname, "..", "out", "app.html"), contentType: "text/html" })
    );
  }
}

function countTileHosts(context: BrowserContext) {
  const seen = { carto: 0, gsiPale: 0 };
  context.on("request", (req) => {
    const url = new URL(req.url());
    if (url.hostname.endsWith("basemaps.cartocdn.com")) seen.carto += 1;
    if (url.hostname === "cyberjapandata.gsi.go.jp" && url.pathname.startsWith("/xyz/pale/")) seen.gsiPale += 1;
  });
  return seen;
}

test.describe("light theme", () => {
  test.use({ colorScheme: "light" });

  test("the dashboard map loads 地理院タイル 淡色地図 and sends no request to basemaps.cartocdn.com", async ({ page, context }) => {
    const seen = countTileHosts(context);
    await signedInDashboard(context);
    await page.goto("/app");
    await page.waitForSelector(".maplibregl-ctrl-attrib", { timeout: 30_000 });
    await expect.poll(() => seen.gsiPale, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(seen.carto).toBe(0);
  });

  test("the map attribution control is expanded and links 地理院タイル to the tile list page", async ({ page, context }) => {
    await signedInDashboard(context);
    await page.goto("/app");
    const attrib = page.locator(".maplibregl-ctrl-attrib").first();
    await expect(attrib).toBeVisible({ timeout: 30_000 });
    await expect(attrib).not.toHaveClass(/maplibregl-compact/);
    await expect(attrib.locator(`a[href="${GSI_TILE_LIST}"]`)).toHaveText("地理院タイル");
    await expect(attrib).not.toContainText(PROCESSED);
  });
});

test.describe("dark theme", () => {
  test.use({ colorScheme: "dark" });

  test("the attribution adds the 加工 statement for the darkened 淡色地図", async ({ page, context }) => {
    await signedInDashboard(context);
    await page.goto("/app");
    const attrib = page.locator(".maplibregl-ctrl-attrib").first();
    await expect(attrib).toBeVisible({ timeout: 30_000 });
    await expect(attrib.locator(`a[href="${GSI_TILE_LIST}"]`)).toHaveText("地理院タイル");
    await expect(attrib).toContainText(PROCESSED);
  });
});
