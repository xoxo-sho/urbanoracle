import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import LandPriceChart from "@/components/dashboard/LandPriceChart";
import { sampleLandPriceSummary } from "@/data/sample";
import { SOURCES } from "@/lib/sources";

/**
 * The 密度 vs 地価 scatter (L2) is a consumer of /demographics that PR 1 did
 * not list: its x and z come from the census. While the census is loading or
 * failed the page hands it no rows. It must render without crashing, draw no
 * point from invented values, and keep its own (PR 5) sample label — nothing
 * here may fall back to the deleted sample demographics.
 */
describe("LandPriceChart without census rows (demographics loading or failed)", () => {
  it("renders both sections, with no point data and no census number", () => {
    const { container } = render(
      <LandPriceChart
        prices={sampleLandPriceSummary}
        allPrices={sampleLandPriceSummary}
        demographics={[]}
        selectedWard={null}
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("区別平均地価");
    expect(text).toContain("密度 vs 地価");
    // The 16 sample price rows still label themselves; the scatter has nothing to plot.
    expect(container.querySelectorAll('[data-provenance="sample"]')).toHaveLength(2);
    expect(text).toContain(SOURCES.sample.label);
    // 世田谷区's deleted sample population, 939,099 → 「93.9万」, must not reappear anywhere.
    expect(text).not.toContain("93.9万");
  });
});
