import fs from "node:fs";
import path from "node:path";
import { test, expect, type BrowserContext } from "@playwright/test";

/**
 * /app basemap and map credits against the built static export
 * (RECON 2026-10-data-terms §5 UO-5, §7.1; 国土地理院 地理院タイル一覧).
 *
 * The dashboard is shown signed in without any real identity: Firebase's
 * persisted user is seeded in localStorage and accounts:lookup is answered
 * here; every /api/v1/* call is answered from the committed snapshots under backend/data/.
 * The map tiles themselves are real network requests, which is the point.
 */

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "structural-check-build";
const USER_KEY = `firebase:authUser:${API_KEY}:[DEFAULT]`;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-type": "application/json" };
const GSI_TILE_LIST = "https://maps.gsi.go.jp/development/ichiran.html";
const PROCESSED = "地理院タイル（淡色地図）を加工して作成";
const SERVES_EXPORT = !process.env.APP_CREDITS_BASE_URL;

// /demographics answers with a real-shaped fixture (the sample set it used
// to fall back to left in real-data plan PR 1); /transport answers from the
// committed 国土数値情報 station snapshot itself (PR 4); /disaster-risks from the
// committed 災害 snapshot (PR 7) — the sample list it used to serve is gone;
// /green-land-use from the committed 土地利用 snapshot (PR 8).
const disaster = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backend", "data", "disaster_risks.json"), "utf8")) as {
  sources: Record<string, unknown>;
  total: { name: string } & Record<string, unknown>;
  wards: ({ name: string } & Record<string, unknown>)[];
};
const green = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backend", "data", "green_land_use.json"), "utf8")) as typeof disaster;
const disasterRecord = ({ name, ...rest }: { name: string } & Record<string, unknown>) => ({ ...rest, region: name });
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "live-api.json"), "utf8"));
interface SnapshotStation {
  code: string;
  name: string;
  ward: string;
  wardCode: string;
  lat: number;
  lng: number;
  dailyPassengers: number | null;
  operators: { name: string; lines: string[]; passengers: number | null }[];
  note?: string;
  remarks?: unknown[];
  countedElsewhere?: unknown;
  // Follow-up 3: the operator's own published figure per line, beside S12's.
  ownFigures?: unknown[];
}
const stationsSnapshot = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backend", "data", "stations.json"), "utf8")) as {
  sources: Record<string, unknown>;
  credit: Record<string, string>;
  // 乗降客数推移 (real-data plan PR 4b): the panel series the route sends beside `data`.
  trend: { panel: { id: string }; years: number[]; gaps: { year: number; text: string }[]; views: { name: string; units: number; panelUnits: number }[] };
  // Follow-up 3: whose figures the stations' ownFigures are, the notice and the counts (sent as total.operatorFigures).
  operatorFigures: { publisher: string; years: unknown[]; stationLines: number; below: Record<string, number>; notice: string[] };
  stations: SnapshotStation[];
};
const OPERATOR_PREFIX: Record<string, string> = { 東日本旅客鉄道: "JR", 東京地下鉄: "メトロ", 東京都: "都営" };
const stationRows = stationsSnapshot.stations.map((s) => ({
  id: `s12-${s.code}-${s.wardCode}`,
  code: s.code,
  name: s.name.endsWith("駅") ? s.name : `${s.name}駅`,
  lat: s.lat,
  lng: s.lng,
  type: "train",
  dailyPassengers: s.dailyPassengers,
  lines: s.operators.flatMap((o) => o.lines.map((line) => `${OPERATOR_PREFIX[o.name] ?? o.name} ${line}`)),
  ward: s.ward,
  wardCode: s.wardCode,
  operators: s.operators,
  ...(s.remarks ? { remarks: s.remarks } : {}),
  ...(s.countedElsewhere ? { countedElsewhere: s.countedElsewhere } : {}),
  ...(s.note ? { note: s.note } : {}),
  ...(s.ownFigures ? { ownFigures: s.ownFigures } : {}),
}));
// The 人口推移 snapshot route (real-data plan PR 3) answers from the committed snapshot itself.
interface SnapshotPoint {
  year: number;
  population: number;
  wards: { name: string; population: number }[];
}
const trends = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backend", "data", "population_trends.json"), "utf8")) as {
  region: string;
  sources: Record<string, unknown>;
  points: SnapshotPoint[];
};
const trendRows = trends.points.flatMap((p) => [
  { year: p.year, population: p.population, region: trends.region },
  ...p.wards.map((w) => ({ year: p.year, population: w.population, region: w.name })),
]);
// The 地価公示 snapshot route (real-data plan PR 5) answers from the committed snapshot itself.
interface SnapshotLandPriceWard {
  code: string;
  name: string;
  n: number;
  residential: Record<string, number | null>;
  commercial: Record<string, number | null>;
  industrial: { n: number };
}
const landPrices = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backend", "data", "land_prices.json"), "utf8")) as {
  sources: Record<string, unknown>;
  wards: SnapshotLandPriceWard[];
};
const landPriceRows = landPrices.wards.map((w) => ({
  region: w.name,
  code: w.code,
  n: w.n,
  residential: w.residential,
  commercial: w.commercial,
  industrial: w.industrial,
}));
// The 用途地域 snapshot route (real-data plan PR 6) answers from the committed snapshot itself.
interface SnapshotZoningComposition {
  code: string;
  name: string;
  asOf: Record<string, unknown>;
  [key: string]: unknown;
}
const zoning = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backend", "data", "zoning.json"), "utf8")) as {
  sources: Record<string, unknown>;
  total: SnapshotZoningComposition;
  wards: SnapshotZoningComposition[];
};
const zoningRecord = ({ name, asOf, ...rest }: SnapshotZoningComposition) => {
  const { cells: _cells, ...asOfRest } = asOf as { cells?: unknown };
  void _cells;
  return { ...rest, region: name, asOf: asOfRest };
};
const API: Record<string, unknown> = {
  "/api/v1/zoning": { status: "ok", data: zoning.wards.map(zoningRecord), sources: zoning.sources, total: zoningRecord(zoning.total) },
  "/api/v1/demographics": { status: "ok", data: live.demographics, sources: live.sources },
  "/api/v1/land-prices": { status: "ok", data: landPriceRows, sources: landPrices.sources },
  "/api/v1/transport": {
    status: "ok",
    data: stationRows,
    sources: stationsSnapshot.sources,
    // backend/services/transport.py total(): the 23区 record carrying the trend.
    total: {
      code: "13100",
      name: "東京23区",
      trend: {
        panel: stationsSnapshot.trend.panel.id,
        years: stationsSnapshot.trend.years,
        gaps: stationsSnapshot.trend.gaps.map(({ year, text }) => ({ year, text })),
        views: stationsSnapshot.trend.views,
      },
      // Follow-up 3: the operators' own figures' notice and credit (backend/services/transport.py total()).
      operatorFigures: {
        publisher: stationsSnapshot.operatorFigures.publisher,
        years: stationsSnapshot.operatorFigures.years,
        stationLines: stationsSnapshot.operatorFigures.stationLines,
        below: stationsSnapshot.operatorFigures.below,
        notice: stationsSnapshot.operatorFigures.notice,
        credit: stationsSnapshot.credit.toei_edited,
      },
    },
  },
  "/api/v1/disaster-risks": { status: "ok", data: disaster.wards.map(disasterRecord), sources: disaster.sources, total: disasterRecord(disaster.total) },
  "/api/v1/green-land-use": { status: "ok", data: green.wards.map(disasterRecord), sources: green.sources, total: disasterRecord(green.total) },
  "/api/v1/population-trends": { status: "ok", data: trendRows, sources: trends.sources },
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

  // Real-data plan PR 4b: in a real browser the chart is drawn — one dot per
  // panel year and none at 2019 — and the longer notes fit the tab at both
  // viewports this config runs.
  test("交通 tab: 乗降客数推移 draws the panel with no point at 2019, states its coverage and S12's notice; no SAMPLE, nothing overflows sideways", async ({ page, context }) => {
    await signedInDashboard(context);
    await page.goto("/app");
    await page.getByRole("tab", { name: "交通" }).click();
    const trend = page.locator('[data-surface="ridership-trend"]');
    const total = stationsSnapshot.trend.views[0];
    await expect(trend).toContainText(`乗降客数推移（${total.name}）`, { timeout: 30_000 });
    await expect(trend.locator("[data-trend-point]")).toHaveCount(stationsSnapshot.trend.years.length);
    await expect(trend.locator(".recharts-area-dot")).toHaveCount(stationsSnapshot.trend.years.length);
    for (const gap of stationsSnapshot.trend.gaps) {
      await expect(trend.locator(`[data-trend-gap][data-year="${gap.year}"]`)).toHaveCount(1);
      await expect(trend.locator("[data-trend-gap-reason]")).toContainText(gap.text);
    }
    await expect(trend.locator("[data-trend-coverage]")).toContainText(`${total.panelUnits}単位（全${total.units}単位中）`);
    await expect(trend.locator('[data-notice="s12"]')).toBeVisible();
    await expect(page.locator('[data-surface="stations"] [data-notice="s12"]')).toBeVisible();
    await expect(page.locator('[data-surface="operators"] [data-notice="s12"]')).toBeVisible();
    await expect(page.locator('[data-provenance="sample"]')).toHaveCount(0);
    const overflow = await page.evaluate(() => {
      const panel = document.querySelector('[role="tabpanel"]') as HTMLElement;
      const root = document.documentElement;
      return { panel: panel.scrollWidth - panel.clientWidth, document: root.scrollWidth - root.clientWidth };
    });
    expect(overflow.panel).toBeLessThanOrEqual(1);
    expect(overflow.document).toBeLessThanOrEqual(1);
  });

  // Architect decision 2026-11-09 (layout): S12's notice stands once, full
  // width, directly under the three key-metric tiles; the 日間乗降客 tile
  // carries only a marker. Geometry is a browser matter, so it is checked here.
  test("key metrics: the 日間乗降客 tile carries only the marker; S12's notice is one full-width line directly under the three tiles, which share one height; nothing overflows sideways", async ({ page, context }) => {
    await signedInDashboard(context);
    await page.goto("/app");
    const tiles = page.locator(".key-metric");
    await expect(tiles).toHaveCount(3);
    const k3 = tiles.nth(2);
    await expect(k3).toContainText("※ 下記の注記参照", { timeout: 30_000 });
    await expect(k3).not.toContainText("統一的な基準");
    const line = page.locator('[data-surface="ridership-notice"]');
    await expect(line).toHaveCount(1);
    await expect(line).toContainText("各社で独自に算出したものであり、統一的な基準に基づいたものではありません");
    const g = await page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
      };
      const metric = [...document.querySelectorAll(".key-metric")];
      const row = metric[0].parentElement as HTMLElement;
      const notice = document.querySelector('[data-surface="ridership-notice"]') as HTMLElement;
      const root = document.documentElement;
      return {
        tiles: metric.map(box),
        row: { ...box(row), overflow: row.scrollWidth - row.clientWidth },
        line: box(notice),
        nextOfRow: row.nextElementSibling === notice,
        document: root.scrollWidth - root.clientWidth,
      };
    });
    const heights = g.tiles.map((t) => t.height);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    expect(g.nextOfRow).toBe(true);
    // Full width: from the first tile's left edge to the last tile's right edge, below the row.
    expect(Math.abs(g.line.left - g.tiles[0].left)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.line.right - g.tiles[2].right)).toBeLessThanOrEqual(1);
    expect(g.line.top).toBeGreaterThanOrEqual(g.row.bottom - 1);
    expect(g.line.top - g.row.bottom).toBeLessThanOrEqual(24);
    expect(g.row.overflow).toBeLessThanOrEqual(1);
    expect(g.document).toBeLessThanOrEqual(1);
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
