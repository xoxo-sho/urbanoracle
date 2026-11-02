import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SOURCES } from "@/lib/sources";
import { ESTAT_SOURCE } from "@/lib/credits";
import { FAILED_TEXT, LOADING_TEXT } from "@/components/dashboard/DataState";
import {
  dataLayers,
  sampleDisasterRisks,
  sampleLandPriceSummary,
  sampleTransportTrends,
  sampleWardProfiles,
  sampleZoning,
} from "@/data/sample";
import {
  DEMOGRAPHICS_FIXTURE,
  POPULATION_TRENDS_FIXTURE,
  POPULATION_TRENDS_SOURCES,
  RIDERSHIP_YEAR,
  TRANSPORT_SOURCES,
} from "@/__tests__/fixtures/live-data";
import HeroSpread from "@/components/landing/HeroSpread";
import LandPriceChart from "@/components/dashboard/LandPriceChart";
import WardTable from "@/components/dashboard/WardTable";
import DemographicsChart from "@/components/dashboard/DemographicsChart";
import DisasterRiskPanel from "@/components/dashboard/DisasterRiskPanel";
import TransportPanel from "@/components/dashboard/TransportPanel";
import WardRadar from "@/components/dashboard/WardRadar";
import MapLegend from "@/components/map/MapLegend";

/**
 * Copy guard — sample surfaces must say so (truth fix, Stage 1a).
 *
 * Every surface fed from src/data/sample.ts has to carry SOURCES.sample.label
 * on the surface itself, and must not carry an attribution to an upstream it
 * never touched. One real-source string on a sample panel is a false
 * citation, not a footnote.
 *
 * The count per component is the number of distinct sample surfaces inside
 * it (each chart section is its own surface and gets its own label, in the
 * position the SourceNote used to occupy).
 *
 * Since real-data plan PR 1 the census and ridership surfaces have no sample
 * path, and since PR 3 neither has the 人口推移 chart (its own route, the
 * committed census snapshot): while their endpoint is loading or failed they say 読み込み中 or
 * 取得失敗 and name the source that did not answer, which is a statement about
 * the request, not a citation for figures. Those cases are checked here next
 * to the sample ones, so the two kinds of copy never blur.
 */

const SAMPLE_LABEL = SOURCES.sample.label;

// Any of these on a sample surface is a false attribution.
const REAL_SOURCE_STRINGS = [
  "不動産情報ライブラリ",
  "e-Stat",
  "国勢調査",
  "国土数値情報",
  "ハザードマップポータル",
];

// The choropleth (WARD_META in ward-boundaries.ts) is neither live nor the
// sample set — it is a hardcoded table, and its legend says so in these words.
const CHOROPLETH_NOTE = "固定の参考値 — 実データではありません";

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function expectSampleLabelled(root: HTMLElement, surfaces: number) {
  const text = root.textContent ?? "";
  expect(
    occurrences(text, SAMPLE_LABEL),
    `expected ≥${surfaces} × "${SAMPLE_LABEL}" on this surface`
  ).toBeGreaterThanOrEqual(surfaces);
  for (const real of REAL_SOURCE_STRINGS) {
    expect(text, `sample surface must not cite "${real}"`).not.toContain(real);
  }
}

describe("sample surfaces carry the sample label and no real-source attribution", () => {
  it("HeroSpread (LP hero) — label plus a SAMPLE tag inside the spread", () => {
    const { container } = render(<HeroSpread />);
    expectSampleLabelled(container, 1);
    expect(container.textContent).toContain("SAMPLE");
  });

  it("LandPriceChart — bar + scatter sections; no note about a point display that does not exist", () => {
    const { container } = render(
      <LandPriceChart
        prices={sampleLandPriceSummary}
        allPrices={sampleLandPriceSummary}
        demographics={DEMOGRAPHICS_FIXTURE}
        selectedWard={null}
      />
    );
    expectSampleLabelled(container, 2);
    // Ruling 1: the map draws no REINFOLIB points, so a note about their
    // approximate position describes a display that does not exist.
    expect(container.textContent).not.toContain("概算中心");
    expect(container.textContent).not.toMatch(/対象\s*8\s*区/);
  });

  it("WardTable — the 地価 column is sample and says so; the census columns cite e-Stat", () => {
    const { container } = render(
      <WardTable
        demographics={DEMOGRAPHICS_FIXTURE}
        landPrices={sampleLandPriceSummary}
        onSelectWard={vi.fn()}
        status="ok"
      />
    );
    const text = container.textContent ?? "";
    expect(occurrences(text, SAMPLE_LABEL)).toBeGreaterThanOrEqual(1);
    expect(text).toContain("地価列");
    expect(text).toContain(SOURCES.estat.label);
  });

  it("DisasterRiskPanel — pie + zoning bar + risk list", () => {
    const { container } = render(
      <DisasterRiskPanel risks={sampleDisasterRisks} zoning={sampleZoning} selectedWard={null} />
    );
    expectSampleLabelled(container, 3);
  });

  it("WardRadar — profiles are sample", () => {
    const { container } = render(<WardRadar profiles={sampleWardProfiles} selectedWard={null} />);
    expectSampleLabelled(container, 1);
  });

  describe("MapLegend — the choropleth is a hardcoded table (WARD_META)", () => {
    const withOnly = (id: string) => dataLayers.map((l) => ({ ...l, enabled: l.id === id }));

    for (const id of ["land-price", "demographics", "disaster-risk"] as const) {
      it(`${id} layer legend says 固定の参考値`, () => {
        const { container } = render(<MapLegend layers={withOnly(id)} transportStatus="ok" />);
        const text = container.textContent ?? "";
        expect(text).toContain(CHOROPLETH_NOTE);
        for (const real of REAL_SOURCE_STRINGS) expect(text).not.toContain(real);
      });
    }

    it("disaster-risk legend keeps ハザードマップ（実データ） for the GSI tiles", () => {
      const { container } = render(<MapLegend layers={withOnly("disaster-risk")} transportStatus="ok" />);
      expect(container.textContent).toContain("ハザードマップ（実データ）");
    });

    it("land-price legend no longer describes undrawn points (ruling 1)", () => {
      const { container } = render(<MapLegend layers={withOnly("land-price")} transportStatus="ok" />);
      expect(container.textContent).not.toContain("概算中心");
    });
  });
});

