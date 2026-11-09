import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * PR 8 of the real-data plan (RECON 2026-10-uo-real-data §9 row 8), Architect
 * decisions 6 and 7 (2026-11-09): the radar and its 23区平均 polygon go; a
 * comparison table 「23区の中での位置」 takes their place — one row per measure,
 * each with the ward's value and unit, the source with its 時点 (from the
 * payload), the 23-ward rank on a 1–23 scale labelled 順位 (largest first,
 * stated; ties share a rank, stated; no 0–100 score anywhere) and the 23区
 * figure computed for the 23 wards as a whole. Seven rows:
 *
 *   1 人口密度              /demographics density (PR 2)
 *   2 人口増減率 2020→2025   /demographics growthRate (PR 2)
 *   3 住宅地 平均価格 (n)    /land-prices (PR 5)
 *   4 日間乗降客 per km²     /transport K3 ÷ the census area (PR 4 ÷ PR 2)
 *   5 総合危険度ランク5の町丁目の割合   /disaster-risks (PR 7)
 *   6 浸水深3m以上の面積割合（想定最大規模） /disaster-risks (PR 7)
 *   7 公園等・農用地・森林・原野の面積割合   /green-land-use (PR 8, decision 6)
 *
 * Each row follows PR 1's states on its own. Plus: the 人口 choropleth reads the
 * census payload (stops from the data, legend labels equal to them) and its
 * tooltip prints the census population and density with unit and year; the
 * 津波 source line prints 「A40-23」 once; sampleWardProfiles is gone;
 * 乗降客数推移 stays SAMPLE.
 *
 * Every expected figure is recomputed below from the committed snapshots and
 * PR 2's committed e-Stat expected values. RED on main (56bdbf6).
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
import MapLegend from "@/components/map/MapLegend";
import { dataLayers } from "@/data/sample";
import {
  CENSUS_ROWS,
  DEMOGRAPHICS_SOURCES,
  POPULATION_TRENDS_FIXTURE,
  POPULATION_TRENDS_SOURCES,
  disasterSnapshotRows,
  disasterSnapshotTotal,
  greenSnapshotRows,
  greenSnapshotTotal,
  landPricesSnapshotRows,
  landPricesSnapshotTotal,
  loadDisasterSnapshot,
  loadGreenSnapshot,
  loadLandPricesSnapshot,
  loadStationsSnapshot,
  loadZoningSnapshot,
  stationsSnapshotRows,
  zoningSnapshotRows,
  zoningSnapshotTotal,
} from "@/__tests__/fixtures/live-data";

const LOADING = "読み込み中";
const FAILED = "取得失敗";
const SAMPLE_LABEL = "サンプルデータ（暫定）";
const TITLE = "23区の中での位置";
const GREEN_LABEL = "公園等・農用地・森林・原野の面積割合";
const TOCHI_TITLE = "東京の土地利用 令和３年東京都区部（表－１）令和３年土地面積（区部・区別）";
const TOKYO_CC_BY = "クリエイティブ・コモンズ・ライセンス 表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）";

// ---- the payloads ----------------------------------------------------------------
const land = loadLandPricesSnapshot();
const LAND_ROWS = landPricesSnapshotRows(land);
const LAND_TOTAL = landPricesSnapshotTotal(land);
const stations = loadStationsSnapshot();
const STATION_ROWS = stationsSnapshotRows(stations);
const disaster = loadDisasterSnapshot();
const DIS_ROWS = disasterSnapshotRows(disaster);
const DIS_TOTAL = disasterSnapshotTotal(disaster);
const green = loadGreenSnapshot();
const GREEN_ROWS = greenSnapshotRows(green);
const GREEN_TOTAL = greenSnapshotTotal(green);
const zoning = loadZoningSnapshot();
const WARDS = CENSUS_ROWS.map((r) => r.region);

type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pending: Route = () => new Promise<Response>(() => {});
const UNAVAILABLE: Route = json(503, { status: "unavailable" });

const ROUTES: Record<string, Route> = {
  "/api/v1/demographics": json(200, { status: "ok", data: CENSUS_ROWS, isLive: true, sources: DEMOGRAPHICS_SOURCES }),
  "/api/v1/transport": json(200, { status: "ok", data: STATION_ROWS, isLive: true, sources: stations.sources }),
  "/api/v1/disaster-risks": json(200, { status: "ok", data: DIS_ROWS, isLive: true, sources: disaster.sources, total: DIS_TOTAL }),
  "/api/v1/population-trends": json(200, { status: "ok", data: POPULATION_TRENDS_FIXTURE, isLive: true, sources: POPULATION_TRENDS_SOURCES }),
  "/api/v1/land-prices": json(200, { status: "ok", data: LAND_ROWS, isLive: true, sources: land.sources, total: LAND_TOTAL }),
  "/api/v1/zoning": json(200, { status: "ok", data: zoningSnapshotRows(zoning), isLive: true, sources: zoning.sources, total: zoningSnapshotTotal(zoning) }),
  "/api/v1/green-land-use": json(200, { status: "ok", data: GREEN_ROWS, isLive: true, sources: green.sources, total: GREEN_TOTAL }),
};

