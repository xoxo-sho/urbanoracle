import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * PR 1 of the real-data plan (RECON 2026-10-uo-real-data §9): the surfaces fed
 * by the two live endpoints — S0 ward selector, K1 成長率, K3 乗降客, P2–P4 人口,
 * L3 census columns, T1–T2 交通, M6 station legend — render three
 * distinguishable states: 読み込み中, 取得失敗, data. A genuine zero is 0. No
 * state shows a sample number, and no state labels the surface SAMPLE: PR 1
 * deletes the sample sets these surfaces fell back to (F6–F9).
 *
 * The page is rendered with the real hook; only fetch is replaced, per
 * endpoint, so each state is produced the way production produces it. The
 * surfaces outside PR 1 (地価 bar/scatter, 人口推移, 災害, 乗降客数推移, 用途地域,
 * radar) keep their sample label until their own PR, so every assertion is
 * scoped to a touched surface.
 *
 * Stage 2 architect decisions: a full failure is HTTP 503 `{status:"unavailable"}`
 * (CHANGE 1); when the station file loads but ODPT does not, the server says
 * `status:"partial"` with `unavailable:["dailyPassengers"]`, and every
 * ridership cell, the K3 tile and the legend read 取得失敗 — データなし is
 * reserved for a station the upstream genuinely has no figure for (CHANGE 2);
 * the 23 ward names are reference facts, so S0 lists all 23 in
 * 全国地方公共団体コード order in every state (CHANGE 3).
 *
 * RED on main (8d17736).
 */

// MapView cannot run in jsdom; the stub records what the page hands it, so
// the map's own consumption of /transport (stations, live flag) is guarded.
vi.mock("next/dynamic", () => ({
  default: () =>
    function MapStub(props: { stations?: unknown[]; transportIsLive?: boolean }) {
      return (
        <div
          data-testid="map-stub"
          data-stations={JSON.stringify(props.stations ?? null)}
          data-transport-live={String(props.transportIsLive)}
        />
      );
    },
}));
vi.mock("@/components/dashboard/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/components/auth/VerificationBanner", () => ({ default: () => null }));
vi.mock("@/components/auth/SignOutButton", () => ({ default: () => null }));

// Stable identities: a fresh getToken or router per render would re-run the
// hook's effect on every state update.
const auth = vi.hoisted(() => ({ getToken: async () => "id-token" }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, getToken: auth.getToken, refresh: async () => null }),
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import Home from "@/app/app/page";

const LOADING = "読み込み中";
const FAILED = "取得失敗";
const NO_DATA = "データなし";
const SAMPLE_NODE = '[data-provenance="sample"]';

// Numbers that exist only in the sample sets PR 1 deletes (src/data/sample.ts
// @ 8d17736): 中央区 growthRate 3.5, the sample maximum, so the 成長率1位 tile
// reads 「+3.5%」; the ten sample stations' ridership sums to 3,425,570 → 「343万」
// on the 乗降客 tile; 新宿駅 775,386 → 「77.5万」 in the 交通 ranking; 世田谷区
// 939,099 → 「93.9万」 in the 区別データテーブル. Any of them on screen is the
// sample leaking.
const SAMPLE_NUMBERS = ["+3.5%", "343万", "77.5万", "93.9万"];

// The 23 特別区 in 全国地方公共団体コード order (13101 千代田区 … 13123 江戸川区).
// Reference facts, not data: the selector offers them in every state.
const WARD_NAMES_IN_CODE_ORDER = [
  "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区", "江東区",
  "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区", "杉並区", "豊島区",
  "北区", "荒川区", "板橋区", "練馬区", "足立区", "葛飾区", "江戸川区",
];

type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
const pending: Route = () => new Promise<Response>(() => {});
const offline: Route = async () => {
  throw new TypeError("offline");
};

// Real-shaped answers. A growth rate of exactly 0 and a station with exactly
// 0 passengers are in here on purpose: they must render as 0, never as
// 取得失敗 or データなし. The null growth rate and the null ridership are
// unpublished cells and stay データなし.
const DEMOGRAPHICS_OK = [
  { region: "江東区", population: 537_924, density: 13_394, growthRate: 0, ageGroups: { young: 13, working: 67, elderly: 20 } },
  { region: "足立区", population: 691_428, density: 12_984, growthRate: -1.2, ageGroups: { young: 11, working: 62, elderly: 27 } },
  { region: "北区", population: 355_777, density: 17_262, growthRate: null, ageGroups: { young: 10, working: 63, elderly: 27 } },
];
const STATIONS_OK = [
  { id: "ts-0", name: "豊洲駅", lat: 35.6549, lng: 139.7963, type: "train", dailyPassengers: 0, lines: ["メトロ 有楽町線"], ward: "江東区" },
  { id: "ts-1", name: "東陽町駅", lat: 35.6697, lng: 139.8172, type: "train", dailyPassengers: null, lines: ["メトロ 東西線"], ward: "江東区" },
];
// F4: the station file loaded, ODPT did not. Real stations, and the server
// names the field it could not fill — those cells are 取得失敗, not データなし.
const STATIONS_NO_RIDERSHIP = STATIONS_OK.map((s) => ({ ...s, dailyPassengers: null }));

