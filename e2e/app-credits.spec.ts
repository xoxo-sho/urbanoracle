import { test, expect, type BrowserContext } from "@playwright/test";
import { signedInDashboard, stationsSnapshot } from "./support/signed-in-dashboard";

/**
 * /app basemap and map credits against the built static export
 * (RECON 2026-10-data-terms §5 UO-5, §7.1; 国土地理院 地理院タイル一覧).
 *
 * The dashboard is shown signed in without any real identity
 * (e2e/support/signed-in-dashboard.ts): every /api/v1/* call is answered from
 * the committed snapshots under backend/data/. The map tiles themselves are
 * real network requests, which is the point.
 */

const GSI_TILE_LIST = "https://maps.gsi.go.jp/development/ichiran.html";
const PROCESSED = "地理院タイル（淡色地図）を加工して作成";

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
