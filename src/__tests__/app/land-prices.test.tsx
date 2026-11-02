import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * PR 5 of the real-data plan (RECON 2026-10-uo-real-data §9 row 5): 地価 from
 * 国土数値情報 地価公示データ L01-26 (2026年版, 2026年1月1日時点) — the committed
 * snapshot /api/v1/land-prices serves — on every 地価 surface: the 区別平均価格
 * bar, the 密度 vs 地価 scatter, the 区別データテーブル's 地価 column and the map's
 * 地価 choropleth (Architect decisions 4, 9, 11 and 12, 2026-11-02).
 *
 * What the page must say, every claim read from the payload:
 *   switch     住宅地 / 商業地, default 住宅地; one switch moves every 地価 surface;
 *   bar        区別平均価格（用途）: the mean of all points of the use with its n,
 *              every ward's figure in the markup, the selected ward always among
 *              the bars shown, 格差 recomputed per use;
 *   scatter    23 points whatever the selection, the selected one highlighted,
 *              the y domain from all 23 (defect c), y following the switch,
 *              取得失敗 when either half is missing, never an empty plot, no
 *              point mixing a live and a sample coordinate;
 *   choropleth stops derived from the data per use, legend labels equal to them;
 *   table      平均価格（用途） with n per row;
 *   provenance the year and table on every surface from the payload; credit in
 *              the 加工 form; PR 1 states (読み込み中 / 取得失敗 / data) everywhere;
 *   LP hero    untouched: still SAMPLE (it is switched in PR 7 with the downside).
 *
 * The figures served here are the committed snapshot's (fixtures/live-data.ts
 * reads backend/data/land_prices.json); the backend guards derive the same
 * figures from the committed source file. The census half of the scatter is a
 * 23-ward stand-in built from the ward list (its figures are not under test
 * here; census-2025.test.tsx guards them). Rendered with the real hook; only
 * fetch is replaced. RED on main (4b09098).
 */

