import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Follow-up 3, decision B (Architect, 2026-11-09): 高潮 from 東京都's 2024-12
 * revision — 東京都港湾局・建設局「高潮浸水想定区域図」（令和6年12月改定）, 10 m cells
 * put into the seven classes A49-20 had, at the same boundaries.
 *
 * What the 高潮 surface must say, every claim read from the payload:
 *   shares   per class the share of the ward's area, from the new snapshot
 *            (中央区 38.2 / 8.1 / 1.1, 台東区 56.3 / 17.8 / 0.0, 江戸川区
 *            76.5 / 75.5 / 40.3, 23区 29.7 / 21.9 / 9.1: any / ≥ 1 m / ≥ 3 m);
 *   時点     「時点：令和6年12月改定」, the payload's;
 *   classes  the sentence that the classes follow the same boundaries as before;
 *   credit   the 都's CC BY credit in its modified-use form, on the surface,
 *            in the footer and on the LP;
 *   A49      gone from the surface, the footer and the LP.
 *
 * K2 and the LP hero read 地域危険度 and 洪水, so neither moves. Rendered with
 * the real hook; only fetch is replaced. RED on main (9010a53).
 */

vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="map-stub" /> }));
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
  disasterSnapshotRows,
  disasterSnapshotTotal,
  greenPayload,
  loadDisasterSnapshot,
  loadHeroSpread,
  transportPayload,
} from "@/__tests__/fixtures/live-data";
import { TAKASHIO_CLASS_NOTE, TAKASHIO_EDITED } from "@/lib/credits";

const snapshot = loadDisasterSnapshot();
const ROWS = disasterSnapshotRows(snapshot);
const TOTAL = disasterSnapshotTotal(snapshot);
const SOURCES = snapshot.sources;
const REVISION = "令和6年12月改定";
// The Architect's cross-check figures (brief 2026-11-09): any / ≥ 1 m / ≥ 3 m, % of the ward, one decimal.
const CROSS_CHECK: Record<string, [number, number, number]> = {
  中央区: [38.2, 8.1, 1.1],
  台東区: [56.3, 17.8, 0.0],
  江戸川区: [76.5, 75.5, 40.3],
  東京23区: [29.7, 21.9, 9.1],
};
const A49_EDITED = "「国土数値情報（高潮浸水想定区域データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";

type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const DISASTER: Route = json(200, { status: "ok", data: ROWS, sources: SOURCES, total: TOTAL });
const DEMOGRAPHICS: Route = json(200, { status: "ok", data: DEMOGRAPHICS_FIXTURE, sources: DEMOGRAPHICS_SOURCES });
const TRANSPORT: Route = json(200, transportPayload());
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

