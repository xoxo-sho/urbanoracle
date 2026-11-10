import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * PR 4b of the real-data plan (RECON 2026-10-uo-real-data §9 row 4b): 乗降客数推移
 * from a fixed panel of 国土数値情報 S12 rows, S12's own caveat and 備考 on the
 * transport surfaces, and the 駅一覧 label for a figure counted on another row
 * (Architect decisions 2026-11-09).
 *
 * What the page must say, every figure read from the payload:
 *   T3 乗降客数推移  the panel summed for the selected ward (東京23区 when none)
 *                  over 2018 and 2020–2024; 2019 a gap, never a point, with
 *                  its reason; the coverage — units in the panel / all units
 *                  and the panel's share of the 2024 日間乗降客 — and that the
 *                  sum is not every station's; 読み込み中 / 取得失敗 like the
 *                  rest of the tab; no SAMPLE label;
 *   the notice     S12's own sentence, verbatim with its source: once as a
 *                  full-width line directly under the three key-metric tiles —
 *                  the 日間乗降客 tile carries only a marker pointing to it —
 *                  and on 駅一覧, 事業者別 and T3;
 *   T2             titled 「国土数値情報の記載事業者別（他社線を含む行あり）」;
 *   T1 備考         each figure row's 2024 備考 as S12 writes it;
 *   T1 labels      the five stations no row of which carries a figure read
 *                  「他の行に計上」 with where, or — where S12 names no row —
 *                  「他の行に計上（国土数値情報に記載先の明示なし）」; never データなし;
 *   no sample      no SAMPLE node on the dashboard, no sample group in the
 *                  footer or on the LP, sampleTransportTrends gone.
 *
 * The expected series are summed here from the two committed files — the S12
 * excerpt and the panel — and checked against the verification report's
 * table for the three views the Architect named. Rendered with the real hook;
 * only fetch is replaced. RED on main (069ba50).
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
  ZONING_FIXTURE,
  ZONING_SOURCES,
  ZONING_TOTAL,
  greenPayload,
  loadRidershipPanel,
  loadStationsSnapshot,
  panelViews,
  transportPayload,
} from "@/__tests__/fixtures/live-data";

const TRANSPORT_ROUTE = "/api/v1/transport";
const LOADING = "読み込み中";
const FAILED = "取得失敗";
const NO_DATA = "データなし";
const SAMPLE_NODE = '[data-provenance="sample"]';
const KSJ = "国土数値情報";
const TOKYO23 = "東京23区";
const YEARS = [2018, 2020, 2021, 2022, 2023, 2024];
const GAP_YEAR = 2019;

// S12's own notice (the dataset page's 「その他の情報」) and the part the Architect quoted.
const NOTICE = "各事業者から提供された駅別乗降客数は、各社で独自に算出したものであり、統一的な基準に基づいたものではありませんので、その旨を認識した上でご利用ください。";
const NOTICE_CORE = "各社で独自に算出したものであり、統一的な基準に基づいたものではありません";
const S12_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-S12-2024.html";
const T2_TITLE = "国土数値情報の記載事業者別（他社線を含む行あり）";
// What the 日間乗降客 tile says instead of the sentence: the notice is the line under the tiles.
const K3_MARKER = "※ 下記の注記参照";
const COUNTED = "他の行に計上";
const COUNTED_UNNAMED = "他の行に計上（国土数値情報に記載先の明示なし）";

// The five stations no row of which carries a 2024 figure, as the screen words them.
const LABELS: { ward: string; station: string; label: string; note: string | null }[] = [
  { ward: "新宿区", station: "飯田橋駅", label: COUNTED, note: "乗降客数は千代田区の飯田橋駅（東京メトロ東西線）に含まれます" },
  { ward: "千代田区", station: "溜池山王駅", label: COUNTED, note: "乗降客数は港区の溜池山王駅（東京メトロ銀座線）に含まれます" },
  { ward: "台東区", station: "日暮里駅", label: COUNTED, note: "乗降客数は荒川区の日暮里駅（JR常磐線）に含まれます" },
  { ward: "渋谷区", station: "新宿駅", label: COUNTED, note: "乗降客数は新宿区の新宿駅（京王電鉄京王線、JR中央線）に含まれます" },
  { ward: "墨田区", station: "とうきょうスカイツリー駅", label: COUNTED_UNNAMED, note: null },
];

