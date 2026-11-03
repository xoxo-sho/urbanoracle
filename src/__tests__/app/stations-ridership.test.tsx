import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * PR 4 of the real-data plan (RECON 2026-10-uo-real-data §9 row 4): stations
 * and ridership, all 23 wards, from 国土数値情報 駅別乗降客数データ S12 (2024年度版)
 * — the committed snapshot /api/v1/transport serves — with the ward of every
 * station decided by point-in-polygon on the N03 行政区域 (Architect decisions
 * 3, 12 and 13, 2026-11-02). ODPT leaves the code path.
 *
 * What the page must say, every claim read from the payload:
 *   K3 日間乗降客  the sum of the selected ward's stations (事業者ごとの合計), its
 *                  year, the definition note and the JR note;
 *   T1            the ward's stations from the payload (top N stated as
 *                  「上位N駅／全M駅」 when cut), each with its figure;
 *   T2 事業者別     per-operator sums whose total equals K3, for a ward and
 *                  for the 23-ward view;
 *   M6            the station legend cites 国土数値情報 and the year;
 *   T3 乗降客数推移 OUT of this PR: still the sample set with its SAMPLE label;
 *   credits       the 加工 form with no editor name, on the tab and in the
 *                  footer; nothing names ODPT anywhere.
 *
 * The figures served here are the committed snapshot's (fixtures/live-data.ts
 * reads backend/data/stations.json); the backend guards derive the same
 * figures from the committed source files. Rendered with the real hook; only
 * fetch is replaced. RED on main (d8d1287).
 */

