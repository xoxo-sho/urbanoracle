import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SOURCES } from "@/lib/sources";
import { ESTAT_SOURCE } from "@/lib/credits";
import { FAILED_TEXT, LOADING_TEXT } from "@/components/dashboard/DataState";
import {
  dataLayers,
  sampleTransportTrends,
} from "@/data/sample";
import {
  DEMOGRAPHICS_FIXTURE,
  DEMOGRAPHICS_SOURCES,
  LAND_PRICES_FIXTURE,
  LAND_PRICES_SOURCES,
  LAND_PRICE_YEAR,
  POPULATION_TRENDS_FIXTURE,
  POPULATION_TRENDS_SOURCES,
  RIDERSHIP_YEAR,
  TRANSPORT_SOURCES,
  ZONING_FIXTURE,
  ZONING_SOURCES,
  disasterSnapshotRows,
  loadDisasterSnapshot,
} from "@/__tests__/fixtures/live-data";
import HeroSpread from "@/components/landing/HeroSpread";
import LandPriceChart from "@/components/dashboard/LandPriceChart";
import WardTable from "@/components/dashboard/WardTable";
import DemographicsChart from "@/components/dashboard/DemographicsChart";
import DisasterRiskPanel from "@/components/dashboard/DisasterRiskPanel";
import TransportPanel from "@/components/dashboard/TransportPanel";
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

// The words the hardcoded-table choropleths (WARD_META) used to carry. The 地価
// fill left WARD_META in real-data plan PR 5, 災害 in PR 7 and 人口 in PR 8 (it
// reads the 2025 census payload), so no legend may say them any more.
const CHOROPLETH_NOTE = "固定の参考値 — 実データではありません";

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("sample surfaces carry the sample label and no real-source attribution", () => {


  describe("MapLegend — no choropleth is a hardcoded table any more (人口 left WARD_META in real-data plan PR 8)", () => {
    const withOnly = (id: string) => dataLayers.map((l) => ({ ...l, enabled: l.id === id }));

    it("demographics layer legend: no 固定の参考値, no sample label; it cites the 2025 census", () => {
      const { container } = render(
        <MapLegend layers={withOnly("demographics")} transportStatus="ok" landPriceStatus="ok" disasterStatus="ok" censusStatus="ok" censusSources={DEMOGRAPHICS_SOURCES} densityStops={[1, 2, 3]} />
      );
      const text = container.textContent ?? "";
      expect(text).not.toContain(CHOROPLETH_NOTE);
      expect(text).not.toContain(SAMPLE_LABEL);
      expect(text).toContain("2025年国勢調査");
    });

    it("disaster-risk legend: no 固定の参考値 and no 「ハザードマップ（実データ）」; the tiles' 出典 is named", () => {
      const { container } = render(<MapLegend layers={withOnly("disaster-risk")} transportStatus="ok" landPriceStatus="ok" disasterStatus="ok" />);
      expect(container.textContent).not.toContain(CHOROPLETH_NOTE);
      expect(container.textContent).not.toContain("ハザードマップ（実データ）");
      expect(container.textContent).toContain("出典：ハザードマップポータルサイト");
    });

    it("land-price legend no longer describes undrawn points (ruling 1)", () => {
      const { container } = render(<MapLegend layers={withOnly("land-price")} transportStatus="ok" landPriceStatus="ok" disasterStatus="ok" />);
      expect(container.textContent).not.toContain("概算中心");
    });
  });
});