// The Architect's cross-checks (brief 2026-11-09; the verification report's panel B2 table).
const CROSS_CHECK: Record<string, { panel: number; units: number; share: string; series: number[] }> = {
  [TOKYO23]: { panel: 458, units: 583, share: "79.4", series: [38_851_287, 25_539_168, 26_963_792, 30_566_467, 33_178_126, 34_561_088] },
  新宿区: { panel: 25, units: 37, share: "79.5", series: [4_610_309, 2_897_754, 3_153_901, 3_597_320, 3_870_033, 4_002_737] },
  江戸川区: { panel: 11, units: 11, share: "100.0", series: [674_589, 507_861, 531_098, 573_416, 607_126, 627_375] },
};

const snapshot = loadStationsSnapshot();
const panel = loadRidershipPanel();
// Summed here from the committed excerpt and the committed panel — not from the snapshot.
const EXPECTED = panelViews(panel);

type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pending: Route = () => new Promise<Response>(() => {});
const UNAVAILABLE: Route = json(503, { status: "unavailable" });
const TRANSPORT: Route = json(200, transportPayload(snapshot));

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

async function renderSettled(transport: Route = TRANSPORT) {
  const mock = serve({
    "/api/v1/demographics": json(200, { status: "ok", data: DEMOGRAPHICS_FIXTURE, sources: DEMOGRAPHICS_SOURCES }),
    [TRANSPORT_ROUTE]: transport,
    "/api/v1/disaster-risks": json(200, { status: "ok", data: [] }),
    "/api/v1/population-trends": json(200, { status: "ok", data: POPULATION_TRENDS_FIXTURE, sources: POPULATION_TRENDS_SOURCES }),
    "/api/v1/land-prices": json(200, { status: "ok", data: LAND_PRICES_FIXTURE, sources: LAND_PRICES_SOURCES }),
    "/api/v1/zoning": json(200, { status: "ok", data: ZONING_FIXTURE, sources: ZONING_SOURCES, total: ZONING_TOTAL }),
    "/api/v1/green-land-use": json(200, greenPayload()),
  });
  const view = render(<Home />);
  await waitFor(() => expect(mock).toHaveBeenCalledTimes(7));
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

function selectWard(container: HTMLElement, name: string | null) {
  const select = container.querySelector<HTMLSelectElement>("header select");
  if (!select) throw new Error("no ward selector in the header");
  fireEvent.change(select, { target: { value: name ?? "" } });
}

function surface(panelEl: HTMLElement, name: string): HTMLElement {
  const el = panelEl.querySelector<HTMLElement>(`[data-surface="${name}"]`);
  if (!el) throw new Error(`no [data-surface="${name}"] on the 交通 tab`);
  return el;
}

function keyMetric(container: HTMLElement, caption: string): HTMLElement {
  const tile = [...container.querySelectorAll<HTMLElement>(".key-metric")].find((t) => (t.textContent ?? "").includes(caption));
  if (!tile) throw new Error(`no .key-metric containing "${caption}"`);
  return tile;
}

/** T3's points as the page states them: year -> passengers. */
function trendPoints(trend: HTMLElement): { year: number; passengers: number }[] {
  return [...trend.querySelectorAll<HTMLElement>("[data-trend-point]")].map((el) => ({
    year: Number(el.dataset.year),
    passengers: Number(el.dataset.passengers),
  }));
}

function stationRow(panelEl: HTMLElement, name: string): HTMLElement {
  const row = [...surface(panelEl, "stations").querySelectorAll<HTMLElement>("[data-station]")].find((el) => el.dataset.name === name);
  if (!row) throw new Error(`no 駅一覧 row for ${name}`);
  return row;
}

const share = (view: { passengers: number; series: { passengers: number }[] }) =>
  ((100 * view.series[view.series.length - 1].passengers) / view.passengers).toFixed(1);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the expected series: the committed panel summed over the committed S12 excerpt", () => {
  it("has the panel's six years, 2019 not among them, for 東京23区 and the 23 wards", () => {
    expect(panel.years).toEqual(YEARS);
    expect(panel.gapYears).toEqual([GAP_YEAR]);
    expect(Object.keys(EXPECTED)).toHaveLength(24);
  });

  it("equals the verification report's table for 東京23区, 新宿区 and 江戸川区", () => {
    for (const [name, check] of Object.entries(CROSS_CHECK)) {
      const view = EXPECTED[name];
      expect([view.panelUnits, view.units], name).toEqual([check.panel, check.units]);
      expect(view.series.map((p) => p.passengers), name).toEqual(check.series);
      expect(share(view), name).toBe(check.share);
    }
  });

  it("is what the snapshot the route serves carries, view by view", () => {
    for (const view of snapshot.trend.views) {
      const e = EXPECTED[view.name];
      expect(view.series, view.name).toEqual(e.series);
      expect([view.panelUnits, view.units, view.passengers], view.name).toEqual([e.panelUnits, e.units, e.passengers]);
    }
  });
});

