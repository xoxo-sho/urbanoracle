import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * PR 9 of the real-data plan (RECON 2026-10-uo-real-data §9 row 9; Architect
 * decisions of 2026-11-09, decision 10): the sample layer leaves the codebase.
 *
 *   - src/data/sample.ts is deleted and nothing imports it. What it still held,
 *     `dataLayers`, is layer configuration and lives in src/lib/layers.ts
 *     (src/__tests__/lib/layers.test.ts pins its content).
 *   - SampleNote / SampleTag, SAMPLE_NOTICE, SOURCES.sample, the footer's and
 *     the landing page's sample group, the dictionary keys that fed them and
 *     their CSS are deleted: no surface has been a sample since PR 4b, so the
 *     code was a path nothing took.
 *   - `isLive` leaves the client (and every response — backend/tests/
 *     test_no_is_live.py): it only ever meant "not the sample set". `status`
 *     (ok / partial / unavailable, PR 1) is the only signal, on the hook's
 *     state and on what the page hands the map.
 *   - The footer and the LP's データ出典 table render one group, 実データ.
 *
 * The built export is checked for the same strings by scripts/verify-bundle.sh
 * section 4c (self-tested in scripts/test-verify-bundle.sh).
 *
 * The files are read from source rather than imported: importing a symbol
 * this PR deletes would stop the guard loading once it is green.
 *
 * RED on main (d1eda4e), except the rendered-group cases marked "held since
 * PR 4b": the sample groups already rendered nothing, and those cases pin
 * that while the code path behind them goes.
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
import { LP_COPY } from "@/i18n/lp";
import { SOURCES } from "@/lib/sources";
import {
  CENSUS_ROWS,
  DEMOGRAPHICS_SOURCES,
  POPULATION_TRENDS_FIXTURE,
  POPULATION_TRENDS_SOURCES,
  disasterSnapshotRows,
  disasterSnapshotTotal,
  greenPayload,
  landPricesSnapshotRows,
  landPricesSnapshotTotal,
  loadDisasterSnapshot,
  loadLandPricesSnapshot,
  loadZoningSnapshot,
  transportPayload,
  zoningSnapshotRows,
  zoningSnapshotTotal,
} from "@/__tests__/fixtures/live-data";

// vitest runs from the project root (vitest.config.ts); refuse to read from
// anywhere else rather than silently pass against the wrong tree.
const ROOT = process.cwd();
if (JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8")).name !== "urban-oracle") {
  throw new Error(`not the UrbanOracle root: ${ROOT}`);
}
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");

function walk(dir: string, withTests: boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      if (entry === "__tests__" && !withTests) continue;
      walk(full, withTests, out);
    } else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}
/** Files under src/ whose text matches, repo-relative. Tests are left out unless asked for. */
const filesMatching = (pattern: RegExp, withTests = false) =>
  walk(resolve(ROOT, "src"), withTests)
    .filter((file) => pattern.test(readFileSync(file, "utf-8")))
    .map((file) => relative(ROOT, file))
    .sort();

// The three strings no screen may show any more.
const SAMPLE_WORDS = ["サンプル", "SAMPLE", "固定の参考値"];
const SAMPLE_NODE = '[data-provenance="sample"]';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the sample module is deleted and nothing imports it", () => {
  it("src/data/sample.ts does not exist", () => {
    expect(existsSync(resolve(ROOT, "src/data/sample.ts"))).toBe(false);
  });

  it("no file under src/ — tests included — imports a data/sample module", () => {
    const importers = filesMatching(/(?:from|import\()\s*["'][^"']*data\/sample(?:\.ts)?["']/, true);
    expect(importers).toEqual([]);
  });

  it("the layer list has its own module, and the dashboard reads it from there", () => {
    expect(existsSync(resolve(ROOT, "src/lib/layers.ts"))).toBe(true);
    expect(read("src/app/app/page.tsx")).toMatch(/import \{ dataLayers \} from "@\/lib\/layers";/);
  });
});

