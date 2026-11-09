import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * PR 7 of the real-data plan (RECON 2026-10-uo-real-data §9 row 7): 災害 and
 * the LP hero from measured sources (Architect decisions 1, 8, 11 and the
 * sub-decisions of 2026-11-05).
 *
 * What the page must say, every claim read from the payload:
 *   K2         「総合危険度ランク5の町丁目」 — the count with its denominator,
 *              「5（全199町丁目中）」 for 江戸川区, 「85（全3,138町丁目中）」 for
 *              the 23区 — and the source line 「東京都 地域危険度 第9回（2022年）」;
 *              no 高リスク wording, no threshold of ours;
 *   災害 tab    each hazard in its own classes with its source and 時点:
 *              地震 (町丁目 per rank 1–5 for 総合・建物倒壊・火災, stated as a
 *              relative evaluation), 洪水 (share of the ward's area per 浸水深
 *              class, 想定最大規模, and the ≥ 3 m share), 土砂 (警戒区域 /
 *              特別警戒区域 per 現象, 0 where none), 津波 (対象外 with its
 *              basis), 高潮 (share per class, 2020年度版); no Lv.1–5, no 件
 *              counts, no 高リスク; PR 1 states on every surface;
 *   choropleth the share of the ward's 町丁目 at 総合危険度 rank 5, stops from
 *              the data and legend labels equal to them;
 *   overlay    洪水 (想定最大規模) and 急傾斜地 tiles, no 津波 tiles, each with
 *              「出典：ハザードマップポータルサイト」;
 *   hero       the six wards with the highest L01 住宅地 平均変動率 (継続地点),
 *              each with its 地震 and 洪水 figure labelled; no SAMPLE tag,
 *              no 安全度; header and units name the surveys and definitions;
 *   lists      no 災害 or hero entry left in the footer's or the LP's sample
 *              lists; the radar stays sample (PR 8).
 *
 * The figures served here are the committed snapshot's (fixtures/live-data.ts
 * reads backend/data/disaster_risks.json); the backend guards derive them from
 * the committed source files. Rendered with the real hook; only fetch is
 * replaced. RED on main (deeb49d).
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
import { TOKYO_WARDS } from "@/lib/wards";
import {
  DEMOGRAPHICS_FIXTURE,
  DEMOGRAPHICS_SOURCES,
  LAND_PRICES_SOURCES,
  POPULATION_TRENDS_FIXTURE,
  POPULATION_TRENDS_SOURCES,
  disasterSnapshotRows,
  disasterSnapshotTotal,
  landPricesSnapshotRows,
  loadDisasterSnapshot,
  loadHeroSpread,
  loadLandPricesSnapshot,
  loadZoningSnapshot,
  zoningSnapshotRows,
  zoningSnapshotTotal,
  greenPayload,
} from "@/__tests__/fixtures/live-data";

const ROUTE = "/api/v1/disaster-risks";
const LOADING = "読み込み中";
const FAILED = "取得失敗";
const SAMPLE_NODE = '[data-provenance="sample"]';
const SAMPLE_LABEL = "サンプルデータ（暫定）";
const K2_LABEL = "総合危険度ランク5の町丁目";
const K2_SOURCE = "東京都 地域危険度 第9回（2022年）";
const TSUNAMI_TEXT = "対象外：東京都の津波浸水想定（津波防災地域づくり法第8条）は島しょ部が対象で、区部には設定されていない（国土数値情報 A40 に23区の区域なし）";
const HAZARD_PORTAL = "出典：ハザードマップポータルサイト";
const KSJ_SITE = "https://nlftp.mlit.go.jp/ksj/";
const EDITED = [
  `「国土数値情報（洪水浸水想定区域データ）」（国土交通省）（${KSJ_SITE}）を加工して作成`,
  `「国土数値情報（土砂災害警戒区域データ）」（国土交通省）（${KSJ_SITE}）を加工して作成`,
  `「国土数値情報（津波浸水想定データ）」（国土交通省）（${KSJ_SITE}）を加工して作成`,
  `「国土数値情報（高潮浸水想定区域データ）」（国土交通省）（${KSJ_SITE}）を加工して作成`,
];
const TOKYO_CC_BY = "クリエイティブ・コモンズ・ライセンス 表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）";
const KIKENDO_TITLE = "地震に関する地域危険度測定調査（第9回）地域危険度一覧（令和4年9月公表）";

