import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Follow-up 3, decision A (Architect, 2026-11-09): 東京都交通局's own figures
 * beside S12's — option 3.
 *
 * What the page must say, every claim read from the payload:
 *   駅一覧   under every 都営地下鉄 and 日暮里・舎人ライナー station-line of the
 *            ward in view, 東京都交通局's published 乗降人員 with its 年度 beside
 *            S12's figure for the same rows — 「東京都交通局の公表値（2024年度）：
 *            209,882」 — including the station-lines S12 writes on another row
 *            (押上, 目黒, 白金高輪, 白金台, 新宿, 九段下) and the second lines at
 *            三田, 大門, 春日, 神保町 and 森下; the liner's with 2023年度;
 *   sums     日間乗降客, 事業者別, 乗降客数推移 and the comparison table are S12's
 *            as before — no number in them changes;
 *   notice   on every transport surface, right after S12's own notice, the
 *            payload's sentences: the sums use 国土数値情報's values; 都営 rows also
 *            show 交通局's figure, which counts transfers between 都営 lines on
 *            both lines; at 46 rows S12's 2024年度 value is below it;
 *   credit   the センター's CC BY credit in its prescribed form, beside the
 *            駅一覧 and in the footer; nothing names an API host or a key.
 *
 * The figures served are the committed snapshot's (fixtures/live-data.ts reads
 * backend/data/stations.json); the backend guards derive the same figures
 * from the committed source files. Rendered with the real hook; only fetch is
 * replaced. RED on main (9010a53).
 */