function serve(overrides: Record<string, Route> = {}) {
  const routes = { ...ROUTES, ...overrides };
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch: ${url}`);
    return route();
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function renderSettled(overrides: Record<string, Route> = {}) {
  const mock = serve(overrides);
  const view = render(<Home />);
  await waitFor(() => expect(mock).toHaveBeenCalledTimes(Object.keys(ROUTES).length));
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return view;
}

function selectWard(container: HTMLElement, name: string) {
  const select = container.querySelector<HTMLSelectElement>("header select");
  if (!select) throw new Error("no ward selector");
  fireEvent.change(select, { target: { value: name } });
}

const table = (c: HTMLElement) => {
  const el = c.querySelector<HTMLElement>('[data-surface="ward-comparison"]');
  if (!el) throw new Error("no comparison table");
  return el;
};
const row = (c: HTMLElement, key: string) => {
  const el = table(c).querySelector<HTMLElement>(`[data-measure="${key}"]`);
  if (!el) throw new Error(`no row ${key}`);
  return el;
};

// ---- the expected figures, recomputed --------------------------------------------
const byName = <T extends { region: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.region, r])) as Record<string, T>;
const census = byName(CENSUS_ROWS);
const area = Object.fromEntries(CENSUS_ROWS.map((r) => [r.region, r.areaKm2]));
const k3 = Object.fromEntries(
  WARDS.map((w) => [w, STATION_ROWS.filter((s) => s.ward === w).reduce((s, x) => s + (x.dailyPassengers ?? 0), 0)])
);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const totalArea = sum(WARDS.map((w) => area[w]));
const totalPop = sum(WARDS.map((w) => census[w].population!));
const pop2020 = sum(WARDS.map((w) => census[w].population! / (1 + census[w].growthRate! / 100)));

const VALUES: Record<string, Record<string, number>> = {
  density: Object.fromEntries(WARDS.map((w) => [w, census[w].density!])),
  growth: Object.fromEntries(WARDS.map((w) => [w, census[w].growthRate!])),
  price: Object.fromEntries(LAND_ROWS.map((r) => [r.region, r.residential.meanPrice])),
  ridership: Object.fromEntries(WARDS.map((w) => [w, k3[w] / area[w]])),
  rank5: Object.fromEntries(DIS_ROWS.map((r) => [r.region, r.earthquake.rank5Share])),
  flood: Object.fromEntries(DIS_ROWS.map((r) => [r.region, r.flood.deepShare])),
  green: Object.fromEntries(GREEN_ROWS.map((r) => [r.region, r.share])),
};
const TOTALS: Record<string, number> = {
  density: Math.round(totalPop / totalArea),
  growth: (totalPop / pop2020 - 1) * 100,
  price: (LAND_TOTAL.residential as { meanPrice: number }).meanPrice,
  ridership: sum(WARDS.map((w) => k3[w])) / totalArea,
  rank5: DIS_TOTAL.earthquake.rank5Share,
  flood: DIS_TOTAL.flood.deepShare,
  green: GREEN_TOTAL.share,
};
/** Competition ranking, largest first: 1 + the number of wards with a larger value. */
const rankOf = (key: string, ward: string) => 1 + WARDS.filter((w) => VALUES[key][w] > VALUES[key][ward]).length;
const tiedOf = (key: string, ward: string) => WARDS.filter((w) => VALUES[key][w] === VALUES[key][ward]).length > 1;

const share = (v: number) => (v > 0 && v < 0.05 ? "0.1%未満" : `${v.toFixed(1)}%`);
const FORMAT: Record<string, (v: number) => string> = {
  density: (v) => `${Math.round(v).toLocaleString("ja-JP")}人/km²`,
  growth: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
  price: (v) => `${(v / 10000).toFixed(0)}万円/m²`,
  ridership: (v) => `${Math.round(v).toLocaleString("ja-JP")}人/日/km²`,
  rank5: share,
  flood: share,
  green: share,
};
const ORDER: Record<string, string> = {
  density: "値の大きい順",
  growth: "値の大きい順",
  price: "値の大きい順",
  ridership: "値の大きい順",
  rank5: "割合の高い順",
  flood: "割合の高い順",
  green: "割合の高い順",
};
const SOURCE_WORDS: Record<string, string[]> = {
  density: [DEMOGRAPHICS_SOURCES.density.label, "2025年"],
  growth: [DEMOGRAPHICS_SOURCES.growthRate.label, "2025年"],
  price: [land.sources.price.label],
  ridership: [stations.sources.ridership.label, "面積"],
  rank5: [disaster.sources.earthquake.label],
  flood: [disaster.sources.flood.label],
  green: [green.sources.green.label, "2021年"],
};
const KEYS = Object.keys(VALUES);

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("the inputs recomputed from the committed files", () => {
  it("all seven measures have 23 values; the 23区 figures are over the 23 wards as a whole", () => {
    for (const k of KEYS) expect(Object.keys(VALUES[k]).length, k).toBe(23);
    expect(Math.abs(VALUES.green["千代田区"] - 6.86)).toBeLessThan(0.01);
    expect(Math.abs(VALUES.green["江戸川区"] - 11.9)).toBeLessThan(0.01);
    // The 2020 base recovered from each ward's growth rate is the census's own.
    const expected2020 = sum(Object.values(census).map((r) => r.population! / (1 + r.growthRate! / 100)));
    expect(Math.abs(expected2020 - pop2020)).toBeLessThan(1);
  });
});

describe("the radar is gone; 「23区の中での位置」 takes its place", () => {
  it("no radar surface, no 0–100 score, no 23区平均 polygon; the table carries the seven rows in order", async () => {
    const { container } = await renderSettled();
    expect(container.querySelector('[data-surface="ward-radar"]')).toBeNull();
    expect(container.querySelector(".recharts-polar-grid")).toBeNull();
    const t = table(container);
    expect(t.textContent).toContain(TITLE);
    expect([...t.querySelectorAll<HTMLElement>("[data-measure]")].map((r) => r.dataset.measure)).toEqual(KEYS);
    expect(t.textContent).not.toContain("0–100");
    expect(t.textContent).not.toContain("23区平均");
    expect(t.textContent).toContain("同値は同順位");
    for (const word of ["良い", "悪い", "優れ", "劣", "スコア"]) expect(t.textContent).not.toContain(word);
  });

  for (const ward of ["千代田区", "江戸川区"]) {
    it(`${ward}: every row's value, unit, source/時点, rank (largest first, ties shared) and the 23区 figure`, async () => {
      const { container } = await renderSettled();
      selectWard(container, ward);
      for (const k of KEYS) {
        const r = row(container, k);
        expect(r.dataset.state, k).toBe("ok");
        const value = r.querySelector<HTMLElement>("[data-value]")!;
        expect(Number(value.dataset.value), k).toBeCloseTo(VALUES[k][ward], 6);
        expect(value.textContent, k).toContain(FORMAT[k](VALUES[k][ward]));
        const rank = r.querySelector<HTMLElement>("[data-rank]")!;
        expect(Number(rank.dataset.rank), k).toBe(rankOf(k, ward));
        expect(rank.textContent, k).toContain(`${rankOf(k, ward)}位`);
        expect(rank.dataset.tied, k).toBe(String(tiedOf(k, ward)));
        expect(r.textContent, k).toContain(ORDER[k]);
        const scale = r.querySelector<HTMLElement>("[data-rank-scale]")!;
        expect(scale.getAttribute("aria-label"), k).toContain("順位");
        expect(scale.textContent, k).toContain("1");
        expect(scale.textContent, k).toContain("23");
        const total = r.querySelector<HTMLElement>("[data-total]")!;
        expect(Number(total.dataset.total), k).toBeCloseTo(TOTALS[k], 6);
        expect(total.textContent, k).toContain(FORMAT[k](TOTALS[k]));
        const source = r.querySelector<HTMLElement>("[data-source]")!.textContent ?? "";
        for (const w of SOURCE_WORDS[k]) expect(source, `${k} source`).toContain(w);
      }
      const price = row(container, "price");
      const n = LAND_ROWS.find((x) => x.region === ward)!.residential.n;
      expect(price.textContent).toContain(`n=${n}`);
      expect(price.textContent).toContain("住宅地");
    });
  }

  it("ties share a rank: the ten wards with no 町丁目 at rank 5 all read the same 順位", async () => {
    const zeros = WARDS.filter((w) => VALUES.rank5[w] === 0);
    expect(zeros.length).toBeGreaterThan(1);
    const { container } = await renderSettled();
    const ranks = new Set<number>();
    for (const w of zeros.slice(0, 3)) {
      selectWard(container, w);
      ranks.add(Number(row(container, "rank5").querySelector<HTMLElement>("[data-rank]")!.dataset.rank));
    }
    expect([...ranks]).toEqual([23 - zeros.length + 1]);
  });

  it("no ward selected: per row the 23区 figure and the highest and lowest ward with their values", async () => {
    const { container } = await renderSettled();
    for (const k of KEYS) {
      const r = row(container, k);
      expect(Number(r.querySelector<HTMLElement>("[data-total]")!.dataset.total), k).toBeCloseTo(TOTALS[k], 6);
      const sorted = [...WARDS].sort((a, b) => VALUES[k][b] - VALUES[k][a]);
      const max = r.querySelector<HTMLElement>("[data-max]")!;
      const min = r.querySelector<HTMLElement>("[data-min]")!;
      expect(max.textContent, k).toContain(FORMAT[k](VALUES[k][sorted[0]]));
      expect(min.textContent, k).toContain(FORMAT[k](VALUES[k][sorted[22]]));
      const maxWards = WARDS.filter((w) => VALUES[k][w] === VALUES[k][sorted[0]]);
      expect(maxWards.some((w) => max.textContent!.includes(w)), k).toBe(true);
      expect(r.querySelector("[data-rank]"), k).toBeNull();
    }
  });

  it("each row follows PR 1's states on its own: /disaster-risks down → only rows 5–6 say 取得失敗; /transport pending → only row 4 says 読み込み中", async () => {
    let view = await renderSettled({ "/api/v1/disaster-risks": UNAVAILABLE });
    selectWard(view.container, "江戸川区");
    for (const k of KEYS) {
      const r = row(view.container, k);
      if (k === "rank5" || k === "flood") {
        expect(r.dataset.state, k).toBe("unavailable");
        expect(r.textContent, k).toContain(FAILED);
        expect(r.querySelector("[data-rank]"), k).toBeNull();
      } else {
        expect(r.dataset.state, k).toBe("ok");
        expect(r.textContent, k).not.toContain(FAILED);
      }
    }
    view.unmount();
    vi.unstubAllGlobals();
    const mock = serve({ "/api/v1/transport": pending });
    view = render(<Home />);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(Object.keys(ROUTES).length));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(row(view.container, "ridership").dataset.state).toBe("loading");
    expect(row(view.container, "ridership").textContent).toContain(LOADING);
    expect(row(view.container, "density").dataset.state).toBe("ok");
  });

  it("a partial census answer (growthRate unavailable) fails only row 2", async () => {
    const partial = json(200, {
      status: "partial",
      unavailable: ["growthRate"],
      data: CENSUS_ROWS.map((r) => ({ ...r, growthRate: null })),
      isLive: true,
      sources: { ...DEMOGRAPHICS_SOURCES, growthRate: undefined },
    });
    const { container } = await renderSettled({ "/api/v1/demographics": partial });
    expect(row(container, "growth").dataset.state).toBe("unavailable");
    expect(row(container, "growth").textContent).toContain(FAILED);
    expect(row(container, "density").dataset.state).toBe("ok");
  });

  it("the 公園等・農用地・森林・原野 row names what it counts, never a bare 緑地; its credit is the 都's CC BY form with the 改変 sentence", async () => {
    const { container } = await renderSettled();
    const r = row(container, "green");
    expect(r.textContent).toContain(GREEN_LABEL);
    expect(r.textContent).not.toMatch(/(^|[^・])緑地/);
    const live = container.querySelector('footer [data-provenance="live"]')?.textContent ?? "";
    expect(live).toContain(`このサービスは、以下の著作物を改変して利用しています。${TOCHI_TITLE}、東京都、${TOKYO_CC_BY}`);
  });
});