const snapshot = loadDisasterSnapshot();
const ROWS = disasterSnapshotRows(snapshot);
const TOTAL = disasterSnapshotTotal(snapshot);
const SOURCES = snapshot.sources;
const BY_WARD = Object.fromEntries(ROWS.map((r) => [r.region, r]));
const zoning = loadZoningSnapshot();
const land = loadLandPricesSnapshot();
const LAND_ROWS = landPricesSnapshotRows(land);

const pct1 = (v: number) => `${v.toFixed(1)}%`;
const shareText = (v: number) => (v > 0 && v < 0.05 ? "0.1%未満" : pct1(v));
const countText = (count: number, n: number) => `${count}（全${n.toLocaleString("ja-JP")}町丁目中）`;

type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pending: Route = () => new Promise<Response>(() => {});

const DISASTER: Route = json(200, { status: "ok", data: ROWS, sources: SOURCES, total: TOTAL });
const UNAVAILABLE: Route = json(503, { status: "unavailable" });
const DEMOGRAPHICS: Route = json(200, { status: "ok", data: DEMOGRAPHICS_FIXTURE, sources: DEMOGRAPHICS_SOURCES });
const TRANSPORT: Route = json(200, { status: "ok", data: [] });
const TRENDS: Route = json(200, { status: "ok", data: POPULATION_TRENDS_FIXTURE, sources: POPULATION_TRENDS_SOURCES });
const LAND_PRICES: Route = json(200, { status: "ok", data: LAND_ROWS, sources: LAND_PRICES_SOURCES });
const ZONING: Route = json(200, { status: "ok", data: zoningSnapshotRows(zoning), sources: zoning.sources, total: zoningSnapshotTotal(zoning) });