const DEMOGRAPHICS = json(200, { status: "ok", data: DEMOGRAPHICS_OK, isLive: true });
const TRANSPORT = json(200, { status: "ok", data: STATIONS_OK, isLive: true, fetchedAt: "2026-10-30T00:00:00+00:00" });
const TRANSPORT_PARTIAL = json(200, {
  status: "partial",
  data: STATIONS_NO_RIDERSHIP,
  unavailable: ["dailyPassengers"],
  isLive: false,
});
const UNAVAILABLE = json(503, { status: "unavailable" });
// Outside PR 1; it answers so the page settles.
const DISASTER = json(200, { data: [], isLive: false });

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

async function renderSettled(routes: { demographics: Route; transport: Route }) {
  const mock = serve({
    "/api/v1/demographics": routes.demographics,
    "/api/v1/transport": routes.transport,
    "/api/v1/disaster-risks": DISASTER,
  });
  const view = render(<Home />);
  await waitFor(() => expect(mock).toHaveBeenCalledTimes(3));
  // Let each response → json → setState chain drain.
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

/** The ward options of the header selector: everything but the 全エリア entry. */
function wardOptions(container: HTMLElement): string[] {
  const select = container.querySelector<HTMLSelectElement>("header select");
  if (!select) throw new Error("no ward selector in the header");
  return [...select.querySelectorAll("option")].filter((o) => o.value !== "").map((o) => o.value);
}

/** The map legend overlay for the 乗降客数 (station bubble) layer. */
function stationLegend(container: HTMLElement): HTMLElement {
  const overlays = [...container.querySelectorAll<HTMLElement>(".map-overlay")];
  const legend = overlays.find((el) => (el.textContent ?? "").includes("乗降客数"));
  if (!legend) throw new Error("no 乗降客数 legend on the map");
  return legend;
}

function footerSampleGroup(container: HTMLElement): string {
  return container.querySelector('footer [data-provenance="sample"]')?.textContent ?? "";
}

/** What the page handed MapView: the station list and whether ridership is live. */
function mapProps(container: HTMLElement): { stations: unknown[] | null; live: string } {
  const stub = container.querySelector<HTMLElement>('[data-testid="map-stub"]');
  if (!stub) throw new Error("no map stub");
  return { stations: JSON.parse(stub.dataset.stations ?? "null"), live: stub.dataset.transportLive ?? "" };
}

function expectNoSample(root: HTMLElement, what: string) {
  expect(root.querySelector(SAMPLE_NODE), `${what}: carries a SAMPLE node`).toBeNull();
  const text = root.textContent ?? "";
  for (const n of SAMPLE_NUMBERS) expect(text, `${what}: shows the sample number ${n}`).not.toContain(n);
}

/** Sample nodes inside a tab panel, excluding the surfaces PR 1 does not touch. */
function sampleNodesOutsidePr1(panel: HTMLElement): number {
  return panel.querySelectorAll(SAMPLE_NODE).length;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("読み込み中 — before either response resolves", () => {
  it("K1 成長率 and K3 乗降客 say 読み込み中: no sample number, no SAMPLE tag", async () => {
    const { container } = await renderSettled({ demographics: pending, transport: pending });
    for (const caption of ["成長率", "乗降客"]) {
      const tile = keyMetric(container, caption);
      expectNoSample(tile, `tile ${caption}`);
      expect(tile.textContent, `tile ${caption}`).toContain(LOADING);
    }
  });

  it("S0: the ward selector offers all 23 wards in code order before any response", async () => {
    const { container } = await renderSettled({ demographics: pending, transport: pending });
    expect(wardOptions(container)).toEqual(WARD_NAMES_IN_CODE_ORDER);
  });

  it("P2–P4, L3, T1–T2 say 読み込み中 and show no sample number", async () => {
    await renderSettled({ demographics: pending, transport: pending });

    const land = openTab("地価");
    expect(land.querySelectorAll("tbody tr"), "区別データテーブル rows").toHaveLength(0);
    expect(land.textContent).not.toContain("93.9万");
    expect(land.textContent).toContain(LOADING);

    const people = openTab("人口");
    for (const n of SAMPLE_NUMBERS) expect(people.textContent ?? "").not.toContain(n);
    // Only 人口推移 (P1, not in PR 1) may still carry the sample label here.
    expect(sampleNodesOutsidePr1(people), "人口 tab SAMPLE nodes (人口推移 only)").toBeLessThanOrEqual(1);
    expect(people.textContent).toContain(LOADING);

    const transport = openTab("交通");
    expect(transport.textContent).not.toContain("77.5万");
    // Only 乗降客数推移 (T3, not in PR 1) may still carry the sample label here.
    expect(sampleNodesOutsidePr1(transport), "交通 tab SAMPLE nodes (乗降客数推移 only)").toBeLessThanOrEqual(1);
    expect(transport.textContent).toContain(LOADING);
  });

  it("M6: the 乗降客数 legend says 読み込み中, not SAMPLE", async () => {
    const { container } = await renderSettled({ demographics: pending, transport: pending });
    openTab("交通");
    const legend = stationLegend(container);
    expectNoSample(legend, "station legend");
    expect(legend.textContent).toContain(LOADING);
  });

  it("footer: neither surface is listed as sample while loading", async () => {
    const { container } = await renderSettled({ demographics: pending, transport: pending });
    const sample = footerSampleGroup(container);
    expect(sample).not.toContain("人口・密度・増減・年齢構成");
    expect(sample).not.toContain("駅別乗降客数");
  });
});

describe("取得失敗 — the endpoint failed", () => {
  const FAILURES: [string, Route][] = [
    ["network failure", offline],
    ["HTTP 500", json(500, { detail: "boom" })],
    ["HTTP 503 with status unavailable (the server's failure shape)", UNAVAILABLE],
  ];

  it.each(FAILURES)("%s: K1 and K3 say 取得失敗, never a sample number", async (_label, failure) => {
    const { container } = await renderSettled({ demographics: failure, transport: failure });
    for (const caption of ["成長率", "乗降客"]) {
      const tile = keyMetric(container, caption);
      expectNoSample(tile, `tile ${caption}`);
      expect(tile.textContent, `tile ${caption}`).toContain(FAILED);
    }
  });

  it("S0: the ward selector still offers all 23 wards in code order; only the figures fail", async () => {
    const { container } = await renderSettled({ demographics: UNAVAILABLE, transport: UNAVAILABLE });
    expect(wardOptions(container)).toEqual(WARD_NAMES_IN_CODE_ORDER);
    expect(keyMetric(container, "成長率").textContent).toContain(FAILED);
  });

  it("P2–P4, L3, T1–T2 say 取得失敗 and show no sample number", async () => {
    await renderSettled({ demographics: UNAVAILABLE, transport: UNAVAILABLE });

    const land = openTab("地価");
    expect(land.querySelectorAll("tbody tr"), "区別データテーブル rows").toHaveLength(0);
    expect(land.textContent).not.toContain("93.9万");
    expect(land.textContent).toContain(FAILED);

    const people = openTab("人口");
    for (const n of SAMPLE_NUMBERS) expect(people.textContent ?? "").not.toContain(n);
    expect(sampleNodesOutsidePr1(people), "人口 tab SAMPLE nodes (人口推移 only)").toBeLessThanOrEqual(1);
    expect(people.textContent).toContain(FAILED);

    const transport = openTab("交通");
    expect(transport.textContent).not.toContain("77.5万");
    expect(sampleNodesOutsidePr1(transport), "交通 tab SAMPLE nodes (乗降客数推移 only)").toBeLessThanOrEqual(1);
    expect(transport.textContent).toContain(FAILED);
  });

  it("M6: the 乗降客数 legend says 取得失敗, not SAMPLE", async () => {
    const { container } = await renderSettled({ demographics: UNAVAILABLE, transport: UNAVAILABLE });
    openTab("交通");
    const legend = stationLegend(container);
    expectNoSample(legend, "station legend");
    expect(legend.textContent).toContain(FAILED);
  });

  it("footer: a failed surface is not listed as sample", async () => {
    const { container } = await renderSettled({ demographics: UNAVAILABLE, transport: UNAVAILABLE });
    const sample = footerSampleGroup(container);
    expect(sample).not.toContain("人口・密度・増減・年齢構成");
    expect(sample).not.toContain("駅別乗降客数");
  });

  it("one endpoint failing does not take the other's surfaces down", async () => {
    const { container } = await renderSettled({ demographics: UNAVAILABLE, transport: TRANSPORT });
    expect(keyMetric(container, "成長率").textContent).toContain(FAILED);
    const passengers = keyMetric(container, "乗降客");
    expect(passengers.textContent).not.toContain(FAILED);
    expect(passengers.textContent).toContain("0万");
  });
});

describe("data — a genuine zero is 0 (pins; green on main)", () => {
  it("K1 reads 0.0% for 江東区, K3 reads 0万; no 取得失敗, no 読み込み中, no SAMPLE", async () => {
    const { container } = await renderSettled({ demographics: DEMOGRAPHICS, transport: TRANSPORT });
    const growth = keyMetric(container, "成長率");
    expect(growth.textContent).toContain("0.0%");
    expect(growth.textContent).toContain("江東区");
    const passengers = keyMetric(container, "乗降客");
    expect(passengers.textContent).toContain("0万");
    for (const tile of [growth, passengers]) {
      expectNoSample(tile, "tile");
      expect(tile.textContent).not.toContain(FAILED);
      expect(tile.textContent).not.toContain(LOADING);
      expect(tile.textContent).not.toContain(NO_DATA);
    }
    // S0 is independent of the answer: all 23, code order, not the three wards served.
    expect(wardOptions(container)).toEqual(WARD_NAMES_IN_CODE_ORDER);
  });

  it("P2 最大成長 0.0%; L3 lists the three wards; T1 lists 豊洲駅 0.0万 and 東陽町駅 データなし", async () => {
    await renderSettled({ demographics: DEMOGRAPHICS, transport: TRANSPORT });

    const land = openTab("地価");
    expect(land.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(land.textContent).not.toContain(FAILED);

    const people = openTab("人口");
    expect(people.textContent).toContain("0.0%");
    expect(people.textContent).not.toContain(FAILED);

    const transport = openTab("交通");
    expect(transport.textContent).toContain("豊洲駅");
    expect(transport.textContent).toContain("0.0万");
    expect(transport.textContent).toContain("東陽町駅");
    expect(transport.textContent).toContain(NO_DATA);
    expect(transport.textContent).not.toContain(FAILED);
  });
});

describe("M6: what the map is handed — a consumer of /transport PR 1 did not list", () => {
  it("loading and unavailable → an empty station list and no live claim", async () => {
    for (const transport of [pending, UNAVAILABLE]) {
      const { container, unmount } = await renderSettled({ demographics: pending, transport });
      expect(mapProps(container)).toEqual({ stations: [], live: "false" });
      unmount();
    }
  });

  it("partial → the real stations, no live claim; ok → the real stations, live", async () => {
    const partial = await renderSettled({ demographics: DEMOGRAPHICS, transport: TRANSPORT_PARTIAL });
    expect(mapProps(partial.container).stations).toHaveLength(2);
    expect(mapProps(partial.container).live).toBe("false");
    partial.unmount();

    const ok = await renderSettled({ demographics: DEMOGRAPHICS, transport: TRANSPORT });
    expect(mapProps(ok.container).stations).toHaveLength(2);
    expect(mapProps(ok.container).live).toBe("true");
  });
});

describe("partial — stations answered, ridership did not (F4, ODPT down)", () => {
  it("K3 reads 取得失敗 for the ridership sum: not データなし, not SAMPLE", async () => {
    const { container } = await renderSettled({ demographics: DEMOGRAPHICS, transport: TRANSPORT_PARTIAL });
    const passengers = keyMetric(container, "乗降客");
    expect(passengers.textContent).toContain(FAILED);
    expect(passengers.textContent).not.toContain(NO_DATA);
    expectNoSample(passengers, "tile 乗降客");
  });

  it("T1–T2 list the real stations with 取得失敗 ridership and no SAMPLE label; M6 legend and footer agree", async () => {
    const { container } = await renderSettled({ demographics: DEMOGRAPHICS, transport: TRANSPORT_PARTIAL });
    const transport = openTab("交通");
    // Station names and positions are real and still render.
    expect(transport.textContent).toContain("豊洲駅");
    expect(transport.textContent).toContain("東陽町駅");
    // The ridership the upstream did not deliver is 取得失敗, never データなし.
    expect(transport.textContent).toContain(FAILED);
    expect(transport.textContent).not.toContain(NO_DATA);
    expect(sampleNodesOutsidePr1(transport), "交通 tab SAMPLE nodes (乗降客数推移 only)").toBeLessThanOrEqual(1);

    const legend = stationLegend(container);
    expectNoSample(legend, "station legend");
    expect(legend.textContent).toContain(FAILED);

    expect(footerSampleGroup(container)).not.toContain("駅別乗降客数");
  });
});
