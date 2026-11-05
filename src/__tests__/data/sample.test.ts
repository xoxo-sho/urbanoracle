import { describe, it, expect } from "vitest";
import { sampleWardProfiles } from "@/data/sample";

/**
 * The sets that remain are checked here. sampleDemographics and
 * sampleTransportStations, and their three integrity tests, left with
 * real-data plan PR 1: the two live endpoints no longer fall back to them,
 * so there is no bundled copy to keep complete. sampleLandPrices left with
 * PR 5 (the 地価 surfaces read the 地価公示 snapshot); sampleZoning with PR 6
 * (the 用途地域 surfaces read the A55-24 snapshot), and its sum-to-100 check
 * with it. sampleDisasterRisks and sampleLandPriceSummary left with PR 7 (the
 * 災害 surfaces and the LP hero read the 災害 and 地価公示 snapshots), and their
 * level and change-rate checks with them.
 */
describe("Sample data integrity", () => {
  it("has ward profiles for all 23 wards", () => {
    expect(sampleWardProfiles).toHaveLength(23);
    for (const p of sampleWardProfiles) {
      expect(p.population).toBeGreaterThanOrEqual(0);
      expect(p.population).toBeLessThanOrEqual(100);
    }
  });
});