// Imported at run time so that, on main, each guard below fails on its own rather than the file failing to load.
const CENSUS_MAP = "@/lib/census-map";
type CensusMap = {
  densityStops: (rows: typeof CENSUS_ROWS) => number[] | null;
  censusTooltip: (row: (typeof CENSUS_ROWS)[number] | null, sources: object, status: string) => { population: string; density: string };
};
const loadCensusMap = () => import(/* @vite-ignore */ CENSUS_MAP) as Promise<CensusMap>;

describe("the 人口 map fill and tooltip read the census payload", () => {
  it("legend stops are [min, median, max] of the 23 densities and the labels equal them; no 固定の参考値", async () => {
    const { densityStops } = await loadCensusMap();
    const values = CENSUS_ROWS.map((r) => r.density!).sort((a, b) => a - b);
    const stops = densityStops(CENSUS_ROWS);
    expect(stops).toEqual([values[0], values[11], values[22]]);
    const layers = dataLayers.map((l) => ({ ...l, enabled: l.id === "demographics" }));
    const { container } = render(
      <MapLegend layers={layers} transportStatus="ok" landPriceStatus="ok" disasterStatus="ok" censusStatus="ok" censusSources={DEMOGRAPHICS_SOURCES} densityStops={stops} />
    );
    const legend = container.querySelector<HTMLElement>('[data-legend="demographics"]')!;
    expect(JSON.parse(legend.dataset.legendStops ?? "null")).toEqual(stops);
    expect([...legend.querySelectorAll("[data-stop]")].map((s) => s.textContent)).toEqual(stops!.map((v) => v.toLocaleString("ja-JP")));
    expect(legend.textContent).not.toContain("固定の参考値");
    expect(legend.textContent).toContain("2025年国勢調査");
  });

  it("the tooltip prints the census population and density with unit and year (千代田区 66,270人)", async () => {
    const { censusTooltip } = await loadCensusMap();
    const chiyoda = census["千代田区"];
    expect(chiyoda.population).toBe(66270);
    const lines = censusTooltip(chiyoda, DEMOGRAPHICS_SOURCES, "ok");
    expect(lines.population).toBe("66,270人（2025年国勢調査）");
    expect(lines.density).toBe(`${chiyoda.density!.toLocaleString("ja-JP")}人/km²（2025年国勢調査）`);
    expect(censusTooltip(null, {}, "loading").population).toBe(LOADING);
    expect(censusTooltip(null, {}, "unavailable").density).toBe(FAILED);
  });

  it("no hand-typed 人口 figures remain: WARD_META's 人口 fields and the fixed density stops are gone", () => {
    const wb = readFileSync(resolve(process.cwd(), "src/data/ward-boundaries.ts"), "utf8");
    expect(wb).not.toContain("67927");
    expect(wb).not.toMatch(/density:\s*\d/);
    const mv = readFileSync(resolve(process.cwd(), "src/components/map/MapView.tsx"), "utf8");
    expect(mv).not.toMatch(/5000,\s*c\.neutral3/);
    expect(mv).not.toMatch(/23000,\s*c\.neutral1/);
  });
});