describe("the sample components, notice, source entry, dictionary keys and CSS are deleted", () => {
  it("src/components/dashboard/SampleNote.tsx does not exist", () => {
    expect(existsSync(resolve(ROOT, "src/components/dashboard/SampleNote.tsx"))).toBe(false);
  });

  // Each as it would appear in source: a component or constant name, a
  // dictionary key, a class name, the attribute value of the sample group.
  it.each([
    ["SampleNote", /\bSampleNote\b/],
    ["SampleTag", /\bSampleTag\b/],
    ["SAMPLE_NOTICE", /\bSAMPLE_NOTICE\b/],
    ["SAMPLE_SURFACES", /\bSAMPLE_SURFACES\b/],
    ["SAMPLE_ROWS", /\bSAMPLE_ROWS\b/],
    ["sampleNotice", /\bsampleNotice\b/],
    ["srcSample", /\bsrcSample\b/],
    ["the sample-note / sample-tag / sample-legend / sample-block classes", /\bsample-(?:note|tag|legend|block)\b/],
    ['data-provenance="sample"', /data-provenance=["']sample["']/],
  ])("nothing under src/ outside the tests names %s", (_name, pattern) => {
    expect(filesMatching(pattern)).toEqual([]);
  });

  it("SOURCES has no sample entry", () => {
    expect(Object.keys(SOURCES)).not.toContain("sample");
  });

  it("neither LP dictionary carries a sample string", () => {
    expect(Object.values(LP_COPY.ja).filter((text) => text.includes("サンプル"))).toEqual([]);
    expect(Object.values(LP_COPY.en).filter((text) => /sample/i.test(text))).toEqual([]);
  });
});

describe("isLive is gone from the client — status is the only signal (decision 10)", () => {
  it("nothing under src/ outside the tests names isLive, in any casing or as part of a longer name", () => {
    expect(filesMatching(/is_?live/i)).toEqual([]);
  });

  it("the map is handed the /transport answer's status, as the legend is", () => {
    const page = read("src/app/app/page.tsx");
    expect(page).toMatch(/transportStatus=\{transport\.status\}/);
    expect(read("src/components/map/MapView.tsx")).toMatch(/transportStatus\?: DataStatus;/);
  });
});

// ---- the rendered groups ---------------------------------------------------------
type Route = () => Promise<Response>;
const json =
  (status: number, body: unknown): Route =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const UNAVAILABLE: Route = json(503, { status: "unavailable" });

const land = loadLandPricesSnapshot();
const disaster = loadDisasterSnapshot();
const zoning = loadZoningSnapshot();

// The envelope the server sends since this PR: status, data, sources, total.
const ROUTES: Record<string, Route> = {
  "/api/v1/demographics": json(200, { status: "ok", data: CENSUS_ROWS, sources: DEMOGRAPHICS_SOURCES }),
  "/api/v1/transport": json(200, transportPayload()),
  "/api/v1/disaster-risks": json(200, { status: "ok", data: disasterSnapshotRows(disaster), sources: disaster.sources, total: disasterSnapshotTotal(disaster) }),
  "/api/v1/population-trends": json(200, { status: "ok", data: POPULATION_TRENDS_FIXTURE, sources: POPULATION_TRENDS_SOURCES }),
  "/api/v1/land-prices": json(200, { status: "ok", data: landPricesSnapshotRows(land), sources: land.sources, total: landPricesSnapshotTotal(land) }),
  "/api/v1/zoning": json(200, { status: "ok", data: zoningSnapshotRows(zoning), sources: zoning.sources, total: zoningSnapshotTotal(zoning) }),
  "/api/v1/green-land-use": json(200, greenPayload()),
};

async function renderSettled(routes: Record<string, Route> = ROUTES) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch: ${url}`);
    return route();
  });
  vi.stubGlobal("fetch", mock);
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

const groups = (root: Element) => [...root.querySelectorAll<HTMLElement>("[data-provenance]")].map((el) => el.dataset.provenance);

describe("the dashboard footer renders only the 実データ group", () => {
  it("the page source has one provenance group, the live one", () => {
    const declared = read("src/app/app/page.tsx").match(/data-provenance="[^"]*"/g) ?? [];
    expect(declared).toEqual(['data-provenance="live"']);
  });

  it("every endpoint ok → one group headed 実データ; no sample word on any tab or for any ward (held since PR 4b)", async () => {
    const { container } = await renderSettled();
    const footer = container.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(groups(footer!)).toEqual(["live"]);
    expect(footer!.querySelector('[data-provenance="live"] > span')?.textContent).toBe("実データ");

    for (const tab of ["人口", "地価", "災害", "交通", "用途地域"]) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      expect(container.querySelectorAll(SAMPLE_NODE), tab).toHaveLength(0);
      for (const word of SAMPLE_WORDS) expect(container.textContent, `${tab}: ${word}`).not.toContain(word);
    }
    for (const ward of ["千代田区", "江戸川区"]) {
      selectWard(container, ward);
      expect(container.querySelectorAll(SAMPLE_NODE), ward).toHaveLength(0);
      for (const word of SAMPLE_WORDS) expect(container.textContent, `${ward}: ${word}`).not.toContain(word);
    }
  });

  it("every endpoint unavailable → still one group, 実データ, and no sample word (held since PR 4b)", async () => {
    const down = Object.fromEntries(Object.keys(ROUTES).map((url) => [url, UNAVAILABLE]));
    const { container } = await renderSettled(down);
    expect(groups(container.querySelector("footer")!)).toEqual(["live"]);
    for (const word of SAMPLE_WORDS) expect(container.textContent, word).not.toContain(word);
  });
});

describe("the landing page's データ出典 table renders only the 実データ group", () => {
  it("the LP source has one provenance group, the live one", () => {
    const declared = read("src/components/landing/LandingContent.tsx").match(/data-provenance="[^"]*"/g) ?? [];
    expect(declared).toEqual(['data-provenance="live"']);
  });

  it("one group, 実データ, and no sample word anywhere on the page (held since PR 4b)", () => {
    const { container } = render(<LandingPage />);
    expect(groups(container)).toEqual(["live"]);
    expect(container.querySelector('tbody[data-provenance="live"] th')?.textContent).toBe("実データ");
    for (const word of SAMPLE_WORDS) expect(container.textContent, word).not.toContain(word);
  });
});