describe("census and ridership surfaces have no sample path (real-data plan PR 1)", () => {
  it("DemographicsChart (all-area, census unavailable, trend ok) — no sample label anywhere; the trend cites its tables, the census blocks say 取得失敗 and cite nothing", () => {
    const { container } = render(
      <DemographicsChart
        data={[]}
        allData={[]}
        trends={POPULATION_TRENDS_FIXTURE}
        trendStatus="ok"
        trendSources={POPULATION_TRENDS_SOURCES}
        selectedWard={null}
        status="unavailable"
      />
    );
    const text = container.textContent ?? "";
    expect(occurrences(text, SAMPLE_LABEL)).toBe(0);
    expect(container.querySelector('[data-provenance="sample"]')).toBeNull();
    expect(text).toContain(FAILED_TEXT);
    // The trend's own line cites e-Stat and its tables; the census blocks cite nothing.
    const trend = container.querySelector('[data-surface="population-trend"]');
    expect(trend?.textContent).toContain(ESTAT_SOURCE);
    for (const s of Object.values(POPULATION_TRENDS_SOURCES)) expect(trend?.textContent).toContain(s.table);
    expect(container.querySelector('[data-credit="estat"]')).toBeNull();
  });

  it("DemographicsChart (all-area, both pending) — 読み込み中 twice, no sample label, no figure", () => {
    const { container } = render(
      <DemographicsChart
        data={[]}
        allData={[]}
        trends={null}
        trendStatus="loading"
        selectedWard={null}
        status="loading"
      />
    );
    const text = container.textContent ?? "";
    expect(occurrences(text, SAMPLE_LABEL)).toBe(0);
    expect(container.querySelectorAll('[data-state="loading"]')).toHaveLength(2);
    expect(text).not.toContain("万人");
  });

  it("DemographicsChart (ward view, loading) — no sample label at all, 読み込み中", () => {
    const { container } = render(
      <DemographicsChart
        data={[]}
        allData={[]}
        trends={null}
        trendStatus="loading"
        selectedWard="千代田区"
        status="loading"
      />
    );
    const text = container.textContent ?? "";
    expect(occurrences(text, SAMPLE_LABEL)).toBe(0);
    expect(text).toContain(LOADING_TEXT);
    expect(text).not.toContain(FAILED_TEXT);
  });

  it("TransportPanel (unavailable) — 乗降客数推移 keeps its label; stations and 事業者別 say 取得失敗, name the source that failed and cite nothing", () => {
    const { container } = render(
      <TransportPanel
        stations={[]}
        trends={sampleTransportTrends}
        selectedWard={null}
        status="unavailable"
      />
    );
    const text = container.textContent ?? "";
    expect(occurrences(text, SAMPLE_LABEL)).toBe(1);
    expect(text).toContain(FAILED_TEXT);
    // The failed request names 国土数値情報 (a statement about the request); no 出典 citation.
    expect(text).toContain(SOURCES.ksj.label);
    expect(text).not.toContain("出典:");
    expect(text).not.toContain("出典：");
    for (const real of REAL_SOURCE_STRINGS.filter((r) => r !== "国土数値情報")) expect(text).not.toContain(real);
  });

  describe("MapLegend — station bubbles consume transport status (ruling 4)", () => {
    const transport = dataLayers.map((l) => ({ ...l, enabled: l.id === "transportation" }));

    it("loading → 乗降客数: 読み込み中, no sample label", () => {
      const { container } = render(<MapLegend layers={transport} transportStatus="loading" />);
      expect(container.textContent).toContain(LOADING_TEXT);
      expect(container.textContent).not.toContain(SAMPLE_LABEL);
    });

    it("unavailable → 乗降客数: 取得失敗, no sample label", () => {
      const { container } = render(<MapLegend layers={transport} transportStatus="unavailable" />);
      expect(container.textContent).toContain(FAILED_TEXT);
      expect(container.textContent).not.toContain(SAMPLE_LABEL);
    });

    it("ok → cites 国土数値情報 with the payload's year, no sample label", () => {
      const { container } = render(<MapLegend layers={transport} transportStatus="ok" transportSources={TRANSPORT_SOURCES} />);
      expect(container.textContent).toContain(SOURCES.ksj.label);
      expect(container.textContent).toContain(`${RIDERSHIP_YEAR}年度`);
      expect(container.textContent).not.toContain(SAMPLE_LABEL);
      expect(container.textContent).not.toContain(FAILED_TEXT);
    });
  });
});