/** The same payload with every hazard's source moved to another year, table and label: what the page must then say. */
function disasterSaying(year: number): Route {
  const sources = Object.fromEntries(
    Object.entries(SOURCES).map(([k, s]) => [k, { year, table: `${s.table}-X${year}`, label: `${s.label}（試験${year}年版）` }])
  );
  return json(200, { status: "ok", data: ROWS, sources, total: TOTAL });
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

async function renderSettled(routes: { disaster?: Route } = {}) {
  const mock = serve({
    "/api/v1/demographics": DEMOGRAPHICS,
    "/api/v1/transport": TRANSPORT,
    [ROUTE]: routes.disaster ?? DISASTER,
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

const k2 = (container: HTMLElement) => surface(container, "disaster-k2");
const notesOf = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(".source-note")].map((n) => n.textContent ?? "").join("\n");
const footerLive = (c: HTMLElement) => c.querySelector('footer [data-provenance="live"]')?.textContent ?? "";
const footerSample = (c: HTMLElement) => c.querySelector('footer [data-provenance="sample"]')?.textContent ?? "";
const HAZARD_SURFACES = ["disaster-earthquake", "disaster-flood", "disaster-landslide", "disaster-tsunami", "disaster-hightide"] as const;

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("the payload is the committed snapshot's 23 wards and the 23区 record", () => {
  it("23 wards in code order; the Architect's cross-check figures", () => {
    expect(ROWS.map((r) => r.code)).toEqual(TOKYO_WARDS.map((w) => w.code));
    expect(BY_WARD["江戸川区"].earthquake.ranks.total).toEqual([46, 45, 75, 28, 5]);
    expect(BY_WARD["足立区"].earthquake.rank5).toBe(16);
    expect(TOTAL.earthquake.rank5).toBe(85);
    expect(TOTAL.earthquake.n).toBe(3138);
    expect(BY_WARD["江戸川区"].flood.deepShare.toFixed(1)).toBe("44.0");
    expect(BY_WARD["足立区"].flood.deepShare.toFixed(1)).toBe("50.3");
    for (const r of [...ROWS, TOTAL]) {
      expect(JSON.stringify(r)).not.toContain('"level"');
      expect(r.tsunami).toEqual({ status: "notCovered", text: TSUNAMI_TEXT });
      for (const key of ["total", "building", "fire"] as const) {
        expect(r.earthquake.ranks[key].reduce((s, v) => s + v, 0), `${r.region} ${key}`).toBe(r.earthquake.n);
      }
    }
  });
});

describe("K2 — 「総合危険度ランク5の町丁目」, the count with its denominator", () => {
  it("23区 view: 「85（全3,138町丁目中）」, the label and the source line; no 高リスク, no sample label", async () => {
    const { container } = await renderSettled();
    const tile = k2(container);
    expect(tile.textContent).toContain(countText(85, 3138));
    expect(tile.textContent).toContain("85（全3,138町丁目中）");
    expect(tile.textContent).toContain(K2_LABEL);
    expect(notesOf(tile)).toContain(K2_SOURCE);
    expect(tile.querySelector(".source-note")?.textContent).toBe(K2_SOURCE);
    expect(tile.textContent).not.toContain("高リスク");
    expect(tile.textContent).not.toContain("SAMPLE");
    expect(container.textContent).not.toContain("高リスク");
  });

  for (const [name, n, rank5] of [["江戸川区", 199, 5], ["千代田区", 115, 0], ["江東区", 155, 6], ["足立区", 269, 16]] as const) {
    it(`${name} selected: 「${countText(rank5, n)}」 from the payload`, async () => {
      const { container } = await renderSettled();
      selectWard(container, name);
      const ward = BY_WARD[name];
      expect([ward.earthquake.n, ward.earthquake.rank5]).toEqual([n, rank5]);
      expect(k2(container).textContent).toContain(countText(rank5, n));
      expect(k2(container).textContent).toContain(K2_LABEL);
    });
  }

  it("loading → 読み込み中; unavailable → 取得失敗 — never a number in its place", async () => {
    let view = await renderSettled({ disaster: pending });
    expect(k2(view.container).textContent).toContain(LOADING);
    expect(k2(view.container).textContent).not.toMatch(/全[\d,]+町丁目中/);
    view.unmount();
    view = await renderSettled({ disaster: UNAVAILABLE });
    expect(k2(view.container).textContent).toContain(FAILED);
    expect(k2(view.container).textContent).not.toMatch(/全[\d,]+町丁目中/);
  });
});

describe("災害 tab — each hazard in its own classes with its source and 時点", () => {
  it("江戸川区: 地震 per rank for 総合・建物倒壊・火災, the rank-5 count, the relative-evaluation sentence", async () => {
    const { container } = await renderSettled();
    selectWard(container, "江戸川区");
    const quake = surface(openTab("災害"), "disaster-earthquake");
    const ward = BY_WARD["江戸川区"];
    const rows = [...quake.querySelectorAll<HTMLElement>("[data-quake-kind]")];
    expect(rows.map((r) => r.dataset.kind)).toEqual(["total", "building", "fire"]);
    for (const r of rows) {
      const key = r.dataset.kind as "total" | "building" | "fire";
      expect(r.dataset.ranks).toBe(ward.earthquake.ranks[key].join(","));
      for (let k = 1; k <= 5; k++) expect(r.textContent).toContain(`ランク${k}`);
    }
    expect(rows[0].dataset.ranks).toBe("46,45,75,28,5");
    expect(rows[0].textContent).toContain("総合危険度");
    expect(rows[1].textContent).toContain("建物倒壊危険度");
    expect(rows[2].textContent).toContain("火災危険度");
    expect(quake.querySelector("[data-rank5]")?.textContent).toContain(countText(5, 199));
    expect(quake.textContent).toContain(ward.earthquake.relative);
    expect(quake.textContent).toContain("相対評価");
    expect(notesOf(quake)).toContain(SOURCES.earthquake.label);
  });

  it("江戸川区: 洪水 — every 浸水深 class with its share of the ward's area, and 「浸水深3m以上: 44.0%」", async () => {
    const { container } = await renderSettled();
    selectWard(container, "江戸川区");
    const flood = surface(openTab("災害"), "disaster-flood");
    const ward = BY_WARD["江戸川区"];
    const rows = [...flood.querySelectorAll<HTMLElement>("[data-flood-class]")];
    expect(rows.map((r) => Number(r.dataset.code))).toEqual(ward.flood.classes.map((c) => c.code));
    for (const r of rows) {
      const c = ward.flood.classes.find((x) => x.code === Number(r.dataset.code))!;
      expect(Number(r.dataset.share)).toBe(c.share);
      expect(r.textContent).toContain(c.label);
      expect(r.textContent).toContain(shareText(c.share));
    }
    const deep = flood.querySelector<HTMLElement>("[data-deep]");
    expect(Number(deep?.dataset.share)).toBe(ward.flood.deepShare);
    expect(deep?.textContent).toContain("浸水深3m以上");
    expect(deep?.textContent).toContain("44.0%");
    expect(flood.textContent).toContain("想定最大規模");
    expect(notesOf(flood)).toContain(SOURCES.flood.label);
    expect(notesOf(flood)).toContain(SOURCES.flood.table);
  });

  it("江戸川区: 土砂 — 0 警戒区域 and 0 特別警戒区域 for every 現象 (a genuine zero); 港区: its counts", async () => {
    const { container } = await renderSettled();
    selectWard(container, "江戸川区");
    let slide = surface(openTab("災害"), "disaster-landslide");
    let rows = [...slide.querySelectorAll<HTMLElement>("[data-phenomenon]")];
    expect(rows.map((r) => r.dataset.name)).toEqual(["急傾斜地の崩壊", "土石流", "地滑り"]);
    for (const r of rows) {
      expect(r.dataset.warning).toBe("0");
      expect(r.dataset.special).toBe("0");
    }
    expect(notesOf(slide)).toContain(SOURCES.landslide.label);
    selectWard(container, "港区");
    slide = surface(screen.getByRole("tabpanel"), "disaster-landslide");
    rows = [...slide.querySelectorAll<HTMLElement>("[data-phenomenon]")];
    const ward = BY_WARD["港区"];
    for (const r of rows) {
      const p = ward.landslide.phenomena.find((x) => x.name === r.dataset.name)!;
      expect(Number(r.dataset.warning)).toBe(p.warning);
      expect(Number(r.dataset.special)).toBe(p.special);
      expect(r.textContent).toContain(String(p.warning));
    }
    expect(ward.landslide.warning).toBeGreaterThan(0);
  });

  it("津波: the 対象外 statement with its basis, for the 23区 and every ward — never a bare 0 or 対象外", async () => {
    const { container } = await renderSettled();
    let tsunami = surface(openTab("災害"), "disaster-tsunami");
    expect(tsunami.textContent).toContain(TSUNAMI_TEXT);
    expect(tsunami.textContent).not.toMatch(/0(\.0)?%/);
    expect(notesOf(tsunami)).toContain(SOURCES.tsunami.label);
    selectWard(container, "江東区");
    tsunami = surface(screen.getByRole("tabpanel"), "disaster-tsunami");
    expect(tsunami.textContent).toContain(TSUNAMI_TEXT);
  });

  it("高潮: every class with its share of the ward's area and the 2020年度版 source", async () => {
    const { container } = await renderSettled();
    selectWard(container, "葛飾区");
    const tide = surface(openTab("災害"), "disaster-hightide");
    const ward = BY_WARD["葛飾区"];
    const rows = [...tide.querySelectorAll<HTMLElement>("[data-tide-class]")];
    expect(rows.map((r) => Number(r.dataset.code))).toEqual(ward.hightide.classes.map((c) => c.code));
    for (const r of rows) {
      const c = ward.hightide.classes.find((x) => x.code === Number(r.dataset.code))!;
      expect(Number(r.dataset.share)).toBe(c.share);
      expect(r.textContent).toContain(c.label);
    }
    expect(notesOf(tide)).toContain(SOURCES.hightide.label);
    expect(notesOf(tide)).toContain("2020年度");
  });

  it("no ward selected: every hazard surface reads the payload's 23区 record", async () => {
    await renderSettled();
    const panel = openTab("災害");
    const quake = surface(panel, "disaster-earthquake");
    expect(quake.querySelector<HTMLElement>('[data-kind="total"]')?.dataset.ranks).toBe(TOTAL.earthquake.ranks.total.join(","));
    expect(quake.querySelector("[data-rank5]")?.textContent).toContain(countText(85, 3138));
    expect(Number(surface(panel, "disaster-flood").querySelector<HTMLElement>("[data-deep]")?.dataset.share)).toBe(TOTAL.flood.deepShare);
    expect(surface(panel, "disaster-earthquake").textContent).toContain("東京23区");
  });

  it("no Lv.1–5, no 件 counts, no 高リスク and no sample label anywhere on the tab", async () => {
    const { container } = await renderSettled();
    const panel = openTab("災害");
    for (const text of [panel.textContent ?? ""]) {
      expect(text).not.toContain("Lv.");
      expect(text).not.toContain("高リスク");
      expect(text).not.toContain("件");
      expect(text).not.toContain("想定災害規模");
    }
    expect(panel.querySelector(SAMPLE_NODE)).toBeNull();
    selectWard(container, "墨田区");
    expect(screen.getByRole("tabpanel").textContent).not.toContain("Lv.");
  });

  it("the sources on every 災害 surface are the payload's: a payload saying 2031年 is what the page says", async () => {
    const { container } = await renderSettled({ disaster: disasterSaying(2031) });
    const panel = openTab("災害");
    for (const name of HAZARD_SURFACES) {
      expect(notesOf(surface(panel, name)), name).toContain("試験2031年版");
    }
    expect(k2(container).querySelector(".source-note")?.textContent).toBe("東京都 地域危険度 第9回-X2031（2031年）");
  });

  it("PR 1 states on every 災害 surface: 読み込み中 while pending, 取得失敗 naming the source when unavailable", async () => {
    let view = await renderSettled({ disaster: pending });
    let panel = openTab("災害");
    for (const name of HAZARD_SURFACES) {
      expect(surface(panel, name).textContent, name).toContain(LOADING);
      expect(surface(panel, name).querySelector("[data-flood-class],[data-quake-kind],[data-phenomenon],[data-tide-class]"), name).toBeNull();
    }
    view.unmount();
    view = await renderSettled({ disaster: UNAVAILABLE });
    panel = openTab("災害");
    for (const name of HAZARD_SURFACES) {
      expect(surface(panel, name).textContent, name).toContain(FAILED);
    }
    expect(surface(panel, "disaster-earthquake").textContent).toContain("東京都");
    expect(surface(panel, "disaster-flood").textContent).toContain("国土数値情報");
    expect(view.container.textContent).not.toContain("Lv.");
  });
});

describe("災害 choropleth — the share of the ward's 町丁目 at 総合危険度 rank 5", () => {
  const legend = (container: HTMLElement) => {
    const el = container.querySelector<HTMLElement>('[data-legend="disaster-risk"]');
    if (!el) throw new Error("no disaster-risk legend on the map");
    return el;
  };

  it("three stops from the data (min, median, max of the 23 shares) and labels equal to them; the legend says what the fill is", async () => {
    const { container } = await renderSettled();
    openTab("災害");
    const el = legend(container);
    const shares = ROWS.map((r) => r.earthquake.rank5Share).sort((a, b) => a - b);
    const min = shares[0];
    const max = shares[shares.length - 1];
    const median = shares[Math.floor(shares.length / 2)];
    const middle = median > min && median < max ? median : (min + max) / 2;
    expect(JSON.parse(el.dataset.legendStops ?? "null")).toEqual([min, middle, max]);
    const labels = [...el.querySelectorAll<HTMLElement>("[data-stop]")].map((s) => s.textContent);
    expect(labels).toEqual([min, middle, max].map(pct1));
    expect(el.textContent).toContain("総合危険度ランク5の町丁目の割合");
    expect(el.textContent).toContain("地域危険度 第9回");
    expect(el.textContent).not.toContain("固定の参考値");
    expect(el.textContent).not.toContain("ハザードマップ（実データ）");
    expect(el.textContent).toContain(HAZARD_PORTAL);
  });

  it("while the 災害 answer is pending the legend says so and prints no stops", async () => {
    const { container } = await renderSettled({ disaster: UNAVAILABLE });
    openTab("災害");
    const el = legend(container);
    expect(el.textContent).toContain(FAILED);
    expect(el.querySelectorAll("[data-stop]").length).toBe(0);
  });
});

describe("hazard overlay — 洪水 and 急傾斜地 tiles, no 津波 tiles, every raster with its 出典", () => {
  it("the raster set is the 洪水 (想定最大規模) and 急傾斜地 tile sets, each attributed 「出典：ハザードマップポータルサイト」", async () => {
    const { HAZARD_RASTERS } = await import("@/components/map/hazard-rasters");
    expect(HAZARD_RASTERS.map((r) => r.tiles)).toEqual([
      "https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png",
      "https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png",
    ]);
    for (const r of HAZARD_RASTERS) expect(r.attribution).toBe(HAZARD_PORTAL);
    expect(JSON.stringify(HAZARD_RASTERS)).not.toContain("tsunami");
    expect(JSON.stringify(HAZARD_RASTERS)).not.toContain("dosekiryu");
  });
});

describe("LP hero — the L01 upside with its 地震 and 洪水 figures, no sample", () => {
  const hero = loadHeroSpread();

  it("the committed hero rows are the top 6 by 住宅地 平均変動率 (継続地点), each with the snapshot's K2 and ≥ 3 m figures", () => {
    const ranked = [...LAND_ROWS]
      .filter((r) => r.residential.meanChange !== null)
      .sort((a, b) => (b.residential.meanChange ?? 0) - (a.residential.meanChange ?? 0) || a.code.localeCompare(b.code))
      .slice(0, 6);
    expect(hero.rows.map((r) => r.region)).toEqual(ranked.map((r) => r.region));
    for (const r of hero.rows) {
      expect(r.rank5).toBe(BY_WARD[r.region].earthquake.rank5);
      expect(r.chochomoku).toBe(BY_WARD[r.region].earthquake.n);
      expect(r.floodDeepShare).toBe(BY_WARD[r.region].flood.deepShare);
    }
  });

  it("each row shows the 変動率, 地震 「n（全N町丁目中）」 and 洪水 「浸水深3m以上 x%」, each labelled; no SAMPLE, no 安全度, no Lv.", () => {
    const { container } = render(<LandingPage />);
    const rows = [...container.querySelectorAll<HTMLElement>("[data-hero-row]")];
    expect(rows.map((r) => r.dataset.code)).toEqual(hero.rows.map((r) => r.code));
    for (const [i, el] of rows.entries()) {
      const r = hero.rows[i];
      expect(el.querySelector("[data-up]")?.textContent).toContain(`${r.change > 0 ? "+" : ""}${r.change.toFixed(1)}%`);
      const quake = el.querySelector("[data-quake]")?.textContent ?? "";
      expect(quake).toContain("地震");
      expect(quake).toContain(countText(r.rank5, r.chochomoku));
      const flood = el.querySelector("[data-flood]")?.textContent ?? "";
      expect(flood).toContain("洪水");
      expect(flood).toContain(shareText(r.floodDeepShare));
    }
    const spread = container.querySelector<HTMLElement>("[data-hero-spread]")!;
    expect(spread.textContent).not.toContain("SAMPLE");
    expect(spread.textContent).not.toContain(SAMPLE_LABEL);
    expect(spread.textContent).not.toContain("安全度");
    expect(spread.textContent).not.toContain("Lv.");
    expect(spread.querySelector(SAMPLE_NODE)).toBeNull();
  });

  it("the header and units line name the surveys, windows and definitions", () => {
    const { container } = render(<LandingPage />);
    const spread = container.querySelector<HTMLElement>("[data-hero-spread]")!;
    const text = spread.textContent ?? "";
    for (const words of ["2026年地価公示", "住宅地", "継続地点", "地域危険度 第9回", "総合危険度ランク5", "相対評価", "浸水深3m以上", "想定最大規模", "A31a-25"]) {
      expect(text, words).toContain(words);
    }
  });
});

describe("credits and lists — the 災害 sources under 実データ, nothing 災害 left in the sample lists", () => {
  it("dashboard footer: the 都 CC BY credit with the 改変 sentence, the four KSJ 加工 lines and the hazard-map 出典 under 実データ; no 災害 in the sample block", async () => {
    const { container } = await renderSettled();
    const live = footerLive(container);
    expect(live).toContain(`${KIKENDO_TITLE}、東京都、${TOKYO_CC_BY}`);
    expect(live).toContain("このサービスは、以下の著作物を改変して利用しています。");
    for (const line of EDITED) expect(live).toContain(line);
    expect(live).toContain(HAZARD_PORTAL);
    const sample = footerSample(container);
    expect(sample).not.toContain("災害");
    expect(sample).not.toContain("高リスク");
    expect(sample).not.toContain("区別総合比較");
  });

  it("LP: the hero and 災害 are listed under 実データ; the sample group keeps only the ridership trend (the radar left in PR 8)", () => {
    const { container } = render(<LandingPage />);
    const sample = container.querySelector('tbody[data-provenance="sample"]')?.textContent ?? "";
    expect(sample).not.toContain("ヒーロー");
    expect(sample).not.toContain("災害");
    expect(sample).not.toContain("区別総合比較");
    const live = container.querySelector('tbody[data-provenance="live"]')?.textContent ?? "";
    expect(live).toContain("地域危険度");
    expect(live).toContain("ヒーロー");
    const required = container.querySelector('[data-credit="required"]')?.textContent ?? "";
    expect(required).toContain(`${KIKENDO_TITLE}、東京都、${TOKYO_CC_BY}`);
    for (const line of EDITED) expect(required).toContain(line);
    expect(required).toContain(HAZARD_PORTAL);
  });

  it("the radar and its sample 安全性 axis are gone; the comparison table's 災害 rows read /disaster-risks (PR 8)", async () => {
    const { container } = await renderSettled();
    expect(container.querySelector('[data-surface="ward-radar"]')).toBeNull();
    const table = surface(container, "ward-comparison");
    expect(table.querySelector('[data-measure="rank5"]')?.getAttribute("data-state")).toBe("ok");
    expect(table.textContent).not.toContain(SAMPLE_LABEL);
  });
});
