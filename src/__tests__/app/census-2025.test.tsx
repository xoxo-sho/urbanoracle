import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import expected from "../../../backend/tests/fixtures/census_2025/expected.json";

/**
 * PR 2 of the real-data plan (RECON 2026-10-uo-real-data §9 row 2): every
 * census figure on screen — population, density, age shares, growth rate —
 * carries a year read from the payload, and they are all the same vintage,
 * the 令和7年国勢調査 人口等基本集計（確報）. Today the notes hard-code
 * 「2020年国勢調査・2025年速報」, two vintages under one line, and the K1
 * 成長率 tile has no source line of its own.
 *
 * The server now says, per census field, which year and which e-Stat table a
 * figure came from (`sources` in the envelope; the ids come from the same
 * fixture the backend guards use). The page must render that, not a literal:
 * the same page served a payload that says 2031 must read 2031年 wherever it
 * read 2025年, and nowhere 2020年国勢調査 or 速報.
 *
 * Rendered with the real hook; only fetch is replaced (as
 * dashboard-failure-states.test.tsx does).
 *
 * RED on main (b7b24b4).
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
import { useGatedData } from "@/lib/use-gated-data";
import { ESTAT_EDITED } from "@/lib/credits";
import {
  LAND_PRICES_FIXTURE,
  LAND_PRICES_SOURCES,
  POPULATION_TRENDS_FIXTURE,
  POPULATION_TRENDS_SOURCES,
  ZONING_FIXTURE,
  ZONING_SOURCES,
  ZONING_TOTAL,
  greenPayload,
} from "@/__tests__/fixtures/live-data";

const TABLES = expected.meta.tables as { population: string; growthRate: string; ageGroups: string };
const AREA_EDITION = expected.meta.area.edition;
const CENSUS_YEAR = Number(expected.meta.reference_date.slice(0, 4));

const OLD_VINTAGE = ["2020年国勢調査", "速報", "令和2年"];
const FAILED = "取得失敗";

interface FieldSource {
  year: number;
  table: string;
  label: string;
}

/** What the server says about each census field, for a given year. */
function sourcesFor(year: number): Record<string, FieldSource> {
  return {
    population: { year, table: TABLES.population, label: "令和7年国勢調査 人口等基本集計（確報） 男女別人口" },
    density: {
      year,
      table: TABLES.population,
      label: `令和7年国勢調査 人口等基本集計（確報） 人口 ÷ 国土地理院 ${AREA_EDITION}`,
    },
    ageGroups: { year, table: TABLES.ageGroups, label: "令和7年国勢調査 人口等基本集計 不詳補完値 年齢（3区分）人口構成比" },
    growthRate: { year, table: TABLES.growthRate, label: "令和7年国勢調査 人口等基本集計（確報） 5年間の人口増減率" },
  };
}

const ward = (code: keyof typeof expected.wards) => {
  const w = expected.wards[code];
  return {
    region: w.name,
    population: w.population,
    density: Math.round(w.population / w.area_km2),
    growthRate: w.growth_rate,
    ageGroups: {
      young: Math.round(w.age_share.young),
      working: Math.round(w.age_share.working),
      elderly: Math.round(w.age_share.elderly),
    },
  };
};
const DATA = [ward("13101"), ward("13108"), ward("13123")];

type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const demographics = (year: number): Route =>
  json(200, { status: "ok", data: DATA, sources: sourcesFor(year) });
// The growth table did not answer: the server names the field and claims no source for it.
const demographicsPartial: Route = json(200, {
  status: "partial",
  data: DATA.map((d) => ({ ...d, growthRate: null })),
  unavailable: ["growthRate"],
  sources: Object.fromEntries(Object.entries(sourcesFor(CENSUS_YEAR)).filter(([field]) => field !== "growthRate")),
});
const TRANSPORT = json(200, { status: "ok", data: [], fetchedAt: "2026-10-30T00:00:00+00:00" });
const DISASTER = json(200, { status: "ok", data: [] });
// The 人口推移 snapshot route (PR 3), served so the page settles.
const TRENDS = json(200, { status: "ok", data: POPULATION_TRENDS_FIXTURE, sources: POPULATION_TRENDS_SOURCES });
// The 地価公示 snapshot route (PR 5): answers so the page settles (land-prices.test.tsx guards it).
const LAND_PRICES = json(200, { status: "ok", data: LAND_PRICES_FIXTURE, sources: LAND_PRICES_SOURCES });
// The 用途地域 snapshot route (PR 6): answers so the page settles (zoning.test.tsx guards it).
const ZONING = json(200, { status: "ok", data: ZONING_FIXTURE, sources: ZONING_SOURCES, total: ZONING_TOTAL });

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