vi.mock("next/dynamic", () => ({
  default: () =>
    function MapStub(props: { stations?: unknown[]; transportIsLive?: boolean }) {
      return (
        <div data-testid="map-stub" data-stations={JSON.stringify(props.stations ?? null)} data-transport-live={String(props.transportIsLive)} />
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
import { sampleTransportTrends } from "@/data/sample";
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
  loadStationsSnapshot,
  stationsSnapshotRows,
} from "@/__tests__/fixtures/live-data";

const TRANSPORT_ROUTE = "/api/v1/transport";
const LOADING = "読み込み中";
const FAILED = "取得失敗";
const NO_DATA = "データなし";
const SAMPLE_NODE = '[data-provenance="sample"]';
const KSJ = "国土数値情報";
const KSJ_SITE = "https://nlftp.mlit.go.jp/ksj/";
const EDITED_S12 = `「国土数値情報（駅別乗降客数データ）」（国土交通省）（${KSJ_SITE}）を加工して作成`;
const EDITED_N03 = `「国土数値情報（行政区域データ）」（国土交通省）（${KSJ_SITE}）を加工して作成`;
const DEFINITION_NOTE = "事業者ごとの駅別乗降客数の合計（乗換客は事業者ごとに数えられます）";
const JR_NOTE = "JR東日本の値は乗車人員を2倍した値（原典資料による）";
// Built so this file does not itself carry the retired source's name.
const RETIRED = "OD" + "PT";
const RETIRED_JA = "公共交通オープン" + "データ";
const BUNDLED_NOTE = "同梱データ（出典未確認）";

const snapshot = loadStationsSnapshot();
const ROWS = stationsSnapshotRows(snapshot);
const SOURCES = snapshot.sources;
const YEAR = snapshot.year;
const WARDS = Object.fromEntries(snapshot.wards.map((w) => [w.name, w]));
const TOTAL_23 = snapshot.wards.reduce((sum, w) => sum + w.passengers, 0);
const man = (value: number) => `${(value / 10000).toFixed(0)}万`;

type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pending: Route = () => new Promise<Response>(() => {});

const TRANSPORT: Route = json(200, { status: "ok", data: ROWS, isLive: true, sources: SOURCES });
const UNAVAILABLE: Route = json(503, { status: "unavailable" });
const DEMOGRAPHICS: Route = json(200, { status: "ok", data: DEMOGRAPHICS_FIXTURE, isLive: true, sources: DEMOGRAPHICS_SOURCES });
const DISASTER: Route = json(200, { data: [], isLive: false });
const TRENDS: Route = json(200, { status: "ok", data: POPULATION_TRENDS_FIXTURE, isLive: true, sources: POPULATION_TRENDS_SOURCES });
// The 地価公示 snapshot route (PR 5): answers so the page settles (land-prices.test.tsx guards it).
const LAND_PRICES: Route = json(200, { status: "ok", data: LAND_PRICES_FIXTURE, isLive: true, sources: LAND_PRICES_SOURCES });
// The 用途地域 snapshot route (PR 6): answers so the page settles (zoning.test.tsx guards it).
const ZONING: Route = json(200, { status: "ok", data: ZONING_FIXTURE, isLive: true, sources: ZONING_SOURCES, total: ZONING_TOTAL });

/** The same payload with the ridership source moved to another year and table: what the page must then say. */
function transportSaying(year: number, table: string): Route {
  const sources = { ...SOURCES, ridership: { ...SOURCES.ridership, year, table }, stations: { ...SOURCES.stations, year, table } };
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

async function renderSettled(transport: Route = TRANSPORT) {
  const mock = serve({
    "/api/v1/demographics": DEMOGRAPHICS,
    [TRANSPORT_ROUTE]: transport,
    "/api/v1/disaster-risks": DISASTER,
    "/api/v1/population-trends": TRENDS,
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
  return view;
}

function keyMetric(container: HTMLElement, caption: string): HTMLElement {
  const tiles = [...container.querySelectorAll<HTMLElement>(".key-metric")];
  const tile = tiles.find((t) => (t.textContent ?? "").includes(caption));
  if (!tile) throw new Error(`no .key-metric containing "${caption}"`);
  return tile;
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

function stationLegend(container: HTMLElement): HTMLElement {
  const overlays = [...container.querySelectorAll<HTMLElement>(".map-overlay")];
  const legend = overlays.find((el) => (el.textContent ?? "").includes("乗降客数"));
  if (!legend) throw new Error("no 乗降客数 legend on the map");
  return legend;
}

function surface(panel: HTMLElement, name: string): HTMLElement {
  const el = panel.querySelector<HTMLElement>(`[data-surface="${name}"]`);
  if (!el) throw new Error(`no [data-surface="${name}"] on the 交通 tab`);
  return el;
}

/** T1's rows: name -> passengers (null for データなし). */
function stationRows(panel: HTMLElement): { name: string; passengers: number | null }[] {
  return [...surface(panel, "stations").querySelectorAll<HTMLElement>("[data-station]")].map((el) => ({
    name: el.dataset.name ?? "",
    passengers: el.dataset.passengers === "" ? null : Number(el.dataset.passengers),
  }));
}

/** T2's rows: operator -> passengers. */
function operatorRows(panel: HTMLElement): Record<string, number> {
  return Object.fromEntries(
    [...surface(panel, "operators").querySelectorAll<HTMLElement>("[data-operator]")].map((el) => [el.dataset.operator, Number(el.dataset.passengers)])
  );
}

const footerLive = (c: HTMLElement) => c.querySelector('footer [data-provenance="live"]')?.textContent ?? "";
const footerSample = (c: HTMLElement) => c.querySelector('footer [data-provenance="sample"]')?.textContent ?? "";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the payload is the committed snapshot's 23 wards", () => {
  it("every ward has at least one station; 江戸川区 has eleven, 小岩駅 among them and 新小岩駅 in 葛飾区", () => {
    const byWard = new Map<string, string[]>();
    for (const r of ROWS) byWard.set(r.ward ?? "", [...(byWard.get(r.ward ?? "") ?? []), r.name]);
    expect(byWard.size).toBe(23);
    expect(byWard.get("江戸川区")).toHaveLength(11);
    expect(byWard.get("江戸川区")).toContain("小岩駅");
    expect(byWard.get("葛飾区")).toContain("新小岩駅");
    const names = ROWS.map((r) => r.name);
    expect(names).not.toContain("武蔵小杉駅");
    expect(names).not.toContain("日吉駅");
  });
});

describe("K3 日間乗降客 — the ward's rows summed, with its year and the two notes", () => {
  it("23-ward view: the sum over every station, 「YYYY年度」 and the table from the payload, the definition note and the JR note", async () => {
    const { container } = await renderSettled();
    const tile = keyMetric(container, "乗降客");
    expect(tile.textContent).toContain(man(TOTAL_23));
    expect(tile.textContent).toContain(`${YEAR}年度`);
    expect(tile.textContent).toContain(SOURCES.ridership.table);
    expect(tile.textContent).toContain(DEFINITION_NOTE);
    expect(tile.textContent).toContain(JR_NOTE);
    expect(tile.querySelector(SAMPLE_NODE)).toBeNull();
  });

  it("江戸川区, 新宿区, 文京区: the tile equals the snapshot's ward total (the sum of the ward's rows)", async () => {
    const { container } = await renderSettled();
    for (const ward of ["江戸川区", "新宿区", "文京区"]) {
      selectWard(container, ward);
      expect(keyMetric(container, "乗降客").textContent, ward).toContain(man(WARDS[ward].passengers));
    }
  });
});

describe("T1 — the ward's stations from the payload", () => {
  it("江戸川区 lists its eleven stations with their figures, 小岩駅 first; no SAMPLE label, no 取得失敗", async () => {
    const { container } = await renderSettled();
    selectWard(container, "江戸川区");
    const panel = openTab("交通");
    const rows = stationRows(panel);
    expect(rows).toHaveLength(11);
    expect(rows[0].name).toBe("小岩駅");
    expect(rows.reduce((sum, r) => sum + (r.passengers ?? 0), 0)).toBe(WARDS["江戸川区"].passengers);
    expect(surface(panel, "stations").querySelector(SAMPLE_NODE)).toBeNull();
    expect(surface(panel, "stations").textContent).not.toContain(FAILED);
    expect(surface(panel, "stations").textContent).not.toContain(BUNDLED_NOTE);
  });

  it("23-ward view: shows the top N and says 「上位N駅／全M駅」 with M the payload's station count", async () => {
    await renderSettled();
    const panel = openTab("交通");
    const rows = stationRows(panel);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(ROWS.length);
    expect(surface(panel, "stations").textContent).toContain(`上位${rows.length}駅／全${ROWS.length}駅`);
    // Sorted by figure, biggest first.
    const figures = rows.map((r) => r.passengers ?? -1);
    expect([...figures].sort((a, b) => b - a)).toEqual(figures);
  });

  it("a ward view lists every station of the ward and states no cut", async () => {
    const { container } = await renderSettled();
    selectWard(container, "新宿区");
    const panel = openTab("交通");
    expect(stationRows(panel)).toHaveLength(WARDS["新宿区"].stations);
    expect(surface(panel, "stations").textContent).not.toContain("上位");
  });

  it("names the year and the table under the list, from the payload", async () => {
    const { container } = await renderSettled();
    selectWard(container, "文京区");
    const panel = openTab("交通");
    const note = surface(panel, "stations").textContent ?? "";
    expect(note).toContain(`${YEAR}年度`);
    expect(note).toContain(KSJ);
  });
});

describe("T2 事業者別 — per-operator sums that add up to K3", () => {
  it("江戸川区: one figure per operator, the total equals the ward's K3", async () => {
    const { container } = await renderSettled();
    selectWard(container, "江戸川区");
    const panel = openTab("交通");
    const ops = operatorRows(panel);
    const expected: Record<string, number> = {};
    for (const r of ROWS.filter((r) => r.ward === "江戸川区")) {
      for (const o of r.operators ?? []) if (o.passengers !== null) expected[o.name] = (expected[o.name] ?? 0) + o.passengers;
    }
    expect(ops).toEqual(expected);
    expect(Object.values(ops).reduce((a, b) => a + b, 0)).toBe(WARDS["江戸川区"].passengers);
    expect(surface(panel, "operators").textContent).toContain("事業者別");
    expect(keyMetric(container, "乗降客").textContent).toContain(man(WARDS["江戸川区"].passengers));
  });

  it("23-ward view: the operator total equals the 23-ward K3; no per-line figure anywhere", async () => {
    const { container } = await renderSettled();
    const panel = openTab("交通");
    const ops = operatorRows(panel);
    expect(Object.values(ops).reduce((a, b) => a + b, 0)).toBe(TOTAL_23);
    expect(keyMetric(container, "乗降客").textContent).toContain(man(TOTAL_23));
    expect(panel.querySelector("[data-line][data-passengers]")).toBeNull();
    expect(panel.textContent).not.toContain("路線別利用規模");
  });
});

describe("the year on K3, T1, T2 and M6 is read from the payload", () => {
  it("a payload saying 2031年度 / S12-99 is what the page says — nowhere the snapshot's year", async () => {
    const { container } = await renderSettled(transportSaying(2031, "S12-99"));
    const tile = keyMetric(container, "乗降客");
    expect(tile.textContent).toContain("2031年度");
    expect(tile.textContent).toContain("S12-99");
    expect(tile.textContent).not.toContain(`${YEAR}年度`);
    const panel = openTab("交通");
    expect(surface(panel, "stations").textContent).toContain("2031年度");
    expect(surface(panel, "operators").textContent).toContain("2031年度");
    expect(surface(panel, "stations").textContent).not.toContain(`${YEAR}年度`);
    expect(stationLegend(container).textContent).toContain("2031年度");
  });
});

describe("M6 — the station legend and what the map is handed", () => {
  it("ok → the legend cites 国土数値情報 with the year, no SAMPLE; the map gets every station, live", async () => {
    const { container } = await renderSettled();
    openTab("交通");
    const legend = stationLegend(container);
    expect(legend.textContent).toContain(KSJ);
    expect(legend.textContent).toContain(`${YEAR}年度`);
    expect(legend.querySelector(SAMPLE_NODE)).toBeNull();
    const stub = container.querySelector<HTMLElement>('[data-testid="map-stub"]')!;
    expect(JSON.parse(stub.dataset.stations ?? "[]")).toHaveLength(ROWS.length);
    expect(stub.dataset.transportLive).toBe("true");
  });
});

describe("T3 乗降客数推移 stays the sample set (out of this PR)", () => {
  it("keeps its SAMPLE label and takes no S12 value", async () => {
    await renderSettled();
    const panel = openTab("交通");
    const trend = surface(panel, "ridership-trend");
    expect(trend.querySelector(SAMPLE_NODE)).not.toBeNull();
    expect(trend.textContent).not.toContain(KSJ);
    // The only SAMPLE node on the tab is the trend's.
    expect(panel.querySelectorAll(SAMPLE_NODE)).toHaveLength(1);
    expect(sampleTransportTrends.length).toBeGreaterThan(0);
  });
});

describe("credits — the 加工 form with no editor name; nothing names the retired source", () => {
  it("the 交通 tab carries the 出典 line and both 加工 statements beside the figures", async () => {
    await renderSettled();
    const panel = openTab("交通");
    const credit = panel.querySelector<HTMLElement>('[data-credit="ksj"]');
    expect(credit).not.toBeNull();
    const text = credit!.textContent ?? "";
    expect(text).toContain("出典：国土交通省国土数値情報ダウンロードサイト");
    expect(text).toContain(EDITED_S12);
    expect(text).toContain(EDITED_N03);
    expect(text).not.toMatch(/をもとに.*作成/);
    expect(panel.textContent).not.toContain(RETIRED);
    expect(panel.textContent).not.toContain(RETIRED_JA);
    expect(panel.textContent).not.toContain(BUNDLED_NOTE);
  });

  it("the footer lists the stations under 実データ with both 加工 statements, the year and the table; not under sample", async () => {
    const { container } = await renderSettled();
    const live = footerLive(container);
    expect(live).toContain("駅別乗降客数");
    expect(live).toContain(EDITED_S12);
    expect(live).toContain(EDITED_N03);
    expect(live).toContain(`${YEAR}年度`);
    expect(live).toContain(SOURCES.ridership.table);
    expect(live).not.toContain(RETIRED);
    expect(live).not.toContain(RETIRED_JA);
    expect(footerSample(container)).not.toContain("駅別乗降客数");
    expect(footerSample(container)).toContain("乗降客数推移");
    expect(container.textContent).not.toContain(BUNDLED_NOTE);
  });
});

describe("states — 読み込み中 / 取得失敗 / data, no partial path", () => {
  it("before the answer: K3, T1, T2 and the legend say 読み込み中 and show no figure", async () => {
    const { container } = await renderSettled(pending);
    expect(keyMetric(container, "乗降客").textContent).toContain(LOADING);
    const panel = openTab("交通");
    expect(stationRows(panel)).toHaveLength(0);
    expect(panel.textContent).toContain(LOADING);
    expect(stationLegend(container).textContent).toContain(LOADING);
  });

  it("503: K3, T1, T2 and the legend say 取得失敗 and name 国土数値情報; T3 keeps its sample label", async () => {
    const { container } = await renderSettled(UNAVAILABLE);
    expect(keyMetric(container, "乗降客").textContent).toContain(FAILED);
    const panel = openTab("交通");
    expect(stationRows(panel)).toHaveLength(0);
    expect(surface(panel, "stations").textContent).toContain(FAILED);
    expect(surface(panel, "stations").textContent).toContain(KSJ);
    expect(surface(panel, "operators").textContent).toContain(FAILED);
    expect(stationLegend(container).textContent).toContain(FAILED);
    expect(panel.querySelectorAll(SAMPLE_NODE)).toHaveLength(1);
    expect(panel.textContent).not.toContain(NO_DATA);
  });

  it("a station the source counts on another row reads データなし with its note, never 0", async () => {
    const { container } = await renderSettled();
    const withNote = ROWS.find((r) => r.note);
    expect(withNote).toBeDefined();
    selectWard(container, withNote!.ward!);
    const panel = openTab("交通");
    const row = [...surface(panel, "stations").querySelectorAll<HTMLElement>("[data-station]")].find((el) => el.dataset.name === withNote!.name)!;
    expect(row.textContent).toContain(NO_DATA);
    expect(row.textContent).toContain("他路線駅の行に記載");
    expect(row.textContent).not.toContain("0.0万");
  });
});

describe("the retired source is gone from the client source tree", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "__tests__" && entry !== "node_modules") walk(full, out);
      } else if (/\.(ts|tsx|css|json)$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("no file under src/ (tests aside) names it, reads its key or keeps the bundled-data note", () => {
    const root = path.join(process.cwd(), "src");
    const hits = walk(root).filter((file) => {
      const text = readFileSync(file, "utf8");
      return text.toLowerCase().includes(RETIRED.toLowerCase()) || text.includes(RETIRED_JA) || text.includes(BUNDLED_NOTE);
    });
    expect(hits.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
});
