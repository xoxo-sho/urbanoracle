import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, waitFor } from "@testing-library/react";
import { useGatedData } from "@/lib/use-gated-data";
import { SOURCES } from "@/lib/sources";
import { ESTAT_SOURCE } from "@/lib/credits";
import { FAILED_TEXT } from "@/components/dashboard/DataState";
import { NO_DATA } from "@/lib/format";
import {
  sampleLandPriceSummary,
  samplePopulationTrends,
  sampleTransportTrends,
} from "@/data/sample";
import { DEMOGRAPHICS_FIXTURE, STATIONS_FIXTURE } from "@/__tests__/fixtures/live-data";
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
 * the two live endpoints can be any more.
 */

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
  const ODPT_CITATION = `出典: ${SOURCES.odpt.label}`;

  it("DemographicsChart: unavailable → 取得失敗, no e-Stat citation, trend still sample", () => {
    const { container } = render(
      <DemographicsChart
        data={[]}
        allData={[]}
        populationTrends={samplePopulationTrends}
        selectedWard={null}
        status="unavailable"
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain(FAILED_TEXT);
    expect(text).not.toContain(ESTAT_SOURCE);
    expect(container.querySelector('[data-credit="estat"]')).toBeNull();
    // The population trend has no upstream at all — it is sample on every path.
    expect(text).toContain(SAMPLE);
  });

  it("DemographicsChart: ok → e-Stat on the census section, trend still sample", () => {
    const { container } = render(
      <DemographicsChart
        data={DEMOGRAPHICS_FIXTURE}
        allData={DEMOGRAPHICS_FIXTURE}
        populationTrends={samplePopulationTrends}
        selectedWard={null}
        status="ok"
      />
    );
    const text = container.textContent ?? "";
    // e-Stat's own 出典 wording (e-Stat 利用規約 1)ア) heads the census note.
    expect(text).toContain(ESTAT_SOURCE);
    expect(container.querySelector('[data-credit="estat"]')).not.toBeNull();
    expect(text).toContain(SAMPLE);
    expect(text).not.toContain(FAILED_TEXT);
  });

  it("TransportPanel: unavailable → 取得失敗, no ODPT citation, no 国土数値情報, trends still sample", () => {
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
    expect(text).not.toContain(ODPT_CITATION);
    expect(text).not.toContain("国土数値情報");
    expect(text).toContain(SAMPLE);
  });

  it("TransportPanel: ok → ODPT on the station section, trends still sample", () => {
    const { container } = render(
      <TransportPanel
        stations={STATIONS_FIXTURE}
        trends={sampleTransportTrends}
        selectedWard={null}
        status="ok"
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain(ODPT_CITATION);
    expect(text).toContain(SAMPLE);
    // Ruling 2: the station GeoJSON's provenance is unknown, so the live
    // path may not claim 国土数値情報 for positions/lines either.
    expect(text).not.toContain("国土数値情報");
    expect(text).toContain("同梱データ（出典未確認）");
    // A station ODPT genuinely has no figure for stays データなし.
    expect(text).toContain("東陽町駅");
    expect(text).toContain(NO_DATA);
  });

  it("TransportPanel: partial (ODPT down) → stations named, every ridership 取得失敗, no ODPT citation", () => {
    const { container } = render(
      <TransportPanel
        stations={STATIONS_FIXTURE.map((s) => ({ ...s, dailyPassengers: null }))}
        trends={sampleTransportTrends}
        selectedWard={null}
        status="partial"
        unavailable={["dailyPassengers"]}
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("豊洲駅");
    expect(text).toContain("東陽町駅");
    expect(text).toContain(FAILED_TEXT);
    expect(text).not.toContain(NO_DATA);
    expect(text).not.toContain(ODPT_CITATION);
    expect(text).toContain(SAMPLE);
  });

  it("WardTable: ok → e-Stat for the census columns, 地価 column still sample", () => {
    const { container } = render(
      <WardTable
        demographics={DEMOGRAPHICS_FIXTURE}
        landPrices={sampleLandPriceSummary}
        onSelectWard={vi.fn()}
        status="ok"
      />
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(container.textContent).toContain(SOURCES.estat.label);
    expect(container.textContent).toContain(SAMPLE);
  });

  it("WardTable: unavailable → 取得失敗 and no rows", () => {
    const { container } = render(
      <WardTable
        demographics={[]}
        landPrices={sampleLandPriceSummary}
        onSelectWard={vi.fn()}
        status="unavailable"
      />
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(container.textContent).toContain(FAILED_TEXT);
  });
});