async function renderSettled(demographicsRoute: Route) {
  const mock = serve({
    "/api/v1/demographics": demographicsRoute,
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

function growthTile(container: HTMLElement): HTMLElement {
  const tiles = [...container.querySelectorAll<HTMLElement>(".key-metric")];
  const tile = tiles.find((t) => (t.textContent ?? "").includes("成長率"));
  if (!tile) throw new Error('no .key-metric containing "成長率"');
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

/**
 * The provenance lines of the census surfaces: SourceNote paragraphs, plus —
 * for the 区別データテーブル, whose 地価 column is still sample — the note
 * under the table that names the census columns' source. The 人口推移 chart
 * (PR 3) has its own guards and is left out by the filter.
 */
const TREND_SURFACE = '[data-surface="population-trend"]';

function sourceLines(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>(".source-note")]
    .filter((el) => !el.closest(TREND_SURFACE))
    .map((el) => el.textContent ?? "")
    .filter((text) => text.includes("出典") || text.includes("人口"));
}

/** The panel's text without the 人口推移 surface, which spans 2000–2025 by design. */
function censusText(panel: HTMLElement): string {
  const copy = panel.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(TREND_SURFACE).forEach((el) => el.remove());
  return copy.textContent ?? "";
}

/** The footer's census row (the 人口推移 row beside it names its own years). */
function footerLive(container: HTMLElement): string {
  return container.querySelector('footer [data-provenance="live"] [data-source="census"]')?.textContent ?? "";
}

function expectNoOldVintage(text: string, what: string) {
  for (const old of OLD_VINTAGE) expect(text, `${what}: still says ${old}`).not.toContain(old);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the hook passes `sources` through", () => {
  it("exposes the envelope's sources; {} when the body has none", async () => {
    const sources = sourcesFor(CENSUS_YEAR);
    serve({ "/api/v1/x": json(200, { status: "ok", data: [], sources }) });
    const withSources = renderHook(() => useGatedData<unknown[]>("/api/v1/x"));
    await waitFor(() => expect(withSources.result.current.status).toBe("ok"));
    expect((withSources.result.current as { sources?: unknown }).sources).toEqual(sources);

    serve({ "/api/v1/y": json(200, { status: "ok", data: [] }) });
    const without = renderHook(() => useGatedData<unknown[]>("/api/v1/y"));
    await waitFor(() => expect(without.result.current.status).toBe("ok"));
    expect((without.result.current as { sources?: unknown }).sources).toEqual({});
  });
});

describe("K1 成長率 has its own source line, from the payload", () => {
  it("names the growth table and the year the server sent", async () => {
    const { container } = await renderSettled(demographics(CENSUS_YEAR));
    const line = growthTile(container).querySelector<HTMLElement>('[data-source="growthRate"]');
    expect(line, "no [data-source=growthRate] line on the 成長率 tile").not.toBeNull();
    expect(line!.textContent).toContain(TABLES.growthRate);
    expect(line!.textContent).toContain(`${CENSUS_YEAR}年`);
    expectNoOldVintage(growthTile(container).textContent ?? "", "K1");
  });

  it("reads the year from the payload: a payload that says 2031 renders 2031年", async () => {
    const { container } = await renderSettled(demographics(2031));
    const line = growthTile(container).querySelector<HTMLElement>('[data-source="growthRate"]');
    expect(line?.textContent).toContain("2031年");
    expect(line?.textContent).not.toContain(`${CENSUS_YEAR}年`);
  });

  it("is set in the dashboard's source-note size (globals.css .source-note, 11px), not a smaller ad-hoc size", async () => {
    // The 9px caption on this tile is already logged as unreadable (RECON §9,
    // Architect additions); a new line must not be smaller still. The one
    // provenance size the dashboard has is .source-note.
    const { container } = await renderSettled(demographics(CENSUS_YEAR));
    const line = growthTile(container).querySelector<HTMLElement>('[data-source="growthRate"]');
    expect(line, "no [data-source=growthRate] line on the 成長率 tile").not.toBeNull();
    expect(line!.classList.contains("source-note"), `classes: ${line!.className}`).toBe(true);
    expect(line!.className).not.toMatch(/text-\[\d+px\]|text-xs|text-sm/);
  });

  it("partial (growth table down): the tile reads 取得失敗 and claims no source", async () => {
    const { container } = await renderSettled(demographicsPartial);
    const tile = growthTile(container);
    expect(tile.textContent).toContain(FAILED);
    expect(tile.querySelector('[data-source="growthRate"]')).toBeNull();
  });
});

describe("人口 tab: every figure's note carries the payload's year, one vintage", () => {
  it("all-area view: the notes say 2025年, name the 不詳補完値 table for the age shares, never 2020年国勢調査 / 速報", async () => {
    await renderSettled(demographics(CENSUS_YEAR));
    const panel = openTab("人口");
    const lines = sourceLines(panel);
    expect(lines.length, "no source lines on the 人口 tab").toBeGreaterThan(0);
    for (const line of lines) expect(line).toContain(`${CENSUS_YEAR}年`);
    expect(lines.join("\n")).toContain("不詳補完値");
    expect(lines.join("\n")).toContain(TABLES.ageGroups);
    expectNoOldVintage(censusText(panel), "人口 tab (all area)");
  });

  it("ward view (江戸川区): population, density, growth and age cards sit under a note that says 2025年", async () => {
    const { container } = await renderSettled(demographics(CENSUS_YEAR));
    openTab("人口");
    selectWard(container, "江戸川区");
    const panel = screen.getByRole("tabpanel");
    const lines = sourceLines(panel);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toContain(`${CENSUS_YEAR}年`);
    expectNoOldVintage(censusText(panel), "人口 tab (江戸川区)");
  });

  it("reads the year from the payload: 2031 renders 2031年 on every note", async () => {
    await renderSettled(demographics(2031));
    const panel = openTab("人口");
    const lines = sourceLines(panel);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toContain("2031年");
      expect(line).not.toContain(`${CENSUS_YEAR}年`);
    }
  });
});

describe("区別データテーブル (地価 tab) and the footer", () => {
  it("the table's note carries the payload's year, never 2020年国勢調査 / 速報", async () => {
    await renderSettled(demographics(CENSUS_YEAR));
    const panel = openTab("地価");
    const lines = sourceLines(panel).filter((l) => l.includes("人口"));
    expect(lines.length, "no census note under the 区別データテーブル").toBeGreaterThan(0);
    for (const line of lines) expect(line).toContain(`${CENSUS_YEAR}年`);
    expectNoOldVintage(panel.textContent ?? "", "地価 tab");
  });

  it("the table's note reads the year from the payload: 2031 renders 2031年", async () => {
    await renderSettled(demographics(2031));
    const lines = sourceLines(openTab("地価")).filter((l) => l.includes("人口"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toContain("2031年");
      expect(line).not.toContain(`${CENSUS_YEAR}年`);
    }
  });

  it("the footer's live row names the year and the three tables from the payload", async () => {
    const { container } = await renderSettled(demographics(CENSUS_YEAR));
    const live = footerLive(container);
    expect(live).toContain(`${CENSUS_YEAR}年`);
    for (const table of Object.values(TABLES)) expect(live).toContain(table);
    expectNoOldVintage(live, "footer");
  });

  it("the footer reads the year from the payload too", async () => {
    const { container } = await renderSettled(demographics(2031));
    expect(footerLive(container)).toContain("2031年");
    expect(footerLive(container)).not.toContain(`${CENSUS_YEAR}年`);
  });
});

describe("the e-Stat 加工 statement names the vintage actually used", () => {
  it("cites 令和7年国勢調査 人口等基本集計 and no longer 令和2年 or the 速報", () => {
    expect(ESTAT_EDITED).toContain("令和7年国勢調査");
    expect(ESTAT_EDITED).toContain("人口等基本集計");
    expect(ESTAT_EDITED).not.toContain("令和2年");
    expect(ESTAT_EDITED).not.toContain("速報");
  });
});
