import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * PR 6 of the real-data plan (RECON 2026-10-uo-real-data §9 row 6): 用途地域
 * from 国土数値情報 都市計画決定情報データ A55-24 (2024年度版, the 23 wards' youto
 * layers) — the committed snapshot /api/v1/zoning serves — on the 用途地域 tab
 * (Z1 面積構成, Z2 容積率・建蔽率) and the 災害 tab's 用途地域 mini-bar (D2)
 * (Architect decisions 2, 9 and 12 and the 時点 decision, 2026-11-03).
 *
 * What the page must say, every claim read from the payload:
 *   Z1 / D2    share of the ward's 用途地域-designated area by type, summing to
 *              100 ± 0.5; with it the designated share of the ward — area of
 *              (designated ∩ the N03 ward polygon) ÷ the polygon's area, never
 *              above 100 — 「区の面積の84%が用途地域の指定区域」 for 江戸川区;
 *   types      A55's codes and names, only the types present, in code order;
 *   Z2         per type present, the area-weighted mean 指定容積率 / 指定建蔽率
 *              and the min–max range; titles say 面積加重平均 and 範囲;
 *   selection  Z1, Z2 and D2 follow the selected ward; no ward selected →
 *              the 23区 composition, the payload's `total`;
 *   時点        each ward's from the data list (中央区 from ③, 江戸川区 the 都
 *              row with 「都に準ずる」); 江東区・目黒区・渋谷区・板橋区 say
 *              「時点：国土数値情報の掲載データ一覧に記載なし」 and no date; the
 *              23区 view says 「2021年7月1日〜2024年10月1日（4区は掲載データ一覧に記載なし）」;
 *   provenance the edition and tables on every surface from the payload;
 *              credit in the 加工 form; the A55 page's six 注意事項 verbatim;
 *              PR 1 states (読み込み中 / 取得失敗 / data) on Z1, Z2 and D2;
 *   lists      no 用途地域 entry left in the footer's or the LP's sample lists;
 *              no import of sampleZoning anywhere.
 *
 * The figures served here are the committed snapshot's (fixtures/live-data.ts
 * reads backend/data/zoning.json); the backend guards derive the same
 * figures from the committed source files. Rendered with the real hook; only
 * fetch is replaced. RED on main (506b880).
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
  LAND_PRICES_FIXTURE,
  LAND_PRICES_SOURCES,
  POPULATION_TRENDS_FIXTURE,
  POPULATION_TRENDS_SOURCES,
  loadZoningSnapshot,
  zoningSnapshotRows,
  zoningSnapshotTotal,
} from "@/__tests__/fixtures/live-data";

const ZONING_ROUTE = "/api/v1/zoning";
const LOADING = "読み込み中";
const FAILED = "取得失敗";
const SAMPLE_NODE = '[data-provenance="sample"]';
const KSJ = "国土数値情報";
const KSJ_SITE = "https://nlftp.mlit.go.jp/ksj/";
const KSJ_SOURCE = `出典：国土交通省国土数値情報ダウンロードサイト（${KSJ_SITE}）`;
const EDITED_A55 = `「国土数値情報（都市計画決定情報データ）」（国土交通省）（${KSJ_SITE}）を加工して作成`;
const EDITED_N03 = `「国土数値情報（行政区域データ）」（国土交通省）（${KSJ_SITE}）を加工して作成`;
const NOTICES = [
  "本データは、建築確認申請や不動産重要事項説明等の手続に用いることを保証するものではなく、参考情報としての利用を想定しています。",
  "本データに含まれる地区・地域の範囲は、概ねの位置を示すものであり、実際の都市計画の決定範囲等と異なる場合があります。",
  "本データは、当該自治体の都市計画等の情報全てではないことがあります。",
  "本データは、最新の情報ではないことがあります。本データの時点については、公表自治体及び掲載データ一覧を参考にしてください。",
  "最新の正確な都市計画決定情報が必要な場合は、該当する地方公共団体の担当課までお問い合わせください。",
  "本データを用いて行う一切の行為（コンテンツを編集・加工等した情報を利用することを含む）及び本データの利用によって発生した直接または間接の損失、損害等について、国土交通省並びに原典資料提供元の地方公共団体は一切の責任を負いません。",
];
const ASOF_MISSING = "時点：国土数値情報の掲載データ一覧に記載なし";
const ASOF_TOTAL = "2021年7月1日〜2024年10月1日（4区は掲載データ一覧に記載なし）";
const UNDATED_WARDS = ["江東区", "目黒区", "渋谷区", "板橋区"];