describe("the 地価 surfaces have no sample path (real-data plan PR 5)", () => {
  it("LandPriceChart (ok) — no sample label; cites 国土数値情報 with the year; no note about a point display that does not exist", () => {
    const { container } = render(
      <LandPriceChart
        wards={LAND_PRICES_FIXTURE}
        status="ok"
        sources={LAND_PRICES_SOURCES}
        landUse="residential"
        demographics={DEMOGRAPHICS_FIXTURE}
        demographicsStatus="ok"
        demographicsSources={DEMOGRAPHICS_SOURCES}
        selectedWard={null}
      />
    );
    const text = container.textContent ?? "";
    expect(occurrences(text, SAMPLE_LABEL)).toBe(0);
    expect(container.querySelector('[data-provenance="sample"]')).toBeNull();
    expect(text).toContain(SOURCES.ksj.label);
    expect(text).toContain(`${LAND_PRICE_YEAR}年地価公示`);
    // Ruling 1: the map draws no REINFOLIB points, so a note about their
    // approximate position describes a display that does not exist.
    expect(text).not.toContain("概算中心");
    expect(text).not.toMatch(/対象\s*8\s*区/);
  });

  it("LandPriceChart (unavailable) — 取得失敗 naming 国土数値情報, no citation, no sample label", () => {
    const { container } = render(
      <LandPriceChart
        wards={[]}
        status="unavailable"
        landUse="residential"
        demographics={DEMOGRAPHICS_FIXTURE}
        demographicsStatus="ok"
        selectedWard={null}
      />
    );
    const text = container.textContent ?? "";
    expect(occurrences(text, SAMPLE_LABEL)).toBe(0);
    expect(text).toContain(FAILED_TEXT);
    expect(text).toContain(SOURCES.ksj.label);
    expect(text).not.toContain("出典:");
    expect(text).not.toContain("出典：");
  });

  it("WardTable — the 地価 column cites 国土数値情報 and the census columns cite e-Stat; no sample label", () => {
    const { container } = render(
      <WardTable
        demographics={DEMOGRAPHICS_FIXTURE}
        landPrices={LAND_PRICES_FIXTURE}
        landUse="residential"
        landPriceStatus="ok"
        landPriceSources={LAND_PRICES_SOURCES}
        onSelectWard={vi.fn()}
        status="ok"
      />
    );
    const text = container.textContent ?? "";
    expect(occurrences(text, SAMPLE_LABEL)).toBe(0);
    expect(container.querySelector('[data-provenance="sample"]')).toBeNull();
    expect(text).toContain("平均価格（住宅地）");
    expect(text).toContain(SOURCES.ksj.label);
    expect(text).toContain(SOURCES.estat.label);
  });

  describe("MapLegend — the 地価 choropleth consumes the land-prices status", () => {
    const land = dataLayers.map((l) => ({ ...l, enabled: l.id === "land-price" }));

    it("loading → 読み込み中, no sample label, no 固定の参考値", () => {
      const { container } = render(<MapLegend disasterStatus="ok" layers={land} transportStatus="ok" landPriceStatus="loading" />);
      expect(container.textContent).toContain(LOADING_TEXT);
      expect(container.textContent).not.toContain(SAMPLE_LABEL);
      expect(container.textContent).not.toContain(CHOROPLETH_NOTE);
    });

    it("unavailable → 取得失敗, no sample label", () => {
      const { container } = render(<MapLegend disasterStatus="ok" layers={land} transportStatus="ok" landPriceStatus="unavailable" />);
      expect(container.textContent).toContain(FAILED_TEXT);
      expect(container.textContent).not.toContain(SAMPLE_LABEL);
    });

    it("ok → cites 国土数値情報 with the payload's year and prints the stops it is handed", () => {
      const { container } = render(
        <MapLegend disasterStatus="ok" layers={land} transportStatus="ok" landPriceStatus="ok" landPriceSources={LAND_PRICES_SOURCES} landUse="commercial" landPriceStops={[300_000, 900_000, 5_000_000]} />
      );
      const text = container.textContent ?? "";
      expect(text).toContain(SOURCES.ksj.label);
      expect(text).toContain(`${LAND_PRICE_YEAR}年`);
      expect(text).toContain("商業地");
      expect([...container.querySelectorAll("[data-stop]")].map((s) => s.textContent)).toEqual(["30万", "90万", "500万"]);
      expect(text).not.toContain(SAMPLE_LABEL);
      expect(text).not.toContain(CHOROPLETH_NOTE);
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
      const { container } = render(<MapLegend disasterStatus="ok" layers={transport} transportStatus="loading" landPriceStatus="ok" />);
      expect(container.textContent).toContain(LOADING_TEXT);
      expect(container.textContent).not.toContain(SAMPLE_LABEL);
    });

    it("unavailable → 乗降客数: 取得失敗, no sample label", () => {
      const { container } = render(<MapLegend disasterStatus="ok" layers={transport} transportStatus="unavailable" landPriceStatus="ok" />);
      expect(container.textContent).toContain(FAILED_TEXT);
      expect(container.textContent).not.toContain(SAMPLE_LABEL);
    });

    it("ok → cites 国土数値情報 with the payload's year, no sample label", () => {
      const { container } = render(<MapLegend disasterStatus="ok" layers={transport} transportStatus="ok" transportSources={TRANSPORT_SOURCES} landPriceStatus="ok" />);
      expect(container.textContent).toContain(SOURCES.ksj.label);
      expect(container.textContent).toContain(`${RIDERSHIP_YEAR}年度`);
      expect(container.textContent).not.toContain(SAMPLE_LABEL);
      expect(container.textContent).not.toContain(FAILED_TEXT);
    });
  });
});

describe("the 災害 surfaces and the LP hero have no sample path (real-data plan PR 7)", () => {
  const ROWS = disasterSnapshotRows(loadDisasterSnapshot());
  const SNAP_SOURCES = loadDisasterSnapshot().sources;

  it("HeroSpread (LP hero) — no sample label and no SAMPLE tag; it cites what it shows", () => {
    const { container } = render(<HeroSpread />);
    const text = container.textContent ?? "";
    expect(occurrences(text, SAMPLE_LABEL)).toBe(0);
    expect(text).not.toContain("SAMPLE");
    expect(text).toContain("地域危険度 第9回");
    expect(text).toContain("A31a-25");
  });

  it("DisasterRiskPanel (unavailable) — 取得失敗 on every hazard and on D2, naming the sources; no sample label", () => {
    const { container } = render(
      <DisasterRiskPanel disaster={null} disasterStatus="unavailable" zoning={null} zoningStatus="unavailable" selectedWard={null} />
    );
    const text = container.textContent ?? "";
    expect(occurrences(text, SAMPLE_LABEL)).toBe(0);
    expect(container.querySelector('[data-provenance="sample"]')).toBeNull();
    expect(text).toContain(FAILED_TEXT);
    expect(text).not.toContain("Lv.");
  });

  it("DisasterRiskPanel (ok) — every hazard cites its source; no sample label", () => {
    const { container } = render(
      <DisasterRiskPanel
        disaster={ROWS.find((r) => r.region === "江東区")!}
        disasterStatus="ok"
        disasterSources={SNAP_SOURCES}
        zoning={ZONING_FIXTURE[0]}
        zoningStatus="ok"
        zoningSources={ZONING_SOURCES}
        selectedWard="江東区"
      />
    );
    const text = container.textContent ?? "";
    expect(occurrences(text, SAMPLE_LABEL)).toBe(0);
    for (const key of ["earthquake", "flood", "landslide", "tsunami", "hightide"]) expect(text).toContain(SNAP_SOURCES[key].label);
  });
});
