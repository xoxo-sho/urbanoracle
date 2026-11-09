import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, waitFor } from "@testing-library/react";
import { useGatedData } from "@/lib/use-gated-data";
import { SOURCES } from "@/lib/sources";
import { ESTAT_SOURCE } from "@/lib/credits";
import { FAILED_TEXT } from "@/components/dashboard/DataState";
import { NO_DATA } from "@/lib/format";
import {
  DEMOGRAPHICS_FIXTURE,
  LAND_PRICES_FIXTURE,
  POPULATION_TRENDS_FIXTURE,
  POPULATION_TRENDS_SOURCES,
  RIDERSHIP_YEAR,
  STATIONS_FIXTURE,
  TRANSPORT_SOURCES,
} from "@/__tests__/fixtures/live-data";
import DemographicsChart from "@/components/dashboard/DemographicsChart";
import TransportPanel from "@/components/dashboard/TransportPanel";
import WardTable from "@/components/dashboard/WardTable";

/**
 * `status` is the only signal (real-data plan PR 9, Architect decision 10;
 * use-gated-data-states.test.tsx pins the states themselves). Two halves of
 * the contract:
 *
 *   1. the hook's state has no provenance flag beside `status` — the flag the
 *      envelope carried until PR 9 only ever meant "not the sample set", and
 *      no sample set is left — and it ignores one if a body still sends it;
 *   2. a consumer handed status "unavailable" renders 取得失敗 and cites no
 *      source for figures it does not have; handed "ok" it renders the real
 *      attribution; handed "partial" it renders 取得失敗 for the field the
 *      server could not fill and cites nothing it did not get.
 *
 * Flipped in PR 1: the five fallback cases described the client-side sample
 * fallback, which no longer exists. Flipped again in PR 3: the
 * DemographicsChart cases said "trend still sample"; the 人口推移 chart now
 * draws the committed census snapshot from its own route. Flipped in PR 9:
 * the three cases that read the flag off the hook now require its absence.
 */

const TREND = {
  trends: POPULATION_TRENDS_FIXTURE,
  trendStatus: "ok" as const,
  trendSources: POPULATION_TRENDS_SOURCES,
};

const auth = vi.hoisted(() => ({ getToken: async () => "id-token" }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, getToken: auth.getToken, refresh: async () => null }),
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useGatedData — status is the only signal (real-data plan PR 9, decision 10)", () => {
  // RED on main (d1eda4e): the state carried `isLive` in every status.
  const FLAG = "isLive";
  const settled = async () => {
    const { result } = renderHook(() => useGatedData<{ region: string }[]>("/api/v1/x"));
    await waitFor(() => expect(result.current.status).not.toBe("loading"));
    return result;
  };

  it("loading: the state has no provenance flag", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const { result } = renderHook(() => useGatedData<{ region: string }[]>("/api/v1/x"));
    expect(result.current.status).toBe("loading");
    expect(Object.keys(result.current)).not.toContain(FLAG);
  });

  it("200 with the envelope the server sends (status, data): ok, the rows, no provenance flag", async () => {
    const served = [{ region: "千代田区" }];
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { status: "ok", data: served })));
    const result = await settled();
    expect(result.current.status).toBe("ok");
    expect(result.current.data).toEqual(served);
    expect(Object.keys(result.current)).not.toContain(FLAG);
  });

  it("a body that still sends the flag does not put it on the state, true or false", async () => {
    for (const value of [true, false]) {
      vi.stubGlobal("fetch", vi.fn(async () => json(200, { status: "ok", data: [{ region: "x" }], [FLAG]: value })));
      const result = await settled();
      expect(result.current.status).toBe("ok");
      expect(Object.keys(result.current)).not.toContain(FLAG);
    }
  });

  it("503 unavailable: no provenance flag either", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(503, { status: "unavailable" })));
    const result = await settled();
    expect(result.current.status).toBe("unavailable");
    expect(Object.keys(result.current)).not.toContain(FLAG);
  });
});