describe("T3 乗降客数推移 — the panel's sum for the view, from the payload", () => {
  it("no ward selected: 東京23区's six points with their values, in order; no SAMPLE label; cites 国土数値情報", async () => {
    await renderSettled();
    const trend = surface(openTab("交通"), "ridership-trend");
    expect(trend.textContent).toContain("乗降客数推移");
    expect(trend.textContent).toContain(TOKYO23);
    expect(trendPoints(trend)).toEqual(EXPECTED[TOKYO23].series);
    expect(trendPoints(trend).map((p) => p.passengers)).toEqual(CROSS_CHECK[TOKYO23].series);
    expect(trend.querySelector(SAMPLE_NODE)).toBeNull();
    expect(trend.textContent).toContain(KSJ);
    expect(trend.textContent).toContain(snapshot.sources.trend.table);
  });

  it("follows the selected ward: 新宿区, then 江戸川区, then 東京23区 again", async () => {
    const { container } = await renderSettled();
    const tab = openTab("交通");
    for (const ward of ["新宿区", "江戸川区"]) {
      selectWard(container, ward);
      const trend = surface(tab, "ridership-trend");
      expect(trendPoints(trend), ward).toEqual(EXPECTED[ward].series);
      expect(trendPoints(trend).map((p) => p.passengers), ward).toEqual(CROSS_CHECK[ward].series);
      expect(trend.textContent, ward).toContain(ward);
      expect(trend.textContent, ward).not.toContain(TOKYO23);
    }
    selectWard(container, null);
    expect(trendPoints(surface(tab, "ridership-trend"))).toEqual(EXPECTED[TOKYO23].series);
  });

  it("every ward's points equal the panel summed over the excerpt", async () => {
    const { container } = await renderSettled();
    const tab = openTab("交通");
    for (const ward of snapshot.wards.map((w) => w.name)) {
      selectWard(container, ward);
      expect(trendPoints(surface(tab, "ridership-trend")), ward).toEqual(EXPECTED[ward].series);
    }
  });

  it("2019 is a gap — stated, never a point, never a value — with its reason from the payload", async () => {
    const { container } = await renderSettled();
    const tab = openTab("交通");
    for (const ward of [null, "新宿区", "江戸川区"]) {
      selectWard(container, ward);
      const trend = surface(tab, "ridership-trend");
      expect(trendPoints(trend).map((p) => p.year)).not.toContain(GAP_YEAR);
      const gaps = [...trend.querySelectorAll<HTMLElement>("[data-trend-gap]")];
      expect(gaps.map((g) => Number(g.dataset.year))).toEqual([GAP_YEAR]);
      expect(gaps[0].dataset.passengers).toBeUndefined();
      const reason = trend.querySelector<HTMLElement>("[data-trend-gap-reason]");
      expect(reason?.textContent).toContain(snapshot.trend.gaps[0].text);
      expect(reason?.textContent).toContain("2019年度は表示しません");
      expect(reason?.textContent).toContain("前年度（2018年度）と同じ値");
      expect(reason?.textContent).toContain("東日本旅客鉄道");
    }
  });

  it("states the coverage of the view: panel units / all units, the share of the 2024 日間乗降客, and that it is not every station's sum", async () => {
    const { container } = await renderSettled();
    const tab = openTab("交通");
    for (const [name, check] of Object.entries(CROSS_CHECK)) {
      selectWard(container, name === TOKYO23 ? null : name);
      const coverage = surface(tab, "ridership-trend").querySelector<HTMLElement>("[data-trend-coverage]");
      expect(coverage, name).not.toBeNull();
      expect([Number(coverage!.dataset.panelUnits), Number(coverage!.dataset.units)], name).toEqual([check.panel, check.units]);
      expect(coverage!.dataset.share, name).toBe(check.share);
      const text = coverage!.textContent ?? "";
      expect(text, name).toContain(`${check.panel}単位`);
      expect(text, name).toContain(`全${check.units}単位`);
      expect(text, name).toContain(`${check.share}%`);
      expect(text, name).toContain("2024年度");
      expect(text, name).toContain("日間乗降客");
      if (check.panel < check.units) {
        expect(text, name).toContain("すべての駅の合計ではありません");
        expect(text, name).toContain("日間乗降客とは一致しません");
      } else {
        // Every unit of the ward is in the panel: the 2024 point is the ward's 日間乗降客.
        expect(text, name).toContain("日間乗降客と一致します");
        expect(text, name).not.toContain("一致しません");
      }
    }
  });

  it("the coverage of every ward equals the recomputation", async () => {
    const { container } = await renderSettled();
    const tab = openTab("交通");
    for (const ward of snapshot.wards.map((w) => w.name)) {
      selectWard(container, ward);
      const coverage = surface(tab, "ridership-trend").querySelector<HTMLElement>("[data-trend-coverage]")!;
      const e = EXPECTED[ward];
      expect([Number(coverage.dataset.panelUnits), Number(coverage.dataset.units), coverage.dataset.share], ward).toEqual([e.panelUnits, e.units, share(e)]);
    }
  });

  it("the years and the values are the payload's: another payload, another chart", async () => {
    const body = transportPayload(snapshot);
    const shifted = {
      ...body,
      total: {
        ...body.total,
        trend: {
          ...body.total.trend,
          years: [2031, 2033],
          gaps: [{ year: 2032, text: "2032年度は表示しません：試験用の理由" }],
          views: body.total.trend.views.map((v) => ({ ...v, units: 9, panelUnits: 4, passengers: 1000, panelPassengers: 250, series: [{ year: 2031, passengers: 111 }, { year: 2033, passengers: 250 }] })),
        },
        // Follow-up 3: the operators' own figures' notice names their 年度 — the payload's too, so the swapped payload says something else.
        operatorFigures: { ...body.total.operatorFigures, notice: ["試験用の注記"] },
      },
    };
    await renderSettled(json(200, shifted));
    const trend = surface(openTab("交通"), "ridership-trend");
    expect(trendPoints(trend)).toEqual([{ year: 2031, passengers: 111 }, { year: 2033, passengers: 250 }]);
    expect([...trend.querySelectorAll<HTMLElement>("[data-trend-gap]")].map((g) => g.dataset.year)).toEqual(["2032"]);
    expect(trend.textContent).toContain("試験用の理由");
    const coverage = trend.querySelector<HTMLElement>("[data-trend-coverage]")!;
    expect([coverage.dataset.panelUnits, coverage.dataset.units, coverage.dataset.share]).toEqual(["4", "9", "25.0"]);
    expect(coverage.textContent).toContain("2033年度");
    for (const y of YEARS) expect(trend.textContent).not.toContain(`${y}年度`);
  });
});

