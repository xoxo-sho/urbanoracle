import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, waitFor } from "@testing-library/react";
import { useGatedData } from "@/lib/use-gated-data";
import { SOURCES } from "@/lib/sources";
import {
  sampleDemographics,
  sampleLandPriceSummary,
  samplePopulationTrends,
  sampleTransportStations,
  sampleTransportTrends,
} from "@/data/sample";
import DemographicsChart from "@/components/dashboard/DemographicsChart";
import TransportPanel from "@/components/dashboard/TransportPanel";
import WardTable from "@/components/dashboard/WardTable";

/**
 * isLive is a promise about provenance (truth fix, Stage 1b).
 *
 * The hook already exposes it; nothing consumed it. These prove the two
 * halves of the contract:
 *
 *   1. every path that ends on fallback data — transport failure, non-2xx,
 *      or a 200 whose envelope says isLive:false — reports isLive=false;
 *   2. a surface handed isLive=false renders the sample label and no real
 *      attribution, and the same surface handed isLive=true renders the
 *      real attribution (so the flag is consumed, not the label hardcoded).
 */

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    getToken: async () => "id-token",
    refresh: async () => null,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const FALLBACK = [{ region: "fallback" }];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useGatedData — every fallback path reports isLive=false", () => {
  it("transport failure keeps the client fallback and isLive=false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    const { result } = renderHook(() => useGatedData("/api/v1/x", FALLBACK));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBe(FALLBACK);
    expect(result.current.isLive).toBe(false);
  });

  it("non-2xx keeps the client fallback and isLive=false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(500, { detail: "boom" })));
    const { result } = renderHook(() => useGatedData("/api/v1/x", FALLBACK));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBe(FALLBACK);
    expect(result.current.isLive).toBe(false);
  });

  it("200 with isLive:false (server-side fallback) is not live", async () => {
    const served = [{ region: "server-fallback" }];
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { data: served, isLive: false })));
    const { result } = renderHook(() => useGatedData("/api/v1/x", FALLBACK));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(served);
    expect(result.current.isLive).toBe(false);
  });

  it("200 without an isLive field is not live", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { data: [{ region: "x" }] })));
    const { result } = renderHook(() => useGatedData("/api/v1/x", FALLBACK));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isLive).toBe(false);
  });

  it("200 with isLive:true is live", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { data: [{ region: "x" }], isLive: true })));
    const { result } = renderHook(() => useGatedData("/api/v1/x", FALLBACK));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isLive).toBe(true);
  });
});

describe("consumers render the sample label when isLive is false", () => {
  const SAMPLE = SOURCES.sample.label;

  it("DemographicsChart: isLive=false → sample label, no e-Stat", () => {
    const { container } = render(
      <DemographicsChart
        data={sampleDemographics}
        allData={sampleDemographics}
        populationTrends={samplePopulationTrends}
        selectedWard={null}
        isLive={false}
      />
    );
    expect(container.textContent).toContain(SAMPLE);
    expect(container.textContent).not.toContain("e-Stat");
  });

  it("DemographicsChart: isLive=true → e-Stat on the census section, trend still sample", () => {
    const { container } = render(
      <DemographicsChart
        data={sampleDemographics}
        allData={sampleDemographics}
        populationTrends={samplePopulationTrends}
        selectedWard={null}
        isLive={true}
      />
    );
    expect(container.textContent).toContain(SOURCES.estat.label);
    // The population trend has no upstream at all — it is sample on every path.
    expect(container.textContent).toContain(SAMPLE);
  });

  it("TransportPanel: isLive=false → sample label, no ODPT / 国土数値情報", () => {
    const { container } = render(
      <TransportPanel
        stations={sampleTransportStations}
        trends={sampleTransportTrends}
        selectedWard={null}
        isLive={false}
      />
    );
    expect(container.textContent).toContain(SAMPLE);
    expect(container.textContent).not.toContain(SOURCES.odpt.label);
    expect(container.textContent).not.toContain("国土数値情報");
  });

  it("TransportPanel: isLive=true → ODPT on the station section, trends still sample", () => {
    const { container } = render(
      <TransportPanel
        stations={sampleTransportStations}
        trends={sampleTransportTrends}
        selectedWard={null}
        isLive={true}
      />
    );
    expect(container.textContent).toContain(SOURCES.odpt.label);
    expect(container.textContent).toContain(SAMPLE);
    // Ruling 2: the station GeoJSON's provenance is unknown, so the live
    // path may not claim 国土数値情報 for positions/lines either.
    expect(container.textContent).not.toContain("国土数値情報");
    expect(container.textContent).toContain("同梱データ（出典未確認）");
  });

  it("WardTable: isLive=true → e-Stat for the census columns, 地価 column still sample", () => {
    const { container } = render(
      <WardTable
        demographics={sampleDemographics}
        landPrices={sampleLandPriceSummary}
        onSelectWard={vi.fn()}
        isLive={true}
      />
    );
    expect(container.textContent).toContain(SOURCES.estat.label);
    expect(container.textContent).toContain(SAMPLE);
  });
});