const snapshot = loadZoningSnapshot();
const ROWS = zoningSnapshotRows(snapshot);
const TOTAL = zoningSnapshotTotal(snapshot);
const SOURCES = snapshot.sources;
const YEAR = snapshot.year;
const TABLE = SOURCES.zoning.table;
const BY_WARD = Object.fromEntries(ROWS.map((r) => [r.region, r]));
const pct1 = (v: number) => `${v.toFixed(1)}%`;
// A present type whose share rounds to 0.0 % must not read as absent
// (Architect, 2026-11-04): below 0.05 % the share reads 「0.1%未満」 wherever
// shares are listed.
const TINY = "0.1%未満";
const shareText = (v: number) => (v > 0 && v < 0.05 ? TINY : pct1(v));

type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pending: Route = () => new Promise<Response>(() => {});

const ZONING: Route = json(200, { status: "ok", data: ROWS, isLive: true, sources: SOURCES, total: TOTAL });
const UNAVAILABLE: Route = json(503, { status: "unavailable" });
const DEMOGRAPHICS: Route = json(200, { status: "ok", data: DEMOGRAPHICS_FIXTURE, isLive: true, sources: DEMOGRAPHICS_SOURCES });
const TRANSPORT: Route = json(200, { status: "ok", data: [], isLive: true });
const DISASTER: Route = json(200, { data: [], isLive: false });
const TRENDS: Route = json(200, { status: "ok", data: POPULATION_TRENDS_FIXTURE, isLive: true, sources: POPULATION_TRENDS_SOURCES });
const LAND_PRICES: Route = json(200, { status: "ok", data: LAND_PRICES_FIXTURE, isLive: true, sources: LAND_PRICES_SOURCES });