async function renderSettled() {
  const mock = serve({
    "/api/v1/demographics": DEMOGRAPHICS,
    "/api/v1/transport": TRANSPORT,
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
function tideSurface(panel: HTMLElement): HTMLElement {
  const el = panel.querySelector<HTMLElement>('[data-surface="disaster-hightide"]');
  if (!el) throw new Error("no 高潮 surface");
  return el;
}
/** any / ≥ 1 m / ≥ 3 m from the class rows on screen (classes 1–7, 4–7, 5–7), one decimal. */
function three(tide: HTMLElement): [number, number, number] {
  const shares = [...tide.querySelectorAll<HTMLElement>("[data-tide-class]")].map((el) => [Number(el.dataset.code), Number(el.dataset.share)] as const);
  const sum = (from: number) => Math.round(shares.filter(([c]) => c >= from).reduce((a, [, s]) => a + s, 0) * 10) / 10;
  return [sum(1), sum(4), sum(5)];
}
const footerLive = (c: HTMLElement) => c.querySelector('footer [data-provenance="live"]')?.textContent ?? "";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("高潮 — the 都's 令和6年12月改定 on the surface", () => {
  it("中央区, 台東区, 江戸川区 and the 23区: the Architect's cross-check shares, from the payload", async () => {
    const { container } = await renderSettled();
    // 東京23区 first: it is the view before any ward is chosen.
    for (const [name, want] of Object.entries(CROSS_CHECK).sort(([a]) => (a === "東京23区" ? -1 : 1))) {
      if (name !== "東京23区") selectWard(container, name);
      const tide = tideSurface(openTab("災害"));
      expect(three(tide), name).toEqual(want);
      const record = name === "東京23区" ? TOTAL : ROWS.find((r) => r.region === name)!;
      expect([...tide.querySelectorAll<HTMLElement>("[data-tide-class]")].map((el) => Number(el.dataset.share))).toEqual(record.hightide.classes.map((c) => c.share));
    }
  });

  it("shows 「時点：令和6年12月改定」 from the payload, the sentence about the classes, the source line and the 都's credit; nothing names A49", async () => {
    const { container } = await renderSettled();
    const tide = tideSurface(openTab("災害"));
    const asOf = tide.querySelector<HTMLElement>("[data-as-of]");
    expect(asOf?.dataset.asOfText).toBe(SOURCES.hightide.table);
    expect(asOf?.textContent).toBe(`時点：${REVISION}`);
    expect(SOURCES.hightide.table).toBe(REVISION);
    expect(tide.querySelector("[data-class-note]")?.textContent).toBe(TAKASHIO_CLASS_NOTE);
    expect(TAKASHIO_CLASS_NOTE).toBe(snapshot.notes.hightide_classes);
    expect(TAKASHIO_CLASS_NOTE).toContain("0.3m・0.5m・1m・3m・5m・10m・20m");
    const source = [...tide.querySelectorAll<HTMLElement>(".source-note")].map((n) => n.textContent ?? "").join("\n");
    expect(source).toContain(SOURCES.hightide.label);
    expect(source).toContain(REVISION);
    expect(source).toContain("東京都港湾局・建設局");
    expect(tide.querySelector('[data-credit="takashio"]')?.textContent).toBe(snapshot.credit.takashio_edited);
    expect(TAKASHIO_EDITED).toBe(snapshot.credit.takashio_edited);
    expect(tide.textContent).not.toContain("A49");
    expect(tide.textContent).not.toContain("2020年度");
    // The seven classes are the ones the figures had before, in the same order.
    const labels = ["0.3m未満", "0.3m以上0.5m未満", "0.5m以上1m未満", "1m以上3m未満", "3m以上5m未満", "5m以上10m未満", "10m以上20m未満"];
    const rows = [...tide.querySelectorAll<HTMLElement>("[data-tide-class]")];
    expect(rows.map((el) => Number(el.dataset.code))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    rows.forEach((el, i) => expect(el.textContent).toContain(`浸水深 ${labels[i]}`));
  });

  it("the footer carries the 都's credit with the 時点 and no A49 line; K2 and the hero do not move", async () => {
    const { container } = await renderSettled();
    const live = footerLive(container);
    expect(live).toContain(TAKASHIO_EDITED);
    expect(live).toContain(`（${REVISION}）`);
    expect(live).not.toContain(A49_EDITED);
    expect(live).not.toContain("A49");
    const k2 = [...container.querySelectorAll<HTMLElement>(".key-metric")].find((t) => (t.textContent ?? "").includes("ランク5"));
    expect(k2?.textContent).toContain("85");
    const hero = loadHeroSpread();
    expect(JSON.stringify(hero)).not.toContain("高潮");
  });

  it("the LP lists the 都's map under 実データ with its own row and credit; A49 is gone from the page", () => {
    const { container } = render(<LandingPage />);
    const live = container.querySelector('tbody[data-provenance="live"]')?.textContent ?? "";
    expect(live).toContain("高潮浸水想定区域図");
    expect(live).toContain("2024年12月改定");
    expect(live).not.toContain("A49");
    const required = container.querySelector('[data-credit="required"]')?.textContent ?? "";
    expect(required).toContain(TAKASHIO_EDITED);
    expect(required).not.toContain(A49_EDITED);
    expect(container.textContent).not.toContain("A49-20");
  });
});