describe("T3 — the states of the tab, never a sample", () => {
  it("before the answer: 読み込み中, no point, no gap, no coverage", async () => {
    await renderSettled(pending);
    const trend = surface(openTab("交通"), "ridership-trend");
    expect(trend.textContent).toContain(LOADING);
    expect(trendPoints(trend)).toHaveLength(0);
    expect(trend.querySelector("[data-trend-gap]")).toBeNull();
    expect(trend.querySelector("[data-trend-coverage]")).toBeNull();
    expect(trend.querySelector(SAMPLE_NODE)).toBeNull();
  });

  it("503: 取得失敗, names 国土数値情報, no point; no SAMPLE node on the tab", async () => {
    await renderSettled(UNAVAILABLE);
    const tab = openTab("交通");
    const trend = surface(tab, "ridership-trend");
    expect(trend.textContent).toContain(FAILED);
    expect(trend.textContent).toContain(KSJ);
    expect(trendPoints(trend)).toHaveLength(0);
    expect(tab.querySelectorAll(SAMPLE_NODE)).toHaveLength(0);
    expect(tab.textContent).not.toContain(NO_DATA);
  });

  it("an answer without the trend says データなし for it — no point, no sample — and keeps the stations", async () => {
    const body = transportPayload(snapshot);
    await renderSettled(json(200, { status: body.status, data: body.data, sources: body.sources }));
    const tab = openTab("交通");
    const trend = surface(tab, "ridership-trend");
    expect(trend.textContent).toContain(NO_DATA);
    expect(trendPoints(trend)).toHaveLength(0);
    expect(trend.querySelector(SAMPLE_NODE)).toBeNull();
    expect(surface(tab, "stations").querySelectorAll("[data-station]").length).toBeGreaterThan(0);
  });
});

