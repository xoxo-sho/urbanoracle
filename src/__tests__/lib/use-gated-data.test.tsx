import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, waitFor } from "@testing-library/react";
import { useGatedData } from "@/lib/use-gated-data";
import { SOURCES } from "@/lib/sources";
import { ESTAT_SOURCE } from "@/lib/credits";
import { FAILED_TEXT } from "@/components/dashboard/DataState";
import { NO_DATA } from "@/lib/format";
import { sampleTransportTrends } from "@/data/sample";
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
 * isLive is a promise about provenance (truth fix, Stage 1b), carried beside
 * `status` since real-data plan PR 1 (use-gated-data-states.test.tsx pins the
 * states themselves). Two halves of the contract:
 *
 *   1. the hook reports isLive only when the envelope says so — the
 *      /disaster-risks sample set arrives as a 200 with isLive:false;
 *   2. a consumer handed status "unavailable" renders 取得失敗 and cites no
 *      source for figures it does not have; handed "ok" it renders the real
 *      attribution; handed "partial" it renders 取得失敗 for the field the
 *      server could not fill and cites nothing it did not get.
 *
 * Flipped in PR 1: the five "every fallback path reports isLive=false" cases
 * described the client-side sample fallback, which no longer exists, and the
 * consumer cases passed isLive=false to mean "sample", which no consumer of
 * the two live endpoints can be any more. Flipped again in PR 3: the
 * DemographicsChart cases said "trend still sample"; the 人口推移 chart now
 * draws the committed census snapshot from its own route, so no state of the
 * census answer puts a sample label on the chart.
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

describe("useGatedData — isLive follows the envelope", () => {
  const settled = async () => {
    const { result } = renderHook(() => useGatedData<{ region: string }[]>("/api/v1/x"));
    await waitFor(() => expect(result.current.status).not.toBe("loading"));
    return result;
  };

  it("200 with isLive:false (the /disaster-risks sample set) is data, not live", async () => {
    const served = [{ region: "server-sample" }];
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { status: "ok", data: served, isLive: false })));
    const result = await settled();
    expect(result.current.status).toBe("ok");
    expect(result.current.data).toEqual(served);
    expect(result.current.isLive).toBe(false);
  });

  it("200 without an isLive field is not live", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { data: [{ region: "x" }] })));
    const result = await settled();
    expect(result.current.isLive).toBe(false);
  });

  it("200 with isLive:true is live", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { data: [{ region: "x" }], isLive: true })));
    const result = await settled();
    expect(result.current.isLive).toBe(true);
  });
});

describe("consumers render by status", () => {
  const SAMPLE = SOURCES.sample.label;
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

  it("TransportPanel: unavailable → 取得失敗 naming 国土数値情報 as the source that failed, no citation, trends still sample", () => {
    const { container } = render(
      <TransportPanel
        stations={[]}
        trends={sampleTransportTrends}
        selectedWard={null}
        status="unavailable"
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain(FAILED_TEXT);
    expect(text).toContain(SOURCES.ksj.label);
    expect(text).not.toContain(KSJ_CITATION);
    expect(text).toContain(SAMPLE);
  });

  it("TransportPanel: ok → 国土数値情報 and the payload's year on the station section, trends still sample", () => {
    const { container } = render(
      <TransportPanel
        stations={STATIONS_FIXTURE}
        trends={sampleTransportTrends}
        selectedWard={null}
        status="ok"
        sources={TRANSPORT_SOURCES}
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain(KSJ_CITATION);
    expect(text).toContain(`${RIDERSHIP_YEAR}年度`);
    expect(text).toContain(SAMPLE);
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