vi.mock("next/dynamic", () => ({
  default: () =>
    function MapStub(props: { stations?: unknown[]; transportStatus?: string }) {
      return <div data-testid="map-stub" data-stations={JSON.stringify(props.stations ?? null)} data-transport-status={String(props.transportStatus)} />;
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
import {
  CENSUS_ROWS,
  DEMOGRAPHICS_SOURCES,
  LAND_PRICES_FIXTURE,
  LAND_PRICES_SOURCES,
  POPULATION_TRENDS_FIXTURE,
  POPULATION_TRENDS_SOURCES,
  ZONING_FIXTURE,
  ZONING_SOURCES,
  ZONING_TOTAL,
  greenPayload,
  loadStationsSnapshot,
  stationsSnapshotRows,
  transportTotal,
} from "@/__tests__/fixtures/live-data";
import { TOEI_EDITED, TOEI_PROVIDER } from "@/lib/credits";

const snapshot = loadStationsSnapshot();
const ROWS = stationsSnapshotRows(snapshot);
const SOURCES = snapshot.sources;
const TOTAL = transportTotal(snapshot);
const YEAR = snapshot.year;
const OPERATOR = "東京都";
const LINER = "日暮里・舎人ライナー";
const SUBWAY_LINES = ["1号線浅草線", "6号線三田線", "10号線新宿線", "12号線大江戸線"];

// The Architect's spot-check and the sums that must not move (brief 2026-11-09).
const SENGAKUJI = { own: 209_882, s12: 33_601 };
const EDOGAWA_K3 = 627_375;
const TOKYO23_K3 = 43_538_060;
const TOKYO23_T3_2024 = 34_561_088;
const BELOW_ROWS = 46;
const NO_OWN_ROW: [station: string, ward: string, line: string][] = [
  ["押上", "墨田区", "1号線浅草線"],
  ["目黒", "品川区", "6号線三田線"],
  ["白金高輪", "港区", "6号線三田線"],
  ["白金台", "港区", "6号線三田線"],
  ["新宿", "新宿区", "10号線新宿線"],
  ["新宿", "渋谷区", "12号線大江戸線"],
  ["九段下", "千代田区", "10号線新宿線"],
];
const SECOND_LINES: [station: string, ward: string, line: string][] = [
  ["三田", "港区", "6号線三田線"],
  ["大門", "港区", "12号線大江戸線"],
  ["春日", "文京区", "12号線大江戸線"],
  ["神保町", "千代田区", "10号線新宿線"],
  ["森下", "江東区", "12号線大江戸線"],
];
const RETIRED_HOSTS = ["api." + "od" + "pt.org", "api-public." + "od" + "pt.org"];
const RETIRED_KEY = "consumer" + "Key";

type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const TRANSPORT: Route = json(200, { status: "ok", data: ROWS, sources: SOURCES, total: TOTAL });
/** The same payload with no own figures anywhere: what the page must then not say. */
const WITHOUT_OWN_FIGURES: Route = json(200, {
  status: "ok",
  data: ROWS.map((r) => {
    const copy = { ...r };
    delete copy.ownFigures;
    return copy;
  }),
  sources: SOURCES,
  total: { code: TOTAL.code, name: TOTAL.name, trend: TOTAL.trend },
});
// The census rows with their 面積調 area, so the comparison table can divide K3 by it.
const DEMOGRAPHICS: Route = json(200, { status: "ok", data: CENSUS_ROWS, sources: DEMOGRAPHICS_SOURCES });
const DISASTER: Route = json(200, { status: "ok", data: [] });
const TRENDS: Route = json(200, { status: "ok", data: POPULATION_TRENDS_FIXTURE, sources: POPULATION_TRENDS_SOURCES });
const LAND_PRICES: Route = json(200, { status: "ok", data: LAND_PRICES_FIXTURE, sources: LAND_PRICES_SOURCES });
const ZONING: Route = json(200, { status: "ok", data: ZONING_FIXTURE, sources: ZONING_SOURCES, total: ZONING_TOTAL });

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
    "/api/v1/transport": transport,
    "/api/v1/disaster-risks": DISASTER,
    "/api/v1/population-trends": TRENDS,
    "/api/v1/land-prices": LAND_PRICES,
    "/api/v1/zoning": ZONING,
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

function selectWard(container: HTMLElement, name: string) {
  const select = container.querySelector<HTMLSelectElement>("header select");
  if (!select) throw new Error("no ward selector in the header");
  fireEvent.change(select, { target: { value: name } });
}

function surface(root: HTMLElement, name: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`[data-surface="${name}"]`);
  if (!el) throw new Error(`no [data-surface="${name}"]`);
  return el;
}

function stationRow(panel: HTMLElement, name: string): HTMLElement {
  const row = [...surface(panel, "stations").querySelectorAll<HTMLElement>("[data-station]")].find((el) => el.dataset.name === `${name}駅`);
  if (!row) throw new Error(`no station row for ${name}`);
  return row;
}

/** The row of one station record — by id, since a ward can hold two stations of one name (the two 浅草 of 台東区). */
function stationRowById(panel: HTMLElement, id: string): HTMLElement {
  const row = surface(panel, "stations").querySelector<HTMLElement>(`[data-station][data-station-id="${id}"]`);
  if (!row) throw new Error(`no station row ${id}`);
  return row;
}

interface OwnFigureRow {
  operator: string;
  line: string;
  year: number;
  passengers: number;
  s12: number | null;
  text: string;
}
function ownFigureRows(row: HTMLElement): OwnFigureRow[] {
  return [...row.querySelectorAll<HTMLElement>("[data-own-figure]")].map((el) => ({
    operator: el.dataset.operator ?? "",
    line: el.dataset.line ?? "",
    year: Number(el.dataset.year),
    passengers: Number(el.dataset.passengers),
    s12: el.dataset.s12 === "" ? null : Number(el.dataset.s12),
    text: el.textContent ?? "",
  }));
}

const keyMetric = (container: HTMLElement, caption: string) => {
  const tile = [...container.querySelectorAll<HTMLElement>(".key-metric")].find((t) => (t.textContent ?? "").includes(caption));
  if (!tile) throw new Error(`no .key-metric containing "${caption}"`);
  return tile;
};
const footerLive = (c: HTMLElement) => c.querySelector('footer [data-provenance="live"]')?.textContent ?? "";
const toeiNotices = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-notice="toei"]')].map((n) => n.textContent ?? "");
const TRANSPORT_SURFACES = ["stations", "operators", "ridership-trend"] as const;

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("駅一覧 — 東京都交通局's figure with its 年度 beside S12's, on every 都営 station-line", () => {
  it("泉岳寺: 「東京都交通局の公表値（2024年度）：209,882」 beside S12's 33,601, and the station's own figure stays S12's", async () => {
    const { container } = await renderSettled();
    selectWard(container, "港区");
    const row = stationRow(openTab("交通"), "泉岳寺");
    expect(row.dataset.passengers).toBe(String(SENGAKUJI.s12));
    const [figure, ...rest] = ownFigureRows(row);
    expect(rest).toEqual([]);
    expect(figure).toMatchObject({ operator: OPERATOR, line: "1号線浅草線", year: YEAR, passengers: SENGAKUJI.own, s12: SENGAKUJI.s12 });
    expect(figure.text).toContain(`東京都交通局の公表値（${YEAR}年度）：209,882`);
    expect(figure.text).toContain(`国土数値情報（${YEAR}年度）：33,601`);
    expect(figure.text).toContain("都営 1号線浅草線");
  });

  it("a station S12 writes on another row still shows 交通局's figure, and S12's side says 他の行に計上 (押上 and the five others)", async () => {
    const { container } = await renderSettled();
    for (const [station, ward, line] of NO_OWN_ROW) {
      selectWard(container, ward);
      const row = stationRow(openTab("交通"), station);
      const figure = ownFigureRows(row).find((f) => f.line === line);
      expect(figure, `${station} ${line}`).toBeDefined();
      expect(figure!.s12).toBeNull();
      expect(figure!.passengers).toBeGreaterThan(0);
      expect(figure!.year).toBe(YEAR);
      expect(figure!.text).toContain("他の行に計上");
      expect(figure!.text).toContain(`東京都交通局の公表値（${YEAR}年度）：${figure!.passengers.toLocaleString("ja-JP")}`);
    }
  });

  it("三田's second line and the four others are shown under their station in its ward", async () => {
    const { container } = await renderSettled();
    for (const [station, ward, line] of SECOND_LINES) {
      selectWard(container, ward);
      const figures = ownFigureRows(stationRow(openTab("交通"), station));
      expect(figures.map((f) => f.line), `${station}`).toContain(line);
      expect(figures.find((f) => f.line === line)!.s12).toBeNull();
      expect(figures.length).toBe(2);
    }
    selectWard(container, "港区");
    const mita = ownFigureRows(stationRow(openTab("交通"), "三田"));
    expect(mita.map((f) => f.line)).toEqual(["1号線浅草線", "6号線三田線"]);
    expect(mita[0].s12).toBe(mita[0].passengers > 0 ? snapshot.stations.find((s) => s.name === "三田" && s.ward === "港区")!.ownFigures![0].s12 : null);
  });

  it("a 日暮里・舎人ライナー station shows the latest open figure, 2023年度, beside S12's 2024年度 value", async () => {
    const { container } = await renderSettled();
    selectWard(container, "荒川区");
    const [figure] = ownFigureRows(stationRow(openTab("交通"), "日暮里"));
    expect(figure.line).toBe(LINER);
    expect(figure.year).toBe(2023);
    expect(figure.text).toContain("東京都交通局の公表値（2023年度）：");
    expect(figure.text).toContain(`国土数値情報（${YEAR}年度）：`);
    expect(figure.s12).toBeGreaterThan(0);
    expect(figure.passengers).toBeGreaterThan(figure.s12!);
  });

  it("every ward: exactly the payload's own figures are on screen, each on its station, with its line, 年度, value and S12's", async () => {
    const { container } = await renderSettled();
    let seen = 0;
    for (const ward of snapshot.wards) {
      selectWard(container, ward.name);
      const panel = openTab("交通");
      for (const station of ROWS.filter((r) => r.ward === ward.name)) {
        const want = station.ownFigures ?? [];
        const got = ownFigureRows(stationRowById(panel, station.id));
        expect(got.map((f) => ({ operator: f.operator, line: f.line, year: f.year, passengers: f.passengers, s12: f.s12 })), station.name).toEqual(want);
        for (const f of want) expect([...SUBWAY_LINES, LINER]).toContain(f.line);
        seen += want.length;
      }
    }
    expect(seen).toBe(TOTAL.operatorFigures.stationLines);
    expect(seen).toBe(118);
  });

  it("a payload without own figures shows none, no notice and no credit for them", async () => {
    const { container } = await renderSettled(WITHOUT_OWN_FIGURES);
    selectWard(container, "港区");
    const panel = openTab("交通");
    expect(panel.querySelector("[data-own-figure]")).toBeNull();
    expect(panel.querySelector('[data-notice="toei"]')).toBeNull();
    expect(panel.querySelector('[data-credit="toei"]')).toBeNull();
    expect(container.querySelector('footer [data-source="operator-figures"]')).toBeNull();
  });
});

describe("every sum stays on S12 — nothing the own figures touch is added anywhere", () => {
  it("K3 江戸川区 627,375 and 23区 43,538,060; 事業者別 totals equal K3; T3 23区 2024年度 34,561,088", async () => {
    const { container } = await renderSettled();
    const panel = openTab("交通");
    expect(Number(surface(panel, "operators").querySelector<HTMLElement>("[data-operators-total]")?.dataset.operatorsTotal)).toBe(TOKYO23_K3);
    expect(keyMetric(container, "乗降客").textContent).toContain(`${(TOKYO23_K3 / 10000).toFixed(0)}万`);
    const point = surface(panel, "ridership-trend").querySelector<HTMLElement>('[data-trend-point][data-year="2024"]');
    expect(Number(point?.dataset.passengers)).toBe(TOKYO23_T3_2024);
    selectWard(container, "江戸川区");
    const edogawa = openTab("交通");
    expect(Number(surface(edogawa, "operators").querySelector<HTMLElement>("[data-operators-total]")?.dataset.operatorsTotal)).toBe(EDOGAWA_K3);
    // The 都営 bar in 事業者別 is S12's sum, not 交通局's.
    selectWard(container, "港区");
    const minato = openTab("交通");
    const toei = surface(minato, "operators").querySelector<HTMLElement>(`[data-operator="${OPERATOR}"]`);
    const s12Sum = ROWS.filter((r) => r.ward === "港区").reduce((sum, r) => sum + (r.operators?.find((o) => o.name === OPERATOR)?.passengers ?? 0), 0);
    const ownSum = ROWS.filter((r) => r.ward === "港区").reduce((sum, r) => sum + (r.ownFigures ?? []).reduce((a, f) => a + f.passengers, 0), 0);
    expect(Number(toei?.dataset.passengers)).toBe(s12Sum);
    expect(ownSum).not.toBe(s12Sum);
  });

  it("the comparison table's 乗降客 measure (K3 ÷ area) is S12's K3 over the census area, not 交通局's", async () => {
    const { container } = await renderSettled();
    selectWard(container, "江東区");
    const row = surface(container, "ward-comparison").querySelector<HTMLElement>('[data-measure="ridership"]');
    expect(row?.dataset.state).toBe("ok");
    const area = CENSUS_ROWS.find((d) => d.region === "江東区")!.areaKm2;
    const k3 = ROWS.filter((r) => r.ward === "江東区").reduce((sum, r) => sum + (r.dailyPassengers ?? 0), 0);
    const withOwn = ROWS.filter((r) => r.ward === "江東区").reduce((sum, r) => sum + (r.ownFigures ?? []).reduce((a, f) => a + f.passengers - (f.s12 ?? 0), 0), 0);
    expect(withOwn).toBeGreaterThan(0);
    expect(Number(row?.querySelector<HTMLElement>("[data-value]")?.dataset.value)).toBeCloseTo(k3 / area, 3);
  });
});

describe("the notice — the payload's three sentences, facts only, on every transport surface after S12's", () => {
  it("under the tiles, on 駅一覧, 事業者別, 乗降客数推移 and in the footer", async () => {
    const { container } = await renderSettled();
    const sentences = TOTAL.operatorFigures.notice;
    expect(sentences).toHaveLength(3);
    const notice = container.querySelector<HTMLElement>('[data-surface="ridership-notice"]')!;
    expect(notice.querySelector('[data-notice="s12"]')).not.toBeNull();
    for (const s of sentences) expect(notice.querySelector('[data-notice="toei"]')?.textContent).toContain(s);
    const panel = openTab("交通");
    for (const name of TRANSPORT_SURFACES) {
      const el = surface(panel, name);
      const s12 = el.querySelector('[data-notice="s12"]');
      expect(s12, name).not.toBeNull();
      const toei = toeiNotices(el);
      expect(toei, name).toHaveLength(1);
      for (const s of sentences) expect(toei[0]).toContain(s);
      // After S12's own notice, never before it.
      expect(s12!.compareDocumentPosition(el.querySelector('[data-notice="toei"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const live = footerLive(container);
    for (const s of sentences) expect(live).toContain(s);
  });

  it("states the three facts with the payload's counts and 年度: the sums are 国土数値情報's; 交通局's figure counts 都営 transfers on both lines; 46 rows below", () => {
    const [sums, shown, rows] = TOTAL.operatorFigures.notice;
    expect(sums).toContain("国土数値情報");
    for (const w of ["日間乗降客", "事業者別", "乗降客数推移", "23区の中での位置"]) expect(sums).toContain(w);
    expect(shown).toContain("東京都交通局の公表値");
    expect(shown).toContain(`都営地下鉄 ${YEAR}年度`);
    expect(shown).toContain(`${LINER} 2023年度`);
    expect(shown).toContain("都営地下鉄の路線どうしの乗り換えは両方の路線で数えられています");
    expect(rows).toContain(`${BELOW_ROWS}行`);
    expect(TOTAL.operatorFigures.below).toEqual({ rows: BELOW_ROWS, subway: 44, liner: 2, s12Year: YEAR });
    for (const s of TOTAL.operatorFigures.notice) for (const w of ["ため", "原因", "理由"]) expect(s).not.toContain(w);
  });
});

describe("the credit — the センター's prescribed CC BY form; no API host or key on the page", () => {
  it("beside 駅一覧 and in the footer, character for character the snapshot's", async () => {
    const { container } = await renderSettled();
    const panel = openTab("交通");
    const credit = panel.querySelector<HTMLElement>('[data-credit="toei"]');
    expect(credit?.textContent).toBe(snapshot.credit.toei_edited);
    expect(TOEI_EDITED).toBe(snapshot.credit.toei_edited);
    expect(TOEI_EDITED).toContain(TOEI_PROVIDER);
    expect(TOEI_EDITED).toContain("クリエイティブ・コモンズ・ライセンス　表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）");
    expect(TOEI_EDITED.startsWith("このサービスは、以下の著作物を改変して利用しています。 ")).toBe(true);
    const live = footerLive(container);
    expect(live).toContain(snapshot.credit.toei_edited);
    expect(live).toContain(SOURCES.operatorFigures.label);
    expect(live).toContain("合計には不使用");
    for (const host of RETIRED_HOSTS) expect(container.textContent).not.toContain(host);
    expect(container.textContent).not.toContain(RETIRED_KEY);
  });
});