describe("S12's own notice — verbatim, with its source, on every transport surface", () => {
  it("the snapshot carries the sentence of the S12 page and where it is", () => {
    expect(snapshot.notes.source_notice).toBe(NOTICE);
    expect(snapshot.notes.source_notice).toContain(NOTICE_CORE);
    expect(snapshot.notes.source_notice_at).toContain(S12_PAGE);
  });

  it("駅一覧, 事業者別 and 乗降客数推移 each show it whole, naming 国土数値情報 駅別乗降客数データ", async () => {
    await renderSettled();
    const tab = openTab("交通");
    const surfaces: [string, HTMLElement][] = [
      ["駅一覧", surface(tab, "stations")],
      ["事業者別", surface(tab, "operators")],
      ["乗降客数推移", surface(tab, "ridership-trend")],
    ];
    for (const [name, el] of surfaces) {
      const notice = el.querySelector<HTMLElement>('[data-notice="s12"]');
      expect(notice, name).not.toBeNull();
      expect(notice!.textContent, name).toContain(NOTICE);
      expect(notice!.textContent, name).toContain(NOTICE_CORE);
      expect(notice!.textContent, name).toContain("国土数値情報 駅別乗降客数データ");
    }
  });

  // Architect decision 2026-11-09 (layout): inside the tile the sentence made
  // it tall and stretched the other two. The tile keeps a marker; the
  // sentence stands once, full width, directly under the three tiles.
  it("日間乗降客: the tile carries only the marker; the sentence stands once as the line directly under the three tiles", async () => {
    const { container } = await renderSettled();
    const tile = keyMetric(container, "乗降客");
    expect(tile.textContent).toContain(K3_MARKER);
    expect(tile.textContent).not.toContain(NOTICE);
    expect(tile.textContent).not.toContain(NOTICE_CORE);
    for (const t of container.querySelectorAll(".key-metric")) expect(t.querySelector('[data-notice="s12"]')).toBeNull();

    const row = tile.parentElement!;
    expect([...row.children].filter((c) => c.classList.contains("key-metric"))).toHaveLength(3);
    const line = row.nextElementSibling as HTMLElement | null;
    expect(line?.dataset.surface).toBe("ridership-notice");
    const notice = line!.querySelector<HTMLElement>('[data-notice="s12"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain(NOTICE);
    expect(notice!.textContent).toContain("国土数値情報 駅別乗降客数データ");
    // The line answers the tile's marker, and it is the only one outside the tab panel and the footer.
    expect(line!.textContent?.trimStart().startsWith("※")).toBe(true);
    const outside = [...container.querySelectorAll<HTMLElement>('[data-notice="s12"]')].filter((el) => !el.closest('[role="tabpanel"]') && !el.closest("footer"));
    expect(outside).toHaveLength(1);
  });

  it("holds with a ward selected, and the footer's stations entry carries it with the page it is on", async () => {
    const { container } = await renderSettled();
    selectWard(container, "江戸川区");
    const tab = openTab("交通");
    const tile = keyMetric(container, "乗降客");
    expect(tile.textContent).toContain(K3_MARKER);
    expect(tile.textContent).not.toContain(NOTICE_CORE);
    expect(container.querySelector('[data-surface="ridership-notice"] [data-notice="s12"]')?.textContent).toContain(NOTICE);
    expect(surface(tab, "ridership-trend").querySelector('[data-notice="s12"]')?.textContent).toContain(NOTICE);
    const footer = container.querySelector('footer [data-provenance="live"]')?.textContent ?? "";
    expect(footer).toContain(NOTICE);
    expect(footer).toContain(S12_PAGE);
  });

  it("is not shown while there is nothing to qualify: 読み込み中 and 取得失敗 carry no notice, no line and no marker", async () => {
    const { container } = await renderSettled(UNAVAILABLE);
    openTab("交通");
    expect(container.querySelector('[data-notice="s12"]')).toBeNull();
    expect(container.querySelector('[data-surface="ridership-notice"]')).toBeNull();
    expect(keyMetric(container, "乗降客").textContent).not.toContain(K3_MARKER);
  });
});

describe("T2 — the title says whose rows these are", () => {
  it("reads 「国土数値情報の記載事業者別（他社線を含む行あり）」", async () => {
    await renderSettled();
    const operators = surface(openTab("交通"), "operators");
    expect(operators.querySelector("h4")?.textContent).toBe(T2_TITLE);
  });
});

describe("T1 — each figure row's 2024 備考, as S12 writes it", () => {
  it("新宿区: 新宿駅 shows the 京王線 row's and the 中央線 row's 備考", async () => {
    const { container } = await renderSettled();
    selectWard(container, "新宿区");
    const row = stationRow(openTab("交通"), "新宿駅");
    const remarks = [...row.querySelectorAll<HTMLElement>("[data-remark]")].map((el) => el.textContent ?? "");
    expect(remarks.some((t) => t.includes("京王新線、東京都・10号線新宿線・12号線大江戸線を含む") && t.includes("京王線"))).toBe(true);
    expect(remarks.some((t) => t.includes("山手線を含む") && t.includes("中央線"))).toBe(true);
  });

  it("every listed station shows every 備考 of its figure rows, and no station shows one it does not have", async () => {
    const { container } = await renderSettled();
    const tab = openTab("交通");
    let seen = 0;
    for (const ward of snapshot.wards.map((w) => w.name)) {
      selectWard(container, ward);
      for (const s of snapshot.stations.filter((st) => st.ward === ward)) {
        const id = `s12-${s.code}-${s.wardCode}`;
        const row = [...surface(tab, "stations").querySelectorAll<HTMLElement>("[data-station]")].find((el) => el.dataset.stationId === id);
        if (!row) throw new Error(`no 駅一覧 row for ${ward} ${s.name} (${id})`);
        const shown = [...row.querySelectorAll<HTMLElement>("[data-remark]")].map((el) => [el.dataset.operator, el.dataset.line, el.dataset.text]);
        expect(shown, `${ward} ${s.name}`).toEqual((s.remarks ?? []).map((r) => [r.operator, r.line, r.text]));
        for (const r of s.remarks ?? []) expect(row.textContent, `${ward} ${s.name}`).toContain(r.text);
        seen += shown.length;
      }
    }
    expect(seen).toBe(snapshot.stations.reduce((n, s) => n + (s.remarks?.length ?? 0), 0));
    expect(seen).toBeGreaterThanOrEqual(60); // 69 on S12-25
  });
});

describe("T1 — a station whose figure S12 counts on another row", () => {
  it("the snapshot has exactly the five, each without a figure", () => {
    const five = snapshot.stations.filter((s) => s.dailyPassengers === null).map((s) => `${s.ward} ${s.name}駅`);
    expect(five.sort()).toEqual(LABELS.map((l) => `${l.ward} ${l.station}`).sort());
  });

  it.each(LABELS)("$ward $station: 「$label」, with where it is counted when S12 names it — never データなし, never 0", async ({ ward, station, label, note }) => {
    const { container } = await renderSettled();
    selectWard(container, ward);
    const row = stationRow(openTab("交通"), station);
    expect(row.dataset.passengers).toBe("");
    const cell = row.querySelector<HTMLElement>("[data-counted-elsewhere]");
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe(label);
    expect(row.textContent).not.toContain(NO_DATA);
    expect(row.textContent).not.toContain("0.0万");
    expect(row.textContent).not.toContain("他路線駅の行に記載");
    const noteEl = row.querySelector<HTMLElement>("[data-counted-note]");
    if (note === null) {
      expect(noteEl).toBeNull();
      expect(row.textContent).not.toContain("含まれます");
    } else {
      expect(noteEl?.textContent).toBe(note);
    }
  });

  it("a station with a figure carries no such label", async () => {
    const { container } = await renderSettled();
    selectWard(container, "江戸川区");
    const tab = openTab("交通");
    expect(surface(tab, "stations").querySelector("[data-counted-elsewhere]")).toBeNull();
    expect(surface(tab, "stations").textContent).not.toContain(COUNTED);
  });
});

describe("no sample is left on the dashboard, in its footer or on the LP", () => {
  it("no SAMPLE node on any tab, the map legend or the footer; the footer has no sample group", async () => {
    const { container } = await renderSettled();
    for (const tab of ["人口", "地価", "災害", "交通", "用途地域"]) {
      openTab(tab);
      expect(container.querySelectorAll(SAMPLE_NODE), tab).toHaveLength(0);
      expect(container.textContent, tab).not.toContain("SAMPLE");
      expect(container.textContent, tab).not.toContain("サンプルデータ");
    }
    expect(container.querySelector(`footer ${SAMPLE_NODE}`)).toBeNull();
    for (const ward of ["新宿区", "江戸川区"]) {
      selectWard(container, ward);
      expect(container.querySelectorAll(SAMPLE_NODE), ward).toHaveLength(0);
    }
  });

  it("the footer lists 乗降客数推移 under 実データ with the panel years, the table and the 加工 credit", async () => {
    const { container } = await renderSettled();
    const entry = container.querySelector<HTMLElement>('footer [data-provenance="live"] [data-source="ridership-trend"]');
    expect(entry).not.toBeNull();
    const text = entry!.textContent ?? "";
    expect(text).toContain("乗降客数推移");
    expect(text).toContain(snapshot.sources.trend.table);
    expect(text).toContain("2018年度");
    expect(text).toContain("2024年度");
    expect(text).toContain("を加工して作成");
  });

  it("neither listed nor counted while /transport has not answered", async () => {
    const { container } = await renderSettled(UNAVAILABLE);
    expect(container.querySelector('footer [data-source="ridership-trend"]')).toBeNull();
    expect(container.querySelector(`footer ${SAMPLE_NODE}`)).toBeNull();
  });

  it("the LP's データ出典 table has no sample group and lists 乗降客数推移 under 実データ", () => {
    const lp = render(<LandingPage />).container;
    expect(lp.querySelector(`tbody${SAMPLE_NODE}`)).toBeNull();
    expect(lp.querySelectorAll(SAMPLE_NODE)).toHaveLength(0);
    expect(lp.textContent).not.toContain("サンプルデータ");
    const live = lp.querySelector('tbody[data-provenance="live"]')?.textContent ?? "";
    expect(live).toContain("乗降客数推移");
    expect(live).toContain("2018");
  });

  it("src/data/sample.ts is gone (real-data plan PR 9; the layer list lives in src/lib/layers.ts)", () => {
    expect(existsSync(path.join(process.cwd(), "src/data/sample.ts"))).toBe(false);
  });

  it("nothing under src/ names sampleTransportTrends or the TransportTrend type — tests included", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== "node_modules") walk(full, out);
        } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
      }
      return out;
    };
    const self = path.join("src", "__tests__", "app", "ridership-trend.test.tsx");
    const needle = new RegExp(["sampleTransport" + "Trends", "\\bTransport" + "Trend\\b"].join("|"));
    const hits = walk(path.join(process.cwd(), "src"))
      .map((f) => path.relative(process.cwd(), f))
      .filter((f) => f !== self && needle.test(readFileSync(path.join(process.cwd(), f), "utf8")));
    expect(hits).toEqual([]);
  });
});