/** The same payload with the sources moved to another year, table and label: what the page must then say. */
function zoningSaying(year: number, table: string, label: string): Route {
  const sources = { ...SOURCES, zoning: { year, table, label } };
  return json(200, { status: "ok", data: ROWS, isLive: true, sources, total: TOTAL });
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

async function renderSettled(routes: { zoning?: Route } = {}) {
  const mock = serve({
    "/api/v1/demographics": DEMOGRAPHICS,
    "/api/v1/transport": TRANSPORT,
    "/api/v1/disaster-risks": DISASTER,
    "/api/v1/population-trends": TRENDS,
    "/api/v1/land-prices": LAND_PRICES,
    [ZONING_ROUTE]: routes.zoning ?? ZONING,
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

/** The types a composition surface lists: code, name, share and area from the markup. */
function listedTypes(el: HTMLElement): { code: number; name: string; share: number; m2: number; text: string }[] {
  return [...el.querySelectorAll<HTMLElement>("[data-zoning-type]")].map((t) => ({
    code: Number(t.dataset.code),
    name: t.dataset.name ?? "",
    share: Number(t.dataset.share),
    m2: Number(t.dataset.m2),
    text: t.textContent ?? "",
  }));
}

function segments(el: HTMLElement): { code: number; share: number }[] {
  return [...el.querySelectorAll<HTMLElement>("[data-zoning-segment]")].map((s) => ({ code: Number(s.dataset.code), share: Number(s.dataset.share) }));
}

function designated(el: HTMLElement): { text: string; share: number } {
  const d = el.querySelector<HTMLElement>("[data-designated]");
  if (!d) throw new Error("no [data-designated] line");
  return { text: d.textContent ?? "", share: Number(d.dataset.shareOfWard) };
}

function asOf(el: HTMLElement): { text: string; date: string } {
  const a = el.querySelector<HTMLElement>("[data-as-of]");
  if (!a) throw new Error("no [data-as-of] line");
  return { text: a.textContent ?? "", date: a.dataset.asOfDate ?? "" };
}

function farRows(el: HTMLElement): { code: number; far: number[]; bcr: number[]; text: string }[] {
  return [...el.querySelectorAll<HTMLElement>("[data-zoning-far]")].map((r) => ({
    code: Number(r.dataset.code),
    far: [Number(r.dataset.farMean), Number(r.dataset.farMin), Number(r.dataset.farMax)],
    bcr: [Number(r.dataset.bcrMean), Number(r.dataset.bcrMin), Number(r.dataset.bcrMax)],
    text: r.textContent ?? "",
  }));
}

const notesOf = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(".source-note")].map((n) => n.textContent ?? "").join("\n");
const footerLive = (c: HTMLElement) => c.querySelector('footer [data-provenance="live"]')?.textContent ?? "";
const footerSample = (c: HTMLElement) => c.querySelector('footer [data-provenance="sample"]')?.textContent ?? "";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("the payload is the committed snapshot's 23 wards and their 23区 composition", () => {
  it("23 wards in code order; per ward the shares sum to 100 ± 0.5 and the designated share is ≤ 100", () => {
    expect(ROWS.map((r) => r.code)).toEqual(TOKYO_WARDS.map((w) => w.code));
    for (const r of [...ROWS, TOTAL]) {
      const sum = r.types.reduce((s, t) => s + t.share, 0);
      expect(Math.abs(sum - 100), r.region).toBeLessThanOrEqual(0.5);
      expect(r.designatedShare, r.region).toBeLessThanOrEqual(100);
      expect(r.designatedShare, r.region).toBeGreaterThan(0);
      expect(r.types.map((t) => t.code)).toEqual([...r.types.map((t) => t.code)].sort((a, b) => a - b));
      for (const t of r.types) {
        expect(t.code).toBeGreaterThanOrEqual(1);
        expect(t.code).toBeLessThanOrEqual(13);
        expect(t.far.min).toBeLessThanOrEqual(t.far.mean);
        expect(t.far.mean).toBeLessThanOrEqual(t.far.max);
      }
    }
    expect(BY_WARD["江戸川区"].designatedShare).toBeGreaterThanOrEqual(83.5);
    expect(BY_WARD["江戸川区"].designatedShare).toBeLessThanOrEqual(84.5);
    expect(BY_WARD["千代田区"].designatedShare).toBeGreaterThanOrEqual(99);
  });

  it("the 23区 composition equals the area-weighted sum over the wards", () => {
    const designated = ROWS.reduce((s, r) => s + r.designatedM2, 0);
    expect(Math.abs(TOTAL.designatedM2 - designated)).toBeLessThan(0.01);
    expect(Math.abs(TOTAL.wardM2 - ROWS.reduce((s, r) => s + r.wardM2, 0))).toBeLessThan(0.01);
    for (const t of TOTAL.types) {
      const m2 = ROWS.reduce((s, r) => s + (r.types.find((x) => x.code === t.code)?.m2 ?? 0), 0);
      expect(Math.abs(t.m2 - m2), t.name).toBeLessThan(0.01);
      expect(Math.abs(t.share - (m2 / designated) * 100), t.name).toBeLessThan(1e-3);
    }
  });

  it("the 時点 of each ward is the data list's; four wards have none; the 23区 view carries the range", () => {
    for (const name of UNDATED_WARDS) {
      expect(BY_WARD[name].asOf.date).toBeNull();
      expect(BY_WARD[name].asOf.text).toBe(ASOF_MISSING);
    }
    expect(BY_WARD["江戸川区"].asOf).toMatchObject({ date: "2024-04-26", text: "時点：2024年4月26日（都に準ずる）", note: "都に準ずる" });
    expect(BY_WARD["中央区"].asOf).toMatchObject({ date: "2023-12-18", text: "時点：2023年12月18日" });
    expect(TOTAL.asOf.label).toBe(ASOF_TOTAL);
  });
});

describe("用途地域 tab — Z1 面積構成 from the payload, following the selected ward", () => {
  it("no ward selected: the 23区 composition — every present type in code order with its share, the designated share and the range 時点", async () => {
    await renderSettled();
    const panel = openTab("用途地域");
    const z1 = surface(panel, "zoning-composition");
    const listed = listedTypes(z1);
    expect(listed.map((t) => t.code)).toEqual(TOTAL.types.map((t) => t.code));
    for (const t of listed) {
      const expected = TOTAL.types.find((x) => x.code === t.code)!;
      expect(t.name).toBe(expected.name);
      expect(t.share).toBe(expected.share);
      expect(t.m2).toBe(expected.m2);
      expect(t.text).toContain(expected.name);
      expect(t.text).toContain(shareText(expected.share));
    }
    expect(segments(z1).map((s) => s.code)).toEqual(TOTAL.types.map((t) => t.code));
    const d = designated(z1);
    expect(d.share).toBe(TOTAL.designatedShare);
    expect(d.text).toContain(`23区の面積の${Math.round(TOTAL.designatedShare)}%が用途地域の指定区域`);
    expect(asOf(z1).text).toContain(ASOF_TOTAL);
    expect(asOf(z1).text).toBe(TOTAL.asOf.text);
    expect(z1.textContent).toContain("東京23区");
  });

  it("江戸川区 selected: its own types and shares, 「区の面積の84%が用途地域の指定区域」, the 都 row's 時点 with 「都に準ずる」", async () => {
    const { container } = await renderSettled();
    selectWard(container, "江戸川区");
    const panel = openTab("用途地域");
    const z1 = surface(panel, "zoning-composition");
    const ward = BY_WARD["江戸川区"];
    const listed = listedTypes(z1);
    expect(listed.map((t) => t.code)).toEqual(ward.types.map((t) => t.code));
    for (const t of listed) expect(t.share).toBe(ward.types.find((x) => x.code === t.code)!.share);
    expect(listed.reduce((s, t) => s + t.share, 0)).toBeCloseTo(100, 0);
    const d = designated(z1);
    expect(d.share).toBe(ward.designatedShare);
    expect(d.text).toContain(`区の面積の${Math.round(ward.designatedShare)}%が用途地域の指定区域`);
    expect(d.text).toContain("区の面積の84%が用途地域の指定区域");
    expect(asOf(z1).text).toBe("時点：2024年4月26日（都に準ずる）");
    expect(asOf(z1).date).toBe("2024-04-26");
    expect(z1.textContent).toContain("江戸川区");
  });

  it("中央区 selected: the 時点 is the ③ entry of its itemised cell", async () => {
    const { container } = await renderSettled();
    selectWard(container, "中央区");
    const z1 = surface(openTab("用途地域"), "zoning-composition");
    expect(asOf(z1).text).toBe("時点：2023年12月18日");
    expect(listedTypes(z1).map((t) => t.code)).toEqual(BY_WARD["中央区"].types.map((t) => t.code));
  });

  for (const name of UNDATED_WARDS) {
    it(`${name} selected: 「${ASOF_MISSING}」 and no date`, async () => {
      const { container } = await renderSettled();
      selectWard(container, name);
      const panel = openTab("用途地域");
      const z1 = surface(panel, "zoning-composition");
      const line = asOf(z1);
      expect(line.text).toBe(ASOF_MISSING);
      expect(line.date).toBe("");
      expect(line.text).not.toMatch(/\d{4}年/);
      expect(listedTypes(z1).map((t) => t.code)).toEqual(BY_WARD[name].types.map((t) => t.code));
      expect(designated(z1).share).toBe(BY_WARD[name].designatedShare);
    });
  }

  it("江戸川区: a present type whose share rounds to 0.0 % reads 「0.1%未満」 on Z1, in the segment titles and on D2 — never 0.0%", async () => {
    const ward = BY_WARD["江戸川区"];
    const tiny = ward.types.filter((t) => t.share > 0 && t.share < 0.05);
    expect(tiny.map((t) => t.name)).toEqual(["第２種低層住居専用地域", "第２種住居地域"]);
    const { container } = await renderSettled();
    selectWard(container, "江戸川区");
    const panel = openTab("用途地域");
    const z1 = surface(panel, "zoning-composition");
    for (const t of tiny) {
      const row = listedTypes(z1).find((x) => x.code === t.code);
      expect(row, t.name).toBeDefined();
      expect(row!.text).toContain(TINY);
      expect(row!.text).not.toContain("0.0%");
      const segment = z1.querySelector<HTMLElement>(`[data-zoning-segment][data-code="${t.code}"]`);
      expect(segment?.getAttribute("title"), `${t.name} segment title`).toContain(TINY);
    }
    expect(z1.textContent).not.toContain("0.0%");
    const d2 = surface(openTab("災害"), "disaster-zoning");
    for (const t of tiny) {
      const segment = d2.querySelector<HTMLElement>(`[data-zoning-segment][data-code="${t.code}"]`);
      expect(segment?.getAttribute("title"), `${t.name} D2 segment title`).toContain(TINY);
    }
    expect(d2.textContent).not.toContain("0.0%");
  });

  it("only the types present are listed, with A55's names, and 田園住居地域 (code 8, no area) is not", async () => {
    const { container } = await renderSettled();
    selectWard(container, "千代田区");
    const z1 = surface(openTab("用途地域"), "zoning-composition");
    const listed = listedTypes(z1);
    expect(listed.map((t) => t.name)).toEqual(BY_WARD["千代田区"].types.map((t) => t.name));
    expect(listed.map((t) => t.name)).toContain("商業地域");
    expect(listed.map((t) => t.code)).not.toContain(8);
    expect(z1.textContent).not.toContain("田園住居地域");
    expect(z1.textContent).not.toContain("一低住専");
  });
});

describe("用途地域 tab — Z2 容積率・建蔽率: per type present, the area-weighted mean and the range", () => {
  it("titles say 面積加重平均 and 範囲; each present type carries its mean and min–max for both ratios from the payload", async () => {
    const { container } = await renderSettled();
    selectWard(container, "江戸川区");
    const z2 = surface(openTab("用途地域"), "zoning-far");
    expect(z2.querySelector("h4")?.textContent).toContain("面積加重平均");
    expect(z2.querySelector("h4")?.textContent).toContain("範囲");
    const rows = farRows(z2);
    const ward = BY_WARD["江戸川区"];
    expect(rows.map((r) => r.code)).toEqual(ward.types.map((t) => t.code));
    for (const r of rows) {
      const t = ward.types.find((x) => x.code === r.code)!;
      expect(r.far).toEqual([t.far.mean, t.far.min, t.far.max]);
      expect(r.bcr).toEqual([t.bcr.mean, t.bcr.min, t.bcr.max]);
      expect(r.text).toContain(t.name);
      expect(r.text).toContain(`${t.far.min}〜${t.far.max}`);
      expect(r.text).toContain(`${t.bcr.min}〜${t.bcr.max}`);
    }
    expect(z2.textContent).not.toContain("800%");
  });

  it("the 23区 view's Z2 is the payload's total", async () => {
    await renderSettled();
    const z2 = surface(openTab("用途地域"), "zoning-far");
    const rows = farRows(z2);
    expect(rows.map((r) => r.code)).toEqual(TOTAL.types.map((t) => t.code));
    for (const r of rows) {
      const t = TOTAL.types.find((x) => x.code === r.code)!;
      expect(r.far[0]).toBe(t.far.mean);
      expect(r.bcr[0]).toBe(t.bcr.mean);
    }
  });
});

describe("災害 tab — D2 uses the same data and metric and follows the selected ward", () => {
  it("no ward selected: the 23区 shares; 江戸川区 selected: its shares, its designated share and its 時点; never a sample label on D2", async () => {
    const { container } = await renderSettled();
    let d2 = surface(openTab("災害"), "disaster-zoning");
    expect(segments(d2).map((s) => s.share)).toEqual(TOTAL.types.map((t) => t.share));
    expect(d2.querySelector(SAMPLE_NODE)).toBeNull();
    expect(asOf(d2).text).toBe(TOTAL.asOf.text);

    selectWard(container, "江戸川区");
    d2 = surface(screen.getByRole("tabpanel"), "disaster-zoning");
    const ward = BY_WARD["江戸川区"];
    expect(segments(d2).map((s) => s.share)).toEqual(ward.types.map((t) => t.share));
    expect(designated(d2).share).toBe(ward.designatedShare);
    expect(designated(d2).text).toContain("区の面積の84%が用途地域の指定区域");
    expect(asOf(d2).text).toBe("時点：2024年4月26日（都に準ずる）");
    expect(d2.querySelector(SAMPLE_NODE)).toBeNull();
    expect(d2.textContent).toContain(KSJ);
  });

  it("江東区 selected on the 災害 tab: 記載なし and no date", async () => {
    const { container } = await renderSettled();
    selectWard(container, "江東区");
    const d2 = surface(openTab("災害"), "disaster-zoning");
    expect(asOf(d2).text).toBe(ASOF_MISSING);
    expect(asOf(d2).date).toBe("");
  });
});

describe("the edition and tables on every 用途地域 surface are read from the payload", () => {
  it("a payload saying 2031年度 / A55-99 is what the page says — nowhere the snapshot's edition", async () => {
    const { container } = await renderSettled({ zoning: zoningSaying(2031, "A55-99", "テスト用の用途地域ラベル") });
    const panel = openTab("用途地域");
    const notes = notesOf(surface(panel, "zoning-composition"));
    expect(notes).toContain("2031年度");
    expect(notes).toContain("A55-99");
    expect(notes).not.toContain(`${YEAR}年度`);
    expect(panel.textContent).toContain("テスト用の用途地域ラベル");
    const live = footerLive(container);
    expect(live).toContain("2031年度");
    expect(live).toContain("A55-99");
    expect(live).not.toContain(`${YEAR}年度`);
    const d2 = surface(openTab("災害"), "disaster-zoning");
    expect(d2.textContent).toContain("2031年度");
    expect(d2.textContent).not.toContain(`${YEAR}年度`);
  });

  it("the snapshot's own edition and table reach the tab, the 災害 tab and the footer", async () => {
    const { container } = await renderSettled();
    const panel = openTab("用途地域");
    const notes = notesOf(surface(panel, "zoning-composition"));
    expect(notes).toContain(`${YEAR}年度`);
    expect(notes).toContain(TABLE);
    expect(notes).toContain(SOURCES.wards.table);
    expect(footerLive(container)).toContain(TABLE);
    expect(surface(openTab("災害"), "disaster-zoning").textContent).toContain(TABLE);
  });
});

describe("credits and 注意事項 — the 加工 form with no editor name, the six A55 bullets verbatim", () => {
  it("the 用途地域 tab carries the 出典 line, both 加工 statements, the metric notes and all six 注意事項", async () => {
    await renderSettled();
    const panel = openTab("用途地域");
    const credit = panel.querySelector<HTMLElement>('[data-credit="ksj-a55"]');
    expect(credit).not.toBeNull();
    expect(credit!.textContent).toContain(KSJ_SOURCE);
    expect(credit!.textContent).toContain(EDITED_A55);
    expect(credit!.textContent).toContain(EDITED_N03);
    expect(credit!.textContent).not.toMatch(/をもとに.*作成/);
    const notices = [...panel.querySelectorAll<HTMLElement>('[data-notices="a55"] li')].map((li) => li.textContent ?? "");
    expect(notices).toEqual(NOTICES);
    const notes = notesOf(surface(panel, "zoning-composition"));
    expect(notes).toContain("N03");
    expect(notes).toContain("切り抜");
  });

  it("the footer lists 用途地域 under 実データ with the credits, the edition and the 注意事項; the sample group no longer lists it", async () => {
    const { container } = await renderSettled();
    const live = footerLive(container);
    expect(live).toContain("用途地域");
    expect(live).toContain(KSJ_SOURCE);
    expect(live).toContain(EDITED_A55);
    expect(live).toContain(EDITED_N03);
    expect(live).toContain(`${YEAR}年度`);
    expect(live).toContain(TABLE);
    for (const n of NOTICES) expect(live).toContain(n);
    const sample = footerSample(container);
    expect(sample).not.toContain("用途地域");
    // Real-data plan PR 7: the 災害 fill left WARD_META; only 人口 stays on the fixed table.
    expect(sample).toContain("地図の塗り分け（人口）");
  });

  it("the LP lists 用途地域 as live with the edition, not as sample, and carries the 加工 statement and the 注意事項 among the notices", () => {
    const { container } = render(<LandingPage />);
    const live = container.querySelector('tbody[data-provenance="live"]')?.textContent ?? "";
    const sample = container.querySelector('tbody[data-provenance="sample"]')?.textContent ?? "";
    expect(live).toContain("用途地域");
    expect(live).toContain("A55");
    expect(sample).not.toContain("用途地域");
    const required = container.querySelector('[data-credit="required"]')?.textContent ?? "";
    expect(required).toContain(EDITED_A55);
    for (const n of NOTICES) expect(required).toContain(n);
  });
});

describe("states — 読み込み中 / 取得失敗 / data on Z1, Z2 and D2, never a sample label", () => {
  it("before the answer: Z1, Z2 and D2 say 読み込み中; no figure, no SAMPLE", async () => {
    await renderSettled({ zoning: pending });
    const panel = openTab("用途地域");
    for (const name of ["zoning-composition", "zoning-far"]) {
      const s = surface(panel, name);
      expect(s.textContent, name).toContain(LOADING);
      expect(s.querySelector('[data-state="loading"]'), name).not.toBeNull();
    }
    expect(listedTypes(panel)).toHaveLength(0);
    expect(farRows(panel)).toHaveLength(0);
    expect(panel.querySelector(SAMPLE_NODE)).toBeNull();
    expect(panel.textContent).not.toContain("%が用途地域の指定区域");
    const d2 = surface(openTab("災害"), "disaster-zoning");
    expect(d2.textContent).toContain(LOADING);
    expect(segments(d2)).toHaveLength(0);
    expect(d2.querySelector(SAMPLE_NODE)).toBeNull();
  });

  it("503: Z1, Z2 and D2 say 取得失敗 and name 国土数値情報; no SAMPLE, no figure, no 出典 citation", async () => {
    await renderSettled({ zoning: UNAVAILABLE });
    const panel = openTab("用途地域");
    for (const name of ["zoning-composition", "zoning-far"]) {
      const s = surface(panel, name);
      expect(s.textContent, name).toContain(FAILED);
      expect(s.textContent, name).toContain(KSJ);
      expect(s.querySelector('[data-state="unavailable"]'), name).not.toBeNull();
    }
    expect(listedTypes(panel)).toHaveLength(0);
    expect(panel.querySelector(SAMPLE_NODE)).toBeNull();
    expect(panel.textContent).not.toContain("出典：");
    expect(panel.textContent).not.toContain("データなし");
    const d2 = surface(openTab("災害"), "disaster-zoning");
    expect(d2.textContent).toContain(FAILED);
    expect(segments(d2)).toHaveLength(0);
    expect(d2.querySelector(SAMPLE_NODE)).toBeNull();
  });

  it("data: no SAMPLE node on the 用途地域 tab or D2, no 取得失敗, no サンプルデータ", async () => {
    await renderSettled();
    const panel = openTab("用途地域");
    expect(panel.querySelector(SAMPLE_NODE)).toBeNull();
    expect(panel.textContent).not.toContain(FAILED);
    expect(panel.textContent).not.toContain("サンプルデータ");
    const d2 = surface(openTab("災害"), "disaster-zoning");
    expect(d2.querySelector(SAMPLE_NODE)).toBeNull();
    expect(d2.textContent).not.toContain(FAILED);
  });
});

describe("the sample set is gone", () => {
  const REPO_ROOT = process.cwd();
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "__tests__" && entry !== "node_modules") walk(full, out);
      } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("no file under src/ imports or defines sampleZoning; the ZoningArea type is gone", () => {
    const hits = walk(resolve(REPO_ROOT, "src"))
      .filter((file) => /\bsampleZoning\b/.test(readFileSync(file, "utf8")))
      .map((file) => relative(REPO_ROOT, file));
    expect(hits).toEqual([]);
    expect(readFileSync(resolve(REPO_ROOT, "src/types/index.ts"), "utf8")).not.toContain("ZoningArea");
  });
});
