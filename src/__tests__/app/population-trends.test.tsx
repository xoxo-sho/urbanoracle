import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * PR 3 of the real-data plan (RECON 2026-10-uo-real-data §9 row 3): the
 * 人口推移（東京23区） chart on the 人口 tab draws the committed census snapshot
 * served by GET /api/v1/population-trends — six points, 2000–2025 — not
 * ``samplePopulationTrends`` (src/data/sample.ts), whose 2025 figure,
 * 9,820,000, is neither the 速報 nor the 確報.
 *
 * Contract: the route answers with PR 1's envelope (``status``, ``data``,
 * ``isLive``) and PR 2's ``sources`` — per point, the year and the e-Stat table
 * the figure came from — and the chart renders what the payload says: its
 * points, its years, its tables. Before the answer the chart says 読み込み中;
 * on a failure it says 取得失敗 and names e-Stat; it never shows a sample
 * number or a SAMPLE label, and it is independent of /demographics (the
 * Architect's reason for a separate route).
 *
 * The figures served here are derived from the committed source files
 * (fixtures/live-data.ts), never typed. Rendered with the real hook; only
 * fetch is replaced, as census-2025.test.tsx does.
 *
 * RED on main (149a782).
 */

vi.mock("next/dynamic", () => ({
  default: () =>
    function MapStub() {
      return <div data-testid="map-stub" />;
    },
}));
vi.mock("@/components/dashboard/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/components/auth/VerificationBanner", () => ({ default: () => null }));
vi.mock("@/components/auth/SignOutButton", () => ({ default: () => null }));

const auth = vi.hoisted(() => ({ getToken: async () => "id-token" }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, getToken: auth.getToken, refresh: async () => null }),
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import Home from "@/app/app/page";
import LandingPage from "@/app/page";
import {
  DEMOGRAPHICS_FIXTURE,
  DEMOGRAPHICS_SOURCES,
  LAND_PRICES_FIXTURE,
  LAND_PRICES_SOURCES,
  POPULATION_TRENDS_FIXTURE,
  POPULATION_TRENDS_SOURCES,
  POPULATION_TRENDS_TOTALS,
  POPULATION_TRENDS_YEARS,
  ZONING_FIXTURE,
  ZONING_SOURCES,
  ZONING_TOTAL,
} from "@/__tests__/fixtures/live-data";

const TRENDS_ROUTE = "/api/v1/population-trends";
const SURFACE = '[data-surface="population-trend"]';
const POINT = "[data-trend-point]";
const SAMPLE_NODE = '[data-provenance="sample"]';
const LOADING = "読み込み中";
const FAILED = "取得失敗";
const RETRY = "時間をおいて再読み込みしてください";
const SAMPLE_LABEL = "サンプルデータ（暫定）";

// The sample set's 2025 figure (src/data/sample.ts @ 149a782), as the header
// prints it (万人, no decimals) and as a point. Either on screen is the sample leaking.
const SAMPLE_2025 = 9_820_000;
const SAMPLE_HEADER = `${(SAMPLE_2025 / 10000).toFixed(0)}万人`;

const LATEST_YEAR = POPULATION_TRENDS_YEARS[POPULATION_TRENDS_YEARS.length - 1];
const PREVIOUS_YEAR = POPULATION_TRENDS_YEARS[POPULATION_TRENDS_YEARS.length - 2];
const TABLES = [...new Set(Object.values(POPULATION_TRENDS_SOURCES).map((s) => s.table))];

type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pending: Route = () => new Promise<Response>(() => {});
const offline: Route = async () => {
  throw new TypeError("offline");
};

const TRENDS: Route = json(200, { status: "ok", data: POPULATION_TRENDS_FIXTURE, isLive: true, sources: POPULATION_TRENDS_SOURCES });
const UNAVAILABLE: Route = json(503, { status: "unavailable" });
const DEMOGRAPHICS: Route = json(200, { status: "ok", data: DEMOGRAPHICS_FIXTURE, isLive: true, sources: DEMOGRAPHICS_SOURCES });
const TRANSPORT: Route = json(200, { status: "ok", data: [], isLive: true, fetchedAt: "2026-10-30T00:00:00+00:00" });
const DISASTER: Route = json(200, { data: [], isLive: false });
// The 地価公示 snapshot route (PR 5): answers so the page settles (land-prices.test.tsx guards it).
const LAND_PRICES: Route = json(200, { status: "ok", data: LAND_PRICES_FIXTURE, isLive: true, sources: LAND_PRICES_SOURCES });
// The 用途地域 snapshot route (PR 6): answers so the page settles (zoning.test.tsx guards it).
const ZONING: Route = json(200, { status: "ok", data: ZONING_FIXTURE, isLive: true, sources: ZONING_SOURCES, total: ZONING_TOTAL });

/** The same payload with the 2025 point moved to another year and table: what the page must then say. */
function trendsSaying(year: number, table: string): Route {
  const data = POPULATION_TRENDS_FIXTURE.map((r) => (r.year === LATEST_YEAR ? { ...r, year } : r));
  const sources = Object.fromEntries(
    Object.entries(POPULATION_TRENDS_SOURCES).map(([key, s]) =>
      s.year === LATEST_YEAR ? [String(year), { ...s, year, table }] : [key, s]
    )
  );
  return json(200, { status: "ok", data, isLive: true, sources });
}

function serve(routes: Record<string, Route>) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch: ${url}`);
    return route();
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function renderSettled(routes: { trends?: Route; demographics?: Route } = {}) {
  const mock = serve({
    "/api/v1/demographics": routes.demographics ?? DEMOGRAPHICS,
    "/api/v1/transport": TRANSPORT,
    "/api/v1/disaster-risks": DISASTER,
    [TRENDS_ROUTE]: routes.trends ?? TRENDS,
    "/api/v1/land-prices": LAND_PRICES,
    "/api/v1/zoning": ZONING,
  });
  const view = render(<Home />);
  await waitFor(() => expect(mock).toHaveBeenCalledTimes(6));
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return { ...view, mock };
}

function openTab(name: string): HTMLElement {
  fireEvent.click(screen.getByRole("tab", { name }));
  return screen.getByRole("tabpanel");
}

function surface(panel: HTMLElement): HTMLElement {
  const el = panel.querySelector<HTMLElement>(SURFACE);
  if (!el) throw new Error(`no ${SURFACE} on the 人口 tab`);
  return el;
}

/** The points the chart section exposes: year -> population. */
function points(section: HTMLElement): Record<number, number> {
  return Object.fromEntries(
    [...section.querySelectorAll<HTMLElement>(POINT)].map((el) => [Number(el.dataset.year), Number(el.dataset.population)])
  );
}

function sourceLine(section: HTMLElement): string {
  return [...section.querySelectorAll<HTMLElement>(".source-note")].map((el) => el.textContent ?? "").join("\n");
}

const footerLive = (c: HTMLElement) => c.querySelector('footer [data-provenance="live"]')?.textContent ?? "";
const footerSample = (c: HTMLElement) => c.querySelector('footer [data-provenance="sample"]')?.textContent ?? "";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the page asks the trends route", () => {
  it("fetches /api/v1/population-trends beside the other three", async () => {
    const { mock } = await renderSettled();
    const urls = mock.mock.calls.map(([input]) => (typeof input === "string" ? input : String(input)));
    expect(urls).toContain(TRENDS_ROUTE);
  });
});

describe("人口 tab — the chart is the snapshot", () => {
  it("draws exactly the six points the payload carries, year by year", async () => {
    await renderSettled();
    const section = surface(openTab("人口"));
    expect(points(section)).toEqual(POPULATION_TRENDS_TOTALS);
  });

  it("the 2025 point is the 確報 total, and the header prints it — never 982万人", async () => {
    await renderSettled();
    const section = surface(openTab("人口"));
    expect(points(section)[LATEST_YEAR]).toBe(POPULATION_TRENDS_TOTALS[LATEST_YEAR]);
    expect(Object.values(points(section))).not.toContain(SAMPLE_2025);
    const text = section.textContent ?? "";
    expect(text).toContain(`${(POPULATION_TRENDS_TOTALS[LATEST_YEAR] / 10000).toFixed(0)}万人`);
    expect(text).not.toContain(SAMPLE_HEADER);
    const growth = ((POPULATION_TRENDS_TOTALS[LATEST_YEAR] - POPULATION_TRENDS_TOTALS[PREVIOUS_YEAR]) / POPULATION_TRENDS_TOTALS[PREVIOUS_YEAR]) * 100;
    expect(text).toContain(`+${growth.toFixed(1)}%`);
  });

  it("its source line names every table and the years the payload says, and no 速報", async () => {
    await renderSettled();
    const section = surface(openTab("人口"));
    const line = sourceLine(section);
    expect(line, "no .source-note under the 人口推移 chart").not.toBe("");
    for (const table of TABLES) expect(line).toContain(table);
    expect(line).toContain(`${POPULATION_TRENDS_YEARS[0]}年`);
    expect(line).toContain(`${LATEST_YEAR}年`);
    expect(line).toContain("出典：政府統計の総合窓口(e-Stat)");
    expect(line).not.toContain("速報");
    expect(section.querySelector(SAMPLE_NODE)).toBeNull();
    expect(section.textContent).not.toContain(SAMPLE_LABEL);
  });

  it("reads year and table from the payload: a 2031 point from table 7777777777 renders as such", async () => {
    await renderSettled({ trends: trendsSaying(2031, "7777777777") });
    const section = surface(openTab("人口"));
    expect(points(section)[2031]).toBe(POPULATION_TRENDS_TOTALS[LATEST_YEAR]);
    expect(points(section)[LATEST_YEAR]).toBeUndefined();
    const line = sourceLine(section);
    expect(line).toContain("2031年");
    expect(line).toContain("7777777777");
    expect(line).not.toContain(POPULATION_TRENDS_SOURCES[String(LATEST_YEAR)].table);
  });

  it("carries the e-Stat 加工 statement for the trend", async () => {
    await renderSettled();
    const section = surface(openTab("人口"));
    expect(section.textContent).toContain("を加工して作成");
  });
});

describe("states — 読み込み中 / 取得失敗, never a sample number", () => {
  it("loading: the section says 読み込み中, shows no point and no figure; the census blocks are unaffected", async () => {
    await renderSettled({ trends: pending });
    const panel = openTab("人口");
    const section = surface(panel);
    expect(section.querySelector('[data-state="loading"]')?.textContent).toContain(LOADING);
    expect(section.querySelectorAll(POINT)).toHaveLength(0);
    expect(section.textContent).not.toContain("万人");
    expect(section.textContent).not.toContain(FAILED);
    expect(panel.querySelector(SAMPLE_NODE)).toBeNull();
    expect(panel.textContent).toContain("最大成長");
    expect(panel.textContent).toContain("0.0%");
  });

  it.each([
    ["HTTP 503 with status unavailable", UNAVAILABLE],
    ["network failure", offline],
    ["HTTP 500", json(500, { detail: "boom" })],
  ])("%s: the section says 取得失敗, names e-Stat, shows no point; the census blocks are unaffected", async (_label, failure) => {
    await renderSettled({ trends: failure });
    const panel = openTab("人口");
    const section = surface(panel);
    const notice = section.querySelector('[data-state="unavailable"]');
    expect(notice, "no 取得失敗 notice in the 人口推移 section").not.toBeNull();
    expect(notice!.textContent).toContain(FAILED);
    expect(notice!.textContent).toContain(RETRY);
    expect(notice!.textContent).toContain("e-Stat");
    expect(section.querySelectorAll(POINT)).toHaveLength(0);
    expect(section.textContent).not.toContain("万人");
    expect(section.textContent).not.toContain(SAMPLE_HEADER);
    expect(panel.querySelector(SAMPLE_NODE)).toBeNull();
    expect(panel.textContent).toContain("最大成長");
    expect(panel.textContent).toContain("0.0%");
  });

  it("/demographics failing does not take the chart down (its own route)", async () => {
    await renderSettled({ demographics: UNAVAILABLE });
    const panel = openTab("人口");
    expect(points(surface(panel))).toEqual(POPULATION_TRENDS_TOTALS);
    expect(panel.textContent).toContain(FAILED); // the census blocks
    expect(panel.querySelector(SAMPLE_NODE)).toBeNull();
  });

  it("the 人口 tab carries no SAMPLE node in any state", async () => {
    for (const trends of [TRENDS, pending, UNAVAILABLE]) {
      const { unmount } = await renderSettled({ trends });
      const panel = openTab("人口");
      expect(panel.querySelector(SAMPLE_NODE)).toBeNull();
      expect(panel.textContent).not.toContain(SAMPLE_LABEL);
      unmount();
    }
  });
});

describe("footer", () => {
  it("lists 人口推移 under 実データ with its tables when the route answered, and never under the sample group", async () => {
    const { container } = await renderSettled();
    expect(footerSample(container)).not.toContain("人口推移");
    const live = footerLive(container);
    expect(live).toContain("人口推移");
    for (const table of TABLES) expect(live).toContain(table);
    expect(live).toContain(`${LATEST_YEAR}年`);
  });

  it("lists 人口推移 in neither group while loading or failed", async () => {
    for (const trends of [pending, UNAVAILABLE]) {
      const { container, unmount } = await renderSettled({ trends });
      expect(footerSample(container)).not.toContain("人口推移");
      expect(footerLive(container)).not.toContain("人口推移");
      unmount();
    }
  });
});

describe("landing page データ出典 table", () => {
  it("moves 人口推移 from the sample group to 実データ", () => {
    const { container } = render(<LandingPage />);
    const sample = container.querySelector('tbody[data-provenance="sample"]')?.textContent ?? "";
    const live = container.querySelector('tbody[data-provenance="live"]')?.textContent ?? "";
    expect(sample).not.toContain("人口推移");
    expect(live).toContain("人口推移");
  });
});
