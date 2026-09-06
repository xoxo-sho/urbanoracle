import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SOURCES } from "@/lib/sources";
import {
  dataLayers,
  sampleDemographics,
  sampleDisasterRisks,
  sampleLandPriceSummary,
  samplePopulationTrends,
  sampleTransportStations,
  sampleTransportTrends,
  sampleWardProfiles,
  sampleZoning,
} from "@/data/sample";
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
 * Every surface fed from src/data/sample.ts (or from the hook's fallback to
 * it) has to carry SOURCES.sample.label on the surface itself, and must not
 * carry an attribution to an upstream it never touched. One real-source
 * string on a sample panel is a false citation, not a footnote.
 *
 * The count per component is the number of distinct sample surfaces inside
 * it (each chart section is its own surface and gets its own label, in the
 * position the SourceNote used to occupy).
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
        demographics={sampleDemographics}
        selectedWard={null}
      />
    );
    expectSampleLabelled(container, 2);
    // Ruling 1: the map draws no REINFOLIB points, so a note about their
    // approximate position describes a display that does not exist.
    expect(container.textContent).not.toContain("概算中心");
    expect(container.textContent).not.toMatch(/対象\s*8\s*区/);
  });

  it("WardTable — the 地価 column is sample", () => {
    const { container } = render(
      <WardTable
        demographics={sampleDemographics}
        landPrices={sampleLandPriceSummary}
        onSelectWard={vi.fn()}
      />
    );
    expectSampleLabelled(container, 1);
  });

  it("DemographicsChart (all-area, fallback) — population trend + age composition", () => {
    const { container } = render(
      <DemographicsChart
        data={sampleDemographics}
        allData={sampleDemographics}
        populationTrends={samplePopulationTrends}
        selectedWard={null}
        isLive={false}
      />
    );
    expectSampleLabelled(container, 2);
  });

  it("DemographicsChart (ward view, fallback) — age breakdown", () => {
    const ward = sampleDemographics.filter((d) => d.region === "千代田区");
    const { container } = render(
      <DemographicsChart
        data={ward}
        allData={sampleDemographics}
        populationTrends={samplePopulationTrends}
        selectedWard="千代田区"
        isLive={false}
      />
    );
    expectSampleLabelled(container, 1);
  });

  it("DisasterRiskPanel — pie + zoning bar + risk list", () => {
    const { container } = render(
      <DisasterRiskPanel risks={sampleDisasterRisks} zoning={sampleZoning} selectedWard={null} />
    );
    expectSampleLabelled(container, 3);
  });

  it("TransportPanel (fallback) — station ranking/treemap + ridership trends", () => {
    const { container } = render(
      <TransportPanel
        stations={sampleTransportStations}
        trends={sampleTransportTrends}
        selectedWard={null}
        isLive={false}
      />
    );
    expectSampleLabelled(container, 2);
  });

  it("WardRadar — profiles are sample", () => {
    const { container } = render(<WardRadar profiles={sampleWardProfiles} selectedWard={null} />);
    expectSampleLabelled(container, 1);
  });

  describe("MapLegend — the choropleth is a hardcoded table (WARD_META)", () => {
    const withOnly = (id: string) => dataLayers.map((l) => ({ ...l, enabled: l.id === id }));

    for (const id of ["land-price", "demographics", "disaster-risk"] as const) {
      it(`${id} layer legend says 固定の参考値`, () => {
        const { container } = render(<MapLegend layers={withOnly(id)} />);
        const text = container.textContent ?? "";
        expect(text).toContain(CHOROPLETH_NOTE);
        for (const real of REAL_SOURCE_STRINGS) expect(text).not.toContain(real);
      });
    }

    it("disaster-risk legend keeps ハザードマップ（実データ） for the GSI tiles", () => {
      const { container } = render(<MapLegend layers={withOnly("disaster-risk")} />);
      expect(container.textContent).toContain("ハザードマップ（実データ）");
    });

    it("land-price legend no longer describes undrawn points (ruling 1)", () => {
      const { container } = render(<MapLegend layers={withOnly("land-price")} />);
      expect(container.textContent).not.toContain("概算中心");
    });
  });

  describe("MapLegend — station bubbles consume isLive (ruling 4)", () => {
    const transport = dataLayers.map((l) => ({ ...l, enabled: l.id === "transportation" }));

    it("transport not live → sample label on the 乗降客数 legend", () => {
      const { container } = render(<MapLegend layers={transport} transportIsLive={false} />);
      expect(container.textContent).toContain(SAMPLE_LABEL);
    });

    it("prop omitted → fails closed to the sample label", () => {
      const { container } = render(<MapLegend layers={transport} />);
      expect(container.textContent).toContain(SAMPLE_LABEL);
    });

    it("transport live → no sample label", () => {
      const { container } = render(<MapLegend layers={transport} transportIsLive={true} />);
      expect(container.textContent).not.toContain(SAMPLE_LABEL);
    });
  });
});