describe("consumers render by status", () => {
  // The deleted sample label, written out: SOURCES has no sample entry since real-data plan PR 9.
  const SAMPLE = "サンプルデータ";
  const KSJ_CITATION = `出典: ${SOURCES.ksj.label}`;

  it("DemographicsChart: unavailable → 取得失敗 on the census blocks, no e-Stat citation there; the trend keeps its own citation and no sample label", () => {
    const { container } = render(
      <DemographicsChart
        data={[]}
        allData={[]}
        {...TREND}
        selectedWard={null}
        status="unavailable"
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain(FAILED_TEXT);
    expect(container.querySelector('[data-credit="estat"]')).toBeNull();
    // The only e-Stat citation left is the trend's own line.
    const trend = container.querySelector('[data-surface="population-trend"]');
    expect(trend?.textContent).toContain(ESTAT_SOURCE);
    expect(text.split(ESTAT_SOURCE).length - 1).toBe(1);
    expect(text).not.toContain(SAMPLE);
  });

  it("DemographicsChart: ok → e-Stat on the census section and on the trend, no sample label", () => {
    const { container } = render(
      <DemographicsChart
        data={DEMOGRAPHICS_FIXTURE}
        allData={DEMOGRAPHICS_FIXTURE}
        {...TREND}
        selectedWard={null}
        status="ok"
      />
    );
    const text = container.textContent ?? "";
    // e-Stat's own 出典 wording (e-Stat 利用規約 1)ア) heads the census note.
    expect(text).toContain(ESTAT_SOURCE);
    expect(container.querySelector('[data-credit="estat"]')).not.toBeNull();
    expect(text).not.toContain(SAMPLE);
    expect(text).not.toContain(FAILED_TEXT);
  });

  it("DemographicsChart: partial (growth table down) → every growth figure 取得失敗, census still cited", () => {
    const { container } = render(
      <DemographicsChart
        data={DEMOGRAPHICS_FIXTURE.map((d) => ({ ...d, growthRate: null }))}
        allData={DEMOGRAPHICS_FIXTURE.map((d) => ({ ...d, growthRate: null }))}
        {...TREND}
        selectedWard={null}
        status="partial"
        unavailable={["growthRate"]}
      />
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain(SAMPLE);
    expect(text).toContain("最大成長");
    expect(text).toContain(FAILED_TEXT);
    expect(text).not.toContain(NO_DATA);
    expect(text).toContain(ESTAT_SOURCE);
    expect(text).not.toContain("2025年速報");
  });

  it("WardTable: partial (growth table down) → the 増減 column is 取得失敗 in every row", () => {
    const { container } = render(
      <WardTable
        demographics={DEMOGRAPHICS_FIXTURE.map((d) => ({ ...d, growthRate: null }))}
        landPrices={LAND_PRICES_FIXTURE}
        landUse="residential"
        landPriceStatus="ok"
        onSelectWard={vi.fn()}
        status="partial"
        unavailable={["growthRate"]}
      />
    );
    const growthCells = [...container.querySelectorAll("tbody tr")].map((tr) => tr.children[3].textContent);
    expect(growthCells).toEqual([FAILED_TEXT, FAILED_TEXT, FAILED_TEXT]);
    expect(container.textContent).not.toContain("2025年速報");
  });

  it("TransportPanel: unavailable → 取得失敗 naming 国土数値情報 as the source that failed, no citation, no sample (real-data plan PR 4b)", () => {
    const { container } = render(
      <TransportPanel
        stations={[]}
        trend={null}
        selectedWard={null}
        status="unavailable"
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain(FAILED_TEXT);
    expect(text).toContain(SOURCES.ksj.label);
    expect(text).not.toContain(KSJ_CITATION);
    expect(text).not.toContain(SAMPLE);
  });

  it("TransportPanel: ok → 国土数値情報 and the payload's year on the station section; without a trend in the payload 乗降客数推移 says データなし, never a sample (real-data plan PR 4b)", () => {
    const { container } = render(
      <TransportPanel
        stations={STATIONS_FIXTURE}
        trend={null}
        selectedWard={null}
        status="ok"
        sources={TRANSPORT_SOURCES}
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain(KSJ_CITATION);
    expect(text).toContain(`${RIDERSHIP_YEAR}年度`);
    expect(text).not.toContain(SAMPLE);
    expect(container.querySelector('[data-surface="ridership-trend"]')?.textContent).toContain("データなし");
    // Real-data plan PR 4: positions and lines come from S12 itself, so the
    // old "bundled, provenance unverified" note is gone.
    expect(text).not.toContain("同梱データ（出典未確認）");
    // A station the source counts on another row stays データなし.
    expect(text).toContain("東陽町駅");
    expect(text).toContain(NO_DATA);
  });

  it("WardTable: ok → e-Stat for the census columns, 地価 column still sample", () => {
    const { container } = render(
      <WardTable
        demographics={DEMOGRAPHICS_FIXTURE}
        landPrices={LAND_PRICES_FIXTURE}
        landUse="residential"
        landPriceStatus="ok"
        onSelectWard={vi.fn()}
        status="ok"
      />
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(container.textContent).toContain(SOURCES.estat.label);
    // Since real-data plan PR 5 the 地価 column is the 地価公示 snapshot: no sample label on the table.
    expect(container.textContent).not.toContain(SAMPLE);
  });

  it("WardTable: unavailable → 取得失敗 and no rows", () => {
    const { container } = render(
      <WardTable
        demographics={[]}
        landPrices={LAND_PRICES_FIXTURE}
        landUse="residential"
        landPriceStatus="ok"
        onSelectWard={vi.fn()}
        status="unavailable"
      />
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(container.textContent).toContain(FAILED_TEXT);
  });
});