vi.mock("next/dynamic", () => ({
  default: () =>
    function MapStub(props: {
      stations?: unknown[];
      landPrices?: unknown[];
      landUse?: string;
      landPriceStops?: number[] | null;
      landPriceStatus?: string;
    }) {
      return (
        <div
          data-testid="map-stub"
          data-land-prices={JSON.stringify(props.landPrices ?? null)}
          data-land-use={props.landUse ?? ""}
          data-land-price-stops={JSON.stringify(props.landPriceStops ?? null)}
          data-land-price-status={props.landPriceStatus ?? ""}
        />
      );
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
import type { DemographicsData } from "@/types";
import { TOKYO_WARDS } from "@/lib/wards";
import {
  DEMOGRAPHICS_SOURCES,
  POPULATION_TRENDS_FIXTURE,
  POPULATION_TRENDS_SOURCES,
  landPricesSnapshotRows,
  loadLandPricesSnapshot,
} from "@/__tests__/fixtures/live-data";

const LAND_ROUTE = "/api/v1/land-prices";
const LOADING = "読み込み中";
const FAILED = "取得失敗";
const SAMPLE_NODE = '[data-provenance="sample"]';
const KSJ = "国土数値情報";
const KSJ_SITE = "https://nlftp.mlit.go.jp/ksj/";
const KSJ_SOURCE = `出典：国土交通省国土数値情報ダウンロードサイト（${KSJ_SITE}）`;
const EDITED_L01 = `「国土数値情報（地価公示データ）」（国土交通省）（${KSJ_SITE}）を加工して作成`;
const PRICE_NOTE = "平均価格は各用途の全地点の地価公示価格の単純平均";
const CHANGE_NOTE = "変動率は継続地点（前年と比較できる地点）の対前年変動率の単純平均";
type Use = "residential" | "commercial";

const snapshot = loadLandPricesSnapshot();
const ROWS = landPricesSnapshotRows(snapshot);
const SOURCES = snapshot.sources;
const YEAR = snapshot.year;
const TABLE = SOURCES.price.table;
const BY_WARD = Object.fromEntries(ROWS.map((r) => [r.region, r]));
const man = (yen: number) => `${(yen / 10000).toFixed(0)}万`;
const yOf = (yen: number) => Math.round(yen / 1000) / 10;
const means = (use: Use) => ROWS.map((r) => r[use].meanPrice);
const gapOf = (use: Use) => {
  const sorted = [...ROWS].sort((a, b) => b[use].meanPrice - a[use].meanPrice);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  return { ratio: Math.round(top[use].meanPrice / bottom[use].meanPrice), top: top.region, bottom: bottom.region };
};
// 江戸川区 is near the bottom of both rankings, so it is never in a top 10 on its own.
const LOW_WARD = "江戸川区";

// The census half of the scatter: 23 rows in code order, one per ward, with
// stand-in densities and populations (strictly increasing, so the top-12
// table rows are the last twelve wards). Not census figures.
const DEMOGRAPHICS_23: DemographicsData[] = TOKYO_WARDS.map((w, i) => ({
  region: w.name,
  population: 60_000 + i * 30_000,
  density: 5_000 + i * 800,
  growthRate: 0.5,
  ageGroups: { young: 12, working: 66, elderly: 22 },
}));

type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pending: Route = () => new Promise<Response>(() => {});

const LAND: Route = json(200, { status: "ok", data: ROWS, isLive: true, sources: SOURCES });
const UNAVAILABLE: Route = json(503, { status: "unavailable" });
const DEMOGRAPHICS: Route = json(200, { status: "ok", data: DEMOGRAPHICS_23, isLive: true, sources: DEMOGRAPHICS_SOURCES });
const DEMOGRAPHICS_22: Route = json(200, {
  status: "ok",
  data: DEMOGRAPHICS_23.filter((d) => d.region !== LOW_WARD),
  isLive: true,
  sources: DEMOGRAPHICS_SOURCES,
});
const TRANSPORT: Route = json(200, { status: "ok", data: [], isLive: true });
const DISASTER: Route = json(200, { data: [], isLive: false });
const TRENDS: Route = json(200, { status: "ok", data: POPULATION_TRENDS_FIXTURE, isLive: true, sources: POPULATION_TRENDS_SOURCES });

/** The same payload with the sources moved to another year, table and label: what the page must then say. */
function landSaying(year: number, table: string, label: string): Route {
  const sources = { price: { year, table, label }, change: { year, table, label: `${label}（変動率）` } };
  return json(200, { status: "ok", data: ROWS, isLive: true, sources });
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

async function renderSettled(routes: { land?: Route; demographics?: Route } = {}) {
  const mock = serve({
    "/api/v1/demographics": routes.demographics ?? DEMOGRAPHICS,
    "/api/v1/transport": TRANSPORT,
    "/api/v1/disaster-risks": DISASTER,
    "/api/v1/population-trends": TRENDS,
    [LAND_ROUTE]: routes.land ?? LAND,
  });
  const view = render(<Home />);
  await waitFor(() => expect(mock).toHaveBeenCalledTimes(5));
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return view;
}

function openTab(name: string): HTMLElement {
  fireEvent.click(screen.getByRole("tab", { name }));
  return screen.getByRole("tabpanel");
}

function selectWard(container: HTMLElement, name: string) {
  const select = container.querySelector<HTMLSelectElement>("header select");
  if (!select) throw new Error("no ward selector in the header");
  fireEvent.change(select, { target: { value: name } });
}

function surface(panel: HTMLElement, name: string): HTMLElement {
  const el = panel.querySelector<HTMLElement>(`[data-surface="${name}"]`);
  if (!el) throw new Error(`no [data-surface="${name}"] on the 地価 tab`);
  return el;
}

function switchUse(panel: HTMLElement, use: Use) {
  const button = panel.querySelector<HTMLButtonElement>(`[data-land-use-switch] button[data-land-use="${use}"]`);
  if (!button) throw new Error(`no ${use} button on the 用途 switch`);
  fireEvent.click(button);
}

function pressed(panel: HTMLElement): Use | null {
  const button = panel.querySelector<HTMLButtonElement>('[data-land-use-switch] button[aria-pressed="true"]');
  return (button?.dataset.landUse as Use | undefined) ?? null;
}

/** Every ward's figure for the current use, as the bar surface lists them. */
function wardPrices(panel: HTMLElement): { ward: string; use: string; mean: number; n: number; change: number }[] {
  return [...surface(panel, "land-price-bar").querySelectorAll<HTMLElement>("[data-ward-price]")].map((el) => ({
    ward: el.dataset.ward ?? "",
    use: el.dataset.use ?? "",
    mean: Number(el.dataset.mean),
    n: Number(el.dataset.n),
    change: Number(el.dataset.change),
  }));
}

function bars(panel: HTMLElement): { ward: string; selected: boolean }[] {
  return [...surface(panel, "land-price-bar").querySelectorAll<HTMLElement>("[data-bar]")].map((el) => ({
    ward: el.dataset.ward ?? "",
    selected: el.dataset.selected === "true",
  }));
}

function points(panel: HTMLElement): { ward: string; x: number; y: number; z: number; selected: boolean }[] {
  return [...surface(panel, "land-price-scatter").querySelectorAll<HTMLElement>("[data-point]")].map((el) => ({
    ward: el.dataset.ward ?? "",
    x: Number(el.dataset.x),
    y: Number(el.dataset.y),
    z: Number(el.dataset.z),
    selected: el.dataset.selected === "true",
  }));
}

function yDomainMax(panel: HTMLElement): number {
  const el = surface(panel, "land-price-scatter").querySelector<HTMLElement>("[data-points]");
  if (!el) throw new Error("no [data-points] on the scatter");
  return Number(el.dataset.yDomainMax);
}

function priceCells(panel: HTMLElement): { ward: string; mean: number | null; n: number | null; text: string }[] {
  return [...panel.querySelectorAll<HTMLElement>("table td[data-price]")].map((el) => ({
    ward: el.dataset.ward ?? "",
    mean: el.dataset.mean ? Number(el.dataset.mean) : null,
    n: el.dataset.n ? Number(el.dataset.n) : null,
    text: el.textContent ?? "",
  }));
}

function priceHeader(panel: HTMLElement): string {
  return panel.querySelector("table th[data-price-header]")?.textContent ?? "";
}

function legend(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-legend="land-price"]');
  if (!el) throw new Error("no land-price legend on the map");
  return el;
}

function legendStops(container: HTMLElement): { stops: number[]; labels: string[] } {
  const el = legend(container);
  return {
    stops: JSON.parse(el.dataset.legendStops ?? "null") ?? [],
    labels: [...el.querySelectorAll<HTMLElement>("[data-stop]")].map((s) => s.textContent ?? ""),
  };
}

function mapStub(container: HTMLElement): { landUse: string; stops: number[] | null; rows: unknown[] | null; status: string } {
  const stub = container.querySelector<HTMLElement>('[data-testid="map-stub"]')!;
  return {
    landUse: stub.dataset.landUse ?? "",
    stops: JSON.parse(stub.dataset.landPriceStops ?? "null"),
    rows: JSON.parse(stub.dataset.landPrices ?? "null"),
    status: stub.dataset.landPriceStatus ?? "",
  };
}

const notesOf = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(".source-note")].map((n) => n.textContent ?? "").join("\n");
const footerLive = (c: HTMLElement) => c.querySelector('footer [data-provenance="live"]')?.textContent ?? "";
const footerSample = (c: HTMLElement) => c.querySelector('footer [data-provenance="sample"]')?.textContent ?? "";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("the payload is the committed snapshot's 23 wards, each use with its n", () => {
  it("23 wards in code order; 住宅地 and 商業地 each have ≥ 1 point everywhere; 工業地 is a count only", () => {
    expect(ROWS.map((r) => r.code)).toEqual(TOKYO_WARDS.map((w) => w.code));
    for (const r of ROWS) {
      for (const use of ["residential", "commercial"] as const) {
        expect(r[use].n, `${r.region} ${use}`).toBeGreaterThanOrEqual(1);
        expect(r[use].meanPrice).toBeGreaterThan(0);
        expect(r[use].nContinuing).toBeLessThanOrEqual(r[use].n);
      }
      expect(r.industrial).toEqual({ n: r.industrial.n });
      expect(r.n).toBe(r.residential.n + r.commercial.n + r.industrial.n);
    }
  });
});

describe("the 住宅地 / 商業地 switch — default 住宅地, one switch for every 地価 surface", () => {
  it("住宅地 is pressed by default and named on the bar, the scatter, the table header, the legend and the map", async () => {
    const { container } = await renderSettled();
    const panel = openTab("地価");
    expect(pressed(panel)).toBe("residential");
    expect(surface(panel, "land-price-bar").querySelector("h4")?.textContent).toContain("区別平均価格（住宅地）");
    expect(surface(panel, "land-price-scatter").querySelector("h4")?.textContent).toContain("密度 vs 地価（住宅地）");
    expect(priceHeader(panel)).toContain("平均価格（住宅地）");
    expect(legend(container).textContent).toContain("住宅地");
    expect(mapStub(container).landUse).toBe("residential");
    expect(wardPrices(panel).every((p) => p.use === "residential")).toBe(true);
  });

  it("商業地 moves the bar, the scatter, the table, the legend and the map together", async () => {
    const { container } = await renderSettled();
    const panel = openTab("地価");
    switchUse(panel, "commercial");
    expect(pressed(panel)).toBe("commercial");
    expect(surface(panel, "land-price-bar").querySelector("h4")?.textContent).toContain("区別平均価格（商業地）");
    expect(surface(panel, "land-price-scatter").querySelector("h4")?.textContent).toContain("密度 vs 地価（商業地）");
    expect(priceHeader(panel)).toContain("平均価格（商業地）");
    expect(legend(container).textContent).toContain("商業地");
    expect(legend(container).textContent).not.toContain("住宅地");
    expect(mapStub(container).landUse).toBe("commercial");
    const prices = wardPrices(panel);
    expect(prices).toHaveLength(23);
    for (const p of prices) {
      expect(p.use).toBe("commercial");
      expect(p.mean).toBe(BY_WARD[p.ward].commercial.meanPrice);
      expect(p.n).toBe(BY_WARD[p.ward].commercial.n);
    }
    for (const pt of points(panel)) expect(pt.y).toBe(yOf(BY_WARD[pt.ward].commercial.meanPrice));
    for (const cell of priceCells(panel)) expect(cell.mean).toBe(BY_WARD[cell.ward].commercial.meanPrice);
  });
});

describe("区別平均価格 bar — every ward's mean with its n; the selected ward always shown; 格差 per use", () => {
  it("lists all 23 wards' 住宅地 means, counts and changes from the payload", async () => {
    await renderSettled();
    const panel = openTab("地価");
    const prices = wardPrices(panel);
    expect(prices).toHaveLength(23);
    for (const p of prices) {
      expect(p.mean).toBe(BY_WARD[p.ward].residential.meanPrice);
      expect(p.n).toBe(BY_WARD[p.ward].residential.n);
      expect(p.change).toBe(BY_WARD[p.ward].residential.meanChange);
    }
    expect(surface(panel, "land-price-bar").textContent).toContain(`n=${BY_WARD["千代田区"].residential.n}`);
  });

  it("with 江戸川区 selected the bars shown include it, marked, among the top wards", async () => {
    const { container } = await renderSettled();
    selectWard(container, LOW_WARD);
    const panel = openTab("地価");
    const shown = bars(panel);
    expect(shown.length).toBeGreaterThanOrEqual(10);
    expect(shown.length).toBeLessThanOrEqual(23);
    const edogawa = shown.find((b) => b.ward === LOW_WARD);
    expect(edogawa, "江戸川区 among the bars").toBeDefined();
    expect(edogawa!.selected).toBe(true);
    expect(shown.filter((b) => b.selected)).toHaveLength(1);
    expect(shown.map((b) => b.ward)).toContain("千代田区");
  });

  it("格差 is recomputed per use over the 23 wards", async () => {
    await renderSettled();
    const panel = openTab("地価");
    const gap = () => surface(panel, "land-price-bar").querySelector("[data-gap]")?.textContent ?? "";
    const res = gapOf("residential");
    expect(gap()).toContain(`${res.ratio}倍`);
    expect(gap()).toContain(res.top.replace("区", ""));
    expect(gap()).toContain(res.bottom.replace("区", ""));
    switchUse(panel, "commercial");
    const com = gapOf("commercial");
    expect(gap()).toContain(`${com.ratio}倍`);
    expect(gap()).toContain(com.top.replace("区", ""));
    expect(com.ratio).not.toBe(res.ratio);
  });
});

describe("密度 vs 地価 scatter — 23 points, the selected one highlighted, y domain from all 23", () => {
  it("23-ward view: 23 points, x the census density, y the 住宅地 mean in 万, none selected", async () => {
    await renderSettled();
    const panel = openTab("地価");
    const pts = points(panel);
    expect(pts).toHaveLength(23);
    for (const pt of pts) {
      const demo = DEMOGRAPHICS_23.find((d) => d.region === pt.ward)!;
      expect(pt.x).toBe(demo.density);
      expect(pt.z).toBe(demo.population);
      expect(pt.y).toBe(yOf(BY_WARD[pt.ward].residential.meanPrice));
    }
    expect(pts.filter((p) => p.selected)).toHaveLength(0);
    expect(yDomainMax(panel)).toBe(yOf(Math.max(...means("residential"))));
  });

  it("with 江戸川区 selected: still 23 points, exactly 江戸川区 highlighted, the y domain not its own value (defect c)", async () => {
    const { container } = await renderSettled();
    selectWard(container, LOW_WARD);
    const panel = openTab("地価");
    const pts = points(panel);
    expect(pts).toHaveLength(23);
    expect(pts.filter((p) => p.selected).map((p) => p.ward)).toEqual([LOW_WARD]);
    const own = yOf(BY_WARD[LOW_WARD].residential.meanPrice);
    expect(yDomainMax(panel)).toBe(yOf(Math.max(...means("residential"))));
    expect(yDomainMax(panel)).not.toBe(own);
    expect(yDomainMax(panel)).toBeGreaterThan(own);
  });

  it("a ward the census does not list gets no point — never a point at a made-up coordinate", async () => {
    await renderSettled({ demographics: DEMOGRAPHICS_22 });
    const panel = openTab("地価");
    const pts = points(panel);
    expect(pts).toHaveLength(22);
    expect(pts.map((p) => p.ward)).not.toContain(LOW_WARD);
    expect(pts.some((p) => p.x === 0 || p.z === 0)).toBe(false);
  });

  it("地価 pending → 取得失敗 / 読み込み中 naming 国土数値情報, no point; census pending → the same naming e-Stat", async () => {
    await renderSettled({ land: UNAVAILABLE });
    let scatter = surface(openTab("地価"), "land-price-scatter");
    expect(points(screen.getByRole("tabpanel"))).toHaveLength(0);
    expect(scatter.querySelector('[data-state="unavailable"]')).not.toBeNull();
    expect(scatter.textContent).toContain(FAILED);
    expect(scatter.textContent).toContain(KSJ);
    vi.unstubAllGlobals();

    await renderSettled({ demographics: UNAVAILABLE });
    scatter = surface(screen.getAllByRole("tabpanel").pop()!, "land-price-scatter");
    expect(scatter.querySelector('[data-state="unavailable"]')).not.toBeNull();
    expect(scatter.textContent).toContain(FAILED);
    expect(scatter.textContent).toContain("e-Stat");
    vi.unstubAllGlobals();

    await renderSettled({ land: pending });
    scatter = surface(screen.getAllByRole("tabpanel").pop()!, "land-price-scatter");
    expect(scatter.querySelector('[data-state="loading"]')).not.toBeNull();
    expect(scatter.textContent).toContain(LOADING);
    expect(scatter.querySelectorAll("[data-point]")).toHaveLength(0);
  });
});

describe("地価 choropleth — stops derived from the data per use, legend labels equal to them", () => {
  it("住宅地: three stops from min to max of the 23 means, the legend printing exactly those", async () => {
    const { container } = await renderSettled();
    openTab("地価");
    const { stops, labels } = legendStops(container);
    expect(stops).toHaveLength(3);
    expect(stops[0]).toBe(Math.min(...means("residential")));
    expect(stops[2]).toBe(Math.max(...means("residential")));
    expect(stops[1]).toBeGreaterThan(stops[0]);
    expect(stops[1]).toBeLessThan(stops[2]);
    expect(labels).toEqual(stops.map(man));
    expect(mapStub(container).stops).toEqual(stops);
    expect(mapStub(container).rows).toHaveLength(23);
    expect(legend(container).textContent).toContain("万円/m²");
  });

  it("商業地: the stops and labels move with the switch", async () => {
    const { container } = await renderSettled();
    const panel = openTab("地価");
    switchUse(panel, "commercial");
    const { stops, labels } = legendStops(container);
    expect(stops[0]).toBe(Math.min(...means("commercial")));
    expect(stops[2]).toBe(Math.max(...means("commercial")));
    expect(labels).toEqual(stops.map(man));
    expect(mapStub(container).stops).toEqual(stops);
  });

  it("the legend cites 国土数値情報 with the year under the ramp, not 固定の参考値", async () => {
    const { container } = await renderSettled();
    openTab("地価");
    expect(legend(container).textContent).toContain(KSJ);
    expect(legend(container).textContent).toContain(`${YEAR}年`);
    expect(legend(container).textContent).not.toContain("固定の参考値");
    expect(legend(container).querySelector(SAMPLE_NODE)).toBeNull();
  });
});

describe("区別データテーブル — 平均価格（用途） with n per row", () => {
  it("header names the use and 平均; each row carries the ward's mean in 万 and its n", async () => {
    await renderSettled();
    const panel = openTab("地価");
    expect(priceHeader(panel)).toContain("平均価格（住宅地）");
    const cells = priceCells(panel);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const w = BY_WARD[cell.ward];
      expect(cell.mean).toBe(w.residential.meanPrice);
      expect(cell.n).toBe(w.residential.n);
      expect(cell.text).toContain(man(w.residential.meanPrice));
      expect(cell.text).toContain(`n=${w.residential.n}`);
    }
    expect(panel.querySelector("table")?.closest(".chart-section")?.querySelector(SAMPLE_NODE)).toBeNull();
    expect(panel.textContent).not.toContain("地価列。");
  });

  it("the table's own note names the year and table of the 地価 column from the payload", async () => {
    await renderSettled();
    const panel = openTab("地価");
    const note = panel.querySelector('table ~ * [data-source="land-prices"], .chart-section [data-source="land-prices"]')?.textContent ?? "";
    expect(note).toContain(`${YEAR}年地価公示`);
    expect(note).toContain(TABLE);
  });
});

describe("the year and table on every 地価 surface are read from the payload", () => {
  it("a payload saying 2031年 / L01-99 is what the page says — nowhere the snapshot's year", async () => {
    const { container } = await renderSettled({ land: landSaying(2031, "L01-99", "テスト用の地価ラベル") });
    const panel = openTab("地価");
    for (const name of ["land-price-bar", "land-price-scatter"]) {
      const notes = notesOf(surface(panel, name));
      expect(notes, name).toContain("2031年");
      expect(notes, name).toContain("L01-99");
      expect(notes, name).not.toContain(`${YEAR}年地価公示`);
    }
    expect(panel.textContent).toContain("テスト用の地価ラベル");
    expect(legend(container).textContent).toContain("2031年");
    expect(legend(container).textContent).not.toContain(`${YEAR}年`);
    const live = footerLive(container);
    expect(live).toContain("2031年");
    expect(live).toContain("L01-99");
    expect(live).not.toContain(`${YEAR}年地価公示`);
  });
});

describe("credits — the 加工 form with no editor name, beside the figures and in the footer", () => {
  it("the 地価 tab carries the 出典 line, the 加工 statement, the definitions and the 工業地 count", async () => {
    await renderSettled();
    const panel = openTab("地価");
    const credit = panel.querySelector<HTMLElement>('[data-credit="ksj-l01"]');
    expect(credit).not.toBeNull();
    expect(credit!.textContent).toContain(KSJ_SOURCE);
    expect(credit!.textContent).toContain(EDITED_L01);
    expect(credit!.textContent).not.toMatch(/をもとに.*作成/);
    const notes = notesOf(surface(panel, "land-price-bar"));
    expect(notes).toContain(PRICE_NOTE);
    expect(notes).toContain(CHANGE_NOTE);
    expect(notes).toContain(`${YEAR}年地価公示`);
    expect(notes).toContain("2026年1月1日");
    expect(notes).toContain(`工業地`);
    expect(notes).toContain(String(snapshot.total.industrial.n));
  });

  it("the footer lists 地価公示 under 実データ with the 加工 statement, the year and the table; the sample group no longer lists the 地価 surfaces", async () => {
    const { container } = await renderSettled();
    const live = footerLive(container);
    expect(live).toContain("地価公示");
    expect(live).toContain(KSJ_SOURCE);
    expect(live).toContain(EDITED_L01);
    expect(live).toContain(`${YEAR}年`);
    expect(live).toContain(TABLE);
    const sample = footerSample(container);
    expect(sample).not.toContain("区別平均地価");
    expect(sample).not.toContain("地価列");
    expect(sample).not.toContain("密度 vs 地価");
    // The fixed-value choropleth note now covers only the layers still on WARD_META.
    expect(sample).toContain("地図の塗り分け（人口・災害）");
    expect(sample).not.toContain("地図の塗り分け:");
  });
});

describe("states — 読み込み中 / 取得失敗 / data on every 地価 surface, never a sample label", () => {
  it("before the answer: bar, scatter, table column and legend say 読み込み中; no figure, no SAMPLE", async () => {
    const { container } = await renderSettled({ land: pending });
    const panel = openTab("地価");
    expect(surface(panel, "land-price-bar").textContent).toContain(LOADING);
    expect(wardPrices(panel)).toHaveLength(0);
    expect(surface(panel, "land-price-scatter").textContent).toContain(LOADING);
    const cells = priceCells(panel);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.text).toContain(LOADING);
      expect(cell.mean).toBeNull();
    }
    expect(legend(container).textContent).toContain(LOADING);
    expect(mapStub(container).stops).toBeNull();
    expect(panel.querySelector(SAMPLE_NODE)).toBeNull();
  });

  it("503: bar, scatter, table column and legend say 取得失敗 and name 国土数値情報; no SAMPLE, no figure", async () => {
    const { container } = await renderSettled({ land: UNAVAILABLE });
    const panel = openTab("地価");
    expect(surface(panel, "land-price-bar").textContent).toContain(FAILED);
    expect(surface(panel, "land-price-bar").textContent).toContain(KSJ);
    expect(surface(panel, "land-price-bar").querySelector("[data-gap]")).toBeNull();
    expect(surface(panel, "land-price-scatter").textContent).toContain(FAILED);
    for (const cell of priceCells(panel)) expect(cell.text).toContain(FAILED);
    expect(legend(container).textContent).toContain(FAILED);
    expect(mapStub(container).stops).toBeNull();
    expect(panel.querySelector(SAMPLE_NODE)).toBeNull();
    expect(panel.textContent).not.toContain("データなし");
  });

  it("data: no SAMPLE node anywhere on the 地価 tab, no 取得失敗", async () => {
    await renderSettled();
    const panel = openTab("地価");
    expect(panel.querySelector(SAMPLE_NODE)).toBeNull();
    expect(panel.textContent).not.toContain(FAILED);
    expect(panel.textContent).not.toContain("サンプルデータ");
  });
});

describe("the LP hero is untouched (switched in PR 7 with the downside)", () => {
  it("the hero keeps its SAMPLE tag; the provenance table lists 地価公示 as live, the hero as sample, and the 加工 statement among the notices", () => {
    const { container } = render(<LandingPage />);
    const hero = container.querySelector(".sample-tag");
    expect(hero).not.toBeNull();
    const live = container.querySelector('tbody[data-provenance="live"]')?.textContent ?? "";
    const sample = container.querySelector('tbody[data-provenance="sample"]')?.textContent ?? "";
    expect(live).toContain("地価公示");
    expect(live).toContain(`${YEAR}年`);
    expect(sample).toContain("LP ヒーロー");
    expect(sample).not.toContain("区別平均地価");
    expect(container.querySelector('[data-credit="required"]')?.textContent).toContain(EDITED_L01);
  });
});