describe("the 津波 source line prints 「A40-23」 once", () => {
  it("on the 災害 tab", async () => {
    const { container } = await renderSettled();
    fireEvent.click(screen.getByRole("tab", { name: "災害" }));
    const note = container.querySelector('[data-surface="disaster-tsunami"] .source-note')?.textContent ?? "";
    expect(note.split("A40-23").length - 1).toBe(1);
  });
});

describe("what is deleted and what stays sample", () => {
  const ROOT = process.cwd();
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "__tests__" && entry !== "node_modules") walk(full, out);
      } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }
  it("sampleWardProfiles, the WardProfile type and the radar component are gone; nothing in src reads them", () => {
    expect(existsSync(resolve(ROOT, "src/components/dashboard/WardRadar.tsx"))).toBe(false);
    const readers = walk(resolve(ROOT, "src")).filter((f) => /\bsampleWardProfiles\b|\bWardRadar\b|\bWardProfile\b/.test(readFileSync(f, "utf8")));
    expect(readers.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it("乗降客数推移 stays SAMPLE; the footer's and the LP's sample groups list only it", async () => {
    const { container } = await renderSettled();
    fireEvent.click(screen.getByRole("tab", { name: "交通" }));
    const panel = screen.getByRole("tabpanel");
    expect(panel.textContent).toContain("乗降客数推移");
    expect(panel.textContent).toContain(SAMPLE_LABEL);
    const footer = container.querySelector('footer [data-provenance="sample"]')?.textContent ?? "";
    expect(footer).toContain("乗降客数推移");
    expect(footer).not.toContain("区別総合比較");
    expect(footer).not.toContain("塗り分け");
    const lp = render(<LandingPage />).container;
    const sample = lp.querySelector('tbody[data-provenance="sample"]')?.textContent ?? "";
    expect(sample).toContain("乗降客数推移");
    expect(sample).not.toContain("レーダー");
    expect(sample).not.toContain("塗り分け");
    const live = lp.querySelector('tbody[data-provenance="live"]')?.textContent ?? "";
    expect(live).toContain("土地利用");
  });
});
